// DOM screens: title, the key-count pop-out, pause, results, stats, key
// rebinding. The games themselves are drawn on the canvas; these only appear
// between runs, so plain HTML strings and one delegated click handler are enough.

import { MODES, getMode } from './config.ts';
import { histogramSvg, trendSvg } from './charts.ts';
import type { CpsStats, Histogram, RtStats } from './stats.ts';
import { ENTRIES, entry } from './minis/index.ts';
import { SKILLS, type MiniResult } from './minis/kit.ts';
import { keyLabel, type Bindings, type GameId, type RunRecord, type Settings } from './storage.ts';

export class Ui {
  private readonly root: HTMLElement;

  constructor(root: HTMLElement, onAction: (action: string, arg: string) => void) {
    this.root = root;
    root.addEventListener('click', (e) => {
      const el = (e.target as Element | null)?.closest<HTMLElement>('[data-act]');
      if (!el) return;
      el.blur();
      onAction(el.dataset.act ?? '', el.dataset.arg ?? '');
    });
  }

  show(html: string, veil = false): void {
    this.root.innerHTML = html;
    this.root.classList.toggle('veil', veil);
    this.root.hidden = false;
    this.root.scrollTop = 0;
  }

  hide(): void {
    this.root.hidden = true;
    this.root.innerHTML = '';
  }
}

// --- Formatting -----------------------------------------------------------------

const THIN = ' ';
const DOT = ' · ';

export function fmtInt(v: number): string {
  return Math.round(v)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, THIN);
}

export function fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
}

