// Eleventh batch.
//   Melody (memory)       - pads play a tune; play it back. Later you only hear it.
//   Pole   (coordination) - balance a pole on a cart, one hand pushing each way.
//   Ears   (reaction)     - a flash or a beep, at random. Which do you react to faster?
//   Guess  (judgement)    - a cloud of dots flashes. How many?

import { ANTICIPATION_MS, COL_ACCENT, COL_DIM, COL_LINE, COL_MID } from '../config.ts';
import { SND_BEAT_UP, SND_CATCH, SND_FALL, SND_FALSE, SND_TAP_L, SND_TAP_R, SND_TONE } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import {
  arena,
  footer,
  foreperiod,
  handLabel,
  header,
  mean,
  median,
  message,
  ms,
  pct,
  sideOf,
  type Mini,
  type MiniDef,
  type MiniEnv,
  type MiniResult,
  gameNow,
} from './kit.ts';

const TAU = Math.PI * 2;

// --- Melody -----------------------------------------------------------------------

const PADS = 5;

class Melody implements Mini {
  private env!: MiniEnv;
  private seq: number[] = [];
  private pos = 0;
  private state = 0; // 0 playing, 1 your turn, 2 feedback
  private t0 = 0;
  private at = 0;
  private strikes = 0;
  private best = 0;
  private bestBlind = 0;
  private blind = false;
  private lit = new Float64Array(PADS);
  private lastNote = -1;
  private ok = true;
  private rects: number[][] = [];
  private round = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    for (let k = 0; k < 3; k++) this.seq.push(Math.floor(Math.random() * PADS));
    this.play(now + 700);
  }

  private play(at: number): void {
    // From five notes on, every other tune is sound only (unless sound is off).
    this.blind = !this.env.muted && this.seq.length >= 5 && this.round % 2 === 1;
    this.t0 = at;
    this.pos = 0;
    this.lastNote = -1;
    this.state = 0;
  }

  private gap(): number {
    return Math.max(380, 620 - this.seq.length * 15);
  }

  press(): void {}

  private tap(k: number, ts: number): void {
    if (this.state !== 1) return;
    this.lit[k] = ts;
    this.env.sound(SND_TONE + 1 + k);
    if (k !== this.seq[this.pos]) {
      this.ok = false;
      this.strikes++;
      this.env.sound(SND_FALSE);
      this.state = 2;
      this.at = ts + 1500;
      return;
    }
    this.pos++;
    if (this.pos >= this.seq.length) {
      this.ok = true;
      if (this.blind) this.bestBlind = Math.max(this.bestBlind, this.seq.length);
      else this.best = Math.max(this.best, this.seq.length);
      this.state = 2;
      this.at = ts + 900;
    }
  }

  pointer(x: number, y: number, ts: number): void {
    this.rects.forEach((r, k) => {
      if (Math.hypot(x - r[0]!, y - r[1]!) < r[2]!) this.tap(k, ts);
    });
  }

  typeKey(code: string, ts: number): boolean {
    const m = /^(?:Digit|Numpad)([1-5])$/.exec(code);
    if (!m) return false;
    this.tap(Number(m[1]) - 1, ts);
    return true;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.t0) {
      const k = Math.floor((now - this.t0) / this.gap());
      if (k !== this.lastNote && k < this.seq.length) {
        this.lastNote = k;
        const p = this.seq[k]!;
        if (!this.blind) this.lit[p] = now;
        this.env.sound(SND_TONE + 1 + p);
      }
      if (k >= this.seq.length) this.state = 1;
    }
    if (this.state === 2 && now >= this.at) {
      if (this.strikes >= 3) return true;
      this.round++;
      if (this.ok) this.seq.push(Math.floor(Math.random() * PADS));
      else {
        // A fresh tune of the same length after a miss.
        const n = this.seq.length;
        this.seq = [];
        for (let k = 0; k < n; k++) this.seq.push(Math.floor(Math.random() * PADS));
      }
      this.play(now + 400);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'notes', String(this.seq.length), 'best', String(Math.max(this.best, this.bestBlind)), 3 - this.strikes);
    // Five pads on an arc, low to high.
    const R = Math.min((a.right - a.left) / 2.4, (a.bottom - a.top) * 0.75, 300 * a.u);
    const pr = Math.min(R * 0.24, 46 * a.u);
    this.rects = [];
    for (let k = 0; k < PADS; k++) {
      const ang = Math.PI * (1.1 + (0.8 * k) / (PADS - 1));
      const x = a.cx + Math.cos(ang) * R;
      const y = a.cy + R * 0.55 + Math.sin(ang) * R;
      this.rects.push([x, y, pr]);
      const on = now - this.lit[k]! < 260;
      ctx.beginPath();
      ctx.arc(x, y, pr * (on ? 1.06 : 1), 0, TAU);
      if (on) {
        ctx.fillStyle = this.state === 2 && !this.ok ? COL_ACCENT : COL_LINE;
        ctx.fill();
      } else {
        ctx.strokeStyle = COL_MID;
        ctx.lineWidth = (1 + k * 0.4) * dpr;
        ctx.stroke();
      }
      ctx.fillStyle = COL_DIM;
      v.text(String(k + 1), x, y + pr + 16 * dpr, v.fontTiny, 'center');
    }
    ctx.fillStyle = this.blind && this.state === 0 ? COL_ACCENT : COL_MID;
    const msg =
      this.state === 0 ? (this.blind ? 'listen only' : 'watch and listen') : this.state === 1 ? 'your turn' : this.ok ? 'right' : 'not quite';
    v.text(msg, a.cx, a.cy + R * 0.5, v.fontHud, 'center');
    if (this.round === 0 && this.state !== 2) {
      ctx.fillStyle = COL_MID;
      v.text('play the tune back: tap the pads or press 1 to 5. pads rise in pitch left to right', a.cx, a.top + 10 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const top = Math.max(this.best, this.bestBlind);
    return {
      score: this.best * 80 + this.bestBlind * 120,
      primary: { label: 'longest tune', value: top, unit: 'notes' },
      lines: [
        { label: 'longest tune, seen and heard', value: `${this.best} notes` },
        { label: 'longest tune, heard only', value: this.bestBlind ? `${this.bestBlind} notes` : '–' },
        { label: 'tunes played', value: String(this.round + 1) },
      ],
      saved: this.round >= 1,
    };
  }
}

