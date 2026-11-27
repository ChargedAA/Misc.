// Seventieth batch.
//   Lever    - two weights on a beam: click where the pivot must go to balance it.
//   Pictures - two grids of shapes, one cell different: click it.

import { COL_ACCENT, COL_DIM, COL_FAINT, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALSE, SND_TAP_WEAK } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, header, mean, median, ms, pct, scaled, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const TAU = Math.PI * 2;
const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const rint = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));

// --- Lever -----------------------------------------------------------------------------

const LEVER_ROUNDS = 12;

class Lever implements Mini {
  private env!: MiniEnv;
  private round = 0;
  /** Weights (kg) and where they hang along the beam (0..1). */
  private w: number[] = [];
  private pos: number[] = [];
  private truth = 0.5;
  private guess = -1;
  private hover = -1;
  private state = 0; // 0 choosing, 1 result
  private at = 0;
  private errs: number[] = [];
  private beam: [number, number, number] = [0, 1, 0];
  private firstAt = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.firstAt = now;
    this.arm();
  }

  private arm(): void {
    // Two weights at the ends first; a third joins after four.
    const n = this.round < 4 ? 2 : 3;
    this.w = Array.from({ length: n }, () => rint(1, 9));
    this.pos = n === 2 ? [0.04, 0.96] : [0.04, rnd(0.3, 0.7), 0.96];
    // The balance point is the weighted average of the positions.
    const tot = this.w.reduce((s, x) => s + x, 0);
    this.truth = this.w.reduce((s, x, k) => s + x * this.pos[k]!, 0) / tot;
    this.guess = -1;
    this.state = 0;
  }

  press(): void {}

  pointerMove(x: number): void {
    const [x0, x1] = this.beam;
    this.hover = Math.max(0, Math.min(1, (x - x0) / (x1 - x0)));
  }

  pointer(x: number, _y: number, ts: number): void {
    if (this.state !== 0) return;
    const [x0, x1] = this.beam;
    this.guess = Math.max(0, Math.min(1, (x - x0) / (x1 - x0)));
    const e = Math.abs(this.guess - this.truth);
    this.errs.push(e);
    this.env.sound(e < 0.02 ? SND_CATCH : e < 0.06 ? SND_TAP_WEAK : SND_FALSE);
    this.round++;
    this.state = 1;
    this.at = ts + 1800;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 1 && now >= this.at) {
      if (this.round >= scaled(LEVER_ROUNDS)) return true;
      this.arm();
    }
    if (now - this.firstAt > 600000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'off by', this.errs.length ? pct(mean(this.errs.slice(-3))) : '–', 'beam', `${Math.min(this.round + 1, scaled(LEVER_ROUNDS))} / ${scaled(LEVER_ROUNDS)}`);
    const W = Math.min(a.right - a.left - 60 * a.u, 680 * a.u);
    const x0 = a.cx - W / 2;
    const y = a.cy + 10 * a.u;
    this.beam = [x0, x0 + W, y];
    // When answered, tip the beam toward the heavy side of the guessed pivot.
    let tilt = 0;
    if (this.state === 1) tilt = Math.max(-0.25, Math.min(0.25, (this.truth - this.guess) * 3));
    const pivotAt = this.state === 1 ? this.guess : this.hover;
    const px = x0 + (pivotAt >= 0 ? pivotAt : 0.5) * W;
    ctx.save();
    ctx.translate(px, y);
    ctx.rotate(tilt);
    ctx.fillStyle = '#8a8a92';
    ctx.fillRect(x0 - px, -4 * dpr, W, 8 * dpr);
    // The weights, sized by mass, hanging under the beam.
    this.w.forEach((m, k) => {
      const wx = x0 + this.pos[k]! * W - px;
      const s = (16 + m * 4) * a.u;
      ctx.strokeStyle = COL_DIM;
      ctx.lineWidth = dpr;
      ctx.beginPath();
      ctx.moveTo(wx, 4 * dpr);
      ctx.lineTo(wx, 26 * a.u);
      ctx.stroke();
      ctx.fillStyle = COL_LINE;
      ctx.fillRect(wx - s / 2, 26 * a.u, s, s);
      ctx.fillStyle = '#111114';
      v.text(`${m}`, wx, 26 * a.u + s / 2 + 5 * dpr, v.fontTiny, 'center');
    });
    ctx.restore();
    // The pivot under the cursor, or where you put it, and the true point after.
    if (pivotAt >= 0) {
      ctx.fillStyle = this.state === 1 ? COL_ACCENT : COL_MID;
      ctx.beginPath();
      ctx.moveTo(px, y + 5 * dpr);
      ctx.lineTo(px + 14 * a.u, y + 30 * a.u);
      ctx.lineTo(px - 14 * a.u, y + 30 * a.u);
      ctx.closePath();
      ctx.fill();
    }
    if (this.state === 1) {
      const tx = x0 + this.truth * W;
      ctx.strokeStyle = COL_LINE;
      ctx.lineWidth = 2 * dpr;
      ctx.setLineDash?.([4 * dpr, 4 * dpr]);
      ctx.beginPath();
      ctx.moveTo(tx, y - 60 * a.u);
      ctx.lineTo(tx, y - 10 * a.u);
      ctx.stroke();
      ctx.setLineDash?.([]);
      ctx.fillStyle = COL_LINE;
      v.text('balance', tx, y - 68 * a.u, v.fontTiny, 'center');
    }
    ctx.fillStyle = COL_FAINT;
    ctx.fillRect(a.left, y + 30 * a.u, a.right - a.left, dpr);
    ctx.fillStyle = COL_MID;
    v.text(this.state === 1 ? `off by ${pct(this.errs[this.errs.length - 1]!)} of the beam` : 'click under the beam where the pivot must go for it to balance', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const m = mean(this.errs);
    return {
      score: this.errs.length ? Math.max(0, Math.round((0.2 - m) * 10000)) : 0,
      primary: { label: 'average miss', value: Math.round(m * 1000) / 10, unit: '% of the beam', lower: true, decimals: 1 },
      lines: [
        { label: 'average miss', value: this.errs.length ? `${(m * 100).toFixed(1)}% of the beam` : '–' },
        { label: 'within 2%', value: this.errs.length ? pct(this.errs.filter((e) => e < 0.02).length / this.errs.length) : '–' },
      ],
      saved: this.errs.length >= 3,
    };
  }
}

