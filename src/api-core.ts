// The leaderboard and accounts API itself, independent of where it runs: Netlify Functions
// (netlify/functions/api.ts), the dev server, the tests, and the offline test build.
//
//   POST /api/auth      { credential }  a sign-in credential in, a session token out
//   GET  /api/me                        the signed-in account's name
//   POST /api/name      { name }        choose or change the public display name (unique)
//   POST /api/scores    Submission      a verified run, from a signed-in account with a name
//   GET  /api/scores?game=&len=&keys=&level=&offset=&limit=   every player on one board, best first
//   GET  /api/boards                    every board that has scores: player count and the leader
//   GET  /api/player?name=              one player's best on every board
//   GET  /api/overall?offset=&limit=    every player ranked across all games
//
// Every scoring rule lives in board.ts. Who a request comes from is decided here, from a session
// token this API signed after the sign-in credential was verified (by Google, on the live site).

import { allow, boardKey, cleanName, insert, nameKey, refuse, type Entry, type Submission } from './board.ts';

/** The part of a blob store the API uses, so tests and the dev server can hand it a map. */
export interface Store {
  get(key: string, opts: { type: 'json' }): Promise<unknown>;
  setJSON(key: string, value: unknown): Promise<unknown>;
  delete(key: string): Promise<unknown>;
}

/** Checks a Google sign-in credential; returns Google's stable user id, or null. */
export type Verify = (credential: string) => Promise<{ sub: string; given?: string } | null>;

export interface Deps {
  store: Store;
  verify: Verify;
  now?: () => number;
}

interface Account {
  name: string | null;
  created: number;
}

/** A player's bests, one per board, so a profile is one read. */
type Bests = Record<string, { game: string; len: number; keys: number; level: number; value: number; unit: string; lower: boolean; at: number }>;

/** What the boards page lists, kept up to date on every submission. */
type Index = Record<string, { game: string; len: number; keys: number; level: number; count: number; top: { name: string; value: number; unit: string; lower: boolean } }>;

/**
 * The overall table: each player's points on every board they are on. On a board of N players,
 * rank r earns 100 * (N - r + 1) / N, so first is always 100. A player's total counts their best
 * board for each game, so playing one game at every length or key count doesn't multiply it.
 */
type Overall = Record<string, { name: string; pts: Record<string, number> }>;

export function boardPoints(rank: number, count: number): number {
  return Math.round((100 * (count - rank + 1)) / count);
}

/** Re-score one board in the overall table (everyone on it moves when the board changes). */
function rescore(overall: Overall, key: string, board: Entry[]): void {
  board.forEach((e, i) => {
    const row = (overall[e.uid] ??= { name: e.name, pts: {} });
    row.name = e.name;
    row.pts[key] = boardPoints(i + 1, board.length);
  });
}

/** Totals from the table: best board per game, summed. */
export function totals(overall: Overall): { name: string; total: number; games: number; wins: number }[] {
  return Object.values(overall)
    .map((row) => {
      const perGame = new Map<string, number>();
      let wins = 0;
      for (const [key, p] of Object.entries(row.pts)) {
        const game = key.split('/')[1]!;
        perGame.set(game, Math.max(perGame.get(game) ?? 0, p));
        if (p === 100) wins++;
      }
      return { name: row.name, total: [...perGame.values()].reduce((a, b) => a + b, 0), games: perGame.size, wins };
    })
    .sort((a, b) => b.total - a.total || b.wins - a.wins || a.name.localeCompare(b.name));
}

const SESSION_DAYS = 60;

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

const enc = new TextEncoder();

