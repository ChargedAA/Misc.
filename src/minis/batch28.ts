// Twenty-eighth batch: eight games of control and touch.
//   Hoop   (judgement)    - hold to charge, release to shoot. The basket moves back.
//   Rope   (timing)       - jump the skipping rope as it comes round. It speeds up and slows down.
//   Morse  (timing)       - tap letters in Morse code: short press a dot, long press a dash.
//   Etch   (coordination) - left hand moves across, right hand moves up and down. Trace the path.
//   Row    (coordination) - one oar per hand. Pull evenly to go straight down the river.
//   Crane  (coordination) - move the crane, let the swing settle, drop the crate on the pad.
//   Pedal  (speed)        - alternate the pedals to keep the bike above stalling speed up the hills.
//   Drone  (coordination) - a rotor per hand. Fly through the gates.

import { COL_ACCENT, COL_DIM, COL_FAINT, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALL, SND_FALSE, SND_LURCH, SND_RING, SND_TAP_L, SND_TAP_R, SND_TAP_WEAK, SND_UI } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { TONE, ball, crate as crateBox, jumper, ngon, person, rowboat } from './sprites.ts';
import { arena, footer, handLabel, header, mean, median, ms, scaled, sideOf, type Arena, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const TAU = Math.PI * 2;

function rnd(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo);
}

function note(v: View, a: Arena, text: string, color = COL_MID): void {
  v.ctx.fillStyle = color;
  v.text(text, a.cx, a.bottom - 14 * a.u, v.fontTiny, 'center');
}

function hands(held: number): [boolean, boolean] {
  return [(held & 0b111) !== 0, (held & 0b111000) !== 0];
}

// --- Hoop ---------------------------------------------------------------------------

class Hoop implements Mini {
  private env!: MiniEnv;
  private readonly total = scaled(15);
  private i = 0;
  private dist = 4;
  private wind = 0;
  private state = 0; // 0 ready, 1 charging, 2 ball flying, 3 result
  private chargeAt = 0;
  private power = 0;
  private bx = 0;
  private by = 0;
  private vx = 0;
  private vy = 0;
  private at = 0;
  private last = 0;
  private makes = 0;
  private misses: number[] = [];
  private outcome = '';
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.last = now;
    this.place();
  }

  private place(): void {
    this.dist = rnd(3, 8);
    this.wind = this.i >= 5 ? rnd(-1.2, 1.2) : 0;
    this.state = 0;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (this.state !== 0) return;
    this.state = 1;
    this.chargeAt = ts;
  }

  release(slot: number, ts: number): void {
    this.held &= ~(1 << slot);
    if (this.state !== 1 || this.held) return;
    // Power climbs over 1.6 s and wraps, so holding too long is as bad as too short.
    const t = ((ts - this.chargeAt) / 1600) % 1;
    this.power = t;
    const speed = 4 + t * 9;
    const ang = (55 * Math.PI) / 180;
    this.vx = Math.cos(ang) * speed;
    this.vy = Math.sin(ang) * speed;
    this.bx = 0;
    this.by = 2;
    this.state = 2;
    this.env.sound(SND_UI);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const dt = Math.min(0.03, (now - this.last) / 1000);
    this.last = now;
    if (this.state === 2) {
      this.vy -= 9.8 * dt;
      this.vx += this.wind * dt;
      this.bx += this.vx * dt;
      this.by += this.vy * dt;
      // Through the rim at 3 m high: a make if it comes down within the hoop.
      if (this.vy < 0 && this.by <= 3.05 && this.by > 2.7) {
        const off = this.bx - this.dist;
        if (Math.abs(off) < 0.22) {
          this.makes++;
          this.misses.push(0);
          this.outcome = 'in';
          this.env.sound(SND_CATCH);
          this.i++;
          this.state = 3;
          this.at = now + 900;
        }
      }
      if (this.state === 2 && (this.by < 0 || this.bx > this.dist + 3)) {
        const off = this.bx - this.dist;
        this.misses.push(Math.abs(off));
        this.outcome = off < 0 ? 'short' : 'long';
        this.env.sound(SND_TAP_WEAK);
        this.i++;
        this.state = 3;
        this.at = now + 900;
      }
    } else if (this.state === 3 && now >= this.at) {
      if (this.i >= this.total) return true;
      this.place();
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'baskets', `${this.makes} of ${this.i}`, 'shot', `${Math.min(this.i + 1, this.total)} / ${this.total}`);
    const ground = a.bottom - 40 * a.u;
    const ppm = Math.min((a.right - a.left - 60 * a.u) / 11, (ground - a.top) / 6.5);
    const x0 = a.cx - 5 * ppm;
    const X = (m: number) => x0 + m * ppm;
    const Y = (m: number) => ground - m * ppm;
    ctx.fillStyle = COL_DIM;
    ctx.fillRect(X(-0.5), ground, 11 * ppm, v.dpr);
    // Hoop: a post, a backboard panel, a rim and a net.
    ctx.fillStyle = '#5d5d65';
    ctx.fillRect(X(this.dist + 0.42), Y(3), 0.1 * ppm, 3 * ppm);
    ctx.fillStyle = COL_MID;
    ctx.fillRect(X(this.dist + 0.3), Y(4.05), 0.12 * ppm, 1.25 * ppm);
    ctx.fillStyle = COL_DIM;
    ctx.fillRect(X(this.dist + 0.3), Y(3.55), 0.12 * ppm, 0.4 * ppm);
    ctx.fillStyle = COL_ACCENT;
    ctx.fillRect(X(this.dist - 0.23), Y(3) - 1.5 * v.dpr, 0.53 * ppm, 3 * v.dpr);
    ctx.strokeStyle = COL_MID;
    ctx.lineWidth = v.dpr;
    ctx.beginPath();
    for (let i = 0; i <= 4; i++) {
      const top = X(this.dist - 0.23 + i * 0.115);
      const bot = X(this.dist - 0.15 + i * 0.075);
      ctx.moveTo(top, Y(3));
      ctx.lineTo(bot, Y(2.6));
    }
    ctx.moveTo(X(this.dist - 0.19), Y(2.8));
    ctx.lineTo(X(this.dist + 0.19), Y(2.8));
    ctx.stroke();
    // You: the arm lifts as you charge and follows through on the shot.
    const arm = this.state === 1 ? 2.9 : this.state === 2 ? 2.2 : 0.35;
    const [hx, hy] = person(ctx, X(0), Y(0), 0.2 * ppm, 1, arm, TONE.mid);
    if (this.state === 0 || this.state === 1) ball(ctx, hx, hy - 0.08 * ppm, 0.12 * ppm, [COL_ACCENT, '#b8402a']);
    if (this.state === 2 || this.state === 3) ball(ctx, X(this.bx), Y(this.by), 0.12 * ppm, [COL_ACCENT, '#b8402a']);
    // The power meter while you hold.
    const p = this.state === 1 ? ((now - this.chargeAt) / 1600) % 1 : this.state >= 2 ? this.power : 0;
    ctx.strokeStyle = COL_DIM;
    ctx.lineWidth = v.dpr;
    ctx.strokeRect(X(-0.9), Y(3), 0.25 * ppm, 2 * ppm);
    ctx.fillStyle = COL_LINE;
    ctx.fillRect(X(-0.9), Y(1 + 2 * p), 0.25 * ppm, 2 * p * ppm);
    if (this.wind) {
      ctx.fillStyle = COL_MID;
      v.text(`wind ${this.wind > 0 ? '→' : '←'} ${Math.abs(this.wind).toFixed(1)}`, a.cx, a.top + 10 * a.u, v.fontTiny, 'center');
    }
    note(v, a, this.state === 3 ? this.outcome : `${this.dist.toFixed(1)} m  ·  hold any key to charge, let go to shoot`, this.state === 3 && this.outcome === 'in' ? COL_LINE : COL_MID);
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.makes * 50 + Math.max(0, Math.round((1 - mean(this.misses)) * 100)),
      primary: { label: 'baskets', value: this.makes, unit: '' },
      lines: [
        { label: 'made', value: `${this.makes} of ${this.i}` },
        { label: 'average miss', value: this.misses.length ? `${mean(this.misses).toFixed(2)} m` : '–' },
      ],
      saved: this.i >= 4,
    };
  }
}

