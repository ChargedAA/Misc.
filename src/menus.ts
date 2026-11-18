// Menus: every screen outside a game is a short list of at most six items,
// each on one of the keys the hands already rest on (Z X C B N M). Space turns
// the page when a list is longer, Escape goes back, Enter does the screen's
// default. Screens slide in from the side they were reached from.

import { MODES } from './config.ts';
import { ENTRIES, entry, type Entry } from './minis/index.ts';
import { SKILLS, usesKeyCount, type MiniResult, type Skill } from './minis/kit.ts';
import { trendSvg } from './charts.ts';
import type { RunRecord, Settings } from './storage.ts';
import {
  CPS_METRICS,
  DOT,
  RT_METRICS,
  RUN_METRICS,
  bestLine,
  card,
  controlsHint,
  fmtInt,
  fmtPrimary,
  keysLine,
  overview,
  shortDate,
  type Metric,
} from './ui.ts';

export const MENU_KEYS = ['KeyZ', 'KeyX', 'KeyC', 'KeyB', 'KeyN', 'KeyM', 'Space'] as const;
const KEY_NAMES = ['Z', 'X', 'C', 'B', 'N', 'M', 'SPACE'];
const PER_PAGE = 6;

export interface Item {
  label: string;
  desc?: string;
  meta?: string;
  act: string;
  arg?: string;
  disabled?: boolean;
  /** Which key (0-5 for Z to M, 6 for Space), if not the item's position. */
  slot?: number;
  /** Marked as the current choice (the last key count used, say). */
  current?: boolean;
}

export interface Menu {
  title: string;
  sub?: string;
  /** Html above the list, shown while the column is the active one. */
  extra?: string;
  items: Item[];
  page?: number;
  /** Html below the list, shown while the column is the active one. */
  after?: string;
  /** Enter: the screen's default action. */
  enter?: { label: string; act: string; arg?: string };
  wide?: boolean;
}

/** One column of the menu: a menu and, if a deeper column is open, the item chosen in it. */
export interface Col {
  menu: Menu;
  sel?: string;
}

function itemsOf(m: Menu): { shown: Item[]; page: number; pages: number } {
  // A list longer than six pages with Space, unless Space is one of its options.
  const spaceTaken = m.items.some((it) => it.slot === 6);
  if (spaceTaken || m.items.length <= PER_PAGE) return { shown: m.items, page: 0, pages: 1 };
  const pages = Math.ceil(m.items.length / PER_PAGE);
  const page = Math.min(m.page ?? 0, pages - 1);
  return { shown: m.items.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE), page, pages };
}

/** The open column: full detail, and it owns the keys. */
function activeCol(m: Menu, dir: number, canBack: boolean): string {
  const { shown, page, pages } = itemsOf(m);
  // An Enter default that is also one of the items rides on that item instead of a separate button.
  const twin = m.enter ? shown.find((it) => it.act === m.enter!.act && (it.arg ?? '') === (m.enter!.arg ?? '')) : undefined;
  const enter = twin ? undefined : m.enter;
  const cls = dir > 0 ? ' fwd' : dir < 0 ? ' bwd' : '';
  return `<section class="col active${m.wide ? ' wide' : ''}${cls}">
  <header class="mhead">
    ${canBack ? '<button class="mback" data-act="back" data-key="Escape Backspace">\u2190<span class="k">esc</span></button>' : ''}
    <h1>${m.title}</h1>
    ${m.sub ? `<p class="msub">${m.sub}</p>` : ''}
  </header>
  ${m.extra ?? ''}
  <div class="items">${shown
    .map((it, i) => {
      const k = it.slot ?? i;
      const codes = `${MENU_KEYS[k]}${it === twin ? ' Enter' : ''}`;
      return `<button class="item${it.current ? ' cur' : ''}" data-act="${it.act}" data-arg="${it.arg ?? ''}" data-key="${codes}"${it.disabled ? ' disabled' : ''}><span class="kb${k === 6 ? ' wide' : ''}">${KEY_NAMES[k]}</span><span class="n">${it.label}</span>${it.meta ? `<span class="m">${it.meta}</span>` : ''}${it.desc ? `<span class="d">${it.desc}</span>` : ''}</button>`;
    })
    .join('')}</div>
  ${
    pages > 1 || enter
      ? `<div class="mfoot">${enter ? `<button data-act="${enter.act}" data-arg="${enter.arg ?? ''}" data-key="Enter">${enter.label}<span class="k">enter</span></button>` : ''}${
          pages > 1 ? `<button data-act="page" data-arg="${(page + 1) % pages}" data-key="Space">${page + 1} / ${pages}${DOT}more<span class="k">space</span></button>` : ''
        }</div>`
      : ''
  }
  ${m.after ?? ''}
</section>`;
}

