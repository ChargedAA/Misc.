// Sixty-first batch.
//   Missing - a run of beats with one left out. Which beat was missing?
//   Clicker - click as fast as you can for ten seconds.
//   Newest  - things gather on the board one at a time: which one is new?
//   Circle  - draw a circle freehand around the dot, as round as you can.

import { COL_ACCENT, COL_DIM, COL_LINE, COL_MID } from '../config.ts';
import { SND_BEAT, SND_CATCH, SND_FALSE, SND_TAP_WEAK } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, header, mean, median, pct, scaled, shuffle, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const TAU = Math.PI * 2;
const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const rint = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
type Rect = [number, number, number, number];
const inside = (r: Rect, x: number, y: number) => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
const digitOf = (code: string) => (code.startsWith('Digit') ? code.slice(5) : code.startsWith('Numpad') ? code.slice(6) : '');

// --- Missing (which beat dropped out) --------------------------------------------------

const MISSING_TRIALS = 16;
const BEATS = 8;

class Missing implements Mini {
  private env!: MiniEnv;
  private trial = 0;
  private gap = 0;
  private ioi = 450;
  private t0 = 0;
  /** 0 pause, 1 playing, 2 answer, 3 feedback. */
  private state = 0;
  private at = 0;
  private visual = false;
  private boxes: Rect[] = [];
  private chosen = -1;
  private right = 0;
  private streak = 0;
  private fastest = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.visual = env.muted || !env.soundAt;
    this.at = now + 800;
  }

  private play(now: number): void {
    this.gap = rint(1, BEATS - 2);
    this.t0 = now + 150;
    if (!this.visual) for (let k = 0; k < BEATS; k++) if (k !== this.gap) this.env.soundAt!(SND_BEAT, 150 + k * this.ioi);
    this.state = 1;
    this.chosen = -1;
  }

  press(): void {}

  private pick(k: number, ts: number): void {
    if (this.state !== 2) return;
    this.chosen = k;
    const ok = k === this.gap;
    if (ok) {
      this.right++;
      this.fastest = Math.max(this.fastest, Math.round(60000 / this.ioi));
      if (++this.streak % 2 === 0) this.ioi = Math.max(140, this.ioi * 0.85);
    } else {
      this.streak = 0;
      this.ioi = Math.min(500, this.ioi * 1.12);
    }
    this.env.sound(ok ? SND_CATCH : SND_FALSE);
    this.trial++;
    this.state = 3;
    this.at = ts + (ok ? 800 : 1500);
  }

  typeKey(code: string, ts: number): boolean {
    const d = Number(digitOf(code));
    if (d >= 1 && d <= BEATS) {
      this.pick(d - 1, ts);
      return true;
    }
    return false;
  }

  pointer(x: number, y: number, ts: number): void {
    const k = this.boxes.findIndex((r) => inside(r, x, y));
    if (k >= 0) this.pick(k, ts);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.at) this.play(now);
    else if (this.state === 1 && now > this.t0 + BEATS * this.ioi) this.state = 2;
    else if (this.state === 3 && now >= this.at) {
      if (this.trial >= scaled(MISSING_TRIALS)) return true;
      this.state = 0;
      this.at = now + 500;
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'tempo', `${Math.round(60000 / this.ioi)} bpm`, 'run', `${Math.min(this.trial + 1, scaled(MISSING_TRIALS))} / ${scaled(MISSING_TRIALS)}`);
    const bw = Math.min(54 * a.u, (a.right - a.left) / (BEATS + 1));
    this.boxes = Array.from({ length: BEATS }, (_, k) => [a.cx + (k - BEATS / 2) * bw + 4 * dpr, a.cy - bw / 2, bw - 8 * dpr, bw] as Rect);
    this.boxes.forEach(([x, y, w, h], k) => {
      const t = this.t0 + k * this.ioi;
      // With sound off the beats flash; with it on the boxes stay blank, so only the ear can tell.
      const flash = this.visual && this.state === 1 && k !== this.gap && now >= t && now < t + 100;
      const show = this.state === 3;
      ctx.strokeStyle = show && k === this.gap ? COL_LINE : show && k === this.chosen ? COL_ACCENT : COL_DIM;
      ctx.lineWidth = (show && (k === this.gap || k === this.chosen) ? 2.5 : 1.5) * dpr;
      ctx.strokeRect(x, y, w, h);
      if (flash) {
        ctx.fillStyle = COL_LINE;
        ctx.fillRect(x + 4 * dpr, y + 4 * dpr, w - 8 * dpr, h - 8 * dpr);
      }
      ctx.fillStyle = COL_MID;
      v.text(String(k + 1), x + w / 2, y + h + 18 * a.u, v.fontTiny, 'center');
    });
    ctx.fillStyle = this.state === 2 ? COL_LINE : COL_MID;
    v.text(this.state === 1 ? (this.visual ? 'watch: one beat will not flash (sound is off)' : 'listen: one of the eight beats is missing') : this.state === 2 ? 'which beat was missing? press its number' : '', a.cx, a.cy - bw - 20 * a.u, v.fontHud, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.right * 60 + this.fastest * 2,
      primary: { label: 'gaps placed right', value: this.right, unit: `of ${this.trial}` },
      lines: [
        { label: 'right', value: `${this.right} of ${this.trial}` },
        { label: 'fastest tempo placed right', value: this.fastest ? `${this.fastest} bpm` : '–' },
        ...(this.visual ? [{ label: 'note', value: 'played with sound off, by eye' }] : []),
      ],
      saved: this.trial >= 5,
    };
  }
}