// --- Rope ---------------------------------------------------------------------------

class Rope implements Mini {
  private env!: MiniEnv;
  private phase = 0.5;
  private period = 1.1;
  private last = 0;
  private started = false;
  private jumpAt = -1e9;
  private jumps = 0;
  private lives = 3;
  private over = false;
  private overAt = 0;
  private offs: number[] = [];
  private judged = -1;
  private hitAt = -1e9;
  private time = 0;
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.last = now;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (this.over) return;
    if (!this.started) {
      this.started = true;
      return;
    }
    // One jump at a time: you are in the air for 420 ms.
    if (ts - this.jumpAt < 420) return;
    this.jumpAt = ts;
    this.env.sound(SND_TAP_WEAK);
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
      // The turner speeds up, with lulls.
      this.period = Math.max(0.5, 1.1 - this.time * 0.008 + Math.sin(this.time * 0.4) * 0.12);
      const prev = this.phase;
      this.phase = (this.phase + dt / this.period) % 1;
      // The rope passes under your feet at phase 0.
      const cycle = Math.floor(this.time / this.period);
      if (prev > 0.8 && this.phase < 0.2 && cycle !== this.judged) {
        this.judged = cycle;
        const air = now - this.jumpAt;
        // You clear it if you are in the air: jumped between 50 and 380 ms before it passes.
        if (air > 50 && air < 380) {
          this.jumps++;
          this.offs.push(air - 200);
          this.env.sound(SND_RING + Math.min(4, Math.floor(this.jumps / 10)));
        } else {
          this.lives--;
          this.hitAt = now;
          this.env.sound(this.lives > 0 ? SND_LURCH : SND_FALL);
          if (this.lives <= 0) {
            this.over = true;
            this.overAt = now + 1300;
          }
        }
      }
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'jumps', String(this.jumps), 'pace', `${(60 / this.period).toFixed(0)} /min`, this.lives);
    const ground = a.cy + 90 * a.u;
    const span = Math.min(a.right - a.left, 520 * a.u) / 2;
    // The rope: an arc whose height follows the phase, over at 0.5, under your feet at 0.
    const h = Math.cos(this.phase * TAU) * 150 * a.u;
    ctx.strokeStyle = this.phase < 0.25 || this.phase > 0.75 ? COL_LINE : COL_DIM;
    ctx.lineWidth = 2 * v.dpr;
    ctx.beginPath();
    ctx.moveTo(a.cx - span, ground - 60 * a.u);
    ctx.quadraticCurveTo(a.cx, ground - 60 * a.u + h, a.cx + span, ground - 60 * a.u);
    ctx.stroke();
    ctx.fillStyle = COL_MID;
    ctx.fillRect(a.cx - span - 6 * a.u, ground - 90 * a.u, 6 * a.u, 90 * a.u);
    ctx.fillRect(a.cx + span, ground - 90 * a.u, 6 * a.u, 90 * a.u);
    // You: jumping lifts you off the line.
    const air = now - this.jumpAt;
    const lift = air < 420 ? Math.sin((air / 420) * Math.PI) * 50 * a.u : 0;
    const blink = now - this.hitAt < 600 && Math.floor(now / 80) % 2 === 0;
    if (!blink) jumper(ctx, a.cx, ground - lift, 7.6 * a.u, air < 420 ? Math.sin((air / 420) * Math.PI) : 0, now - this.hitAt < 600 ? [COL_ACCENT, '#b8402a'] : TONE.light);
    ctx.fillStyle = COL_DIM;
    ctx.fillRect(a.cx - span, ground, span * 2, v.dpr);
    if (!this.started) note(v, a, 'press any key to start, then press to jump just before the rope reaches your feet');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.jumps * 15,
      primary: { label: 'jumps', value: this.jumps, unit: '' },
      lines: [
        { label: 'top pace', value: `${(60 / Math.max(0.5, 1.1 - this.time * 0.008 - 0.12)).toFixed(0)} turns a minute` },
        { label: 'jump timing', value: this.offs.length ? `${Math.round(Math.abs(mean(this.offs)))} ms ${mean(this.offs) > 0 ? 'early' : 'late'} of ideal` : '–' },
      ],
      saved: this.started && this.time > 5,
    };
  }
}

// --- Morse --------------------------------------------------------------------------

const MORSE: Record<string, string> = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', R: '.-.', S: '...', T: '-', U: '..-', W: '.--',
};