/** A column further up the path: compact, with the chosen item lit. Clicking an item re-opens from there. */
function parentCol(c: Col, level: number, old: boolean): string {
  const { shown } = itemsOf(c.menu);
  return `<section class="col parent${old ? ' old' : ''}">
  <h2 class="ctitle"><button data-act="crumb" data-arg="${level}">${c.menu.title}</button></h2>
  <div class="citems">${shown
    .map((it, i) => {
      const k = it.slot ?? i;
      const on = c.sel !== undefined && it.arg === c.sel;
      return `<button class="citem${on ? ' on' : ''}" data-act="pick" data-arg="${level}|${it.act}|${it.arg ?? ''}"${it.disabled ? ' disabled' : ''}><span class="kb${k === 6 ? ' wide' : ''}">${KEY_NAMES[k]}</span>${it.label}</button>`;
    })
    .join('')}</div>
</section>`;
}

/**
 * The whole menu: the path so far as columns, the newest one open. Desktop shows the
 * last three; a phone shows only the open one, with a breadcrumb back up the path.
 * `dir`: 1 a column was opened, -1 one was closed, 0 redrawn in place.
 */
export function columnsHtml(cols: Col[], dir: number): string {
  const n = cols.length;
  const crumbs =
    n > 1
      ? `<nav class="crumbs">${cols
          .slice(0, -1)
          .map((c, i) => `<button data-act="crumb" data-arg="${i}">${c.menu.title}</button>`)
          .join('<span>\u203a</span>')}<span>\u203a</span><b>${cols[n - 1]!.menu.title}</b></nav>`
      : '';
  return `<div class="cols${n > 3 ? ' deep' : ''}">
  ${crumbs}
  <div class="colrow">${cols.map((c, i) => (i === n - 1 ? activeCol(c.menu, dir, n > 1) : parentCol(c, i, i < n - 3))).join('')}</div>
</div>`;
}

// --- Content ----------------------------------------------------------------------

export const GROUPS: { id: string; name: string; desc: string; skills: Skill[] }[] = [
  { id: 'body', name: 'Reflexes', desc: 'Reaction, speed, timing, coordination', skills: ['reaction', 'speed', 'timing', 'coordination'] },
  { id: 'mind', name: 'Mind', desc: 'Memory, attention, judgement, reasoning', skills: ['memory', 'attention', 'judgement', 'reasoning'] },
];

export interface MenuCtx {
  settings: Settings;
  history: RunRecord[];
  bests: Record<string, number>;
  daily: string[];
  dailyDone: number | null;
  streak: number;
  perf: boolean;
  /** Last difficulty played and custom difficulty, per game. */
  levels: Record<string, number>;
  custom: Record<string, number>;
  /** Best record for a game at a key count. */
  bestFor: (id: string, keys: number) => RunRecord | null;
}

function gamesOf(skills: readonly string[]): Entry[] {
  return ENTRIES.filter((e) => skills.includes(e.skill));
}

function inputLabel(e: Entry): string {
  return e.input === 'pointer' ? 'tap' : e.input === 'both' ? 'key or tap' : e.input === 'type' ? 'keyboard' : 'keys';
}

