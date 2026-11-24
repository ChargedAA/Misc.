// Thirty-first batch: Aim (the mouse), and a ship.
//   Flick  - targets appear one at a time anywhere: click each, fast. Fitts throughput.
//   Micro  - tiny targets: precision over speed; a miss costs time.
//   Follow - keep the cursor on a target that wanders and changes pace.
//   Sphere - 3D: mouse-look around a room, put the crosshair on the balls and click.
//   Ship   - hold to fly up, let go to sink, through gaps in the walls.

import { COL_ACCENT, COL_DIM, COL_FAINT, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALL, SND_TAP_L, SND_TAP_WEAK } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, header, mean, median, message, ms, pct, scaled, type Arena, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const TAU = Math.PI * 2;
const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

// --- Flick and Micro -------------------------------------------------------------------

const FLICK_TARGETS = 30;

class Flick implements Mini {
  private env!: MiniEnv;
  private a: Arena | null = null;
  private started = false;
  private x = 0;
  private y = 0;
  private r = 0;
  private shownAt = 0;
  /** Where the cursor was when the last target was hit (the start of this movement). */
  private fromX = 0;
  private fromY = 0;
  private times: number[] = [];
  private tps: number[] = [];
  private hits = 0;
  private misses = 0;
  private flash = 0;
  private missAt: [number, number, number] = [0, 0, 0];
  private done = false;
  private firstFrame = 0;

  /** Target radius range, in arena units. */
  private readonly rMin: number;
  private readonly rMax: number;

  constructor(rMin: number, rMax: number) {
    this.rMin = rMin;
    this.rMax = rMax;
  }

  start(env: MiniEnv): void {
    this.env = env;
  }

  press(): void {}

  private place(a: Arena, now: number): void {
    this.r = rnd(this.rMin, this.rMax) * a.u;
    // Somewhere new, at a real distance from the last one.
    for (let k = 0; k < 30; k++) {
      this.x = rnd(a.left + this.r + 10 * a.u, a.right - this.r - 10 * a.u);
      this.y = rnd(a.top + this.r + 10 * a.u, a.bottom - this.r - 10 * a.u);
      if (Math.hypot(this.x - this.fromX, this.y - this.fromY) > 120 * a.u) break;
    }
    this.shownAt = now;
  }

  pointer(px: number, py: number, ts: number): void {
    const a = this.a;
    if (!a || this.done) return;
    const d = Math.hypot(px - this.x, py - this.y);
    if (!this.started) {
      if (d <= this.r * 1.2) {
        this.started = true;
        this.fromX = px;
        this.fromY = py;
        this.place(a, ts);
        this.env.sound(SND_TAP_L);
      }
      return;
    }
    if (d <= this.r) {
      const t = ts - this.shownAt;
      // Fitts: the movement's difficulty (bits) over its time.
      const dist = Math.hypot(this.x - this.fromX, this.y - this.fromY);
      const id = Math.log2(dist / (2 * this.r) + 1);
      this.times.push(t);
      if (t > 60) this.tps.push(id / (t / 1000));
      this.hits++;
      this.flash = ts + 80;
      this.env.sound(SND_CATCH);
      this.fromX = px;
      this.fromY = py;
      if (this.hits >= scaled(FLICK_TARGETS)) this.done = true;
      else this.place(a, ts);
    } else {
      this.misses++;
      this.missAt = [px, py, ts + 300];
      this.env.sound(SND_TAP_WEAK);
    }
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const a = arena(v, touch);
    if (!this.a) {
      this.a = a;
      // A start disc in the middle: the clock starts when you click it.
      this.r = 22 * a.u;
      this.x = a.cx;
      this.y = a.cy;
    }
    this.a = a;
    if (!this.firstFrame) this.firstFrame = now;
    // A run left alone still ends: three minutes at most.
    if (this.done || now - this.firstFrame > 180000) return true;
    v.clear();
    const ctx = v.ctx;
    const dpr = v.dpr;
    const total = scaled(FLICK_TARGETS);
    header(v, touch, 'per target', this.times.length ? ms(median(this.times.slice(-8))) : '–', 'hits', `${this.hits} / ${total}`);
    ctx.strokeStyle = COL_FAINT;
    ctx.lineWidth = dpr;
    ctx.strokeRect(a.left, a.top, a.right - a.left, a.bottom - a.top);
    // The target: a disc with a ring and a centre dot, so its middle is clear.
    ctx.fillStyle = now < this.flash ? COL_LINE : COL_ACCENT;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r * 0.55, 0, TAU);
    ctx.fill();
    ctx.fillStyle = COL_LINE;
    ctx.beginPath();
    ctx.arc(this.x, this.y, Math.max(1.5 * dpr, this.r * 0.14), 0, TAU);
    ctx.fill();
    if (now < this.missAt[2]) {
      ctx.strokeStyle = COL_MID;
      ctx.lineWidth = 1.5 * dpr;
      const [mx, my] = this.missAt;
      const s = 5 * dpr;
      ctx.beginPath();
      ctx.moveTo(mx - s, my - s);
      ctx.lineTo(mx + s, my + s);
      ctx.moveTo(mx + s, my - s);
      ctx.lineTo(mx - s, my + s);
      ctx.stroke();
    }
    if (!this.started) {
      ctx.fillStyle = COL_MID;
      v.text('click the disc to start', a.cx, a.cy + 50 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const med = median(this.times);
    const acc = this.hits / Math.max(1, this.hits + this.misses);
    const tp = this.tps.length ? mean(this.tps) : 0;
    return {
      // Faster and cleaner both count: a miss costs as much as a slow target.
      score: this.hits ? Math.round(Math.max(0, 1600 - med) * acc) : 0,
      primary: { label: 'time per target (median)', value: med, unit: 'ms', lower: true },
      series: { label: 'time per target', names: this.times.map((_, i) => String(i + 1)), values: this.times.map(Math.round), unit: 'ms' },
      lines: [
        { label: 'time per target', value: `${ms(med)} median  ·  ${ms(mean(this.times))} average` },
        { label: 'accuracy', value: `${pct(acc)}  (${this.misses} missed ${this.misses === 1 ? 'click' : 'clicks'})` },
        { label: 'fastest', value: this.times.length ? ms(Math.min(...this.times)) : '–' },
        { label: 'throughput (Fitts)', value: tp ? `${tp.toFixed(1)} bits/s` : '–' },
      ],
      saved: this.hits >= 5,
    };
  }
}

// --- Follow --------------------------------------------------------------------------

const FOLLOW_MS = 30000;

class Follow implements Mini {
  private env!: MiniEnv;
  private started = false;
  private t0 = 0;
  private last = 0;
  /** Target position (0..1 of the arena) and its wandering: a sum of slow sines with random phases. */
  private ph: number[] = [];
  private fr: number[] = [];
  private tx = 0.5;
  private ty = 0.5;
  private cx = -1;
  private cy = -1;
  private on = 0;
  private total = 0;
  private dists: number[] = [];
  private secs: number[] = [];
  private secOn = 0;
  private secAll = 0;
  private r = 0;