function fmtRate(v: number): string {
  return v > 0 ? v.toFixed(1) : '–';
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

function kbd(code: string): string {
  return `<kbd>${esc(keyLabel(code))}</kbd>`;
}

function foot(items: [label: string, act: string, key: string][]): string {
  return (
    '<div class="foot">' +
    items.map(([label, act, key]) => `<button data-act="${act}">${label}${key ? `<span class="k">${key}</span>` : ''}</button>`).join('') +
    '</div>'
  );
}

function keySeg(current: number, act: string, withAll = false): string {
  let h = `<div class="seg"><span class="lbl">Keys</span>`;
  if (withAll) h += `<button data-act="${act}" data-arg="0" aria-pressed="${current === 0}">all</button>`;
  for (const m of MODES) {
    h += `<button data-act="${act}" data-arg="${m.id}" aria-pressed="${m.id === current}">${m.id}</button>`;
  }
  return h + '</div>';
}

// --- Title and pop-out ------------------------------------------------------------

/** What the keys of a key count do in a given game. */
export function controlsHint(game: GameId, keys: number, b: Bindings): string {
  const m = getMode(keys);
  const left = b.left.map(kbd).join('');
  const right = b.right.map(kbd).join('');
  const reflex = m.reflex && b.reflex ? kbd(b.reflex) : '';
  const lines: string[] = [];
  if (game === 'climb') {
    if (m.right === 0) {
      lines.push(`${left} surges: the beam jerks upward and carries the ball over a hole or bar. Time it.`);
      lines.push('When a cable turns orange, press once to catch it. Grey: do not press until it fades.');
    } else {
      if (m.left === 1) lines.push(`${left} dash left &nbsp; ${right} dash right`);
      else lines.push(`${left} dash left, ${right} dash right. Outer keys dash further.`);
      lines.push('Both sides together: surge. The beam jerks upward over a hole or bar, then recharges.');
      lines.push((reflex ? `${reflex} when a cable turns orange.` : 'When a cable turns orange, tap that side.') + ' Grey: hold still until it fades.');
    }
    lines.push((m.left > 1 ? 'Heavy pull: both hands fast, alternating the keys of each hand.' : 'Heavy pull: tap fast until the meter fills.') + ' One comes about every 20 seconds, marked PULL.');
  } else if (game === 'reflex') {
    lines.push('Each round shows its rules, then shapes appear one at a time.');
    lines.push(`Press what the rules say with ${left}${right}${reflex}, or press nothing. Three mistakes end it.`);
    if (m.left === 1 && m.right === 1) lines.push('Some answers need both keys together.');
  } else {
    lines.push(`Tap ${left}${right} to hold the target rate for 5 seconds. It rises each time you do.`);
    if (m.left > 1) lines.push('Alternate the keys of each hand. Repeats are counted.');
    else if (m.right > 0) lines.push('Alternate the two keys. Repeats are counted.');
    lines.push('Two drops at the same target end the session.');
  }
  return lines.join('<br>');
}

function bestLine(game: GameId, best: RunRecord | null): string {
  if (!best) return '';
  if (game === 'climb') return `<span class="l">best</span>${fmtInt(best.score ?? 0)}${DOT}${fmtInt(best.height ?? 0)} m`;
  if (game === 'reflex') return `<span class="l">best</span>${fmtInt(best.score ?? 0)}${DOT}round ${best.rounds ?? 0}`;
  if (game === 'burst') return `<span class="l">best</span>${(best.target ?? 0).toFixed(1)} taps/s held`;
  const v = best.value;
  return `<span class="l">best</span>${fmtInt(best.score ?? 0)}${v !== undefined && best.vlabel ? `${DOT}${best.vlabel} ${fmtPrimary(v, { label: best.vlabel, value: v, unit: best.unit ?? '', decimals: best.decimals })}` : ''}`;
}

function fmtPrimary(v: number, p: MiniResult['primary']): string {
  const n = p.decimals ? v.toFixed(p.decimals) : fmtInt(v);
  return p.unit ? `${n}${p.unit === '%' ? '' : ' '}${p.unit}` : n;
}

function keysLine(keys: number, b: Bindings): string {
  const m = getMode(keys);
  let h = `${b.left.map(kbd).join('')}${m.right ? ' &nbsp; ' + b.right.map(kbd).join('') : ''}`;
  if (m.reflex && b.reflex) h += ` &nbsp; ${kbd(b.reflex)}`;
  return h;
}

/**
 * The title screen: every game, grouped by skill. With `picked` set, the
 * pop-out for that game is open over it; `slide` plays its entrance.
 */
export function titleHtml(s: Settings, picked: GameId | null, best: RunRecord | null, slide: boolean): string {
  let h = `<section class="screen title"${picked ? ' aria-hidden="true"' : ''}>
  <h1 class="logo">TENSION</h1>
  <p class="tag">A minimal training suite. ${ENTRIES.length} games, six skills.</p>
  <div class="skills">
    ${SKILLS.map((sk) => {
      const games = ENTRIES.filter((e) => e.skill === sk.id);
      if (!games.length) return '';
      return `<section class="skill"><h2>${sk.name}<span>${sk.blurb}</span></h2><div class="modes">${games
        .map(
          (g) =>
            `<button class="mode" data-act="pick" data-arg="${g.id}"><span class="n">${g.name}</span><span class="d">${g.blurb}</span><span class="k">${g.input === 'pointer' ? 'tap' : g.input === 'both' ? 'key or tap' : 'keys'}</span></button>`,
        )
        .join('')}</div></section>`;
    }).join('')}
  </div>
  ${foot([
    ['Stats', 'stats', 's'],
    ['Keys', 'keys', 'k'],
    [`Sound ${s.muted ? 'off' : 'on'}`, 'mute', '0'],
  ])}
</section>`;
  if (picked) {
    const g = entry(picked)!;
    const keys = s.keys[picked] ?? 2;
    const min = g.minKeys ?? 1;
    const usesKeys = g.input !== 'pointer';
    const how = g.def ? `${g.def.how}${usesKeys ? `<br>Keys: ${keysLine(keys, s.bindings[keys]!)}` : ''}` : controlsHint(picked, keys, s.bindings[keys]!);
    h += `<div class="scrim" data-act="closepop"></div>
<aside class="pop${slide ? ' slide' : ''}" role="dialog" aria-label="${g.name}">
  <button class="back" data-act="closepop">Back<span class="k">esc</span></button>
  <h1>${g.name.toUpperCase()}</h1>
  <p class="d">${g.blurb}</p>
  ${
    usesKeys
      ? `<h2>How many keys</h2>
  <div class="counts">${MODES.map(
    (m) => `<button data-act="keycount" data-arg="${m.id}" aria-pressed="${m.id === keys}"${m.id < min ? ' disabled' : ''}>${m.id}</button>`,
  ).join('')}</div>`
      : '<h2>Click or tap</h2>'
  }
  <p class="hint">${how}</p>
  <p class="best">${bestLine(picked, best)}</p>
  <button class="go" data-act="start">Start<span class="k">enter</span></button>
  ${usesKeys ? '<p class="muted">On a touch screen the keys are pads in the bottom corners.</p>' : ''}
</aside>`;
  }
  return h;
}

export function pauseHtml(muted: boolean): string {
  return `<section class="screen">
  <h1>PAUSED</h1>
  <div class="rows">
    <button class="row" data-act="resume">Resume<span class="k">enter or a key</span></button>
    <button class="row" data-act="restart">Restart<span class="k">r</span></button>
    <button class="row" data-act="mute">Sound ${muted ? 'off' : 'on'}<span class="k">0</span></button>
    <button class="row" data-act="menu">Menu<span class="k">esc</span></button>
  </div>
</section>`;
}

// --- Results --------------------------------------------------------------------

function rtBlock(rt: RtStats, hist: Histogram, note: string): string {
  if (rt.n === 0) return `<h2>Reaction <span>${note}</span></h2><p class="muted">No reaction times logged.</p>`;
  return `<h2>Reaction <span>${note}</span></h2>
  <div class="line">
    <span><span class="l">avg</span>${rt.avg.toFixed(0)}</span>
    <span><span class="l">median</span>${rt.median.toFixed(0)}</span>
    <span><span class="l">best</span>${rt.best.toFixed(0)}</span>
    <span><span class="l">sd</span>${rt.sd.toFixed(0)}</span>
    <span class="muted">ms${DOT}n ${rt.n}</span>
  </div>
  ${histogramSvg(hist, rt.median)}`;
}

function cpsBlock(c: CpsStats, labels: string[], showJitter: boolean): string {
  if (c.taps === 0) return `<h2>CPS</h2><p class="muted">No taps logged.</p>`;
  const twoHands = c.hands[1].taps > 0 || c.keys.some((k) => k.slot >= 3);
  let rows = `<tr><td>all</td><td>${c.peak}</td><td>${fmtRate(c.s5)}</td><td>${fmtRate(c.s10)}</td><td>${fmtInt(c.taps)}</td><td></td></tr>`;
  if (twoHands) {
    const names = ['left', 'right'];
    for (let h = 0; h < 2; h++) {
      const s = c.hands[h]!;
      rows += `<tr><td>${names[h]}</td><td>${s.peak}</td><td>${fmtRate(s.s5)}</td><td>${fmtRate(s.s10)}</td><td>${fmtInt(s.taps)}</td><td>${pct(s.share)}</td></tr>`;
    }
  }
  const keys = c.keys
    .map(
      (k, i) =>
        `<span><span class="l">${esc(labels[i] ?? '')}</span>${pct(k.share)}${showJitter && k.taps > 2 ? ` <span class="muted">±${pct(k.jitter)}</span>` : ''}</span>`,
    )
    .join('');
  let even = '';
  if (twoHands) even += `<span><span class="l">hands</span>${pct(c.handEvenness)}</span>`;
  if (c.keys.filter((k) => k.slot < 3).length > 1) even += `<span><span class="l">left keys</span>${pct(c.hands[0].evenness)}</span>`;
  if (c.keys.filter((k) => k.slot >= 3).length > 1) even += `<span><span class="l">right keys</span>${pct(c.hands[1].evenness)}</span>`;
  const rep = c.alternations > 0 ? `<span><span class="l">repeats</span>${c.repeats} <span class="muted">${pct(c.repeatRate)}</span></span>` : '';
  return `<h2>CPS <span>taps per second</span></h2>
  <table>
    <tr><th></th><th>peak</th><th>5 s</th><th>10 s</th><th>taps</th><th>share</th></tr>
    ${rows}
  </table>
  ${c.keys.length > 1 ? `<div class="line"><span class="muted">per key</span>${keys}</div>` : ''}
  ${even || rep ? `<div class="line"><span class="muted">evenness</span>${even}${rep}</div>` : ''}`;
}

const AGAIN: [string, string, string][] = [
  ['Again', 'again', 'enter'],
  ['Stats', 'stats', 's'],
  ['Menu', 'menu', 'esc'],
];

export interface RunSummary {
  score: number;
  height: number;
  time: number;
  rt: RtStats;
  hist: Histogram;
  cues: number;
  caught: number;
  holds: number;
  held: number;
  falseStarts: number;
  pullsWon: number;
  pulls: number;
  rings: number;
  bestChain: number;
  surges: number;
  cps: CpsStats;
  labels: string[];
  best: boolean;
}

export function resultsHtml(r: RunSummary): string {
  const note = [`${r.caught} of ${r.cues} caught`];
  if (r.holds) note.push(`${r.held} of ${r.holds} held`);
  if (r.falseStarts) note.push(`${r.falseStarts} false start${r.falseStarts === 1 ? '' : 's'}`);
  return `<section class="screen">
  <div class="big">
    <div class="stat"><div class="v">${fmtInt(r.score)}</div><div class="l">score${r.best ? `${DOT}best` : ''}</div></div>
    <div class="stat"><div class="v">${fmtInt(r.height)} m</div><div class="l">height</div></div>
    <div class="stat"><div class="v">${fmtTime(r.time)}</div><div class="l">time</div></div>
  </div>
  <div class="line under">
    <span><span class="l">pickups</span>${r.rings}</span>
    <span><span class="l">best chain</span>×${r.bestChain + 1}</span>
    <span><span class="l">surges</span>${r.surges}</span>
    <span><span class="l">pulls held</span>${r.pullsWon} of ${r.pulls}</span>
  </div>
  ${rtBlock(r.rt, r.hist, note.join(DOT))}
  ${cpsBlock(r.cps, r.labels, false)}
  ${foot(AGAIN)}
</section>`;
}

export interface ReflexGameRow {
  name: string;
  tried: number;
  correct: number;
  avg: number;
}

export interface ReflexSummary {
  rt: RtStats;
  hist: Histogram;
  score: number;
  rounds: number;
  trials: number;
  correct: number;
  wrong: number;
  late: number;
  early: number;
  window: number;
  games: ReflexGameRow[];
  saved: boolean;
  best: boolean;
}

export function reflexResultsHtml(r: ReflexSummary): string {
  const acc = r.trials ? r.correct / r.trials : 0;
  const note = `${r.correct} right${DOT}${r.wrong} wrong${DOT}${r.late} too slow${DOT}${r.early} too early`;
  const rows = r.games
    .filter((g) => g.tried > 0)
    .map(
      (g) =>
        `<tr><td>${g.name.toLowerCase()}</td><td>${g.correct} of ${g.tried}</td><td>${pct(g.correct / g.tried)}</td><td>${g.avg > 0 ? g.avg.toFixed(0) : '–'}</td></tr>`,
    )
    .join('');
  return `<section class="screen">
  <div class="big">
    <div class="stat"><div class="v">${fmtInt(r.score)}</div><div class="l">score${r.best ? `${DOT}best` : ''}</div></div>
    <div class="stat"><div class="v">${r.rounds}</div><div class="l">rounds cleared</div></div>
    <div class="stat"><div class="v">${pct(acc)}</div><div class="l">correct</div></div>
  </div>
  ${rtBlock(r.rt, r.hist, note)}
  ${
    rows
      ? `<h2>By game <span>window ended at ${r.window.toFixed(0)} ms</span></h2>
  <table><tr><th></th><th>right</th><th>share</th><th>avg ms</th></tr>${rows}</table>`
      : ''
  }
  ${r.saved ? '' : '<p class="muted">Sessions under 5 answers are not saved.</p>'}
  ${foot(AGAIN)}
</section>`;
}

export function miniResultsHtml(name: string, r: MiniResult, hist: Histogram | null, rtMedian: number, best: boolean): string {
  const p = r.primary;
  return `<section class="screen">
  <div class="big">
    <div class="stat"><div class="v">${fmtInt(r.score)}</div><div class="l">score${best ? `${DOT}best` : ''}</div></div>
    <div class="stat"><div class="v">${fmtPrimary(p.value, p)}</div><div class="l">${p.label}</div></div>
    <div class="stat"><div class="v">${name}</div><div class="l">game</div></div>
  </div>
  <table>${r.lines.map((l) => `<tr><td>${l.label}</td><td>${l.value}</td></tr>`).join('')}</table>
  ${hist && hist.counts.length ? `<h2>Reaction times <span>median ${Math.round(rtMedian)} ms</span></h2>${histogramSvg(hist, rtMedian)}` : ''}
  ${r.saved ? '' : '<p class="muted">Too short to save.</p>'}
  ${foot(AGAIN)}
</section>`;
}

export interface CpsTrainSummary {
  cps: CpsStats;
  labels: string[];
  cleared: number;
  time: number;
  saved: boolean;
}

export function cpsResultsHtml(r: CpsTrainSummary): string {
  return `<section class="screen">
  <div class="big">
    <div class="stat"><div class="v">${r.cleared ? r.cleared.toFixed(1) : '–'}</div><div class="l">target held</div></div>
    <div class="stat"><div class="v">${r.cps.peak || '–'}</div><div class="l">peak</div></div>
    <div class="stat"><div class="v">${fmtRate(r.cps.s5)}</div><div class="l">5 s</div></div>
  </div>
  ${cpsBlock(r.cps, r.labels, true)}
  ${r.saved ? '' : '<p class="muted">Sessions under 20 taps are not saved.</p>'}
  ${foot(AGAIN)}
</section>`;
}

// --- Stats ------------------------------------------------------------------------

interface Metric {
  label: string;
  get: (r: RunRecord) => number | undefined;
  fmt: (v: number) => string;
  /** Which direction counts as "best". */
  lower?: boolean;
}

const RUN_METRICS: Metric[] = [
  { label: 'Score', get: (r) => r.score, fmt: fmtInt },
  { label: 'Height', get: (r) => r.height, fmt: (v) => fmtInt(v) + ' m' },
  { label: 'Survival', get: (r) => r.time, fmt: fmtTime },
  { label: 'Median reaction', get: (r) => (r.rt && r.rt.n ? r.rt.median : undefined), fmt: (v) => v.toFixed(0) + ' ms', lower: true },
  { label: 'Peak CPS', get: (r) => r.cps?.peak || undefined, fmt: (v) => v.toFixed(0) },
  { label: 'Sustained 5 s', get: (r) => r.cps?.s5 || undefined, fmt: (v) => v.toFixed(1) },
];

const RT_METRICS: Metric[] = [
  { label: 'Median reaction', get: (r) => (r.rt && r.rt.n ? r.rt.median : undefined), fmt: (v) => v.toFixed(0) + ' ms', lower: true },
  { label: 'Correct', get: (r) => r.accuracy, fmt: pct },
  { label: 'Rounds cleared', get: (r) => r.rounds, fmt: (v) => v.toFixed(0) },
  { label: 'Window', get: (r) => r.window, fmt: (v) => v.toFixed(0) + ' ms', lower: true },
];

const CPS_METRICS: Metric[] = [
  { label: 'Target held', get: (r) => r.target || undefined, fmt: (v) => v.toFixed(1) },
  { label: 'Sustained 5 s', get: (r) => r.cps?.s5 || undefined, fmt: (v) => v.toFixed(1) },
  { label: 'Peak CPS', get: (r) => r.cps?.peak || undefined, fmt: (v) => v.toFixed(0) },
  { label: 'Repeats', get: (r) => r.cps?.repeatRate, fmt: pct, lower: true },
];

function card(m: Metric, records: RunRecord[]): string {
  const vals: number[] = [];
  for (const r of records) {
    const v = m.get(r);
    if (typeof v === 'number' && Number.isFinite(v)) vals.push(v);
  }
  const last = vals.length ? m.fmt(vals[vals.length - 1]!) : '–';
  const best = vals.length ? m.fmt(m.lower ? Math.min(...vals) : Math.max(...vals)) : '';
  return `<div class="card"><div class="l">${m.label}</div><div class="v">${last}${best ? `<small>best ${best}</small>` : ''}</div>${trendSvg(vals, m.label)}</div>`;
}

function shortDate(at: number): string {
  const d = new Date(at);
  const p = (n: number) => (n < 10 ? '0' : '') + n;
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function statsHtml(history: RunRecord[], filter: number, perf: boolean): string {
  const byMode = (r: RunRecord) => filter === 0 || r.mode === filter;
  const runs = history.filter((r) => r.kind === 'run' && byMode(r));
  const rts = history.filter((r) => r.kind === 'rt' && byMode(r));
  const cps = history.filter((r) => r.kind === 'cps' && byMode(r));
  const n = (list: RunRecord[]) => `${list.length} session${list.length === 1 ? '' : 's'}`;
  const recent = runs.slice(-8).reverse();
  const table = recent.length
    ? `<h2>Recent climbs</h2><table>
    <tr><th>when</th><th>keys</th><th>score</th><th>height</th><th>time</th><th>median rt</th><th>peak</th></tr>
    ${recent
      .map(
        (r) =>
          `<tr><td>${shortDate(r.at)}</td><td>${r.mode}</td><td>${fmtInt(r.score ?? 0)}</td><td>${fmtInt(r.height ?? 0)} m</td><td>${fmtTime(r.time)}</td><td>${r.rt && r.rt.n ? r.rt.median.toFixed(0) : '–'}</td><td>${r.cps?.peak ?? '–'}</td></tr>`,
      )
      .join('')}
  </table>`
    : '';
  return `<section class="screen wide">
  <h1>STATS</h1>
  ${keySeg(filter, 'filter', true)}
  <h2>Climb <span>${n(runs)}${DOT}white line is the 5-session average</span></h2>
  <div class="grid">${RUN_METRICS.map((m) => card(m, runs)).join('')}</div>
  <h2>Reflex <span>${n(rts)}</span></h2>
  <div class="grid">${RT_METRICS.map((m) => card(m, rts)).join('')}</div>
  <h2>Burst <span>${n(cps)}</span></h2>
  <div class="grid">${CPS_METRICS.map((m) => card(m, cps)).join('')}</div>
  ${table}
  ${foot([
    ['Back', 'menu', 'esc'],
    ['Export JSON', 'export', ''],
    [`FPS overlay ${perf ? 'on' : 'off'}`, 'perf', '`'],
    ['Clear history', 'clear', ''],
  ])}
