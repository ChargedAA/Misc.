// Showcase mode: for an event stand. One key to play, three short drills (a reflex, a memory,
// a timing drill) that add up to one score, and a leaderboard for today with three-letter
// initials, kept on this machine. No menus, no sign-in, and it goes back to the start screen
// on its own when nobody is playing.

import type { MiniResult } from './minis/kit.ts';

export interface ShowcaseDrill {
  id: string;
  name: string;
  what: string;
  /** Points out of 1000 for a result. */
  points(r: MiniResult): number;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export const SHOWCASE: ShowcaseDrill[] = [
  { id: 'snap', name: 'Snap', what: 'reaction', points: (r) => Math.round(1000 * clamp01((450 - r.primary.value) / (450 - 160))) },
  { id: 'grid', name: 'Grid', what: 'memory', points: (r) => Math.round(1000 * clamp01(r.primary.value / 12)) },
  { id: 'cross', name: 'Cross', what: 'timing', points: (r) => Math.round(1000 * clamp01((150 - r.primary.value) / (150 - 10))) },
];

/** Length setting for each drill: short, so a whole go is about two minutes. */
export function showcaseLength(id: string): number {
  return id === 'grid' ? 1 : 0.5;
}

export interface ShowcaseEntry {
  day: string;
  name: string;
  total: number;
  parts: number[];
  at: number;
}

const KEY = 'tension.showcase.board';

export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function load(): ShowcaseEntry[] {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) ?? '[]') as ShowcaseEntry[];
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

/** Today's entries, best first (earlier wins a tie). */
export function todays(): ShowcaseEntry[] {
  const d = today();
  return load()
    .filter((e) => e.day === d)
    .sort((a, b) => b.total - a.total || a.at - b.at);
}

export function saveEntry(e: ShowcaseEntry): void {
  try {
    // Keep a week, so the file never grows without end.
    const keep = load().filter((x) => Date.now() - x.at < 7 * 86400000);
    localStorage.setItem(KEY, JSON.stringify([...keep, e]));
  } catch {
    /* storage blocked: the board just won't remember */
  }
}

/** Where a total would place today: rank (1-based) among everyone so far, and the share it beats. */
export function placing(total: number): { rank: number; of: number; beats: number } {
  const list = todays();
  const better = list.filter((e) => e.total > total).length;
  const worse = list.filter((e) => e.total < total).length;
  return { rank: better + 1, of: list.length + 1, beats: list.length ? worse / list.length : 1 };
}

export function cleanInitials(s: string): string {
  return s.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
}

const ON_KEY = 'tension.showcase.on';

export function showcaseOn(): boolean {
  if (new URLSearchParams(location.search).has('showcase')) return true;
  try {
    return localStorage.getItem(ON_KEY) === '1';
  } catch {
    return false;
  }
}

export function setShowcaseOn(on: boolean): void {
  try {
    if (on) localStorage.setItem(ON_KEY, '1');
    else localStorage.removeItem(ON_KEY);
  } catch {
    /* ignore */
  }
}

// --- Screens -------------------------------------------------------------------------

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** The mark: a ball hanging from a taut line. Animated on the start screen. */
export function markSvg(size: number, live = false): string {
  return `<svg class="mark${live ? ' live' : ''}" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true"><path class="mk-line" d="M9 14 Q32 30 55 14" stroke="currentColor" stroke-width="6" fill="none" stroke-linecap="round"/><path class="mk-cord" d="M32 23 L32 44" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><circle class="mk-ball" cx="32" cy="49" r="8.5" fill="var(--accent)"/></svg>`;
}

function boardRows(list: ShowcaseEntry[], mine?: ShowcaseEntry, n = 8): string {
  if (!list.length) return '<p class="sc-empty">Be first today.</p>';
  const rows = list.slice(0, n);
  const mineIdx = mine ? list.indexOf(mine) : -1;
  const out = rows.map((e, i) => `<li class="${e === mine ? 'me' : ''}"><span class="sc-rank">${i + 1}</span><span class="sc-name">${esc(e.name || '···')}</span><span class="sc-pts">${e.total}</span></li>`);
  if (mine && mineIdx >= n) out.push(`<li class="me gap"><span class="sc-rank">${mineIdx + 1}</span><span class="sc-name">${esc(mine.name || '···')}</span><span class="sc-pts">${mine.total}</span></li>`);
  return `<ol class="sc-board">${out.join('')}</ol>`;
}

export function attractHtml(): string {
  const list = todays();
  return `<div class="sc sc-attract" data-act="scstart">
    <div class="sc-hero">
      ${markSvg(132, true)}
      <h1 class="sc-title">TENSION</h1>
      <p class="sc-lede">Three drills. About two minutes. Beat today's best.</p>
      <ol class="sc-drills">${SHOWCASE.map((d, i) => `<li><span class="sc-n">${i + 1}</span><b>${d.name}</b><span>${d.what}</span></li>`).join('')}</ol>
      <button class="sc-go" data-act="scstart" data-key="Space Enter"><span class="sc-key">SPACE</span>to play</button>
      <p class="sc-hint">or tap the screen</p>
    </div>
    <aside class="sc-side">
      <h2>Today${list.length ? ` · ${list.length} ${list.length === 1 ? 'player' : 'players'}` : ''}</h2>
      ${boardRows(list)}
    </aside>
  </div>`;
}

export function stepHtml(index: number, drill: ShowcaseDrill, shown: string, pts: number, total: number, next: ShowcaseDrill | null): string {
  return `<div class="sc sc-step">
    <p class="sc-count">${index} of ${SHOWCASE.length}</p>
    <h2 class="sc-drill">${drill.name}</h2>
    <p class="sc-res">${esc(shown)}</p>
    <p class="sc-pts-big">+${pts}</p>
    <p class="sc-sofar">${total} so far</p>
    <button class="sc-go" data-act="scnext" data-key="Space Enter"><span class="sc-key">SPACE</span>${next ? `next: ${next.name}` : 'see your score'}</button>
  </div>`;
}

export function doneHtml(total: number, parts: number[]): string {
  const p = placing(total);
  return `<div class="sc sc-done">
    <p class="sc-count">Your score</p>
    <p class="sc-total">${total}</p>
    <p class="sc-place">#${p.rank} of ${p.of} today${p.of > 1 ? ` · better than ${Math.round(p.beats * 100)}% of today's players` : ''}</p>
    <ul class="sc-parts">${SHOWCASE.map((d, i) => `<li><span>${d.name}</span><b>${parts[i] ?? 0}</b></li>`).join('')}</ul>
    <label class="sc-initials-label" for="initials">Your initials</label>
    <input id="initials" class="sc-initials" maxlength="3" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="AAA" />
    <button class="sc-go" data-act="scsave"><span class="sc-key">ENTER</span>save</button>
  </div>`;
}

export function boardHtml(mine: ShowcaseEntry): string {
  const list = todays();
  const me = list.find((e) => e.at === mine.at && e.name === mine.name);
  return `<div class="sc sc-final">
    <h2>Today</h2>
    ${boardRows(list, me, 10)}
    <button class="sc-go" data-act="scstart" data-key="Space Enter"><span class="sc-key">SPACE</span>play again</button>
    <button class="sc-quiet" data-act="scattract" data-key="Escape">done</button>
  </div>`;
}