  start(env: MiniEnv): void {
    this.env = env;
    this.ph = Array.from({ length: 6 }, () => Math.random() * TAU);
    this.fr = [0.37, 0.61, 0.23, 0.43, 0.71, 0.29].map((f) => f * rnd(0.85, 1.15));
  }

  press(): void {}

  pointer(px: number, py: number, ts: number): void {
    this.cx = px;
    this.cy = py;
    if (!this.started) {
      this.started = true;
      this.t0 = ts;
      this.last = ts;
      this.env.sound(SND_TAP_L);
    }
  }

  pointerMove(px: number, py: number): void {
    this.cx = px;
    this.cy = py;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const len = scaled(FOLLOW_MS);
    this.r = 24 * a.u;
    const W = a.right - a.left - 2 * this.r;
    const H = a.bottom - a.top - 2 * this.r;
    if (this.started) {
      const dt = Math.min(50, now - this.last);
      this.last = now;
      const t = (now - this.t0) / 1000;
      // It speeds up through the run: the clock it moves on runs faster.
      const k = t * (1 + t / (len / 1000) * 0.9);
      const s = (i: number) => Math.sin(k * this.fr[i]! * 2.2 + this.ph[i]!);
      this.tx = 0.5 + 0.3 * s(0) + 0.15 * s(1) + 0.05 * s(4);
      this.ty = 0.5 + 0.3 * s(2) + 0.15 * s(3) + 0.05 * s(5);
      const x = a.left + this.r + this.tx * W;
      const y = a.top + this.r + this.ty * H;
      const d = Math.hypot(this.cx - x, this.cy - y);
      this.total += dt;
      this.secAll += dt;
      if (d <= this.r) {
        this.on += dt;
        this.secOn += dt;
      }
      this.dists.push(d / this.r);
      if (this.secAll >= 1000) {
        this.secs.push(this.secOn / this.secAll);
        this.secOn = 0;
        this.secAll = 0;
      }
      if (now - this.t0 >= len) return true;
    }
    v.clear();
    header(v, touch, 'on target', this.total ? pct(this.on / this.total) : '–', 'time', this.started ? `${Math.max(0, Math.ceil((len - (now - this.t0)) / 1000))} s` : `${Math.round(len / 1000)} s`);
    ctx.strokeStyle = COL_FAINT;
    ctx.lineWidth = dpr;
    ctx.strokeRect(a.left, a.top, a.right - a.left, a.bottom - a.top);
    const x = a.left + this.r + this.tx * W;
    const y = a.top + this.r + this.ty * H;
    const onIt = this.cx >= 0 && Math.hypot(this.cx - x, this.cy - y) <= this.r;
    ctx.fillStyle = onIt ? COL_LINE : COL_ACCENT;
    ctx.beginPath();
    ctx.arc(x, y, this.r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.arc(x, y, this.r * 0.5, 0, TAU);
    ctx.fill();
    if (!this.started) {
      ctx.fillStyle = COL_MID;
      v.text('click the disc, then keep the pointer on it', a.cx, a.cy + 60 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const share = this.total ? this.on / this.total : 0;
    return {
      score: Math.round(share * 1000),
      primary: { label: 'time on target', value: Math.round(share * 100), unit: '%' },
      series: { label: 'on target, second by second', names: this.secs.map((_, i) => String(i + 1)), values: this.secs.map((x) => Math.round(x * 100)), unit: '%' },
      lines: [
        { label: 'time on target', value: pct(share) },
        { label: 'typical distance off', value: this.dists.length ? `${median(this.dists).toFixed(2)} target radii` : '–' },
        { label: 'first half · second half', value: this.secs.length >= 4 ? `${pct(mean(this.secs.slice(0, this.secs.length >> 1)))}  ·  ${pct(mean(this.secs.slice(this.secs.length >> 1)))}` : '–' },
      ],
      saved: this.total > 5000,
    };
  }
}

// --- Sphere (3D flick) ---------------------------------------------------------------

const SPHERE_MS = 45000;
/** Radians turned per CSS pixel of mouse movement, by level (0 = medium). */
const SENS: Record<number, number> = { 0: 0.0022, 1: 0.0013, 2: 0.0034 };
const FOV = (70 * Math.PI) / 180;
const ROOM = 12;

interface Ball {
  yaw: number;
  pitch: number;
  born: number;
}

/** A direction from yaw (left-right) and pitch (up-down). */
function dir(yaw: number, pitch: number): [number, number, number] {
  return [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
}

class Sphere implements Mini {
  private env!: MiniEnv;
  private yaw = 0;
  private pitch = 0;
  private balls: Ball[] = [];
  private started = false;
  private t0 = 0;
  private hits = 0;
  private shots = 0;
  private gaps: number[] = [];
  private lastHit = 0;
  private flash = 0;
  private sens = SENS[0]!;
  /** Angular radius of a ball (radians): about 2 degrees, bigger when tracking. */
  private ang = 0.036;
  private w = 0;
  private h = 0;
  /** Tracking variant (Strafe): one ball strafes about; keep the crosshair on it. */
  private readonly track: boolean;
  private vel = 0.5;
  private turnAt = 0;
  private last = 0;
  private onMs = 0;
  private allMs = 0;
  private secs: number[] = [];
  private secOn = 0;
  private secAll = 0;
  /** Where a finger or unlocked mouse aims, when there is no mouse-look. */
  private aimX = -1;
  private aimY = -1;
  private looked = false;

  constructor(track = false) {
    this.track = track;
  }

  start(env: MiniEnv): void {
    this.env = env;
    this.sens = SENS[env.level ?? 0] ?? SENS[0]!;
    if (this.track) {
      this.ang = 0.055;
      this.balls.push({ yaw: 0.25, pitch: 0.05, born: 0 });
    } else for (let i = 0; i < 3; i++) this.spawn(0);
  }

  pointerMove(px: number, py: number): void {
    this.aimX = px;
    this.aimY = py;
  }

  private len(): number {
    return scaled(this.track ? 30000 : SPHERE_MS);
  }

  /** The angle between the aim (crosshair, or the finger) and a ball. */
  private angleTo(b: Ball): number {
    const f = this.h / 2 / Math.tan(FOV / 2);
    const px = this.looked || this.aimX < 0 ? this.w / 2 : this.aimX;
    const py = this.looked || this.aimY < 0 ? this.h / 2 : this.aimY;
    const rx = px - this.w / 2;
    const ry = -(py - this.h / 2);
    const rl = Math.hypot(rx, ry, f);
    const c = this.view(dir(b.yaw, b.pitch));
    return Math.acos(Math.max(-1, Math.min(1, (c[0] * rx + c[1] * ry + c[2] * f) / rl)));
  }

  private spawn(now: number): void {
    // In front, within a comfortable arc, and away from where you are looking and the others.
    for (let k = 0; k < 40; k++) {
      const b = { yaw: rnd(-0.65, 0.65), pitch: rnd(-0.32, 0.36), born: now };
      const far = (y: number, p: number) => Math.hypot(b.yaw - y, b.pitch - p) > 0.18;
      if (far(this.yaw, this.pitch) && this.balls.every((o) => far(o.yaw, o.pitch))) {
        this.balls.push(b);
        return;
      }
    }
    this.balls.push({ yaw: rnd(-0.6, 0.6), pitch: rnd(-0.3, 0.3), born: now });
  }

  press(): void {}

  look(dx: number, dy: number): void {
    this.looked = true;
    this.yaw += dx * this.sens;
    this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch - dy * this.sens));
  }

  /** Camera space: rotate a world direction into view (x right, y up, z forward). */
  private view(p: [number, number, number]): [number, number, number] {
    const cy = Math.cos(-this.yaw);
    const sy = Math.sin(-this.yaw);
    const x1 = p[0] * cy + p[2] * sy;
    const z1 = -p[0] * sy + p[2] * cy;
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    return [x1, p[1] * cp - z1 * sp, p[1] * sp + z1 * cp];
  }

  /** The aim through a point on the screen: the crosshair when the mouse is locked, the tap otherwise. */
  pointer(px: number, py: number, ts: number): void {
    if (!this.started) {
      this.started = true;
      this.t0 = ts;
      this.lastHit = ts;
      for (const b of this.balls) b.born = ts;
      this.last = ts;
      this.turnAt = ts + 600;
      this.env.sound(SND_TAP_L);
      return;
    }
    if (this.track) return;
    this.shots++;
    const f = this.h / 2 / Math.tan(FOV / 2);
    // Ray in camera space through the pixel, compared with each ball's direction.
    const rx = px - this.w / 2;
    const ry = -(py - this.h / 2);
    const rl = Math.hypot(rx, ry, f);
    const ray: [number, number, number] = [rx / rl, ry / rl, f / rl];
    let hit = -1;
    let bestAng = Infinity;
    this.balls.forEach((b, i) => {
      const c = this.view(dir(b.yaw, b.pitch));
      const ang = Math.acos(Math.max(-1, Math.min(1, c[0] * ray[0] + c[1] * ray[1] + c[2] * ray[2])));
      if (ang <= this.ang && ang < bestAng) {
        bestAng = ang;
        hit = i;
      }
    });
    if (hit >= 0) {
      this.hits++;
      this.gaps.push(ts - this.lastHit);
      this.lastHit = ts;
      this.flash = ts + 70;
      this.balls.splice(hit, 1);
      this.spawn(ts);
      this.env.sound(SND_CATCH);
    } else this.env.sound(SND_TAP_WEAK);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    this.w = v.w;
    this.h = v.h;
    const len = this.len();
    if (this.started && now - this.t0 >= len) return true;
    if (this.track && this.started) {
      // The ball strafes: steady speed, sudden changes of direction, faster as it goes.
      const dt = Math.min(50, now - this.last);
      this.last = now;
      const b = this.balls[0]!;
      const p = (now - this.t0) / len;
      if (now >= this.turnAt) {
        this.vel = (this.vel > 0 ? -1 : 1) * rnd(0.35, 0.55) * (1 + p * 1.2);
        this.turnAt = now + rnd(350, 1100) * (1 - p * 0.4);
      }
      b.yaw += (this.vel * dt) / 1000;
      if (Math.abs(b.yaw) > 0.8) {
        b.yaw = Math.sign(b.yaw) * 0.8;
        this.vel = -this.vel;
      }
      b.pitch = 0.06 + 0.12 * Math.sin((now - this.t0) / 900);
      const on = this.angleTo(b) <= this.ang;
      this.allMs += dt;
      this.secAll += dt;
      if (on) {
        this.onMs += dt;
        this.secOn += dt;
        this.flash = now + 30;
      }
      if (this.secAll >= 1000) {
        this.secs.push(this.secOn / this.secAll);
        this.secOn = 0;
        this.secAll = 0;
      }
    }
    v.clear();
    const ctx = v.ctx;
    const dpr = v.dpr;
    const f = v.h / 2 / Math.tan(FOV / 2);
    const cx = v.w / 2;
    const cy = v.h / 2;
    const proj = (p: [number, number, number]): [number, number] => [cx + (f * p[0]) / p[2], cy - (f * p[1]) / p[2]];
    // The room: a box of lines around you, clipped at the near plane.
    const seg = (p: [number, number, number], q: [number, number, number]) => {
      let a = this.view(p);
      let b = this.view(q);
      const near = 0.05;
      if (a[2] < near && b[2] < near) return;
      if (a[2] < near) a = lerp3(a, b, (near - a[2]) / (b[2] - a[2]));
      if (b[2] < near) b = lerp3(b, a, (near - b[2]) / (a[2] - b[2]));
      const [x1, y1] = proj(a);
      const [x2, y2] = proj(b);
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    };
    const R = ROOM;
    const floor = -R * 0.35;
    const ceil = R * 0.6;
    ctx.strokeStyle = COL_FAINT;
    ctx.lineWidth = dpr;
    ctx.beginPath();
    // Grid on the far wall, the floor and the side walls.
    for (let i = -6; i <= 6; i++) {
      const t = (i / 6) * R;
      seg([t, floor, R], [t, ceil, R]);
      seg([t, floor, -R], [t, floor, R]);
      seg([-R, floor, t], [R, floor, t]);
      seg([R, floor, t], [R, ceil, t]);
      seg([-R, floor, t], [-R, ceil, t]);
    }
    for (let j = 0; j <= 4; j++) {
      const y = floor + ((ceil - floor) * j) / 4;
      seg([-R, y, R], [R, y, R]);
      seg([R, y, -R], [R, y, R]);
      seg([-R, y, -R], [-R, y, R]);
    }
    ctx.stroke();
    ctx.strokeStyle = COL_DIM;
    ctx.beginPath();
    seg([-R, floor, R], [R, floor, R]);
    seg([-R, ceil, R], [R, ceil, R]);
    seg([-R, floor, R], [-R, ceil, R]);
    seg([R, floor, R], [R, ceil, R]);
    ctx.stroke();
    // The balls, shaded a little so they read as round.
    for (const b of this.balls) {
      const c = this.view(dir(b.yaw, b.pitch));
      if (c[2] <= 0.05) continue;
      const [x, y] = proj(c);
      const r = (f * Math.tan(this.ang)) / c[2];
      // Shaded in flat steps, low-poly fashion: base, a darker lower half, a highlight.
      ctx.fillStyle = this.track && now < this.flash ? COL_LINE : COL_ACCENT;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0.15 * Math.PI, 1.15 * Math.PI);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.28, 0, TAU);
      ctx.fill();
    }
    // Crosshair.
    ctx.fillStyle = now < this.flash ? COL_ACCENT : COL_LINE;
    const s = 6 * dpr;
    const gap = 3 * dpr;
    ctx.fillRect(cx - s - gap, cy - dpr / 2, s, dpr);
    ctx.fillRect(cx + gap, cy - dpr / 2, s, dpr);
    ctx.fillRect(cx - dpr / 2, cy - s - gap, dpr, s);
    ctx.fillRect(cx - dpr / 2, cy + gap, dpr, s);
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, this.track ? 'on target' : 'hits', this.track ? (this.allMs ? pct(this.onMs / this.allMs) : '–') : String(this.hits), 'time', `${left} s`);
    if (!this.started) {
      const a = arena(v, touch);
      message(v, { ...a, cy: cy + 90 * dpr }, 'click to take the mouse, click again to start', this.track ? 'keep the crosshair on the ball as it strafes. esc frees the mouse' : 'look with the mouse, shoot the balls with the crosshair. esc frees the mouse', COL_MID);
    }
    footer(v, touch, 0, 'esc frees the mouse and pauses');
    return false;
  }

