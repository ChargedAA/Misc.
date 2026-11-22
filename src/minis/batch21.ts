// Twenty-first batch: kinds of training the suite did not cover yet.
//   Code   (speed)     - symbol-to-key coding: how fast you turn a symbol into a response.
//   Flow   (judgement) - a cloud of dots: which way are most of them drifting?
//   Away   (attention) - a flash pulls your eyes one way; the arrow you must read is the other way.
//   Late   (timing)    - a run of beats by ear: were they even, or did one land late?
//   Pump   (judgement) - pump a balloon for points and bank before it pops. Learn each colour's risk.
//   Remind (memory)    - a quick odd/even task, and a rule to remember for the rare boxed number.

import { ANTICIPATION_MS, COL_ACCENT, COL_DIM, COL_FAINT, COL_LINE, COL_MID } from '../config.ts';
import { SND_BEAT, SND_CATCH, SND_FALL, SND_FALSE, SND_RING, SND_TAP_L, SND_TAP_R, SND_TAP_WEAK } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { Stair, arena, footer, foreperiod, handLabel, header, mean, median, message, ms, pct, progress, shuffle, sideOf, slotsOf, type Mini, type MiniDef, type MiniEnv, type MiniResult, scaled } from './kit.ts';

const TAU = Math.PI * 2;

function rint(lo: number, hi: number): number {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

/** Mean of the last n values (all of them when fewer). */
function tail(a: readonly number[], n: number): number {
  return mean(a.slice(-n));
}

// --- Code (symbol coding) -----------------------------------------------------------

const CODE_MS = 60000;
const CODE_RESHUFFLE_MS = 20000;
const GLYPHS = 6;

/** Six simple outline glyphs, drawn centred at (x, y) with half-size r. */
function glyph(v: View, g: number, x: number, y: number, r: number, color: string): void {
  const ctx = v.ctx;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5 * v.dpr, r / 9);
  ctx.beginPath();
  if (g === 0) ctx.arc(x, y, r, 0, TAU);
  else if (g === 1) ctx.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7);
  else if (g === 2) {
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r * 0.95, y + r * 0.75);
    ctx.lineTo(x - r * 0.95, y + r * 0.75);
    ctx.closePath();
  } else if (g === 3) {
    ctx.moveTo(x, y - r);
    ctx.lineTo(x, y + r);
    ctx.moveTo(x - r, y);
    ctx.lineTo(x + r, y);
  } else if (g === 4) {
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
  } else {
    // Hourglass.
    ctx.moveTo(x - r * 0.8, y - r);
    ctx.lineTo(x + r * 0.8, y - r);
    ctx.lineTo(x - r * 0.8, y + r);
    ctx.lineTo(x + r * 0.8, y + r);
    ctx.closePath();
  }
  ctx.stroke();
}

class Code implements Mini {
  private env!: MiniEnv;
  private slots: number[] = [];
  /** key[i] = glyph shown above the i-th key. */
  private key: number[] = [];
  private t0 = 0;
  private shuffledAt = 0;
  private cur = 0;
  private shownAt = 0;
  private right = 0;
  private wrong = 0;
  private rts: number[] = [];
  private flash = 0;
  private flashOk = true;
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.slots = slotsOf(env.mode);
    this.t0 = now + 1200;
    this.reshuffle(now);
    this.next(this.t0);
  }

  private reshuffle(now: number): void {
    this.key = shuffle([...Array(GLYPHS).keys()]).slice(0, this.slots.length);
    this.shuffledAt = now;
  }

  private next(now: number): void {
    let g = this.key[rint(0, this.key.length - 1)]!;
    if (this.key.length > 1) while (g === this.cur) g = this.key[rint(0, this.key.length - 1)]!;
    this.cur = g;
    this.shownAt = now;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (ts < this.t0 || ts - this.t0 > scaled(CODE_MS)) return;
    const i = this.slots.indexOf(slot);
    if (i < 0) return;
    const ok = this.key[i] === this.cur;
    this.flash = ts;
    this.flashOk = ok;
    if (ok) {
      this.right++;
      this.rts.push(ts - this.shownAt);
      this.env.sound(sideOf(slot) < 0 ? SND_TAP_L : SND_TAP_R);
      this.next(ts);
    } else {
      this.wrong++;
      this.env.sound(SND_FALSE);
    }
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const el = now - this.t0;
    if (el > scaled(CODE_MS)) return true;
    if (el > 0 && now - this.shuffledAt > CODE_RESHUFFLE_MS) {
      this.reshuffle(now);
      this.next(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'right', String(this.right), 'time', `${Math.max(0, Math.ceil((scaled(CODE_MS) - Math.max(0, el)) / 1000))} s`);
    // The key: one glyph above each key label.
    const n = this.slots.length;
    const gap = Math.min(96 * a.u, (a.right - a.left) / n);
    const ky = a.top + 50 * a.u;
    const fresh = el > 0 && now - this.shuffledAt < 900;
    for (let i = 0; i < n; i++) {
      const x = a.cx + (i - (n - 1) / 2) * gap;
      glyph(v, this.key[i]!, x, ky, 14 * a.u, fresh ? COL_ACCENT : COL_LINE);
      ctx.fillStyle = COL_MID;
      v.text(this.env.labels[this.slots[i]!] ?? '', x, ky + 38 * a.u, v.fontTiny, 'center');
    }
    ctx.fillStyle = COL_FAINT;
    ctx.fillRect(a.cx - (n * gap) / 2, ky + 56 * a.u, n * gap, v.dpr);
    if (el < 0) {
      message(v, { ...a, cy: a.cy + 40 * a.u }, 'learn the key', 'press the key under the symbol that matches');
    } else {
      const col = now - this.flash < 160 && !this.flashOk ? COL_ACCENT : COL_LINE;
      glyph(v, this.cur, a.cx, a.cy + 50 * a.u, 40 * a.u, col);
      if (fresh) {
        ctx.fillStyle = COL_ACCENT;
        v.text('new key', a.cx, a.cy + 120 * a.u, v.fontTiny, 'center');
      }
    }
    progress(v, a.cx, a.bottom - 8 * a.u, 160 * a.u, Math.max(0, el) / scaled(CODE_MS));
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const perMin = Math.round(this.right / (scaled(CODE_MS) / 60000));
    const all = this.right + this.wrong;
    return {
      score: Math.max(0, Math.round(this.right * 8 - this.wrong * 12)),
      primary: { label: 'symbols per minute', value: perMin, unit: '/min' },
      lines: [
        { label: 'coded right', value: String(this.right) },
        { label: 'wrong key', value: `${this.wrong}${all ? `  ·  ${pct(this.wrong / all)}` : ''}` },
        { label: 'median time per symbol', value: ms(median(this.rts)) },
        { label: 'median, final third of the minute', value: ms(median(this.rts.slice(-Math.max(1, Math.round(this.rts.length / 3))))) },
      ],
      rts: this.rts,
      saved: this.right >= 10,
    };
  }
}

