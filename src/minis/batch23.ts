// Twenty-third batch: more steering, each hiding a reaction or timing drill.
//   Comet  (coordination) - you always move forward; hold left or right to turn. Collect dots, miss the mines.
//   Volley (reaction)     - return the ball with the hand on its side as it reaches your line. It comes back faster.
//   Slalom (coordination) - ski down with momentum and pass every flag on its marked side.

import { COL_ACCENT, COL_DIM, COL_FAINT, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALL, SND_FALSE, SND_LURCH, SND_RING, SND_TAP_L, SND_TAP_R } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { ship } from './sprites.ts';
import { arena, footer, handLabel, header, mean, median, message, ms, sideOf, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const TAU = Math.PI * 2;

function rnd(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo);
}

/** Which way the held keys steer: -1 left, 1 right, 0 neither or both. */
function steer(held: number): number {
  const l = (held & 0b000111) !== 0;
  const r = (held & 0b111000) !== 0;
  return (r ? 1 : 0) - (l ? 1 : 0);
}

// --- Comet --------------------------------------------------------------------------

class Comet implements Mini {
  private env!: MiniEnv;
  private x = 0.5;
  private y = 0.7;
  private ang = -Math.PI / 2;
  private speed = 0.22;
  private last = 0;
  private started = false;
  private over = false;
  private overAt = 0;
  private lives = 3;
  private hurtAt = -1e9;
  private dots = 0;
  private dot = { x: 0.5, y: 0.3 };
  private dotAt = 0;
  private times: number[] = [];
  private mines: { x: number; y: number; vx: number; vy: number }[] = [];
  private trail: [number, number][] = [];
  private time = 0;
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.last = now;
    this.place(now);
  }

  private place(now: number): void {
    // Somewhere not too near the comet, nor the walls.
    for (let i = 0; i < 20; i++) {
      this.dot = { x: rnd(0.12, 0.88), y: rnd(0.12, 0.88) };
      if (Math.hypot(this.dot.x - this.x, this.dot.y - this.y) > 0.3) break;
    }
    this.dotAt = now;
  }

  press(slot: number): void {
    this.held |= 1 << slot;
    if (sideOf(slot) !== 0) this.started = true;
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  private hurt(now: number): void {
    if (now - this.hurtAt < 1200) return;
    this.hurtAt = now;
    this.lives--;
    this.env.sound(this.lives > 0 ? SND_LURCH : SND_FALL);
    if (this.lives <= 0) {
      this.over = true;
      this.overAt = now + 1300;
    }
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.over && now >= this.overAt) return true;
    if (this.started && !this.over) {
      this.time += dt;
      this.speed = 0.22 + Math.min(0.2, this.dots * 0.008);
      this.ang += steer(this.held) * 2.8 * dt;
      this.x += Math.cos(this.ang) * this.speed * dt;
      this.y += Math.sin(this.ang) * this.speed * dt;
      // The walls bounce you back in and cost a life.
      if (this.x < 0.02 || this.x > 0.98 || this.y < 0.02 || this.y > 0.98) {
        this.hurt(now);
        this.ang += Math.PI;
        this.x = Math.min(0.97, Math.max(0.03, this.x));
        this.y = Math.min(0.97, Math.max(0.03, this.y));
      }
      if (Math.hypot(this.dot.x - this.x, this.dot.y - this.y) < 0.045) {
        this.dots++;
        this.times.push(now - this.dotAt);
        this.env.sound(SND_RING + Math.min(4, Math.floor(this.dots / 5)));
        this.place(now);
        // A new mine every third dot, drifting slowly.
        if (this.dots % 3 === 0 && this.mines.length < 9) {
          let mx = 0.5;
          let my = 0.5;
          for (let i = 0; i < 20; i++) {
            mx = rnd(0.1, 0.9);
            my = rnd(0.1, 0.9);
            if (Math.hypot(mx - this.x, my - this.y) > 0.3) break;
          }
          const a = rnd(0, TAU);
          this.mines.push({ x: mx, y: my, vx: Math.cos(a) * 0.04, vy: Math.sin(a) * 0.04 });
        }
      }
      for (const m of this.mines) {
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        if (m.x < 0.05 || m.x > 0.95) m.vx = -m.vx;
        if (m.y < 0.05 || m.y > 0.95) m.vy = -m.vy;
        if (Math.hypot(m.x - this.x, m.y - this.y) < 0.04) this.hurt(now);
      }
      this.trail.push([this.x, this.y]);
      if (this.trail.length > 40) this.trail.shift();
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'dots', String(this.dots), 'time', `${this.time.toFixed(0)} s`, this.lives);
    const size = Math.min(a.right - a.left, a.bottom - a.top - 20 * a.u);
    const x0 = a.cx - size / 2;
    const y0 = a.cy - size / 2;
    const P = (px: number, py: number): [number, number] => [x0 + px * size, y0 + py * size];
    ctx.strokeStyle = COL_DIM;
    ctx.lineWidth = dpr;
    ctx.strokeRect(x0, y0, size, size);
    // Dot to collect.
    const [dx, dy] = P(this.dot.x, this.dot.y);
    ctx.fillStyle = COL_LINE;
    ctx.beginPath();
    ctx.arc(dx, dy, 6 * a.u, 0, TAU);
    ctx.fill();
    // Mines: grey crosses in a ring.
    ctx.strokeStyle = COL_MID;
    for (const m of this.mines) {
      const [mx, my] = P(m.x, m.y);
      const r = 9 * a.u;
      ctx.beginPath();
      ctx.arc(mx, my, r, 0, TAU);
      ctx.moveTo(mx - r * 0.6, my - r * 0.6);
      ctx.lineTo(mx + r * 0.6, my + r * 0.6);
      ctx.moveTo(mx + r * 0.6, my - r * 0.6);
      ctx.lineTo(mx - r * 0.6, my + r * 0.6);
      ctx.stroke();
    }
    // Tail, then the comet pointing where it goes.
    ctx.strokeStyle = COL_ACCENT;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 3 * dpr;
    ctx.beginPath();
    this.trail.forEach(([tx, ty], i) => {
      const [px, py] = P(tx, ty);
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    });
    ctx.stroke();
    ctx.globalAlpha = 1;
    const [cx, cy] = P(this.x, this.y);
    const blink = now - this.hurtAt < 1200 && Math.floor(now / 100) % 2 === 0;
    if (!blink) {
      // The ship: nose along its heading, a flame behind (it never stops).
      ship(ctx, cx, cy, 8.5 * a.u, this.ang + Math.PI / 2, true, [COL_ACCENT, '#b8402a']);
    }
    if (!this.started) message(v, { ...a, cy: a.cy + size * 0.25 }, 'hold a key to turn: left anticlockwise, right clockwise', 'you always move forward. collect the white dots, miss the mines and the walls', COL_MID);
    if (this.over) message(v, a, `${this.dots} dots`, 'out of lives');
    ctx.fillStyle = COL_MID;
    v.text(`${handLabel(this.env, -1)}  turn left`, x0, y0 + size + 22 * a.u, v.fontTiny, 'left');
    v.text(`turn right  ${handLabel(this.env, 1)}`, x0 + size, y0 + size + 22 * a.u, v.fontTiny, 'right');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.dots * 30,
      primary: { label: 'dots collected', value: this.dots, unit: 'dots' },
      lines: [
        { label: 'median time per dot', value: this.times.length ? `${(median(this.times) / 1000).toFixed(1)} s` : '–' },
        { label: 'lasted', value: `${this.time.toFixed(0)} s` },
        { label: 'mines at the end', value: String(this.mines.length) },
      ],
      saved: this.started && this.time > 5,
    };
  }
}

