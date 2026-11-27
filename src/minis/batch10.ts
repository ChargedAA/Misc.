// Tenth batch.
//   Whack (reaction)     - discs pop up and vanish; tap the white ones, leave the grey.
//   Dodge (reaction)     - shots come from either side; block with that hand, let the grey ones by.
//   Exact (speed)        - tap exactly N times inside the window. Fast enough, and stop on time.
//   Twin  (coordination) - two tunnels, one per hand. Hold to climb, let go to fall.

import { COL_ACCENT, COL_DIM, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALL, SND_FALSE, SND_LURCH, SND_TAP_L, SND_TAP_R, SND_TAP_WEAK, SND_TONE } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import {
  arena,
  clamp,
  footer,
  handLabel,
  header,
  mean,
  median,
  message,
  ms,
  pct,
  progress,
  sideOf,
  type Mini,
  type MiniDef,
  type MiniEnv,
  type MiniResult,
  scaled,
} from './kit.ts';

const TAU = Math.PI * 2;
const GREY = '#6c6c74';

// --- Whack ------------------------------------------------------------------------

interface Mole {
  cell: number;
  at: number;
  until: number;
  grey: boolean;
  hit: boolean;
}

class Whack implements Mini {
  private env!: MiniEnv;
  private moles: Mole[] = [];
  private next = 0;
  private window = 1100;
  private lives = 3;
  private hits = 0;
  private rts: number[] = [];
  private bad = 0;
  private over = false;
  private overAt = 0;
  private geo = { x0: 0, y0: 0, s: 1 };
  private flash = new Float64Array(9);

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.next = now + 900;
  }

  press(): void {}

  pointer(px: number, py: number, ts: number): void {
    if (this.over) return;
    const g = this.geo;
    const c = Math.floor((px - g.x0) / g.s);
    const r = Math.floor((py - g.y0) / g.s);
    if (c < 0 || c > 2 || r < 0 || r > 2) return;
    const cell = r * 3 + c;
    const m = this.moles.find((q) => q.cell === cell && !q.hit && ts >= q.at && ts <= q.until);
    if (!m) return;
    m.hit = true;
    if (m.grey) {
      this.bad++;
      this.lose(ts, cell);
    } else {
      this.hits++;
      this.rts.push(ts - m.at);
      this.window = Math.max(420, this.window * 0.975);
      this.env.sound(SND_TONE + (cell % 7));
    }
  }

  private lose(now: number, cell: number): void {
    this.lives--;
    this.flash[cell] = now;
    this.env.sound(SND_LURCH);
    if (this.lives <= 0) {
      this.over = true;
      this.overAt = now + 1300;
      this.env.sound(SND_FALL);
    }
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.over && now >= this.overAt) return true;
    if (!this.over) {
      if (now >= this.next) {
        const free = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter((c) => !this.moles.some((m) => m.cell === c && now < m.until + 150));
        const n = this.hits > 25 && Math.random() < 0.3 ? 2 : 1;
        for (let k = 0; k < n && free.length; k++) {
          const cell = free.splice(Math.floor(Math.random() * free.length), 1)[0]!;
          this.moles.push({ cell, at: now, until: now + this.window, grey: this.hits > 4 && Math.random() < 0.25, hit: false });
        }
        this.next = now + this.window * (0.55 + Math.random() * 0.5);
      }
      for (const m of this.moles) {
        if (!m.hit && !m.grey && now > m.until) {
          m.hit = true;
          this.lose(now, m.cell);
          if (this.over) break;
        }
      }
      this.moles = this.moles.filter((m) => now < m.until + 400);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'hits', String(this.hits), 'window', ms(this.window), this.lives);
    const S = Math.min(a.bottom - a.top - 20 * a.u, a.right - a.left, 480 * a.u);
    const s = S / 3;
    const g = (this.geo = { x0: a.cx - S / 2, y0: a.cy - S / 2 + 10 * a.u, s });
    for (let c = 0; c < 9; c++) {
      const x = g.x0 + (c % 3) * s + s / 2;
      const y = g.y0 + Math.floor(c / 3) * s + s / 2;
      ctx.strokeStyle = now - this.flash[c]! < 300 ? COL_ACCENT : COL_DIM;
      ctx.lineWidth = dpr;
      ctx.beginPath();
      ctx.arc(x, y, s * 0.36, 0, TAU);
      ctx.stroke();
    }
    for (const m of this.moles) {
      if (now < m.at || m.hit || now > m.until) continue;
      const x = g.x0 + (m.cell % 3) * s + s / 2;
      const y = g.y0 + Math.floor(m.cell / 3) * s + s / 2;
      const life = (now - m.at) / (m.until - m.at);
      const r = s * 0.3 * Math.min(1, (now - m.at) / 70) * (1 - Math.max(0, life - 0.85) * 3);
      ctx.fillStyle = m.grey ? GREY : COL_LINE;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0, r), 0, TAU);
      ctx.fill();
    }
    if (this.hits < 3 && !this.over) {
      ctx.fillStyle = COL_MID;
      v.text('tap the white discs before they go. leave grey ones alone', a.cx, a.top + 6 * a.u, v.fontTiny, 'center');
    }
    if (this.over) message(v, { ...a, cy: g.y0 - 20 * a.u }, `${this.hits} hits`, '');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const med = median(this.rts);
    return {
      score: this.hits * 20 + (med ? Math.max(0, 600 - med) : 0),
      primary: { label: 'hits', value: this.hits, unit: '' },
      lines: [
        { label: 'hits', value: String(this.hits) },
        { label: 'median time to hit', value: ms(med) },
        { label: 'grey ones tapped', value: String(this.bad) },
        { label: 'shortest window', value: ms(this.window) },
      ],
      rts: this.rts,
      saved: this.hits >= 5,
    };
  }
}

