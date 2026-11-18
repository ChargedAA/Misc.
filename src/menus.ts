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

export const MENU_KEYS = ['KeyZ', 'KeyX', 'KeyC', 'KeyB', 'KeyN', 'KeyM'] as const;
const KEY_NAMES = ['Z', 'X', 'C', 'B', 'N', 'M'];
const PER_PAGE = 6;

export interface Item {
  label: string;
  desc?: string;
  meta?: string;
  act: string;
  arg?: string;
  disabled?: boolean;
  /** Which of the six keys, if not the item's position. */
  slot?: number;
}

export interface Menu {
  title: string;
  sub?: string;
  /** Html above the list. */
  extra?: string;
  items: Item[];
  page?: number;
  /** Html below the list. */
  after?: string;
  /** Enter: the screen's default action. */
  enter?: { label: string; act: string; arg?: string };
  back?: boolean;
  wide?: boolean;
}

/** 1 = reached going forward, -1 = going back, 0 = same screen redrawn. */
export function menuHtml(m: Menu, dir: number): string {
  const pages = Math.max(1, Math.ceil(m.items.length / PER_PAGE));
  const page = Math.min(m.page ?? 0, pages - 1);
  const shown = m.items.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);
  const cls = dir > 0 ? 'fwd' : dir < 0 ? 'bwd' : 'same';
  // An Enter default that is also one of the items rides on that item instead of a separate button.
  const twin = m.enter ? shown.find((it) => it.act === m.enter!.act && (it.arg ?? '') === (m.enter!.arg ?? '')) : undefined;
  const enter = twin ? undefined : m.enter;
  return `<section class="screen menu ${cls}${m.wide ? ' wide' : ''}">
  <header class="mhead">
    ${m.back ? '<button class="mback" data-act="back" data-key="Escape Backspace">←<span class="k">esc</span></button>' : ''}
    <h1>${m.title}</h1>
    ${m.sub ? `<p class="msub">${m.sub}</p>` : ''}
  </header>
  ${m.extra ?? ''}
  <div class="items">${shown
    .map((it, i) => {
      const k = it.slot ?? i;
      return `<button class="item" data-act="${it.act}" data-arg="${it.arg ?? ''}" data-key="${MENU_KEYS[k]}${it === twin ? ' Enter' : ''}"${it.disabled ? ' disabled' : ''}><span class="kb">${KEY_NAMES[k]}</span><span class="n">${it.label}</span>${it.meta ? `<span class="m">${it.meta}</span>` : ''}${it.desc ? `<span class="d">${it.desc}</span>` : ''}</button>`;
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
      {
        label: 'Daily',
        desc: c.daily.map((id) => entry(id)?.name ?? id).join(DOT),
        meta: c.dailyDone !== null ? `done${DOT}${fmtInt(c.dailyDone)}` : `${c.daily.length} games`,
        act: 'daily',
      },
      ...GROUPS.map((g) => ({ label: g.name, desc: g.desc, meta: `${gamesOf(g.skills).length} games`, act: 'go', arg: `group:${g.id}` })),
      { label: 'Quick', desc: 'Three random games from anywhere', meta: '3 games', act: 'quick', arg: 'all' },
      { label: 'Stats', desc: sessions ? `${sessions} sessions${c.streak ? `${DOT}${c.streak} day streak` : ''}` : 'Nothing yet', act: 'go', arg: 'stats' },
      { label: 'Settings', desc: `Keys${DOT}sound ${c.settings.muted ? 'off' : 'on'}${DOT}history`, act: 'go', arg: 'settings' },
    ],
  };
}

export function groupMenu(c: MenuCtx, id: string): Menu {
  const g = GROUPS.find((x) => x.id === id) ?? GROUPS[0]!;
  return {
    title: g.name.toUpperCase(),
    sub: g.desc,
    back: true,
    items: [
      ...g.skills.map((sk) => {
        const def = SKILLS.find((k) => k.id === sk)!;
        const games = gamesOf([sk]);
        const tried = games.filter((e) => c.bests[e.id]).length;
        return { label: def.name, desc: def.blurb, meta: `${games.length} games${tried ? `${DOT}${tried} played` : ''}`, act: 'go', arg: `skill:${sk}` };
      }),
      { label: 'Three at random', desc: `From all ${g.name.toLowerCase()} games`, act: 'quick', arg: g.id, slot: 5 },
    ],
  };
}

export function skillMenu(c: MenuCtx, sk: string, page: number): Menu {
  const def = SKILLS.find((k) => k.id === sk)!;
  return {
    title: def.name.toUpperCase(),
    sub: def.blurb,
    back: true,
    page,
    items: gamesOf([sk]).map((e) => ({
      label: e.name,
      desc: e.blurb,
      meta: c.bests[e.id] ? `best ${fmtInt(c.bests[e.id]!)}` : inputLabel(e),
      act: 'go',
      arg: `game:${e.id}`,
    })),
    enter: { label: 'Three at random', act: 'quick', arg: sk },
  };
}

export function gameMenu(c: MenuCtx, id: string): Menu {
  const e = entry(id)!;
  const keys = c.settings.keys[id] ?? 2;
  const min = e.minKeys ?? 1;
  const usesKeys = usesKeyCount(e.input);
  const how = e.def ? `${e.def.how}${usesKeys ? `<br>Keys: ${keysLine(keys, c.settings.bindings[keys]!)}` : ''}` : controlsHint(id, keys, c.settings.bindings[keys]!);
  const best = c.bestFor(id, keys);
  const sessions = c.history.filter((r) => gameOf(r) === id).length;
  const extra = `<p class="mblurb">${e.blurb}</p>
  ${
    usesKeys
      ? `<div class="counts" aria-label="How many keys">${MODES.map(
          (m) => `<button data-act="keycount" data-arg="${m.id}" aria-pressed="${m.id === keys}"${m.id < min ? ' disabled' : ''}>${m.id}</button>`,
        ).join('')}<span class="lbl">keys${DOT}1–6 to pick</span></div>`
      : ''
  }
