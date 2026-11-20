// Small inline SVG charts for the results and stats screens. Grey and white
// only: the accent colour is reserved for the ball and the active cue.

import { COL_DIM, COL_LINE, COL_MID } from './config.ts';
import { movingAverage, type Histogram } from './stats.ts';

export function histogramSvg(h: Histogram, median: number): string {
  const W = 520;
  const H = 76;
  const base = H - 16;
  const n = h.counts.length;
  if (n === 0) return '';
  const peak = Math.max(1, ...h.counts);
  const bw = Math.min(22, W / n);
  const x0 = 0;
  let bars = '';
  for (let i = 0; i < n; i++) {
    const c = h.counts[i]!;
    if (c === 0) continue;
    const bh = Math.max(1.5, (c / peak) * (base - 6));
    bars += `<rect x="${(x0 + i * bw + 1).toFixed(1)}" y="${(base - bh).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${bh.toFixed(1)}" fill="${COL_MID}"/>`;
  }
  const mx = x0 + ((median - h.start) / h.bin) * bw;
  const end = h.start + n * h.bin;
  return (
    `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Reaction time histogram">` +
    `<line x1="${x0}" y1="${base + 0.5}" x2="${x0 + bw * n}" y2="${base + 0.5}" stroke="${COL_DIM}"/>` +
    bars +
    `<line x1="${mx.toFixed(1)}" y1="2" x2="${mx.toFixed(1)}" y2="${base}" stroke="${COL_LINE}"/>` +
    `<text x="${x0}" y="${H - 2}" fill="${COL_MID}" font-size="10">${h.start}</text>` +
    `<text x="${x0 + bw * n}" y="${H - 2}" fill="${COL_MID}" font-size="10" text-anchor="end">${end} ms</text>` +
    `</svg>`
  );
}

/** Raw values as a dim line, trailing moving average as the white trend line. */
export function trendSvg(values: readonly number[], label: string): string {
  const W = 260;
  const H = 46;
  const pad = 4;
  if (values.length < 2) {
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}: not enough sessions yet"><line x1="0" y1="${H - pad}" x2="${W}" y2="${H - pad}" stroke="${COL_DIM}"/></svg>`;
  }
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (hi - lo < 1e-9) {
    hi += 1;
    lo -= 1;
  }
  const x = (i: number) => (i / (values.length - 1)) * (W - pad * 2) + pad;
  const y = (v: number) => H - pad - ((v - lo) / (hi - lo)) * (H - pad * 2);
  const path = (vals: readonly number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('');
  const trend = movingAverage(values, 5);
  const last = values.length - 1;
  return (
    `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label} trend">` +
    `<path d="${path(values)}" fill="none" stroke="${COL_DIM}" stroke-width="1"/>` +
    `<path d="${path(trend)}" fill="none" stroke="${COL_LINE}" stroke-width="1.25"/>` +
    `<circle cx="${x(last).toFixed(1)}" cy="${y(trend[last]!).toFixed(1)}" r="2" fill="${COL_LINE}"/>` +
    `</svg>`
  );
}