// --- Dodge ------------------------------------------------------------------------

interface Shot {
  side: number;
  /** Distance from the centre, 1 at the edge, 0 on impact. */
  d: number;
  speed: number;
  grey: boolean;
  done: boolean;
}

const SHIELD_MS = 260;

class Dodge implements Mini {
  private env!: MiniEnv;
  private shots: Shot[] = [];
  private shield = [-1e9, -1e9];
  private last = 0;
  private time = 0;
  private spawn = 1.2;
  private lives = 3;
  private blocks = 0;
  private passes = 0;
  private wrong = 0;
  private margins: number[] = [];
  private hitFlash = 0;
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
    const s = sideOf(slot);
    if (s === 0) return;
    this.shield[s < 0 ? 0 : 1] = ts;
    this.env.sound(s > 0 ? SND_TAP_R : SND_TAP_L);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  private lose(now: number): void {
    this.lives--;
    this.hitFlash = now;
    this.env.sound(SND_LURCH);
    if (this.lives <= 0) {
      this.over = true;
      this.overAt = now + 1300;
      this.env.sound(SND_FALL);
    }
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.over && now >= this.overAt) return true;
    if (!this.over) {
      this.time += dt;
      this.spawn -= dt;
      if (this.spawn <= 0) {
        const speed = 0.7 + this.time * 0.018 + Math.random() * 0.25;
        const grey = this.time > 8 && Math.random() < 0.22;
        const side = Math.random() < 0.5 ? -1 : 1;
        this.shots.push({ side, d: 1, speed, grey, done: false });
        // Later, sometimes a pair from both sides at once.
        if (this.time > 25 && Math.random() < 0.2) this.shots.push({ side: -side, d: 1.02, speed, grey: false, done: false });
        this.spawn = Math.max(0.45, 1.3 - this.time * 0.012) * (0.7 + Math.random() * 0.6);
      }
      for (const s of this.shots) {
        if (s.done) continue;
        s.d -= s.speed * dt;
        const k = s.side < 0 ? 0 : 1;
        const up = now - this.shield[k]! < SHIELD_MS;
        // The shield sits a little out from the centre.
        if (s.d <= 0.12 && up) {
          s.done = true;
          if (s.grey) {
            this.wrong++;
            this.lose(now);
          } else {
            this.blocks++;
            this.margins.push(now - this.shield[k]!);
            this.env.sound(SND_CATCH);
          }
        } else if (s.d <= 0.06) {
          s.done = true;
          if (s.grey) this.passes++;
          else this.lose(now);
        }
        if (this.over) break;
      }
      this.shots = this.shots.filter((s) => !s.done);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'blocked', String(this.blocks), 'time', `${this.time.toFixed(1)} s`, this.lives);
    const half = Math.min((a.right - a.left) / 2 - 10 * a.u, 420 * a.u);
    const cy = a.cy;
    ctx.fillStyle = COL_DIM;
    ctx.fillRect(a.cx - half, cy, half * 2, dpr);
    // You.
    ctx.fillStyle = now - this.hitFlash < 300 ? COL_MID : COL_ACCENT;
    ctx.beginPath();
    ctx.arc(a.cx, cy, 10 * a.u, 0, TAU);
    ctx.fill();
    // Shields.
    for (let k = 0; k < 2; k++) {
      const up = now - this.shield[k]! < SHIELD_MS;
      const x = a.cx + (k ? 1 : -1) * half * 0.12;
      ctx.fillStyle = up ? COL_LINE : COL_DIM;
      ctx.fillRect(x - (up ? 2 : 1) * dpr, cy - 22 * a.u, (up ? 4 : 2) * dpr, 44 * a.u);
    }
    for (const s of this.shots) {
      const x = a.cx + s.side * s.d * half;
      ctx.fillStyle = s.grey ? GREY : COL_LINE;
      ctx.beginPath();
      ctx.arc(x, cy, 6 * a.u, 0, TAU);
      ctx.fill();
      ctx.fillRect(x + (s.side > 0 ? 0 : -18 * a.u), cy - dpr / 2, 18 * a.u, dpr);
    }
    ctx.fillStyle = COL_MID;
    v.text(handLabel(this.env, -1), a.cx - half * 0.12, cy + 44 * a.u, v.fontTiny, 'center');
    v.text(handLabel(this.env, 1), a.cx + half * 0.12, cy + 44 * a.u, v.fontTiny, 'center');
    if (this.time < 4 && !this.over) message(v, { ...a, cy: a.top + 30 * a.u }, 'block each shot with the hand on its side', 'the shield only lasts a moment. let grey shots through', COL_MID);
    if (this.over) message(v, { ...a, cy: a.cy - 80 * a.u }, `${this.blocks} blocked`, `${this.time.toFixed(1)} s`);
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.blocks * 15 + Math.round(this.time * 5) + this.passes * 10,
      primary: { label: 'blocked', value: this.blocks, unit: '' },
      lines: [
        { label: 'blocked', value: String(this.blocks) },
        { label: 'survived', value: `${this.time.toFixed(1)} s` },
        { label: 'grey shots let through', value: `${this.passes} of ${this.passes + this.wrong}` },
        { label: 'average shield-to-block', value: this.margins.length ? ms(mean(this.margins)) : '–' },
      ],
      saved: this.time > 5,
    };
  }
}

