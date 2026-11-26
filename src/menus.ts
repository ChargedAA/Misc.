// Menus: a path of columns. Each column is a short list; every option has a key, mostly the
// keys the hands already rest on (Z X C B N M, then their neighbours). The newest column owns
// the keys, Escape goes back, and columns slide in from the side they were reached from.

import { MODES } from './config.ts';
import { ENTRIES, entry, type Entry } from './minis/index.ts';
import { SKILLS, keysFor, picksKeys, type MiniResult, type Skill } from './minis/kit.ts';
import { GUIDES, NEEDS_SOUND, ROUNDS, durationOf, lengthsFor, roundsLabel } from './minis/groups.ts';
import { trendSvg } from './charts.ts';
import { KEYSETS, bindingsFor, type RunRecord, type Settings } from './storage.ts';
import {
  CPS_METRICS,
  DOT,
  RT_METRICS,
  RUN_METRICS,
  bestLine,
  card,
  controlsHint,
  esc,
  fmtInt,
  fmtPrimary,
  keysLine,
  overview,
  controlsHtml,
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
  { id: 'body', name: 'Reflexes', desc: 'Reaction, speed, timing, coordination, dexterity, aim', skills: ['reaction', 'speed', 'timing', 'coordination', 'dexterity', 'aim'] },
  { id: 'mind', name: 'Mind', desc: 'Memory, attention, judgement, reasoning, ear', skills: ['memory', 'attention', 'judgement', 'reasoning', 'ear'] },
];

export interface MenuCtx {
  /** Clear history was pressed once: the next press deletes. */
  armedClear?: boolean;
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
  /** Leaderboard account: how sign-in works here, and who is signed in. */
  online: { mode: 'google' | 'dev' | 'local' | 'none'; session?: string; name: string | null; suggested?: string; note?: string };
  /** A drill not yet opened in this browser, since it was added. */
  isNew?: (id: string) => boolean;
}

const NEW_TAG = '<span class="nw">new</span>';
const newCount = (c: MenuCtx, ids: string[]) => (c.isNew ? ids.filter((id) => c.isNew!(id)).length : 0);

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
  dexterity: ['KeyA', 'A'],
  memory: ['KeyB', 'B'],
  attention: ['KeyN', 'N'],
  judgement: ['KeyM', 'M'],
  reasoning: ['Comma', ','],
  ear: ['Period', '.'],
  aim: ['KeyG', 'G'],
};