// --- Clicker ---------------------------------------------------------------------------

const CLICKER_MS = 10000;

class Clicker implements Mini {
  private env!: MiniEnv;
  private clicks: number[] = [];
  private outside = 0;
  private t0 = 0;
  private started = false;
  private pad: Rect = [0, 0, 1, 1];
  private flash = 0;
  private firstFrame = 0;

  start(env: MiniEnv): void {
    this.env = env;
  }

  press(): void {}

  pointer(x: number, y: number, ts: number): void {
    if (!inside(this.pad, x, y)) {
      if (this.started) this.outside++;
      return;
    }
    if (!this.started) {
      this.started = true;
      this.t0 = ts;
    }
    if (ts - this.t0 >= scaled(CLICKER_MS)) return;
    this.clicks.push(ts);
    this.flash = ts + 50;
    if (this.clicks.length % 10 === 0) this.env.sound(SND_TAP_WEAK);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    const len = scaled(CLICKER_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const left = this.started ? Math.max(0, (len - (now - this.t0)) / 1000) : len / 1000;
    const el = this.started ? Math.max(0.25, (now - this.t0) / 1000) : 0;
    header(v, touch, 'clicks', String(this.clicks.length), 'time', `${left.toFixed(1)} s`);
    const s = Math.min(260 * a.u, (a.bottom - a.top) * 0.6);
    this.pad = [a.cx - s / 2, a.cy - s / 2 - 10 * a.u, s, s];
    ctx.fillStyle = now < this.flash ? '#2a2a30' : '#18181c';
    ctx.fillRect(...this.pad);
    ctx.strokeStyle = COL_DIM;
    ctx.lineWidth = 2 * dpr;
    ctx.strokeRect(...this.pad);
    ctx.font = `600 ${Math.round(56 * a.u)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COL_LINE;
    ctx.fillText(this.started ? (this.clicks.length / el).toFixed(1) : 'click', a.cx, a.cy - 10 * a.u);
    ctx.fillStyle = COL_MID;
    v.text(this.started ? 'clicks a second' : 'click the square as fast as you can; the clock starts on the first click. ten seconds', a.cx, this.started ? a.cy + 30 * a.u : a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const n = this.clicks.length;
    const secs = scaled(CLICKER_MS) / 1000;
    const cps = n / secs;
    // How steady the rate held: the second half against the first.
    const half = this.t0 + scaled(CLICKER_MS) / 2;
    const first = this.clicks.filter((t) => t < half).length;
    const second = n - first;
    return {
      score: Math.max(0, Math.round(cps * 100) - this.outside * 5),
      primary: { label: 'clicks a second', value: Number(cps.toFixed(1)), unit: '/s', decimals: 1 },
      lines: [
        { label: 'clicks', value: String(n) },
        { label: 'clicks a second', value: cps.toFixed(1) },
        { label: 'second half against first', value: first ? pct(second / first) : '–' },
        { label: 'clicks off the square', value: String(this.outside) },
      ],
      saved: n >= 10,
    };
  }
}

// --- Newest (which one is new?) --------------------------------------------------------

const NEWEST_LIVES = 3;
const SHAPES = 8;
const SHADES = [COL_LINE, '#8a8a92', COL_ACCENT];
type Thing = { s: number; c: number };

function drawThing(ctx: CanvasRenderingContext2D, t: Thing, x: number, y: number, r: number, lw: number): void {
  ctx.fillStyle = SHADES[t.c]!;
  ctx.strokeStyle = SHADES[t.c]!;
  ctx.lineWidth = lw;
  ctx.beginPath();
  switch (t.s) {
    case 0:
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
      break;
    case 1:
      ctx.fillRect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7);
      break;
    case 2:
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y + r * 0.8);
      ctx.lineTo(x - r, y + r * 0.8);
      ctx.closePath();
      ctx.fill();
      break;
    case 3:
      ctx.arc(x, y, r * 0.85, 0, TAU);
      ctx.stroke();
      break;
    case 4:
      ctx.moveTo(x - r, y - r);
      ctx.lineTo(x + r, y + r);
      ctx.moveTo(x + r, y - r);
      ctx.lineTo(x - r, y + r);
      ctx.stroke();
      break;
    case 5:
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r * 0.75, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r * 0.75, y);
      ctx.closePath();
      ctx.fill();
      break;
    case 6:
      ctx.fillRect(x - r, y - r * 0.25, 2 * r, r * 0.5);
      ctx.fillRect(x - r * 0.25, y - r, r * 0.5, 2 * r);
      break;
    default:
      ctx.strokeRect(x - r * 0.8, y - r * 0.8, r * 1.6, r * 1.6);
  }
}

class Newest implements Mini {
  private env!: MiniEnv;
  private pool: Thing[] = [];
  private shown: Thing[] = [];
  private spots: [number, number][] = [];
  private newIdx = 0;
  private lives = NEWEST_LIVES;
  private state = 0; // 0 choose, 1 feedback
  private at = 0;
  private chosen = -1;
  private best = 0;
  private rounds = 0;
  private right = 0;
  private field: Rect = [0, 0, 1, 1];
  private firstAt = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.firstAt = now;
    const all: Thing[] = [];
    for (let s = 0; s < SHAPES; s++) for (let c = 0; c < SHADES.length; c++) all.push({ s, c });
    this.pool = shuffle(all);
    this.shown = [this.pool.pop()!];
    this.next();
  }

  private next(): void {
    this.shown.push(this.pool.pop()!);
    // Every round the whole board is rearranged, so place gives nothing away.
    const order = shuffle(this.shown.map((_, k) => k));
    this.newIdx = order.indexOf(this.shown.length - 1);
    this.shown = order.map((k) => this.shown[k]!);
    this.spots = [];
    for (let tries = 0; this.spots.length < this.shown.length && tries < 4000; tries++) {
      const p: [number, number] = [rnd(0.06, 0.94), rnd(0.08, 0.92)];
      if (this.spots.every((q) => Math.hypot((q[0] - p[0]) * 1.6, q[1] - p[1]) > 0.17)) this.spots.push(p);
    }
    while (this.spots.length < this.shown.length) this.spots.push([rnd(0.06, 0.94), rnd(0.08, 0.92)]);
    this.state = 0;
    this.chosen = -1;
  }

  press(): void {}

  pointer(x: number, y: number, ts: number): void {
    if (this.state !== 0) return;
    const [fx, fy, fw, fh] = this.field;
    const k = this.spots.findIndex(([sx, sy]) => Math.hypot(fx + sx * fw - x, fy + sy * fh - y) < fh * 0.06);
    if (k < 0) return;
    this.chosen = k;
    const ok = k === this.newIdx;
    this.rounds++;
    if (ok) {
      this.right++;
      this.best = Math.max(this.best, this.shown.length);
    } else this.lives--;
    this.env.sound(ok ? SND_CATCH : SND_FALSE);
    this.state = 1;
    this.at = ts + (ok ? 500 : 1500);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 1 && now >= this.at) {
      if (this.lives <= 0 || !this.pool.length) return true;
      this.next();
    }
    if (now - this.firstAt > 900000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'on the board', String(this.shown.length), 'best', this.best ? String(this.best) : '–', this.lives, NEWEST_LIVES);
    const fh = Math.min(a.bottom - a.top - 30 * a.u, (a.right - a.left) / 1.6);
    const fw = fh * 1.6;
    const fx = a.cx - fw / 2;
    const fy = a.top + 4 * a.u;
    this.field = [fx, fy, fw, fh];
    const r = fh * 0.04;
    this.shown.forEach((t, k) => {
      const [sx, sy] = this.spots[k]!;
      const x = fx + sx * fw;
      const y = fy + sy * fh;
      drawThing(ctx, t, x, y, r, 3 * dpr);
      if (this.state === 1 && (k === this.newIdx || k === this.chosen)) {
        ctx.strokeStyle = k === this.newIdx ? COL_LINE : COL_ACCENT;
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        ctx.arc(x, y, r * 1.8, 0, TAU);
        ctx.stroke();
      }
    });
    ctx.fillStyle = COL_MID;
    v.text(this.rounds === 0 ? 'each turn one new thing joins the board, and everything moves. click the new one' : '', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.right * 30 + this.best * 20,
      primary: { label: 'largest board kept track of', value: this.best, unit: 'things' },
      lines: [
        { label: 'new ones found', value: String(this.right) },
        { label: 'largest board', value: this.best ? `${this.best} things` : '–' },
      ],
      saved: this.rounds >= 3,
    };
  }
}

// --- Circle (freehand) -----------------------------------------------------------------

const CIRCLE_ROUNDS = 10;

class Circle implements Mini {
  private env!: MiniEnv;
  private round = 0;
  private cx = 0.5;
  private cy = 0.5;
  private path: [number, number][] = [];
  private drawing = false;
  private state = 0; // 0 ready / drawing, 1 result
  private at = 0;
  private scores: number[] = [];
  private last = '';
  private lastPath: [number, number][] = [];
  private lastR = 0;
  private field: Rect = [0, 0, 1, 1];
  private firstAt = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.firstAt = now;
    this.arm();
  }

  private arm(): void {
    this.cx = rnd(0.35, 0.65);
    this.cy = rnd(0.35, 0.65);
    this.path = [];
    this.drawing = false;
    this.state = 0;
  }

  press(): void {}

  pointer(x: number, y: number): void {
    if (this.state !== 0) return;
    this.drawing = true;
    this.path = [[x, y]];
  }

  pointerMove(x: number, y: number): void {
    if (!this.drawing) return;
    const p = this.path[this.path.length - 1]!;
    if (Math.hypot(x - p[0], y - p[1]) > 2) this.path.push([x, y]);
  }

  pointerUp(x: number, y: number, ts: number): void {
    if (!this.drawing) return;
    this.pointerMove(x, y);
    this.drawing = false;
    const [fx, fy, fw, fh] = this.field;
    const ox = fx + this.cx * fw;
    const oy = fy + this.cy * fh;
    const rs = this.path.map(([px, py]) => Math.hypot(px - ox, py - oy));
    const m = mean(rs);
    // How far round the dot the stroke went.
    let turn = 0;
    for (let k = 1; k < this.path.length; k++) {
      const a0 = Math.atan2(this.path[k - 1]![1] - oy, this.path[k - 1]![0] - ox);
      const a1 = Math.atan2(this.path[k]![1] - oy, this.path[k]![0] - ox);
      let d = a1 - a0;
      if (d > Math.PI) d -= TAU;
      if (d < -Math.PI) d += TAU;
      turn += d;
    }
    if (this.path.length < 10 || Math.abs(turn) < TAU * 0.9 || m < fh * 0.08) {
      this.last = Math.abs(turn) < TAU * 0.9 ? 'go all the way round the dot' : 'draw it bigger';
      this.env.sound(SND_FALSE);
      this.path = [];
      return;
    }
    const sd = Math.sqrt(mean(rs.map((r) => (r - m) ** 2)));
    const roundness = Math.max(0, 1 - sd / m);
    this.scores.push(roundness);
    this.last = `${(roundness * 100).toFixed(1)}% round`;
    this.lastPath = this.path;
    this.lastR = m;
    this.env.sound(roundness > 0.95 ? SND_CATCH : SND_TAP_WEAK);
    this.round++;
    this.state = 1;
    this.at = ts + 1600;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 1 && now >= this.at) {
      if (this.round >= scaled(CIRCLE_ROUNDS)) return true;
      this.arm();
    }
    if (now - this.firstAt > 600000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'typical', this.scores.length ? `${(median(this.scores) * 100).toFixed(1)}%` : '–', 'circle', `${Math.min(this.round + 1, scaled(CIRCLE_ROUNDS))} / ${scaled(CIRCLE_ROUNDS)}`);
    const fx = a.left;
    const fy = a.top + 4 * a.u;
    const fw = a.right - a.left;
    const fh = a.bottom - a.top - 30 * a.u;
    this.field = [fx, fy, fw, fh];
    const ox = fx + this.cx * fw;
    const oy = fy + this.cy * fh;
    ctx.fillStyle = COL_LINE;
    ctx.beginPath();
    ctx.arc(ox, oy, 4 * dpr, 0, TAU);
    ctx.fill();
    const path = this.state === 1 ? this.lastPath : this.path;
    if (this.state === 1) {
      ctx.strokeStyle = COL_DIM;
      ctx.lineWidth = dpr;
      ctx.beginPath();
      ctx.arc(ox, oy, this.lastR, 0, TAU);
      ctx.stroke();
    }
    if (path.length > 1) {
      ctx.strokeStyle = this.state === 1 ? COL_ACCENT : COL_LINE;
      ctx.lineWidth = 3 * dpr;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      path.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    }
    ctx.fillStyle = COL_MID;
    v.text(this.last || 'hold the button and draw one circle around the dot, then let go', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const m = median(this.scores);
    return {
      score: this.scores.length ? Math.max(0, Math.round((m - 0.8) * 10000)) : 0,
      primary: { label: 'typical roundness', value: Number((m * 100).toFixed(1)), unit: '%', decimals: 1 },
      lines: [
        { label: 'typical roundness', value: this.scores.length ? `${(m * 100).toFixed(1)}%` : '–' },
        { label: 'roundest', value: this.scores.length ? `${(Math.max(...this.scores) * 100).toFixed(1)}%` : '–' },
      ],
      saved: this.scores.length >= 3,
    };
  }
}

export const BATCH61: MiniDef[] = [
  { id: 'missing', name: 'Missing', skill: 'ear', blurb: 'A run of beats with one left out. Which beat was missing?', how: 'Eight beats at a steady tempo, but one of them is silent. Press its number, 1 to 8 (or click its box). Two right and the next run is faster; a miss and it slows. Sixteen runs. Best with sound; with it off the beats flash and the missing one stays dark.', input: 'pointer', make: () => new Missing() },
  { id: 'clicker', name: 'Clicker', skill: 'speed', blurb: 'Click as fast as you can for ten seconds.', how: 'Click the square as fast as you can; the clock starts on your first click and runs ten seconds. Clicks that land off the square do not count. Scored in clicks a second, with how well you held the pace in the second half.', input: 'pointer', make: () => new Clicker() },
  { id: 'newest', name: 'Newest', skill: 'memory', blurb: 'Things gather on the board one at a time. Which one is new?', how: 'Each turn one new thing joins the board and everything is shuffled to new places. Click the one that was not there before. You have three lives; the board keeps growing until they run out. Scored on the largest board you kept track of.', input: 'pointer', make: () => new Newest() },
  { id: 'circle', name: 'Circle', skill: 'aim', blurb: 'Draw a circle freehand around the dot, as round as you can.', how: 'Hold the mouse button (or a finger) down and draw one circle around the dot, then let go. It is scored on how round it is: how evenly far every point of the stroke sits from the dot. Go all the way round. Ten circles.', input: 'pointer', make: () => new Circle() },
];
