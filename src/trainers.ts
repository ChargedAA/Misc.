// Burst mode: the CPS / alternation trainer. Hold a target tap rate for five
// seconds, rest, and the target rises. It has no physics; it shares the canvas,
// the touch pads and the input plumbing with the rest of the game.

import { COL_DIM, COL_LINE, COL_MID, type ModeDef } from './config.ts';
import { RateMeter } from './rate.ts';
import { ICON_CLOSE, type View } from './render.ts';
import type { TouchLayout } from './touch.ts';

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
  private held = 0;

  /** `labels[i]` names `slots[i]`. */
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
    this.held = 0;
  }

  /** A lift key. Returns true when the tap repeated the previous key. */
  onTap(slot: number, ts: number): boolean {
    this.held |= 1 << slot;
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

  onRelease(slot: number): void {
    this.held &= ~(1 << slot);
  }

  /** Returns true once the session has ended. */
  frame(now: number, view: View, touch: TouchLayout): boolean {
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

    this.draw(view, touch);
    return this.state === CPS_DONE;
  }

  private draw(view: View, touch: TouchLayout): void {
    const ctx = view.ctx;
    const dpr = view.dpr;
    view.clear();
    const cx = view.ox;
    const padTop = touch.active && touch.pads.length > 0 ? touch.pads[0]!.y : view.h;
    const cy = Math.round(Math.min(view.h, padTop) * 0.36);

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
    const half = Math.min(150 * dpr, view.w * 0.36);
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
    const base = Math.min(Math.min(view.h, padTop) - 70 * dpr, sy + 130 * dpr);
    let peak = 1;
    for (let i = 0; i < n; i++) if (this.counts[this.slots[i]!]! > peak) peak = this.counts[this.slots[i]!]!;
    let x = cx - total / 2;
    const barH = Math.max(20 * dpr, Math.min(70 * dpr, base - sy - 30 * dpr));
    for (let i = 0; i < n; i++) {
      const slot = this.slots[i]!;
      if (i > 0 && slot >= 3 && this.slots[i - 1]! < 3) x += gap;
      const c = this.counts[slot]!;
      const hgt = (c / peak) * barH;
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
      const ry = base + 40 * dpr;
      ctx.fillStyle = COL_MID;
      view.text('repeats', cx - 4 * dpr, ry, view.fontTiny, 'right');
      ctx.fillStyle = this.repeats > 0 ? COL_LINE : COL_MID;
      const rw = view.numberWidth(this.repeats, 0, view.fontTiny);
      view.number(this.repeats, 0, cx + 4 * dpr + rw, ry, view.fontTiny);
    }

    if (!touch.active) {
      ctx.fillStyle = COL_DIM;
      view.text('esc to finish', cx, view.h - 26 * dpr, view.fontTiny, 'center');
    }
    view.drawTouch(touch, ICON_CLOSE, this.held);
  }
}