class Morse implements Mini {
  private env!: MiniEnv;
  private readonly total = scaled(14);
  private i = 0;
  private letter = 'E';
  private sent = '';
  private downAt = 0;
  private lastUp = 0;
  private state = 0; // 0 sending, 1 result
  private at = 0;
  private right = 0;
  private dots: number[] = [];
  private dashes: number[] = [];
  private lastOk = true;
  private shownAt = 0;
  private times: number[] = [];
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.make(now);
  }

  private make(now: number): void {
    const pool = Object.keys(MORSE).filter((k) => MORSE[k]!.length <= 2 + Math.floor(this.i / 4));
    this.letter = pool[Math.floor(Math.random() * pool.length)]!;
    this.sent = '';
    this.state = 0;
    this.shownAt = now;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (this.state !== 0 || this.downAt) return;
    this.downAt = ts;
    this.env.tone?.(600, 1200);
  }

  release(slot: number, ts: number): void {
    this.held &= ~(1 << slot);
    if (this.state !== 0 || !this.downAt || this.held) return;
    const d = ts - this.downAt;
    this.downAt = 0;
    // Under 250 ms is a dot, over is a dash.
    const sym = d < 250 ? '.' : '-';
    (sym === '.' ? this.dots : this.dashes).push(d);
    this.sent += sym;
    this.lastUp = ts;
    this.env.sound(sym === '.' ? SND_TAP_L : SND_TAP_R);
    const want = MORSE[this.letter]!;
    if (!want.startsWith(this.sent)) this.finish(false, ts);
    else if (this.sent === want) this.finish(true, ts);
  }

  private finish(ok: boolean, ts: number): void {
    this.lastOk = ok;
    if (ok) {
      this.right++;
      this.times.push(ts - this.shownAt);
    }
    this.env.sound(ok ? SND_CATCH : SND_FALSE);
    this.i++;
    this.state = 1;
    this.at = ts + 1000;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && this.sent && !this.downAt && now - this.lastUp > 2500) this.finish(false, now);
    if (this.state === 0 && now - this.shownAt > 12000) this.finish(false, now);
    if (this.state === 1 && now >= this.at) {
      if (this.i >= this.total) return true;
      this.make(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'sent', `${this.right} of ${this.i}`, 'letter', `${Math.min(this.i + 1, this.total)} / ${this.total}`);
    ctx.fillStyle = this.state === 1 && !this.lastOk ? COL_ACCENT : COL_LINE;
    v.text(this.letter, a.cx, a.cy - 60 * a.u, v.fontBig, 'center');
    // The code to send, with what you have sent so far lit.
    const want = MORSE[this.letter]!;
    const unit = 16 * a.u;
    let x = a.cx - (want.length * 2.6 * unit) / 2;
    for (let k = 0; k < want.length; k++) {
      ctx.fillStyle = k < this.sent.length ? (this.sent[k] === want[k] ? COL_LINE : COL_ACCENT) : COL_DIM;
      if (want[k] === '.') {
        ctx.beginPath();
        ctx.arc(x + unit / 2, a.cy + 10 * a.u, unit / 3, 0, TAU);
        ctx.fill();
        x += unit * 1.6;
      } else {
        ctx.fillRect(x, a.cy + 10 * a.u - unit / 3, unit * 2.2, (unit * 2) / 3);
        x += unit * 3.2;
      }
    }
    if (this.downAt) {
      ctx.fillStyle = now - this.downAt < 250 ? COL_MID : COL_ACCENT;
      v.text(now - this.downAt < 250 ? 'dot…' : 'dash', a.cx, a.cy + 60 * a.u, v.fontTiny, 'center');
    }
    note(v, a, 'press any key: a short press (under a quarter second) is a dot, a long one a dash');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.right * 40,
      primary: { label: 'letters sent', value: this.right, unit: '' },
      lines: [
        { label: 'sent', value: `${this.right} of ${this.i}` },
        { label: 'your dot / dash', value: this.dots.length && this.dashes.length ? `${Math.round(median(this.dots))} / ${Math.round(median(this.dashes))} ms` : '–' },
        { label: 'median time per letter', value: ms(median(this.times)) },
      ],
      saved: this.i >= 4,
    };
  }
}

// --- Etch ---------------------------------------------------------------------------

