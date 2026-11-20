// The online half of the game: accounts (Sign in with Google), posting scores, and the
// leaderboards. Menus render empty containers; `fill` loads each one from the API.

import { GOOGLE_CLIENT_ID } from './google.ts';
import { entry } from './minis/index.ts';
import { SKILLS } from './minis/kit.ts';
import { esc, fmtPrimary, shortDate } from './ui.ts';

export const PAGE = 50;

const LENGTH_NAMES: Record<string, string> = { '1': 'Standard', '0.5': 'Short', '2': 'Long', '0': 'Endless', '-60': '1 min', '-180': '3 min' };

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
  count: number;
  top: { name: string; value: number; unit: string; lower: boolean };
}

interface Best {
  game: string;
  len: number;
  keys: number;
  value: number;
  unit: string;
  lower: boolean;
  at: number;
}

/** Call the API. Throws only when there is no server at all (a local file, offline). */
export async function api<T = Record<string, unknown>>(path: string, opts: { body?: unknown; token?: string } = {}): Promise<{ status: number; data: T }> {
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
export function signInMode(dev: boolean): 'google' | 'dev' | 'none' {
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

function boardArg(game: string, len: number, keys: number, page = 0): string {
  return `board:${game}:${len}:${keys}:${page}`;
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
      const { data } = await api<{ entries: BoardRow[]; total: number }>(`/api/scores?game=${d.game}&len=${len}&keys=${keys}&limit=10`);
      el.innerHTML = data.total
        ? `${rowsHtml(data.entries, me, d.label || 'result')}<p><button class="pill" data-act="go" data-arg="${boardArg(d.game!, len, keys)}">All ${data.total} player${data.total === 1 ? '' : 's'} →</button></p>`
        : '<p class="muted">No scores yet. Sign in (Settings) and play it at the standard length to be first.</p>';
    } else if (d.online === 'board') {
      const len = Number(d.len ?? 1);
      const keys = Number(d.keys ?? 0);
      const page = Number(d.page ?? 0);
      const [{ data }, { data: all }] = await Promise.all([
        api<{ entries: BoardRow[]; total: number }>(`/api/scores?game=${d.game}&len=${len}&keys=${keys}&offset=${page * PAGE}&limit=${PAGE}`),
        api<{ boards: BoardSummary[] }>('/api/boards'),
      ]);
      // Other boards of the same game: other lengths and key counts.
      const siblings = all.boards.filter((b) => b.game === d.game).sort((a, b) => a.len - b.len || a.keys - b.keys);
      const chips = siblings.length > 1
        ? `<div class="chips">${siblings
            .map((b) => `<button class="chip" data-act="board" data-arg="${boardArg(b.game, b.len, b.keys)}" aria-pressed="${b.len === len && b.keys === keys}">${lengthName(b.len)}${b.keys ? ` · ${b.keys} keys` : ''} <small>${b.count}</small></button>`)
            .join('')}</div>`
        : '';
      const pages = Math.max(1, Math.ceil(data.total / PAGE));
      const nav = pages > 1
        ? `<div class="pager"><button class="pill" data-act="board" data-arg="${boardArg(d.game!, len, keys, page - 1)}"${page <= 0 ? ' disabled' : ''}>← Better</button><span>page ${page + 1} of ${pages}</span><button class="pill" data-act="board" data-arg="${boardArg(d.game!, len, keys, page + 1)}"${page >= pages - 1 ? ' disabled' : ''}>Next →</button></div>`
        : '';
      el.innerHTML = `${chips}<p class="muted">${data.total} player${data.total === 1 ? '' : 's'}${DOT}${lengthName(len)}${keys ? `${DOT}${keys} keys` : ''}</p>${data.total ? rowsHtml(data.entries, me, d.label || 'result') : '<p class="muted">Nobody on this board yet.</p>'}${nav}`;
    } else if (d.online === 'boards') {
      const { data } = await api<{ boards: BoardSummary[] }>('/api/boards');
      if (!data.boards.length) {
        el.innerHTML = '<p class="muted">No scores anywhere yet. Sign in from Settings, play any drill at the standard length, and you are first.</p>';
        return;
      }
      // Grouped by skill, one row per game (its most-played board), the others a click away.
      const byGame = new Map<string, BoardSummary[]>();
      for (const b of data.boards) byGame.set(b.game, [...(byGame.get(b.game) ?? []), b]);
      let html = `<p class="muted">${byGame.size} game${byGame.size === 1 ? '' : 's'} with scores${DOT}${data.boards.reduce((a, b) => a + b.count, 0)} entries in all</p>`;
      for (const sk of SKILLS) {
        const games = [...byGame.entries()].filter(([g]) => entry(g)?.skill === sk.id).sort((a, b) => gameName(a[0]).localeCompare(gameName(b[0])));
        if (!games.length) continue;
        html += `<h2>${esc(sk.name)}</h2><table class="board boards"><tr><th>game</th><th>players</th><th>leader</th><th>best</th></tr>${games
          .map(([g, bs]) => {
            const main = [...bs].sort((a, b) => b.count - a.count)[0]!;
            return `<tr><td><button class="link" data-act="go" data-arg="${boardArg(g, main.len, main.keys)}">${esc(gameName(g))}</button></td><td>${main.count} player${main.count === 1 ? '' : 's'}${bs.length > 1 ? ` <small>+${bs.length - 1} more board${bs.length > 2 ? 's' : ''}</small>` : ''}</td><td>${playerLink(main.top.name, me)}</td><td>${fmt(main.top)}</td></tr>`;
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
        ? `<p class="muted">${rows.length} best${rows.length === 1 ? '' : 's'} on the boards</p><table class="board"><tr><th>game</th><th>board</th><th>best</th><th>set</th></tr>${rows
            .map((b) => `<tr><td><button class="link" data-act="go" data-arg="${boardArg(b.game, b.len, b.keys)}">${esc(gameName(b.game))}</button></td><td>${lengthName(b.len)}${b.keys ? ` · ${b.keys} keys` : ''}</td><td>${fmt(b)}</td><td>${shortDate(b.at)}</td></tr>`)
            .join('')}</table>`
        : '<p class="muted">No scores yet.</p>';
    }
  } catch {
    el.innerHTML = OFFLINE;
  }
}

const DOT = ' · ';