// --- Pole -------------------------------------------------------------------------

/** Pole length (m), half the track (m), motor (m/s²), drag (1/s), gravity at the start (m/s²). */
const POLE_LEN = 1.5;
const POLE_TRACK = 1.4;
const POLE_FORCE = 3.6;
const POLE_DRAG = 1.2;
const POLE_G = 2.4;

class Pole implements Mini {
  private env!: MiniEnv;
  /** Cart position (m, 0 at the middle) and speed (m/s). */
  private x = 0;
  private v = 0;
  /** Motor force, eased toward what the keys ask for so a push is firm but not a jolt. */
  private drive = 0;
  private th = 0.04;
  private om = 0;
  private push = 0;
  private time = 0;
  private last = 0;
  private started = false;
  private over = false;
  private overAt = 0;
  private gust = 0;
  private gustT = 6;
  private held = 0;
  private pushes = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.last = now;
    this.th = (Math.random() < 0.5 ? -1 : 1) * 0.03;
  }

  private sync(): void {
    const l = (this.held & 0b111) !== 0;
    const r = (this.held & 0b111000) !== 0;
    this.push = (r ? 1 : 0) - (l ? 1 : 0);
  }

  press(slot: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (s === 0) return;
    this.started = true;
    this.pushes++;
    this.env.sound(s > 0 ? SND_TAP_R : SND_TAP_L);
    this.sync();
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
    this.sync();
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.over && now >= this.overAt) return true;
    if (this.started && !this.over) {
      this.time += dt;
      // Gusts start after a few seconds and grow: a sideways push on the top of the pole.
      this.gustT -= dt;
      if (this.gustT <= 0) {
        this.gust = (Math.random() < 0.5 ? -1 : 1) * Math.min(1.6, 0.5 + this.time * 0.025);
        this.gustT = 2 + Math.random() * 3;
      }
      this.gust *= Math.exp(-dt * 2.5);
      // Cart and pole in one set of units (metres, seconds). Gravity is turned down so
      // the pole falls slowly enough to catch, and creeps up the longer you last.
      const g = POLE_G + Math.min(1.8, this.time * 0.02);
      const steps = 10;
      const h = dt / steps;
      for (let i = 0; i < steps; i++) {
        this.drive += (this.push - this.drive) * Math.min(1, h / 0.05);
        let acc = this.drive * POLE_FORCE - this.v * POLE_DRAG;
        const nv = this.v + acc * h;
        const nx = this.x + nv * h;
        if (Math.abs(nx) > POLE_TRACK) {
          // Hitting the end stop halts the cart within the step, and the pole feels it.
          acc = -this.v / h;
          this.x = Math.sign(nx) * POLE_TRACK;
          this.v = 0;
        } else {
          this.v = nv;
          this.x = nx;
        }
        // Inverted pendulum with its weight at the top: the cart's acceleration tips it the other way.
        const alpha = (g * Math.sin(this.th) - acc * Math.cos(this.th) + this.gust * Math.cos(this.th)) / POLE_LEN;
        this.om += alpha * h;
        this.om *= Math.exp(-0.25 * h);
        this.th += this.om * h;
      }
      if (Math.abs(this.th) > 0.9) {
        this.over = true;
        this.overAt = now + 1400;
        this.env.sound(SND_FALL);
      }
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'time', `${this.time.toFixed(1)} s`, 'lean', `${Math.round((this.th * 180) / Math.PI)}°`);
    const ground = a.bottom - 60 * a.u;
    // One scale for the track and the pole, so what you see is what the physics does.
    const ppm = Math.min(((a.right - a.left) / 2 - 50 * a.u) / POLE_TRACK, (ground - a.top - 50 * a.u) / POLE_LEN);
    const half = POLE_TRACK * ppm;
    const Lpx = POLE_LEN * ppm;
    ctx.fillStyle = COL_DIM;
    // The track, with end stops just past where the cart's sides meet them.
    const stop = half + 26 * a.u;
    ctx.fillRect(a.cx - stop, ground, stop * 2, dpr);
    ctx.fillRect(a.cx - stop, ground - 14 * a.u, 2 * dpr, 14 * a.u);
    ctx.fillRect(a.cx + stop - 2 * dpr, ground - 14 * a.u, 2 * dpr, 14 * a.u);
    const cx = a.cx + this.x * ppm;
    // Cart.
    ctx.strokeStyle = COL_MID;
    ctx.lineWidth = 1.5 * dpr;
    ctx.strokeRect(cx - 24 * a.u, ground - 16 * a.u, 48 * a.u, 16 * a.u);
    if (this.push) {
      ctx.fillStyle = COL_MID;
      ctx.fillRect(cx + (this.push > 0 ? -34 : 24) * a.u, ground - 9 * a.u, 10 * a.u, 2 * dpr);
    }
    // Pole.
    const tx = cx + Math.sin(this.th) * Lpx;
    const ty = ground - 16 * a.u - Math.cos(this.th) * Lpx;
    ctx.strokeStyle = this.over ? COL_MID : COL_LINE;
    ctx.lineWidth = 3 * dpr;
    ctx.beginPath();
    ctx.moveTo(cx, ground - 16 * a.u);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.fillStyle = COL_ACCENT;
    ctx.beginPath();
    ctx.arc(tx, ty, 7 * a.u, 0, TAU);
    ctx.fill();
    // Gust indicator.
    if (Math.abs(this.gust) > 0.3) {
      ctx.fillStyle = COL_DIM;
      const gx = a.cx + Math.sign(this.gust) * (half - 10 * a.u);
      v.text(this.gust > 0 ? 'gust →' : '← gust', gx, a.top + 20 * a.u, v.fontTiny, 'center');
    }
    ctx.fillStyle = COL_MID;
    v.text(`← ${handLabel(this.env, -1)}`, a.cx - half, ground + 26 * a.u, v.fontTiny, 'left');
    v.text(`${handLabel(this.env, 1)} →`, a.cx + half, ground + 26 * a.u, v.fontTiny, 'right');
    if (!this.started) message(v, { ...a, cy: a.top + 40 * a.u }, 'keep the pole up', 'hold left or right to push the cart under it. press to start', COL_MID);
    if (this.over) message(v, { ...a, cy: a.top + 40 * a.u }, `${this.time.toFixed(1)} s`, 'it fell');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: Math.round(this.time * 15),
      primary: { label: 'balanced', value: this.time, unit: 's', decimals: 1 },
      lines: [
        { label: 'balanced for', value: `${this.time.toFixed(1)} s` },
        { label: 'pushes', value: String(this.pushes) },
      ],
      saved: this.time > 2,
    };
  }
}