// --- Volley -------------------------------------------------------------------------

class Volley implements Mini {
  private env!: MiniEnv;
  /** Ball position (0..1 across, 0 top .. 1 your line) and where it is heading. */
  private bx = 0.5;
  private by = 0;
  private fromX = 0.5;
  private toX = 0.25;
  private t0 = 0;
  private flight = 1500;
  private state = 0; // 0 serve wait, 1 incoming, 2 returning, 3 miss pause
  private at = 0;
  private rally = 0;
  private best = 0;
  private lives = 3;
  private offs: number[] = [];
  private flights: number[] = [];
  private note = '';
  private noteOk = true;
  private noteAt = 0;
  private swung = 0;
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.serve(now + 900);
  }

  private serve(at: number): void {
    this.state = 0;
    this.at = at;
    this.rally = 0;
    this.flight = 1500;
  }

  private send(now: number, from: number): void {
    this.fromX = from;
    this.toX = Math.random() < 0.5 ? rnd(0.12, 0.38) : rnd(0.62, 0.88);
    this.t0 = now;
    this.state = 1;
    this.swung = 0;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (s === 0 || this.state !== 1 || this.swung) return;
    this.swung = s;
    // You reach the ball if you swing with its side within a window around it arriving.
    const off = ts - (this.t0 + this.flight);
    const win = Math.max(90, this.flight * 0.14);
    const side = this.toX < 0.5 ? -1 : 1;
    if (s === side && Math.abs(off) <= win) {
      this.offs.push(off);
      this.flights.push(this.flight);
      this.rally++;
      this.best = Math.max(this.best, this.rally);
      this.env.sound(s < 0 ? SND_TAP_L : SND_TAP_R);
      this.note = Math.abs(off) < 40 ? 'clean' : off < 0 ? `early ${Math.round(-off)} ms` : `late ${Math.round(off)} ms`;
      this.noteOk = true;
      this.noteAt = ts;
      // Back over the net, and it comes again a little quicker.
      this.state = 2;
      this.at = ts + 380;
      this.flight = Math.max(420, this.flight * 0.93);
    } else {
      this.env.sound(SND_FALSE);
      this.note = s !== side ? 'wrong side' : off < 0 ? 'too early' : 'too late';
      this.noteOk = false;
      this.noteAt = ts;
    }
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  private miss(now: number): void {
    this.lives--;
    this.env.sound(this.lives > 0 ? SND_LURCH : SND_FALL);
    this.state = 3;
    this.at = now + 1100;
    if (!this.noteOk && now - this.noteAt < 600) return;
    this.note = 'missed';
    this.noteOk = false;
    this.noteAt = now;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.at) this.send(now, 0.5);
    else if (this.state === 1) {
      const t = (now - this.t0) / this.flight;
      const win = Math.max(90, this.flight * 0.14);
      if (now - this.t0 > this.flight + win || (this.swung && !this.noteOk)) this.miss(now);
      this.bx = this.fromX + (this.toX - this.fromX) * Math.min(1.1, t);
      this.by = Math.min(1.1, t);
    } else if (this.state === 2) {
      const t = 1 - (this.at - now) / 380;
      this.by = 1 - Math.min(1, t);
      if (now >= this.at) this.send(now, this.bx);
    } else if (this.state === 3 && now >= this.at) {
      if (this.lives <= 0) return true;
      this.serve(now + 300);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'rally', String(this.rally), 'best', String(this.best), this.lives);
    const w = Math.min(a.right - a.left, 560 * a.u);
    const top = a.top + 10 * a.u;
    const line = a.bottom - 60 * a.u;
    const X = (p: number) => a.cx - w / 2 + p * w;
    const Y = (p: number) => top + p * (line - top);
    // Court: the far edge, your line, and the centre split.
    ctx.fillStyle = COL_FAINT;
    ctx.fillRect(X(0), top, w, dpr);
    ctx.fillRect(a.cx - dpr / 2, top, dpr, line - top);
    ctx.fillStyle = COL_LINE;
    ctx.fillRect(X(0), line, w, dpr);
    // The ball, with its shadow sliding along your line so you can read where it will land.
    if (this.state === 1 || this.state === 2) {
      const r = (6 + this.by * 6) * a.u;
      ctx.fillStyle = COL_DIM;
      ctx.fillRect(X(this.toX) - 10 * a.u, line + 4 * dpr, 20 * a.u, 2 * dpr);
      ctx.fillStyle = this.state === 2 ? COL_MID : COL_ACCENT;
      ctx.beginPath();
      ctx.arc(X(this.bx), Y(Math.min(1, this.by)), r, 0, TAU);
      ctx.fill();
    }
    if (now - this.noteAt < 700) {
      ctx.fillStyle = this.noteOk ? COL_MID : COL_ACCENT;
      v.text(this.note, a.cx, line + 32 * a.u, v.fontTiny, 'center');
    } else if (this.state === 0 && this.rally === 0 && this.best === 0) {
      ctx.fillStyle = COL_MID;
      v.text('hit it with the hand on its side as it reaches your line', a.cx, line + 32 * a.u, v.fontTiny, 'center');
    }
    ctx.fillStyle = COL_MID;
    v.text(handLabel(this.env, -1), X(0.25), line + 54 * a.u, v.fontTiny, 'center');
    v.text(handLabel(this.env, 1), X(0.75), line + 54 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const fastest = this.flights.length ? Math.min(...this.flights) : 0;
    return {
      score: this.best * 40 + this.flights.length * 5,
      primary: { label: 'longest rally', value: this.best, unit: 'hits' },
      lines: [
        { label: 'returns in all', value: String(this.flights.length) },
        { label: 'fastest ball returned', value: ms(fastest) },
        { label: 'timing of returns', value: this.offs.length ? `${Math.round(Math.abs(mean(this.offs)))} ms ${mean(this.offs) >= 0 ? 'late' : 'early'} on average` : '–' },
      ],
      saved: this.flights.length >= 3 || this.lives <= 0,
    };
  }
}