// --- Pictures (spot the difference) ----------------------------------------------------

const PIC_ROUNDS = 15;
const SHADES = [COL_LINE, '#8a8a92', COL_ACCENT];
type Cell = { s: number; c: number; r: number };

function drawCell(ctx: CanvasRenderingContext2D, t: Cell, x: number, y: number, r: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((t.r * Math.PI) / 2);
  ctx.fillStyle = SHADES[t.c]!;
  ctx.beginPath();
  if (t.s === 0) ctx.arc(0, 0, r, 0, TAU);
  else if (t.s === 1) ctx.rect(-r * 0.8, -r * 0.8, r * 1.6, r * 1.6);
  else if (t.s === 2) {
    ctx.moveTo(0, -r);
    ctx.lineTo(r, r * 0.8);
    ctx.lineTo(-r, r * 0.8);
    ctx.closePath();
  } else {
    // An L shape, whose turn shows.
    ctx.rect(-r * 0.8, -r * 0.8, r * 0.5, r * 1.6);
    ctx.rect(-r * 0.8, r * 0.3, r * 1.6, r * 0.5);
  }
  ctx.fill();
  ctx.restore();
}

class Pictures implements Mini {
  private env!: MiniEnv;
  private round = 0;
  private n = 4;
  private left: Cell[] = [];
  private right: Cell[] = [];
  private odd = 0;
  private shownAt = 0;
  private state = 0;
  private at = 0;
  private chosen = -1;
  private rects: { x: number; y: number; s: number }[] = [];
  private right_ = 0;
  private rts: number[] = [];
  private wrong = 0;
  private firstAt = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.firstAt = now;
    this.arm(now);
  }

  private arm(now: number): void {
    this.n = Math.min(7, 4 + Math.floor(this.round / 4));
    const N = this.n * this.n;
    this.left = Array.from({ length: N }, () => ({ s: rint(0, 3), c: rint(0, 2), r: rint(0, 3) }));
    this.right = this.left.map((c) => ({ ...c }));
    this.odd = rint(0, N - 1);
    const c = this.right[this.odd]!;
    // Change one thing: the shade, the shape, or the turn (only shapes that show a turn).
    const kind = rint(0, 2);
    if (kind === 0) c.c = (c.c + rint(1, 2)) % 3;
    else if (kind === 1) c.s = (c.s + rint(1, 3)) % 4;
    else if (c.s >= 2) c.r = (c.r + rint(1, 3)) % 4;
    else c.c = (c.c + 1) % 3;
    this.shownAt = now;
    this.state = 0;
    this.chosen = -1;
  }

  press(): void {}

  pointer(x: number, y: number, ts: number): void {
    if (this.state !== 0) return;
    // A click in either grid picks that cell.
    for (const g of [0, 1]) {
      const r = this.rects[g];
      if (!r) continue;
      const cs = r.s / this.n;
      const i = Math.floor((x - r.x) / cs);
      const j = Math.floor((y - r.y) / cs);
      if (i < 0 || j < 0 || i >= this.n || j >= this.n) continue;
      const k = j * this.n + i;
      this.chosen = k;
      if (k === this.odd) {
        this.right_++;
        this.rts.push(ts - this.shownAt);
        this.env.sound(SND_CATCH);
        this.round++;
        this.state = 1;
        this.at = ts + 700;
      } else {
        this.wrong++;
        this.env.sound(SND_FALSE);
        this.state = 2;
        this.at = ts + 500;
      }
      return;
    }
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 1 && now >= this.at) {
      if (this.round >= scaled(PIC_ROUNDS)) return true;
      this.arm(now);
    }
    // A wrong click just flashes, then you keep looking.
    if (this.state === 2 && now >= this.at) this.state = 0;
    if (this.state === 0 && now - this.shownAt > 60000) {
      this.round++;
      this.state = 1;
      this.at = now + 1200;
      this.chosen = this.odd;
    }
    if (now - this.firstAt > 900000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'typical find', this.rts.length ? ms(median(this.rts)) : '–', 'pair', `${Math.min(this.round + 1, scaled(PIC_ROUNDS))} / ${scaled(PIC_ROUNDS)}`);
    const S = Math.min((a.right - a.left) / 2 - 30 * a.u, a.bottom - a.top - 40 * a.u);
    const gap = 30 * a.u;
    this.rects = [0, 1].map((g) => ({ x: a.cx + (g ? gap / 2 : -gap / 2 - S), y: a.cy - S / 2 - 10 * a.u, s: S }));
    const cs = S / this.n;
    [this.left, this.right].forEach((cells, g) => {
      const r = this.rects[g]!;
      ctx.strokeStyle = COL_FAINT;
      ctx.lineWidth = dpr;
      ctx.strokeRect(r.x, r.y, r.s, r.s);
      cells.forEach((c, k) => {
        const cx = r.x + ((k % this.n) + 0.5) * cs;
        const cy = r.y + (Math.floor(k / this.n) + 0.5) * cs;
        drawCell(ctx, c, cx, cy, cs * 0.3);
        const mark = (this.state === 1 && k === this.odd) || (this.state === 2 && k === this.chosen);
        if (mark) {
          ctx.strokeStyle = this.state === 1 ? COL_LINE : COL_ACCENT;
          ctx.lineWidth = 2.5 * dpr;
          ctx.strokeRect(cx - cs * 0.45, cy - cs * 0.45, cs * 0.9, cs * 0.9);
        }
      });
    });
    ctx.fillStyle = COL_MID;
    v.text(this.round === 0 && this.state === 0 ? 'the two grids differ in one cell: its shade, shape or turn. click it in either grid' : `${this.wrong} wrong`, a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const m = median(this.rts);
    return {
      score: this.rts.length ? Math.max(0, Math.round(this.rts.length * Math.max(0, 15000 - m) / 60) - this.wrong * 20) : 0,
      primary: { label: 'typical time to find', value: m, unit: 'ms', lower: true },
      lines: [
        { label: 'found', value: `${this.right_} of ${this.round}` },
        { label: 'typical time to find', value: this.rts.length ? ms(m) : '–' },
        { label: 'wrong clicks', value: String(this.wrong) },
      ],
      saved: this.rts.length >= 3,
    };
  }
}

export const BATCH70: MiniDef[] = [
  { id: 'lever', name: 'Lever', skill: 'judgement', blurb: 'Weights on a beam. Click where the pivot must go to balance it.', how: 'A beam with weights hanging from it, each marked with its mass. Click under the beam where the pivot must sit for it to balance: nearer the heavier end, by the right amount. The beam then tips to show how far off you were. A third weight joins after four beams. Twelve beams.', input: 'pointer', make: () => new Lever() },
  { id: 'pictures', name: 'Pictures', skill: 'attention', blurb: 'Two grids of shapes, one cell different. Click it.', how: 'Two grids side by side, identical but for one cell: its shade, its shape, or which way it is turned. Click that cell in either grid. Wrong clicks count against you, and you keep looking. The grids grow from 4 by 4 to 7 by 7. Fifteen pairs.', input: 'pointer', make: () => new Pictures() },
];
