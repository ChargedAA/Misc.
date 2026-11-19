// Sixth batch.
//   Duel    - quick draw against an opponent who keeps pace with you.
//   Where   - shapes scatter, vanish; tap where one of them was.
//   Flicker - two versions flicker back and forth; find what changes.
//   Drift   - tap with a silent beat that speeds up and slows down.
//   Orbit   - each hand flips the direction of its own orbiting dot.
//   Drum    - read a short left/right/both pattern and play it in time.

import { ANTICIPATION_MS, COL_ACCENT, COL_DIM, COL_LINE, COL_MID } from '../config.ts';
import { SND_BEAT, SND_BEAT_UP, SND_CATCH, SND_FALL, SND_FALSE, SND_LURCH, SND_TAP_L, SND_TAP_R, SND_TAP_WEAK, SND_TONE } from '../audio.ts';
import { SHAPE_CIRCLE, SHAPE_CROSS, SHAPE_DIAMOND, SHAPE_SQUARE, SHAPE_TRIANGLE, type View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import {
  Stair,
  arena,
  clamp,
  footer,
  foreperiod,
  handLabel,
  header,
  mean,
  median,
  message,
  ms,
  pct,
  shuffle,
  sideOf,
  type Mini,
  type MiniDef,
  type MiniEnv,
  type MiniResult,
  gameNow,
  scaled,
} from './kit.ts';

const TAU = Math.PI * 2;
const GREY = '#6c6c74';
const SHAPES = [SHAPE_CIRCLE, SHAPE_SQUARE, SHAPE_TRIANGLE, SHAPE_DIAMOND, SHAPE_CROSS];

// --- Duel -------------------------------------------------------------------------

const DUEL_TO = 5;

class Duel implements Mini {
  private env!: MiniEnv;
  private state = 0; // 0 wait, 1 draw, 2 round over
  private at = 0;
  private drawnAt = 0;
  private them = 380;
  private mine: number[] = [];
  private wins = 0;
  private losses = 0;
  private lastMine = 0;
  private lastThem = 0;
  private verdict = '';
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.arm(now + 800);
  }

  private arm(now: number): void {
    this.state = 0;
    this.at = now + foreperiod(1200, 1500, 5000);
    this.drawnAt = 0;
    // The opponent hovers around your recent pace, sometimes a hair faster.
    const recent = this.mine.slice(-5);
    const base = recent.length ? median(recent) : 380;
    this.them = Math.max(170, base + (Math.random() - 0.42) * 70);
  }

  private settle(now: number, mine: number, early: boolean): void {
    this.lastMine = mine;
    this.lastThem = this.them;
    if (early) {
      this.losses++;
      this.verdict = 'drew too early';
      this.env.sound(SND_FALSE);
    } else if (mine <= this.them) {
      this.wins++;
      this.verdict = 'you win the round';
      this.env.sound(SND_CATCH);
    } else {
      this.losses++;
      this.verdict = 'they were faster';
      this.env.sound(SND_LURCH);
    }
    this.state = 2;
    this.at = now + 1500;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    this.draw(ts);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  pointer(_x: number, _y: number, ts: number): void {
    this.draw(ts);
  }

  private draw(ts: number): void {
    if (this.state === 0) this.settle(ts, 0, true);
    else if (this.state === 1 && this.drawnAt > 0) {
      const rt = ts - this.drawnAt;
      if (rt < ANTICIPATION_MS) return;
      this.mine.push(rt);
      this.settle(ts, rt, false);
    }
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.at) this.state = 1;
    if (this.state === 1 && this.drawnAt > 0 && now - this.drawnAt > this.them) {
      // They fired first and you had not.
      this.lastMine = 0;
      this.lastThem = this.them;
      this.losses++;
      this.verdict = 'they were faster';
      this.env.sound(SND_LURCH);
      this.state = 2;
      this.at = now + 1500;
    }
    if (this.state === 2 && now >= this.at) {
      if (this.wins >= DUEL_TO || this.losses >= DUEL_TO) return true;
      this.arm(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'you', String(this.wins), 'them', String(this.losses));
    const half = Math.min(220 * a.u, (a.right - a.left) / 2 - 30 * a.u);
    // Two figures: a post each, facing off.
    for (const s of [-1, 1]) {
      ctx.fillStyle = s > 0 ? COL_LINE : COL_MID;
      ctx.fillRect(a.cx + s * half - 2 * dpr, a.cy - 40 * a.u, 4 * dpr, 80 * a.u);
    }
    ctx.fillStyle = COL_MID;
    v.text('them', a.cx - half, a.cy + 64 * a.u, v.fontTiny, 'center');
    v.text('you', a.cx + half, a.cy + 64 * a.u, v.fontTiny, 'center');
    if (this.state === 1) {
      if (this.drawnAt === 0) this.drawnAt = gameNow();
      ctx.fillStyle = COL_ACCENT;
      ctx.fillRect(a.cx - half + 12 * a.u, a.cy - 2 * dpr, half * 2 - 24 * a.u, 4 * dpr);
      v.text('DRAW', a.cx, a.cy - 24 * a.u, v.fontHud, 'center');
    } else if (this.state === 2) {
      message(v, { ...a, cy: a.cy - 70 * a.u }, this.verdict, this.lastMine ? `you ${Math.round(this.lastMine)} ms  ·  them ${Math.round(this.lastThem)} ms` : this.verdict === 'drew too early' ? '' : `them ${Math.round(this.lastThem)} ms`);
    } else {
      ctx.fillStyle = COL_DIM;
      v.text('wait for it', a.cx, a.cy - 24 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const med = median(this.mine);
    return {
      score: this.wins * 150 + (med ? Math.round(Math.max(0, 450 - med)) : 0),
      primary: { label: 'median draw', value: med, unit: 'ms', lower: true },
      lines: [
        { label: 'rounds', value: `${this.wins} won, ${this.losses} lost` },
        { label: 'median draw', value: ms(med) },
        { label: 'fastest draw', value: this.mine.length ? ms(Math.min(...this.mine)) : '–' },
      ],
      rts: this.mine,
      saved: this.wins + this.losses >= 3,
    };
  }
}

// --- Where ------------------------------------------------------------------------

const WHERE_TRIALS = 15;

class Where implements Mini {
  private env!: MiniEnv;
  private items: { shape: number; grey: boolean; x: number; y: number }[] = [];
  private probe = 0;
  private state = 0; // 0 show, 1 blank, 2 answer, 3 feedback
  private at = 0;
  private i = 0;
  private readonly k = new Stair(3, 1, 2, 9);
  private errs: number[] = [];
  private lastX = 0;
  private lastY = 0;
  private geo = { x0: 0, y0: 0, s: 1 };

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.arm(now + 500);
  }

  private arm(now: number): void {
    const n = this.k.level;
    this.items = [];
    const combos = shuffle([...Array(10).keys()]);
    while (this.items.length < n) {
      const x = 0.1 + Math.random() * 0.8;
      const y = 0.1 + Math.random() * 0.8;
      if (this.items.every((it) => Math.hypot(it.x - x, it.y - y) > 0.18)) {
        const c = combos[this.items.length]!;
        this.items.push({ shape: SHAPES[c % 5]!, grey: c >= 5, x, y });
      }
    }
    this.probe = Math.floor(Math.random() * n);
    this.state = 0;
    this.at = now + 400 + n * 450;
  }

  press(): void {}

  pointer(px: number, py: number, ts: number): void {
    if (this.state !== 2) return;
    const g = this.geo;
    const x = (px - g.x0) / g.s;
    const y = (py - g.y0) / g.s;
    if (x < 0 || y < 0 || x > 1 || y > 1) return;
    const it = this.items[this.probe]!;
    const err = Math.hypot(x - it.x, y - it.y);
    this.errs.push(err);
    this.lastX = x;
    this.lastY = y;
    this.k.update(err < 0.08);
    this.env.sound(err < 0.05 ? SND_CATCH : err < 0.12 ? SND_TAP_WEAK : SND_FALSE);
    this.i++;
    this.state = 3;
    this.at = ts + 1300;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.at) {
      this.state = 1;
      this.at = now + 700;
    } else if (this.state === 1 && now >= this.at) this.state = 2;
    else if (this.state === 3 && now >= this.at) {
      if (this.i >= scaled(WHERE_TRIALS)) return true;
      this.arm(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'shapes', String(this.k.level), 'trial', `${Math.min(this.i + 1, scaled(WHERE_TRIALS))} / ${scaled(WHERE_TRIALS)}`);
    const s = Math.min(a.bottom - a.top - 50 * a.u, a.right - a.left, 520 * a.u);
    const g = (this.geo = { x0: a.cx - s / 2, y0: a.cy - s / 2 + 20 * a.u, s });
    ctx.strokeStyle = COL_DIM;
    ctx.lineWidth = dpr;
    ctx.strokeRect(g.x0 + 0.5, g.y0 + 0.5, s - 1, s - 1);
    const draw = (it: { shape: number; grey: boolean; x: number; y: number }, x: number, y: number) => {
      ctx.fillStyle = it.grey ? GREY : COL_LINE;
      v.shape(it.shape, x, y, s * 0.035, true);
    };
    if (this.state === 0) for (const it of this.items) draw(it, g.x0 + it.x * s, g.y0 + it.y * s);
    if (this.state >= 2) {
      const it = this.items[this.probe]!;
      ctx.fillStyle = COL_MID;
      v.text('where was', a.cx - 16 * dpr, g.y0 - 14 * dpr, v.fontTiny, 'right');
      draw(it, a.cx + 4 * dpr, g.y0 - 18 * dpr);
      if (this.state === 3) {
        draw(it, g.x0 + it.x * s, g.y0 + it.y * s);
        ctx.strokeStyle = COL_ACCENT;
        ctx.lineWidth = 1.5 * dpr;
        ctx.beginPath();
        ctx.arc(g.x0 + this.lastX * s, g.y0 + this.lastY * s, 8 * dpr, 0, TAU);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(g.x0 + this.lastX * s, g.y0 + this.lastY * s);
        ctx.lineTo(g.x0 + it.x * s, g.y0 + it.y * s);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = COL_MID;
      v.text(this.state === 0 ? 'remember where each one is' : '', a.cx, g.y0 - 14 * dpr, v.fontTiny, 'center');
    }
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const m = mean(this.errs);
    return {
      score: this.i ? Math.max(0, Math.round(Math.max(0, 0.3 - m) * 3000 + (this.k.level - 3) * 50)) : 0,
      primary: { label: 'average miss', value: Math.round(m * 1000) / 10, unit: '%', lower: true, decimals: 1 },
      lines: [
        { label: 'average miss (share of the board)', value: `${(m * 100).toFixed(1)}%` },
        { label: 'close (within 5%)', value: pct(this.errs.filter((e) => e < 0.05).length / (this.errs.length || 1)) },
        { label: 'shapes at the end', value: String(this.k.level) },
      ],
      saved: this.i >= 4,
    };
  }
}

// --- Flicker (change blindness) ---------------------------------------------------

const FLICKER_IMAGES = 10;
const FLICKER_MAX = 25000;

class Flicker implements Mini {
  private env!: MiniEnv;
  private items: { shape: number; grey: boolean; x: number; y: number }[] = [];
  private changed = 0;
  private alt: { shape: number; grey: boolean; gone: boolean } = { shape: 0, grey: false, gone: false };
  private t0 = 0;
  private state = 0; // 0 flickering, 1 feedback
  private at = 0;
  private i = 0;
  private times: number[] = [];
  private wrong = 0;
  private found = false;
  private geo = { x0: 0, y0: 0, s: 1 };

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.arm(now + 400);
  }

  private arm(now: number): void {
    const n = 12 + Math.min(14, this.i * 2);
    this.items = [];
    while (this.items.length < n) {
      const x = 0.07 + Math.random() * 0.86;
      const y = 0.07 + Math.random() * 0.86;
      if (this.items.every((it) => Math.hypot(it.x - x, it.y - y) > 0.12)) {
        this.items.push({ shape: SHAPES[Math.floor(Math.random() * 5)]!, grey: Math.random() < 0.4, x, y });
      }
    }
    this.changed = Math.floor(Math.random() * n);
    const it = this.items[this.changed]!;
    const kind = Math.random();
    this.alt = kind < 0.33 ? { ...it, grey: !it.grey, gone: false } : kind < 0.66 ? { shape: SHAPES[(SHAPES.indexOf(it.shape) + 2) % 5]!, grey: it.grey, gone: false } : { ...it, gone: true };
    this.t0 = now;
    this.state = 0;
  }

  press(): void {}

  pointer(px: number, py: number, ts: number): void {
    if (this.state !== 0) return;
    const g = this.geo;
    const x = (px - g.x0) / g.s;
    const y = (py - g.y0) / g.s;
    let best = -1;
    let bestD = 0.06;
    this.items.forEach((it, k) => {
      const d = Math.hypot(it.x - x, it.y - y);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    });
    if (best < 0) return;
    if (best === this.changed) {
      this.times.push(ts - this.t0);
      this.found = true;
      this.env.sound(SND_CATCH);
      this.next(ts);
    } else {
      this.wrong++;
      this.env.sound(SND_FALSE);
    }
  }

  private next(ts: number): void {
    this.i++;
    this.state = 1;
    this.at = ts + 1100;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now - this.t0 > FLICKER_MAX) {
      this.found = false;
      this.next(now);
    }
    if (this.state === 1 && now >= this.at) {
      if (this.i >= scaled(FLICKER_IMAGES)) return true;
      this.arm(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'found', `${this.times.length} / ${this.i}`, 'time', this.state === 0 ? `${Math.floor((now - this.t0) / 1000)} s` : '–');
    const s = Math.min(a.bottom - a.top - 20 * a.u, a.right - a.left, 560 * a.u);
    const g = (this.geo = { x0: a.cx - s / 2, y0: a.cy - s / 2 + 10 * a.u, s });
    ctx.strokeStyle = COL_DIM;
    ctx.lineWidth = dpr;
    ctx.strokeRect(g.x0 + 0.5, g.y0 + 0.5, s - 1, s - 1);
    // A 240 ms, blank 80 ms, B 240 ms, blank 80 ms. The blanks hide the change's motion.
    const ph = (now - this.t0) % 640;
    const blank = (ph >= 240 && ph < 320) || ph >= 560;
    const showB = ph >= 320 && ph < 560;
    if (this.state === 1 || !blank) {
      this.items.forEach((it, k) => {
        let shape = it.shape;
        let grey = it.grey;
        if (k === this.changed && (showB || this.state === 1)) {
          if (this.alt.gone && this.state === 0) return;
          shape = this.alt.shape;
          grey = this.alt.grey;
        }
        ctx.fillStyle = grey ? GREY : COL_LINE;
        v.shape(shape, g.x0 + it.x * s, g.y0 + it.y * s, s * 0.026, true);
      });
    }
    if (this.state === 1) {
      const it = this.items[this.changed]!;
      ctx.strokeStyle = COL_ACCENT;
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.arc(g.x0 + it.x * s, g.y0 + it.y * s, s * 0.05, 0, TAU);
      ctx.stroke();
      if (!this.found) message(v, { ...a, cy: g.y0 - 4 * dpr }, 'it was this one', '', COL_MID);
    } else if (this.i === 0 && now - this.t0 < 4000) {
      ctx.fillStyle = COL_MID;
      v.text('one thing keeps changing. tap it', a.cx, g.y0 - 10 * dpr, v.fontTiny, 'center');
    }
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const med = median(this.times);
    return {
      score: this.times.length * 100 + (med ? Math.round(Math.max(0, 15000 - med) / 50) : 0),
      primary: { label: 'median time to find', value: med / 1000, unit: 's', lower: true, decimals: 1 },
      lines: [
        { label: 'found', value: `${this.times.length} of ${this.i}` },
        { label: 'median time to find', value: med ? `${(med / 1000).toFixed(1)} s` : '–' },
        { label: 'wrong taps', value: String(this.wrong) },
      ],
      saved: this.i >= 3,
    };
  }
}

// --- Drift ------------------------------------------------------------------------

const DRIFT_MS = 40000;

class Drift implements Mini {
  private env!: MiniEnv;
  private t0 = 0;
  /** Beat times, generated ahead. */
  private beats: number[] = [];
  private taps: number[] = [];
  private errs: number[] = [];
  private lastTap = 0;
  private held = 0;
  private started = false;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.t0 = now + 1500;
    // Tempo wanders smoothly between about 70 and 150 bpm.
    let t = 0;
    const a = Math.random() * TAU;
    while (t < scaled(DRIFT_MS) + 2000) {
      this.beats.push(t);
      const bpm = 110 + 32 * Math.sin(t / 5200 + a) + 12 * Math.sin(t / 2100 + a * 2);
      t += 60000 / bpm;
    }
  }

  private tap(ts: number): void {
    const t = ts - this.t0;
    if (t < -300 || t > scaled(DRIFT_MS)) return;
    this.started = true;
    this.taps.push(t);
    this.lastTap = ts;
    let best = Infinity;
    for (const b of this.beats) {
      if (Math.abs(b - t) < Math.abs(best)) best = t - b;
      if (b > t + 1000) break;
    }
    // Only judge after the first eight beats, once the tempo has been caught.
    if (t > this.beats[8]!) this.errs.push(best);
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
    if (t > scaled(DRIFT_MS) + 800) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    // Find the last beat and the next.
    let k = 0;
    while (k + 1 < this.beats.length && this.beats[k + 1]! <= t) k++;
    const prev = this.beats[k]!;
    const next = this.beats[k + 1] ?? prev + 600;
    const bpm = 60000 / (next - prev);
    const recent = this.errs.slice(-12).map(Math.abs);
    header(v, touch, 'off by', recent.length ? ms(mean(recent)) : '–', 'tempo', `${Math.round(bpm)} bpm`);
    const since = t - prev;
    const r = 30 * a.u * (t >= 0 ? 1 + 0.6 * Math.max(0, 1 - since / 140) : 1);
    ctx.beginPath();
    ctx.arc(a.cx, a.cy - 20 * a.u, r, 0, TAU);
    ctx.fillStyle = t >= 0 && since < 140 ? COL_LINE : COL_DIM;
    ctx.fill();
    if (now - this.lastTap < 100) {
      ctx.strokeStyle = COL_ACCENT;
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.arc(a.cx, a.cy - 20 * a.u, 50 * a.u, 0, TAU);
      ctx.stroke();
    }
    // Recent taps as offsets from their beat: early left, late right.
    const span = Math.min(a.right - a.left, 400 * a.u);
    const y = a.cy + 70 * a.u;
    ctx.fillStyle = COL_DIM;
    ctx.fillRect(a.cx - span / 2, y, span, dpr);
    ctx.fillRect(a.cx - dpr / 2, y - 10 * a.u, dpr, 20 * a.u);
    this.errs.slice(-12).forEach((e, i, arr) => {
      ctx.globalAlpha = 0.3 + (0.7 * (i + 1)) / arr.length;
      ctx.fillStyle = COL_LINE;
      ctx.fillRect(a.cx + clamp(e / 150, -1, 1) * (span / 2) - 1.5 * dpr, y - 6 * a.u, 3 * dpr, 12 * a.u);
    });
    ctx.globalAlpha = 1;
    ctx.fillStyle = COL_MID;
    v.text('early', a.cx - span / 2, y + 22 * a.u, v.fontTiny, 'left');
    v.text('late', a.cx + span / 2, y + 22 * a.u, v.fontTiny, 'right');
    if (!this.started) v.text('tap on each pulse: it speeds up and slows down, silently', a.cx, a.cy - 80 * a.u, v.fontTiny, 'center');
    progressLine(v, a.cx, a.bottom - 20 * a.u, 120 * a.u, clamp(t / scaled(DRIFT_MS), 0, 1));
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const abs = this.errs.map(Math.abs);
    const m = mean(abs);
    const signed = mean(this.errs);
    return {
      score: abs.length ? Math.round(Math.max(0, 150 - m) * 8 + abs.length * 2) : 0,
      primary: { label: 'average error', value: m, unit: 'ms', lower: true },
      lines: [
        { label: 'average error', value: ms(m) },
        { label: 'tendency', value: `${Math.abs(Math.round(signed))} ms ${signed >= 0 ? 'late' : 'early'}` },
        { label: 'within 30 ms', value: pct(abs.filter((x) => x < 30).length / (abs.length || 1)) },
        { label: 'beats tapped', value: String(abs.length) },
      ],
      saved: abs.length >= 10,
    };
  }
}

function progressLine(v: View, cx: number, y: number, half: number, p: number): void {
  const ctx = v.ctx;
  ctx.fillStyle = COL_DIM;
  ctx.fillRect(cx - half, y, half * 2, v.dpr);
  ctx.fillStyle = COL_MID;
  ctx.fillRect(cx - half, y, half * 2 * p, v.dpr);
}

// --- Orbit ------------------------------------------------------------------------

interface Rock {
  ring: number;
  ang: number;
  span: number;
  /** Radial distance from the ring, counting down to zero (0..1 of the radius). */
  dist: number;
  pickup: boolean;
  done: boolean;
}

class Orbit implements Mini {
  private env!: MiniEnv;
  private ang = [0, Math.PI];
  private dir = [1, -1];
  private rocks: Rock[] = [];
  private last = 0;
  private time = 0;
  private spawn = [1.2, 1.8];
  private lives = 3;
  private picks = 0;
  private dodged = 0;
  private hitFlash = [0, 0];
  private over = false;
  private overAt = 0;
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.last = now;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (this.over) return;
    const side = sideOf(slot);
    if (side === 0) return;
    const r = side < 0 ? 0 : 1;
    this.dir[r] = -this.dir[r]!;
    this.env.sound(r ? SND_TAP_R : SND_TAP_L);
    void ts;
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.over && now >= this.overAt) return true;
    if (!this.over) {
      this.time += dt;
      const w = 1.9 + this.time * 0.02; // radians per second
      const fall = 0.42 + this.time * 0.004;
      for (let r = 0; r < 2; r++) {
        this.ang[r] = (this.ang[r]! + this.dir[r]! * w * dt + TAU) % TAU;
        this.spawn[r]! -= dt;
        if (this.spawn[r]! <= 0) {
          this.spawn[r] = Math.max(0.55, 1.6 - this.time * 0.012) * (0.7 + Math.random() * 0.6);
          this.rocks.push({ ring: r, ang: Math.random() * TAU, span: 0.5 + Math.random() * 0.5, dist: 1, pickup: Math.random() < 0.2, done: false });
        }
      }
      for (const k of this.rocks) {
        k.dist -= fall * dt;
        if (!k.done && k.dist <= 0) {
          k.done = true;
          let d = Math.abs(((this.ang[k.ring]! - k.ang + Math.PI * 3) % TAU) - Math.PI);
          d = Math.min(d, TAU - d);
          const inside = d < k.span / 2;
          if (inside && k.pickup) {
            this.picks++;
            this.env.sound(SND_TONE + 3 + k.ring);
          } else if (inside) {
            this.lives--;
            this.hitFlash[k.ring] = now + 300;
            this.env.sound(SND_LURCH);
            if (this.lives <= 0) {
              this.over = true;
              this.overAt = now + 1300;
              this.env.sound(SND_FALL);
            }
          } else if (!k.pickup) this.dodged++;
        }
      }
      this.rocks = this.rocks.filter((k) => k.dist > -0.3);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'time', `${this.time.toFixed(1)} s`, 'pickups', String(this.picks), this.lives);
    const R = Math.min((a.right - a.left) / 4 - 16 * a.u, (a.bottom - a.top) / 2 - 50 * a.u, 150 * a.u);
    for (let r = 0; r < 2; r++) {
      const cx = a.cx + (r ? 1 : -1) * (R + 30 * a.u);
      const cy = a.cy;
      ctx.strokeStyle = COL_DIM;
      ctx.lineWidth = dpr;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, TAU);
      ctx.stroke();
      for (const k of this.rocks) {
        if (k.ring !== r || (k.done && k.pickup)) continue;
        // Arcs grow out from the centre and land on the ring.
        const rad = R * (1 - Math.max(-0.12, k.dist));
        ctx.strokeStyle = k.pickup ? COL_MID : COL_LINE;
        ctx.lineWidth = (k.pickup ? 2 : 5) * dpr;
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(2, rad), k.ang - k.span / 2, k.ang + k.span / 2);
        ctx.stroke();
      }
      const px = cx + Math.cos(this.ang[r]!) * R;
      const py = cy + Math.sin(this.ang[r]!) * R;
      ctx.fillStyle = now < this.hitFlash[r]! ? COL_MID : COL_ACCENT;
      ctx.beginPath();
      ctx.arc(px, py, 8 * a.u, 0, TAU);
      ctx.fill();
      ctx.fillStyle = COL_MID;
      v.text(handLabel(this.env, r ? 1 : -1), cx, cy + R + 30 * a.u, v.fontTiny, 'center');
    }
    if (this.time < 3 && !this.over) message(v, { ...a, cy: a.top + 20 * a.u }, 'each hand flips its dot’s direction', 'white arcs grow outward: be elsewhere when they land; catch grey ones', COL_MID);
    if (this.over) message(v, a, `${this.time.toFixed(1)} s`, `${this.dodged} dodged`);
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: Math.round(this.time * 10) + this.picks * 25,
      primary: { label: 'survived', value: this.time, unit: 's', decimals: 1 },
      lines: [
        { label: 'survived', value: `${this.time.toFixed(1)} s` },
        { label: 'dodged', value: String(this.dodged) },
        { label: 'caught', value: String(this.picks) },
      ],
      saved: this.time > 3,
    };
  }
}

