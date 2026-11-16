// Training scenes. They share the canvas and input plumbing with the game but
// have no physics: the reaction trainer is random-delay cues and nothing else,
// the CPS trainer is sustained bursts at a rising target.

import { ANTICIPATION_MS, COL_ACCENT, COL_DIM, COL_LINE, COL_MID, type ModeDef } from './config.ts';
import { RateMeter } from './rate.ts';
import type { View } from './render.ts';

// --- Reaction trainer ---------------------------------------------------------

const RT_WAIT = 0;
const RT_CUE = 1;
const RT_FEEDBACK = 2;

export const RT_NONE = 0;
export const RT_HIT = 1;
export const RT_LATE = 2;
export const RT_EARLY = 3;
export const RT_MISS = 4;

const RT_TIMEOUT = 1500;
const RT_WINDOW_START = 500;
const RT_WINDOW_MIN = 120;
const RT_WINDOW_MAX = 800;
const HIST_BIN = 20;
const HIST_BINS = 50;
const KIND_LABEL = ['', '', 'late', 'early', 'miss'] as const;

export class ReactionTrainer {
  readonly rts = new Float32Array(4096);
  n = 0;
  hits = 0;
  late = 0;
  early = 0;
  misses = 0;
  windowMs = RT_WINDOW_START;
  windowMin = RT_WINDOW_START;
  lastRt = 0;
  lastKind = RT_NONE;
  startedAt = 0;
  private state = RT_WAIT;
  private cueAt = 0;
  private drawnAt = 0;
  private feedbackUntil = 0;
  private median = 0;
  private readonly bins = new Uint16Array(HIST_BINS);
  private readonly sorted = new Float32Array(4096);

  start(now: number): void {
    this.n = 0;
    this.hits = this.late = this.early = this.misses = 0;
    this.windowMs = this.windowMin = RT_WINDOW_START;
    this.lastRt = 0;
    this.lastKind = RT_NONE;
    this.median = 0;
    this.bins.fill(0);
    this.startedAt = now;
    this.arm(now);
  }

  private arm(now: number): void {
    this.state = RT_WAIT;
    this.drawnAt = 0;
    // Exponential foreperiod: the cue is never more "due" than it was a moment ago.
    const wait = 1100 + Math.min(4200, -Math.log(1 - Math.random()) * 1400);
    this.cueAt = now + wait;
  }

  private feedback(now: number, kind: number): void {
    this.lastKind = kind;
    this.state = RT_FEEDBACK;
    this.feedbackUntil = now + (kind === RT_EARLY ? 700 : 620);
  }

  /** Any key. `ts` is the keydown's event.timeStamp. Returns the outcome kind. */
  onKey(ts: number): number {
    if (this.state === RT_FEEDBACK) return RT_NONE;
    if (this.state === RT_WAIT || this.drawnAt === 0) {
      this.early++;
      this.feedback(ts, RT_EARLY);
      return RT_EARLY;
    }
    const rt = ts - this.drawnAt;
    if (rt < ANTICIPATION_MS) {
      this.early++;
      this.feedback(ts, RT_EARLY);
      return RT_EARLY;
    }
    this.record(rt);
    const hit = rt <= this.windowMs;
    if (hit) {
      this.hits++;
      this.windowMs = Math.max(RT_WINDOW_MIN, this.windowMs * 0.95);
      if (this.windowMs < this.windowMin) this.windowMin = this.windowMs;
    } else {
      this.late++;
      this.windowMs = Math.min(RT_WINDOW_MAX, this.windowMs * 1.08);
    }
    this.feedback(ts, hit ? RT_HIT : RT_LATE);
    return this.lastKind;
  }

  private record(rt: number): void {
    this.lastRt = rt;
    if (this.n >= this.rts.length) return;
    this.rts[this.n] = rt;
    // Insertion into the sorted copy keeps the running median cheap.
    let i = this.n;
    while (i > 0 && this.sorted[i - 1]! > rt) {
      this.sorted[i] = this.sorted[i - 1]!;
      i--;
    }
    this.sorted[i] = rt;
    this.n++;
    const mid = this.n >> 1;
    this.median = this.n % 2 ? this.sorted[mid]! : (this.sorted[mid - 1]! + this.sorted[mid]!) / 2;
    const b = Math.min(HIST_BINS - 1, Math.floor(rt / HIST_BIN));
    this.bins[b]!++;
  }

