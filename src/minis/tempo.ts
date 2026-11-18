// Speed and timing games.
//   Sprint - ten seconds flat out.
//   Pulse  - follow a target tap rate that keeps changing, including full stops.
//   Tempo  - tap along to a beat, then keep it going after it goes silent.
//   Cross  - press exactly when a moving dot crosses the line, even once it vanishes.

import { COL_ACCENT, COL_DIM, COL_LINE, COL_MID } from '../config.ts';
import { SND_BEAT, SND_BEAT_UP, SND_CATCH, SND_TAP_L, SND_TAP_R, SND_TAP_WEAK, SND_UI } from '../audio.ts';
import type { View } from '../render.ts';
import { cpsStats, peakRate, sustainedRate } from '../stats.ts';
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
} from './kit.ts';

function tapSound(env: MiniEnv, slot: number): void {
  env.sound(sideOf(slot) > 0 ? SND_TAP_R : SND_TAP_L);
}

/** Taps in the last `win` ms, as taps per second. */
function rateAt(times: readonly number[], now: number, win: number): number {
  let c = 0;
  for (let i = times.length - 1; i >= 0 && now - times[i]! <= win; i--) c++;
  return (c * 1000) / win;
}

// --- Sprint -----------------------------------------------------------------------

const SPRINT_MS = 10000;

class Sprint implements Mini {
  private env!: MiniEnv;
  private t0 = 0;
  private times: number[] = [];
  private keys: number[] = [];
  private trace: number[] = [];
  private held = 0;
  private over = false;
  private endAt = 0;