class Etch implements Mini {
  private env!: MiniEnv;
  private readonly total = scaled(4);
  private s = 0;
  private path: [number, number][] = [];
  private seg = 0;
  private x = 0;
  private y = 0;
  private last = 0;
  private keys = new Set<string>();
  private errs: number[] = [];
  private shapeErr: number[] = [];
  private times: number[] = [];
  private startAt = 0;
  private state = 0;
  private at = 0;
  private trail: [number, number][] = [];

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.last = now;
    this.make(now);
  }

  private make(now: number): void {
    // A path of straight runs, across and up or down, then the odd diagonal later.
    const pts: [number, number][] = [[0.1, 0.5]];
    let px = 0.1;
    let py = 0.5;
    const n = 4 + this.s;
    for (let k = 0; k < n; k++) {
      const diag = this.s >= 2 && k % 2 === 1;
      if (k % 2 === 0 || diag) px = Math.min(0.9, px + rnd(0.12, 0.2));
      if (k % 2 === 1 || diag) py = Math.min(0.9, Math.max(0.1, py + rnd(-0.35, 0.35)));
      pts.push([px, py]);
    }
    this.path = pts;
    this.seg = 0;
    this.x = pts[0]![0];
    this.y = pts[0]![1];
    this.errs = [];
    this.trail = [[this.x, this.y]];
    this.startAt = now;
    this.state = 0;
  }

  press(): void {}

  typeKey(code: string): boolean {
    if (['KeyA', 'KeyD', 'KeyK', 'KeyI', 'KeyW', 'KeyS', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) {
      this.keys.add(code);
      return true;
    }
    return false;
  }

  typeKeyUp(code: string): void {
    this.keys.delete(code);
  }

  /** Distance from a point to the path's current segment. */
  private dist(x: number, y: number): number {
    const [ax, ay] = this.path[this.seg]!;
    const [bx, by] = this.path[this.seg + 1]!;
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(x - (ax + dx * t), y - (ay + dy * t));
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.state === 0) {
      // Left hand A / D moves across; right hand I / K (or the arrows) moves up and down, while held.
      const sp = 0.22 * dt;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) this.x -= sp;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) this.x += sp;
      if (this.keys.has('KeyI') || this.keys.has('KeyW') || this.keys.has('ArrowUp')) this.y -= sp;
      if (this.keys.has('KeyK') || this.keys.has('KeyS') || this.keys.has('ArrowDown')) this.y += sp;
      this.x = Math.max(0, Math.min(1, this.x));
      this.y = Math.max(0, Math.min(1, this.y));
      const last = this.trail[this.trail.length - 1]!;
      if (Math.hypot(last[0] - this.x, last[1] - this.y) > 0.004) {
        this.trail.push([this.x, this.y]);
        this.errs.push(this.dist(this.x, this.y));
      }
      // Reach the end of a segment and the next one starts.
      const [bx, by] = this.path[this.seg + 1]!;
      if (Math.hypot(this.x - bx, this.y - by) < 0.03) {
        this.seg++;
        this.env.sound(SND_UI);
        if (this.seg >= this.path.length - 1) {
          this.shapeErr.push(mean(this.errs));
          this.times.push(now - this.startAt);
          this.env.sound(SND_CATCH);
          this.s++;
          this.state = 1;
          this.at = now + 1000;
        }
      }
      if (now - this.startAt > 60000) {
        this.shapeErr.push(Math.max(0.05, mean(this.errs)));
        this.times.push(60000);
        this.s++;
        this.state = 1;
        this.at = now + 800;
      }
    } else if (now >= this.at) {
      if (this.s >= this.total) return true;
      this.make(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'off the line', this.errs.length ? `${(mean(this.errs) * 100).toFixed(1)}%` : '–', 'path', `${Math.min(this.s + 1, this.total)} / ${this.total}`);
    const S = Math.min(a.right - a.left, a.bottom - a.top - 40 * a.u);
    const X = (p: number) => a.cx - S / 2 + p * S;
    const Y = (p: number) => a.top + 10 * a.u + p * S;
    ctx.strokeStyle = COL_FAINT;
    ctx.lineWidth = v.dpr;
    ctx.strokeRect(X(0), Y(0), S, S);
    ctx.strokeStyle = COL_DIM;
    ctx.lineWidth = 6 * v.dpr;
    ctx.beginPath();
    this.path.forEach(([px, py], k) => (k ? ctx.lineTo(X(px), Y(py)) : ctx.moveTo(X(px), Y(py))));
    ctx.stroke();
    ctx.strokeStyle = COL_LINE;
    ctx.lineWidth = 1.5 * v.dpr;
    ctx.beginPath();
    this.trail.forEach(([px, py], k) => (k ? ctx.lineTo(X(px), Y(py)) : ctx.moveTo(X(px), Y(py))));
    ctx.stroke();
    const goal = this.path[Math.min(this.seg + 1, this.path.length - 1)]!;
    ctx.strokeStyle = COL_MID;
    ctx.beginPath();
    ctx.arc(X(goal[0]), Y(goal[1]), 8 * a.u, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = COL_ACCENT;
    ctx.beginPath();
    ctx.arc(X(this.x), Y(this.y), 5 * a.u, 0, TAU);
    ctx.fill();
    note(v, a, 'left hand: A and D move across  ·  right hand: I and K (or the arrows) move up and down. hold to keep moving');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const m = mean(this.shapeErr);
    return {
      score: this.shapeErr.length ? Math.max(0, Math.round((0.06 - m) * 8000 + this.shapeErr.length * 30)) : 0,
      primary: { label: 'average distance off the path', value: Math.round(m * 1000) / 10, unit: '%', lower: true, decimals: 1, zeroOk: true },
      lines: [
        { label: 'paths traced', value: String(this.shapeErr.length) },
        { label: 'average time per path', value: this.times.length ? `${(mean(this.times) / 1000).toFixed(1)} s` : '–' },
      ],
      saved: this.shapeErr.length >= 1,
    };
  }
}

// --- Row ----------------------------------------------------------------------------