export function startMenu(c: MenuCtx): Menu {
  const sessions = c.history.filter((r) => r.game !== 'daily').length;
  return {
    title: 'TENSION',
    sub: `${ENTRIES.length} games${DOT}${SKILLS.length} skills${c.streak > 1 ? `${DOT}${c.streak} day streak` : ''}`,
    items: [
      { label: 'Daily', desc: `${c.daily.length} games, one per skill`, meta: c.dailyDone !== null ? `done${DOT}${fmtInt(c.dailyDone)}` : 'today', act: 'go', arg: 'daily' },
      ...GROUPS.map((g) => ({ label: g.name, desc: g.desc, meta: `${gamesOf(g.skills).length} games`, act: 'go', arg: `group:${g.id}` })),
      { label: 'Random', desc: 'A run of random games, short or long', act: 'go', arg: 'random' },
      { label: 'Stats', desc: sessions ? `${sessions} sessions${c.streak ? `${DOT}${c.streak} day streak` : ''}` : 'Nothing yet', act: 'go', arg: 'stats' },
      { label: 'Settings', desc: `Keys${DOT}sound ${c.settings.muted ? 'off' : 'on'}${DOT}history`, act: 'go', arg: 'settings' },
      { label: 'Endless', desc: 'Reaction runs with a set difficulty, until three hits', act: 'go', arg: 'endless', slot: 6 },
    ],
  };
}

/** Games with difficulty levels, gathered in one list. */
export function endlessMenu(c: MenuCtx): Menu {
  return {
    title: 'ENDLESS',
    sub: 'Pick a run, then a difficulty, then your keys',
    items: ENTRIES.filter((e) => e.def?.levels).map((e) => ({ label: e.name, desc: e.blurb, meta: c.bests[e.id] ? `best ${fmtInt(c.bests[e.id]!)}` : '', act: 'go', arg: `game:${e.id}` })),
  };
}

export function dailyMenu(c: MenuCtx): Menu {
  return {
    title: 'DAILY',
    sub: 'The same set for everyone today',
    items: [{ label: c.dailyDone !== null ? 'Play it again' : 'Play the set', desc: `${c.daily.length} games back to back`, meta: c.dailyDone !== null ? `today ${fmtInt(c.dailyDone)}` : '', act: 'daily' }],
    enter: { label: 'Play', act: 'daily' },
    after: `<ol class="dlist">${c.daily.map((id) => `<li>${entry(id)?.name ?? id}<span>${SKILLS.find((k) => k.id === entry(id)?.skill)?.name ?? ''}</span></li>`).join('')}</ol>`,
  };
}

export function randomMenu(): Menu {
  return {
    title: 'RANDOM',
    sub: 'Random games back to back, each about a minute',
    items: [
      { label: 'Three games', desc: 'About three minutes', act: 'quick', arg: 'all:3' },
      { label: 'Five games', desc: 'About five minutes', act: 'quick', arg: 'all:5' },
      { label: 'Ten games', desc: 'About ten minutes', act: 'quick', arg: 'all:10' },
      { label: 'Three reflex games', desc: 'Reaction, speed, timing, coordination', act: 'quick', arg: 'body:3' },
      { label: 'Three mind games', desc: 'Memory, attention, judgement, reasoning', act: 'quick', arg: 'mind:3' },
      { label: 'One of each skill', desc: `Eight games, a fresh draw each time`, act: 'quick', arg: 'each:8' },
    ],
    enter: { label: 'Three games', act: 'quick', arg: 'all:3' },
  };
}

export function groupMenu(c: MenuCtx, id: string): Menu {
  const g = GROUPS.find((x) => x.id === id) ?? GROUPS[0]!;
  return {
    title: g.name.toUpperCase(),
    sub: g.desc,
    items: [
      ...g.skills.map((sk) => {
        const def = SKILLS.find((k) => k.id === sk)!;
        const games = gamesOf([sk]);
        const tried = games.filter((e) => c.bests[e.id]).length;
        return { label: def.name, desc: def.blurb, meta: `${games.length} games${tried ? `${DOT}${tried} played` : ''}`, act: 'go', arg: `skill:${sk}` };
      }),
      { label: 'Three at random', desc: `From all ${g.name.toLowerCase()} games`, act: 'quick', arg: `${g.id}:3`, slot: 6 },
    ],
  };
}