// --- Drum -------------------------------------------------------------------------

/** Each step: 0 rest, 1 left, 2 right, 3 both. */
class Drum implements Mini {
  private env!: MiniEnv;
  private level = 1;
  private steps: number[] = [];
  private bpm = 90;
  private t0 = 0;
  private state = 0; // 0 count-in, 1 playing, 2 feedback
  private at = 0;
  private hitMask: number[] = [];
  private lastClick = -1;
  private strikes = 0;
  private best = 0;
  private acc = 0;
  private accs: number[] = [];
  /** Signed timing of every clean hit (ms, + is late), and this bar's per-note offsets. */
  private offs: number[] = [];
  private barOffs: number[][] = [];
  /** True when the clicks are scheduled on the audio clock (exact), not fired by frames. */
  private exact = false;
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.exact = !!env.soundAt && !env.muted;
    this.make(now + 800, now);
  }

  private make(at: number, now: number): void {
    const n = 8;
    const density = Math.min(0.9, 0.45 + this.level * 0.05);
    const bothP = Math.min(0.3, this.level * 0.03);
    this.steps = [];
    for (let i = 0; i < n; i++) {
      if (Math.random() > density && i !== 0) this.steps.push(0);
      else this.steps.push(Math.random() < bothP ? 3 : Math.random() < 0.5 ? 1 : 2);
    }
    this.bpm = 80 + this.level * 6;
    this.t0 = at;
    this.state = 0;
    this.hitMask = this.steps.map(() => 0);
    this.barOffs = this.steps.map(() => []);
    this.lastClick = -1;
    // Count-in on beats 1-4, then a softer click on every beat of the bar, all on the
    // audio clock so the pulse you hear is exact.
    if (this.exact) {
      const st = this.step();
      for (let k = 0; k < 8 + this.steps.length; k += 2) this.env.soundAt!(k === 0 ? SND_BEAT_UP : SND_BEAT, at - now + k * st);
    }
  }

  private step(): number {
    return 60000 / this.bpm / 2; // eighth notes
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const side = sideOf(slot);
    if (side === 0 || this.state !== 1) return;
    const st = this.step();
    const start = this.t0 + st * 8; // after the count-in
    // Judge against when the click was heard: the press follows the sound, which is late by the output delay.
    const t = ts - (this.exact ? (this.env.latency ?? 0) : 0);
    const k = Math.round((t - start) / st);
    const off = t - start - k * st;
    this.env.sound(side > 0 ? SND_TAP_R : SND_TAP_L);
    if (k < 0 || k >= this.steps.length) {
      this.hitMask.push(-1);
      return;
    }
    const bit = side < 0 ? 1 : 2;
    const win = Math.max(100, st * 0.35);
    if (this.steps[k]! & bit && !(this.hitMask[k]! & bit) && Math.abs(off) <= win) {
      this.hitMask[k]! |= bit;
      this.offs.push(off);
      this.barOffs[k]!.push(off);
    } else if (!(this.steps[k]! & bit)) this.hitMask[k]! |= 4; // a hit where the bar has a rest
  }

  private clickFallback(now: number): void {
    // Without scheduled audio, fire the count-in clicks from frames.
    const st = this.step();
    const k = Math.floor((now - this.t0) / st);
    if (k >= 0 && k < 8 + this.steps.length && k % 2 === 0 && k !== this.lastClick) {
      this.lastClick = k;
      this.env.sound(k === 0 ? SND_BEAT_UP : SND_BEAT);
    }
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const st = this.step();
    if (this.state <= 1 && now >= this.t0) {
      const k = Math.floor((now - this.t0) / st);
      if (!this.exact) this.clickFallback(now);
      if (k >= 7) this.state = 1;
      if (k >= 8 + this.steps.length + 1) {
        // Score the bar: notes hit cleanly, minus extras.
        let want = 0;
        let got = 0;
        let extra = 0;
        this.steps.forEach((s, i) => {
          const m = this.hitMask[i] ?? 0;
          want += (s & 1 ? 1 : 0) + (s & 2 ? 1 : 0);
          got += (s & m & 1 ? 1 : 0) + (s & m & 2 ? 1 : 0);
          if (m & 4) extra++;
        });
        extra += this.hitMask.slice(this.steps.length).filter((x) => x === -1).length;
        this.acc = want ? Math.max(0, (got - extra * 0.25) / want) : 1;
        this.accs.push(this.acc);
        if (this.acc >= 0.75) {
          this.best = Math.max(this.best, this.level);
          this.level++;
          this.env.sound(SND_CATCH);
        } else {
          this.strikes++;
          this.env.sound(SND_FALSE);
        }
        this.state = 2;
        this.at = now + 1400;
      }
    } else if (this.state === 2 && now >= this.at) {
      if (this.strikes >= 3) return true;
      this.make(now + 300, now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'level', String(this.level), 'tempo', `${this.bpm} bpm`, 3 - this.strikes);
    const span = Math.min(a.right - a.left, 560 * a.u);
    const x0 = a.cx - span / 2;
    const cw = span / 8;
    const yL = a.cy - 26 * a.u;
    const yR = a.cy + 26 * a.u;
    ctx.fillStyle = COL_MID;
    v.text(`left ${handLabel(this.env, -1)}`, x0 - 10 * dpr, yL + 4 * dpr, v.fontTiny, 'right');
    v.text(`right ${handLabel(this.env, 1)}`, x0 - 10 * dpr, yR + 4 * dpr, v.fontTiny, 'right');
    const playing = Math.floor((now - this.t0 - st * 8) / st);
    this.steps.forEach((s, i) => {
      const x = x0 + (i + 0.5) * cw;
      const m = this.hitMask[i] ?? 0;
      for (const [bit, y] of [
        [1, yL],
        [2, yR],
      ] as const) {
        ctx.beginPath();
        ctx.arc(x, y, 9 * a.u, 0, TAU);
        if (s & bit) {
          ctx.fillStyle = m & bit ? COL_LINE : this.state === 2 ? COL_ACCENT : COL_MID;
          ctx.fill();
        } else {
          ctx.fillStyle = COL_DIM;
          ctx.fillRect(x - 2 * dpr, y - dpr / 2, 4 * dpr, dpr);
        }
      }
      // How early or late each hit was: a tick left (early) or right (late) of the note.
      for (const o of this.barOffs[i] ?? []) {
        ctx.fillStyle = Math.abs(o) < 45 ? COL_LINE : COL_MID;
        ctx.fillRect(x + clamp(o / (st * 0.35), -1, 1) * cw * 0.4 - dpr, a.cy - 3 * a.u, 2 * dpr, 6 * a.u);
      }
      if (i === playing && this.state === 1) {
        ctx.fillStyle = COL_LINE;
        ctx.fillRect(x - cw / 2, a.cy + 52 * a.u, cw, 2 * dpr);
      }
    });
    ctx.fillStyle = COL_MID;
    const status = this.state === 0 && now < this.t0 + st * 8 ? `${4 - Math.floor(Math.max(0, now - this.t0) / (st * 2))}` : this.state === 2 ? `${pct(this.acc)} ${this.acc >= 0.75 ? '· next' : '· again'}` : 'play';
    v.text(status, a.cx, a.cy - 70 * a.u, v.fontHud, 'center');
    if (this.level === 1 && this.state === 0) v.text('read the bar, then play it after the count of four', a.cx, a.cy + 90 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.best * 100 + Math.round(mean(this.accs) * 100),
      primary: { label: 'level', value: this.best, unit: '' },
      lines: [
        { label: 'highest level cleared', value: String(this.best) },
        { label: 'average accuracy', value: pct(mean(this.accs)) },
        { label: 'bars played', value: String(this.accs.length) },
        { label: 'timing of clean hits', value: this.offs.length ? `${Math.round(Math.abs(mean(this.offs)))} ms ${mean(this.offs) >= 0 ? 'late' : 'early'} on average  ·  spread ${Math.round(median(this.offs.map((o) => Math.abs(o - mean(this.offs)))))} ms` : '–' },
      ],
      saved: this.accs.length >= 1,
    };
  }
}