  start(env: MiniEnv): void {
    this.env = env;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (this.over || slot === 6) return;
    if (this.t0 === 0) this.t0 = ts;
    if (ts - this.t0 > SPRINT_MS) return;
    this.times.push(ts - this.t0);
    this.keys.push(slot);
    tapSound(this.env, slot);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const t = this.t0 ? now - this.t0 : 0;
    if (this.t0 && !this.over && t >= SPRINT_MS) {
      this.over = true;
      this.endAt = now + 900;
      this.env.sound(SND_UI);
    }
    if (this.over && now >= this.endAt) return true;
    if (this.t0 && !this.over) {
      const slot = Math.floor(t / 100);
      while (this.trace.length <= slot) this.trace.push(rateAt(this.times, t, 1000));
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'taps', String(this.times.length), 'time', `${(Math.max(0, SPRINT_MS - t) / 1000).toFixed(1)} s`);
    const rate = this.t0 ? rateAt(this.times, Math.min(t, SPRINT_MS), 1000) : 0;
    bigNumber(v, a.cx, a.cy - 40 * a.u, this.t0 ? rate.toFixed(0) : 'tap to start', this.t0 ? 'per second' : '', this.t0 ? COL_LINE : COL_MID);
    progress(v, a.cx, a.cy - 10 * a.u, 160 * a.u, t / SPRINT_MS);
    // The rate trace over the ten seconds.
    const gw = Math.min(a.right - a.left, 520 * a.u);
    const gh = Math.min(140 * a.u, a.bottom - a.cy - 40 * a.u);
    const gx = a.cx - gw / 2;
    const gy = a.cy + 30 * a.u + gh;
    ctx.fillStyle = COL_DIM;
    ctx.fillRect(gx, gy, gw, dpr);
    let top = 12;
    for (const r of this.trace) if (r > top) top = r;
    ctx.strokeStyle = COL_LINE;
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    this.trace.forEach((r, i) => {
      const x = gx + (i / 100) * gw;
      const y = gy - (r / top) * gh;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.stroke();
    ctx.fillStyle = COL_DIM;
    v.text(`${top.toFixed(0)}/s`, gx, gy - gh - 4 * dpr, v.fontTiny, 'left');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const n = this.times.length;
    const slots = slotsOf(this.env.mode).filter((s) => s !== 6);
    const c = cpsStats(this.times, this.keys, n, slots, this.env.mode.left === 1 && this.env.mode.right === 1);
    const early = this.times.filter((x) => x < 3000).length / 3;
    const late = this.times.filter((x) => x >= 7000).length / 3;
    const lines = [
      { label: 'taps', value: String(n) },
      { label: 'average', value: `${(n / (SPRINT_MS / 1000)).toFixed(1)} /s` },
      { label: 'peak second', value: `${peakRate(this.times, n)} /s` },
      { label: 'best 5 s', value: `${sustainedRate(this.times, n, 5000).toFixed(1)} /s` },
      { label: 'fade (last 3 s vs first 3 s)', value: early ? pct(late / early - 1) : '–' },
    ];
    if (slots.length > 1) {
      lines.push({ label: 'hand balance', value: pct(c.handEvenness) });
      if (c.alternations) lines.push({ label: 'repeated keys', value: `${c.repeats} (${pct(c.repeatRate)})` });
    }
    return { score: n * 10, primary: { label: 'taps in 10 s', value: n, unit: '' }, lines, saved: n >= 10 };
  }
}

// --- Pulse ------------------------------------------------------------------------

const PULSE_MS = 36000;

interface Seg {
  from: number;
  to: number;
  rate: number;
}

class Pulse implements Mini {
  private env!: MiniEnv;
  private segs: Seg[] = [];
  private t0 = 0;
  private times: number[] = [];
  private onTime = 0;
  private lastT = 0;
  private trace: number[] = [];
  private held = 0;
  private stops = 0;
  private stopsHeld = 0;
  private inStop = false;
  private stopBroken = false;
  private stopFrom = 0;

  start(env: MiniEnv): void {
    this.env = env;
    // Targets scale with how many keys share the work.
    const keys = env.mode.left + env.mode.right;
    const lo = keys <= 1 ? 3 : keys === 2 ? 4 : 6;
    const hi = keys <= 1 ? 7 : keys === 2 ? 10 : keys === 4 ? 14 : 17;
    let t = 2500;
    this.segs.push({ from: 0, to: t, rate: lo });
    let last = lo;
    while (t < PULSE_MS) {
      const len = 2200 + Math.random() * 1800;
      let rate: number;
      do {
        rate = Math.random() < 0.22 ? 0 : Math.round(lo + Math.random() * (hi - lo));
      } while (rate === last || (rate === 0 && last === 0));
      this.segs.push({ from: t, to: Math.min(PULSE_MS, t + len), rate });
      last = rate;
      t += len;
    }
  }

  private target(t: number): number {
    for (const s of this.segs) if (t >= s.from && t < s.to) return s.rate;
    return 0;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (slot === 6) return;
    if (this.t0 === 0) this.t0 = ts;
    const t = ts - this.t0;
    if (t > PULSE_MS) return;
    this.times.push(t);
    tapSound(this.env, slot);
    // A stop only counts as broken after a short reaction grace.
    if (this.inStop && t - this.stopFrom > 250) this.stopBroken = true;
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const t = this.t0 ? now - this.t0 : 0;
    if (this.t0 && t >= PULSE_MS + 600) return true;
    if (this.t0 && t <= PULSE_MS) {
      const dt = Math.max(0, Math.min(100, t - this.lastT));
      this.lastT = t;
      const target = this.target(t);
      const rate = rateAt(this.times, t, 800);
      // A stop is held while there has been no tap for 0.35 s; a rate is held within 15% (at least 0.8/s).
      const ok = target === 0 ? t - (this.times[this.times.length - 1] ?? -1e9) > 350 : Math.abs(rate - target) <= Math.max(0.8, target * 0.15);
      if (ok) this.onTime += dt;
      const stopNow = target === 0;
      if (stopNow && !this.inStop) {
        this.inStop = true;
        this.stopBroken = false;
        this.stopFrom = t;
        this.stops++;
      } else if (!stopNow && this.inStop) {
        this.inStop = false;
        if (!this.stopBroken) this.stopsHeld++;
      }
      const slot = Math.floor(t / 50);
      while (this.trace.length <= slot) this.trace.push(rate);
    }

    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const share = t > 0 ? this.onTime / Math.min(t, PULSE_MS) : 0;
    header(v, touch, 'on target', this.t0 ? pct(share) : '–', 'left', `${(Math.max(0, PULSE_MS - t) / 1000).toFixed(0)} s`);
    // A scrolling graph: the target ahead, your rate behind the "now" line.
    const gw = a.right - a.left;
    const gh = Math.min(a.bottom - a.top - 70 * a.u, 300 * a.u);
    const gx = a.left;
    const gy = a.cy + gh / 2;
    const nowX = gx + gw * 0.35;
    const msPerPx = 6000 / gw;
    let maxRate = 4;
    for (const s of this.segs) if (s.rate > maxRate) maxRate = s.rate;
    maxRate *= 1.25;
    const yOf = (r: number) => gy - (r / maxRate) * gh;
    ctx.fillStyle = COL_DIM;
    ctx.fillRect(gx, gy, gw, dpr);
    // Target band.
    for (const s of this.segs) {
      const x0 = nowX + (s.from - t) / msPerPx;
      const x1 = nowX + (s.to - t) / msPerPx;
      if (x1 < gx || x0 > gx + gw) continue;
      const band = Math.max(0.8, s.rate * 0.15);
      const l = Math.max(gx, x0);
      const r = Math.min(gx + gw, x1);
      ctx.fillStyle = '#16161a';
      if (s.rate > 0) ctx.fillRect(l, yOf(s.rate + band), r - l, yOf(s.rate - band) - yOf(s.rate + band));
      ctx.strokeStyle = s.rate === 0 ? COL_MID : COL_LINE;
      ctx.lineWidth = dpr;
      ctx.beginPath();
      ctx.moveTo(l, yOf(s.rate));
      ctx.lineTo(r, yOf(s.rate));
      ctx.stroke();
      if (s.rate === 0 && x0 > nowX && x0 < gx + gw - 40 * dpr) {
        ctx.fillStyle = COL_MID;
        v.text('stop', x0 + 6 * dpr, yOf(0) - 8 * dpr, v.fontTiny, 'left');
      } else if (x0 > nowX - 10 && x0 < gx + gw - 30 * dpr) {
        ctx.fillStyle = COL_MID;
        v.text(String(s.rate), x0 + 6 * dpr, yOf(s.rate) - 8 * dpr, v.fontTiny, 'left');
      }
    }
    // Your rate.
    ctx.strokeStyle = COL_ACCENT;
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < this.trace.length; i++) {
      const x = nowX + (i * 50 - t) / msPerPx;
      if (x < gx) continue;
      const y = yOf(Math.min(maxRate, this.trace[i]!));
      if (started) ctx.lineTo(x, y);
      else {
        ctx.moveTo(x, y);
        started = true;
      }
    }
    ctx.stroke();
    ctx.strokeStyle = COL_DIM;
    ctx.lineWidth = dpr;
    ctx.beginPath();
    ctx.moveTo(Math.round(nowX) + 0.5, gy - gh);
    ctx.lineTo(Math.round(nowX) + 0.5, gy);
    ctx.stroke();
    if (!this.t0) message(v, { ...a, cy: gy - gh - 14 * dpr }, 'tap to start: keep your rate on the white line, stop when it drops to zero', '', COL_MID);
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const share = this.onTime / PULSE_MS;
    return {
      score: Math.round(share * 1000),
      primary: { label: 'on target', value: Math.round(share * 100), unit: '%' },
      lines: [
        { label: 'time on target', value: pct(share) },
        { label: 'stops held', value: `${this.stopsHeld} of ${this.stops}` },
        { label: 'taps', value: String(this.times.length) },
      ],
      saved: this.times.length >= 20,
    };
  }
}

// --- Tempo ------------------------------------------------------------------------

const TEMPO_ROUNDS = 5;
const LISTEN = 8;
const KEEP = 8;

class Tempo implements Mini {
  private env!: MiniEnv;
  private round = 0;
  private bpm = 100;
  private t0 = 0;
  private beat = 0;
  private state = 0; // 0 playing, 1 round summary
  private taps: number[] = [];
  private errs: number[] = [];
  private allErrs: number[] = [];
  private drifts: number[] = [];
  private summary = '';
  private flash = 0;
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.newRound(now + 800);
  }