export function skillMenu(c: MenuCtx, sk: string, page: number): Menu {
  const def = SKILLS.find((k) => k.id === sk)!;
  return {
    title: def.name.toUpperCase(),
    sub: def.blurb,
    page,
    items: gamesOf([sk]).map((e) => ({
      label: e.name,
      desc: e.blurb,
      meta: c.bests[e.id] ? `best ${fmtInt(c.bests[e.id]!)}` : inputLabel(e),
      act: 'go',
      arg: `game:${e.id}`,
    })),
    enter: { label: 'Three at random', act: 'quick', arg: `${sk}:3` },
  };
}

/** A game with difficulty levels: pick one first. */
function levelMenu(c: MenuCtx, e: Entry): Menu {
  const def = e.def!;
  const last = c.levels[e.id] ?? 0;
  const custom = c.custom[e.id] ?? def.custom?.def ?? 0;
  const items: Item[] = def.levels!.map((l) => ({ label: l.label, desc: l.desc, meta: l.value === last ? 'last used' : '', act: 'go', arg: `gamekeys:${e.id}:${l.value}`, current: l.value === last }));
  if (def.custom) items.push({ label: 'Custom', desc: `Your own window, now ${custom} ${def.custom.unit}`, meta: last === custom && !def.levels!.some((l) => l.value === last) ? 'last used' : '', act: 'go', arg: `custom:${e.id}`, slot: 6 });
  return {
    title: e.name.toUpperCase(),
    sub: `${SKILLS.find((k) => k.id === e.skill)?.name}${DOT}${e.blurb}`,
    items,
    enter: { label: 'Last difficulty', act: 'go', arg: `gamekeys:${e.id}:${last}` },
    after: `<p class="hint">${def.how}</p>`,
  };
}

/** A custom difficulty: nudge it, then go on to the keys. */
export function customMenu(c: MenuCtx, id: string): Menu {
  const e = entry(id)!;
  const cu = e.def!.custom!;
  const v = c.custom[id] ?? cu.def;
  return {
    title: 'CUSTOM',
    sub: `${e.name}${DOT}${cu.min} to ${cu.max} ${cu.unit}`,
    extra: `<p class="bigval">${v}<small>${cu.unit}</small></p>`,
    items: [
      { label: `Play at ${v} ${cu.unit}`, act: 'go', arg: `gamekeys:${id}:${v}` },
      { label: `\u2212 25 ${cu.unit}`, act: 'custom', arg: `${id}:-25`, disabled: v <= cu.min },
      { label: `+ 25 ${cu.unit}`, act: 'custom', arg: `${id}:25`, disabled: v >= cu.max },
      { label: `\u2212 100 ${cu.unit}`, act: 'custom', arg: `${id}:-100`, disabled: v <= cu.min },
      { label: `+ 100 ${cu.unit}`, act: 'custom', arg: `${id}:100`, disabled: v >= cu.max },
    ],
  };
}

export function gameMenu(c: MenuCtx, id: string, level?: number): Menu {
  const e = entry(id)!;
  if (e.def?.levels && level === undefined) return levelMenu(c, e);
  const lv = level === undefined ? '' : `:${level}`;
  const lvName = level === undefined ? '' : (e.def!.levels!.find((l) => l.value === level)?.label ?? `${level} ${e.def!.custom?.unit ?? ''}`);
  const keys = c.settings.keys[id] ?? 2;
  const min = e.minKeys ?? 1;
  const usesKeys = usesKeyCount(e.input);
  const how = e.def ? `${e.def.how}${usesKeys ? `<br>Keys: ${keysLine(keys, c.settings.bindings[keys]!)}` : ''}` : controlsHint(id, keys, c.settings.bindings[keys]!);
  const best = c.bestFor(id, keys);
  const sessions = c.history.filter((r) => gameOf(r) === id).length;
  // With keys, each option is a key count and starts the game at once; the last one used is marked.
  const items: Item[] = usesKeys
    ? MODES.map((m) => ({
        label: `${m.id} key${m.id === 1 ? '' : 's'}`,
        desc: keysLine(m.id, c.settings.bindings[m.id]!).replace(/&nbsp;/g, ' '),
        meta: m.id === keys ? 'last used' : '',
        act: 'play',
        arg: `${id}:${m.id}${lv}`,
        disabled: m.id < min,
        current: m.id === keys,
      }))
    : [{ label: 'Start', desc: e.input === 'type' ? 'Needs a keyboard' : 'Click or tap', act: 'play', arg: `${id}:${keys}${lv}` }];
  items.push({ label: 'Stats', meta: sessions ? `${sessions} sessions` : 'none yet', act: 'go', arg: `gamestats:${id}`, slot: 6 });
  return {
    title: lvName ? lvName.toUpperCase() : e.name.toUpperCase(),
    sub: lvName ? `${e.name}${DOT}how many keys?` : `${SKILLS.find((k) => k.id === e.skill)?.name}${DOT}${e.blurb}`,
    items,
    enter: { label: `Start${usesKeys ? ` with ${keys} key${keys === 1 ? '' : 's'}` : ''}`, act: 'play', arg: `${id}:${keys}${lv}` },
    after: `<p class="hint">${how}</p>${best ? `<p class="best">${bestLine(id, best)}</p>` : ''}`,
  };
}

