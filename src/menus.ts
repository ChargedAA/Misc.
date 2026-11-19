// Menus: a path of columns. Each column is a short list; every option has a key, mostly the
// keys the hands already rest on (Z X C B N M, then their neighbours). The newest column owns
// the keys, Escape goes back, and columns slide in from the side they were reached from.

import { MODES } from './config.ts';
import { ENTRIES, entry, type Entry } from './minis/index.ts';
import { SKILLS, keysFor, picksKeys, type MiniResult, type Skill } from './minis/kit.ts';
import { GUIDES, LENGTHS, ROUNDS, durationOf, roundsLabel } from './minis/groups.ts';
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
  handKeys,
  stepsHtml,
  type Metric,
} from './ui.ts';

export const MENU_KEYS = ['KeyZ', 'KeyX', 'KeyC', 'KeyB', 'KeyN', 'KeyM', 'Space'] as const;
const KEY_NAMES = ['Z', 'X', 'C', 'B', 'N', 'M', 'SPACE'];
const PER_PAGE = 6;

/** Keys for long lists, in reach order: the bottom row, then the home row, then the top row. */
export const LIST_KEYS: [string, string][] = [
  ['KeyZ', 'Z'], ['KeyX', 'X'], ['KeyC', 'C'], ['KeyV', 'V'], ['KeyB', 'B'], ['KeyN', 'N'], ['KeyM', 'M'], ['Comma', ','], ['Period', '.'], ['Slash', '/'],
  ['KeyA', 'A'], ['KeyS', 'S'], ['KeyD', 'D'], ['KeyF', 'F'], ['KeyG', 'G'], ['KeyH', 'H'], ['KeyJ', 'J'], ['KeyK', 'K'], ['KeyL', 'L'], ['Semicolon', ';'],
  ['KeyQ', 'Q'], ['KeyW', 'W'], ['KeyE', 'E'], ['KeyR', 'R'], ['KeyT', 'T'], ['KeyY', 'Y'], ['KeyU', 'U'], ['KeyI', 'I'], ['KeyO', 'O'], ['KeyP', 'P'],
];

export interface Item {
  label: string;
  desc?: string;
  meta?: string;
  act: string;
  arg?: string;
  disabled?: boolean;
  /** Which key (0-5 for Z to M, 6 for Space), if not the item's position. */
  slot?: number;
  /** Or an explicit key code and the label shown for it. */
  code?: string;
  keyName?: string;
  /** A group heading shown just above this item, and a note beside it in the open column. */
  heading?: string;
  headingNote?: string;
  /** Drawn larger: the main thing to do on this screen. */
  hero?: boolean;
  /** Marked as the current choice (the last key count used, say). */
  current?: boolean;
}

/** A small control in a column's header (Stats, Settings and so on). */
export interface Tool {
  label: string;
  act: string;
  arg?: string;
  code: string;
  keyName: string;
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
  tools?: Tool[];
  wide?: boolean;
  /** Lay the item groups side by side on wide screens (items before the first heading span the width). */
  split?: boolean;
}

/** One column of the menu: a menu and, if a deeper column is open, the item chosen in it. */
export interface Col {
  menu: Menu;
  sel?: string;
}

function itemsOf(m: Menu): { shown: Item[]; page: number; pages: number } {
  // A list longer than six pages with Space, unless its items carry their own keys or Space is one of them.
  // No paging: a list too long for the six home-row keys takes keys from the rows above.
  const own = m.items.some((it) => it.slot === 6 || it.code);
  if (own || m.items.length <= PER_PAGE) return { shown: m.items, page: 0, pages: 1 };
  let k = 0;
  const shown = m.items.map((it) => {
    const key = LIST_KEYS[k++];
    return key ? { ...it, code: key[0], keyName: key[1] } : it;
  });
  return { shown, page: 0, pages: 1 };
}

function keyOf(it: Item, i: number): { code: string; name: string } {
  if (it.code) return { code: it.code, name: it.keyName ?? it.code };
  const k = it.slot ?? i;
  return { code: MENU_KEYS[k]!, name: KEY_NAMES[k]! };
}

function kb(name: string): string {
  return `<span class="kb${name.length > 2 ? ' wide' : ''}">${name}</span>`;
}