// --- Flow (motion coherence) --------------------------------------------------------

const FLOW_TRIALS = 32;
const FLOW_DOTS = 140;

class Flow implements Mini {
  private env!: MiniEnv;
  /** Percent of dots moving together. */
  private readonly coh = new Stair(50, 6, 1, 90, 2);
  private levels: number[] = [];
  private trial = 0;
  private state = 0; // 0 gap, 1 dots, 2 feedback
  private at = 0;
  private dir = 1;
  private dots: { x: number; y: number; sig: boolean }[] = [];
  private shownAt = 0;
  private last = 0;
  private lastOk = true;
  private right = 0;
  private rts: number[] = [];
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.state = 0;
    this.at = now + 900;
  }

  private show(now: number): void {
    this.dir = Math.random() < 0.5 ? -1 : 1;
    const n = Math.round((FLOW_DOTS * this.coh.level) / 100);
    this.dots = [];
    for (let i = 0; i < FLOW_DOTS; i++) {
      const r = Math.sqrt(Math.random());
      const t = Math.random() * TAU;
      this.dots.push({ x: r * Math.cos(t), y: r * Math.sin(t), sig: i < n });
    }
    this.state = 1;
    this.shownAt = now;
    this.last = now;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (this.state !== 1 || s === 0) return;
    if (ts - this.shownAt < ANTICIPATION_MS) return;
    this.answer(s === this.dir, ts);
    this.rts.push(ts - this.shownAt);
  }

  private answer(ok: boolean, now: number): void {
    this.levels.push(this.coh.level);
    this.coh.update(ok, -1);
    this.lastOk = ok;
    if (ok) this.right++;
    this.env.sound(ok ? SND_CATCH : SND_FALSE);
    this.trial++;
    this.state = 2;
    this.at = now + 600;
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.at) this.show(now);
    else if (this.state === 1 && now - this.shownAt > 2500) this.answer(false, now);
    else if (this.state === 2 && now >= this.at) {
      if (this.trial >= scaled(FLOW_TRIALS)) return true;
      this.state = 0;
      this.at = now + 350;
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'moving together', `${this.coh.level}%`, 'trial', `${Math.min(this.trial + 1, scaled(FLOW_TRIALS))} / ${scaled(FLOW_TRIALS)}`);
    const R = Math.min(150 * a.u, (a.bottom - a.top) / 2 - 30 * a.u);
    ctx.strokeStyle = COL_FAINT;
    ctx.lineWidth = v.dpr;
    ctx.beginPath();
    ctx.arc(a.cx, a.cy, R + 8 * a.u, 0, TAU);
    ctx.stroke();
    if (this.state === 1) {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      const sp = 0.55 * dt; // aperture radii per second
      ctx.fillStyle = COL_LINE;
      for (const d of this.dots) {
        if (d.sig) d.x += this.dir * sp;
        else {
          const t = Math.random() * TAU;
          d.x += Math.cos(t) * sp;
          d.y += Math.sin(t) * sp;
        }
        if (d.x * d.x + d.y * d.y > 1) {
          // Re-enter on the far side for signal dots, anywhere for noise.
          if (d.sig) {
            d.y = (Math.random() * 2 - 1) * 0.95;
            d.x = -this.dir * Math.sqrt(Math.max(0, 1 - d.y * d.y)) * 0.98;
          } else {
            const r = Math.sqrt(Math.random());
            const t = Math.random() * TAU;
            d.x = r * Math.cos(t);
            d.y = r * Math.sin(t);
          }
        }
        ctx.fillRect(a.cx + d.x * R - v.dpr, a.cy + d.y * R - v.dpr, 2.2 * v.dpr, 2.2 * v.dpr);
      }
    } else if (this.state === 2) {
      ctx.fillStyle = this.lastOk ? COL_MID : COL_ACCENT;
      v.text(this.lastOk ? 'right' : this.dir < 0 ? 'it was left' : 'it was right', a.cx, a.cy, v.fontTiny, 'center');
    } else {
      ctx.fillStyle = COL_DIM;
      ctx.fillRect(a.cx - 5 * a.u, a.cy - v.dpr / 2, 10 * a.u, v.dpr);
      ctx.fillRect(a.cx - v.dpr / 2, a.cy - 5 * a.u, v.dpr, 10 * a.u);
    }
    ctx.fillStyle = COL_MID;
    v.text(`${handLabel(this.env, -1)}  ← left`, a.cx - R - 20 * a.u, a.cy + R + 26 * a.u, v.fontTiny, 'left');
    v.text(`right →  ${handLabel(this.env, 1)}`, a.cx + R + 20 * a.u, a.cy + R + 26 * a.u, v.fontTiny, 'right');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const th = tail(this.levels, 12);
    return {
      score: this.trial >= 8 ? Math.max(0, Math.round((100 - th) * 6 + this.right * 4)) : 0,
      primary: { label: 'dots needed to see the flow', value: Math.round(th), unit: '%', lower: true },
      lines: [
        { label: 'threshold (last 12 trials)', value: this.levels.length ? `${Math.round(th)}% of dots` : '–' },
        { label: 'right', value: `${this.right} of ${this.trial}` },
        { label: 'median decision time', value: ms(median(this.rts)) },
      ],
      rts: this.rts, saved: this.trial >= 12,
    };
  }
}