// --- Exact ------------------------------------------------------------------------

const EXACT_ROUNDS = 10;

class Exact implements Mini {
  private env!: MiniEnv;
  private round = 0;
  private target = 8;
  private windowMs = 2000;
  private taps = 0;
  private t0 = 0;
  private state = 0; // 0 waiting for first tap, 1 counting, 2 feedback
  private at = 0;
  private exact = 0;
  private errs: number[] = [];
  private held = 0;
  private rate = 4.5;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.make(now);
  }

  private make(_now: number): void {
    // The required rate climbs from about 4.5 to 9 taps a second.
    this.rate = 4.5 + (this.round / (scaled(EXACT_ROUNDS) - 1)) * 4.5 + (Math.random() - 0.5);
    this.windowMs = [1500, 2000, 2500, 3000][Math.floor(Math.random() * 4)]!;
    this.target = Math.max(4, Math.round((this.rate * this.windowMs) / 1000));
    this.taps = 0;
    this.state = 0;
  }

  private tap(ts: number): void {
    if (this.state === 2) return;
    if (this.state === 0) {
      this.state = 1;
      this.t0 = ts;
    }
    if (ts - this.t0 <= this.windowMs) this.taps++;
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
    if (this.state === 1 && now - this.t0 > this.windowMs) {
      const e = this.taps - this.target;
      this.errs.push(e);
      if (e === 0) this.exact++;
      this.env.sound(e === 0 ? SND_CATCH : Math.abs(e) === 1 ? SND_TAP_WEAK : SND_FALSE);
      this.round++;
      this.state = 2;
      this.at = now + 1500;
    }
    if (this.state === 2 && now >= this.at) {
      if (this.round >= scaled(EXACT_ROUNDS)) return true;
      this.make(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'exact', `${this.exact} / ${this.round}`, 'round', `${Math.min(this.round + 1, scaled(EXACT_ROUNDS))} / ${scaled(EXACT_ROUNDS)}`);
    ctx.fillStyle = COL_LINE;
    v.text(`${this.target} taps`, a.cx, a.cy - 40 * a.u, v.fontBig, 'center');
    ctx.fillStyle = COL_MID;
    v.text(`in ${(this.windowMs / 1000).toFixed(1)} seconds, no more, no less`, a.cx, a.cy - 4 * a.u, v.fontTiny, 'center');
    if (this.state === 0) v.text('the clock starts on your first tap. the count is hidden', a.cx, a.cy + 70 * a.u, v.fontTiny, 'center');
    else if (this.state === 1) progress(v, a.cx, a.cy + 40 * a.u, 140 * a.u, clamp((now - this.t0) / this.windowMs, 0, 1), COL_ACCENT);
    else {
      const e = this.errs[this.errs.length - 1]!;
      message(v, { ...a, cy: a.cy + 60 * a.u }, `${this.taps}`, e === 0 ? 'exactly' : `${Math.abs(e)} too ${e > 0 ? 'many' : 'few'}`, e === 0 ? COL_LINE : COL_MID);
    }
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const abs = this.errs.map(Math.abs);
    const over = this.errs.filter((e) => e > 0).length;
    const under = this.errs.filter((e) => e < 0).length;
    return {
      score: this.exact * 100 + abs.filter((e) => e === 1).length * 40,
      primary: { label: 'exact', value: this.exact, unit: `/ ${scaled(EXACT_ROUNDS)}` },
      lines: [
        { label: 'exact', value: `${this.exact} of ${this.round}` },
        { label: 'within one', value: pct(abs.filter((e) => e <= 1).length / (abs.length || 1)) },
        { label: 'too many / too few', value: `${over} / ${under}` },
      ],
      saved: this.round >= 3,
    };
  }
}