  result(): MiniResult {
    if (this.track) {
      const share = this.allMs ? this.onMs / this.allMs : 0;
      return {
        score: Math.round(share * 1000),
        primary: { label: 'time on target', value: Math.round(share * 100), unit: '%' },
        series: { label: 'on target, second by second', names: this.secs.map((_, i) => String(i + 1)), values: this.secs.map((x) => Math.round(x * 100)), unit: '%' },
        lines: [
          { label: 'time on target', value: pct(share) },
          { label: 'first half · second half', value: this.secs.length >= 4 ? `${pct(mean(this.secs.slice(0, this.secs.length >> 1)))}  ·  ${pct(mean(this.secs.slice(this.secs.length >> 1)))}` : '–' },
        ],
        saved: this.allMs > 5000,
      };
    }
    const acc = this.hits / Math.max(1, this.shots);
    const secs = this.len() / 1000;
    return {
      score: Math.round(this.hits * 10 * (0.5 + acc / 2)),
      primary: { label: 'hits', value: this.hits, unit: '' },
      lines: [
        { label: 'hits', value: `${this.hits}  (${(this.hits / secs).toFixed(2)} a second)` },
        { label: 'accuracy', value: `${pct(acc)}  (${this.shots} shots)` },
        { label: 'time between hits', value: this.gaps.length ? `${ms(median(this.gaps))} median` : '–' },
      ],
      saved: this.hits >= 3,
    };
  }
}