// No Node-only APIs (Buffer and the like): the same code runs in Netlify Functions, the tests,
// and the browser (the offline test build).
function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (const b of u) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(text: string): Uint8Array<ArrayBuffer> {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function sha(text: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text)))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The key that signs sessions: made once, kept in the store, never sent anywhere. */
async function secretKey(store: Store): Promise<CryptoKey> {
  let secret = (await store.get('meta/secret', { type: 'json' })) as string | null;
  if (!secret) {
    secret = b64url(crypto.getRandomValues(new Uint8Array(32)));
    await store.setJSON('meta/secret', secret);
  }
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function signSession(store: Store, uid: string, exp: number): Promise<string> {
  const body = `${uid}.${exp}`;
  const sig = await crypto.subtle.sign('HMAC', await secretKey(store), enc.encode(body));
  return `${body}.${b64url(sig)}`;
}

/** The account id a request's session token proves, or null. */
async function sessionOf(req: Request, store: Store, now: number): Promise<string | null> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const [uid, exp, sig] = token.split('.');
  if (!uid || !exp || !sig || !/^[0-9a-f]{24}$/.test(uid) || Number(exp) < now) return null;
  let raw: Uint8Array<ArrayBuffer>;
  try {
    raw = unb64url(sig);
  } catch {
    return null;
  }
  const ok = await crypto.subtle.verify('HMAC', await secretKey(store), raw, enc.encode(`${uid}.${exp}`));
  return ok ? uid : null;
}

async function read<T>(store: Store, key: string): Promise<T | null> {
  return ((await store.get(key, { type: 'json' })) as T | null) ?? null;
}