  private period(): number {
    return 60000 / this.bpm;
  }

  private newRound(at: number): void {
    this.bpm = Math.round(70 + Math.random() * 80);
    this.t0 = at;
    this.beat = -1;
    this.taps = [];
    this.state = 0;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (this.state !== 0) return;
    this.taps.push(ts - this.t0);
    this.flash = ts + 90;
    tapSound(this.env, slot);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  pointer(_x: number, _y: number, ts: number): void {
    this.press(0, ts);
    this.held = 0;
  }

  private finishRound(now: number): void {
    const p = this.period();
    this.errs = [];
    // Silent beats are LISTEN .. LISTEN+KEEP-1; match each to its nearest tap.
    for (let b = LISTEN; b < LISTEN + KEEP; b++) {
      const want = b * p;
      let best = Infinity;
      for (const t of this.taps) if (Math.abs(t - want) < Math.abs(best)) best = t - want;
      if (Math.abs(best) <= p / 2) this.errs.push(best);
    }
    const abs = this.errs.map(Math.abs);
    const mae = abs.length ? mean(abs) : p / 2;
    this.allErrs.push(...(abs.length === KEEP ? abs : [...abs, ...Array(KEEP - abs.length).fill(p / 2)]));
    const drift = this.errs.length >= 2 ? this.errs[this.errs.length - 1]! - this.errs[0]! : 0;
    this.drifts.push(drift);
    this.summary = `${Math.round(mae)} ms off  ·  ${this.errs.length}/${KEEP} beats  ·  ${drift >= 0 ? 'drifted late' : 'drifted early'} ${Math.abs(Math.round(drift))} ms`;
    this.round++;
    this.state = 1;
    this.t0 = now + 2600;
    this.env.sound(mae < 30 ? SND_CATCH : SND_TAP_WEAK);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const p = this.period();
    if (this.state === 0 && now >= this.t0) {
      const b = Math.floor((now - this.t0) / p);
      if (b !== this.beat) {
        this.beat = b;
        if (b < LISTEN) this.env.sound(b % 4 === 0 ? SND_BEAT_UP : SND_BEAT);
        if (b >= LISTEN + KEEP + 1) this.finishRound(now);
      }
    } else if (this.state === 1 && now >= this.t0) {
      if (this.round >= TEMPO_ROUNDS) return true;
      this.newRound(now + 400);
    }

    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'round', `${Math.min(this.round + 1, TEMPO_ROUNDS)} / ${TEMPO_ROUNDS}`, 'tempo', `${this.bpm} bpm`);
    if (this.state === 1) {
      message(v, a, this.summary, this.round < TEMPO_ROUNDS ? 'next tempo' : '');
    } else {
      const b = this.beat;
      const listening = b < LISTEN;
      // The beat: a dot that pulses while you can hear it, then goes dark.
      const phase = now >= this.t0 ? ((now - this.t0) % p) / p : 1;
      const r = 26 * a.u * (listening && b >= 0 ? 1 + 0.5 * Math.max(0, 1 - phase * 4) : 1);
      ctx.beginPath();
      ctx.arc(a.cx, a.cy - 30 * a.u, r, 0, Math.PI * 2);
      if (listening && b >= 0) {
        ctx.fillStyle = COL_LINE;
        ctx.fill();
      } else {
        ctx.strokeStyle = COL_DIM;
        ctx.lineWidth = dpr;
        ctx.stroke();
      }
      if (now < this.flash) {
        ctx.strokeStyle = COL_ACCENT;
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        ctx.arc(a.cx, a.cy - 30 * a.u, 40 * a.u, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Beat counter: listen beats then silent beats.
      const total = LISTEN + KEEP;
      const sx = a.cx - (total - 1) * 9 * a.u;
      for (let i = 0; i < total; i++) {
        const x = sx + i * 18 * a.u;
        const y = a.cy + 50 * a.u;
        ctx.fillStyle = i < LISTEN ? (i <= b ? COL_LINE : COL_DIM) : i <= b ? COL_MID : COL_DIM;
        const s = (i < LISTEN ? 3 : 2) * dpr;
        ctx.fillRect(x - s, y - s, s * 2, s * 2);
      }
      ctx.fillStyle = COL_MID;
      v.text(listening ? 'listen and tap along' : 'keep tapping: the beat is still going', a.cx, a.cy + 84 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const mae = mean(this.allErrs);
    return {
      score: this.round ? Math.round(Math.max(0, 300 - mae) * 4) : 0,
      primary: { label: 'average error', value: mae, unit: 'ms', lower: true },
      lines: [
        { label: 'average error in silence', value: ms(mae) },
        { label: 'average drift per round', value: ms(mean(this.drifts.map(Math.abs))) },
        { label: 'rounds', value: String(this.round) },
      ],
      saved: this.round >= 2,
    };
  }
}

// --- Cross ------------------------------------------------------------------------

const CROSS_TRIALS = 20;

class Cross implements Mini {
  private env!: MiniEnv;
  private i = 0;
  private state = 0; // 0 moving, 1 feedback
  private t0 = 0;
  private dur = 1500;
  private crossAt = 0;
  private dir = 1;
  /** Share of the path near the end that is hidden. Grows as you get good. */
  private readonly hide = new Stair(0, 0.08, 0, 0.72, 2);
  private errs: number[] = [];
  private last = 0;
  private pressed = false;
  private held = 0;
  private drawn = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.arm(now + 700);
  }

  private arm(at: number): void {
    this.state = 0;
    this.t0 = at;
    this.dur = 900 + Math.random() * 1500;
    this.dir = Math.random() < 0.5 ? 1 : -1;
    this.crossAt = this.t0 + this.dur * 0.8;
    this.pressed = false;
    this.drawn = 0;
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

  private hit(ts: number): void {
    if (this.state !== 0 || this.pressed || ts < this.t0) return;
    this.pressed = true;
    this.last = ts - this.crossAt;
    this.errs.push(this.last);
    this.hide.update(Math.abs(this.last) < 45);
    this.env.sound(Math.abs(this.last) < 25 ? SND_CATCH : SND_TAP_WEAK);
    this.state = 1;
    this.t0 = ts + 900;
    this.i++;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now > this.t0 + this.dur + 250 && !this.pressed) {
      this.pressed = true;
      this.last = 400;
      this.errs.push(400);
      this.hide.update(false);
      this.state = 1;
      this.t0 = now + 900;
      this.i++;
    }
    if (this.state === 1 && now >= this.t0) {
      if (this.i >= CROSS_TRIALS) return true;
      this.arm(now + 500 + Math.random() * 500);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'trial', `${Math.min(this.i + 1, CROSS_TRIALS)} / ${CROSS_TRIALS}`, 'hidden', pct(this.hide.level / 0.8));
    const half = Math.min((a.right - a.left) / 2 - 20 * dpr, 320 * a.u);
    const y = a.cy;
    // Track from one edge, the line at 80% of the way, a little run-out after.
    const xStart = a.cx - this.dir * half;
    const xEnd = a.cx + this.dir * half;
    const xLine = xStart + (xEnd - xStart) * 0.8;
    ctx.fillStyle = COL_DIM;
    ctx.fillRect(a.cx - half, y, half * 2, dpr);
    ctx.fillStyle = COL_LINE;
    ctx.fillRect(Math.round(xLine) - dpr, y - 30 * a.u, 2 * dpr, 60 * a.u);
    // The hidden stretch before the line.
    const hideFrom = 0.8 - this.hide.level;
    if (this.hide.level > 0) {
      const hx = xStart + (xEnd - xStart) * hideFrom;
      ctx.fillStyle = '#141417';
      ctx.fillRect(Math.min(hx, xLine), y - 14 * a.u, Math.abs(xLine - hx), 28 * a.u);
    }
    if (this.state === 0 && now >= this.t0) {
      const p = (now - this.t0) / this.dur;
      if (p <= 1 && (p < hideFrom || p > 0.8 + 0.02 || this.hide.level === 0)) {
        if (!this.drawn) this.drawn = now;
        ctx.fillStyle = COL_ACCENT;
        ctx.beginPath();
        ctx.arc(xStart + (xEnd - xStart) * p, y, 9 * a.u, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (this.state === 1) {
      const e = this.last;
      // Where the dot was when you pressed.
      const px = clamp(xLine + (e / this.dur) * (xEnd - xStart), a.cx - half, a.cx + half);
      ctx.strokeStyle = COL_ACCENT;
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.arc(px, y, 9 * a.u, 0, Math.PI * 2);
      ctx.stroke();
      message(v, { ...a, cy: y + 70 * a.u }, e >= 400 ? 'missed' : `${e > 0 ? '+' : ''}${Math.round(e)} ms`, e >= 400 ? '' : Math.abs(e) < 15 ? 'dead on' : e > 0 ? 'late' : 'early');
    }
    if (this.i < 2 && this.state === 0) {
      ctx.fillStyle = COL_MID;
      v.text('press the moment the dot crosses the white line', a.cx, a.bottom - 16 * dpr, v.fontTiny, 'center');
    }
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const abs = this.errs.map(Math.abs);
    const mae = mean(abs);
    const signed = mean(this.errs.filter((e) => e < 400));
    return {
      score: this.i ? Math.round(Math.max(0, 200 - mae) * 5 + this.hide.level * 500) : 0,
      primary: { label: 'average error', value: mae, unit: 'ms', lower: true },
      lines: [
        { label: 'average error', value: ms(mae) },
        { label: 'tendency', value: `${Math.abs(Math.round(signed))} ms ${signed >= 0 ? 'late' : 'early'}` },
        { label: 'within 25 ms', value: pct(abs.filter((x) => x < 25).length / (abs.length || 1)) },
        { label: 'path hidden at the end', value: pct(this.hide.level / 0.8) },
      ],
      saved: this.i >= 5,
    };
  }
}

export const SPEED: MiniDef[] = [
  {
    id: 'sprint',
    name: 'Sprint',
    skill: 'speed',
    blurb: 'Ten seconds, flat out. Watch your rate fade.',
    how: 'Tap as fast as you can for ten seconds; the clock starts with your first tap. Shows your peak, best five seconds, how much you faded, and hand balance.',
    input: 'keys',
    make: () => new Sprint(),
  },
  {
    id: 'pulse',
    name: 'Pulse',
    skill: 'speed',
    blurb: 'Ride a target rate that rises, drops and stops.',
    how: 'Keep your tap rate (orange) on the white line as it changes, and stop completely when it drops to zero. Control matters more than raw speed: overshooting counts against you too.',
    input: 'keys',
    make: () => new Pulse(),
  },
];

export const TIMING: MiniDef[] = [
  {
    id: 'tempo',
    name: 'Tempo',
    skill: 'timing',
    blurb: 'Keep the beat going after it goes silent.',
    how: 'Eight clicks set a tempo; tap along. Then the clicks stop and you keep tapping for eight more beats. Scored on how close each silent tap lands to the beat. Five tempos.',
    input: 'both',
    make: () => new Tempo(),
  },
  {
    id: 'cross',
    name: 'Cross',
    skill: 'timing',
    blurb: 'Press as the dot crosses the line. Then it vanishes early.',
    how: 'A dot slides toward a line. Press exactly as it crosses. Get it right and the last stretch of its path starts to hide, so you have to predict.',
    input: 'both',
    make: () => new Cross(),
  },
];