/** The game id a history record belongs to. */
export function gameOf(r: RunRecord): string {
  return r.kind === 'run' ? 'climb' : r.kind === 'rt' ? 'reflex' : r.kind === 'cps' ? 'burst' : (r.game ?? '');
}

export function statsMenu(c: MenuCtx, page: number): Menu {
  // Played games, most recent first.
  const seen = new Map<string, { at: number; n: number }>();
  for (const r of c.history) {
    const id = gameOf(r);
    if (!entry(id)) continue;
    const s = seen.get(id) ?? { at: 0, n: 0 };
    s.at = Math.max(s.at, r.at);
    s.n++;
    seen.set(id, s);
  }
  const played = [...seen.entries()].sort((a, b) => b[1].at - a[1].at);
  return {
    title: 'STATS',
    wide: true,
    page,
    extra: `${overview(c.history)}<h2>Your games <span>most recent first${DOT}pick one for its stats</span></h2>`,
    items: played.map(([id, s]) => ({ label: entry(id)!.name, desc: `${s.n} session${s.n === 1 ? '' : 's'}${DOT}last ${shortDate(s.at)}`, meta: c.bests[id] ? `best ${fmtInt(c.bests[id]!)}` : '', act: 'go', arg: `gamestats:${id}` })),
    after: played.length ? '' : '<p class="muted">Play something and it shows up here.</p>',
  };
}

export function settingsMenu(c: MenuCtx): Menu {
  return {
    title: 'SETTINGS',
    items: [
      { label: 'Keys', desc: 'Rebind the keys for each key count', act: 'keys' },
      { label: `Sound ${c.settings.muted ? 'off' : 'on'}`, desc: 'Tones, ticks and the metronome', act: 'mute' },
      { label: `FPS overlay ${c.perf ? 'on' : 'off'}`, desc: 'Frame rate in a corner during play', act: 'perf' },
      { label: 'Export history', desc: 'Download every session as JSON', act: 'export' },
      { label: 'Clear history', desc: 'Delete every saved session', act: 'clear' },
    ],
  };
}

// --- Per-game stats ---------------------------------------------------------------

function changeLine(vals: number[], lower: boolean, fmt: (v: number) => string): string {
  if (vals.length < 4) return 'play a few more sessions to see a trend';
  const k = Math.min(3, Math.floor(vals.length / 2));
  const first = vals.slice(0, k).reduce((a, b) => a + b, 0) / k;
  const last = vals.slice(-k).reduce((a, b) => a + b, 0) / k;
  if (first === 0) return `first ${k}: ${fmt(first)}${DOT}last ${k}: ${fmt(last)}`;
  const pct = ((last - first) / Math.abs(first)) * 100 * (lower ? -1 : 1);
  return `first ${k} sessions ${fmt(first)}, last ${k} ${fmt(last)}: ${pct >= 0 ? 'better' : 'worse'} by ${Math.abs(Math.round(pct))}%`;
}