// --- Ears -------------------------------------------------------------------------

const EARS_TRIALS = 30;

class Ears implements Mini {
  private env!: MiniEnv;
  private i = 0;
  private audio = false;
  private state = 0; // 0 waiting, 1 stimulus, 2 feedback
  private at = 0;
  private stimAt = 0;
  private seen: number[] = [];
  private heard: number[] = [];
  private early = 0;
  private last = 0;
  private lastEarly = false;
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.arm(now + 600);
  }

  private arm(now: number): void {
    this.audio = !this.env.muted && Math.random() < 0.5;
    this.at = now + foreperiod(900, 900, 3000);
    this.state = 0;
    this.stimAt = 0;
  }

  private hit(ts: number): void {
    if (this.state === 0) {
      this.early++;
      this.lastEarly = true;
      this.env.sound(SND_FALSE);
      this.state = 2;
      this.at = ts + 900;
      return;
    }
    if (this.state !== 1 || this.stimAt === 0) return;
    const rt = ts - this.stimAt;
    if (rt < ANTICIPATION_MS) return;
    (this.audio ? this.heard : this.seen).push(rt);
    this.last = rt;
    this.lastEarly = false;
    this.i++;
    this.state = 2;
    this.at = ts + 700;
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
    if (this.state === 0 && now >= this.at) {
      this.state = 1;
      if (this.audio) {
        this.stimAt = gameNow();
        this.env.sound(SND_BEAT_UP);
      }
    }
    if (this.state === 1 && this.stimAt && now - this.stimAt > 1500) {
      this.i++;
      this.state = 2;
      this.last = 1500;
      this.lastEarly = false;
      this.at = now + 700;
    }
    if (this.state === 2 && now >= this.at) {
      if (this.i >= EARS_TRIALS || this.early >= 12) return true;
      this.arm(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'see', this.seen.length ? ms(median(this.seen)) : '–', 'hear', this.heard.length ? ms(median(this.heard)) : '–');
    ctx.strokeStyle = COL_DIM;
    ctx.lineWidth = v.dpr;
    ctx.beginPath();
    ctx.arc(a.cx, a.cy, 50 * a.u, 0, TAU);
    ctx.stroke();
    if (this.state === 1 && !this.audio) {
      if (this.stimAt === 0) this.stimAt = gameNow();
      ctx.fillStyle = COL_LINE;
      ctx.beginPath();
      ctx.arc(a.cx, a.cy, 50 * a.u, 0, TAU);
      ctx.fill();
    } else if (this.state === 2) {
      ctx.fillStyle = COL_MID;
      v.text(this.lastEarly ? 'too soon' : `${Math.round(this.last)} ms`, a.cx, a.cy + 6 * v.dpr, v.fontHud, 'center');
    }
    ctx.fillStyle = COL_MID;
    v.text(
      this.env.muted ? 'sound is off, so this is flashes only. turn sound on for the comparison' : 'press the moment you see the flash or hear the beep',
      a.cx,
      a.cy + 90 * a.u,
      v.fontTiny,
      'center',
    );
    v.text(`${Math.min(this.i + 1, EARS_TRIALS)} / ${EARS_TRIALS}`, a.cx, a.bottom - 20 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const s = median(this.seen);
    const h = median(this.heard);
    const all = [...this.seen, ...this.heard];
    return {
      score: all.length ? Math.round(Math.max(0, 450 - median(all)) * 3 + all.length * 3) : 0,
      primary: { label: 'median overall', value: median(all), unit: 'ms', lower: true },
      lines: [
        { label: 'median to a flash', value: ms(s) },
        { label: 'median to a beep', value: this.heard.length ? ms(h) : '–' },
        { label: 'ears faster by', value: s && h ? `${Math.round(s - h)} ms` : '–' },
        { label: 'too soon', value: String(this.early) },
      ],
      rts: all,
      saved: all.length >= 8,
    };
  }
}

// --- Guess ------------------------------------------------------------------------

const GUESS_ROUNDS = 12;

class Guess implements Mini {
  private env!: MiniEnv;
  private n = 0;
  private dots: number[] = [];
  private typed = '';
  private state = 0; // 0 showing, 1 typing, 2 feedback
  private t0 = 0;
  private at = 0;
  private round = 0;
  private ratios: number[] = [];
  private keys: [number, number, number, number, string][] = [];

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.make(now + 500);
  }

  private make(now: number): void {
    // Log-uniform between 12 and 250.
    this.n = Math.round(Math.exp(Math.log(12) + Math.random() * (Math.log(250) - Math.log(12))));
    this.dots = [];
    const rad = 0.012 + Math.random() * 0.01;
    let guard = 0;
    while (this.dots.length < this.n * 2 && guard++ < 20000) {
      const x = 0.05 + Math.random() * 0.9;
      const y = 0.05 + Math.random() * 0.9;
      let ok = true;
      for (let k = 0; k < this.dots.length; k += 2) if (Math.hypot(this.dots[k]! - x, this.dots[k + 1]! - y) < rad * 2.4) ok = false;
      if (ok) this.dots.push(x, y);
    }
    this.n = this.dots.length / 2;
    this.typed = '';
    this.t0 = now;
    this.state = 0;
  }

  private type(d: string, ts: number): void {
    if (this.state !== 1) return;
    if (d === '<') this.typed = this.typed.slice(0, -1);
    else if (d === 'ok') {
      const g = Number(this.typed);
      if (!g) return;
      const r = g / this.n;
      this.ratios.push(r);
      this.env.sound(Math.abs(Math.log(r)) < 0.1 ? SND_CATCH : Math.abs(Math.log(r)) < 0.3 ? SND_TONE + 2 : SND_FALSE);
      this.round++;
      this.state = 2;
      this.at = ts + 1800;
    } else if (this.typed.length < 3) {
      this.typed += d;
      this.env.sound(SND_TONE + (Number(d) % 7));
    }
  }

  press(): void {}

  typeKey(code: string, ts: number): boolean {
    const m = /^(?:Digit|Numpad)(\d)$/.exec(code);
    if (m) {
      this.type(m[1]!, ts);
      return true;
    }
    if (code === 'Backspace') {
      this.type('<', ts);
      return true;
    }
    if (code === 'Enter' || code === 'NumpadEnter') {
      this.type('ok', ts);
      return true;
    }
    return false;
  }

  pointer(x: number, y: number, ts: number): void {
    for (const [kx, ky, w, h, d] of this.keys) if (x >= kx && x <= kx + w && y >= ky && y <= ky + h) this.type(d, ts);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now - this.t0 > 1100) this.state = 1;
    if (this.state === 1 && now - this.t0 > 30000) {
      // Out of time: only an estimate actually typed counts.
      if (this.typed) this.ratios.push(Number(this.typed) / this.n);
      this.round++;
      this.state = 2;
      this.at = now + 1500;
    }
    if (this.state === 2 && now >= this.at) {
      if (this.round >= GUESS_ROUNDS) return true;
      this.make(now + 300);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const recent = this.ratios.slice(-4).map((r) => Math.abs(r - 1));
    header(v, touch, 'off by', recent.length ? pct(mean(recent)) : '–', 'round', `${Math.min(this.round + 1, GUESS_ROUNDS)} / ${GUESS_ROUNDS}`);
    const wide = a.right - a.left > (a.bottom - a.top) * 1.2;
    const box = Math.min(wide ? (a.right - a.left) * 0.48 : a.right - a.left, (a.bottom - a.top) * (wide ? 0.9 : 0.45), 420 * a.u);
    const bx = wide ? a.left + (a.right - a.left) * 0.27 - box / 2 : a.cx - box / 2;
    const by = wide ? a.cy - box / 2 : a.top + 4 * a.u;
    ctx.strokeStyle = COL_DIM;
    ctx.lineWidth = dpr;
    ctx.strokeRect(bx + 0.5, by + 0.5, box - 1, box - 1);
    if (this.state === 0 && now >= this.t0) {
      ctx.fillStyle = COL_LINE;
      for (let k = 0; k < this.dots.length; k += 2) {
        ctx.beginPath();
        ctx.arc(bx + this.dots[k]! * box, by + this.dots[k + 1]! * box, Math.max(1.5 * dpr, box * 0.008), 0, TAU);
        ctx.fill();
      }
    } else if (this.state === 2) {
      const r = this.ratios[this.ratios.length - 1]!;
      message(v, { ...a, cx: bx + box / 2, cy: by + box / 2 }, `${this.n} dots`, `you said ${Math.round(r * this.n)}  ·  ${r >= 1 ? '+' : '−'}${Math.round(Math.abs(r - 1) * 100)}%`);
    }
    // Entry and keypad.
    const px = wide ? a.left + (a.right - a.left) * 0.75 : a.cx;
    const kw = Math.min(64 * a.u, (wide ? (a.right - a.left) * 0.4 : a.right - a.left) / 3.6);
    const kh = kw * 0.6;
    const gap = 8 * a.u;
    const x0 = px - (kw * 3 + gap * 2) / 2;
    const y0 = wide ? a.cy - (kh * 4 + gap * 3) / 2 + 30 * a.u : by + box + 60 * a.u;
    ctx.fillStyle = this.state === 1 ? COL_LINE : COL_DIM;
    v.text(this.typed || (this.state === 1 ? 'how many?' : ''), px, y0 - 24 * a.u, v.fontHud, 'center');
    const labels = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '<', '0', 'ok'];
    this.keys = [];
    labels.forEach((d, k) => {
      const x = x0 + (k % 3) * (kw + gap);
      const y = y0 + Math.floor(k / 3) * (kh + gap);
      this.keys.push([x, y, kw, kh, d]);
      ctx.strokeStyle = d === 'ok' && this.state === 1 && this.typed ? COL_ACCENT : COL_DIM;
      ctx.lineWidth = dpr;
      ctx.strokeRect(x + 0.5, y + 0.5, kw - 1, kh - 1);
      ctx.fillStyle = this.state === 1 ? COL_LINE : COL_DIM;
      v.text(d === '<' ? 'del' : d, x + kw / 2, y + kh / 2 + 5 * dpr, v.fontHud, 'center');
    });
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const errs = this.ratios.map((r) => Math.abs(r - 1));
    const m = mean(errs);
    const logs = this.ratios.filter((r) => r > 0).map((r) => Math.log(r));
    const bias = logs.length ? Math.exp(mean(logs)) - 1 : 0;
    return {
      score: errs.length ? Math.round(Math.max(0, 0.6 - m) * 1500) : 0,
      primary: { label: 'average error', value: m * 100, unit: '%', lower: true },
      lines: [
        { label: 'average error', value: pct(m) },
        { label: 'within 10%', value: pct(errs.filter((e) => e <= 0.1).length / (errs.length || 1)) },
        { label: 'tendency', value: Math.abs(bias) < 0.03 ? 'about right' : `${Math.round(Math.abs(bias) * 100)}% ${bias > 0 ? 'over' : 'under'}` },
      ],
      saved: this.round >= 4,
    };
  }
}