class Row implements Mini {
  private env!: MiniEnv;
  private readonly length = scaled(60000);
  private t0 = 0;
  private last = 0;
  private x = 0;
  private heading = 0;
  private speed = 0;
  private turn = 0;
  private dist = 0;
  private lastStroke: [number, number] = [0, 0];
  private gaps: number[] = [];
  private bumps = 0;
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.t0 = now + 600;
    this.last = now;
  }

  /** The river's centre line at a distance down it. */
  private centre(d: number): number {
    return Math.sin(d * 0.05) * 0.35 + Math.sin(d * 0.013) * 0.2;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (s === 0 || ts < this.t0) return;
    const k = s < 0 ? 0 : 1;
    // A stroke pushes you on and turns you away from that oar.
    const since = ts - this.lastStroke[k]!;
    const power = Math.min(1, since / 700);
    this.speed += 1.2 * power;
    this.turn += -s * 0.55 * power;
    if (this.lastStroke[1 - k]) this.gaps.push(ts - this.lastStroke[1 - k]!);
    this.lastStroke[k] = ts;
    this.env.sound(s < 0 ? SND_TAP_L : SND_TAP_R);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const el = now - this.t0;
    if (el > this.length) return true;
    if (el > 0) {
      this.speed *= Math.exp(-dt * 0.6);
      this.turn *= Math.exp(-dt * 2.2);
      this.heading += this.turn * dt;
      this.heading *= Math.exp(-dt * 0.3);
      this.dist += this.speed * dt;
      this.x += Math.sin(this.heading) * this.speed * dt * 0.15;
      const c = this.centre(this.dist);
      if (Math.abs(this.x - c) > 0.42) {
        // The bank: a bump, a loss of speed, and a push back into the river.
        this.bumps++;
        this.speed *= 0.4;
        this.x = c + Math.sign(this.x - c) * 0.4;
        this.heading = -this.heading * 0.5;
        this.env.sound(SND_LURCH);
      }
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'distance', `${Math.round(this.dist)} m`, 'time', `${Math.max(0, Math.ceil((this.length - Math.max(0, el)) / 1000))} s`);
    const half = Math.min((a.right - a.left) / 2, 300 * a.u);
    const boatY = a.bottom - 80 * a.u;
    const X = (p: number) => a.cx + p * half;
    const ppm = (boatY - a.top) / 40;
    // Banks ahead.
    for (const side of [-1, 1]) {
      ctx.strokeStyle = COL_DIM;
      ctx.lineWidth = 2 * v.dpr;
      ctx.beginPath();
      for (let k = -2; k <= 42; k++) {
        const d = this.dist + k;
        const px = X(this.centre(d) - this.x + side * 0.5);
        const py = boatY - k * ppm;
        if (k === -2) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    // The boat, pointing its heading; an oar sweeps back as it is pulled.
    const sweep = (i: number) => {
      const t = (now - this.lastStroke[i]!) / 260;
      return t < 1 ? -0.5 + Math.sin(t * Math.PI) * 0.9 : -0.5;
    };
    rowboat(ctx, a.cx, boatY, 6.2 * a.u, this.heading, sweep(0), sweep(1), TONE.light);
    note(v, a, `${handLabel(this.env, -1)} pulls the left oar, ${handLabel(this.env, 1)} the right. even strokes go straight; one side turns you`);
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const g = this.gaps.length > 3 ? median(this.gaps) : 0;
    return {
      score: Math.max(0, Math.round(this.dist * 2 - this.bumps * 20)),
      primary: { label: 'distance rowed', value: Math.round(this.dist), unit: 'm' },
      lines: [
        { label: 'bumped the bank', value: String(this.bumps) },
        { label: 'stroke rhythm (time between oars)', value: g ? `${Math.round(g)} ms` : '–' },
      ],
      saved: this.dist > 10,
    };
  }
}

// --- Crane --------------------------------------------------------------------------

class Crane implements Mini {
  private env!: MiniEnv;
  private readonly total = scaled(8);
  private i = 0;
  private x = 0.2;
  private vx = 0;
  /** Swing angle of the hook (rad) and its rate. */
  private th = 0;
  private om = 0;
  private pad = 0.7;
  private padW = 0.12;
  private state = 0; // 0 carrying, 1 dropping, 2 result
  private cx = 0;
  private cy = 0;
  private cvx = 0;
  private cvy = 0;
  private at = 0;
  private last = 0;
  private misses: number[] = [];
  private landed = 0;
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.last = now;
    this.place();
  }

  private place(): void {
    this.pad = rnd(0.55, 0.9);
    this.padW = Math.max(0.08, 0.16 - this.i * 0.01);
    this.x = 0.15;
    this.vx = 0;
    this.th = 0;
    this.om = 0;
    this.state = 0;
  }

  press(slot: number): void {
    this.held |= 1 << slot;
    const [l, r] = hands(this.held);
    if (l && r && this.state === 0) {
      // Both hands: let go of the crate. It keeps the swing's speed as it falls.
      const L = 0.45;
      this.state = 1;
      this.cx = this.x + Math.sin(this.th) * L;
      this.cy = 0.1 + Math.cos(this.th) * L;
      this.cvx = this.vx + Math.cos(this.th) * this.om * L;
      this.cvy = 0;
      this.env.sound(SND_UI);
    }
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const dt = Math.min(0.03, (now - this.last) / 1000);
    this.last = now;
    if (this.state === 0) {
      const [l, r] = hands(this.held);
      const push = l && !r ? -1 : r && !l ? 1 : 0;
      const acc = push * 0.7 - this.vx * 2.2;
      this.vx += acc * dt;
      this.x = Math.max(0.05, Math.min(0.95, this.x + this.vx * dt));
      // The hook swings like a pendulum, pushed by the trolley's acceleration.
      const L = 0.45;
      this.om += (-6 * Math.sin(this.th) - ((acc * 0.5) / L) * Math.cos(this.th) - this.om * 0.9) * dt;
      this.th += this.om * dt;
    } else if (this.state === 1) {
      this.cvy += 2.2 * dt;
      this.cx += this.cvx * dt;
      this.cy += this.cvy * dt;
      if (this.cy >= 0.88) {
        const off = Math.abs(this.cx - this.pad);
        const ok = off < this.padW / 2;
        this.misses.push(off);
        if (ok) this.landed++;
        this.env.sound(ok ? SND_CATCH : SND_FALSE);
        this.i++;
        this.state = 2;
        this.at = now + 1100;
      }
    } else if (now >= this.at) {
      if (this.i >= this.total) return true;
      this.place();
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'landed', `${this.landed} of ${this.i}`, 'crate', `${Math.min(this.i + 1, this.total)} / ${this.total}`);
    const w = Math.min(a.right - a.left, 660 * a.u);
    const h = a.bottom - a.top - 30 * a.u;
    const X = (p: number) => a.cx - w / 2 + p * w;
    const Y = (p: number) => a.top + 10 * a.u + p * h;
    ctx.fillStyle = COL_DIM;
    ctx.fillRect(X(0), Y(0.1), w, 3 * v.dpr);
    ctx.fillRect(X(0), Y(0.93), w, v.dpr);
    ctx.fillStyle = COL_LINE;
    ctx.fillRect(X(this.pad - this.padW / 2), Y(0.92), this.padW * w, 4 * v.dpr);
    // The trolley on the jib: a block on two wheels.
    ctx.fillStyle = COL_MID;
    ctx.fillRect(X(this.x) - 14 * a.u, Y(0.1) - 12 * a.u, 28 * a.u, 11 * a.u);
    ctx.fillStyle = '#5d5d65';
    ctx.fillRect(X(this.x) - 14 * a.u, Y(0.1) - 4 * a.u, 28 * a.u, 3 * a.u);
    ngon(ctx, X(this.x) - 8 * a.u, Y(0.1) - 13 * a.u, 3 * a.u, 6, COL_DIM);
    ngon(ctx, X(this.x) + 8 * a.u, Y(0.1) - 13 * a.u, 3 * a.u, 6, COL_DIM);
    const L = 0.45;
    const hx = this.x + Math.sin(this.th) * L;
    const hy = 0.1 + Math.cos(this.th) * L;
    ctx.strokeStyle = COL_MID;
    ctx.lineWidth = v.dpr;
    ctx.beginPath();
    ctx.moveTo(X(this.x), Y(0.1));
    ctx.lineTo(X(this.state === 0 ? hx : this.x + Math.sin(this.th) * L), Y(this.state === 0 ? hy : 0.1 + Math.cos(this.th) * L));
    ctx.stroke();
    const crate: [number, number] = this.state === 0 ? [hx, hy] : [this.cx, Math.min(0.88, this.cy)];
    crateBox(ctx, X(crate[0]) - 15 * a.u, Y(crate[1]), 30 * a.u, 26 * a.u);
    note(v, a, `hold ${handLabel(this.env, -1)} or ${handLabel(this.env, 1)} to move the crane. let the swing settle. both together to drop it on the pad`);
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.landed * 60 + Math.max(0, Math.round((0.15 - mean(this.misses)) * 1000)),
      primary: { label: 'crates landed', value: this.landed, unit: '' },
      lines: [
        { label: 'landed', value: `${this.landed} of ${this.i}` },
        { label: 'average miss of the pad centre', value: this.misses.length ? `${(mean(this.misses) * 100).toFixed(1)}%` : '–' },
      ],
      saved: this.i >= 2,
    };
  }
}