export const BATCH6: MiniDef[] = [
  {
    id: 'duel',
    name: 'Duel',
    skill: 'reaction',
    blurb: 'Quick draw against an opponent who keeps pace with you.',
    how: 'Wait for DRAW, then press any key (or tap) before your opponent fires. They adapt to your speed, so every round is close. Draw early and you lose the round. First to five.',
    input: 'both',
    make: () => new Duel(),
  },
  {
    id: 'where',
    name: 'Where',
    skill: 'memory',
    blurb: 'Shapes scatter and vanish. Tap where one of them was.',
    how: 'A few shapes appear around the board, then disappear. One of them is shown at the top: tap where it was. The closer, the better; get close and more shapes appear.',
    input: 'pointer',
    make: () => new Where(),
  },
  {
    id: 'flicker',
    name: 'Flicker',
    skill: 'attention',
    blurb: 'Two versions flicker back and forth. Find what changes.',
    how: 'The board flickers between two versions with a blank in between. One thing differs: it changes shade, shape, or disappears. Tap it. The blank hides the motion, so it is harder than it sounds.',
    input: 'pointer',
    make: () => new Flicker(),
  },
  {
    id: 'drift',
    name: 'Drift',
    skill: 'timing',
    blurb: 'Tap with a silent pulse that speeds up and slows down.',
    how: 'A dot pulses, silently, at a tempo that keeps drifting faster and slower. Tap on every pulse. Forty seconds; scored on how close each tap lands once you have caught the beat.',
    input: 'both',
    make: () => new Drift(),
  },
  {
    id: 'orbit',
    name: 'Orbit',
    skill: 'coordination',
    blurb: 'Each hand flips the direction of its own orbiting dot.',
    how: 'Two dots circle two rings, one per hand. Your key flips that dot’s direction. White arcs grow out from the centre: be elsewhere when they reach the ring. Grey arcs are worth catching. Three hits.',
    input: 'keys',
    minKeys: 2,
    make: () => new Orbit(),
  },
  {
    id: 'drum',
    name: 'Drum',
    skill: 'coordination',
    blurb: 'Read a left/right/both pattern. Play it in time.',
    how: 'A bar of eight steps shows which hand plays on each step: a dot in the top row is the left hand, the bottom row the right, both rows means both together. Four clicks count you in, then the click keeps going while you play the bar in time with it. Get 75% of the notes and the next bar is busier and faster. Each note shows whether you were early or late.',
    input: 'keys',
    minKeys: 2,
    make: () => new Drum(),
  },
];