// --- Twin -------------------------------------------------------------------------

/** A zigzag corridor sampled every 0.02 widths: centre and half-width, in 0..1 of its lane. */
class Corridor {
  cy: number[] = [];
  hw: number[] = [];

  constructor() {
    for (let i = 0; i < 50; i++) this.push(0.5, 0.26);
  }

  private push(c: number, w: number): void {
    this.cy.push(c);
    this.hw.push(w);
  }

  extend(x: number): void {
    const n = this.cy.length;
    let c = this.cy[n - 1]!;
    let dir = n > 1 && this.cy[n - 1]! < this.cy[n - 2]! ? -1 : 1;
    const w = Math.max(0.12, 0.24 - x * 0.006);
    for (let i = 0; i < 100; i++) {
      if (Math.random() < 0.07 + x * 0.0015 || c + dir * 0.03 > 0.97 - w || c + dir * 0.03 < 0.03 + w) dir = -dir;
      c = clamp(c + dir * 0.03, 0.03 + w, 0.97 - w);
      this.push(c, w);
    }
  }

  /** The corridor at a distance, interpolated between its points so walls and collisions are smooth. */
  sample(at: number): [number, number] {
    const f = clamp(at / 0.02, 0, this.cy.length - 1);
    const i = Math.floor(f);
    const j = Math.min(i + 1, this.cy.length - 1);
    const t = f - i;
    return [this.cy[i]! + (this.cy[j]! - this.cy[i]!) * t, this.hw[i]! + (this.hw[j]! - this.hw[i]!) * t];
  }
}