async function body<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const { store, verify } = deps;
  const now = (deps.now ?? Date.now)();
  const url = new URL(req.url);
  const route = url.pathname.replace(/\/+$/, '');

  if (route === '/api/auth' && req.method === 'POST') {
    const b = await body<{ credential?: string }>(req);
    const who = b?.credential ? await verify(b.credential) : null;
    if (!who) return json({ ok: false, reason: 'sign-in could not be verified' }, 401);
    const uid = (await sha(`google:${who.sub}`)).slice(0, 24);
    let acct = await read<Account>(store, `acct/${uid}`);
    if (!acct) {
      acct = { name: null, created: now };
      await store.setJSON(`acct/${uid}`, acct);
    }
    const token = await signSession(store, uid, now + SESSION_DAYS * 86400000);
    return json({ ok: true, token, name: acct.name, suggested: cleanName(who.given ?? '') });
  }

  if (route === '/api/me' && req.method === 'GET') {
    const uid = await sessionOf(req, store, now);
    if (!uid) return json({ ok: false, reason: 'not signed in' }, 401);
    const acct = await read<Account>(store, `acct/${uid}`);
    return json({ ok: true, name: acct?.name ?? null });
  }

  if (route === '/api/name' && req.method === 'POST') {
    const uid = await sessionOf(req, store, now);
    if (!uid) return json({ ok: false, reason: 'not signed in' }, 401);
    const b = await body<{ name?: string }>(req);
    const name = cleanName(b?.name);
    if (!name) return json({ ok: false, reason: 'name must be 2-16 letters, digits, spaces, _ or -' }, 422);
    const owner = await read<string>(store, `name/${nameKey(name)}`);
    if (owner && owner !== uid) return json({ ok: false, reason: 'that name is taken' }, 409);
    const acct = (await read<Account>(store, `acct/${uid}`)) ?? { name: null, created: now };
    const old = acct.name;
    await store.setJSON(`name/${nameKey(name)}`, uid);
    if (old && nameKey(old) !== nameKey(name)) await store.delete(`name/${nameKey(old)}`);
    acct.name = name;
    await store.setJSON(`acct/${uid}`, acct);
    // A rename shows on every board the player is on.
    if (old && old !== name) {
      const bests = (await read<Bests>(store, `p/${uid}`)) ?? {};
      const index = (await read<Index>(store, 'index')) ?? {};
      for (const key of Object.keys(bests)) {
        const board = (await read<Entry[]>(store, key)) ?? [];
        const mine = board.find((e) => e.uid === uid);
        if (mine) {
          mine.name = name;
          await store.setJSON(key, board);
          if (index[key] && board[0]?.uid === uid) index[key].top.name = name;
        }
      }
      await store.setJSON('index', index);
      const overall = (await read<Overall>(store, 'overall')) ?? {};
      if (overall[uid]) {
        overall[uid].name = name;
        await store.setJSON('overall', overall);
      }
    }
    return json({ ok: true, name });
  }

  if (route === '/api/scores' && req.method === 'POST') {
    const uid = await sessionOf(req, store, now);
    if (!uid) return json({ ok: false, reason: 'sign in to post scores' }, 401);
    const acct = await read<Account>(store, `acct/${uid}`);
    if (!acct?.name) return json({ ok: false, reason: 'choose a display name first' }, 403);
    const s = await body<Submission>(req);
    if (!s) return json({ ok: false, reason: 'bad request' }, 400);
    const why = refuse(s);
    if (why) return json({ ok: false, reason: why }, 422);
    const rl = allow((await read<number[]>(store, `rl/${uid}`)) ?? [], now);
    await store.setJSON(`rl/${uid}`, rl.times);
    if (!rl.ok) return json({ ok: false, reason: 'too many submissions; try again later' }, 429);
    const level = s.level ?? 0;
    const key = boardKey(s.game, s.len, s.keys, level);
    const board = (await read<Entry[]>(store, key)) ?? [];
    const out = insert(board, { uid, name: acct.name, value: s.value, unit: s.unit, lower: s.lower, keys: s.keys, at: now });
    if (out.improved) {
      await store.setJSON(key, out.board);
      const bests = (await read<Bests>(store, `p/${uid}`)) ?? {};
      bests[key] = { game: s.game, len: s.len, keys: s.keys, level, value: s.value, unit: s.unit, lower: s.lower, at: now };
      await store.setJSON(`p/${uid}`, bests);
      const index = (await read<Index>(store, 'index')) ?? {};
      const top = out.board[0]!;
      index[key] = { game: s.game, len: s.len, keys: s.keys, level, count: out.board.length, top: { name: top.name, value: top.value, unit: top.unit, lower: top.lower } };
      await store.setJSON('index', index);
      const overall = (await read<Overall>(store, 'overall')) ?? {};
      rescore(overall, key, out.board);
      await store.setJSON('overall', overall);
    }
    return json({ ok: true, rank: out.rank, total: out.board.length, improved: out.improved });
  }

  if (route === '/api/scores' && req.method === 'GET') {
    const game = url.searchParams.get('game') ?? '';
    if (!/^[a-z]{2,12}$/.test(game)) return json({ entries: [], total: 0 });
    const len = Number(url.searchParams.get('len') ?? '1');
    const keys = Number(url.searchParams.get('keys') ?? '0') | 0;
    const level = Number(url.searchParams.get('level') ?? '0') | 0;
    const offset = Math.max(0, Number(url.searchParams.get('offset') ?? '0') | 0);
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? '50') | 0));
    const board = (await read<Entry[]>(store, boardKey(game, len, keys, level))) ?? [];
    return json({
      total: board.length,
      entries: board.slice(offset, offset + limit).map((e, i) => ({ rank: offset + i + 1, name: e.name, value: e.value, unit: e.unit, lower: e.lower, keys: e.keys, at: e.at })),
    });
  }

  if (route === '/api/boards' && req.method === 'GET') {
    const index = (await read<Index>(store, 'index')) ?? {};
    return json({ boards: Object.values(index) });
  }

  if (route === '/api/overall' && req.method === 'GET') {
    const offset = Math.max(0, Number(url.searchParams.get('offset') ?? '0') | 0);
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? '50') | 0));
    const all = totals((await read<Overall>(store, 'overall')) ?? {});
    return json({ total: all.length, entries: all.slice(offset, offset + limit).map((r, i) => ({ rank: offset + i + 1, ...r })) });
  }

  if (route === '/api/player' && req.method === 'GET') {
    const name = cleanName(url.searchParams.get('name'));
    const uid = name ? await read<string>(store, `name/${nameKey(name)}`) : null;
    if (!uid) return json({ ok: false, reason: 'no such player' }, 404);
    const acct = await read<Account>(store, `acct/${uid}`);
    const bests = (await read<Bests>(store, `p/${uid}`)) ?? {};
    return json({ ok: true, name: acct?.name ?? name, bests: Object.values(bests) });
  }

  return json({ ok: false, reason: 'not found' }, 404);
}