`;
  const after = `<p class="hint">${how}</p>
  ${best ? `<p class="best">${bestLine(id, best)}</p>` : ''}`;
  const items: Item[] = [{ label: 'Start', act: 'start', arg: id, slot: 0 }];
  if (usesKeys) {
    items.push({ label: 'Fewer keys', act: 'keycount', arg: String(keys - 1), disabled: keys - 1 < min, slot: 1 });
    items.push({ label: 'More keys', act: 'keycount', arg: String(keys + 1), disabled: keys >= 6, slot: 2 });
  }
  items.push({ label: 'Stats', meta: sessions ? `${sessions} sessions` : 'none yet', act: 'go', arg: `gamestats:${id}`, slot: 3 });
  return { title: e.name.toUpperCase(), sub: SKILLS.find((k) => k.id === e.skill)?.name, back: true, extra, items, after, enter: { label: 'Start', act: 'start', arg: id } };
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
    back: true,
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
    back: true,
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
    ? `<h2>Recent sessions</h2><table><tr><th>when</th>${usesKeys ? '<th>keys</th>' : ''}<th>${e.def ? (recs[recs.length - 1]!.vlabel ?? 'result') : 'score'}</th><th>score</th></tr>${recs
        .slice(-10)
        .reverse()
        .map((r) => {
          const v = e.def && r.value !== undefined ? fmtPrimary(r.value, { label: '', value: r.value, unit: r.unit ?? '', decimals: r.decimals }) : fmtInt(r.score ?? 0);
          return `<tr><td>${shortDate(r.at)}</td>${usesKeys ? `<td>${r.mode || '–'}</td>` : ''}<td>${v}</td><td>${fmtInt(r.kind === 'cps' ? (r.target ?? 0) : (r.score ?? 0))}</td></tr>`;
        })
        .join('')}</table>`
    : '';
  return {
    title: e.name.toUpperCase(),
    sub: `Stats${DOT}${SKILLS.find((k) => k.id === e.skill)?.name ?? ''}`,
    back: true,
    wide: true,
    extra: `${seg}${body}${table}`,
    items: [{ label: 'Play', desc: 'Open the game', act: 'go', arg: `game:${id}` }],
  };
}