</section>`;
}

// --- Key rebinding ----------------------------------------------------------------

/** `listening` is the slot waiting for a key: "left:0", "right:1", "reflex", or "". */
export function keysHtml(s: Settings, keys: number, listening: string): string {
  const m = getMode(keys);
  const b = s.bindings[keys]!;
  const slot = (id: string, code: string) =>
    `<button class="slot${listening === id ? ' listen' : ''}" data-act="bind" data-arg="${id}">${listening === id ? 'press a key' : esc(keyLabel(code))}</button>`;
  let rows = `<span class="l">${m.right === 0 ? 'Key' : 'Left'}</span><div>${b.left.map((c, i) => slot(`left:${i}`, c)).join('')}</div>`;
  if (m.right > 0) rows += `<span class="l">Right</span><div>${b.right.map((c, i) => slot(`right:${i}`, c)).join('')}</div>`;
  if (m.reflex && b.reflex) rows += `<span class="l">Reflex</span><div>${slot('reflex', b.reflex)}</div>`;
  return `<section class="screen">
  <h1>KEYS</h1>
  ${keySeg(keys, 'bindmode')}
  <div class="slots">${rows}</div>
  <p class="muted">Click a key, then press the new one. Esc, Enter, Tab and \` are reserved.<br>Each key count keeps its own keys, shared by all three games.</p>
  ${foot([
    ['Back', 'menu', 'esc'],
    ['Reset these keys', 'resetkeys', ''],
  ])}
</section>`;
}
