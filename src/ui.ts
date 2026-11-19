// DOM screens: title, the key-count pop-out, pause, results, stats, key
// rebinding. The games themselves are drawn on the canvas; these only appear
// between runs, so plain HTML strings and one delegated click handler are enough.

import { COL_DIM, COL_LINE, COL_MID, MODES, getMode } from './config.ts';
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
export const DOT = ' · ';

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

export function kbd(code: string): string {
  return `<kbd>${esc(keyLabel(code))}</kbd>`;
}

/** A row of buttons: label, action, key shown, and the key codes that press it. The first is the main one. */
function foot(items: [label: string, act: string, key: string, codes?: string][]): string {
  return (
    '<div class="foot">' +
    items
      .map(
        ([label, act, key, codes], i) =>
          `<button class="${i === 0 ? 'main' : ''}" data-act="${act}"${codes ? ` data-key="${codes}"` : ''}>${key ? `<span class="kb${key.length > 2 ? ' wide' : ''}">${key.toUpperCase()}</span>` : ''}${label}</button>`,
      )
      .join('') +
    '</div>'
  );
}

/** Bars for a handful of values, labelled underneath, with each value on top. */
function seriesSvg(s: NonNullable<MiniResult['series']>): string {
  const n = s.values.length;
  if (!n) return '';
  const W = 520;
  const H = 96;
  const max = Math.max(...s.values.filter((v) => Number.isFinite(v)), 1e-9);
  const bw = Math.min(26, (W / n) * 0.3);
  const step = W / n;
  const fmt = (v: number) => (Number.isFinite(v) && v > 0 ? (s.decimals ? v.toFixed(s.decimals) : String(Math.round(v))) : '\u2013');
  const bars = s.values
    .map((v, i) => {
      const h = Number.isFinite(v) ? Math.max(1, (v / max) * (H - 30)) : 0;
      const x = i * step + (step - bw) / 2;
      return `<rect x="${x.toFixed(1)}" y="${(H - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" fill="var(--line)" opacity="0.9"/><text x="${(x + bw / 2).toFixed(1)}" y="${(H - h - 6).toFixed(1)}" text-anchor="middle" fill="var(--line)" font-size="12">${fmt(v)}</text><text x="${(x + bw / 2).toFixed(1)}" y="${H + 16}" text-anchor="middle" fill="var(--mid)" font-size="11">${s.names[i] ?? ''}</text>`;
    })
    .join('');
  return `<figure class="series"><figcaption>${s.label}<span>${s.unit}${s.lower ? `${DOT}lower is better` : ''}</span></figcaption><svg viewBox="0 -4 ${W} ${H + 24}" role="img" aria-label="${s.label}">${bars}</svg></figure>`;
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

export function bestLine(game: GameId, best: RunRecord | null): string {
  if (!best) return '';
  if (game === 'climb') return `<span class="l">best</span>${fmtInt(best.score ?? 0)}${DOT}${fmtInt(best.height ?? 0)} m`;
  if (game === 'reflex') return `<span class="l">best</span>${fmtInt(best.score ?? 0)}${DOT}round ${best.rounds ?? 0}`;
  if (game === 'burst') return `<span class="l">best</span>${(best.target ?? 0).toFixed(1)} taps/s held`;
  const v = best.value;
  return `<span class="l">best</span>${fmtInt(best.score ?? 0)}${v !== undefined && best.vlabel ? `${DOT}${best.vlabel} ${fmtPrimary(v, { label: best.vlabel, value: v, unit: best.unit ?? '', decimals: best.decimals })}` : ''}`;
}

export function fmtPrimary(v: number, p: MiniResult['primary']): string {
  const n = p.decimals ? v.toFixed(p.decimals) : fmtInt(v);
  return p.unit ? `${n}${p.unit === '%' || p.unit.startsWith('-') ? '' : ' '}${p.unit}` : n;
}

export function keysLine(keys: number, b: Bindings): string {
  const m = getMode(keys);
  let h = `${b.left.map(kbd).join('')}${m.right ? ' &nbsp; ' + b.right.map(kbd).join('') : ''}`;
  if (m.reflex && b.reflex) h += ` &nbsp; ${kbd(b.reflex)}`;
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

const AGAIN: [string, string, string, string][] = [
  ['Again', 'again', 'z', 'KeyZ Enter'],
  ['Game stats', 'gamestats', 'x', 'KeyX'],
  ['Back', 'menu', 'c', 'KeyC Escape Backspace'],
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

export interface DailyStep {
  /** 1-based number of the game just played, and how many in the set. */
  index: number;
  total: number;
  nextName: string | null;
  /** 'Daily set', or the name of a skill set. */
  label: string;
  /** A practice run: shown, not saved. */
  practice?: boolean;
}

export interface Compare {
  /** The tracked number last time and at its best, if there were earlier sessions. */
  last: number | null;
  best: number | null;
  /** The tracked number in recent earlier sessions, oldest first. */
  recent?: number[];
}

/** This session against the last few: a row of dots on one scale, the newest picked out. */
function recentSvg(p: MiniResult['primary'], prev: readonly number[]): string {
  const vals = [...prev, p.value];
  const W = 320;
  const H = 54;
  const pad = 8;
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (hi - lo < 1e-9) {
    hi += 1;
    lo -= 1;
  }
  // Better is always up, whichever way the number runs.
  const y = (v: number) => {
    const t = (v - lo) / (hi - lo);
    return pad + (p.lower ? t : 1 - t) * (H - pad * 2);
  };
  const x = (i: number) => pad + (i / Math.max(1, vals.length - 1)) * (W - pad * 2);
  const line = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('');
  const last = vals.length - 1;
  const dots = vals
    .map((v, i) => (i === last ? '' : `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2" fill="${COL_MID}"/>`))
    .join('');
  return `<figure class="recent"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="this session against the last ${prev.length}"><path d="${line}" fill="none" stroke="${COL_DIM}" stroke-width="1"/>${dots}<circle cx="${x(last).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="4" fill="${COL_LINE}"/></svg><figcaption>this session against the last ${prev.length}${DOT}better is up</figcaption></figure>`;
}

/** "12 ms better than last time" style comparison for the tracked number. */
function compareLine(p: MiniResult['primary'], c: Compare | null): string {
  if (!c || (c.last === null && c.best === null)) return '<p class="cmp">First time: this result is your baseline.</p>';
  // A change in a percentage is in points: 16% to 10% is 6 points, not 6%.
  const fmt = (v: number) => (p.unit === '%' ? `${Math.abs(v).toFixed(p.decimals ?? 0)} points` : fmtPrimary(Math.abs(v), { ...p, value: Math.abs(v) }));
  const parts: string[] = [];
  let tone = '';
  if (c.last !== null) {
    const d = p.value - c.last;
    if (Math.abs(d) < 1e-9) parts.push('same as last time');
    else {
      const better = p.lower ? d < 0 : d > 0;
      tone = better ? 'up' : 'down';
      parts.push(`${better ? '\u25b2' : '\u25bc'} ${fmt(d)} ${better ? 'better' : 'worse'} than last time`);
    }
  }
  if (c.best !== null) {
    const beat = p.lower ? p.value < c.best : p.value > c.best;
    if (beat) tone = 'best';
    parts.push(beat ? `new best, was ${fmtPrimary(c.best, { ...p, value: c.best })}` : `best ${fmtPrimary(c.best, { ...p, value: c.best })}`);
  }
  return `<p class="cmp ${tone}">${parts.join(DOT)}</p>`;
}

export function miniResultsHtml(
  id: string,
  r: MiniResult,
  hist: Histogram | null,
  rtMedian: number,
  best: boolean,
  daily: DailyStep | null = null,
  cmp: Compare | null = null,
): string {
  const p = r.primary;
  const e = entry(id);
  const skill = SKILLS.find((k) => k.id === e?.skill)?.name ?? '';
  const actions: [string, string, string, string][] = daily?.practice
    ? [
        ['Practise again', 'practiceagain', 'z', 'KeyZ Enter'],
        ['Play it for real', 'forreal', 'x', 'KeyX'],
        ['Back', 'menu', 'c', 'KeyC Escape Backspace'],
      ]
    : daily
    ? daily.nextName
      ? [
          [`Next: ${daily.nextName}`, 'dailynext', 'z', 'KeyZ Enter'],
          ['Game stats', 'gamestats', 'x', 'KeyX'],
          [daily.total ? 'Stop the set' : 'End the run', 'endrun', 'c', 'KeyC Escape Backspace'],
        ]
      : [
          [daily.label === 'Daily set' ? 'See the day' : 'See the set', 'dailynext', 'z', 'KeyZ Enter'],
          ['Game stats', 'gamestats', 'x', 'KeyX'],
        ]
    : AGAIN;
  // Lower-is-better numbers are never really zero: zero means it was not measured.
  const measured = Number.isFinite(p.value) && (p.zeroOk || !(p.lower && p.value <= 0));
  const practice = !!daily?.practice;
  const value = (r.saved || practice) && measured ? fmtPrimary(p.value, p) : '\u2013';
  // Split the unit off so the number can be large and the unit small.
  const m = /^(.*?)(\s?[^\d\s\u2013.,-][^\d]*)?$/.exec(value);
  const num = m?.[1] && m[2] ? m[1] : value;
  const unit = m?.[1] && m[2] ? m[2].trim() : '';
  return `<section class="screen result">
  <p class="rpos">${skill}${daily?.practice ? `${DOT}practice` : daily ? `${DOT}${daily.label} ${daily.index}${daily.total ? ` of ${daily.total}` : ''}` : ''}</p>
  <h1>${(e?.name ?? id).toUpperCase()}</h1>
  <div class="hero-num"><span class="n">${num}</span>${unit ? `<span class="u">${unit}</span>` : ''}</div>
  <p class="hero-label">${p.label}<span>${p.lower ? 'lower is better' : 'higher is better'}</span></p>
  ${practice ? '<p class="cmp">Practice: not saved, and no effect on bests or the streak.</p>' : r.saved ? compareLine(p, cmp) : '<p class="warn">Too short to count: nothing was scored or saved. Play it through to get a result.</p>'}
  ${r.saved && measured && cmp?.recent && cmp.recent.length >= 2 ? recentSvg(p, cmp.recent) : ''}
  ${r.saved && r.series ? seriesSvg(r.series) : ''}
  <table>${r.saved ? `<tr><td>score</td><td>${fmtInt(r.score)}${best ? `${DOT}personal best` : ''}</td></tr>` : ''}${r.lines.map((l) => `<tr><td>${l.label}</td><td>${l.value}</td></tr>`).join('')}</table>
  ${hist && hist.counts.length ? `<h2>Reaction times <span>median ${Math.round(rtMedian)} ms</span></h2>${histogramSvg(hist, rtMedian)}` : ''}
  ${foot(actions)}
</section>`;
}

export interface DailyRow {
  id: string;
  name: string;
  skill: string;
  score: number;
  primary: string;
  best: boolean;
  /** False when the stage was too short to count. */
  saved: boolean;
  /** Key count it was played with, for a retry. */
  keys?: number;
  /** Against your recent average on the headline number: +0.1 is 10% better, -0.1 10% worse. */
  vsUsual?: number;
  /** Skipped from the ready screen without playing. */
  skipped?: boolean;
}

export function dailySummaryHtml(rows: DailyRow[], total: number, bestTotal: number, label = 'Daily set'): string {
  const daily = label === 'Daily set';
  const done = rows.filter((r) => r.saved).length;
  const pctOf = (v: number) => `${Math.round(Math.abs(v) * 100)}%`;
  const vs = (r: DailyRow) => (r.vsUsual === undefined ? '' : Math.abs(r.vsUsual) < 0.03 ? 'usual' : `${r.vsUsual > 0 ? '\u25b2' : '\u25bc'} ${pctOf(r.vsUsual)}`);
  // The weakest drill against your own recent average: worth one more go while it is fresh.
  const judged = rows.filter((r) => r.saved && r.vsUsual !== undefined);
  const worst = judged.length ? judged.reduce((a, b) => (b.vsUsual! < a.vsUsual! ? b : a)) : null;
  const retry = worst && worst.vsUsual! <= -0.05 ? worst : null;
  const actions: [string, string, string, string][] = retry
    ? [
        [`Retry ${retry.name}`, 'play', 'z', 'KeyZ Enter', ],
        ['Back', 'menu', 'x', 'KeyX Escape Backspace'],
      ]
    : [['Back', 'menu', 'z', 'KeyZ Enter Escape Backspace']];
  const foots = foot(actions).replace('data-act="play"', `data-act="play" data-arg="${retry ? `${retry.id}:${retry.keys ?? 2}` : ''}"`);
  return `<section class="screen">
  <p class="rpos">${label}${DOT}done</p>
  <div class="big">
    <div class="stat"><div class="v">${done ? fmtInt(total) : '\u2013'}</div><div class="l">${daily ? 'today' : 'total score'}${daily && done && total >= bestTotal && total > 0 ? `${DOT}best day` : ''}</div></div>
    <div class="stat"><div class="v">${done} / ${rows.length}</div><div class="l">completed</div></div>
    <div class="stat"><div class="v">${rows.filter((r) => r.best).length}</div><div class="l">personal bests</div></div>
  </div>
  ${retry ? `<p class="cmp down">Furthest below your usual: ${retry.name}, ${pctOf(retry.vsUsual!)} worse than your recent average. One more go while it is fresh?</p>` : judged.length && worst ? `<p class="cmp up">Everything at or above your usual today.</p>` : ''}
  <table>
    <tr><th></th><th>skill</th><th>result</th><th>vs usual</th><th>score</th></tr>
    ${rows
      .map(
        (r) =>
          `<tr${r.saved ? '' : ' class="dim"'}><td><button class="lnk" data-act="gamestats" data-arg="${r.id}">${r.name}</button>${r.best ? ' \u00b7 best' : ''}</td><td>${SKILLS.find((k) => k.id === r.skill)?.name ?? r.skill}</td><td>${r.saved ? r.primary : r.skipped ? 'skipped' : 'incomplete: too short to count'}</td><td>${r.saved ? vs(r) || '\u2013' : '\u2013'}</td><td>${r.saved ? fmtInt(r.score) : '\u2013'}</td></tr>`,
      )
      .join('')}
  </table>
  ${done < rows.length ? `<p class="muted">Incomplete stages score nothing and are not saved.${daily && !done ? ' Nothing counted, so today does not count toward your streak.' : ''}</p>` : ''}
  <p class="muted">${judged.length < done ? '"vs usual" needs three earlier sessions of a game. ' : ''}${daily ? 'The set changes every day. Same games for everyone on a given date.' : label === 'Endless run' ? 'Random games until you stop.' : 'A fresh draw every time.'}</p>
  ${foots}
</section>`;
}

export interface ReadyInfo {
  label: string;
  index: number;
  /** 0 for a run with no fixed end. */
  total: number;
  name: string;
  skill: string;
  blurb: string;
  how: string;
  controls: string;
  length: string;
}

/** The card before each drill of a set. */
export function readyHtml(r: ReadyInfo): string {
  return `<section class="screen ready">
  <p class="rpos">${r.label}${DOT}${r.total ? `${r.index} of ${r.total}` : `drill ${r.index}`}</p>
  <h1>${r.name.toUpperCase()}</h1>
  <p class="msub">${r.skill}</p>
  <p class="mblurb">${r.blurb}</p>
  <dl class="facts">
    ${r.how ? `<dt>How</dt><dd>${r.how}</dd>` : ''}
    <dt>Controls</dt><dd>${r.controls}</dd>
    <dt>Length</dt><dd>${r.length}</dd>
  </dl>
  ${foot([
    ['Start', 'readygo', 'space', 'Space Enter KeyZ'],
    ['Skip this one', 'skip', 'x', 'KeyX'],
    [r.total ? 'Stop the set' : 'End the run', 'endrun', 'esc', 'Escape Backspace'],
  ])}
</section>`;
}

export function formatPrimary(p: MiniResult['primary']): string {
  return fmtPrimary(p.value, p);
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

export interface Metric {
  label: string;
  get: (r: RunRecord) => number | undefined;
  fmt: (v: number) => string;
  /** Which direction counts as "best". */
  lower?: boolean;
}

export const RUN_METRICS: Metric[] = [
  { label: 'Score', get: (r) => r.score, fmt: fmtInt },
  { label: 'Height', get: (r) => r.height, fmt: (v) => fmtInt(v) + ' m' },
  { label: 'Survival', get: (r) => r.time, fmt: fmtTime },
  { label: 'Median reaction', get: (r) => (r.rt && r.rt.n ? r.rt.median : undefined), fmt: (v) => v.toFixed(0) + ' ms', lower: true },
  { label: 'Peak CPS', get: (r) => r.cps?.peak || undefined, fmt: (v) => v.toFixed(0) },
  { label: 'Sustained 5 s', get: (r) => r.cps?.s5 || undefined, fmt: (v) => v.toFixed(1) },
];

export const RT_METRICS: Metric[] = [
  { label: 'Median reaction', get: (r) => (r.rt && r.rt.n ? r.rt.median : undefined), fmt: (v) => v.toFixed(0) + ' ms', lower: true },
  { label: 'Correct', get: (r) => r.accuracy, fmt: pct },
  { label: 'Rounds cleared', get: (r) => r.rounds, fmt: (v) => v.toFixed(0) },
  { label: 'Window', get: (r) => r.window, fmt: (v) => v.toFixed(0) + ' ms', lower: true },
];

export const CPS_METRICS: Metric[] = [
  { label: 'Target held', get: (r) => r.target || undefined, fmt: (v) => v.toFixed(1) },
  { label: 'Sustained 5 s', get: (r) => r.cps?.s5 || undefined, fmt: (v) => v.toFixed(1) },
  { label: 'Peak CPS', get: (r) => r.cps?.peak || undefined, fmt: (v) => v.toFixed(0) },
  { label: 'Repeats', get: (r) => r.cps?.repeatRate, fmt: pct, lower: true },
];

export function card(m: Metric, records: RunRecord[]): string {
  const vals: number[] = [];
  for (const r of records) {
    const v = m.get(r);
    if (typeof v === 'number' && Number.isFinite(v)) vals.push(v);
  }
  const last = vals.length ? m.fmt(vals[vals.length - 1]!) : '–';
  const best = vals.length ? m.fmt(m.lower ? Math.min(...vals) : Math.max(...vals)) : '';
  return `<div class="card"><div class="l">${m.label}</div><div class="v">${last}${best ? `<small>best ${best}</small>` : ''}</div>${trendSvg(vals, m.label)}</div>`;
}

export function shortDate(at: number): string {
  const d = new Date(at);
  const p = (n: number) => (n < 10 ? '0' : '') + n;
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** One trend card per mini-game, grouped by skill, using each game's tracked number. */
const DAY = 86400000;

function dayKey(t: number): number {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Which skill a history record belongs to. */
function skillOf(r: RunRecord): string | null {
  const id = r.kind === 'run' ? 'climb' : r.kind === 'rt' ? 'reflex' : r.kind === 'cps' ? 'burst' : (r.game ?? '');
  return entry(id)?.skill ?? null;
}

/** Days in a row, ending today or yesterday, with at least one session. */
export function streak(history: RunRecord[], now = Date.now()): number {
  const days = new Set(history.map((r) => dayKey(r.at)));
  let d = dayKey(now);
  if (!days.has(d)) d -= DAY;
  let n = 0;
  // Step back a day at a time (dayKey copes with daylight-saving shifts).
  while (days.has(d)) {
    n++;
    d = dayKey(d - DAY / 2);
  }
  return n;
}

/** Sessions per skill in the last seven days. */
export function weekBySkill(history: RunRecord[], now = Date.now()): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of history) {
    if (r.game === 'daily' || now - r.at >= 7 * DAY) continue;
    const sk = skillOf(r);
    if (sk) out[sk] = (out[sk] ?? 0) + 1;
  }
  return out;
}

export function overview(history: RunRecord[]): string {
  const now = Date.now();
  const week = history.filter((r) => now - r.at < 7 * DAY && r.game !== 'daily');
  const rows = SKILLS.map((sk) => {
    const all = history.filter((r) => r.game !== 'daily' && skillOf(r) === sk.id);
    const w = week.filter((r) => skillOf(r) === sk.id).length;
    const games = ENTRIES.filter((e) => e.skill === sk.id);
    const tried = new Set(all.map((r) => (r.kind === 'mini' ? r.game : skillOf(r) && r.kind))).size;
    const last = all.length ? all[all.length - 1]!.at : 0;
    return { sk, w, total: all.length, tried: Math.min(tried, games.length), of: games.length, last };
  });
  const most = Math.max(1, ...rows.map((r) => r.w));
  const quiet = [...rows].sort((p, q) => p.w - q.w || p.last - q.last)[0]!;
  const st = streak(history, now);
  return `<div class="big">
    <div class="stat"><div class="v">${st}</div><div class="l">day streak</div></div>
    <div class="stat"><div class="v">${week.length}</div><div class="l">sessions this week</div></div>
    <div class="stat"><div class="v">${history.filter((r) => r.game !== 'daily').length}</div><div class="l">sessions in all</div></div>
  </div>
  <h2>Skills <span>this week${history.length ? `${DOT}least trained: ${quiet.sk.name.toLowerCase()}` : ''}</span></h2>
  <table class="skilltab">
    <tr><th>skill</th><th>this week</th><th></th><th>games tried</th><th>last</th></tr>
    ${rows
      .map(
        (r) =>
          `<tr><td>${r.sk.name}</td><td>${r.w}</td><td class="bar"><span style="width:${Math.round((r.w / most) * 100)}%"></span></td><td>${r.tried} / ${r.of}</td><td>${r.last ? shortDate(r.last) : '\u2013'}</td></tr>`,
      )
      .join('')}
  </table>`;
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
  <p class="muted">Click a key, then press the new one. Esc, Enter, Tab and \` are reserved.<br>Each key count keeps its own keys, used by every drill. Menus always use Z X C V B N M and their neighbours.</p>
  ${foot([
    ['Back', 'menu', 'esc', 'Escape Backspace'],
    ['Reset these keys', 'resetkeys', ''],
  ])}
</section>`;
}
