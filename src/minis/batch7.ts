// Seventh batch.
//   Sets    (speed)     - four five-second sprints with rests; how well do you hold up?
//   Roll    (speed)     - run through your keys in order, as fast and clean as you can.
//   Offbeat (timing)    - tap exactly between the clicks.
//   Meet    (timing)    - two dots close in at different speeds; press as they touch.
//   Longer  (judgement) - which line is longer? The difference keeps shrinking.
//   More    (judgement) - which cloud has more dots? Counting is too slow.
//   Middle  (judgement) - tap the exact middle of a line.

import { COL_ACCENT, COL_DIM, COL_LINE, COL_MID } from '../config.ts';
import { SND_BEAT, SND_BEAT_UP, SND_CATCH, SND_FALSE, SND_TAP_L, SND_TAP_R, SND_TAP_WEAK } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import {
  Stair,
  arena,
  bigNumber,
  clamp,
  footer,
  header,
  mean,
  message,
  ms,
  pct,
  progress,
  sideOf,
  slotsOf,
  type Mini,
  type MiniDef,
  type MiniEnv,
  type MiniResult,
  scaled,
} from './kit.ts';

const TAU = Math.PI * 2;

// --- Sets -------------------------------------------------------------------------

const SETS = 4;
const SET_MS = 5000;
const REST_MS = 6000;

class Sets implements Mini {
  private env!: MiniEnv;
  private state = 0; // 0 ready / rest, 1 sprint
  private at = 0;
  private set = 0;
  private taps = 0;
  private sprintAt = 0;
  private rates: number[] = [];
  private held = 0;
  private lastBeep = -1;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.at = now + 3000;
  }

  private tap(ts: number): void {
    if (this.state === 1 && ts >= this.sprintAt) this.taps++;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    this.tap(ts);
    if (this.state === 1) this.env.sound(sideOf(slot) > 0 ? SND_TAP_R : SND_TAP_L);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  pointer(_x: number, _y: number, ts: number): void {
    this.tap(ts);
    if (this.state === 1) this.env.sound(SND_TAP_L);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0) {
      const left = Math.ceil((this.at - now) / 1000);
      if (left <= 3 && left >= 1 && left !== this.lastBeep) {
        this.lastBeep = left;
        this.env.sound(SND_BEAT);
      }
      if (now >= this.at) {
        if (this.set >= scaled(SETS)) return true;
        this.state = 1;
        this.sprintAt = this.at;
        this.at += SET_MS;
        this.taps = 0;
        this.env.sound(SND_BEAT_UP);
      }
    } else if (now >= this.at) {
      this.rates.push(this.taps / (SET_MS / 1000));
      this.set++;
      this.state = 0;
      this.lastBeep = -1;
      this.at = this.set >= scaled(SETS) ? now + 600 : now + REST_MS;
      this.env.sound(SND_CATCH);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'set', `${Math.min(this.set + 1, scaled(SETS))} / ${scaled(SETS)}`, 'best', this.rates.length ? `${Math.max(...this.rates).toFixed(1)} /s` : '–');
    if (this.state === 1) {
      const el = Math.max(0.15, (now - this.sprintAt) / 1000);
      bigNumber(v, a.cx, a.cy - 10 * a.u, (this.taps / el).toFixed(1), 'taps / s', COL_ACCENT);
      progress(v, a.cx, a.cy + 60 * a.u, 140 * a.u, clamp((now - this.sprintAt) / SET_MS, 0, 1));
    } else if (this.set < scaled(SETS)) {
      const left = Math.max(0, (this.at - now) / 1000);
      message(v, { ...a, cy: a.cy - 30 * a.u }, this.set === 0 ? 'get ready' : 'rest', `next sprint in ${left.toFixed(left < 3 ? 1 : 0)} s`, COL_MID);
    }
    // Bars for the sets so far.
    const bw = 34 * a.u;
    const gap = 14 * a.u;
    const x0 = a.cx - (scaled(SETS) * bw + (scaled(SETS) - 1) * gap) / 2;
    const base = a.bottom - 30 * a.u;
    const top = Math.max(12, ...this.rates);
    for (let i = 0; i < scaled(SETS); i++) {
      const x = x0 + i * (bw + gap);
      const r = this.rates[i];
      ctx.fillStyle = COL_DIM;
      ctx.fillRect(x, base, bw, dpr);
      if (r !== undefined) {
        const h = (r / top) * 90 * a.u;
        ctx.fillStyle = COL_LINE;
        ctx.fillRect(x, base - h, bw, h);
        ctx.fillStyle = COL_MID;
        v.text(r.toFixed(1), x + bw / 2, base - h - 8 * dpr, v.fontTiny, 'center');
      }
    }
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const peak = this.rates.length ? Math.max(...this.rates) : 0;
    const last = this.rates[this.rates.length - 1] ?? 0;
    const drop = peak ? 1 - last / peak : 0;
    return {
      score: peak > 0 ? Math.round(mean(this.rates) * 40 + (1 - drop) * 100) : 0,
      primary: { label: 'average over the sets', value: mean(this.rates), unit: '/s', decimals: 1 },
      lines: [
        { label: 'best set', value: `${peak.toFixed(1)} taps/s` },
        { label: 'drop from best to last', value: pct(Math.max(0, drop)) },
      ],
      series: { label: 'each sprint', names: this.rates.map((_, i) => `set ${i + 1}`), values: this.rates, unit: 'taps a second', decimals: 1 },
      saved: this.rates.length >= 2 && peak > 0,
    };
  }
}

