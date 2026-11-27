// The online half of the game: accounts (Sign in with Google), posting scores, and the
// leaderboards. Menus render empty containers; `fill` loads each one from the API.

import { handle, type Store } from './api-core.ts';
import { GOOGLE_CLIENT_ID } from './google.ts';
import { entry } from './minis/index.ts';
import { SKILLS, picksKeys } from './minis/kit.ts';
import { esc, fmtPrimary, shortDate } from './ui.ts';

export const PAGE = 50;

const LENGTH_NAMES: Record<string, string> = { '1': 'Standard', '0.5': 'Short', '2': 'Long', '0': 'Endless', '-60': '1 min', '-180': '3 min', '-1': '3 lives' };

export function lengthName(len: number): string {
  return LENGTH_NAMES[String(len)] ?? String(len);
}

export interface BoardRow {
  rank: number;
  name: string;
  value: number;
  unit: string;
  lower: boolean;
  keys: number;
  at: number;
}

interface BoardSummary {
  game: string;
  len: number;
  keys: number;
  level?: number;
  count: number;
  top: { name: string; value: number; unit: string; lower: boolean };
}

interface Best {
  game: string;
  len: number;
  keys: number;
  level?: number;
  value: number;
  unit: string;
  lower: boolean;
  at: number;
}

/** Call the API. Throws only when there is no server at all (a local file, offline). */
/**
 * The offline test build (built with VITE_LOCAL_API=1) runs the API inside the page, kept in this
 * browser's storage, with sample players, so leaderboards and accounts can be tried from a file.
 * The real site never includes it: the flag is unset there and this code is dropped.
 */
export const LOCAL = import.meta.env.VITE_LOCAL_API === '1';

const LOCAL_PREFIX = 'tension.testapi.';
const localStore: Store = {
  get: async (k) => {
    try {
      const v = localStorage.getItem(LOCAL_PREFIX + k);
      return v === null ? null : JSON.parse(v);
    } catch {
      return null;
    }
  },
  setJSON: async (k, v) => {
    try {
      localStorage.setItem(LOCAL_PREFIX + k, JSON.stringify(v));
    } catch {
      // storage full or blocked: the test leaderboard just won't keep it
    }
  },
  delete: async (k) => {
    try {
      localStorage.removeItem(LOCAL_PREFIX + k);
    } catch {
      // ignore
    }
  },
};
const localVerify = async (c: string) => (c.startsWith('test:') && c.length > 5 ? { sub: c.slice(5), given: c.slice(5) } : null);