class Twin implements Mini {
  private env!: MiniEnv;
  private lanes = [new Corridor(), new Corridor()];
  private y = [0.5, 0.5];
  private up = [false, false];
  private x = 0;
  private speed = 0.22;
  private last = 0;
  private started = false;
  private over = false;
  private overAt = 0;
  private crashed = -1;
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.last = now;
    for (const l of this.lanes) l.extend(0);
  }

  private sync(): void {
    // A lane climbs while any key of its hand is held.
    const left = (this.held & 0b111) !== 0;
    const right = (this.held & 0b111000) !== 0;
    this.up = [left, right];
  }

  press(slot: number): void {
    this.held |= 1 << slot;
    if (sideOf(slot) === 0) return;
    this.started = true;
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
      this.speed = 0.22 + this.x * 0.003;
      this.x += this.speed * dt;
      for (let k = 0; k < 2; k++) {
        // Each lane is half as tall as it is wide, so vertical motion is doubled to keep 45 degrees.
        this.y[k]! += (this.up[k] ? -1 : 1) * this.speed * dt * 1.5;
        const l = this.lanes[k]!;
        if ((l.cy.length - 1) * 0.02 < this.x + 3) l.extend(this.x);
        const [c, w] = l.sample(this.x + 0.25);
        if (this.y[k]! < c - w || this.y[k]! > c + w) {
          this.over = true;
          this.crashed = k;
          this.overAt = now + 1300;
          this.env.sound(SND_FALL);
          break;
        }
      }
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'distance', `${(this.x * 10).toFixed(0)} m`, 'speed', `${(this.speed / 0.22).toFixed(2)}×`);
    const W = a.right - a.left;
    const H = (a.bottom - a.top - 16 * a.u) / 2;
    const scale = Math.min(W, H * 2.2);
    for (let k = 0; k < 2; k++) {
      const top = a.top + k * (H + 16 * a.u);
      const toX = (d: number) => a.left + (d - this.x + 0.25) * scale;
      const toY = (yy: number) => top + yy * H;
      ctx.save();
      ctx.beginPath();
      ctx.rect(a.left, top, W, H);
      ctx.clip();
      ctx.strokeStyle = this.crashed === k ? COL_ACCENT : COL_LINE;
      ctx.lineWidth = 1.5 * dpr;
      const l = this.lanes[k]!;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        let first = true;
        // Drawn through the corridor's own points, so the walls glide rather than shimmer.
        for (let d = Math.floor((this.x - 0.3) / 0.02) * 0.02; d < this.x + W / scale + 0.02; d += 0.02) {
          const [c, w] = l.sample(d);
          const px = toX(d);
          const py = toY(c + side * w);
          if (first) {
            ctx.moveTo(px, py);
            first = false;
          } else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      ctx.fillStyle = COL_ACCENT;
      ctx.beginPath();
      ctx.arc(toX(this.x + 0.25), toY(this.y[k]!), 6 * a.u, 0, TAU);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = COL_MID;
      v.text(handLabel(this.env, k ? 1 : -1), a.left + 6 * a.u, top + 14 * a.u, v.fontTiny, 'left');
    }
    if (!this.started) message(v, a, 'hold to climb, let go to fall', 'top lane: left hand. bottom lane: right hand. press either to start', COL_MID);
    if (this.over) message(v, { ...a, cy: a.cy }, `${(this.x * 10).toFixed(0)}`, 'distance');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const d = Math.round(this.x * 10);
    return {
      score: d * 10,
      primary: { label: 'distance', value: d, unit: '' },
      lines: [
        { label: 'distance', value: String(d) },
        { label: 'lost in', value: this.crashed < 0 ? '–' : this.crashed ? `the bottom lane (${handLabel(this.env, 1)})` : `the top lane (${handLabel(this.env, -1)})` },
      ],
      // A run always counts once it has gone anywhere: distance is the score.
      saved: d >= 1,
    };
  }
}

export const BATCH10: MiniDef[] = [
  {
    id: 'whack',
    name: 'Whack',
    skill: 'reaction',
    blurb: 'Discs pop up and vanish. Tap the white ones, leave the grey.',
    how: 'White discs pop up in a three-by-three grid and shrink away. Tap each before it goes. Grey ones are traps: leave them. Every hit shortens the window. A missed white or a tapped grey costs a life; three lives.',
    input: 'pointer',
    make: () => new Whack(),
  },
  {
    id: 'dodge',
    name: 'Dodge',
    skill: 'reaction',
    blurb: 'Shots come from either side. Block with that hand; let grey ones by.',
    how: 'Shots fly in from the left and right. Press that hand to raise its shield, which only lasts a quarter of a second, so press as they arrive. Grey shots are harmless unless you block them. Later, pairs come from both sides at once. Three lives.',
    input: 'keys',
    minKeys: 2,
    make: () => new Dodge(),
  },
  {
    id: 'exact',
    name: 'Exact',
    skill: 'speed',
    blurb: 'Tap exactly N times inside the window. Fast enough, and stop on time.',
    how: 'You get a number of taps and a time window. The clock starts on your first tap; land exactly that many before it closes. The count is hidden, so you have to feel it. The pace needed rises from four and a half to nine taps a second.',
    input: 'both',
    make: () => new Exact(),
  },
  {
    id: 'twin',
    name: 'Twin',
    skill: 'coordination',
    blurb: 'Two tunnels, one per hand. Hold to climb, let go to fall.',
    how: 'Two dots fly through two zigzag tunnels at once. Hold a left-hand key and the top dot climbs; let go and it falls. The right hand flies the bottom one. Touch a wall and it is over. The tunnels narrow and speed up.',
    input: 'keys',
    minKeys: 2,
    make: () => new Twin(),
  },
];