/** The open column: full detail, and it owns the keys. */
function activeCol(m: Menu, dir: number, canBack: boolean, crumbs = ''): string {
  const { shown, page, pages } = itemsOf(m);
  // An Enter default that is also one of the items rides on that item instead of a separate button.
  const twin = m.enter ? shown.find((it) => it.act === m.enter!.act && (it.arg ?? '') === (m.enter!.arg ?? '')) : undefined;
  const enter = twin ? undefined : m.enter;
  const cls = dir > 0 ? ' fwd' : dir < 0 ? ' bwd' : '';
  const tools = m.tools?.length
    ? `<div class="tools">${m.tools.map((t) => `<button data-act="${t.act}" data-arg="${t.arg ?? ''}" data-key="${t.code}">${kb(t.keyName)}${t.label}</button>`).join('')}</div>`
    : '';
  return `<section class="col active${m.wide ? ' wide' : ''}${cls}">
  ${crumbs}
  <header class="mhead">
    ${canBack ? '<button class="mback" data-act="back" data-key="Escape Backspace">\u2190<span class="k">esc</span></button>' : tools}
    <h1>${m.title}</h1>
    ${m.sub ? `<p class="msub">${m.sub}</p>` : ''}
  </header>
  ${m.extra ?? ''}
  ${itemsHtml(shown, twin, !!m.split)}
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

function itemHtml(it: Item, i: number, twin: Item | undefined): string {
  const k = keyOf(it, i);
  const codes = `${k.code}${it === twin ? ' Enter' : ''}`;
  return `${it.heading ? `<h3 class="ihead">${it.heading}${it.headingNote ? `<span>${it.headingNote}</span>` : ''}</h3>` : ''}<button class="item${it.current ? ' cur' : ''}${it.hero ? ' hero' : ''}" data-act="${it.act}" data-arg="${it.arg ?? ''}" data-key="${codes}"${it.disabled ? ' disabled' : ''}>${kb(k.name)}<span class="n">${it.label}</span>${it.meta ? `<span class="m">${it.meta}</span>` : ''}${it.desc ? `<span class="d">${it.desc}</span>` : ''}</button>`;
}

function itemsHtml(shown: Item[], twin: Item | undefined, split: boolean): string {
  if (!split) return `<div class="items">${shown.map((it, i) => itemHtml(it, i, twin)).join('')}</div>`;
  // Items before the first heading lead across the width; each heading starts a group.
  const lead: string[] = [];
  const groups: string[][] = [];
  shown.forEach((it, i) => {
    if (it.heading) groups.push([]);
    (groups.length ? groups[groups.length - 1]! : lead).push(itemHtml(it, i, twin));
  });
  return `<div class="items">${lead.join('')}</div><div class="isplit">${groups.map((g) => `<div class="items">${g.join('')}</div>`).join('')}</div>`;
}

/**
 * The whole menu: the open page, with a breadcrumb back up the path.
 * `dir`: 1 a page was opened, -1 one was closed, 0 redrawn in place.
 */
export function columnsHtml(cols: Col[], dir: number): string {
  const n = cols.length;
  // The path back up: parent pages only, since the page's own title follows.
  const crumbs =
    n > 1
      ? `<nav class="crumbs">${cols
          .slice(0, -1)
          .map((c, i) => `<button data-act="crumb" data-arg="${i}">${c.menu.title}</button>`)
          .join('<span>\u203a</span>')}</nav>`
      : '';
  return `<div class="cols">
  <div class="colrow">${activeCol(cols[n - 1]!.menu, dir, n > 1, crumbs)}</div>
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
  /** The latest session today, per game. */
  today: Record<string, RunRecord>;
  streak: number;
  perf: boolean;
  /** Last difficulty played and custom difficulty, per game. */
  levels: Record<string, number>;
  custom: Record<string, number>;
  /** Best record for a game at a key count. */
  bestFor: (id: string, keys: number) => RunRecord | null;
}

/** "best 222 ms": a game's best on its headline number, the one results lead with. Score for the built-in games. */
function bestOf(c: MenuCtx, id: string): string {
  const recs = c.history.filter((r) => r.kind === 'mini' && r.game === id && typeof r.value === 'number' && Number.isFinite(r.value));
  if (!recs.length) return c.bests[id] ? `best ${fmtInt(c.bests[id]!)}` : '';
  const last = recs[recs.length - 1]!;
  const vals = recs.map((r) => r.value!);
  const pos = vals.filter((v) => v > 0);
  const v = last.lower ? (pos.length ? Math.min(...pos) : 0) : Math.max(...vals);
  return `best <span class="nt">${fmtPrimary(v, { label: '', value: v, unit: last.unit ?? '', decimals: last.decimals })}</span>`;
}