// --- Away (antisaccade) -------------------------------------------------------------

const AWAY_BLOCKS = 4;
const AWAY_PER = 8;

class Away implements Mini {
  private env!: MiniEnv;
  /** Arrow exposure in ms, one staircase per rule. */
  private readonly expo = [new Stair(220, 20, 16, 400, 2), new Stair(260, 20, 16, 400, 2)];
  private levels: [number[], number[]] = [[], []];
  private block = 0;
  private trial = 0;
  private anti = false;
  private state = 0; // 0 card, 1 fixation, 2 cue, 3 gap, 4 arrow, 5 mask/answer, 6 feedback
  private at = 0;
  private cueSide = 1;
  private arrow = 1;
  private lastOk = true;
  private right = [0, 0];
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.card(now);
  }

  private card(now: number): void {
    this.anti = this.block % 2 === 1;
    this.trial = 0;
    this.state = 0;
    this.at = now + 2200;
  }

  private arm(now: number): void {
    this.state = 1;
    this.at = now + foreperiod(500, 700, 1200);
    this.cueSide = Math.random() < 0.5 ? -1 : 1;
    this.arrow = Math.random() < 0.5 ? -1 : 1;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (s === 0) return;
    if (this.state === 0) {
      this.at = ts;
      return;
    }
    if (this.state !== 4 && this.state !== 5) return;
    const k = this.anti ? 1 : 0;
    const ok = s === this.arrow;
    this.levels[k]!.push(this.expo[k]!.level);
    this.expo[k]!.update(ok, -1);
    this.lastOk = ok;
    if (ok) this.right[k]!++;
    this.env.sound(ok ? SND_CATCH : SND_FALSE);
    this.state = 6;
    this.at = ts + 550;
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const k = this.anti ? 1 : 0;
    if (this.state === 0 && now >= this.at) this.arm(now);
    else if (this.state === 1 && now >= this.at) {
      this.state = 2;
      this.at = now + 120;
    } else if (this.state === 2 && now >= this.at) {
      this.state = 3;
      this.at = now + 60;
    } else if (this.state === 3 && now >= this.at) {
      this.state = 4;
      this.at = now + this.expo[k]!.level;
    } else if (this.state === 4 && now >= this.at) {
      this.state = 5;
      this.at = now + 2500;
    } else if (this.state === 5 && now >= this.at) {
      // No answer counts as wrong.
      this.levels[k]!.push(this.expo[k]!.level);
      this.expo[k]!.update(false, -1);
      this.lastOk = false;
      this.state = 6;
      this.at = now + 550;
    } else if (this.state === 6 && now >= this.at) {
      this.trial++;
      if (this.trial >= AWAY_PER) {
        this.block++;
        if (this.block >= scaled(AWAY_BLOCKS)) return true;
        this.card(now);
      } else this.arm(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'rule', this.anti ? 'other side' : 'same side', 'arrow shown', `${this.expo[k]!.level} ms`);
    const off = Math.min(260 * a.u, (a.right - a.left) / 2 - 50 * a.u);
    const box = 26 * a.u;
    const targetSide = this.anti ? -this.cueSide : this.cueSide;
    // Two boxes and a fixation cross.
    ctx.strokeStyle = COL_DIM;
    ctx.lineWidth = v.dpr;
    for (const s of [-1, 1]) ctx.strokeRect(a.cx + s * off - box, a.cy - box, box * 2, box * 2);
    ctx.fillStyle = COL_MID;
    ctx.fillRect(a.cx - 6 * a.u, a.cy - v.dpr / 2, 12 * a.u, v.dpr);
    ctx.fillRect(a.cx - v.dpr / 2, a.cy - 6 * a.u, v.dpr, 12 * a.u);
    if (this.state === 0) {
      message(v, { ...a, cy: a.cy - 90 * a.u }, this.anti ? 'OTHER SIDE' : 'SAME SIDE', this.anti ? 'a flash on one side, the arrow on the other: look away from the flash' : 'the arrow appears where the flash was', this.anti ? COL_ACCENT : COL_LINE);
      ctx.fillStyle = COL_MID;
      v.text('then press the way the arrow points', a.cx, a.cy + 80 * a.u, v.fontTiny, 'center');
    } else if (this.state === 2) {
      ctx.fillStyle = COL_LINE;
      ctx.fillRect(a.cx + this.cueSide * off - box, a.cy - box, box * 2, box * 2);
    } else if (this.state === 4) {
      // The arrow: a chevron inside the target box.
      const x = a.cx + targetSide * off;
      const r = box * 0.55;
      ctx.strokeStyle = COL_LINE;
      ctx.lineWidth = 2.5 * v.dpr;
      ctx.beginPath();
      ctx.moveTo(x - this.arrow * r * 0.5, a.cy - r);
      ctx.lineTo(x + this.arrow * r * 0.5, a.cy);
      ctx.lineTo(x - this.arrow * r * 0.5, a.cy + r);
      ctx.stroke();
    } else if (this.state === 5) {
      // Mask: a hatch over the target box.
      const x = a.cx + targetSide * off;
      ctx.strokeStyle = COL_MID;
      ctx.lineWidth = v.dpr;
      ctx.beginPath();
      for (let i = -3; i <= 3; i++) {
        ctx.moveTo(x + i * box * 0.3 - box * 0.4, a.cy - box * 0.7);
        ctx.lineTo(x + i * box * 0.3 + box * 0.4, a.cy + box * 0.7);
        ctx.moveTo(x + i * box * 0.3 + box * 0.4, a.cy - box * 0.7);
        ctx.lineTo(x + i * box * 0.3 - box * 0.4, a.cy + box * 0.7);
      }
      ctx.stroke();
      ctx.fillStyle = COL_MID;
      v.text('which way did it point?', a.cx, a.cy + 70 * a.u, v.fontTiny, 'center');
    } else if (this.state === 6) {
      ctx.fillStyle = this.lastOk ? COL_MID : COL_ACCENT;
      v.text(this.lastOk ? 'right' : `it pointed ${this.arrow < 0 ? 'left' : 'right'}`, a.cx, a.cy + 70 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const same = tail(this.levels[0], 8);
    const other = tail(this.levels[1], 8);
    const n = this.levels[1].length;
    return {
      score: n >= 6 ? Math.max(0, Math.round((420 - other) * 2 + (this.right[0]! + this.right[1]!) * 5)) : 0,
      primary: { label: 'arrow time needed, other side', value: Math.round(other), unit: 'ms', lower: true },
      series: { label: 'arrow time needed by rule', names: ['same side', 'other side'], values: [Math.round(same), Math.round(other)], unit: 'ms', lower: true },
      lines: [
        { label: 'same side: time needed, right', value: `${ms(same)}  ·  ${this.right[0]} of ${this.levels[0].length}` },
        { label: 'other side: time needed, right', value: `${ms(other)}  ·  ${this.right[1]} of ${n}` },
        { label: 'cost of looking away', value: same && other ? `${Math.round(other - same)} ms` : '–' },
      ],
      saved: n >= 6,
    };
  }
}

// --- Late (rhythm perception) -------------------------------------------------------

const LATE_TRIALS = 24;
const LATE_BEATS = 6;

class Late implements Mini {
  private env!: MiniEnv;
  /** How late the odd beat lands (ms). */
  private readonly off = new Stair(90, 8, 2, 160, 2);
  private levels: number[] = [];
  private trial = 0;
  private state = 0; // 0 gap, 1 playing, 2 answer, 3 feedback
  private at = 0;
  private ioi = 500;
  private times: number[] = [];
  private odd = -1;
  private t0 = 0;
  private lastOk = true;
  private right = 0;
  private visual = false;
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.visual = env.muted || !env.soundAt;
    this.state = 0;
    this.at = now + 1000;
  }

  private play(now: number): void {
    this.ioi = rint(440, 560);
    this.odd = Math.random() < 0.5 ? rint(2, LATE_BEATS - 2) : -1;
    this.times = [];
    for (let i = 0; i < LATE_BEATS; i++) this.times.push(i * this.ioi + (i === this.odd ? this.off.level : 0));
    this.t0 = now + 120;
    if (!this.visual) for (const t of this.times) this.env.soundAt!(SND_BEAT, 120 + t);
    this.state = 1;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (s === 0 || this.state !== 2) return;
    const saidOdd = s > 0;
    const ok = saidOdd === this.odd >= 0;
    this.levels.push(this.off.level);
    this.off.update(ok, -1);
    this.lastOk = ok;
    if (ok) this.right++;
    this.env.sound(ok ? SND_CATCH : SND_FALSE);
    this.trial++;
    this.state = 3;
    this.at = ts + 700;
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.at) this.play(now);
    else if (this.state === 1 && now > this.t0 + this.times[LATE_BEATS - 1]! + 250) this.state = 2;
    else if (this.state === 3 && now >= this.at) {
      if (this.trial >= scaled(LATE_TRIALS)) return true;
      this.state = 0;
      this.at = now + 500;
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'late by', this.state === 1 ? '…' : `${this.off.level} ms`, 'run', `${Math.min(this.trial + 1, scaled(LATE_TRIALS))} / ${scaled(LATE_TRIALS)}`);
    // One dot per beat. With sound on they only count off, after the beat, so the eye cannot judge the timing.
    const gap = 40 * a.u;
    const played = this.state >= 1 ? this.times.filter((t) => now >= this.t0 + t).length : 0;
    for (let i = 0; i < LATE_BEATS; i++) {
      const x = a.cx + (i - (LATE_BEATS - 1) / 2) * gap;
      const on = this.state === 1 && i < played;
      const flash = this.visual && this.state === 1 && now >= this.t0 + this.times[i]! && now < this.t0 + this.times[i]! + 90;
      ctx.fillStyle = flash ? COL_LINE : on && !this.visual ? COL_MID : COL_DIM;
      ctx.beginPath();
      ctx.arc(x, a.cy - 20 * a.u, flash ? 9 * a.u : 5 * a.u, 0, TAU);
      ctx.fill();
      if (this.state === 3 && i === this.odd) {
        ctx.strokeStyle = COL_ACCENT;
        ctx.lineWidth = v.dpr;
        ctx.beginPath();
        ctx.arc(x, a.cy - 20 * a.u, 12 * a.u, 0, TAU);
        ctx.stroke();
      }
    }
    ctx.fillStyle = COL_MID;
    if (this.state === 1) v.text(this.visual ? 'watch the beat (sound is off)' : 'listen', a.cx, a.cy + 30 * a.u, v.fontTiny, 'center');
    else if (this.state === 2) {
      ctx.fillStyle = COL_LINE;
      v.text('even, or did one land late?', a.cx, a.cy + 30 * a.u, v.fontHud, 'center');
    } else if (this.state === 3) {
      ctx.fillStyle = this.lastOk ? COL_MID : COL_ACCENT;
      v.text(this.lastOk ? 'right' : this.odd >= 0 ? `beat ${this.odd + 1} was ${this.levels[this.levels.length - 1]} ms late` : 'they were even', a.cx, a.cy + 30 * a.u, v.fontTiny, 'center');
    }
    ctx.fillStyle = COL_MID;
    const off = Math.min(200 * a.u, (a.right - a.left) / 2 - 30 * a.u);
    v.text(`${handLabel(this.env, -1)}  even`, a.cx - off, a.cy + 90 * a.u, v.fontTiny, 'center');
    v.text(`late  ${handLabel(this.env, 1)}`, a.cx + off, a.cy + 90 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const th = tail(this.levels, 12);
    return {
      score: this.trial >= 8 ? Math.max(0, Math.round((170 - th) * 4 + this.right * 5)) : 0,
      primary: { label: 'smallest lateness you hear', value: Math.round(th), unit: 'ms', lower: true },
      lines: [
        { label: 'threshold (last 12 runs)', value: ms(th) },
        { label: 'right', value: `${this.right} of ${this.trial}` },
        { label: 'as a share of the beat', value: th ? pct(th / 500) : '–' },
        ...(this.visual ? [{ label: 'note', value: 'played with sound off, by eye' }] : []),
      ],
      saved: this.trial >= 12,
    };
  }
}

// --- Pump (risk) --------------------------------------------------------------------

const PUMP_BALLOONS = 24;
/** Each colour pops at a random pump from 1 to its limit. */
const PUMP_KINDS = [
  { name: 'small', limit: 8, r: 0.55 },
  { name: 'medium', limit: 20, r: 0.8 },
  { name: 'large', limit: 48, r: 1 },
];

class Pump implements Mini {
  private env!: MiniEnv;
  private order: number[] = [];
  private i = 0;
  private kind = 0;
  private popAt = 0;
  private pumps = 0;
  private bank = 0;
  private state = 0; // 0 pumping, 1 banked, 2 popped
  private at = 0;
  private stats = PUMP_KINDS.map(() => ({ banked: [] as number[], popped: 0 }));
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    // Eight of each, shuffled.
    for (let k = 0; k < scaled(PUMP_BALLOONS); k++) this.order.push(k % PUMP_KINDS.length);
    shuffle(this.order);
    this.make(now);
  }

  private make(_now: number): void {
    this.kind = this.order[this.i]!;
    this.popAt = rint(1, PUMP_KINDS[this.kind]!.limit);
    this.pumps = 0;
    this.state = 0;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (s === 0 || this.state !== 0) return;
    if (s > 0) {
      this.pumps++;
      if (this.pumps >= this.popAt) {
        this.stats[this.kind]!.popped++;
        this.env.sound(SND_FALL);
        this.state = 2;
        this.at = ts + 900;
      } else this.env.sound(SND_TAP_WEAK);
    } else if (this.pumps > 0) {
      this.bank += this.pumps;
      this.stats[this.kind]!.banked.push(this.pumps);
      this.env.sound(SND_RING + Math.min(4, Math.floor(this.pumps / 6)));
      this.state = 1;
      this.at = ts + 700;
    }
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state !== 0 && now >= this.at) {
      this.i++;
      if (this.i >= scaled(PUMP_BALLOONS)) return true;
      this.make(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'banked', String(this.bank), 'balloon', `${Math.min(this.i + 1, scaled(PUMP_BALLOONS))} / ${scaled(PUMP_BALLOONS)}`);
    const K = PUMP_KINDS[this.kind]!;
    const maxR = Math.min(120 * a.u, (a.bottom - a.top) / 2 - 40 * a.u);
    // Size grows with pumps relative to the large balloon's limit; small balloons start smaller.
    const base = 18 * a.u * K.r + 10 * a.u;
    const r = Math.min(maxR, base + (maxR - base) * Math.sqrt(this.pumps / PUMP_KINDS[2]!.limit));
    const by = a.cy - 10 * a.u;
    if (this.state === 2) {
      ctx.strokeStyle = COL_ACCENT;
      ctx.lineWidth = 2 * v.dpr;
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const t = (k / 10) * TAU;
        ctx.moveTo(a.cx + Math.cos(t) * r * 0.5, by + Math.sin(t) * r * 0.5);
        ctx.lineTo(a.cx + Math.cos(t) * r * 1.1, by + Math.sin(t) * r * 1.1);
      }
      ctx.stroke();
      ctx.fillStyle = COL_ACCENT;
      v.text(`popped at ${this.pumps}  ·  lost ${this.pumps - 1 > 0 ? this.pumps - 1 : 0}`, a.cx, by + maxR + 34 * a.u, v.fontTiny, 'center');
    } else {
      ctx.strokeStyle = this.state === 1 ? COL_MID : COL_LINE;
      ctx.lineWidth = (K.name === 'small' ? 1 : K.name === 'medium' ? 2 : 3) * v.dpr;
      ctx.beginPath();
      ctx.ellipse(a.cx, by, r * 0.92, r, 0, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(a.cx, by + r);
      ctx.lineTo(a.cx, by + r + 26 * a.u);
      ctx.stroke();
      ctx.fillStyle = COL_LINE;
      v.text(String(this.pumps), a.cx, by + 8 * v.dpr, v.fontBig, 'center');
      ctx.fillStyle = COL_MID;
      v.text(this.state === 1 ? `banked ${this.pumps}` : `${K.name} balloon`, a.cx, by + maxR + 34 * a.u, v.fontTiny, 'center');
    }
    ctx.fillStyle = COL_MID;
    const off = Math.min(220 * a.u, (a.right - a.left) / 2 - 30 * a.u);
    v.text(`${handLabel(this.env, -1)}  bank`, a.cx - off, a.bottom - 10 * a.u, v.fontTiny, 'center');
    v.text(`pump  ${handLabel(this.env, 1)}`, a.cx + off, a.bottom - 10 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const played = this.stats.reduce((n, s) => n + s.banked.length + s.popped, 0);
    // The best you could expect: bank at the pump that maximises n * P(no pop before n).
    const ideal = PUMP_KINDS.map((k) => {
      let best = 0;
      for (let n = 1; n <= k.limit; n++) best = Math.max(best, n * (1 - n / k.limit));
      return best;
    });
    const per = PUMP_KINDS.map((_, k) => this.stats[k]!);
    return {
      score: played >= 6 ? this.bank * 3 : 0,
      primary: { label: 'points banked', value: this.bank, unit: 'pts' },
      series: { label: 'average pumps when you banked', names: PUMP_KINDS.map((k) => k.name), values: per.map((s) => Math.round(mean(s.banked) * 10) / 10), unit: 'pumps', decimals: 1 },
      lines: [
        ...PUMP_KINDS.map((k, i) => ({
          label: `${k.name} (pops by ${k.limit}): banked at, popped`,
          value: `${per[i]!.banked.length ? mean(per[i]!.banked).toFixed(1) : '–'}  ·  ${per[i]!.popped} popped  ·  best is about ${Math.round(k.limit / 2)}`,
        })),
        { label: 'share of the expected best', value: played ? pct(this.bank / (ideal.reduce((x, y) => x + y, 0) * (played / PUMP_KINDS.length))) : '–' },
      ],
      saved: played >= 6,
    };
  }
}

// --- Remind (prospective memory) ----------------------------------------------------

const REMIND_TRIALS = 60;
const REMIND_CUES = 7;
const CHORD_MS = 160;

class Remind implements Mini {
  private env!: MiniEnv;
  private cues = new Set<number>();
  private i = 0;
  private state = 0; // 0 rule card, 1 stimulus, 2 gap
  private at = 0;
  private num = 0;
  private shownAt = 0;
  /** First press of a pending answer, waiting to see if the other hand joins it. */
  private first = 0;
  private firstAt = 0;
  private answered = false;
  private fb = '';
  private fbOk = true;
  private fbAt = 0;
  private ongoingRight = 0;
  private ongoingAll = 0;
  private rts: number[] = [];
  private caught = 0;
  private falseChords = 0;
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    // Cues spread through the run, never in the first eight trials.
    const slots = shuffle([...Array(scaled(REMIND_TRIALS) - 10).keys()].map((k) => k + 8));
    for (const s of slots) {
      if (this.cues.size >= scaled(REMIND_CUES)) break;
      if (![...this.cues].some((c) => Math.abs(c - s) < 4)) this.cues.add(s);
    }
    this.state = 0;
    this.at = now + 4000;
  }

  private show(now: number): void {
    let n = rint(1, 9);
    while (n === this.num) n = rint(1, 9);
    this.num = n;
    this.state = 1;
    this.shownAt = now;
    this.answered = false;
    this.first = 0;
  }

  private settle(chord: boolean, side: number, ts: number): void {
    if (this.answered) return;
    this.answered = true;
    const cue = this.cues.has(this.i);
    if (cue) {
      if (chord) this.caught++;
      this.fb = chord ? 'remembered' : 'that one was boxed: both hands';
      this.fbOk = chord;
      this.env.sound(chord ? SND_CATCH : SND_FALSE);
    } else if (chord) {
      this.falseChords++;
      this.fb = 'both hands only for a boxed number';
      this.fbOk = false;
      this.env.sound(SND_FALSE);
    } else {
      const ok = (side > 0) === (this.num % 2 === 0);
      this.ongoingAll++;
      if (ok) {
        this.ongoingRight++;
        this.rts.push(ts - this.shownAt);
        this.env.sound(side < 0 ? SND_TAP_L : SND_TAP_R);
        this.fb = '';
      } else {
        this.fb = this.num % 2 === 0 ? 'even' : 'odd';
        this.fbOk = false;
        this.env.sound(SND_FALSE);
      }
    }
    this.fbAt = ts;
    this.state = 2;
    this.at = ts + 350;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (s === 0) return;
    if (this.state === 0) {
      this.at = Math.min(this.at, ts + 300);
      return;
    }
    if (this.state !== 1 || this.answered) return;
    if (ts - this.shownAt < ANTICIPATION_MS) return;
    if (!this.first) {
      this.first = s;
      this.firstAt = ts;
    } else if (s !== this.first && ts - this.firstAt <= CHORD_MS) this.settle(true, 0, ts);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 1 && this.first && !this.answered && now - this.firstAt > CHORD_MS) this.settle(false, this.first, this.firstAt);
    if (this.state === 0 && now >= this.at) this.show(now);
    else if (this.state === 1 && !this.answered && now - this.shownAt > 2200) {
      // Too slow: a missed cue, or a missed ongoing trial.
      this.answered = true;
      if (!this.cues.has(this.i)) this.ongoingAll++;
      this.fb = this.cues.has(this.i) ? 'that one was boxed: both hands' : 'too slow';
      this.fbOk = false;
      this.fbAt = now;
      this.state = 2;
      this.at = now + 350;
    } else if (this.state === 2 && now >= this.at) {
      this.i++;
      if (this.i >= scaled(REMIND_TRIALS)) return true;
      this.show(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'odd / even right', this.ongoingAll ? pct(this.ongoingRight / this.ongoingAll) : '–', 'number', `${Math.min(this.i + 1, scaled(REMIND_TRIALS))} / ${scaled(REMIND_TRIALS)}`);
    if (this.state === 0) {
      message(v, { ...a, cy: a.cy - 50 * a.u }, 'odd: left  ·  even: right', 'as fast as you can');
      ctx.fillStyle = COL_ACCENT;
      v.text('and if a number comes in a box: both hands at once', a.cx, a.cy + 30 * a.u, v.fontHud, 'center');
      ctx.fillStyle = COL_MID;
      v.text('the boxes are rare. remember the rule anyway', a.cx, a.cy + 56 * a.u, v.fontTiny, 'center');
    } else {
      if (this.state === 1) {
        ctx.fillStyle = COL_LINE;
        v.text(String(this.num), a.cx, a.cy + 16 * v.dpr, v.fontBig, 'center');
        if (this.cues.has(this.i)) {
          const b = 46 * a.u;
          ctx.strokeStyle = COL_LINE;
          ctx.lineWidth = 1.5 * v.dpr;
          ctx.strokeRect(a.cx - b, a.cy - b, b * 2, b * 2);
        }
      }
      if (this.fb && now - this.fbAt < 900) {
        ctx.fillStyle = this.fbOk ? COL_MID : COL_ACCENT;
        v.text(this.fb, a.cx, a.cy + 90 * a.u, v.fontTiny, 'center');
      }
      ctx.fillStyle = COL_DIM;
      const off = Math.min(200 * a.u, (a.right - a.left) / 2 - 30 * a.u);
      v.text(`${handLabel(this.env, -1)}  odd`, a.cx - off, a.bottom - 10 * a.u, v.fontTiny, 'center');
      v.text(`even  ${handLabel(this.env, 1)}`, a.cx + off, a.bottom - 10 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const seen = [...this.cues].filter((c) => c < this.i).length;
    const share = seen ? this.caught / seen : 0;
    return {
      score: seen >= 3 ? Math.max(0, Math.round(this.caught * 60 + this.ongoingRight * 3 - this.falseChords * 20)) : 0,
      primary: { label: 'boxed numbers remembered', value: Math.round(share * 100), unit: '%' },
      lines: [
        { label: 'boxes caught', value: `${this.caught} of ${seen}` },
        { label: 'odd / even right', value: this.ongoingAll ? `${this.ongoingRight} of ${this.ongoingAll}` : '–' },
        { label: 'odd / even median', value: ms(median(this.rts)) },
        { label: 'both hands when not boxed', value: String(this.falseChords) },
      ],
      rts: this.rts,
      saved: seen >= 3,
    };
  }
}

export const BATCH21: MiniDef[] = [
  {
    id: 'code',
    name: 'Code',
    skill: 'speed',
    blurb: 'A symbol for each key. Turn symbols into presses as fast as you can.',
    how: 'Each of your keys has a symbol above it. A symbol appears in the middle: press its key. One minute; every twenty seconds the symbols swap keys, so you cannot just learn them. Scored on symbols coded per minute. Speed of thought rather than of fingers.',
    input: 'keys',
    minKeys: 4,
    make: () => new Code(),
  },
  {
    id: 'flow',
    name: 'Flow',
    skill: 'judgement',
    blurb: 'A cloud of jittering dots. Which way are most of them drifting?',
    how: 'Some of the dots drift left or right together; the rest wander at random. Press the side they drift to (left hand left, right hand right). Get it right and fewer dots move together; the score is how few you still need.',
    input: 'keys',
    minKeys: 2,
    make: () => new Flow(),
  },
  {
    id: 'away',
    name: 'Away',
    skill: 'attention',
    blurb: 'A flash grabs your eyes. The arrow you must read is on the other side.',
    how: 'A box flashes on one side, then an arrow shows for a moment in one of the boxes and is covered. Press the way it pointed. In SAME SIDE blocks the arrow is where the flash was; in OTHER SIDE blocks it is opposite, so you have to look away from the flash at once. The arrow gets briefer as you get it right.',
    input: 'keys',
    minKeys: 2,
    make: () => new Away(),
  },
  {
    id: 'late',
    name: 'Late',
    skill: 'timing',
    blurb: 'Six beats by ear. Were they even, or did one land late?',
    how: 'Listen to six clicks. Half the time one of them lands a little late. Left hand for even, right hand for late. Get it right and the late beat gets closer to on time; the score is the smallest lateness you can hear. Best with sound on; without it you watch flashes instead.',
    input: 'keys',
    minKeys: 2,
    make: () => new Late(),
  },
  {
    id: 'pump',
    name: 'Pump',
    skill: 'judgement',
    blurb: 'Pump a balloon for points; bank before it pops. Each size has its own risk.',
    how: 'Right hand pumps: one point a pump. Left hand banks what the balloon holds. Pump once too often and it pops and you lose it. Small balloons pop by eight pumps at the latest, medium by twenty, large by forty-eight, at a random point. Twenty-four balloons; learn how far to push each size.',
    input: 'keys',
    minKeys: 2,
    make: () => new Pump(),
  },
  {
    id: 'remind',
    name: 'Remind',
    skill: 'memory',
    blurb: 'Sort numbers odd or even, and remember the rule for the rare boxed one.',
    how: 'Numbers come quickly: left hand for odd, right hand for even. Now and then a number comes inside a box: then press both hands at once instead. The boxes are rare, which is the point: remembering to do something at the right moment while busy with something else.',
    input: 'keys',
    minKeys: 2,
    make: () => new Remind(),
  },
];