  frame(now: number, view: View): void {
    if (this.state === RT_WAIT && now >= this.cueAt) this.state = RT_CUE;
    if (this.state === RT_CUE && this.drawnAt > 0 && now - this.drawnAt > RT_TIMEOUT) {
      this.misses++;
      this.windowMs = Math.min(RT_WINDOW_MAX, this.windowMs * 1.08);
      this.feedback(now, RT_MISS);
    }
    if (this.state === RT_FEEDBACK && now >= this.feedbackUntil) this.arm(now);

    const ctx = view.ctx;
    const dpr = view.dpr;
    view.clear();
    const cx = view.ox;
    const cy = Math.round(view.h * 0.46);
    const cue = this.state === RT_CUE;

    // The cable and the end it holds.
    if (cue) {
      ctx.strokeStyle = COL_ACCENT;
      ctx.lineWidth = 3 * dpr;
    } else {
      ctx.strokeStyle = COL_MID;
      ctx.lineWidth = dpr;
    }
    ctx.beginPath();
    ctx.moveTo(cx + (cue ? 0 : 0.5), 0);
    ctx.lineTo(cx + (cue ? 0 : 0.5), cy);
    ctx.stroke();
    ctx.strokeStyle = COL_LINE;
    ctx.lineWidth = 2.5 * dpr;
    ctx.beginPath();
    ctx.moveTo(cx - 70 * dpr, cy);
    ctx.lineTo(cx + 70 * dpr, cy);
    ctx.stroke();
    const q = (cue ? 5 : 3) * dpr;
    ctx.fillStyle = cue ? COL_ACCENT : COL_LINE;
    ctx.fillRect(cx - q, cy - q, q * 2, q * 2);
    // Stamp the cue time on the frame it is first drawn.
    if (cue && this.drawnAt === 0) this.drawnAt = performance.now();

    // Last result.
    const ry = cy + 84 * dpr;
    if (this.lastKind === RT_HIT || this.lastKind === RT_LATE) {
      ctx.fillStyle = this.lastKind === RT_HIT ? COL_LINE : COL_MID;
      const w = view.numberWidth(this.lastRt, 0, view.fontBig);
      view.number(this.lastRt, 0, cx + w / 2, ry, view.fontBig);
      ctx.fillStyle = COL_MID;
      view.text('ms', cx + w / 2 + 8 * dpr, ry, view.fontTiny, 'left');
    }
    if (this.lastKind >= RT_LATE) {
      ctx.fillStyle = COL_MID;
      view.text(KIND_LABEL[this.lastKind]!, cx, ry + 26 * dpr, view.fontHud, 'center');
    }
    if (this.n === 0 && this.lastKind === RT_NONE) {
      ctx.fillStyle = COL_MID;
      view.text('press any key when the line turns', cx, ry, view.fontHud, 'center');
    }

    // Running numbers.
    const colL = cx - 220 * dpr;
    const colR = cx + 220 * dpr;
    const ty = 44 * dpr;
    ctx.fillStyle = COL_MID;
    view.text('median', colL, ty, view.fontTiny, 'left');
    view.text('window', colR, ty, view.fontTiny, 'right');
    ctx.fillStyle = COL_LINE;
    if (this.n > 0) {
      const w = view.numberWidth(this.median, 0, view.fontHud);
      view.number(this.median, 0, colL + w, ty + 22 * dpr, view.fontHud);
      ctx.fillStyle = COL_MID;
      const wn = view.numberWidth(this.n, 0, view.fontTiny);
      view.number(this.n, 0, colL + w + 14 * dpr + wn, ty + 22 * dpr, view.fontTiny);
    }
    ctx.fillStyle = COL_LINE;
    view.number(this.windowMs, 0, colR, ty + 22 * dpr, view.fontHud);

    // Live histogram, 100..700 ms.
    if (this.n > 0) {
      const from = 5;
      const to = 35;
      const bw = 12 * dpr;
      const x0 = cx - ((to - from) * bw) / 2;
      const base = Math.min(view.h - 70 * dpr, ry + 150 * dpr);
      let peak = 1;
      for (let i = from; i < to; i++) if (this.bins[i]! > peak) peak = this.bins[i]!;
      ctx.fillStyle = COL_MID;
      for (let i = from; i < to; i++) {
        const c = this.bins[i]!;
        if (c === 0) continue;
        const hgt = Math.max(dpr, (c / peak) * 56 * dpr);
        ctx.fillRect(x0 + (i - from) * bw + dpr, base - hgt, bw - 2 * dpr, hgt);
      }
      ctx.fillStyle = COL_DIM;
      ctx.fillRect(x0, base, (to - from) * bw, dpr);
      const mx = x0 + (this.median / HIST_BIN - from) * bw;
      if (mx > x0 && mx < x0 + (to - from) * bw) {
        ctx.fillStyle = COL_LINE;
        ctx.fillRect(mx, base - 62 * dpr, dpr, 62 * dpr);
      }
      ctx.fillStyle = COL_DIM;
      view.text('100', x0, base + 16 * dpr, view.fontTiny, 'left');
      view.text('700 ms', x0 + (to - from) * bw, base + 16 * dpr, view.fontTiny, 'right');
    }

    ctx.fillStyle = COL_DIM;
    view.text('esc to finish', cx, view.h - 26 * dpr, view.fontTiny, 'center');
  }
}

