// DOM screens: menu, pause, results, stats, key rebinding. The game itself is
// drawn on the canvas; these only appear between runs, so plain HTML strings
// and one delegated click handler are enough.

import { MODES, getMode } from './config.ts';
import { histogramSvg, trendSvg } from './charts.ts';
import type { CpsStats, Histogram, RtStats } from './stats.ts';
import { keyLabel, type Bindings, type RunRecord, type Settings } from './storage.ts';

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
    items.map(([label, act, key]) => `<button data-act="${act}">${label}<span class="k">${key}</span></button>`).join('') +
    '</div>'
  );
}

function modeSeg(current: number, act: string, withAll = false): string {
  let h = `<div class="seg"><span class="lbl">Keys</span>`;
  if (withAll) h += `<button data-act="${act}" data-arg="0" aria-pressed="${current === 0}">all</button>`;
  for (const m of MODES) {
    h += `<button data-act="${act}" data-arg="${m.id}" aria-pressed="${m.id === current}">${m.id}</button>`;
  }
  return h + '</div>';
}

/** One-line description of what the keys of a mode do. */
export function modeHint(modeId: number, b: Bindings): string {
  const m = getMode(modeId);
  const left = b.left.map(kbd).join('');
  const right = b.right.map(kbd).join('');
  let h = m.right === 0 ? `${left} lifts the left end. The right end is fixed.` : `${left} lift left &nbsp; ${right} lift right`;
  if (m.reflex && b.reflex) h += ` &nbsp; ${kbd(b.reflex)} reflex`;
  if (m.left === 2) h += '<br>Alternate the two keys of a hand for full lift.';
  else if (m.left === 3) h += '<br>Roll the three keys of a hand for full lift.';
  else if (m.reflex) h += '<br>Hit reflex when a cable flashes.';
  else h += '<br>When a cable flashes, tap that side.';
  return h;
}

// --- Screens --------------------------------------------------------------------

export function menuHtml(s: Settings, best: RunRecord | null): string {
  const bestLine = best
    ? `<span class="l">best</span> ${fmtInt(best.score ?? 0)} &nbsp;·&nbsp; ${fmtInt(best.height ?? 0)} m`
    : '';
  return `<section class="screen">
  <h1>TENSION</h1>
  ${modeSeg(s.mode, 'mode')}
  <p class="hint">${modeHint(s.mode, s.bindings[s.mode]!)}${bestLine ? '<br>' + bestLine : ''}</p>
  <div class="rows">
    <button class="row" data-act="play">Play<span class="k">enter</span></button>
    <button class="row" data-act="rt">Reaction trainer<span class="k">r</span></button>
    <button class="row" data-act="cps">CPS trainer<span class="k">c</span></button>
    <button class="row" data-act="stats">Stats<span class="k">s</span></button>
    <button class="row" data-act="keys">Rebind keys<span class="k">k</span></button>
    <button class="row" data-act="mute">Sound ${s.muted ? 'off' : 'on'}<span class="k">0</span></button>
  </div>
</section>`;
}

export function pauseHtml(muted: boolean): string {
  return `<section class="screen">
  <h1>PAUSED</h1>
  <div class="rows">
    <button class="row" data-act="resume">Resume<span class="k">enter or a lift key</span></button>
    <button class="row" data-act="restart">Restart<span class="k">r</span></button>
    <button class="row" data-act="mute">Sound ${muted ? 'off' : 'on'}<span class="k">0</span></button>
    <button class="row" data-act="menu">Menu<span class="k">esc</span></button>
  </div>
</section>`;
}

