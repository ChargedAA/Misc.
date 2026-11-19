// Leaderboard API on Netlify Functions, stored in Netlify Blobs.
//   GET  /api/scores?game=snap&len=1&keys=2  -> { entries: Entry[] }  (top 20; keys 0 where it doesn't matter)
//   POST /api/scores  Submission JSON    -> { ok, rank } or { ok: false, reason }
// Every rule lives in src/board.ts, so the tests cover exactly what the server enforces.

import { getStore } from '@netlify/blobs';
import { allow, boardKey, cleanName, insert, refuse, type Entry, type Submission } from '../../src/board.ts';

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

/** The part of a blob store the API uses, so tests can hand it a map. */
export interface Store {
  get(key: string, opts: { type: 'json' }): Promise<unknown>;
  setJSON(key: string, value: unknown): Promise<unknown>;
}

export default async (req: Request): Promise<Response> => handle(req, getStore({ name: 'leaderboard', consistency: 'strong' }) as unknown as Store);

export async function handle(req: Request, store: Store): Promise<Response> {
  const url = new URL(req.url);
  if (req.method === 'GET') {
    const game = url.searchParams.get('game') ?? '';
    const len = Number(url.searchParams.get('len') ?? '1');
    const keys = Number(url.searchParams.get('keys') ?? '0') | 0;
    if (!/^[a-z]{2,12}$/.test(game)) return json({ entries: [] });
    const board = ((await store.get(boardKey(game, len, keys), { type: 'json' })) as Entry[] | null) ?? [];
    return json({ entries: board.slice(0, 20).map((e) => ({ name: e.name, value: e.value, unit: e.unit, lower: e.lower, keys: e.keys, at: e.at })) });
  }
  if (req.method !== 'POST') return json({ ok: false, reason: 'method' }, 405);
  let s: Submission;
  try {
    s = (await req.json()) as Submission;
  } catch {
    return json({ ok: false, reason: 'bad request' }, 400);
  }
  const why = refuse(s);
  if (why) return json({ ok: false, reason: why }, 422);
  const now = Date.now();
  const rlKey = `rl/${s.device}`;
  const rl = allow(((await store.get(rlKey, { type: 'json' })) as number[] | null) ?? [], now);
  await store.setJSON(rlKey, rl.times);
  if (!rl.ok) return json({ ok: false, reason: 'too many submissions; try again later' }, 429);
  const key = boardKey(s.game, s.len, s.keys);
  const board = ((await store.get(key, { type: 'json' })) as Entry[] | null) ?? [];
  const entry: Entry = { device: s.device, name: cleanName(s.name)!, value: s.value, unit: s.unit, lower: s.lower, keys: s.keys, at: now };
  const out = insert(board, entry);
  await store.setJSON(key, out.board);
  return json({ ok: true, rank: out.rank });
}

export const config = { path: '/api/scores' };