// --- Pedal --------------------------------------------------------------------------

const PEDAL_LABEL = 'hardest hill climbed';
/** A stretch of road: flat, a climb that asks for a pedalling rate, or a free roll down. */
type Seg = { kind: 0 | 1 | 2; from: number; to: number; need: number };

class Pedal implements Mini {
  private env!: MiniEnv;
  private readonly length = scaled(45000);
  private t0 = 0;
  private last = 0;
  private speed = 0;
  private dist = 0;
  private lastSide = 0;
  private strokeTimes: number[] = [];
  /** The pedalling rate (strokes a second) the next climb will ask for. */
  private need = 4;
  private startNeed = 4;
  private segs: Seg[] = [];
  /** How close the climb in progress is to a stall: 0 fine, 1 stalled. */
  private strain = 0;
  private strainTickAt = 0;
  private stalls = 0;
  private stalledAt = -1e9;
  private climbed = 0;
  private hardest = 0;
  private crestAt = -1e9;
  private repeats = 0;
  private strokes = 0;
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.t0 = now + 600;
    this.last = now;
    const past = (env.past ?? []).filter((p) => p.label === PEDAL_LABEL).map((p) => p.value);
    this.need = past.length ? Math.max(3, Math.round(median(past) * 2) / 2 - 2) : 4;
    this.startNeed = this.need;
    let d = 0;
    for (let k = 0; k < 40; k++) {
      const flat = 26 + Math.random() * 14;
      this.segs.push({ kind: 0, from: d, to: d + flat, need: 0 });
      d += flat;
      this.segs.push({ kind: 1, from: d, to: d + 22, need: 0 });
      d += 22;
      this.segs.push({ kind: 2, from: d, to: d + 14, need: 0 });
      d += 14;
    }
  }

  private segAt(d: number): Seg {
    return this.segs.find((g) => d >= g.from && d < g.to) ?? this.segs[this.segs.length - 1]!;
  }

  /** Road height (m) at a distance: climbs rise, roll-downs fall back. */
  private height(d: number): number {
    let h = 0;
    for (const g of this.segs) {
      if (g.from >= d) break;
      const run = Math.min(d, g.to) - g.from;
      if (g.kind === 1) h += run * 0.32;
      else if (g.kind === 2) h -= run * (0.32 * 22) / 14;
    }
    return h;
  }

  private cadence(now: number): number {
    let n = 0;
    for (let i = this.strokeTimes.length - 1; i >= 0 && now - this.strokeTimes[i]! <= 1000; i--) n++;
    return n;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (s === 0 || ts < this.t0 || ts - this.stalledAt < 1000) return;
    // Only alternating pedals drive the wheel; the same foot twice just slips.
    if (s === this.lastSide) {
      this.repeats++;
      this.env.sound(SND_TAP_WEAK);
      return;
    }
    this.lastSide = s;
    this.strokes++;
    this.strokeTimes.push(ts);
    this.env.sound(s < 0 ? SND_TAP_L : SND_TAP_R);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const el = now - this.t0;
    if (el > this.length) return true;
    const cad = this.cadence(now);
    const seg = this.segAt(this.dist);
    if (el > 0 && now - this.stalledAt > 1000) {
      if (seg.kind === 1 && !seg.need) seg.need = this.need;
      let want: number;
      if (seg.kind === 0) want = cad * 1.4;
      else if (seg.kind === 2) want = Math.max(9, cad * 1.4);
      else {
        // Climbing: at or above the asked rate you keep going; below it you strain, then stall.
        const short = seg.need - cad;
        want = short <= 0 ? cad * 0.9 : Math.max(0, cad * 0.9 - short * 2);
        if (short > 0) {
          this.strain = Math.min(1, this.strain + dt * (0.6 + short * 0.4));
          if (now >= this.strainTickAt) {
            this.strainTickAt = now + 260 - this.strain * 140;
            this.env.tone?.(150 + this.strain * 90, 60, 0, 0.1);
          }
        } else this.strain = Math.max(0, this.strain - dt * 0.8);
        if (this.strain >= 1) {
          // Stalled: roll back to the foot of the climb and the hills ease off a little.
          this.stalls++;
          this.stalledAt = now;
          this.strain = 0;
          this.speed = 0;
          this.dist = seg.from;
          seg.need = 0;
          this.need = Math.max(2, this.need - 0.5);
          this.env.sound(SND_LURCH);
          this.env.tone?.(220, 380, 0, 0.16, 70);
          want = 0;
        }
      }
      this.speed += (want - this.speed) * Math.min(1, dt * 3);
      const before = this.segAt(this.dist);
      this.dist += this.speed * dt;
      if (before.kind === 1 && this.dist >= before.to) {
        this.climbed++;
        this.hardest = Math.max(this.hardest, before.need);
        this.need += 0.5;
        this.strain = 0;
        this.crestAt = now;
        this.env.sound(SND_CATCH);
        this.env.tone?.(520, 160, 0, 0.1, 780);
      }
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'hills', String(this.climbed), 'time', `${Math.max(0, Math.ceil((this.length - Math.max(0, el)) / 1000))} s`);
    const w = Math.min(a.right - a.left - 60 * a.u, 620 * a.u);
    const base = a.cy + 70 * a.u;
    const left = a.cx - w / 2 - 20 * a.u;
    const ahead = 70;
    const behind = 18;
    const pxPerM = w / (ahead + behind);
    const h0 = this.height(this.dist);
    const X = (d: number) => left + (d - this.dist + behind) * pxPerM;
    const Y = (d: number) => base - (this.height(d) - h0) * pxPerM;
    // The road ahead: climbs drawn brighter, each labelled with the rate it asks for.
    ctx.lineWidth = 3 * dpr;
    ctx.lineCap = 'round';
    for (const g of this.segs) {
      if (g.to < this.dist - behind || g.from > this.dist + ahead) continue;
      const d0 = Math.max(g.from, this.dist - behind);
      const d1 = Math.min(g.to, this.dist + ahead);
      ctx.strokeStyle = g.kind === 1 ? (g === seg && this.strain > 0.05 ? COL_ACCENT : COL_MID) : COL_DIM;
      ctx.beginPath();
      ctx.moveTo(X(d0), Y(d0));
      ctx.lineTo(X(d1), Y(d1));
      ctx.stroke();
      if (g.kind === 1 && g.from > this.dist - 4 && g.from < this.dist + ahead - 10) {
        const need = g.need || this.need;
        ctx.fillStyle = COL_LINE;
        v.text(`${need.toFixed(1)}/s`, X(g.from + 11), Y(g.from + 11) - 22 * a.u, v.fontTiny, 'center');
      }
    }
    ctx.lineCap = 'butt';
    // The bike, tilted with the road; a pedal that turns with your strokes.
    const bx = X(this.dist);
    const by = base;
    const slope = seg.kind === 1 ? -Math.atan(0.32) : seg.kind === 2 ? Math.atan((0.32 * 22) / 14) : 0;
    const stalled = now - this.stalledAt < 1000;
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(slope);
    ctx.strokeStyle = stalled ? COL_ACCENT : COL_LINE;
    ctx.lineWidth = 2 * dpr;
    for (const dx of [-15, 15]) {
      ctx.beginPath();
      ctx.arc(dx * a.u, -12 * a.u, 11 * a.u, 0, TAU);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-15 * a.u, -12 * a.u);
    ctx.lineTo(-2 * a.u, -12 * a.u);
    ctx.lineTo(8 * a.u, -30 * a.u);
    ctx.lineTo(-8 * a.u, -30 * a.u);
    ctx.lineTo(-2 * a.u, -12 * a.u);
    ctx.moveTo(8 * a.u, -30 * a.u);
    ctx.lineTo(15 * a.u, -12 * a.u);
    ctx.stroke();
    const crank = (this.strokes * Math.PI) % TAU;
    ctx.beginPath();
    ctx.moveTo(-2 * a.u - Math.cos(crank) * 6 * a.u, -12 * a.u - Math.sin(crank) * 6 * a.u);
    ctx.lineTo(-2 * a.u + Math.cos(crank) * 6 * a.u, -12 * a.u + Math.sin(crank) * 6 * a.u);
    ctx.stroke();
    ctx.restore();
    if (now - this.crestAt < 700) {
      ctx.fillStyle = COL_LINE;
      v.text('made it', bx, by - 56 * a.u, v.fontTiny, 'center');
    }
    // Rate gauge: your strokes a second against what this (or the next) climb asks for.
    const gx = a.right - 26 * a.u;
    const gt = a.top + 14 * a.u;
    const gh = 150 * a.u;
    const top = Math.max(10, this.need + 3);
    const next = seg.kind === 1 ? seg.need : this.need;
    ctx.fillStyle = COL_FAINT;
    ctx.fillRect(gx, gt, 14 * a.u, gh);
    const below = seg.kind === 1 && cad < seg.need;
    ctx.fillStyle = below ? COL_ACCENT : COL_LINE;
    const f = Math.min(1, cad / top);
    ctx.fillRect(gx, gt + gh * (1 - f), 14 * a.u, gh * f);
    ctx.fillStyle = COL_MID;
    ctx.fillRect(gx - 6 * a.u, gt + gh * (1 - next / top), 26 * a.u, 2 * dpr);
    v.text(`${cad}/s`, gx + 7 * a.u, gt + gh + 18 * a.u, v.fontTiny, 'center');
    // Strain: fills while you are under the climb's rate; full is a stall.
    if (seg.kind === 1 && this.strain > 0) {
      ctx.fillStyle = COL_FAINT;
      ctx.fillRect(a.cx - 80 * a.u, a.top + 14 * a.u, 160 * a.u, 6 * a.u);
      ctx.fillStyle = COL_ACCENT;
      ctx.fillRect(a.cx - 80 * a.u, a.top + 14 * a.u, 160 * a.u * this.strain, 6 * a.u);
    }
    note(v, a, stalled ? 'stalled: rolled back to the foot of the hill' : el < 4000 ? `alternate ${handLabel(this.env, -1)} and ${handLabel(this.env, 1)}. keep at the climb\'s rate on hills` : below ? 'too slow: pedal faster' : '', stalled || below ? COL_ACCENT : COL_MID);
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: Math.max(0, Math.round(this.dist + this.climbed * 40 + this.hardest * 60 - this.stalls * 30)),
      primary: { label: PEDAL_LABEL, value: this.hardest, unit: '/s', decimals: 1 },
      lines: [
        { label: 'hills climbed', value: String(this.climbed) },
        { label: 'stalls', value: String(this.stalls) },
        { label: 'distance', value: `${Math.round(this.dist)} m` },
        { label: 'first hill asked for', value: `${this.startNeed.toFixed(1)} /s` },
        { label: 'same pedal twice', value: String(this.repeats) },
      ],
      saved: this.strokes > 10,
    };
  }
}