// --- CPS / alternation trainer ------------------------------------------------

const CPS_IDLE = 0;
const CPS_ACTIVE = 1;
const CPS_REST = 2;
export const CPS_DONE = 3;

const CPS_HOLD = 5;
const CPS_REST_TIME = 3;
const CPS_GRACE = 1;
const CPS_STEP = 0.5;

export class CpsTrainer {
  state = CPS_IDLE;
  target = 6;
  /** Highest target held for the full duration; 0 if none yet. */
  cleared = 0;
  tapT = new Float64Array(16384);
  tapKey = new Uint8Array(16384);
  tapCount = 0;
  repeats = 0;
  /** Slots in play (side * 3 + key index), left hand first. */
  slots: number[] = [];
  labels: string[] = [];
  /** True when each hand has one key, so the two keys alternate with each other. */
  crossHand = false;
  startedAt = 0;
  private readonly meter = new RateMeter(1.25, 128);
  private readonly counts = new Uint32Array(6);
  private readonly lastInGroup = new Int8Array(2);
  private rate = 0;
  private progress = 0;
  private lag = 0;
  private roundT = 0;
  private restT = 0;
  private reached = false;
  private fails = 0;
  private lastNow = 0;
  private lastResult = 0; // 0 none, 1 cleared, 2 dropped

  start(mode: ModeDef, labels: string[], now: number): void {
    this.slots = [];
    for (let i = 0; i < mode.left; i++) this.slots.push(i);
    for (let i = 0; i < mode.right; i++) this.slots.push(3 + i);
    this.labels = labels;
    this.crossHand = mode.left === 1 && mode.right === 1;
    const keys = this.slots.length;
    this.target = keys <= 1 ? 4 : keys === 2 ? 6 : keys === 4 ? 9 : 11;
    this.cleared = 0;
    this.tapCount = 0;
    this.repeats = 0;
    this.counts.fill(0);
    this.lastInGroup[0] = this.lastInGroup[1] = -1;
    this.meter.reset();
    this.state = CPS_IDLE;
    this.rate = 0;
    this.progress = 0;
    this.fails = 0;
    this.lastResult = 0;
    this.lastNow = now;
    this.startedAt = now;
  }

  /** A lift key. Returns true when the tap repeated the previous key. */
  onTap(slot: number, ts: number): boolean {
    if (this.state === CPS_REST || this.state === CPS_DONE) return false;
    if (this.state === CPS_IDLE) {
      this.state = CPS_ACTIVE;
      this.progress = 0;
      this.lag = 0;
      this.roundT = 0;
      this.reached = false;
      this.meter.reset();
      this.lastInGroup[0] = this.lastInGroup[1] = -1;
    }
    this.meter.push(ts / 1000);
    if (this.tapCount === this.tapT.length) {
      const t = new Float64Array(this.tapT.length * 2);
      t.set(this.tapT);
      this.tapT = t;
      const k = new Uint8Array(this.tapKey.length * 2);
      k.set(this.tapKey);
      this.tapKey = k;
    }
    this.tapT[this.tapCount] = ts - this.startedAt;
    this.tapKey[this.tapCount] = slot;
    this.tapCount++;
    this.counts[slot]!++;
    const g = this.crossHand ? 0 : slot >= 3 ? 1 : 0;
    const repeat = this.slots.length > 1 && this.lastInGroup[g] === slot;
    if (repeat) this.repeats++;
    this.lastInGroup[g] = slot;
    return repeat;
  }

  /** Returns true once the session has ended. */
  frame(now: number, view: View): boolean {
    let dt = (now - this.lastNow) / 1000;
    this.lastNow = now;
    if (dt < 0) dt = 0;
    else if (dt > 0.1) dt = 0.1;

    if (this.state === CPS_ACTIVE) {
      this.roundT += dt;
      this.rate = this.meter.rate(now / 1000);
      if (this.rate >= this.target) {
        this.progress += dt;
        this.lag = 0;
        this.reached = true;
      } else if (this.reached) {
        this.lag += dt;
      }
      if (this.progress >= CPS_HOLD) {
        this.cleared = this.target;
        this.target += CPS_STEP;
        this.fails = 0;
        this.lastResult = 1;
        this.state = CPS_REST;
        this.restT = CPS_REST_TIME;
      } else if ((this.reached && this.lag > CPS_GRACE) || this.roundT > CPS_HOLD * 2.4) {
        this.fails++;
        this.lastResult = 2;
        if (this.fails >= 2) {
          this.state = CPS_DONE;
        } else {
          this.state = CPS_REST;
          this.restT = CPS_REST_TIME;
        }
      }
    } else if (this.state === CPS_REST) {
      this.restT -= dt;
      this.rate = this.meter.rate(now / 1000);
      if (this.restT <= 0) this.state = CPS_IDLE;
    } else {
      this.rate = 0;
    }

    this.draw(view);
    return this.state === CPS_DONE;
  }