function gamesOf(skills: readonly string[]): Entry[] {
  return ENTRIES.filter((e) => skills.includes(e.skill));
}

/** Home keys: the left hand for the Reflexes skills, the right hand for the Mind skills. */
const SKILL_KEYS: Record<string, [string, string]> = {
  reaction: ['KeyZ', 'Z'],
  speed: ['KeyX', 'X'],
  timing: ['KeyC', 'C'],
  coordination: ['KeyV', 'V'],
  memory: ['KeyB', 'B'],
  attention: ['KeyN', 'N'],
  judgement: ['KeyM', 'M'],
  reasoning: ['Comma', ','],
};

export function startMenu(c: MenuCtx): Menu {
  return {
    title: 'TENSION',
    sub: `Train eight skills with short drills${c.streak > 1 ? `${DOT}${c.streak} day streak` : ''}`,
    tools: [
      { label: 'Random', act: 'go', arg: 'random', code: 'KeyR', keyName: 'R' },
      { label: 'Stats', act: 'go', arg: 'stats', code: 'KeyS', keyName: 'S' },
      { label: 'Settings', act: 'go', arg: 'settings', code: 'KeyO', keyName: 'O' },
    ],
    items: [
      {
        label: 'Daily',
        desc: `${c.daily.length} drills, one per skill, about ${c.daily.length} minutes. The same set for everyone today.`,
        meta: c.dailyDone !== null ? `done${DOT}${fmtInt(c.dailyDone)}` : 'today',
        act: 'go',
        arg: 'daily',
        code: 'Space',
        keyName: 'SPACE',
        hero: true,
      },
      ...GROUPS.flatMap((g) =>
        g.skills.map((sk, i) => {
          const def = SKILLS.find((k) => k.id === sk)!;
          const n = gamesOf([sk]).length;
          return {
            heading: i === 0 ? `${g.name}${DOT}${i === 0 && g.id === 'body' ? 'left hand' : 'right hand'}` : undefined,
            label: def.name,
            desc: GUIDES[sk].about,
            meta: `${n} drills`,
            act: 'go',
            arg: `skill:${sk}`,
            code: SKILL_KEYS[sk]![0],
            keyName: SKILL_KEYS[sk]![1],
          };
        }),
      ),
    ],
    enter: { label: 'Daily', act: 'go', arg: 'daily' },
    split: true,
    wide: true,
  };
}

export function dailyMenu(c: MenuCtx): Menu {
  const done = c.daily.filter((id) => c.today[id]).length;
  const row = (id: string, i: number) => {
    const e = entry(id);
    const r = c.today[id];
    const val = r ? (r.value !== undefined && r.unit !== undefined ? fmtPrimary(r.value, { label: r.vlabel ?? '', value: r.value, unit: r.unit, decimals: r.decimals }) : fmtInt(r.score ?? 0)) : '';
    return `<li class="${r ? 'on' : ''}"><i>${i + 1}</i><b>${e?.name ?? id}</b><span>${SKILLS.find((k) => k.id === e?.skill)?.name ?? ''}</span><em>${r ? val : '\u2013'}</em></li>`;
  };
  return {
    title: 'DAILY',
    sub: `The same set for everyone today${DOT}${done ? `${done} of ${c.daily.length} played today` : `about ${c.daily.length} minutes`}`,
    items: [
      {
        label: c.dailyDone !== null ? 'Play it again' : 'Play the set',
        desc: `${c.daily.length} drills back to back, a ready card before each`,
        meta: c.dailyDone !== null ? `today ${fmtInt(c.dailyDone)}` : '',
        act: 'daily',
        code: 'Space',
        keyName: 'SPACE',
        hero: true,
      },
    ],
    enter: { label: 'Play', act: 'daily' },
    after: `<ol class="dlist">${c.daily.map(row).join('')}</ol>`,
  };
}