// --- Slalom -------------------------------------------------------------------------

interface Gate {
  /** Distance down the course (m) and the flag's position across (-1..1). */
  d: number;
  x: number;
  /** Pass the flag on this side: -1 to its left, 1 to its right. */
  side: number;
  done: boolean;
}

class Slalom implements Mini {
  private env!: MiniEnv;
  private x = 0;
  private vx = 0;
  private d = 0;
  private speed = 9;
  private last = 0;
  private started = false;
  private over = false;
  private overAt = 0;
  private gates: Gate[] = [];
  private passed = 0;
  private missed = 0;
  private flash = '';
  private flashOk = true;
  private flashAt = 0;
  private time = 0;
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.last = now;
    let d = 30;
    let side = 1;
    for (let i = 0; i < 400; i++) {
      // Flags alternate sides of the course, and you go round each one on its outside.
      const x = side * rnd(0.15, 0.55);
      this.gates.push({ d, x, side, done: false });
      side = -side;
      d += rnd(16, 22) - Math.min(6, i * 0.05);
    }
  }

  press(slot: number): void {
    this.held |= 1 << slot;
    if (sideOf(slot) !== 0) this.started = true;
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.over && now >= this.overAt) return true;
    if (this.started && !this.over) {
      this.time += dt;
      this.speed = 9 + Math.min(9, this.passed * 0.12);
      // Skis carve: you push sideways, and the speed you build carries on.
      this.vx += steer(this.held) * 3.2 * dt;
      this.vx *= Math.exp(-dt * 1.1);
      this.x += this.vx * dt;
      if (Math.abs(this.x) > 1) {
        this.x = Math.sign(this.x);
        this.vx = 0;
      }
      this.d += this.speed * dt;
      for (const g of this.gates) {
        if (g.done || g.d > this.d) continue;
        g.done = true;
        const ok = g.side > 0 ? this.x > g.x : this.x < g.x;
        if (ok) {
          this.passed++;
          this.env.sound(SND_CATCH);
        } else {
          this.missed++;
          this.env.sound(this.missed >= 3 ? SND_FALL : SND_FALSE);
          if (this.missed >= 3) {
            this.over = true;
            this.overAt = now + 1300;
          }
        }
        this.flash = ok ? '' : 'missed a gate';
        this.flashOk = ok;
        this.flashAt = now;
      }
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'gates', String(this.passed), 'speed', `${Math.round(this.speed * 3.6)} km/h`, 3 - this.missed);
    const half = Math.min((a.right - a.left) / 2 - 20 * a.u, 300 * a.u);
    const skierY = a.top + 70 * a.u;
    const view = (a.bottom - skierY) / 42; // px per metre ahead
    const X = (p: number) => a.cx + p * half;
    // Course edges.
    ctx.fillStyle = COL_FAINT;
    ctx.fillRect(X(-1) - 8 * a.u, a.top, dpr, a.bottom - a.top);
    ctx.fillRect(X(1) + 8 * a.u, a.top, dpr, a.bottom - a.top);
    // Flags ahead: a pole with a pennant pointing the side to pass on.
    for (const g of this.gates) {
      const y = skierY + (g.d - this.d) * view;
      if (y < a.top - 20 || y > a.bottom + 20) continue;
      const x = X(g.x);
      ctx.fillStyle = g.done ? COL_DIM : COL_LINE;
      ctx.fillRect(x - dpr, y - 22 * a.u, 2 * dpr, 22 * a.u);
      ctx.beginPath();
      ctx.moveTo(x, y - 22 * a.u);
      ctx.lineTo(x + g.side * 16 * a.u, y - 16 * a.u);
      ctx.lineTo(x, y - 10 * a.u);
      ctx.closePath();
      ctx.fillStyle = g.done ? COL_DIM : COL_ACCENT;
      ctx.fill();
    }
    // The skier, leaning with the sideways speed.
    const sx = X(this.x);
    ctx.save();
    ctx.translate(sx, skierY);
    ctx.rotate(Math.max(-0.6, Math.min(0.6, this.vx * 0.5)));
    ctx.strokeStyle = COL_LINE;
    ctx.lineWidth = 3 * dpr;
    ctx.beginPath();
    ctx.moveTo(-5 * a.u, -12 * a.u);
    ctx.lineTo(-5 * a.u, 12 * a.u);
    ctx.moveTo(5 * a.u, -12 * a.u);
    ctx.lineTo(5 * a.u, 12 * a.u);
    ctx.stroke();
    ctx.fillStyle = COL_LINE;
    ctx.beginPath();
    ctx.arc(0, -4 * a.u, 5 * a.u, 0, TAU);
    ctx.fill();
    ctx.restore();
    if (!this.flashOk && now - this.flashAt < 700) {
      ctx.fillStyle = COL_ACCENT;
      v.text(this.flash, a.cx, skierY - 34 * a.u, v.fontTiny, 'center');
    }
    if (!this.started) message(v, { ...a, cy: a.cy + 40 * a.u }, 'pass every flag on the side its pennant points to', 'hold left or right to carve; your speed carries, so start turning early', COL_MID);
    if (this.over) message(v, a, `${this.passed} gates`, 'three missed');
    ctx.fillStyle = COL_MID;
    v.text(`${handLabel(this.env, -1)}  left`, X(-1), a.bottom - 6 * a.u, v.fontTiny, 'left');
    v.text(`right  ${handLabel(this.env, 1)}`, X(1), a.bottom - 6 * a.u, v.fontTiny, 'right');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.passed * 25,
      primary: { label: 'gates passed', value: this.passed, unit: 'gates' },
      lines: [
        { label: 'top speed', value: `${Math.round(this.speed * 3.6)} km/h` },
        { label: 'gates missed', value: String(this.missed) },
        { label: 'time on the course', value: `${this.time.toFixed(0)} s` },
      ],
      saved: this.started && this.time > 5,
    };
  }
}