export function gameStatsMenu(c: MenuCtx, id: string, filter: number): Menu {
  const e = entry(id)!;
  const usesKeys = usesKeyCount(e.input);
  const all = c.history.filter((r) => gameOf(r) === id);
  const recs = all.filter((r) => !usesKeys || filter === 0 || r.mode === filter);
  const seg = usesKeys
    ? `<div class="seg"><span class="lbl">Keys</span><button data-act="gsfilter" data-arg="0" aria-pressed="${filter === 0}">all</button>${MODES.map(
        (m) => `<button data-act="gsfilter" data-arg="${m.id}" aria-pressed="${m.id === filter}"${all.some((r) => r.mode === m.id) ? '' : ' disabled'}>${m.id}</button>`,
      ).join('')}</div>`
    : '';
  let body = '';
  if (!recs.length) body = '<p class="muted">No sessions yet.</p>';
  else if (!e.def) {
    const metrics: Metric[] = id === 'climb' ? RUN_METRICS : id === 'reflex' ? RT_METRICS : CPS_METRICS;
    body = `<div class="grid">${metrics.map((m) => card(m, recs)).join('')}</div>`;
  } else {
    const last = recs[recs.length - 1]!;
    const p: MiniResult['primary'] = { label: last.vlabel ?? 'value', value: 0, unit: last.unit ?? '', decimals: last.decimals, lower: last.lower };
    const fmt = (v: number) => fmtPrimary(v, p);
    const vals = recs.map((r) => r.value).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    const scores = recs.map((r) => r.score ?? 0);
    const bestV = vals.length ? (p.lower ? Math.min(...vals.filter((v) => v > 0)) : Math.max(...vals)) : 0;
    const last5 = vals.slice(-5);
    const avg5 = last5.length ? last5.reduce((a, b) => a + b, 0) / last5.length : 0;
    body = `<div class="big">
      <div class="stat"><div class="v">${vals.length ? fmt(bestV) : '–'}</div><div class="l">best ${p.label}</div></div>
      <div class="stat"><div class="v">${vals.length ? fmt(avg5) : '–'}</div><div class="l">average, last ${last5.length}</div></div>
      <div class="stat"><div class="v">${recs.length}</div><div class="l">sessions</div></div>
    </div>
    <p class="muted">${changeLine(vals, !!p.lower, fmt)}</p>
    <div class="grid">
      <div class="card"><div class="l">${p.label}</div><div class="v">${vals.length ? fmt(vals[vals.length - 1]!) : '–'}<small>last</small></div>${trendSvg(vals, p.label)}</div>
      <div class="card"><div class="l">score</div><div class="v">${fmtInt(scores[scores.length - 1]!)}<small>best ${fmtInt(Math.max(...scores))}</small></div>${trendSvg(scores, 'score')}</div>
    </div>`;
  }
  const table = recs.length
    ? `<h2>Recent sessions</h2><table><tr><th>when</th>${usesKeys ? '<th>keys</th>' : ''}${e.def?.levels ? '<th>window</th>' : ''}<th>${e.def ? (recs[recs.length - 1]!.vlabel ?? 'result') : 'score'}</th><th>score</th></tr>${recs
        .slice(-10)
        .reverse()
        .map((r) => {
          const v = e.def && r.value !== undefined ? fmtPrimary(r.value, { label: '', value: r.value, unit: r.unit ?? '', decimals: r.decimals }) : fmtInt(r.score ?? 0);
          return `<tr><td>${shortDate(r.at)}</td>${usesKeys ? `<td>${r.mode || '–'}</td>` : ''}<td>${v}</td><td>${fmtInt(r.kind === 'cps' ? (r.target ?? 0) : (r.score ?? 0))}</td></tr>`;
        })
        .join('')}</table>`
    : '';
  return {
    title: 'STATS',
    sub: `${e.name}${DOT}${SKILLS.find((k) => k.id === e.skill)?.name ?? ''}`,
    wide: true,
    extra: `${seg}${body}${table}`,
    items: [{ label: 'Play', desc: 'Open the game', act: 'go', arg: `game:${id}` }],
  };
}