/** Mixed sessions: a few random drills, or endless until you stop. */
export function randomMenu(): Menu {
  return {
    title: 'RANDOM',
    sub: 'Random drills back to back, each about a minute. A ready card before each one.',
    items: [
      { label: 'Three drills', desc: 'About three minutes', act: 'quick', arg: 'all:3' },
      { label: 'Five drills', desc: 'About five minutes', act: 'quick', arg: 'all:5' },
      { label: 'Ten drills', desc: 'About ten minutes', act: 'quick', arg: 'all:10' },
      { label: 'One of each skill', desc: 'Eight drills, a fresh draw each time', act: 'quick', arg: 'each:8' },
      { heading: 'Endless', label: 'Everything', desc: 'Random drills until you stop', act: 'quick', arg: 'endless:all' },
      { label: 'Reflexes only', desc: 'Reaction, speed, timing, coordination', act: 'quick', arg: 'endless:body' },
      { label: 'Mind only', desc: 'Memory, attention, judgement, reasoning', act: 'quick', arg: 'endless:mind' },
    ],
    enter: { label: 'Three drills', act: 'quick', arg: 'all:3' },
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

export function skillMenu(c: MenuCtx, sk: string): Menu {
  const def = SKILLS.find((k) => k.id === sk)!;
  const g = GUIDES[def.id];
  const name = (id: string) => entry(id)?.name ?? id;
  const items: Item[] = [
    { label: 'Routine', desc: `${g.routine.map(name).join(', ')}${DOT}about ${g.routine.length} minutes`, act: 'routine', arg: sk, code: 'Space', keyName: 'SPACE', hero: true },
  ];
  // Every drill of the skill, grouped by what it trains; any not yet grouped go last.
  const grouped = new Set(g.groups.flatMap((x) => x.ids));
  const groups = [...g.groups, { name: 'More', desc: '', ids: gamesOf([sk]).map((e) => e.id).filter((id) => !grouped.has(id)) }];
  let k = 0;
  for (const grp of groups) {
    grp.ids.forEach((id, i) => {
      const e = entry(id);
      if (!e || e.skill !== sk) return;
      const key = LIST_KEYS[k++];
      items.push({
        heading: i === 0 ? grp.name : undefined,
        headingNote: i === 0 ? grp.desc : undefined,
        label: e.name,
        desc: e.blurb,
        meta: bestOf(c, e.id),
        act: 'go',
        arg: `game:${e.id}`,
        code: key?.[0] ?? 'Unidentified',
        keyName: key?.[1] ?? '',
      });
    });
  }
  return { title: def.name.toUpperCase(), sub: g.about, items, wide: true };
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

/** A drill's page: what it is, how to play, the setup, and Start, together. */
export function gameMenu(c: MenuCtx, id: string, level?: number): Menu {
  const e = entry(id)!;
  if (e.def?.levels && level === undefined) return levelMenu(c, e);
  const lv = level === undefined ? '' : `:${level}`;
  const lvName = level === undefined ? '' : (e.def!.levels!.find((l) => l.value === level)?.label ?? `${level} ${e.def!.custom?.unit ?? ''}`);
  const keys = keysFor(id, e.input, c.settings.keys[id]);
  const lenScale = c.settings.lengths?.[id] ?? 1;
  const min = e.minKeys ?? 1;
  const usesKeys = picksKeys(id, e.input);
  const how = e.def ? e.def.how : controlsHint(id, keys, c.settings.bindings[keys]!);
  const controls = e.input === 'pointer' ? 'Click or tap' : e.input === 'type' ? 'A full keyboard' : `${keysLine(keys, c.settings.bindings[keys]!)}${e.input === 'both' ? ' &nbsp; or tap' : ''}`;
  const best = c.bestFor(id, keys);
  const sessions = c.history.filter((r) => gameOf(r) === id).length;
  const skill = SKILLS.find((k) => k.id === e.skill)!;
  const group = GUIDES[e.skill].groups.find((g) => g.ids.includes(id));
  const extra = `${stepsHtml(how, e.input === 'pointer' || e.input === 'type' ? undefined : handKeys(keys, c.settings.bindings[keys]!))}
  <dl class="facts">
    <dt>Controls</dt><dd>${controls}</dd>
    ${ROUNDS[id] ? (lvName ? `<dt>Difficulty</dt><dd>${lvName}</dd>` : '') : `<dt>Length</dt><dd>${durationOf(id)}${lvName ? `${DOT}${lvName}` : ''}</dd>`}
  </dl>
  ${
    ROUNDS[id]
      ? `<div class="counts small lengths" aria-label="Length">${LENGTHS.map(
          (l) => `<button data-act="length" data-arg="${id}:${l.scale}" aria-pressed="${l.scale === lenScale}">${l.label}<small>${roundsLabel(id, l.scale)}</small></button>`,
        ).join('')}<button hidden data-act="length" data-arg="${id}" data-key="KeyL"></button><span class="lbl">length${DOT}standard is ${durationOf(id)}<span class="kbonly">${DOT}L to change</span></span></div>`
      : ''
  }
  ${
    usesKeys
      ? `<div class="counts small" aria-label="How many keys">${MODES.map(
          (m) => `<button data-act="keycount" data-arg="${id}:${m.id}" aria-pressed="${m.id === keys}"${m.id < min ? ' disabled' : ''}>${m.id}</button>`,
        ).join('')}<span class="lbl">keys<span class="kbonly">${DOT}press 1 to 6</span></span></div>`
      : ''
  }`;
  return {
    title: e.name.toUpperCase(),
    sub: group ? group.name : skill.name,
    extra,
    items: [
      { label: 'Start', desc: usesKeys ? `With ${keys} key${keys === 1 ? '' : 's'}` : '', act: 'play', arg: `${id}:${keys}${lv}`, code: 'Space', keyName: 'SPACE', hero: true },
      { label: 'Practice', desc: 'Play it through to learn it. Nothing is saved', act: 'practice', arg: `${id}:${keys}${lv}`, code: 'KeyP', keyName: 'P' },
      { label: 'Stats', meta: sessions ? `${sessions} sessions` : 'none yet', act: 'go', arg: `gamestats:${id}`, code: 'KeyS', keyName: 'S' },
    ],
    enter: { label: 'Start', act: 'play', arg: `${id}:${keys}${lv}` },
    after: best ? `<p class="best">${bestLine(id, best)}</p>` : '',
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
    items: played.map(([id, s]) => ({ label: entry(id)!.name, desc: `${s.n} session${s.n === 1 ? '' : 's'}${DOT}last ${shortDate(s.at)}`, meta: bestOf(c, id), act: 'go', arg: `gamestats:${id}` })),
    after: played.length ? '' : '<p class="muted">Play something and it shows up here.</p>',
  };
}

export function settingsMenu(c: MenuCtx, note = ''): Menu {
  return {
    title: 'SETTINGS',
    extra: note ? `<p class="cmp">${note}</p>` : '',
    items: [
      { label: 'Keys', desc: 'Rebind the keys for each key count', act: 'keys' },
      { label: `Sound ${c.settings.muted ? 'off' : 'on'}`, desc: 'Tones, ticks and the metronome', act: 'mute' },
      { label: 'Volume', desc: 'Press to step through 25, 50, 75 and 100%', meta: `${Math.round((c.settings.volume ?? 0.8) * 100)}%`, act: 'volume' },
      { label: 'Sound check', desc: 'Tap along to clicks for 12 seconds, so the rhythm games allow for how late sound reaches you', meta: `${(c.settings.audioOffset ?? 0) >= 0 ? '+' : ''}${c.settings.audioOffset ?? 0} ms`, act: 'soundcheck' },
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
  const usesKeys = picksKeys(id, e.input);
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
          const win = e.def?.levels ? `<td>${r.level ? `${r.level} ${e.def.custom?.unit ?? ''}` : 'progressing'}</td>` : '';
          return `<tr><td>${shortDate(r.at)}</td>${usesKeys ? `<td>${r.mode || '–'}</td>` : ''}${win}<td>${v}</td><td>${fmtInt(r.kind === 'cps' ? (r.target ?? 0) : (r.score ?? 0))}</td></tr>`;
        })
        .join('')}</table>`
    : '';
  return {
    title: e.name.toUpperCase(),
    sub: `Stats${DOT}${SKILLS.find((k) => k.id === e.skill)?.name ?? ''}`,
    wide: true,
    extra: `${seg}${body}${table}`,
    items: [{ label: 'Play', desc: 'Open the game', act: 'go', arg: `game:${id}`, code: 'Space', keyName: 'SPACE' }],
  };
}