// --- Roll -------------------------------------------------------------------------

const ROLL_MS = 12000;

class Roll implements Mini {
  private env!: MiniEnv;
  private order: number[] = [];
  private next = 0;
  private good = 0;
  private bad = 0;
  private t0 = 0;
  private held = 0;
  private flash = 0;
  private done = false;

  start(env: MiniEnv): void {
    this.env = env;
    this.order = slotsOf(env.mode).filter((s) => sideOf(s) !== 0);
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (this.done || sideOf(slot) === 0) return;
    if (this.t0 === 0) this.t0 = ts;
    if (ts - this.t0 > ROLL_MS) return;
    if (slot === this.order[this.next]) {
      this.good++;
      this.next = (this.next + 1) % this.order.length;
      this.env.sound(sideOf(slot) > 0 ? SND_TAP_R : SND_TAP_L);
    } else {
      this.bad++;
      this.flash = ts;
      this.env.sound(SND_TAP_WEAK);
    }
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.t0 && now - this.t0 > ROLL_MS) {
      if (!this.done) {
        this.done = true;
        this.env.sound(SND_CATCH);
      }
      if (now - this.t0 > ROLL_MS + 900) return true;
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const el = this.t0 ? Math.max(0.3, Math.min(ROLL_MS, now - this.t0) / 1000) : 0;
    header(v, touch, 'clean', String(this.good), 'slips', String(this.bad));
    bigNumber(v, a.cx, a.cy - 60 * a.u, el ? (this.good / el).toFixed(1) : '0.0', 'keys / s');
    // The keys in order with the next one lit.
    const n = this.order.length;
    const w = 54 * a.u;
    const x0 = a.cx - (n * w) / 2;
    for (let i = 0; i < n; i++) {
      const x = x0 + i * w + w / 2;
      const y = a.cy + 40 * a.u;
      const on = i === this.next;
      ctx.strokeStyle = on ? COL_ACCENT : COL_DIM;
      ctx.lineWidth = (on ? 2 : 1) * dpr;
      ctx.strokeRect(x - 20 * a.u, y - 20 * a.u, 40 * a.u, 40 * a.u);
      ctx.fillStyle = on ? COL_ACCENT : COL_MID;
      v.text(this.env.labels[this.order[i]!] ?? '', x, y + 5 * dpr, v.fontHud, 'center');
    }
    if (now - this.flash < 150) {
      ctx.fillStyle = COL_MID;
      v.text('out of order', a.cx, a.cy + 90 * a.u, v.fontTiny, 'center');
    }
    if (!this.t0) {
      ctx.fillStyle = COL_MID;
      v.text('press the keys in order, round and round. the clock starts on your first press', a.cx, a.cy + 90 * a.u, v.fontTiny, 'center');
    } else progress(v, a.cx, a.bottom - 20 * a.u, 120 * a.u, clamp((now - this.t0) / ROLL_MS, 0, 1));
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const rate = this.good / (ROLL_MS / 1000);
    const acc = this.good / (this.good + this.bad || 1);
    return {
      score: Math.round(rate * 50 * acc),
      primary: { label: 'clean keys per second', value: rate, unit: '/s', decimals: 1 },
      lines: [
        { label: 'clean keys per second', value: rate.toFixed(1) },
        { label: 'accuracy', value: pct(acc) },
        { label: 'out of order', value: String(this.bad) },
      ],
      saved: this.good >= 10,
    };
  }
}