async function localCall(path: string, method: string, body: unknown, token?: string): Promise<Response> {
  return handle(new Request(`https://test.local${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: token ? { authorization: `Bearer ${token}` } : {} }), { store: localStore, verify: localVerify });
}

let seeding: Promise<void> | null = null;

/** Fill the test leaderboard with sample players, once per browser. */
function seedLocal(): Promise<void> {
  seeding ??= (async () => {
    if (await localStore.get('meta/seeded', { type: 'json' })) return;
    const names = ['Kestrel', 'Juno', 'Moss', 'Pike', 'Wren', 'Orla', 'Basil', 'Indigo', 'Tamsin', 'Rook', 'Sable', 'Fennel', 'Quill', 'Hazel', 'Otto', 'Lark', 'Ember', 'Cass', 'Nell', 'Ash', 'Vesper', 'Dov', 'Marlo', 'Iris', 'Bram'];
    // A few games across skills, with headlines in each game's own units.
    const games: { id: string; unit: string; lower: boolean; base: number; step: number; rt?: boolean }[] = [
      { id: 'snap', unit: 'ms', lower: true, base: 228, step: 4.2, rt: true },
      { id: 'sprint', unit: '', lower: false, base: 118, step: -1.9 },
      { id: 'stream', unit: 'ms', lower: true, base: 96, step: 5.5 },
      { id: 'octave', unit: '%', lower: false, base: 100, step: -2.2 },
      { id: 'intune', unit: 'cents', lower: true, base: 6, step: 1.4 },
      { id: 'chord', unit: '%', lower: false, base: 96, step: -2.6 },
      { id: 'sum', unit: '', lower: false, base: 34, step: -0.9 },
    ];
    for (let i = 0; i < names.length; i++) {
      const a = (await (await localCall('/api/auth', 'POST', { credential: `test:sample${i}` })).json()) as { token: string };
      await localCall('/api/name', 'POST', { name: names[i] }, a.token);
      for (const g of games) {
        if ((i * 7 + g.id.length) % 5 === 0) continue; // not everyone has played everything
        const e = entry(g.id);
        if (!e) continue;
        const v = Math.max(0, Math.round((g.base + g.step * i + ((i * 37) % 11) - 5) * 10) / 10);
        const value = g.unit === '%' ? Math.min(100, Math.round(v)) : v;
        const rts = g.rt ? Array.from({ length: 12 }, (_, k) => Math.round(value + ((k * 53) % 70) - 20)) : [];
        await localCall('/api/scores', 'POST', { game: g.id, value, unit: g.unit, lower: g.lower, len: 1, keys: picksKeys(g.id, e.input) ? 2 : 0, inputs: 40, durationMs: 40000, rtHeadline: !!g.rt, rts, flags: [] }, a.token);
      }
    }
    await localStore.setJSON('meta/seeded', true);
  })();
  return seeding;
}

export async function api<T = Record<string, unknown>>(path: string, opts: { body?: unknown; token?: string } = {}): Promise<{ status: number; data: T }> {
  if (LOCAL) {
    await seedLocal();
    const res = await localCall(path, opts.body === undefined ? 'GET' : 'POST', opts.body, opts.token);
    return { status: res.status, data: (await res.json()) as T };
  }
  const res = await fetch(path, {
    method: opts.body === undefined ? 'GET' : 'POST',
    headers: { ...(opts.body === undefined ? {} : { 'content-type': 'application/json' }), ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}) },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('json')) throw new Error('no API here');
  return { status: res.status, data: (await res.json()) as T };
}

/** Whether Google sign-in can be offered here; the dev server offers a stand-in instead. */
export function signInMode(dev: boolean): 'google' | 'dev' | 'local' | 'none' {
  if (LOCAL) return 'local';
  if (dev) return 'dev';
  if (location.protocol === 'file:') return 'none';
  return GOOGLE_CLIENT_ID ? 'google' : 'none';
}

let gsiLoading: Promise<void> | null = null;

interface Gsi {
  accounts: { id: { initialize(o: object): void; renderButton(el: HTMLElement, o: object): void; disableAutoSelect(): void } };
}

/** Draw Google's own sign-in button into `el`; `done` gets the credential to send to the server. */
export function googleButton(el: HTMLElement, done: (credential: string) => void): void {
  gsiLoading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('could not load Google sign-in'));
    document.head.appendChild(s);
  });
  gsiLoading
    .then(() => {
      const g = (window as unknown as { google: Gsi }).google;
      g.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: (r: { credential: string }) => done(r.credential), ux_mode: 'popup' });
      g.accounts.id.renderButton(el, { theme: 'filled_black', size: 'large', text: 'signin_with', shape: 'rectangular' });
    })
    .catch(() => {
      el.innerHTML = '<p class="muted">Google sign-in could not load. Check your connection, or whether your network blocks Google.</p>';
    });
}

export function googleSignedOut(): void {
  (window as unknown as { google?: Gsi }).google?.accounts.id.disableAutoSelect();
}

function fmt(r: { value: number; unit: string }): string {
  return fmtPrimary(r.value, { label: '', value: r.value, unit: r.unit, decimals: r.unit === 's' || r.unit === '/s' ? 1 : 0 });
}

const gameName = (id: string) => entry(id)?.name ?? id;

function playerLink(name: string, me: string): string {
  return `<button class="link${name === me ? ' me' : ''}" data-act="go" data-arg="player:${esc(name)}">${esc(name)}</button>`;
}

function boardArg(game: string, len: number, keys: number, level = 0, page = 0): string {
  return `board:${game}:${len}:${keys}:${level}:${page}`;
}

/** A board's setup in words: length, key count, level. */
function boardName(game: string, len: number, keys: number, level = 0): string {
  const def = entry(game)?.def;
  const lv = def?.levels ? (def.levels.find((l) => l.value === level)?.label ?? `${level}${def.custom ? ` ${def.custom.unit}` : ''}`) : '';
  return [lengthName(len), keys ? `${keys} keys` : '', lv].filter(Boolean).join(' · ');
}

/** The ranked rows of a board. */
function rowsHtml(rows: BoardRow[], me: string, label: string): string {
  return `<table class="board"><tr><th>#</th><th>player</th><th>${esc(label)}${rows[0] ? ` · ${rows[0].lower ? 'lower is better' : 'higher is better'}` : ''}</th><th>set</th></tr>${rows
    .map((r) => `<tr${r.name === me ? ' class="me"' : ''}><td>${r.rank}</td><td>${playerLink(r.name, me)}</td><td>${fmt(r)}</td><td>${shortDate(r.at)}</td></tr>`)
    .join('')}</table>`;
}

const OFFLINE = '<p class="muted">Leaderboards need the live site; they can\'t load from a local file or offline.</p>';

/** Fill every online container on the screen. */
export async function fill(root: HTMLElement, me: string): Promise<void> {
  const jobs: Promise<void>[] = [];
  root.querySelectorAll<HTMLElement>('[data-online]').forEach((el) => jobs.push(fillOne(el, me)));
  await Promise.all(jobs);
}

async function fillOne(el: HTMLElement, me: string): Promise<void> {
  const d = el.dataset;
  try {
    if (d.online === 'top') {
      // A game's stats page: the first rows, and the way to the whole board.
      const len = Number(d.len ?? 1);
      const keys = Number(d.keys ?? 0);
      const level = Number(d.level ?? 0);
      const { data } = await api<{ entries: BoardRow[]; total: number }>(`/api/scores?game=${d.game}&len=${len}&keys=${keys}&level=${level}&limit=10`);
      el.innerHTML = data.total
        ? `${rowsHtml(data.entries, me, d.label || 'result')}<p><button class="pill" data-act="go" data-arg="${boardArg(d.game!, len, keys, level)}">All ${data.total} player${data.total === 1 ? '' : 's'} →</button></p>`
        : '<p class="muted">No scores yet. Sign in (Account tab) and play it at the standard length to be first.</p>';
    } else if (d.online === 'board') {
      const len = Number(d.len ?? 1);
      const keys = Number(d.keys ?? 0);
      const level = Number(d.level ?? 0);
      const page = Number(d.page ?? 0);
      const [{ data }, { data: all }] = await Promise.all([
        api<{ entries: BoardRow[]; total: number }>(`/api/scores?game=${d.game}&len=${len}&keys=${keys}&level=${level}&offset=${page * PAGE}&limit=${PAGE}`),
        api<{ boards: BoardSummary[] }>('/api/boards'),
      ]);
      // Other boards of the same game: other lengths and key counts.
      const siblings = all.boards.filter((b) => b.game === d.game).sort((a, b) => a.len - b.len || a.keys - b.keys || (a.level ?? 0) - (b.level ?? 0));
      const chips = siblings.length > 1
        ? `<div class="chips">${siblings
            .map((b) => `<button class="chip" data-act="board" data-arg="${boardArg(b.game, b.len, b.keys, b.level ?? 0)}" aria-pressed="${b.len === len && b.keys === keys && (b.level ?? 0) === level}">${boardName(b.game, b.len, b.keys, b.level ?? 0)} <small>${b.count}</small></button>`)
            .join('')}</div>`
        : '';
      const pages = Math.max(1, Math.ceil(data.total / PAGE));
      const nav = pages > 1
        ? `<div class="pager"><button class="pill" data-act="board" data-arg="${boardArg(d.game!, len, keys, level, page - 1)}"${page <= 0 ? ' disabled' : ''}>← Better</button><span>page ${page + 1} of ${pages}</span><button class="pill" data-act="board" data-arg="${boardArg(d.game!, len, keys, level, page + 1)}"${page >= pages - 1 ? ' disabled' : ''}>Next →</button></div>`
        : '';
      el.innerHTML = `${chips}<p class="muted">${data.total} player${data.total === 1 ? '' : 's'}${DOT}${boardName(d.game!, len, keys, level)}</p>${data.total ? rowsHtml(data.entries, me, d.label || 'result') : '<p class="muted">Nobody on this board yet.</p>'}${nav}`;
    } else if (d.online === 'overall') {
      // Everyone ranked across all games; a preview (data-limit) or the whole table, by page.
      const preview = Number(d.limit ?? 0);
      const page = Number(d.page ?? 0);
      const { data } = await api<{ total: number; entries: { rank: number; name: string; total: number; games: number; wins: number }[] }>(`/api/overall?offset=${preview ? 0 : page * PAGE}&limit=${preview || PAGE}`);
      if (!data.total) {
        el.innerHTML = '<p class="muted">Nobody on the boards yet.</p>';
        return;
      }
      const rows = `<table class="board"><tr><th>#</th><th>player</th><th>games</th><th>firsts</th><th>points</th></tr>${data.entries
        .map((r) => `<tr${r.name === me ? ' class="me"' : ''}><td>${r.rank}</td><td>${playerLink(r.name, me)}</td><td>${r.games}</td><td>${r.wins}</td><td>${r.total}</td></tr>`)
        .join('')}</table>`;
      const pages = Math.max(1, Math.ceil(data.total / PAGE));
      const more = preview
        ? data.total > preview ? `<p><button class="pill" data-act="go" data-arg="overall:0">All ${data.total} players →</button></p>` : ''
        : pages > 1
          ? `<div class="pager"><button class="pill" data-act="board" data-arg="overall:${page - 1}"${page <= 0 ? ' disabled' : ''}>← Higher</button><span>page ${page + 1} of ${pages}</span><button class="pill" data-act="board" data-arg="overall:${page + 1}"${page >= pages - 1 ? ' disabled' : ''}>Next →</button></div>`
          : '';
      el.innerHTML = `${rows}${more}`;
    } else if (d.online === 'boards') {
      const { data } = await api<{ boards: BoardSummary[] }>('/api/boards');
      if (!data.boards.length) {
        el.innerHTML = '<p class="muted">No scores anywhere yet. Sign in from the Account tab, play any drill at the standard length, and you are first.</p>';
        return;
      }
      // Grouped by skill, one row per game (its most-played board), the others a click away.
      const byGame = new Map<string, BoardSummary[]>();
      for (const b of data.boards) byGame.set(b.game, [...(byGame.get(b.game) ?? []), b]);
      let html = `${LOCAL ? '<p class="cmp">Test copy: these are sample players, kept only in this browser. Nothing is sent anywhere.</p>' : ''}<p class="muted">${byGame.size} game${byGame.size === 1 ? '' : 's'} with scores${DOT}${data.boards.reduce((a, b) => a + b.count, 0)} entries in all</p>`;
      for (const sk of SKILLS) {
        const games = [...byGame.entries()].filter(([g]) => entry(g)?.skill === sk.id).sort((a, b) => gameName(a[0]).localeCompare(gameName(b[0])));
        if (!games.length) continue;
        html += `<h2>${esc(sk.name)}</h2><table class="board boards"><tr><th>game</th><th>players</th><th>leader</th><th>best</th></tr>${games
          .map(([g, bs]) => {
            const main = [...bs].sort((a, b) => b.count - a.count)[0]!;
            return `<tr><td><button class="link" data-act="go" data-arg="${boardArg(g, main.len, main.keys, main.level ?? 0)}">${esc(gameName(g))}</button></td><td>${main.count} player${main.count === 1 ? '' : 's'}${bs.length > 1 ? ` <small>+${bs.length - 1} more board${bs.length > 2 ? 's' : ''}</small>` : ''}</td><td>${playerLink(main.top.name, me)}</td><td>${fmt(main.top)}</td></tr>`;
          })
          .join('')}</table>`;
      }
      el.innerHTML = html;
    } else if (d.online === 'player') {
      const { status, data } = await api<{ name: string; bests: Best[] }>(`/api/player?name=${encodeURIComponent(d.name ?? '')}`);
      if (status !== 200) {
        el.innerHTML = '<p class="muted">No player by that name.</p>';
        return;
      }
      const rows = [...data.bests].sort((a, b) => gameName(a.game).localeCompare(gameName(b.game)) || a.len - b.len);
      el.innerHTML = rows.length
        ? `${d.self ? '' : `<p class="muted">${rows.length} best${rows.length === 1 ? '' : 's'} on the boards</p>`}<table class="board"><tr><th>game</th><th>board</th><th>best</th><th>set</th></tr>${rows
            .map((b) => `<tr><td><button class="link" data-act="go" data-arg="${boardArg(b.game, b.len, b.keys, b.level ?? 0)}">${esc(gameName(b.game))}</button></td><td>${boardName(b.game, b.len, b.keys, b.level ?? 0)}</td><td>${fmt(b)}</td><td>${shortDate(b.at)}</td></tr>`)
            .join('')}</table>`
        : `<p class="muted">${d.self ? 'Nothing on the boards yet. Play any drill at the standard length; runs that pass the fair-play checks are posted automatically.' : 'No scores yet.'}</p>`;
    }
  } catch {
    el.innerHTML = OFFLINE;
  }
}

const DOT = ' · ';