export const BATCH23: MiniDef[] = [
  {
    id: 'comet',
    name: 'Comet',
    skill: 'coordination',
    blurb: 'Always moving forward: hold to turn. Collect the dots, miss the mines.',
    how: 'Your comet never stops. Hold the left hand to turn anticlockwise and the right hand to turn clockwise. Fly through the white dots to collect them. Every third dot adds a drifting mine. Touching a mine or a wall costs a life; three lives.',
    input: 'keys',
    minKeys: 2,
    make: () => new Comet(),
  },
  {
    id: 'volley',
    name: 'Volley',
    skill: 'reaction',
    blurb: 'Return the ball with the hand on its side as it reaches your line. It comes back faster.',
    how: 'A ball flies at your line, to the left half or the right half; its shadow on your line shows where. Press that side’s hand as it arrives to send it back. Each return makes the next ball a little faster. Wrong side, too early or too late loses a point; three points lost ends it.',
    input: 'keys',
    minKeys: 2,
    make: () => new Volley(),
  },
  {
    id: 'slalom',
    name: 'Slalom',
    skill: 'coordination',
    blurb: 'Ski down with momentum and pass every flag on the side its pennant points to.',
    how: 'Hold the left or right hand to carve that way. Your sideways speed carries on after you let go, so start each turn early. Pass every flag on the side its orange pennant points to. You speed up as you go; three missed gates end it.',
    input: 'keys',
    minKeys: 2,
    make: () => new Slalom(),
  },
];