  private draw(view: View): void {
    const ctx = view.ctx;
    const dpr = view.dpr;
    view.clear();
    const cx = view.ox;
    const cy = Math.round(view.h * 0.4);

    // Current rate.
    const live = this.state === CPS_ACTIVE;
    ctx.fillStyle = live && this.rate >= this.target ? COL_LINE : COL_MID;
    const w = view.numberWidth(this.rate, 1, view.fontBig);
    view.number(this.rate, 1, cx + w / 2, cy, view.fontBig);

    // Target.
    const ty = cy + 34 * dpr;
    ctx.fillStyle = COL_MID;
    view.text('target', cx - 6 * dpr, ty, view.fontTiny, 'right');
    ctx.fillStyle = COL_LINE;
    const tw = view.numberWidth(this.target, 1, view.fontHud);
    view.number(this.target, 1, cx + 2 * dpr + tw, ty, view.fontHud);

    // One thin meter: hold progress, or the rest draining away.
    const half = 150 * dpr;
    const my = Math.round(ty + 26 * dpr) + 0.5;
    ctx.lineWidth = 2 * dpr;
    ctx.strokeStyle = COL_DIM;
    ctx.beginPath();
    ctx.moveTo(cx - half, my);
    ctx.lineTo(cx + half, my);
    ctx.stroke();
    let p = 0;
    if (this.state === CPS_ACTIVE) p = Math.min(1, this.progress / CPS_HOLD);
    else if (this.state === CPS_REST) p = Math.max(0, this.restT / CPS_REST_TIME);
    if (p > 0) {
      ctx.strokeStyle = this.state === CPS_REST ? COL_MID : COL_LINE;
      ctx.beginPath();
      ctx.moveTo(cx - half, my);
      ctx.lineTo(cx - half + half * 2 * p, my);
      ctx.stroke();
    }

    ctx.fillStyle = COL_MID;
    const sy = my + 26 * dpr;
    if (this.state === CPS_REST) {
      view.text(this.lastResult === 1 ? 'held · rest' : 'dropped · rest', cx, sy, view.fontTiny, 'center');
    } else if (this.state === CPS_IDLE) {
      view.text(
        this.tapCount === 0 ? 'tap to start · hold the target for 5 s' : 'tap to go',
        cx,
        sy,
        view.fontTiny,
        'center',
      );
    }

    // Per-key share bars, grouped by hand.
    const n = this.slots.length;
    const bw = 34 * dpr;
    const gap = n > 1 ? 30 * dpr : 0;
    const total = n * bw + gap;
    const base = Math.min(view.h - 90 * dpr, sy + 150 * dpr);
    let peak = 1;
    for (let i = 0; i < n; i++) if (this.counts[this.slots[i]!]! > peak) peak = this.counts[this.slots[i]!]!;
    let x = cx - total / 2;
    for (let i = 0; i < n; i++) {
      const slot = this.slots[i]!;
      if (i > 0 && slot >= 3 && this.slots[i - 1]! < 3) x += gap;
      const c = this.counts[slot]!;
      const hgt = (c / peak) * 70 * dpr;
      ctx.fillStyle = COL_DIM;
      ctx.fillRect(x + 6 * dpr, base, bw - 12 * dpr, dpr);
      if (c > 0) {
        ctx.fillStyle = COL_MID;
        ctx.fillRect(x + bw / 2 - dpr, base - hgt, 2 * dpr, hgt);
      }
      ctx.fillStyle = COL_MID;
      view.text(this.labels[i] ?? '', x + bw / 2, base + 18 * dpr, view.fontTiny, 'center');
      x += bw;
    }

    // Alternation errors.
    if (n > 1) {
      const ry = base + 44 * dpr;
      ctx.fillStyle = COL_MID;
      view.text('repeats', cx - 4 * dpr, ry, view.fontTiny, 'right');
      ctx.fillStyle = this.repeats > 0 ? COL_LINE : COL_MID;
      const rw = view.numberWidth(this.repeats, 0, view.fontTiny);
      view.number(this.repeats, 0, cx + 4 * dpr + rw, ry, view.fontTiny);
    }

    ctx.fillStyle = COL_DIM;
    view.text('esc to finish', cx, view.h - 26 * dpr, view.fontTiny, 'center');
  }
}