// --- Drone --------------------------------------------------------------------------

class Drone implements Mini {
  private env!: MiniEnv;
  private x = 0;
  private y = 0;
  private vx = 0;
  private vy = 0;
  private tilt = 0;
  private d = 0;
  private last = 0;
  private started = false;
  private over = false;
  private overAt = 0;
  private lives = 3;
  private gates: { d: number; y: number; gap: number; done: boolean }[] = [];
  private passed = 0;
  private hitAt = -1e9;
  private time = 0;
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.last = now;
    let d = 8;
    for (let k = 0; k < 300; k++) {
      this.gates.push({ d, y: rnd(-0.55, 0.55), gap: Math.max(0.28, 0.5 - k * 0.01), done: false });
      d += rnd(6, 9);
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
    const dt = Math.min(0.03, (now - this.last) / 1000);
    this.last = now;
    if (this.over && now >= this.overAt) return true;
    if (this.started && !this.over) {
      this.time += dt;
      const [l, r] = hands(this.held);
      // Each hand drives one rotor: both lift; one alone also tips the drone toward the other side.
      const thrust = (l ? 1 : 0) + (r ? 1 : 0);
      this.tilt += ((r ? 1 : 0) - (l ? 1 : 0)) * -2.2 * dt;
      this.tilt *= Math.exp(-dt * 2.5);
      this.vy += (1.6 - thrust * 1.25) * dt;
      this.vx += Math.sin(this.tilt) * thrust * 0.8 * dt;
      this.vx *= Math.exp(-dt * 0.6);
      this.vy *= Math.exp(-dt * 0.5);
      this.y += this.vy * dt;
      this.x += this.vx * dt;
      this.d += 3.2 * dt + Math.min(2, this.time * 0.02) * dt;
      if (Math.abs(this.y) > 0.95) {
        this.y = Math.sign(this.y) * 0.95;
        this.vy = -this.vy * 0.4;
      }
      for (const g of this.gates) {
        if (g.done || g.d > this.d) continue;
        g.done = true;
        if (Math.abs(this.y - g.y) < g.gap / 2) {
          this.passed++;
          this.env.sound(SND_RING + Math.min(4, Math.floor(this.passed / 5)));
        } else if (now - this.hitAt > 800) {
          this.lives--;
          this.hitAt = now;
          this.env.sound(this.lives > 0 ? SND_LURCH : SND_FALL);
          if (this.lives <= 0) {
            this.over = true;
            this.overAt = now + 1300;
          }
        }
      }
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'gates', String(this.passed), 'time', `${this.time.toFixed(0)} s`, this.lives);
    const w = Math.min(a.right - a.left, 700 * a.u);
    const midY = a.cy;
    const halfH = (a.bottom - a.top) / 2 - 30 * a.u;
    const ppm = w / 22;
    const droneX = a.cx - w / 2 + 4 * ppm;
    const Y = (p: number) => midY + p * halfH;
    ctx.fillStyle = COL_FAINT;
    ctx.fillRect(a.cx - w / 2, Y(-1), w, v.dpr);
    ctx.fillRect(a.cx - w / 2, Y(1), w, v.dpr);
    for (const g of this.gates) {
      const gx = droneX + (g.d - this.d) * ppm;
      if (gx < a.cx - w / 2 - 10 || gx > a.cx + w / 2) continue;
      ctx.fillStyle = g.done ? COL_DIM : COL_MID;
      ctx.fillRect(gx - 2 * v.dpr, Y(-1), 4 * v.dpr, Y(g.y - g.gap / 2) - Y(-1));
      ctx.fillRect(gx - 2 * v.dpr, Y(g.y + g.gap / 2), 4 * v.dpr, Y(1) - Y(g.y + g.gap / 2));
    }
    // The drone, tipped by its tilt, rotors lit when driven.
    const [l, r] = hands(this.held);
    const blink = now - this.hitAt < 800 && Math.floor(now / 90) % 2 === 0;
    if (!blink) {
      ctx.save();
      ctx.translate(droneX, Y(this.y));
      ctx.rotate(this.tilt);
      ctx.strokeStyle = COL_LINE;
      ctx.lineWidth = 2 * v.dpr;
      ctx.beginPath();
      ctx.moveTo(-18 * a.u, 0);
      ctx.lineTo(18 * a.u, 0);
      ctx.stroke();
      for (const [s, on] of [[-1, l], [1, r]] as const) {
        ctx.fillStyle = on ? COL_ACCENT : COL_MID;
        ctx.fillRect(s * 18 * a.u - 9 * a.u, -6 * a.u, 18 * a.u, 3 * v.dpr);
      }
      ctx.restore();
    }
    if (!this.started) note(v, a, `hold ${handLabel(this.env, -1)} for the left rotor, ${handLabel(this.env, 1)} for the right. both lift you; fly through the gaps`);
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.passed * 25,
      primary: { label: 'gates flown through', value: this.passed, unit: '' },
      lines: [{ label: 'flew for', value: `${this.time.toFixed(0)} s` }],
      saved: this.started && this.time > 5,
    };
  }
}