function rtBlock(rt: RtStats, hist: Histogram, note: string): string {
  if (rt.n === 0) return `<h2>Reaction <span>${note}</span></h2><p class="muted">No reaction times logged.</p>`;
  return `<h2>Reaction <span>${note}</span></h2>
  <div class="line">
    <span><span class="l">avg</span>${rt.avg.toFixed(0)}</span>
    <span><span class="l">median</span>${rt.median.toFixed(0)}</span>
    <span><span class="l">best</span>${rt.best.toFixed(0)}</span>
    <span><span class="l">sd</span>${rt.sd.toFixed(0)}</span>
    <span class="muted">ms · n ${rt.n}</span>
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

export interface RunSummary {
  mode: number;
  score: number;
  height: number;
  time: number;
  rt: RtStats;
  hist: Histogram;
  cues: number;
  caught: number;
  falseStarts: number;
  pullsWon: number;
  pulls: number;
  cps: CpsStats;
  labels: string[];
  best: boolean;
}

export function resultsHtml(r: RunSummary): string {
  const note = [`${r.caught} of ${r.cues} caught`];
  if (r.falseStarts) note.push(`${r.falseStarts} false start${r.falseStarts === 1 ? '' : 's'}`);
  const pulls = r.pulls ? ` · ${r.pullsWon} of ${r.pulls} pulls held` : '';
  return `<section class="screen">
  <div class="big">
    <div class="stat"><div class="v">${fmtInt(r.score)}</div><div class="l">score${r.best ? ' · best' : ''}</div></div>
    <div class="stat"><div class="v">${fmtInt(r.height)} m</div><div class="l">height</div></div>
    <div class="stat"><div class="v">${fmtTime(r.time)}</div><div class="l">time</div></div>
  </div>
  ${rtBlock(r.rt, r.hist, note.join(' · ') + pulls)}
  ${cpsBlock(r.cps, r.labels, false)}
  ${foot([
    ['Again', 'play', 'enter'],
    ['Stats', 'stats', 's'],
    ['Menu', 'menu', 'esc'],
  ])}
</section>`;
}

export interface RtTrainSummary {
  rt: RtStats;
  hist: Histogram;
  hits: number;
  late: number;
  early: number;
  misses: number;
  window: number;
  time: number;
  saved: boolean;
}

export function rtResultsHtml(r: RtTrainSummary): string {
  const note = `${r.hits} in window · ${r.late + r.misses} late · ${r.early} early`;
  return `<section class="screen">
  <div class="big">
    <div class="stat"><div class="v">${r.rt.n ? r.rt.median.toFixed(0) + ' ms' : '–'}</div><div class="l">median</div></div>
    <div class="stat"><div class="v">${r.rt.n ? r.rt.best.toFixed(0) + ' ms' : '–'}</div><div class="l">best</div></div>
    <div class="stat"><div class="v">${r.window.toFixed(0)} ms</div><div class="l">window</div></div>
  </div>
  ${rtBlock(r.rt, r.hist, note)}
  ${r.saved ? '' : '<p class="muted">Sessions under 5 reactions are not saved.</p>'}
  ${foot([
    ['Again', 'rt', 'enter'],
    ['Stats', 'stats', 's'],
    ['Menu', 'menu', 'esc'],
  ])}
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
  ${foot([
    ['Again', 'cps', 'enter'],
    ['Stats', 'stats', 's'],
    ['Menu', 'menu', 'esc'],
  ])}
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
  { label: 'Trainer median', get: (r) => r.rt?.median, fmt: (v) => v.toFixed(0) + ' ms', lower: true },
  { label: 'Trainer window', get: (r) => r.window, fmt: (v) => v.toFixed(0) + ' ms', lower: true },
];

const CPS_METRICS: Metric[] = [
  { label: 'Trainer target held', get: (r) => r.target || undefined, fmt: (v) => v.toFixed(1) },
  { label: 'Trainer sustained 5 s', get: (r) => r.cps?.s5 || undefined, fmt: (v) => v.toFixed(1) },
  { label: 'Trainer repeats', get: (r) => r.cps?.repeatRate, fmt: pct, lower: true },
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

export function statsHtml(history: RunRecord[], filter: number): string {
  const byMode = (r: RunRecord) => filter === 0 || r.mode === filter;
  const runs = history.filter((r) => r.kind === 'run' && byMode(r));
  const rts = history.filter((r) => r.kind === 'rt');
  const cps = history.filter((r) => r.kind === 'cps' && byMode(r));
  const recent = runs.slice(-8).reverse();
  const table = recent.length
    ? `<h2>Recent runs</h2><table>
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
  ${modeSeg(filter, 'filter', true)}
  <h2>Runs <span>${runs.length} session${runs.length === 1 ? '' : 's'} · white line is the 5-session average</span></h2>
  <div class="grid">${RUN_METRICS.map((m) => card(m, runs)).join('')}</div>
  <h2>Training <span>${rts.length} reaction · ${cps.length} CPS</span></h2>
  <div class="grid">${RT_METRICS.map((m) => card(m, rts)).join('')}${CPS_METRICS.map((m) => card(m, cps)).join('')}</div>
  ${table}
  ${foot([
    ['Back', 'menu', 'esc'],
    ['Export JSON', 'export', ''],
    ['Clear history', 'clear', ''],
  ])}
</section>`;
}

// --- Key rebinding ----------------------------------------------------------------

/** `listening` is the slot waiting for a key: "left:0", "right:1", "reflex", or "". */
export function keysHtml(s: Settings, listening: string): string {
  const m = getMode(s.mode);
  const b = s.bindings[s.mode]!;
  const slot = (id: string, code: string) =>
    `<button class="slot${listening === id ? ' listen' : ''}" data-act="bind" data-arg="${id}">${listening === id ? 'press a key' : esc(keyLabel(code))}</button>`;
  let rows = `<span class="l">Left</span><div>${b.left.map((c, i) => slot(`left:${i}`, c)).join('')}</div>`;
  if (m.right > 0) rows += `<span class="l">Right</span><div>${b.right.map((c, i) => slot(`right:${i}`, c)).join('')}</div>`;
  if (m.reflex && b.reflex) rows += `<span class="l">Reflex</span><div>${slot('reflex', b.reflex)}</div>`;
  return `<section class="screen">
  <h1>KEYS</h1>
  ${modeSeg(s.mode, 'mode')}
  <div class="slots">${rows}</div>
  <p class="muted">Click a key, then press the new one. Esc, Enter, Tab and \` are reserved.</p>
  ${foot([
    ['Back', 'menu', 'esc'],
    ['Reset this mode', 'resetkeys', ''],
  ])}
</section>`;
}