// --- Offbeat ----------------------------------------------------------------------

const OFF_MS = 32000;

class Offbeat implements Mini {
  private env!: MiniEnv;
  private t0 = 0;
  private period = 600;
  private lastBeat = -1;
  private errs: number[] = [];
  private taps: { t: number; e: number }[] = [];
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.period = 60000 / (84 + Math.floor(Math.random() * 30));
    this.t0 = now + 800;
  }

  private tap(ts: number): void {
    const t = ts - this.t0;
    if (t < this.period * 3.5 || t > scaled(OFF_MS)) return;
    const k = Math.round((t - this.period / 2) / this.period);
    const e = t - (k * this.period + this.period / 2);
    this.errs.push(e);
    this.taps.push({ t: ts, e });
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    this.tap(ts);
    this.env.sound(sideOf(slot) > 0 ? SND_TAP_R : SND_TAP_L);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  pointer(_x: number, _y: number, ts: number): void {
    this.tap(ts);
    this.env.sound(SND_TAP_L);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const t = now - this.t0;
    if (t > scaled(OFF_MS) + 700) return true;
    const beat = Math.floor(t / this.period);
    if (t >= 0 && t <= scaled(OFF_MS) && beat !== this.lastBeat) {
      this.lastBeat = beat;
      this.env.sound(beat % 4 === 0 ? SND_BEAT_UP : SND_BEAT);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const recent = this.errs.slice(-10).map(Math.abs);
    header(v, touch, 'off by', recent.length ? ms(mean(recent)) : '–', 'tempo', `${Math.round(60000 / this.period)} bpm`);
    // A hand sweeps once per beat: the click is at the top, the target at the bottom.
    // After twelve seconds the hand goes away (unless muted) and only the clicks are left.
    const R = 70 * a.u;
    const cx = a.cx;
    const cy = a.cy - 10 * a.u;
    const showHand = this.env.muted || t < 12000;
    ctx.strokeStyle = COL_DIM;
    ctx.lineWidth = dpr;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = COL_MID;
    ctx.fillRect(cx - dpr, cy - R - 8 * a.u, 2 * dpr, 16 * a.u);
    ctx.fillStyle = COL_LINE;
    ctx.fillRect(cx - 2 * dpr, cy + R - 10 * a.u, 4 * dpr, 20 * a.u);
    if (showHand && t >= 0) {
      const ph = ((t % this.period) / this.period) * TAU - Math.PI / 2;
      ctx.strokeStyle = COL_MID;
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(ph) * R * 0.9, cy + Math.sin(ph) * R * 0.9);
      ctx.stroke();
    }
    // Recent taps around the target.
    for (const tp of this.taps.slice(-8)) {
      const age = (now - tp.t) / 2500;
      if (age > 1) continue;
      const ang = Math.PI / 2 + (tp.e / this.period) * TAU;
      ctx.globalAlpha = 1 - age;
      ctx.fillStyle = COL_ACCENT;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(ang) * (R + 16 * a.u), cy + Math.sin(ang) * (R + 16 * a.u), 4 * a.u, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = COL_MID;
    if (t < this.period * 4) v.text('listen: tap exactly halfway between the clicks', a.cx, a.cy + 110 * a.u, v.fontTiny, 'center');
    else if (!showHand && t < 15000) v.text('hand gone: keep going by ear', a.cx, a.cy + 110 * a.u, v.fontTiny, 'center');
    progress(v, a.cx, a.bottom - 20 * a.u, 120 * a.u, clamp(t / scaled(OFF_MS), 0, 1));
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const abs = this.errs.map(Math.abs);
    const m = mean(abs);
    const signed = mean(this.errs);
    return {
      score: abs.length ? Math.round(Math.max(0, 160 - m) * 8 + abs.length * 2) : 0,
      primary: { label: 'average error', value: m, unit: 'ms', lower: true },
      lines: [
        { label: 'average error', value: ms(m) },
        { label: 'tendency', value: `${Math.abs(Math.round(signed))} ms ${signed >= 0 ? 'late' : 'early'}` },
        { label: 'within 25 ms', value: pct(abs.filter((x) => x < 25).length / (abs.length || 1)) },
        { label: 'taps', value: String(abs.length) },
      ],
      saved: abs.length >= 10,
    };
  }
}

// --- Meet -------------------------------------------------------------------------

const MEET_TRIALS = 16;

class Meet implements Mini {
  private env!: MiniEnv;
  private state = 0; // 0 moving, 1 feedback
  private t0 = 0;
  private dur = 1500;
  private meetX = 0.5;
  private hideFrom = 1;
  private pressAt = 0;
  private i = 0;
  private errs: number[] = [];
  private at = 0;
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.arm(now + 700);
  }

  private arm(now: number): void {
    this.t0 = now;
    this.dur = 1100 + Math.random() * 1100;
    this.meetX = 0.25 + Math.random() * 0.5;
    // The last part of the approach is hidden, more so as you go.
    this.hideFrom = 1 - Math.min(0.55, 0.08 + this.i * 0.035);
    this.pressAt = 0;
    this.state = 0;
  }

  private hit(ts: number): void {
    if (this.state !== 0 || ts < this.t0) return;
    this.pressAt = ts;
    const e = ts - (this.t0 + this.dur);
    this.errs.push(e);
    this.env.sound(Math.abs(e) < 25 ? SND_CATCH : Math.abs(e) < 70 ? SND_TAP_WEAK : SND_FALSE);
    this.done(ts);
  }

  private done(ts: number): void {
    this.i++;
    this.state = 1;
    this.at = ts + 1100;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    this.hit(ts);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  pointer(_x: number, _y: number, ts: number): void {
    this.hit(ts);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now > this.t0 + this.dur + 500) {
      this.errs.push(500);
      this.env.sound(SND_FALSE);
      this.done(now);
    }
    if (this.state === 1 && now >= this.at) {
      if (this.i >= scaled(MEET_TRIALS)) return true;
      this.arm(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const recent = this.errs.slice(-6).map(Math.abs);
    header(v, touch, 'trial', `${Math.min(this.i + 1, scaled(MEET_TRIALS))} / ${scaled(MEET_TRIALS)}`, 'off by', recent.length ? ms(mean(recent)) : '–');
    const span = Math.min(a.right - a.left, 620 * a.u);
    const x0 = a.cx - span / 2;
    const y = a.cy;
    ctx.fillStyle = COL_DIM;
    ctx.fillRect(x0, y, span, dpr);
    const posAt = (tt: number): [number, number] => {
      const p = clamp((tt - this.t0) / this.dur, 0, 1.4);
      return [x0 + p * this.meetX * span, x0 + span - p * (1 - this.meetX) * span];
    };
    const tt = this.state === 0 ? now : this.pressAt || this.t0 + this.dur + 500;
    const p = (now - this.t0) / this.dur;
    const visible = this.state === 1 || p < this.hideFrom;
    if (visible && now >= this.t0) {
      const [l, r] = posAt(tt);
      ctx.fillStyle = COL_LINE;
      ctx.beginPath();
      ctx.arc(l, y, 7 * a.u, 0, TAU);
      ctx.fill();
      ctx.fillStyle = COL_ACCENT;
      ctx.beginPath();
      ctx.arc(r, y, 7 * a.u, 0, TAU);
      ctx.fill();
    }
    if (this.state === 1) {
      ctx.fillStyle = COL_MID;
      ctx.fillRect(x0 + this.meetX * span - dpr / 2, y - 18 * a.u, dpr, 36 * a.u);
      const e = this.errs[this.errs.length - 1]!;
      message(v, { ...a, cy: a.cy - 60 * a.u }, e >= 500 ? 'missed' : Math.abs(e) < 0.5 ? 'dead on' : `${Math.abs(Math.round(e))} ms ${e >= 0 ? 'late' : 'early'}`, '', COL_MID);
    } else if (this.i === 0) {
      ctx.fillStyle = COL_MID;
      v.text('press the moment the two dots touch. near the end they vanish', a.cx, a.cy + 60 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const abs = this.errs.map(Math.abs);
    const m = mean(abs);
    const signed = mean(this.errs.filter((e) => e < 500));
    return {
      score: abs.length ? Math.round(Math.max(0, 200 - m) * 6) : 0,
      primary: { label: 'average error', value: m, unit: 'ms', lower: true },
      lines: [
        { label: 'average error', value: ms(m) },
        { label: 'tendency', value: `${Math.abs(Math.round(signed))} ms ${signed >= 0 ? 'late' : 'early'}` },
        { label: 'within 30 ms', value: pct(abs.filter((x) => x < 30).length / (abs.length || 1)) },
      ],
      saved: this.i >= 4,
    };
  }
}

// --- Longer -----------------------------------------------------------------------

/** Percentage differences, easy to hard. */
const DIFFS = [24, 20, 16, 13, 10, 8, 6.5, 5, 4, 3.2, 2.5, 2, 1.6, 1.3, 1];
const LONG_TRIALS = 30;

class Longer implements Mini {
  private env!: MiniEnv;
  private readonly st = new Stair(0, 1, 0, DIFFS.length - 1);
  private i = 0;
  private state = 0; // 0 look, 1 feedback
  private t0 = 0;
  private at = 0;
  private longer = -1;
  private len = [0, 0];
  private ang = [0, 0];
  private off = [0, 0];
  private lastOk = false;
  private correct = 0;
  private hist: number[] = [];
  private held = 0;
  private cx = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.arm(now + 500);
  }

  private arm(now: number): void {
    const d = DIFFS[this.st.level]! / 100;
    const base = 0.55 + Math.random() * 0.35;
    this.longer = Math.random() < 0.5 ? -1 : 1;
    this.len = this.longer < 0 ? [base * (1 + d), base] : [base, base * (1 + d)];
    // Later on the lines tilt independently, which makes it much harder.
    const tilt = this.i >= 8;
    this.ang = [tilt ? Math.random() * Math.PI : 0, tilt ? Math.random() * Math.PI : 0];
    this.off = [(Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3];
    this.t0 = now;
    this.state = 0;
  }

  private answer(side: number, ts: number): void {
    if (this.state !== 0 || side === 0 || ts < this.t0) return;
    this.lastOk = side === this.longer;
    if (this.lastOk) this.correct++;
    this.hist.push(DIFFS[this.st.level]!);
    this.st.update(this.lastOk);
    this.env.sound(this.lastOk ? SND_CATCH : SND_FALSE);
    this.i++;
    this.state = 1;
    this.at = ts + 650;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    this.answer(sideOf(slot), ts);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  pointer(x: number, _y: number, ts: number): void {
    this.answer(x < this.cx ? -1 : 1, ts);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now - this.t0 > 5000) this.answer(-this.longer, now);
    if (this.state === 1 && now >= this.at) {
      if (this.i >= scaled(LONG_TRIALS)) return true;
      this.arm(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    this.cx = a.cx;
    header(v, touch, 'difference', `${DIFFS[this.st.level]}%`, 'trial', `${Math.min(this.i + 1, scaled(LONG_TRIALS))} / ${scaled(LONG_TRIALS)}`);
    const half = Math.min((a.right - a.left) / 4, 200 * a.u);
    const scale = Math.min(half * 1.5, (a.bottom - a.top) * 0.7);
    for (let s = 0; s < 2; s++) {
      const cx = a.cx + (s ? 1 : -1) * half + this.off[s]! * half * 0.5;
      const cy = a.cy + this.off[1 - s]! * 60 * a.u;
      const L = this.len[s]! * scale;
      const c = Math.cos(this.ang[s]!);
      const sn = Math.sin(this.ang[s]!);
      const pick = this.state === 1 && (s ? 1 : -1) === this.longer;
      ctx.strokeStyle = pick ? (this.lastOk ? COL_LINE : COL_ACCENT) : this.state === 1 ? COL_MID : COL_LINE;
      ctx.lineWidth = 3 * dpr;
      ctx.beginPath();
      ctx.moveTo(cx - (c * L) / 2, cy - (sn * L) / 2);
      ctx.lineTo(cx + (c * L) / 2, cy + (sn * L) / 2);
      ctx.stroke();
    }
    ctx.fillStyle = COL_DIM;
    ctx.fillRect(a.cx - dpr / 2, a.cy - 100 * a.u, dpr, 200 * a.u);
    if (this.i === 0) {
      ctx.fillStyle = COL_MID;
      v.text('which line is longer? left hand or right hand (or tap that side)', a.cx, a.bottom - 30 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const tail = this.hist.slice(-12);
    const thr = tail.length ? mean(tail) : 0;
    return {
      score: this.correct ? Math.round(this.correct * 10 + (thr ? Math.max(0, 25 - thr) * 20 : 0)) : 0,
      primary: { label: 'smallest reliable difference', value: thr, unit: '%', lower: true, decimals: 1 },
      lines: [
        { label: 'difference you can tell (last 12)', value: `${thr.toFixed(1)}%` },
        { label: 'correct', value: `${this.correct} of ${this.i}` },
      ],
      saved: this.i >= 10,
    };
  }
}

// --- More -------------------------------------------------------------------------

/** Ratios of the bigger cloud to the smaller, easy to hard. */
const RATIOS = [2, 1.75, 1.55, 1.4, 1.3, 1.22, 1.16, 1.12, 1.09, 1.07, 1.05];
const MORE_TRIALS = 30;

class More implements Mini {
  private env!: MiniEnv;
  private readonly st = new Stair(0, 1, 0, RATIOS.length - 1);
  private i = 0;
  private state = 0; // 0 show, 1 answer, 2 feedback
  private t0 = 0;
  private at = 0;
  private more = -1;
  private dots: [number[], number[]] = [[], []];
  private counts = [0, 0];
  private lastOk = false;
  private correct = 0;
  private hist: number[] = [];
  private held = 0;
  private cx = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.arm(now + 500);
  }

  private arm(now: number): void {
    const r = RATIOS[this.st.level]!;
    const small = 10 + Math.floor(Math.random() * 12);
    const big = Math.max(small + 1, Math.round(small * r));
    this.more = Math.random() < 0.5 ? -1 : 1;
    this.counts = this.more < 0 ? [big, small] : [small, big];
    // Half the time the dots have equal total area, so size is no clue.
    const sameArea = Math.random() < 0.5;
    for (let s = 0; s < 2; s++) {
      const n = this.counts[s]!;
      const rad = sameArea ? 0.035 * Math.sqrt(16 / n) : 0.022 + Math.random() * 0.012;
      const out: number[] = [];
      let guard = 0;
      while (out.length < n * 3 && guard++ < 5000) {
        const x = 0.08 + Math.random() * 0.84;
        const y = 0.08 + Math.random() * 0.84;
        let ok = true;
        for (let k = 0; k < out.length; k += 3) if (Math.hypot(out[k]! - x, out[k + 1]! - y) < rad + out[k + 2]! + 0.01) ok = false;
        if (ok) out.push(x, y, rad * (0.8 + Math.random() * 0.4));
      }
      this.dots[s] = out;
    }
    this.t0 = now;
    this.state = 0;
  }

  private answer(side: number, ts: number): void {
    if (this.state === 2 || side === 0 || ts < this.t0) return;
    this.lastOk = side === this.more;
    if (this.lastOk) this.correct++;
    this.hist.push(RATIOS[this.st.level]!);
    this.st.update(this.lastOk);
    this.env.sound(this.lastOk ? SND_CATCH : SND_FALSE);
    this.i++;
    this.state = 2;
    this.at = ts + 900;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    this.answer(sideOf(slot), ts);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  pointer(x: number, _y: number, ts: number): void {
    this.answer(x < this.cx ? -1 : 1, ts);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now - this.t0 > 750) this.state = 1;
    if (this.state === 1 && now - this.t0 > 6000) this.answer(-this.more, now);
    if (this.state === 2 && now >= this.at) {
      if (this.i >= scaled(MORE_TRIALS)) return true;
      this.arm(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    this.cx = a.cx;
    header(v, touch, 'ratio', `${RATIOS[this.st.level]!.toFixed(2)}`, 'trial', `${Math.min(this.i + 1, scaled(MORE_TRIALS))} / ${scaled(MORE_TRIALS)}`);
    const box = Math.min((a.right - a.left) / 2 - 24 * a.u, a.bottom - a.top - 60 * a.u, 300 * a.u);
    for (let s = 0; s < 2; s++) {
      const x0 = a.cx + (s ? 12 * a.u : -12 * a.u - box);
      const y0 = a.cy - box / 2;
      ctx.strokeStyle = this.state === 2 && (s ? 1 : -1) === this.more ? (this.lastOk ? COL_LINE : COL_ACCENT) : COL_DIM;
      ctx.lineWidth = dpr;
      ctx.strokeRect(x0 + 0.5, y0 + 0.5, box - 1, box - 1);
      if (this.state === 0) {
        ctx.fillStyle = COL_LINE;
        const d = this.dots[s];
        for (let k = 0; k < d.length; k += 3) {
          ctx.beginPath();
          ctx.arc(x0 + d[k]! * box, y0 + d[k + 1]! * box, d[k + 2]! * box, 0, TAU);
          ctx.fill();
        }
      } else if (this.state === 2) {
        ctx.fillStyle = COL_MID;
        v.text(String(this.counts[s]), x0 + box / 2, a.cy + 6 * dpr, v.fontHud, 'center');
      }
    }
    if (this.i === 0) {
      ctx.fillStyle = COL_MID;
      v.text('which side had more dots? no time to count: go with your gut', a.cx, a.bottom - 14 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const tail = this.hist.slice(-12);
    const thr = tail.length ? mean(tail) : 0;
    return {
      score: Math.round(this.correct * 10 + (thr ? Math.max(0, 2 - thr) * 300 : 0)),
      primary: { label: 'smallest reliable ratio', value: thr, unit: '', lower: true, decimals: 2 },
      lines: [
        { label: 'ratio you can tell (last 12)', value: thr ? `${thr.toFixed(2)} : 1` : '–' },
        { label: 'correct', value: `${this.correct} of ${this.i}` },
      ],
      saved: this.i >= 10,
    };
  }
}

// --- Middle -----------------------------------------------------------------------

const MID_TRIALS = 15;

class Middle implements Mini {
  private env!: MiniEnv;
  private i = 0;
  private state = 0; // 0 aim, 1 feedback
  private at = 0;
  private line = { x: 0, y: 0, ang: 0, len: 0 };
  private geo = { x: 0, y: 0, c: 1, s: 0, L: 1 };
  private tapX = 0;
  private tapY = 0;
  private errs: number[] = [];

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.arm(now);
  }

  private arm(_now: number): void {
    const tilt = this.i >= 5;
    this.line = {
      x: 0.3 + Math.random() * 0.4,
      y: 0.3 + Math.random() * 0.4,
      ang: tilt ? Math.random() * Math.PI : 0,
      len: 0.35 + Math.random() * 0.45,
    };
    this.state = 0;
  }

  press(): void {}

  pointer(px: number, py: number, ts: number): void {
    if (this.state !== 0) return;
    const g = this.geo;
    const dx = px - g.x;
    const dy = py - g.y;
    const along = dx * g.c + dy * g.s;
    const across = -dx * g.s + dy * g.c;
    if (Math.abs(across) > g.L * 0.25 || Math.abs(along) > g.L * 0.6) return;
    const e = along / g.L;
    this.errs.push(e);
    this.tapX = px;
    this.tapY = py;
    this.env.sound(Math.abs(e) < 0.01 ? SND_CATCH : Math.abs(e) < 0.03 ? SND_TAP_WEAK : SND_FALSE);
    this.i++;
    this.state = 1;
    this.at = ts + 1000;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 1 && now >= this.at) {
      if (this.i >= scaled(MID_TRIALS)) return true;
      this.arm(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const recent = this.errs.slice(-5).map(Math.abs);
    header(v, touch, 'trial', `${Math.min(this.i + 1, scaled(MID_TRIALS))} / ${scaled(MID_TRIALS)}`, 'off by', recent.length ? pct(mean(recent)) : '–');
    const w = a.right - a.left;
    const h = a.bottom - a.top;
    const L = this.line.len * Math.min(w, h * 1.4);
    const x = a.left + this.line.x * w;
    const y = a.top + this.line.y * h;
    const c = Math.cos(this.line.ang);
    const s = Math.sin(this.line.ang);
    this.geo = { x, y, c, s, L };
    ctx.strokeStyle = COL_LINE;
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.moveTo(x - (c * L) / 2, y - (s * L) / 2);
    ctx.lineTo(x + (c * L) / 2, y + (s * L) / 2);
    ctx.stroke();
    if (this.state === 1) {
      ctx.strokeStyle = COL_MID;
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      ctx.moveTo(x + s * 14 * a.u, y - c * 14 * a.u);
      ctx.lineTo(x - s * 14 * a.u, y + c * 14 * a.u);
      ctx.stroke();
      ctx.fillStyle = COL_ACCENT;
      ctx.beginPath();
      ctx.arc(this.tapX, this.tapY, 4 * a.u, 0, TAU);
      ctx.fill();
      const e = this.errs[this.errs.length - 1]!;
      ctx.fillStyle = COL_MID;
      v.text(`${(Math.abs(e) * 100).toFixed(1)}% off`, a.cx, a.bottom - 20 * a.u, v.fontTiny, 'center');
    } else if (this.i === 0) {
      ctx.fillStyle = COL_MID;
      v.text('tap the exact middle of the line', a.cx, a.bottom - 20 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const abs = this.errs.map(Math.abs);
    const m = mean(abs);
    const bias = mean(this.errs);
    return {
      score: abs.length ? Math.round(Math.max(0, 0.08 - m) * 12000) : 0,
      primary: { label: 'average error', value: m * 100, unit: '%', lower: true, decimals: 1 },
      lines: [
        { label: 'average error (share of the line)', value: `${(m * 100).toFixed(1)}%` },
        { label: 'within 1%', value: pct(abs.filter((e) => e < 0.01).length / (abs.length || 1)) },
        { label: 'lean', value: Math.abs(bias) < 0.002 ? 'none' : `${(Math.abs(bias) * 100).toFixed(1)}% to the ${bias < 0 ? 'left / top' : 'right / bottom'}` },
      ],
      saved: this.i >= 4,
    };
  }
}

export const BATCH7: MiniDef[] = [
  {
    id: 'sets',
    name: 'Sets',
    skill: 'speed',
    blurb: 'Four five-second sprints with short rests. Can you hold your speed?',
    how: 'Tap as fast as you can for five seconds, rest for six, four times over. Scored on your average; the drop from your best set to your last shows how well you hold up.',
    input: 'both',
    make: () => new Sets(),
  },
  {
    id: 'roll',
    name: 'Roll',
    skill: 'speed',
    blurb: 'Run through your keys in order, round and round, fast and clean.',
    how: 'Press your keys in order, left to right, over and over, for twelve seconds. A key out of order does not count. With two keys it is strict alternation; with more it is a finger roll.',
    input: 'keys',
    minKeys: 2,
    make: () => new Roll(),
  },
  {
    id: 'offbeat',
    name: 'Offbeat',
    skill: 'timing',
    blurb: 'Tap exactly halfway between the clicks.',
    how: 'A metronome clicks. Tap on the offbeat, exactly halfway between clicks. A hand helps at first, then goes away and only your ear is left. Turn the sound on for this one.',
    input: 'both',
    make: () => new Offbeat(),
  },
  {
    id: 'meet',
    name: 'Meet',
    skill: 'timing',
    blurb: 'Two dots close in at different speeds. Press as they touch.',
    how: 'Two dots slide toward each other at different speeds. Press the moment they meet. Near the end they vanish, and the vanishing part grows as you go.',
    input: 'both',
    make: () => new Meet(),
  },
  {
    id: 'longer',
    name: 'Longer',
    skill: 'judgement',
    blurb: 'Which line is longer? The difference keeps shrinking.',
    how: 'Two lines, one a little longer. Answer with that hand, or tap that side. Get it right and the difference shrinks; later the lines tilt. Scored on the smallest difference you can reliably see.',
    input: 'both',
    minKeys: 2,
    make: () => new Longer(),
  },
  {
    id: 'more',
    name: 'More',
    skill: 'judgement',
    blurb: 'Which cloud had more dots? There is no time to count.',
    how: 'Two clouds of dots flash for a moment. Which had more? Answer with that hand or tap that side. Dot size is no help: half the time both clouds have the same total area. The ratio tightens as you get it right.',
    input: 'both',
    minKeys: 2,
    make: () => new More(),
  },
  {
    id: 'middle',
    name: 'Middle',
    skill: 'judgement',
    blurb: 'Tap the exact middle of a line.',
    how: 'A line appears. Tap its exact middle. After a few, the lines tilt. Most people lean slightly to one side; the results show yours.',
    input: 'pointer',
    make: () => new Middle(),
  },
];