function lerp3(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// --- Ship ----------------------------------------------------------------------------

interface Gate {
  x: number;
  gap: number;
  h: number;
  passed: boolean;
}

class Ship implements Mini {
  private env!: MiniEnv;
  private held = 0;
  private started = false;
  private over = false;
  private overAt = 0;
  private last = 0;
  /** World units: the play field is 1 tall; x is distance flown. */
  private x = 0;
  private y = 0.5;
  private vy = 0;
  private speed = 0.42;
  private gates: Gate[] = [];
  private passed = 0;
  private nextAt = 1.2;
  private gapY = 0.5;
  private trail: [number, number][] = [];
  /** Straight-fly variant: a tight tunnel to hold your line in, by feathering the thrust. */
  private readonly straight: boolean;
  /** The tunnel: centre and height at every STEP of distance. */
  private cy: number[] = [];
  private ch: number[] = [];
  private thrusts = 0;
  private flown = 0;

  constructor(straight = false) {
    this.straight = straight;
  }

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.last = now;
    if (this.straight) this.extendTunnel();
  }

  private extendTunnel(): void {
    const STEP = 0.1;
    while (this.cy.length * STEP < this.x + 4) {
      const i = this.cy.length;
      const d = i * STEP;
      const h = Math.max(0.072, 0.2 - d * 0.0045);
      // Long flat runs, then a slope up or down, never out of the field.
      if (i < 12) {
        this.cy.push(0.5);
        this.ch.push(h);
        continue;
      }
      const flat = Math.round(rnd(4, 12));
      for (let k = 0; k < flat; k++) {
        this.cy.push(this.cy[this.cy.length - 1]!);
        this.ch.push(h);
      }
      const last = this.cy[this.cy.length - 1]!;
      const dirn = last > 0.7 ? -1 : last < 0.3 ? 1 : Math.random() < 0.5 ? -1 : 1;
      const len = Math.round(rnd(2, 5));
      const slope = rnd(0.025, 0.045) * Math.min(1.6, 1 + d * 0.01);
      for (let k = 1; k <= len; k++) {
        this.cy.push(Math.max(h / 2 + 0.04, Math.min(1 - h / 2 - 0.04, last + dirn * slope * k)));
        this.ch.push(h);
      }
    }
  }

  private tunnel(at: number): [number, number] {
    const f = Math.max(0, Math.min(this.cy.length - 1, at / 0.1));
    const i = Math.floor(f);
    const j = Math.min(i + 1, this.cy.length - 1);
    const t = f - i;
    return [this.cy[i]! + (this.cy[j]! - this.cy[i]!) * t, this.ch[i]! + (this.ch[j]! - this.ch[i]!) * t];
  }

  press(slot: number): void {
    if (!this.held) this.thrusts++;
    this.held |= 1 << slot;
    this.started = true;
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  private thrust(): boolean {
    return this.held !== 0;
  }

  private addGates(): void {
    while (this.nextAt < this.x + 3) {
      const n = this.passed + this.gates.length;
      // Gaps narrow and wander further as you go.
      const gap = Math.max(0.2, 0.44 - n * 0.006);
      this.gapY = Math.max(gap / 2 + 0.06, Math.min(1 - gap / 2 - 0.06, this.gapY + rnd(-1, 1) * Math.min(0.42, 0.18 + n * 0.006)));
      this.gates.push({ x: this.nextAt, gap: this.gapY, h: gap, passed: false });
      this.nextAt += Math.max(0.42, 0.62 - n * 0.004);
    }
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const dt = Math.min(0.033, (now - this.last) / 1000);
    this.last = now;
    if (this.over && now >= this.overAt) return true;
    if (this.started && !this.over) {
      if (this.straight) this.extendTunnel();
      else this.addGates();
      // Momentum: thrust pushes up, gravity pulls down, both strong and quick to answer, so short
      // taps hold a line and a long hold climbs steeply.
      this.vy += (this.thrust() ? 4.8 : -4.2) * dt;
      this.vy = Math.max(-1.3, Math.min(1.3, this.vy));
      this.y += this.vy * dt;
      this.speed = this.straight ? 0.5 + this.x * 0.004 : 0.42 + this.x * 0.006;
      this.x += this.speed * dt;
      this.flown += dt;
      this.trail.push([this.x, this.y]);
      if (this.trail.length > 40) this.trail.shift();
      const r = 0.022;
      let crash = this.y - r < 0 || this.y + r > 1;
      if (this.straight) {
        const [c, h] = this.tunnel(this.x);
        if (this.y - r < c - h / 2 || this.y + r > c + h / 2) crash = true;
      }
      for (const g of this.gates) {
        const halfW = 0.045;
        if (Math.abs(g.x - this.x) < halfW + r && (this.y - r < g.gap - g.h / 2 || this.y + r > g.gap + g.h / 2)) crash = true;
        if (!g.passed && g.x + halfW < this.x - r) {
          g.passed = true;
          this.passed++;
          this.env.sound(SND_TAP_WEAK);
        }
      }
      this.gates = this.gates.filter((g) => g.x > this.x - 1);
      if (crash) {
        this.over = true;
        this.overAt = now + 1200;
        this.env.sound(SND_FALL);
      }
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    if (this.straight) header(v, touch, 'distance', (this.x * 10).toFixed(0), 'tunnel', `${Math.round(this.tunnel(this.x)[1] * 100)}`);
    else header(v, touch, 'gates', String(this.passed), 'speed', `${(this.speed / 0.42).toFixed(2)}×`);
    const H = a.bottom - a.top;
    const scale = H;
    const W = a.right - a.left;
    const toX = (wx: number) => a.left + W * 0.28 + (wx - this.x) * scale;
    const toY = (wy: number) => a.bottom - wy * H;
    ctx.save();
    ctx.beginPath();
    ctx.rect(a.left, a.top, W, H);
    ctx.clip();
    // Floor and ceiling.
    ctx.fillStyle = COL_LINE;
    ctx.fillRect(a.left, a.top, W, 2 * dpr);
    ctx.fillRect(a.left, a.bottom - 2 * dpr, W, 2 * dpr);
    // Distance marks scrolling past, so speed reads.
    ctx.fillStyle = COL_FAINT;
    for (let d = Math.floor((this.x - 0.4) * 5) / 5; d < this.x + W / scale; d += 0.2) ctx.fillRect(toX(d), a.top, dpr, H);
    // The tunnel: solid above and below, drawn through its own points so it glides.
    if (this.straight && this.cy.length) {
      const from = Math.max(0, Math.floor((this.x - 0.5) / 0.1));
      const to = Math.min(this.cy.length - 1, Math.ceil((this.x + W / scale) / 0.1) + 1);
      for (const side of [1, -1]) {
        ctx.fillStyle = COL_LINE;
        ctx.beginPath();
        ctx.moveTo(toX(from * 0.1), side > 0 ? a.top : a.bottom);
        for (let i = from; i <= to; i++) ctx.lineTo(toX(i * 0.1), toY(this.cy[i]! + (side * this.ch[i]!) / 2));
        ctx.lineTo(toX(to * 0.1), side > 0 ? a.top : a.bottom);
        ctx.closePath();
        ctx.fill();
      }
    }
    // Walls with a gap; their edges are saw-toothed, the low-poly way.
    for (const g of this.gates) {
      const x0 = toX(g.x - 0.045);
      const x1 = toX(g.x + 0.045);
      const top = toY(g.gap + g.h / 2);
      const bot = toY(g.gap - g.h / 2);
      ctx.fillStyle = g.passed ? '#2a2a2f' : COL_LINE;
      ctx.fillRect(x0, a.top, x1 - x0, top - a.top);
      ctx.fillRect(x0, bot, x1 - x0, a.bottom - bot);
      ctx.beginPath();
      const teeth = 3;
      for (let k = 0; k < teeth; k++) {
        const ta = x0 + ((x1 - x0) * k) / teeth;
        const tb = x0 + ((x1 - x0) * (k + 1)) / teeth;
        ctx.moveTo(ta, top);
        ctx.lineTo((ta + tb) / 2, top + 9 * a.u);
        ctx.lineTo(tb, top);
        ctx.moveTo(ta, bot);
        ctx.lineTo((ta + tb) / 2, bot - 9 * a.u);
        ctx.lineTo(tb, bot);
      }
      ctx.fill();
    }
    // The trail and the ship: a dart that tilts with its climb.
    ctx.strokeStyle = COL_DIM;
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    this.trail.forEach(([tx, ty], i) => (i ? ctx.lineTo(toX(tx), toY(ty)) : ctx.moveTo(toX(tx), toY(ty))));
    ctx.stroke();
    const sx = toX(this.x);
    const sy = toY(this.y);
    const ang = -Math.atan2(this.vy, this.speed * 1.4);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(ang);
    const s = 13 * a.u;
    if (this.thrust() && !this.over) {
      ctx.fillStyle = COL_LINE;
      ctx.beginPath();
      ctx.moveTo(-s * 0.7, -s * 0.25);
      ctx.lineTo(-s * (1.2 + Math.random() * 0.4), 0);
      ctx.lineTo(-s * 0.7, s * 0.25);
      ctx.fill();
    }
    ctx.fillStyle = COL_ACCENT;
    ctx.beginPath();
    ctx.moveTo(s, 0);
    ctx.lineTo(-s * 0.75, -s * 0.55);
    ctx.lineTo(-s * 0.45, 0);
    ctx.lineTo(-s * 0.75, s * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.moveTo(s, 0);
    ctx.lineTo(-s * 0.45, 0);
    ctx.lineTo(-s * 0.75, s * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
    if (!this.started) message(v, { ...a, cy: a.top + H * (this.straight ? 0.15 : 0.3) }, this.straight ? 'tap, tap, tap: hold a straight line' : 'hold to fly up, let go to sink', this.straight ? 'quick taps keep you level in the tunnel. press to start' : 'through the gaps in the walls. press to start', COL_MID);
    if (this.over) message(v, { ...a, cy: a.top + H * 0.15 }, this.straight ? `${(this.x * 10).toFixed(0)}` : `${this.passed} gates`, 'crashed');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    if (this.straight) {
      const d = Math.round(this.x * 10);
      return {
        score: d * 10,
        primary: { label: 'distance', value: d, unit: '' },
        lines: [
          { label: 'distance', value: String(d) },
          { label: 'tunnel height at the end', value: `${Math.round(this.tunnel(this.x)[1] * 100)}% of the screen` },
          { label: 'taps a second', value: this.flown > 1 ? (this.thrusts / this.flown).toFixed(1) : '–' },
        ],
        saved: d >= 3,
      };
    }
    return {
      score: this.passed * 20,
      primary: { label: 'gates', value: this.passed, unit: '' },
      lines: [
        { label: 'gates cleared', value: String(this.passed) },
        { label: 'distance', value: (this.x * 10).toFixed(0) },
        { label: 'top speed', value: `${(this.speed / 0.42).toFixed(2)}×` },
      ],
      saved: this.passed >= 1 || this.x > 1,
    };
  }
}

export const BATCH31: MiniDef[] = [
  {
    id: 'flick',
    name: 'Flick',
    skill: 'aim',
    blurb: 'A target appears anywhere. Click it, fast. Then the next.',
    how: 'Click the disc in the middle to start. Then one target at a time appears somewhere new: move to it and click, as fast as you can. Misses do not move it but count against your accuracy. Thirty targets. The results include your Fitts throughput: how much aiming you do per second, whatever the distance and size.',
    input: 'pointer',
    make: () => new Flick(14, 26),
  },
  {
    id: 'micro',
    name: 'Micro',
    skill: 'aim',
    blurb: 'Tiny targets. Precision first: every miss costs.',
    how: 'Like Flick, with targets a few pixels across. Click each exactly. Speed still counts, but a missed click costs as much as a slow one, so steady wins. Thirty targets.',
    input: 'pointer',
    make: () => new Flick(4, 8),
  },
  {
    id: 'follow',
    name: 'Follow',
    skill: 'aim',
    blurb: 'Keep the pointer on a target that wanders and speeds up.',
    how: 'Click the disc to start, then keep the pointer on it as it drifts around the board, changing direction and pace, faster as the run goes on. On a touch screen, keep your finger on it. Scored on the share of time you were on it. Thirty seconds.',
    input: 'pointer',
    make: () => new Follow(),
  },
  {
    id: 'sphere',
    name: 'Sphere',
    skill: 'aim',
    blurb: '3D: look around with the mouse and shoot the balls.',
    how: 'A room in 3D, with three balls in front of you. Click once to take the mouse (it locks to the game; Esc frees it and pauses), and again to start. Look around by moving the mouse, put the crosshair on a ball and click. Each one you hit is replaced somewhere else. Forty-five seconds. Pick a sensitivity that suits your mouse. On a touch screen, tap the balls.',
    input: 'pointer',
    lock: true,
    levels: [
      { label: 'Medium sensitivity', desc: 'About 0.13° per pixel', value: 0 },
      { label: 'Low sensitivity', desc: 'For big arm sweeps', value: 1 },
      { label: 'High sensitivity', desc: 'For small wrist flicks', value: 2 },
    ],
    make: () => new Sphere(),
  },
  {
    id: 'ship',
    name: 'Ship',
    skill: 'coordination',
    blurb: 'Hold to fly up, let go to sink. Thread the gaps.',
    how: 'A little ship flies forward on its own. Hold any key (or touch the screen) to thrust up; let go and it sinks. It has momentum, so feather it: short presses for small corrections. Fly through the gap in each wall; touching a wall, the floor or the ceiling ends it. The gaps narrow and it speeds up.',
    input: 'both',
    make: () => new Ship(),
  },
  {
    id: 'straight',
    name: 'Straight',
    skill: 'coordination',
    blurb: 'Straight-fly: hold a level line through a tight tunnel with quick taps.',
    how: 'The same ship, in a tunnel only a little taller than it is. Holding climbs and letting go sinks, both quickly, so a straight line takes fast, even taps. The tunnel runs flat, then slopes up or down, and it narrows and speeds up the further you get. Touching the tunnel ends it. Scored on distance.',
    input: 'both',
    make: () => new Ship(true),
  },
  {
    id: 'strafe',
    name: 'Strafe',
    skill: 'aim',
    blurb: '3D tracking: keep the crosshair on a ball that strafes and changes direction.',
    how: 'The Sphere room, with one ball that strafes left and right, reversing without warning and faster as it goes. Click once to take the mouse and again to start, then keep the crosshair on the ball; it turns white while you are on it. No clicking needed. Thirty seconds, scored on time on target. Pick a sensitivity that suits your mouse.',
    input: 'pointer',
    lock: true,
    levels: [
      { label: 'Medium sensitivity', desc: 'About 0.13° per pixel', value: 0 },
      { label: 'Low sensitivity', desc: 'For big arm sweeps', value: 1 },
      { label: 'High sensitivity', desc: 'For small wrist flicks', value: 2 },
    ],
    make: () => new Sphere(true),
  },
];