export function startMenu(c: MenuCtx): Menu {
  return {
    title: 'TENSION',
    sub: `Train eleven skills with short drills${c.streak > 1 ? `${DOT}${c.streak} day streak` : ''}`,
    tools: [
      { label: 'Find', act: 'go', arg: 'search', code: 'KeyF', keyName: 'F' },
      { label: 'Random', act: 'go', arg: 'random', code: 'KeyR', keyName: 'R' },
      { label: 'Boards', act: 'go', arg: 'boards', code: 'KeyL', keyName: 'L' },
      { label: 'Stats', act: 'go', arg: 'stats', code: 'KeyS', keyName: 'S' },
      { label: c.online.name ?? 'Account', act: 'go', arg: 'account', code: 'KeyU', keyName: 'U' },
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
          const fresh = newCount(c, gamesOf([sk]).map((e) => e.id));
          return {
            heading: i === 0 ? `${g.name}${DOT}${i === 0 && g.id === 'body' ? 'left hand' : 'right hand'}` : undefined,
            label: def.name,
            desc: GUIDES[sk].about,
            meta: `${n} drills${fresh ? `${DOT}${fresh} new` : ''}`,
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

/** Mixed sessions: a few random drills, or endless until you stop, from the games you choose. */
export function randomMenu(c?: MenuCtx): Menu {
  const f = c?.settings.runFilter ?? { skip: [] };
  const chip = (act: string, arg: string, on: boolean, label: string) => `<button data-act="${act}" data-arg="${arg}" aria-pressed="${on}">${label}</button>`;
  const pool = ENTRIES.filter((e) => e.def && !f.skip.includes(e.skill) && !(f.noSound && NEEDS_SOUND.has(e.id)) && !(f.noKeyboard && e.input === 'type') && !(f.touchOnly && (e.input === 'keys' || e.input === 'type'))).length;
  const extra = `<div class="chips" aria-label="Skills to draw from">${SKILLS.map((k) => chip('rskill', k.id, !f.skip.includes(k.id), k.name)).join('')}</div>
  <div class="chips" aria-label="Kinds of game">${chip('rflag', 'noSound', !!f.noSound, 'No sound needed')}${chip('rflag', 'noKeyboard', !!f.noKeyboard, 'No full keyboard')}${chip('rflag', 'touchOnly', !!f.touchOnly, 'Touch or mouse only')}</div>
  <p class="msub">Drawing from ${pool} games. These apply to every random set and endless run.</p>`;
  return {
    title: 'RANDOM',
    sub: 'Random drills back to back, each about a minute. A ready card before each one.',
    extra,
    items: [
      { label: 'Three drills', desc: 'About three minutes', act: 'quick', arg: 'all:3', code: 'Space', keyName: 'SPACE', hero: true },
      { label: 'Five drills', desc: 'About five minutes', act: 'quick', arg: 'all:5', slot: 0 },
      { label: 'Ten drills', desc: 'About ten minutes', act: 'quick', arg: 'all:10', slot: 1 },
      { label: 'One of each skill', desc: 'One from each skill you have chosen', act: 'quick', arg: 'each:10', slot: 2 },
      { heading: 'Endless', label: 'Everything', desc: 'Random drills until you stop', act: 'quick', arg: 'endless:all', slot: 3 },
      { label: 'Reflexes only', desc: 'Reaction, speed, timing, coordination, dexterity', act: 'quick', arg: 'endless:body', slot: 4 },
      { label: 'Mind only', desc: 'Memory, attention, judgement, reasoning, ear', act: 'quick', arg: 'endless:mind', slot: 5 },
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
        const fresh = newCount(c, games.map((e) => e.id));
        return { label: def.name, desc: def.blurb, meta: `${games.length} games${tried ? `${DOT}${tried} played` : ''}${fresh ? `${DOT}${fresh} new` : ''}`, act: 'go', arg: `skill:${sk}` };
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
        meta: bestOf(c, e.id) || (c.isNew?.(e.id) ? NEW_TAG : ''),
        act: 'go',
        arg: `game:${e.id}`,
        code: key?.[0] ?? 'Unidentified',
        keyName: key?.[1] ?? '',
      });
    });
  }
  return { title: def.name.toUpperCase(), sub: g.about, items, wide: true };
}

/** Words people search with that a skill's drills may not say themselves. */
const SEARCH_TAGS: Record<string, string> = {
  ear: 'pitch music sound tone hearing listen notes',
  reaction: 'reflex fast quick react',
  speed: 'tapping tap rate cps fast',
  timing: 'rhythm beat tempo music',
  coordination: 'steer balance hands control',
  dexterity: 'typing keyboard fingers',
  memory: 'remember recall',
  attention: 'focus vigilance',
  judgement: 'estimate perception',
  reasoning: 'logic puzzle maths math',
};

/** Every leaderboard. */
export function boardsMenu(c: MenuCtx): Menu {
  return {
    title: 'LEADERBOARDS',
    sub: c.online.name ? `Every game with scores${DOT}you are ${esc(c.online.name)}` : 'Every game with scores. Sign in from the Account tab to join.',
    extra: `<h2>Overall <span>points across every game${DOT}<button class="link" data-act="go" data-arg="overall:0">how it's scored</button></span></h2><div data-online="overall" data-limit="10"><p class="muted">Loading…</p></div><h2>By game</h2><div data-online="boards"><p class="muted">Loading…</p></div>`,
    items: [],
    wide: true,
  };
}

/** One board: every player, a page at a time. Arg: game:len:keys:page. */
export function boardMenu(c: MenuCtx, arg: string): Menu {
  const [game = '', len = '1', keys = '0', level = '0', page = '0'] = arg.split(':');
  const e = entry(game);
  const label = c.history.filter((r) => r.game === game && r.vlabel).at(-1)?.vlabel ?? '';
  return {
    title: (e?.name ?? game).toUpperCase(),
    sub: `Leaderboard${DOT}${SKILLS.find((k) => k.id === e?.skill)?.name ?? ''}`,
    extra: `<div data-online="board" data-game="${esc(game)}" data-len="${Number(len)}" data-keys="${Number(keys) | 0}" data-level="${Number(level) | 0}" data-page="${Number(page) | 0}" data-label="${esc(label)}"><p class="muted">Loading…</p></div>`,
    items: e ? [{ label: 'Play', desc: 'Open the game', act: 'go', arg: `game:${game}`, code: 'Space', keyName: 'SPACE' }] : [],
    wide: true,
  };
}

/** Everyone ranked across all games. Arg: page. */
export function overallMenu(c: MenuCtx, arg: string): Menu {
  return {
    title: 'OVERALL',
    sub: c.online.name ? `Every player, across every game${DOT}you are ${esc(c.online.name)}` : 'Every player, across every game',
    extra: `<p class="muted">On each game's board, first place scores 100 and the rest score by how many they beat: on a board of 20, 10th scores 55. Your total adds your best board for each game, so play more games to climb; playing one game at every length doesn't count twice.</p><div data-online="overall" data-page="${Number(arg) | 0}"><p class="muted">Loading…</p></div>`,
    items: [],
    wide: true,
  };
}

/** One player's bests on every board. */
export function playerMenu(c: MenuCtx, name: string): Menu {
  return {
    title: name.toUpperCase(),
    sub: name === c.online.name ? 'Your scores on the leaderboards' : 'Player',
    extra: `<div data-online="player" data-name="${esc(name)}"><p class="muted">Loading…</p></div>`,
    items: [],
    wide: true,
  };
}

/** Rank games for a search: name first, then skill and group, then the description. */
export function searchGames(q: string): Entry[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const scored: { e: Entry; s: number }[] = [];
  for (const sk of SKILLS) {
    const g = GUIDES[sk.id];
    for (const e of gamesOf([sk.id])) {
      const name = e.name.toLowerCase();
      const group = g.groups.find((x) => x.ids.includes(e.id))?.name.toLowerCase() ?? '';
      const rest = `${sk.name} ${group} ${e.blurb} ${SEARCH_TAGS[sk.id] ?? ''}`.toLowerCase();
      let s = 0;
      for (const w of words) {
        const ws = name === w ? 100 : name.startsWith(w) ? 60 : name.includes(w) ? 35 : new RegExp(`\\b${w.replace(/[^a-z0-9]/g, '')}`).test(rest) ? 12 : rest.includes(w) ? 5 : 0;
        if (!ws) {
          s = 0;
          break;
        }
        s += ws;
      }
      if (s) scored.push({ e, s });
    }
  }
  return scored.sort((a, b) => b.s - a.s || a.e.name.localeCompare(b.e.name)).map((x) => x.e);
}

export function searchMenu(c: MenuCtx, q: string): Menu {
  const total = gamesOf(SKILLS.map((k) => k.id)).length;
  // "new" lists the drills not yet opened, ahead of anything that merely mentions the word.
  const fresh = q.trim().toLowerCase() === 'new' && c.isNew ? gamesOf(SKILLS.map((k) => k.id)).filter((e) => c.isNew!(e.id)) : [];
  const found = (fresh.length ? fresh : searchGames(q)).slice(0, fresh.length ? 200 : 30);
  const skillName = (id: string) => SKILLS.find((k) => k.id === id)?.name ?? '';
  return {
    title: 'FIND',
    sub: q ? `${found.length || 'No'} match${found.length === 1 ? '' : 'es'}` : `Search ${total} drills by name, skill or what they train`,
    extra: `<div class="lbform search"><input id="q" type="text" autocomplete="off" spellcheck="false" placeholder="type a name, skill or idea: pitch, balance, typing, new…" value="${esc(q)}" aria-label="Search drills"></div>${q && !found.length ? '<p class="muted">Nothing matches. Try a skill (reaction, ear) or a kind of task (rhythm, maze, chord).</p>' : ''}`,
    items: found.map((e) => ({ label: e.name, desc: e.blurb, meta: `${skillName(e.skill)}${bestOf(c, e.id) ? `${DOT}${bestOf(c, e.id)}` : ''}`, act: 'go', arg: `game:${e.id}`, code: 'Unidentified', keyName: '' })),
    wide: true,
  };
}

/** A game with difficulty levels: pick one first. */
function levelMenu(c: MenuCtx, e: Entry): Menu {
  const def = e.def!;
  const last = c.levels[e.id] ?? 0;
  const custom = c.custom[e.id] ?? def.custom?.def ?? 0;
  // Space, as everywhere, goes forward: the difficulty you played last. Letters pick the others.
  const lastName = def.levels!.find((l) => l.value === last)?.label ?? `Custom, ${last} ${def.custom?.unit ?? ''}`;
  const items: Item[] = [{ label: `Play: ${lastName}`, desc: 'The difficulty you played last', act: 'go', arg: `gamekeys:${e.id}:${last}`, code: 'Space', keyName: 'SPACE', hero: true }];
  def.levels!.forEach((l, i) => items.push({ label: l.label, desc: l.desc, meta: l.value === last ? 'last used' : '', act: 'go', arg: `gamekeys:${e.id}:${l.value}`, current: l.value === last, slot: i }));
  if (def.custom) items.push({ label: 'Custom', desc: `Your own window, now ${custom} ${def.custom.unit}`, meta: last === custom && !def.levels!.some((l) => l.value === last) ? 'last used' : '', act: 'go', arg: `custom:${e.id}`, ...(def.levels!.length < 6 ? { slot: def.levels!.length } : { code: 'Comma', keyName: ',' }) });
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
  const keys = keysFor(id, e.input, c.settings.keys[id], e.minKeys);
  const lenScale = lengthOf(c.settings, id);
  const min = e.minKeys ?? 1;
  const usesKeys = picksKeys(id, e.input);
  const binds = bindingsFor(c.settings, id, keys);
  const how = e.def ? e.def.how : controlsHint(id, keys, binds);
  const controls = e.def ? controlsHtml(id, e.input, keys, binds) : keysLine(keys, binds);
  // Two-key games can also be played on the Shift keys or the arrows.
  const set = c.settings.keysets?.[id] ?? '';
  const sets = (e.input === 'keys' || e.input === 'both') && keys === 2
    ? `<div class="counts small lengths" aria-label="Which keys">${[['', 'Usual keys'], ...Object.entries(KEYSETS).map(([k, v]) => [k, v.label])]
        .map(([k, label]) => `<button data-act="keyset" data-arg="${id}:${k}" aria-pressed="${k === set}">${label}<small>${k ? `${KEYSETS[k]!.left.replace('Left', ' left')} · ${KEYSETS[k]!.right.replace('Right', ' right')}` : keysLine(2, c.settings.bindings[2]!).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}</small></button>`)
        .join('')}<span class="lbl">keys to play with</span></div>`
    : '';
  const best = c.bestFor(id, keys);
  const sessions = c.history.filter((r) => gameOf(r) === id).length;
  const skill = SKILLS.find((k) => k.id === e.skill)!;
  const group = GUIDES[e.skill].groups.find((g) => g.ids.includes(id));
  const extra = `${stepsHtml(how, e.input === 'pointer' || e.input === 'type' ? undefined : handKeys(keys, binds))}
  <dl class="facts">
    <dt>Controls</dt><dd>${controls}</dd>
    ${ROUNDS[id] ? (lvName ? `<dt>Difficulty</dt><dd>${lvName}</dd>` : '') : `<dt>Length</dt><dd>${durationOf(id)}${lvName ? `${DOT}${lvName}` : ''}</dd>`}
  </dl>
  ${
    ROUNDS[id]
      ? `<div class="counts small lengths" aria-label="Length">${lengthsFor(id)
          .map((l) => `<button data-act="length" data-arg="${id}:${l.value}" aria-pressed="${l.value === lenScale}">${l.label}<small>${roundsLabel(id, l.value)}</small></button>`)
          .join('')}<button hidden data-act="length" data-arg="${id}" data-key="KeyL"></button><span class="lbl">length${DOT}standard is ${durationOf(id)}<span class="kbonly">${DOT}L to change</span></span></div>`
      : ''
  }
  ${
    usesKeys
      ? `<div class="counts small" aria-label="How many keys">${MODES.map(
          (m) => `<button data-act="keycount" data-arg="${id}:${m.id}" aria-pressed="${m.id === keys}"${m.id < min ? ' disabled' : ''}>${m.id}</button>`,
        ).join('')}<span class="lbl">keys<span class="kbonly">${DOT}press 1 to 6</span></span></div>`
      : ''
  }
  ${sets}`;
  return {
    title: e.name.toUpperCase(),
    sub: group ? group.name : skill.name,
    extra,
    items: [
      {
        label: 'Start',
        // The whole setup in one line, right above the decision: difficulty, length, keys.
        desc: [lvName, ROUNDS[id] ? `${lengthsFor(id).find((l) => l.value === lenScale)?.label ?? 'Standard'}: ${roundsLabel(id, lenScale)}` : durationOf(id), usesKeys ? `${keys} keys` : '', set ? KEYSETS[set]!.label : ''].filter(Boolean).join(DOT),
        act: 'play',
        arg: `${id}:${keys}${lv}`,
        code: 'Space',
        keyName: 'SPACE',
        hero: true,
      },
      { label: 'Practice', desc: 'Play it through to learn it. Nothing is saved', act: 'practice', arg: `${id}:${keys}${lv}`, code: 'KeyP', keyName: 'P' },
      { label: 'Stats', meta: sessions ? `${sessions} sessions` : 'none yet', act: 'go', arg: `gamestats:${id}`, code: 'KeyS', keyName: 'S' },
      { label: 'Copy link', desc: 'A link straight to this game, to send to someone', meta: `#${id}`, act: 'share', arg: id, code: 'KeyK', keyName: 'K' },
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

/** Settings' account block: sign in, choose a name, or sign out. */
function accountHtml(c: MenuCtx): string {
  const o = c.online;
  let body: string;
  if (!o.session) {
    body =
      o.mode === 'google'
        ? '<div id="gsi" class="gsi"></div>'
        : o.mode === 'dev' || o.mode === 'local'
          ? `<div class="lbform"><input id="devname" maxlength="16" autocomplete="off" placeholder="any test account id"><button data-act="devsignin">Sign in (${o.mode === 'local' ? 'test copy' : 'dev server'})</button></div>${o.mode === 'local' ? '<p class="cmp">Test copy: this stands in for Google sign-in, and the leaderboards are pretend ones kept only in this browser, with sample players. On the live site this is a Sign in with Google button.</p>' : ''}`
          : `<p class="muted">${location.protocol === 'file:' ? 'Signing in needs the live site; this is a local copy.' : 'Sign-in is not set up on this site yet.'}</p>`;
    body += '<p class="muted">Sign in with Google to post to the leaderboards. Your Google name and email are never shown: you pick a display name. Playing never needs an account.</p>';
  } else if (!o.name) {
    body = `<div class="lbform"><label for="lbname">Display name</label><input id="lbname" maxlength="16" autocomplete="off" spellcheck="false" placeholder="2-16 letters or digits" value="${esc(o.suggested ?? '')}"><button data-act="lbname">Save</button></div><p class="muted">Signed in. Choose the name shown on the leaderboards; it must be unique.</p>`;
  } else {
    body = `<p class="acct">Signed in as <b>${esc(o.name)}</b><button class="pill" data-act="signout">Sign out</button></p><div class="lbform"><label for="lbname">Change name</label><input id="lbname" maxlength="16" autocomplete="off" spellcheck="false" value="${esc(o.name)}"><button data-act="lbname">Save</button></div><p class="muted">Runs that pass the fair-play checks are posted automatically.</p>`;
  }
  return `${o.note ? `<p class="cmp">${esc(o.note)}</p>` : ''}${body}`;
}

export const ACCENTS: [string, string][] = [
  ['Orange', '#ff5a36'],
  ['Red', '#ff3d5a'],
  ['Yellow', '#ffcc33'],
  ['Green', '#33d17a'],
  ['Cyan', '#33c9e0'],
  ['Blue', '#4d8dff'],
  ['Violet', '#a07bff'],
  ['Pink', '#ff5fae'],
];

export const BACKGROUNDS: [string, string][] = [
  ['Near black', '#0a0a0b'],
  ['Black', '#000000'],
  ['Charcoal', '#16161a'],
];

/** Settings → Customize: every option as a row of chips, applied as soon as it is picked. */
export function customizeMenu(c: MenuCtx): Menu {
  const L = c.settings.look ?? {};
  const row = (title: string, note: string, key: string, opts: [string, string | number | boolean][], cur: string | number | boolean) =>
    `<h2>${title}${note ? ` <span>${note}</span>` : ''}</h2><div class="chips">${opts
      .map(([label, v]) => `<button data-act="look" data-arg="${key}:${v}" aria-pressed="${v === cur}">${key === 'accent' ? `<i class="sw" style="background:${v}"></i>` : ''}${label}</button>`)
      .join('')}</div>`;
  return {
    title: 'CUSTOMIZE',
    sub: 'Changes apply straight away and are kept on this device',
    extra: [
      row('Accent colour', 'the one colour used for targets, hits and highlights', 'accent', ACCENTS, L.accent ?? '#ff5a36'),
      row('Background', '', 'bg', BACKGROUNDS, L.bg ?? '#0a0a0b'),
      row('Text size in games', 'labels, counts and prompts drawn in the games', 'text', [['Small', 0.85], ['Standard', 1], ['Large', 1.2], ['Extra large', 1.4]], L.text ?? 1),
      row('Menu size', '', 'menu', [['Compact', 0.9], ['Standard', 1], ['Large', 1.12], ['Extra large', 1.25]], L.menu ?? 1),
      row('Menu sounds', 'clicks when moving through menus; game sounds are separate', 'uiSound', [['On', true], ['Off', false]], L.uiSound ?? true),
      row('Motion', 'menu slide animations', 'motion', [['On', true], ['Off', false]], L.motion ?? true),
      row('Default length', 'for drills you have not chosen a length for (3 lives: until three mistakes, where a drill has it)', 'defLen', [['Standard', 1], ['Short', 0.5], ['Long', 2], ['3 lives', -1], ['1 min', -60], ['3 min', -180]], L.defLen ?? 1),
      row('Pause when you switch away', 'switching tabs or apps mid-drill pauses it', 'autoPause', [['On', true], ['Off', false]], L.autoPause ?? true),
      '<p><button class="pill" data-act="look" data-arg="reset:1">Back to defaults</button></p>',
    ].join(''),
    items: [],
    wide: true,
  };
}

/** The length a drill plays at: its own choice, else the default length where the drill offers it. */
export function lengthOf(s: Settings, id: string): number {
  const own = s.lengths?.[id];
  if (own !== undefined) return own;
  // Standard by default, so a first result compares with everyone's; 3 lives and the rest are a choice.
  const d = s.look?.defLen ?? 1;
  return lengthsFor(id).some((l) => l.value === d) ? d : 1;
}

/** The account tab: sign in, your name, and your scores on the boards. */
export function accountMenu(c: MenuCtx): Menu {
  const o = c.online;
  return {
    title: 'ACCOUNT',
    sub: o.name ? `Signed in as ${esc(o.name)}` : o.session ? 'Signed in: choose a display name' : 'Sign in to post to the leaderboards',
    extra: `${accountHtml(c)}${o.name ? `<h2>Your scores <span>best on each board</span></h2><div data-online="player" data-name="${esc(o.name)}" data-self="1"><p class="muted">Loading…</p></div>` : ''}`,
    items: [{ label: 'Leaderboards', desc: 'Every game with scores', act: 'go', arg: 'boards', code: 'KeyL', keyName: 'L' }],
    wide: true,
  };
}

export function settingsMenu(c: MenuCtx, note = ''): Menu {
  return {
    title: 'SETTINGS',
    extra: note ? `<p class="cmp">${note}</p>` : '',
    items: [
      { label: 'Customize', desc: 'Colours, text size, menu sounds and motion, default length, auto-pause', act: 'go', arg: 'customize', code: 'Space', keyName: 'SPACE' },
      { slot: 0, label: 'Keys', desc: 'Rebind the keys for each key count', act: 'keys' },
      { slot: 1, label: `Sound ${c.settings.muted ? 'off' : 'on'}`, desc: 'Tones, ticks and the metronome', act: 'mute' },
      { slot: 2, label: 'Volume', desc: 'Press to step through 25, 50, 75 and 100%', meta: `${Math.round((c.settings.volume ?? 0.8) * 100)}%`, act: 'volume' },
      { slot: 3, label: 'Sound check', desc: 'Tap along to clicks for 12 seconds, so the rhythm games allow for how late sound reaches you', meta: `${(c.settings.audioOffset ?? 0) >= 0 ? '+' : ''}${c.settings.audioOffset ?? 0} ms`, act: 'soundcheck' },
      { slot: 4, label: `FPS overlay ${c.perf ? 'on' : 'off'}`, desc: 'Frame rate in a corner during play', act: 'perf' },
      { slot: 5, label: 'Export history', desc: 'Download every session as JSON', act: 'export' },
      { label: c.armedClear ? 'Press D again to delete everything' : 'Clear history', desc: 'Delete every saved session. Asks once more first', act: 'clear', code: 'KeyD', keyName: 'D' },
      { label: 'Showcase mode', desc: 'For an event stand: one key to play three short drills, a board for today with initials, and back to the start on its own. Shift+Esc on its start screen leaves it. Or open the site with ?showcase', act: 'showcase', code: 'KeyW', keyName: 'W' },
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

/** The deeper sections of a game's stats: response times, practice and the last breakdown. */
function depthHtml(recs: RunRecord[], word: string): string {
  let out = '';
  const withRt = recs.filter((r) => r.rt && r.rt.n >= 3);
  if (withRt.length) {
    const meds = withRt.map((r) => r.rt!.median);
    const sds = withRt.map((r) => r.rt!.sd);
    const fastest = Math.min(...withRt.map((r) => r.rt!.best));
    const last = withRt[withRt.length - 1]!.rt!;
    const cvLast = last.median > 0 ? last.sd / last.median : 0;
    out += `<h2>${word === 'reaction' ? 'Reaction' : 'Response'} time <span>${withRt.length} session${withRt.length === 1 ? '' : 's'} measured</span></h2>
    <div class="big">
      <div class="stat"><div class="v">${Math.round(Math.min(...meds))}<small> ms</small></div><div class="l">best median</div></div>
      <div class="stat"><div class="v">${Math.round(last.median)}<small> ms</small></div><div class="l">median, last session</div></div>
      <div class="stat"><div class="v">${Math.round(fastest)}<small> ms</small></div><div class="l">fastest single ${word}</div></div>
    </div>
    <p class="muted">Last session: ${last.n} measured, spread ±${Math.round(last.sd)} ms (${cvLast < 0.15 ? 'very steady' : cvLast < 0.3 ? 'steady' : 'uneven: some slow ones'}).</p>
    <p class="muted">${changeLine(meds, true, (v) => `${Math.round(v)} ms`)}</p>
    <div class="grid">
      <div class="card"><div class="l">median ${word} time</div><div class="v">${Math.round(last.median)}<small>ms</small></div>${trendSvg(meds, 'median')}</div>
      <div class="card"><div class="l">consistency (spread)</div><div class="v">±${Math.round(last.sd)}<small>ms</small></div>${trendSvg(sds, 'spread')}</div>
    </div>`;
  }
  // Practice: how much, how recently.
  const week = Date.now() - 7 * 86400000;
  const secs = recs.reduce((a, r) => a + (r.dur ?? 0), 0);
  const thisWeek = recs.filter((r) => r.at >= week).length;
  const days = new Set(recs.map((r) => new Date(r.at).toDateString())).size;
  out += `<h2>Practice</h2><table>
    <tr><td>sessions this week</td><td>${thisWeek}</td></tr>
    <tr><td>days practised</td><td>${days}</td></tr>
    ${secs ? `<tr><td>time played</td><td>${secs >= 3600 ? `${(secs / 3600).toFixed(1)} h` : `${Math.max(1, Math.round(secs / 60))} min`}</td></tr>` : ''}
    <tr><td>first played</td><td>${shortDate(recs[0]!.at)}</td></tr>
  </table>`;
  const lastLines = [...recs].reverse().find((r) => r.lines?.length)?.lines;
  if (lastLines) out += `<h2>Last session in detail</h2><table>${lastLines.map((l) => `<tr><td>${esc(l.label)}</td><td>${esc(l.value)}</td></tr>`).join('')}</table>`;
  return out;
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
    </div>${depthHtml(recs, e.skill === 'reaction' || /react/i.test(p.label) ? 'reaction' : 'response')}`;
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
  const lbKeys = usesKeys ? (filter || c.settings.keys[id] || 2) : 0;
  // Games with levels show the board for the level last played.
  const lbLevel = e.def?.levels ? (c.levels[id] ?? e.def.levels[0]!.value) : 0;
  const lbLevelName = e.def?.levels ? (e.def.levels.find((l) => l.value === lbLevel)?.label ?? `${lbLevel} ${e.def.custom?.unit ?? ''}`) : '';
  return {
    title: e.name.toUpperCase(),
    sub: `Stats${DOT}${SKILLS.find((k) => k.id === e.skill)?.name ?? ''}`,
    wide: true,
    extra: `${seg}${body}<h2>Leaderboard <span>standard length${lbKeys ? `${DOT}${lbKeys} keys` : ''}${lbLevelName ? `${DOT}${esc(lbLevelName)}` : ''}${c.online.name ? `${DOT}you are ${esc(c.online.name)}` : `${DOT}sign in (U, Account) to join`}</span></h2><div data-online="top" data-game="${id}" data-len="1" data-keys="${lbKeys}" data-level="${lbLevel}" data-label="${esc(all[all.length - 1]?.vlabel ?? '')}"><p class="muted">Loading…</p></div>${table}`,
    items: [{ label: 'Play', desc: 'Open the game', act: 'go', arg: `game:${id}`, code: 'Space', keyName: 'SPACE' }],
  };
}