export const BATCH11: MiniDef[] = [
  {
    id: 'melody',
    name: 'Melody',
    skill: 'memory',
    blurb: 'Pads play a tune. Play it back. Later you only hear it.',
    how: 'Five pads, low to high. They play a tune; tap it back (or press 1 to 5). Each tune you get adds a note. From five notes on, every other tune plays with the pads dark: you go by ear alone. Three misses end it. Best with sound on.',
    input: 'pointer',
    make: () => new Melody(),
  },
  {
    id: 'pole',
    name: 'Pole',
    skill: 'coordination',
    blurb: 'Balance a pole on a cart. One hand pushes each way.',
    how: 'Hold a left-hand key to push the cart left and a right-hand key to push it right. Keep the pole from falling: move the cart under it before it leans too far. Gusts start after a few seconds and grow.',
    input: 'keys',
    minKeys: 2,
    make: () => new Pole(),
  },
  {
    id: 'ears',
    name: 'Ears',
    skill: 'reaction',
    blurb: 'A flash or a beep, at random. Which do you react to faster?',
    how: 'Press the moment you see the circle flash or hear the beep. They are mixed at random. Most people react to sound a few tens of milliseconds faster; the results show your gap. Needs sound on.',
    input: 'both',
    make: () => new Ears(),
  },
  {
    id: 'guess',
    name: 'Guess',
    skill: 'judgement',
    blurb: 'A cloud of dots flashes. How many?',
    how: 'Dots flash for about a second: far too many to count. Type your estimate on the keypad or number keys, then ok (or Enter). Scored on how close you get; the results also show whether you tend to guess high or low.',
    input: 'pointer',
    make: () => new Guess(),
  },
];