export const BATCH28: MiniDef[] = [
  { id: 'hoop', name: 'Hoop', skill: 'judgement', blurb: 'Hold to charge, release to shoot. The basket moves each time.', how: 'Hold any key to charge the shot; the meter fills over about a second and a half, then starts again from empty. Let go to shoot. The basket stands at a different distance each time, and later there is wind. Judge the power the distance needs.', input: 'both', make: () => new Hoop() },
  { id: 'rope', name: 'Rope', skill: 'timing', blurb: 'Jump the skipping rope as it comes round. It speeds up and slows down.', how: 'Press any key to start. The rope turns; press to jump just before it reaches your feet (you are in the air for under half a second). The turner speeds up, with lulls. Three trips end it.', input: 'both', make: () => new Rope() },
  { id: 'morse', name: 'Morse', skill: 'timing', blurb: 'Tap letters in Morse code: a short press is a dot, a long press a dash.', how: 'A letter appears with its code. Send it on any key: a press under a quarter of a second is a dot, a longer one a dash. A wrong symbol loses the letter. Longer codes come in as you go.', input: 'both', make: () => new Morse() },
  { id: 'etch', name: 'Etch', skill: 'coordination', blurb: 'Left hand moves across, right hand moves up and down. Trace the path.', how: 'Like an Etch A Sketch: the left hand moves the pen across (A left, D right) and the right hand moves it up and down (I up, K down; the arrow keys work too). Hold to keep moving. Trace the grey path to each circle. Later paths have diagonals, which need both hands at once.', input: 'type', make: () => new Etch() },
  { id: 'row', name: 'Row', skill: 'coordination', blurb: 'One oar per hand. Pull evenly to go straight down the river.', how: 'The left hand pulls the left oar, the right hand the right one. Each stroke pushes the boat on and turns it away from that side, so even strokes go straight and an extra stroke on one side steers. Hitting a bank slows you down. One minute: how far can you row?', input: 'keys', minKeys: 2, make: () => new Row() },
  { id: 'crane', name: 'Crane', skill: 'coordination', blurb: 'Move the crane, let the swing settle, drop the crate on the pad.', how: 'Hold the left or right hand to move the crane along its rail. The crate swings below it: moving starts the swing, and stopping does too. Press both hands together to let go; the crate keeps its swing as it falls. Land it on the white pad, which shrinks as you go.', input: 'keys', minKeys: 2, make: () => new Crane() },
  { id: 'pedal', name: 'Pedal', skill: 'speed', blurb: 'Alternate the pedals and hold each hill’s rate to the top. The hills get steeper as you climb them.', how: 'Alternate hands to pedal; the same hand twice slips. Each hill shows the rate it needs (strokes a second). Drop below it on the climb and the strain bar fills with a warning tick; let it fill and you stall and roll back. Each hill you climb asks for half a stroke more; a stall eases it off. Forty-five seconds.', input: 'keys', minKeys: 2, make: () => new Pedal() },
  { id: 'drone', name: 'Drone', skill: 'coordination', blurb: 'A rotor per hand. Fly through the gates.', how: 'Hold the left hand for the left rotor and the right hand for the right one. Both together lift you; one alone also tips the drone, which pushes it sideways. Let go and you fall. Fly through the gap in each gate. Gaps narrow; three misses end it.', input: 'keys', minKeys: 2, make: () => new Drone() },
];
