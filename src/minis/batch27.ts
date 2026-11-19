// Twenty-seventh batch: eight action games, each built on its own real-world action.
//   Ruler   (reaction)  - catch a falling ruler: where you catch it gives your reaction time.
//   Bat     (timing)    - swing as the pitch reaches the plate. Fast balls, slow balls, change-ups.
//   Fly     (attention) - swat a fly that never flies straight.
//   Radar   (attention) - the sweep reveals blips: tap the hostile ones before it comes round again.
//   Stamp   (timing)    - stamp each box as it passes under the press. Not the grey ones.
//   Drive   (timing)    - a three-press golf swing: start, set the power, hit the sweet spot.
//   Flipper (reaction)  - two flippers keep the ball in play.
//   Hopper  (timing)    - hop across lanes of traffic through the gaps.

import { ANTICIPATION_MS, COL_ACCENT, COL_DIM, COL_FAINT, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALL, SND_FALSE, SND_LURCH, SND_RING, SND_TAP_L, SND_TAP_R, SND_TAP_WEAK, SND_UI } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, foreperiod, handLabel, header, mean, median, ms, scaled, sideOf, type Arena, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const TAU = Math.PI * 2;

function rnd(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo);
}

function note(v: View, a: Arena, text: string, color = COL_MID): void {
  v.ctx.fillStyle = color;
  v.text(text, a.cx, a.bottom - 14 * a.u, v.fontTiny, 'center');
}

// --- Ruler --------------------------------------------------------------------------

const G = 9.81;

class Ruler implements Mini {
  private env!: MiniEnv;
  private readonly total = scaled(12);
  private i = 0;
  private state = 0; // 0 holding, 1 falling, 2 caught / missed
  private at = 0;
  private dropAt = 0;
  private fallen = 0; // metres
  private rts: number[] = [];
  private early = 0;
  private missed = 0;
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.arm(now + 600);
  }

  private arm(now: number): void {
    this.state = 0;
    this.dropAt = now + foreperiod(1000, 1800, 4000);
    this.fallen = 0;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (this.state === 0) {
      // Grabbing at nothing counts against you; the drop still comes when it comes.
      this.early++;
      this.env.sound(SND_FALSE);
      return;
    }
    if (this.state !== 1) return;
    const t = (ts - this.dropAt) / 1000;
    if (t * 1000 < ANTICIPATION_MS) return;
    this.fallen = 0.5 * G * t * t;
    this.rts.push(t * 1000);
    this.env.sound(SND_CATCH);
    this.i++;
    this.state = 2;
    this.at = ts + 1300;
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.dropAt) this.state = 1;
    if (this.state === 1) {
      const t = (now - this.dropAt) / 1000;
      this.fallen = 0.5 * G * t * t;
      if (this.fallen > 0.3) {
        this.missed++;
        this.env.sound(SND_FALL);
        this.i++;
        this.state = 2;
        this.at = now + 1300;
      }
    } else if (this.state === 2 && now >= this.at) {
      if (this.i >= this.total) return true;
      this.arm(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'catch', `${Math.min(this.i + 1, this.total)} / ${this.total}`, 'median', ms(median(this.rts)));
    // A 30 cm ruler, scaled to the arena; your fingers are the two short lines.
    const pxPerM = (a.bottom - a.top - 60 * a.u) / 0.45;
    const fingerY = a.top + 0.08 * pxPerM + 20 * a.u;
    const top = fingerY - 0.02 * pxPerM + Math.min(this.fallen, 0.3) * pxPerM;
    const w = 46 * a.u;
    ctx.strokeStyle = COL_LINE;
    ctx.lineWidth = 1.5 * v.dpr;
    ctx.strokeRect(a.cx - w / 2, top, w, 0.3 * pxPerM);
    for (let cm = 0; cm <= 30; cm++) {
      const y = top + (cm / 100) * pxPerM;
      ctx.fillStyle = COL_MID;
      ctx.fillRect(a.cx - w / 2, y, cm % 5 === 0 ? 14 * a.u : 7 * a.u, v.dpr);
      if (cm % 5 === 0 && cm) v.text(String(cm), a.cx + 6 * a.u, y + 4 * v.dpr, v.fontTiny, 'left');
    }
    ctx.fillStyle = this.state === 2 ? COL_ACCENT : COL_DIM;
    ctx.fillRect(a.cx - w / 2 - 34 * a.u, fingerY + 0.02 * pxPerM, 26 * a.u, 3 * v.dpr);
    ctx.fillRect(a.cx + w / 2 + 8 * a.u, fingerY + 0.02 * pxPerM, 26 * a.u, 3 * v.dpr);
    if (this.state === 2) {
      const last = this.missed && this.fallen >= 0.3 ? 'dropped' : `${(this.fallen * 100).toFixed(1)} cm  ·  ${Math.round(this.rts[this.rts.length - 1] ?? 0)} ms`;
      note(v, a, last, COL_LINE);
    } else note(v, a, 'press any key to catch the ruler the moment it starts to fall');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const m = median(this.rts);
    return {
      score: this.rts.length ? Math.max(0, Math.round((420 - m) * 2.5 + this.rts.length * 5 - this.early * 15)) : 0,
      primary: { label: 'median catch time', value: m, unit: 'ms', lower: true },
      lines: [
        { label: 'as a distance', value: m ? `${(0.5 * G * (m / 1000) ** 2 * 100).toFixed(1)} cm` : '–' },
        { label: 'dropped', value: String(this.missed) },
        { label: 'grabbed too early', value: String(this.early) },
      ],
      rts: this.rts,
      saved: this.rts.length >= 4,
    };
  }
}

// --- Bat ----------------------------------------------------------------------------

class Bat implements Mini {
  private env!: MiniEnv;
  private readonly total = scaled(20);
  private i = 0;
  private state = 0; // 0 wind-up, 1 pitch, 2 result
  private at = 0;
  private t0 = 0;
  /** Time to the plate (ms) and whether it slows halfway (a change-up). */
  private flight = 700;
  private change = false;
  private swungAt = 0;
  private offs: number[] = [];
  private hits = 0;
  private outcome = '';
  private outcomeOk = true;
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.windup(now + 500);
  }

  private windup(at: number): void {
    this.state = 0;
    this.at = at + rnd(700, 1400);
    this.flight = rnd(520, 950) - Math.min(150, this.i * 6);
    this.change = this.i >= 5 && Math.random() < 0.25;
    this.swungAt = 0;
  }

  /** Where the ball is, 0 at the pitcher, 1 at the plate. */
  private pos(now: number): number {
    const t = (now - this.t0) / this.flight;
    if (!this.change) return t;
    // A change-up looks fast, then slows to 60% of its speed halfway.
    return t < 0.5 ? t : 0.5 + (t - 0.5) * 0.6;
  }

  /** When the ball actually reaches the plate. */
  private arrival(): number {
    return this.t0 + (this.change ? this.flight * (0.5 + 0.5 / 0.6) : this.flight);
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (sideOf(slot) === 0 && this.env.mode.right > 0) return;
    if (this.state !== 1 || this.swungAt) return;
    this.swungAt = ts;
    const off = ts - this.arrival();
    this.offs.push(off);
    const good = Math.abs(off) < 45;
    const ok = Math.abs(off) < 110;
    if (ok) this.hits++;
    this.outcome = good ? 'clean hit' : ok ? (off < 0 ? 'early, pulled it' : 'late, fouled it') : off < 0 ? 'way early: strike' : 'way late: strike';
    this.outcomeOk = ok;
    this.env.sound(good ? SND_CATCH : ok ? SND_TAP_WEAK : SND_FALSE);
    this.state = 2;
    this.at = ts + 1100;
    this.i++;
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.at) {
      this.state = 1;
      this.t0 = now;
    } else if (this.state === 1 && now > this.arrival() + 200) {
      this.outcome = 'no swing: strike';
      this.outcomeOk = false;
      this.offs.push(300);
      this.env.sound(SND_LURCH);
      this.state = 2;
      this.at = now + 1100;
      this.i++;
    } else if (this.state === 2 && now >= this.at) {
      if (this.i >= this.total) return true;
      this.windup(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'hits', `${this.hits} of ${this.i}`, 'pitch', `${Math.min(this.i + 1, this.total)} / ${this.total}`);
    const w = Math.min(a.right - a.left, 640 * a.u);
    const x0 = a.cx + w / 2 - 40 * a.u; // pitcher, right
    const plate = a.cx - w / 2 + 70 * a.u;
    const y = a.cy + 20 * a.u;
    ctx.fillStyle = COL_DIM;
    ctx.fillRect(plate - 2 * v.dpr, y - 50 * a.u, 4 * v.dpr, 100 * a.u);
    ctx.fillStyle = COL_FAINT;
    ctx.fillRect(plate, y + 30 * a.u, x0 - plate, v.dpr);
    ctx.fillStyle = COL_MID;
    ctx.beginPath();
    ctx.arc(x0, y - 20 * a.u, 10 * a.u, 0, TAU);
    ctx.fill();
    // The bat: swings round when you press.
    const swing = this.swungAt ? Math.min(1, (now - this.swungAt) / 120) : 0;
    ctx.save();
    ctx.translate(plate - 20 * a.u, y);
    ctx.rotate(-1.2 + swing * 2.2);
    ctx.fillStyle = COL_LINE;
    ctx.fillRect(0, -3 * v.dpr, 70 * a.u, 6 * v.dpr);
    ctx.restore();
    if (this.state >= 1) {
      const p = this.state === 1 ? this.pos(now) : 1;
      const bx = x0 + (plate - x0) * Math.min(1.1, p);
      ctx.fillStyle = this.state === 2 && this.outcomeOk ? COL_LINE : COL_ACCENT;
      ctx.beginPath();
      ctx.arc(bx, y, 7 * a.u, 0, TAU);
      ctx.fill();
    }
    if (this.state === 2) note(v, a, this.outcome, this.outcomeOk ? COL_MID : COL_ACCENT);
    else note(v, a, 'press as the ball reaches the plate. some pitches slow down halfway');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const swung = this.offs.filter((o) => o < 300);
    return {
      score: this.hits * 30 + Math.max(0, Math.round(100 - median(swung.map(Math.abs)))),
      primary: { label: 'hits', value: this.hits, unit: '' },
      lines: [
        { label: 'typical timing of swings', value: swung.length ? `${Math.round(Math.abs(mean(swung)))} ms ${mean(swung) >= 0 ? 'late' : 'early'}` : '–' },
        { label: 'median miss of the moment', value: ms(median(swung.map(Math.abs))) },
      ],
      saved: this.i >= 5,
    };
  }
}

// --- Fly ----------------------------------------------------------------------------

class Fly implements Mini {
  private env!: MiniEnv;
  private readonly length = scaled(45000);
  private t0 = 0;
  private last = 0;
  private x = 0.5;
  private y = 0.5;
  private vx = 0.2;
  private vy = 0;
  private speed = 0.35;
  private swats = 0;
  private misses = 0;
  private times: number[] = [];
  private bornAt = 0;
  private geo = { x0: 0, y0: 0, w: 1, h: 1 };
  private splat: [number, number, number] = [0, 0, -1e9];

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.t0 = now + 600;
    this.last = now;
    this.bornAt = now + 600;
  }

  press(): void {}

  pointer(x: number, y: number, ts: number): void {
    if (ts < this.t0) return;
    const g = this.geo;
    const fx = g.x0 + this.x * g.w;
    const fy = g.y0 + this.y * g.h;
    if (Math.hypot(x - fx, y - fy) < 26 * (g.w / 640)) {
      this.swats++;
      this.times.push(ts - this.bornAt);
      this.splat = [fx, fy, ts];
      this.env.sound(SND_CATCH);
      this.x = Math.random();
      this.y = Math.random();
      this.speed = Math.min(0.9, this.speed + 0.04);
      this.bornAt = ts;
    } else {
      this.misses++;
      this.env.sound(SND_TAP_WEAK);
    }
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const el = now - this.t0;
    if (el > this.length) return true;
    if (el > 0) {
      // Darting: a random turn now and then, with bursts of speed.
      if (Math.random() < dt * 3) {
        const ang = rnd(0, TAU);
        const s = this.speed * (Math.random() < 0.3 ? 2.2 : 1);
        this.vx = Math.cos(ang) * s;
        this.vy = Math.sin(ang) * s;
      }
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (this.x < 0.03 || this.x > 0.97) this.vx = -this.vx;
      if (this.y < 0.03 || this.y > 0.97) this.vy = -this.vy;
      this.x = Math.min(0.97, Math.max(0.03, this.x));
      this.y = Math.min(0.97, Math.max(0.03, this.y));
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'swats', String(this.swats), 'time', `${Math.max(0, Math.ceil((this.length - Math.max(0, el)) / 1000))} s`);
    const w = Math.min(a.right - a.left, 700 * a.u);
    const h = a.bottom - a.top - 30 * a.u;
    this.geo = { x0: a.cx - w / 2, y0: a.top + 10 * a.u, w, h };
    ctx.strokeStyle = COL_FAINT;
    ctx.lineWidth = v.dpr;
    ctx.strokeRect(this.geo.x0, this.geo.y0, w, h);
    if (now - this.splat[2] < 400) {
      ctx.strokeStyle = COL_MID;
      ctx.beginPath();
      ctx.arc(this.splat[0], this.splat[1], 16 * a.u * (1 + (now - this.splat[2]) / 400), 0, TAU);
      ctx.stroke();
    }
    const fx = this.geo.x0 + this.x * w;
    const fy = this.geo.y0 + this.y * h;
    // Body and two buzzing wings.
    ctx.fillStyle = COL_LINE;
    ctx.beginPath();
    ctx.arc(fx, fy, 6 * a.u, 0, TAU);
    ctx.fill();
    const flap = Math.sin(now / 18) * 4 * a.u;
    ctx.strokeStyle = COL_MID;
    ctx.beginPath();
    ctx.ellipse(fx - 6 * a.u, fy - 5 * a.u, 7 * a.u, 3 * a.u + Math.abs(flap) * 0.3, -0.5, 0, TAU);
    ctx.ellipse(fx + 6 * a.u, fy - 5 * a.u, 7 * a.u, 3 * a.u + Math.abs(flap) * 0.3, 0.5, 0, TAU);
    ctx.stroke();
    if (el < 2500) note(v, a, 'click or tap the fly to swat it. it never flies straight');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: Math.max(0, this.swats * 25 - this.misses * 3),
      primary: { label: 'flies swatted', value: this.swats, unit: '' },
      lines: [
        { label: 'median time per fly', value: ms(median(this.times)) },
        { label: 'missed swipes', value: String(this.misses) },
      ],
      rts: this.times, saved: this.swats + this.misses >= 5,
    };
  }
}

// --- Radar --------------------------------------------------------------------------

class Radar implements Mini {
  private env!: MiniEnv;
  private readonly length = scaled(60000);
  private t0 = 0;
  private sweep = 0;
  private last = 0;
  private blips: { ang: number; r: number; hostile: boolean; seenAt: number; born: number; done: boolean }[] = [];
  private caught = 0;
  private escaped = 0;
  private wrong = 0;
  private times: number[] = [];
  private geo = { cx: 0, cy: 0, R: 1 };

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.t0 = now + 800;
    this.last = now;
  }

  press(): void {}

  pointer(x: number, y: number, ts: number): void {
    const g = this.geo;
    let best: (typeof this.blips)[number] | null = null;
    let bd = 30 * (g.R / 200);
    for (const b of this.blips) {
      if (b.done || !b.seenAt) continue;
      const d = Math.hypot(g.cx + Math.cos(b.ang) * b.r * g.R - x, g.cy + Math.sin(b.ang) * b.r * g.R - y);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    if (!best) return;
    best.done = true;
    if (best.hostile) {
      this.caught++;
      this.times.push(ts - best.seenAt);
      this.env.sound(SND_CATCH);
    } else {
      this.wrong++;
      this.env.sound(SND_FALSE);
    }
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const el = now - this.t0;
    if (el > this.length) return true;
    if (el > 0) {
      const prev = this.sweep;
      this.sweep = (this.sweep + dt * TAU * 0.5) % TAU; // one turn every 2 s
      // New contacts appear now and then; the sweep reveals them when it passes.
      if (Math.random() < dt * (0.8 + el / 60000)) this.blips.push({ ang: rnd(0, TAU), r: rnd(0.2, 0.95), hostile: Math.random() < 0.4, seenAt: 0, born: now, done: false });
      for (const b of this.blips) {
        const crossed = prev <= this.sweep ? b.ang > prev && b.ang <= this.sweep : b.ang > prev || b.ang <= this.sweep;
        if (crossed && !b.done) {
          if (b.seenAt && b.hostile) {
            // Seen once already and still there: it got through.
            b.done = true;
            this.escaped++;
            this.env.sound(SND_LURCH);
          } else if (!b.seenAt) b.seenAt = now;
          else b.done = true;
        }
      }
      this.blips = this.blips.filter((b) => !b.done || now - b.born < 4000);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'caught', String(this.caught), 'time', `${Math.max(0, Math.ceil((this.length - Math.max(0, el)) / 1000))} s`);
    const R = Math.min(a.right - a.left, a.bottom - a.top - 30 * a.u) / 2;
    this.geo = { cx: a.cx, cy: a.cy - 6 * a.u, R };
    const g = this.geo;
    ctx.strokeStyle = COL_FAINT;
    ctx.lineWidth = v.dpr;
    for (const k of [0.33, 0.66, 1]) {
      ctx.beginPath();
      ctx.arc(g.cx, g.cy, R * k, 0, TAU);
      ctx.stroke();
    }
    // The sweep and its fading wake.
    for (let k = 0; k < 12; k++) {
      ctx.strokeStyle = `rgba(236,236,238,${0.25 * (1 - k / 12)})`;
      ctx.beginPath();
      ctx.moveTo(g.cx, g.cy);
      const ang = this.sweep - k * 0.04;
      ctx.lineTo(g.cx + Math.cos(ang) * R, g.cy + Math.sin(ang) * R);
      ctx.stroke();
    }
    for (const b of this.blips) {
      if (!b.seenAt || b.done) continue;
      // Each contact fades through the turn after the sweep finds it.
      const age = (now - b.seenAt) / 2000;
      if (age > 1) continue;
      const x = g.cx + Math.cos(b.ang) * b.r * R;
      const y = g.cy + Math.sin(b.ang) * b.r * R;
      ctx.globalAlpha = 1 - age * 0.7;
      if (b.hostile) {
        ctx.fillStyle = COL_ACCENT;
        ctx.beginPath();
        ctx.moveTo(x, y - 8 * a.u);
        ctx.lineTo(x + 7 * a.u, y + 6 * a.u);
        ctx.lineTo(x - 7 * a.u, y + 6 * a.u);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillStyle = COL_MID;
        ctx.beginPath();
        ctx.arc(x, y, 5 * a.u, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    if (el < 4000) note(v, a, 'tap the orange triangles before the sweep comes round to them again. leave the grey dots');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: Math.max(0, this.caught * 20 - this.escaped * 15 - this.wrong * 10),
      primary: { label: 'hostiles caught', value: this.caught, unit: '' },
      lines: [
        { label: 'got through', value: String(this.escaped) },
        { label: 'friendlies tapped', value: String(this.wrong) },
        { label: 'median time to tap', value: ms(median(this.times)) },
      ],
      rts: this.times, saved: this.caught + this.escaped >= 4,
    };
  }
}

// --- Stamp --------------------------------------------------------------------------

class Stamp implements Mini {
  private env!: MiniEnv;
  private readonly total = scaled(30);
  private boxes: { x: number; speed: number; grey: boolean; done: boolean; off: number }[] = [];
  private spawned = 0;
  private nextAt = 0;
  private last = 0;
  private stampAt = -1e9;
  private offs: number[] = [];
  private greyHit = 0;
  private missed = 0;
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.last = now;
    this.nextAt = now + 800;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    this.stampAt = ts;
    // The box nearest the press, if it is close enough to touch.
    let best: (typeof this.boxes)[number] | null = null;
    for (const b of this.boxes) if (!b.done && Math.abs(b.x - 0.5) < 0.09 && (!best || Math.abs(b.x - 0.5) < Math.abs(best.x - 0.5))) best = b;
    if (!best) {
      this.env.sound(SND_TAP_WEAK);
      return;
    }
    best.done = true;
    if (best.grey) {
      this.greyHit++;
      this.env.sound(SND_FALSE);
      return;
    }
    // How far off centre, as time: distance over its speed.
    best.off = ((best.x - 0.5) / best.speed) * 1000;
    this.offs.push(best.off);
    this.env.sound(Math.abs(best.off) < 30 ? SND_CATCH : SND_UI);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.spawned < this.total && now >= this.nextAt) {
      this.spawned++;
      this.boxes.push({ x: -0.05, speed: rnd(0.25, 0.45) + Math.min(0.25, this.spawned * 0.008), grey: this.spawned > 4 && Math.random() < 0.2, done: false, off: 0 });
      this.nextAt = now + rnd(900, 1700);
    }
    for (const b of this.boxes) {
      b.x += b.speed * dt;
      if (!b.done && !b.grey && b.x > 0.6) {
        b.done = true;
        this.missed++;
        this.env.sound(SND_LURCH);
      }
    }
    this.boxes = this.boxes.filter((b) => b.x < 1.1);
    if (this.spawned >= this.total && this.boxes.length === 0) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'stamped', String(this.offs.length), 'box', `${Math.min(this.spawned, this.total)} / ${this.total}`);
    const w = Math.min(a.right - a.left, 700 * a.u);
    const X = (p: number) => a.cx - w / 2 + p * w;
    const belt = a.cy + 40 * a.u;
    ctx.fillStyle = COL_DIM;
    ctx.fillRect(X(0), belt, w, 2 * v.dpr);
    // The press, coming down when you press.
    const down = Math.max(0, 1 - (now - this.stampAt) / 140);
    ctx.fillStyle = COL_LINE;
    ctx.fillRect(X(0.5) - 24 * a.u, a.top + 20 * a.u, 48 * a.u, 30 * a.u + down * (belt - a.top - 100 * a.u));
    ctx.fillStyle = COL_FAINT;
    ctx.fillRect(X(0.5) - v.dpr / 2, belt + 4 * v.dpr, v.dpr, 30 * a.u);
    for (const b of this.boxes) {
      const bx = X(b.x);
      ctx.strokeStyle = b.grey ? COL_DIM : COL_LINE;
      ctx.lineWidth = 1.5 * v.dpr;
      ctx.strokeRect(bx - 20 * a.u, belt - 40 * a.u, 40 * a.u, 40 * a.u);
      if (b.done && !b.grey && b.off !== 0) {
        ctx.fillStyle = Math.abs(b.off) < 30 ? COL_ACCENT : COL_MID;
        ctx.fillRect(bx - 10 * a.u, belt - 26 * a.u, 20 * a.u, 12 * a.u);
      }
    }
    note(v, a, 'press any key to stamp each white box as its middle passes the mark. leave the grey ones');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const abs = this.offs.map(Math.abs);
    return {
      score: Math.max(0, Math.round(this.offs.length * 15 + (80 - median(abs)) * 2 - this.greyHit * 20 - this.missed * 10)),
      primary: { label: 'median miss of the centre', value: median(abs), unit: 'ms', lower: true, zeroOk: true },
      lines: [
        { label: 'stamped', value: String(this.offs.length) },
        { label: 'missed', value: String(this.missed) },
        { label: 'grey boxes stamped', value: String(this.greyHit) },
      ],
      saved: this.offs.length >= 5,
    };
  }
}

// --- Drive --------------------------------------------------------------------------

class Drive implements Mini {
  private env!: MiniEnv;
  private readonly total = scaled(10);
  private i = 0;
  private state = 0; // 0 ready, 1 power rising, 2 accuracy returning, 3 result
  private t = 0;
  private power = 0;
  private acc = 0;
  private target = 0.7;
  private at = 0;
  private last = 0;
  private shots: { p: number; a: number }[] = [];
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.last = now;
    this.target = rnd(0.45, 0.9);
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (this.state === 0) {
      this.state = 1;
      this.t = 0;
      this.env.sound(SND_UI);
    } else if (this.state === 1) {
      this.power = this.t;
      this.state = 2;
      this.env.sound(SND_TAP_L);
    } else if (this.state === 2) {
      this.acc = this.t;
      this.finish(ts);
    }
  }

  private finish(ts: number): void {
    const pErr = Math.abs(this.power - this.target);
    const aErr = Math.abs(this.acc);
    this.shots.push({ p: pErr, a: aErr });
    this.env.sound(pErr < 0.04 && aErr < 0.04 ? SND_CATCH : SND_TAP_R);
    this.i++;
    this.state = 3;
    this.at = ts + 1500;
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const speed = 0.9 + Math.min(0.6, this.i * 0.06);
    if (this.state === 1) {
      this.t += dt * speed;
      if (this.t >= 1) {
        this.power = 1;
        this.t = 1;
        this.state = 2;
      }
    } else if (this.state === 2) {
      // The marker runs back to the sweet spot at 0 and past it.
      this.t -= dt * speed * 1.4;
      if (this.t < -0.25) {
        this.acc = -0.25;
        this.finish(now);
      }
    } else if (this.state === 3 && now >= this.at) {
      if (this.i >= this.total) return true;
      this.state = 0;
      this.target = rnd(0.45, 0.9);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'shot', `${Math.min(this.i + 1, this.total)} / ${this.total}`, 'avg miss', this.shots.length ? `${Math.round(mean(this.shots.map((s) => s.p + s.a)) * 100)}` : '–');
    const w = Math.min(a.right - a.left - 40 * a.u, 600 * a.u);
    const x0 = a.cx - w / 2;
    // The meter runs from -0.25 (the hook side) through 0 (sweet spot) to 1 (full power).
    const X = (p: number) => x0 + ((p + 0.25) / 1.25) * w;
    const y = a.cy;
    ctx.strokeStyle = COL_DIM;
    ctx.lineWidth = v.dpr;
    ctx.strokeRect(x0, y - 14 * a.u, w, 28 * a.u);
    ctx.fillStyle = COL_FAINT;
    ctx.fillRect(X(-0.03), y - 14 * a.u, X(0.03) - X(-0.03), 28 * a.u);
    ctx.fillStyle = COL_LINE;
    ctx.fillRect(X(0) - v.dpr, y - 20 * a.u, 2 * v.dpr, 40 * a.u);
    // The power target for this shot.
    ctx.fillStyle = COL_ACCENT;
    ctx.fillRect(X(this.target) - 2 * v.dpr, y - 24 * a.u, 4 * v.dpr, 48 * a.u);
    if (this.state >= 1) {
      if (this.state >= 2) {
        ctx.fillStyle = COL_MID;
        ctx.fillRect(X(this.power) - v.dpr, y - 14 * a.u, 2 * v.dpr, 28 * a.u);
      }
      const m = this.state === 3 ? this.acc : this.t;
      ctx.fillStyle = COL_LINE;
      ctx.beginPath();
      ctx.moveTo(X(m), y - 18 * a.u);
      ctx.lineTo(X(m) - 6 * a.u, y - 30 * a.u);
      ctx.lineTo(X(m) + 6 * a.u, y - 30 * a.u);
      ctx.closePath();
      ctx.fill();
    }
    const msg =
      this.state === 0
        ? 'press to start the swing'
        : this.state === 1
          ? 'press again on the orange mark: that is the power this hole needs'
          : this.state === 2
            ? 'and once more as it comes back to the white line: the sweet spot'
            : `power ${Math.round(this.shots[this.shots.length - 1]!.p * 100)} off  ·  contact ${Math.round(this.shots[this.shots.length - 1]!.a * 100)} off`;
    note(v, a, msg, this.state === 3 ? COL_LINE : COL_MID);
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const m = mean(this.shots.map((s) => s.p + s.a));
    return {
      score: this.shots.length ? Math.max(0, Math.round((0.4 - m) * 1500)) : 0,
      primary: { label: 'average miss (power + contact)', value: Math.round(m * 1000) / 10, unit: '%', lower: true, decimals: 1, zeroOk: true },
      lines: [
        { label: 'power miss', value: `${(mean(this.shots.map((s) => s.p)) * 100).toFixed(1)}%` },
        { label: 'contact miss', value: `${(mean(this.shots.map((s) => s.a)) * 100).toFixed(1)}%` },
      ],
      saved: this.shots.length >= 3,
    };
  }
}

// --- Flipper ------------------------------------------------------------------------

class Flipper implements Mini {
  private env!: MiniEnv;
  private bx = 0.5;
  private by = 0.2;
  private vx = 0.2;
  private vy = 0;
  private last = 0;
  private started = false;
  private over = false;
  private overAt = 0;
  private lives = 3;
  private flips = 0;
  private flipAt: [number, number] = [-1e9, -1e9];
  private time = 0;
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.last = now;
    this.serve();
  }

  private serve(): void {
    this.bx = rnd(0.3, 0.7);
    this.by = 0.12;
    this.vx = rnd(-0.25, 0.25);
    this.vy = 0;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (s === 0) return;
    this.started = true;
    this.flipAt[s < 0 ? 0 : 1] = ts;
    this.env.sound(s < 0 ? SND_TAP_L : SND_TAP_R);
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
      const g = 1.1 + Math.min(0.8, this.time * 0.01);
      this.vy += g * dt;
      this.bx += this.vx * dt;
      this.by += this.vy * dt;
      if (this.bx < 0.03 || this.bx > 0.97) {
        this.vx = -this.vx * 0.9;
        this.bx = Math.min(0.97, Math.max(0.03, this.bx));
      }
      if (this.by < 0.03) {
        this.vy = Math.abs(this.vy) * 0.8;
        this.by = 0.03;
      }
      // Flippers: left covers x 0.08-0.45, right 0.55-0.92, at y 0.86. A flip within
      // 150 ms of the ball arriving there sends it back up, angled by where it hit.
      if (this.vy > 0 && this.by > 0.82 && this.by < 0.92) {
        for (const side of [0, 1]) {
          const lo = side ? 0.55 : 0.08;
          const hi = side ? 0.92 : 0.45;
          if (this.bx >= lo && this.bx <= hi && now - this.flipAt[side]! < 150) {
            const along = side ? (this.bx - lo) / (hi - lo) : 1 - (this.bx - lo) / (hi - lo);
            this.vy = -rnd(1.1, 1.4) - Math.min(0.4, this.time * 0.004);
            this.vx = (side ? -1 : 1) * (0.15 + along * 0.5) * (Math.random() < 0.25 ? -1 : 1);
            this.by = 0.82;
            this.flips++;
            this.flipAt[side] = -1e9;
            this.env.sound(SND_RING + Math.min(4, Math.floor(this.flips / 8)));
          }
        }
      }
      if (this.by > 1.02) {
        this.lives--;
        this.env.sound(this.lives > 0 ? SND_LURCH : SND_FALL);
        if (this.lives <= 0) {
          this.over = true;
          this.overAt = now + 1300;
        } else this.serve();
      }
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'returns', String(this.flips), 'time', `${this.time.toFixed(0)} s`, this.lives);
    const w = Math.min(a.right - a.left, 460 * a.u);
    const h = a.bottom - a.top - 20 * a.u;
    const X = (p: number) => a.cx - w / 2 + p * w;
    const Y = (p: number) => a.top + 10 * a.u + p * h;
    ctx.strokeStyle = COL_DIM;
    ctx.lineWidth = v.dpr;
    ctx.beginPath();
    ctx.moveTo(X(0), Y(1));
    ctx.lineTo(X(0), Y(0));
    ctx.lineTo(X(1), Y(0));
    ctx.lineTo(X(1), Y(1));
    ctx.stroke();
    // Flippers: up while just flipped.
    for (const side of [0, 1]) {
      const up = now - this.flipAt[side]! < 150 ? 1 : 0;
      const pivot = side ? X(0.92) : X(0.08);
      const tip = side ? X(0.55) : X(0.45);
      ctx.strokeStyle = up ? COL_ACCENT : COL_LINE;
      ctx.lineWidth = 4 * v.dpr;
      ctx.beginPath();
      ctx.moveTo(pivot, Y(0.84));
      ctx.lineTo(tip, Y(up ? 0.8 : 0.9));
      ctx.stroke();
    }
    ctx.fillStyle = COL_LINE;
    ctx.beginPath();
    ctx.arc(X(this.bx), Y(this.by), 8 * a.u, 0, TAU);
    ctx.fill();
    ctx.fillStyle = COL_MID;
    v.text(handLabel(this.env, -1), X(0.2), Y(0.97), v.fontTiny, 'center');
    v.text(handLabel(this.env, 1), X(0.8), Y(0.97), v.fontTiny, 'center');
    if (!this.started) note(v, a, 'flip with the hand on the side the ball comes down. press to start', COL_MID);
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.flips * 15,
      primary: { label: 'returns', value: this.flips, unit: '' },
      lines: [{ label: 'kept it up for', value: `${this.time.toFixed(0)} s` }],
      saved: this.started && this.time > 5,
    };
  }
}

// --- Hopper -------------------------------------------------------------------------

class Hopper implements Mini {
  private env!: MiniEnv;
  private lanes: { dir: number; speed: number; cars: number[]; len: number }[] = [];
  private row = 0;
  private x = 0.5;
  private last = 0;
  private lives = 3;
  private crossings = 0;
  private hops = 0;
  private over = false;
  private overAt = 0;
  private hitAt = -1e9;
  private time = 0;
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.last = now;
    this.build();
  }

  private build(): void {
    const n = 5;
    this.lanes = [];
    for (let k = 0; k < n; k++) {
      const len = rnd(0.08, 0.16);
      const gap = rnd(0.22, 0.4) - Math.min(0.1, this.crossings * 0.015);
      const cars: number[] = [];
      for (let x = rnd(0, 0.3); x < 1.2; x += len + gap + rnd(0, 0.15)) cars.push(x);
      this.lanes.push({ dir: k % 2 ? -1 : 1, speed: rnd(0.12, 0.25) + this.crossings * 0.02, cars, len });
    }
    this.row = 0;
  }

  press(slot: number): void {
    this.held |= 1 << slot;
    if (this.over || sideOf(slot) === 0) return;
    this.row++;
    this.hops++;
    this.env.sound(SND_TAP_WEAK);
    if (this.row > this.lanes.length) {
      this.crossings++;
      this.env.sound(SND_CATCH);
      this.build();
    }
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
      for (const l of this.lanes) {
        l.cars = l.cars.map((c) => {
          let x = c + l.dir * l.speed * dt;
          if (x > 1.2) x -= 1.4;
          if (x < -0.2) x += 1.4;
          return x;
        });
      }
      // Hit if a car in your lane overlaps you.
      if (this.row >= 1 && this.row <= this.lanes.length && now - this.hitAt > 1000) {
        const l = this.lanes[this.row - 1]!;
        if (l.cars.some((c) => this.x > c - 0.025 && this.x < c + l.len + 0.025)) {
          this.hitAt = now;
          this.lives--;
          this.env.sound(this.lives > 0 ? SND_LURCH : SND_FALL);
          this.row = 0;
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
    header(v, touch, 'crossings', String(this.crossings), 'time', `${this.time.toFixed(0)} s`, this.lives);
    const w = Math.min(a.right - a.left, 620 * a.u);
    const n = this.lanes.length;
    const lh = (a.bottom - a.top - 50 * a.u) / (n + 2);
    const Y = (r: number) => a.bottom - 30 * a.u - (r + 0.5) * lh;
    const X = (p: number) => a.cx - w / 2 + p * w;
    ctx.save();
    ctx.beginPath();
    ctx.rect(X(0), a.top, w, a.bottom - a.top);
    ctx.clip();
    for (let k = 0; k < n; k++) {
      const l = this.lanes[k]!;
      const y = Y(k + 1);
      ctx.fillStyle = COL_FAINT;
      ctx.fillRect(X(0), y + lh / 2, w, v.dpr);
      ctx.fillStyle = COL_MID;
      for (const c of l.cars) ctx.fillRect(X(c), y - lh * 0.3, l.len * w, lh * 0.6);
    }
    ctx.restore();
    ctx.fillStyle = COL_DIM;
    ctx.fillRect(X(0), Y(0) + lh / 2, w, v.dpr);
    ctx.fillRect(X(0), Y(n + 1) + lh / 2, w, v.dpr);
    const blink = now - this.hitAt < 1000 && Math.floor(now / 100) % 2 === 0;
    if (!blink) {
      ctx.fillStyle = COL_ACCENT;
      ctx.beginPath();
      ctx.arc(X(this.x), Y(this.row), lh * 0.28, 0, TAU);
      ctx.fill();
    }
    if (this.crossings === 0 && this.hops < 2) note(v, a, 'press either hand to hop one lane forward. wait for a gap', COL_MID);
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.crossings * 60 + this.hops,
      primary: { label: 'crossings', value: this.crossings, unit: '' },
      lines: [
        { label: 'hops', value: String(this.hops) },
        { label: 'lasted', value: `${this.time.toFixed(0)} s` },
      ],
      saved: this.time > 5 && this.hops > 3,
    };
  }
}

export const BATCH27: MiniDef[] = [
  { id: 'ruler', name: 'Ruler', skill: 'reaction', blurb: 'Catch a falling ruler. Where you catch it gives your reaction time.', how: 'A ruler hangs between your fingers. At a random moment it drops: press any key to catch it. How far it fell becomes your reaction time, the classic way. Grabbing before it moves counts as too early.', input: 'both', make: () => new Ruler() },
  { id: 'bat', name: 'Bat', skill: 'timing', blurb: 'Swing as the pitch reaches the plate. Fast balls, slow balls, change-ups.', how: 'The pitcher on the right throws. Press to swing as the ball reaches the plate on the left. Pitches vary in speed, and some are change-ups that slow down halfway. Within 45 ms is a clean hit; within 110 ms you still make contact.', input: 'both', make: () => new Bat() },
  { id: 'fly', name: 'Fly', skill: 'attention', blurb: 'Swat a fly that never flies straight.', how: 'A fly darts around the board, changing direction and speed without warning. Click or tap it to swat it. Each one is a little faster. Forty-five seconds.', input: 'pointer', make: () => new Fly() },
  { id: 'radar', name: 'Radar', skill: 'attention', blurb: 'The sweep reveals contacts. Tap the hostile ones before it comes round again.', how: 'A radar sweep turns once every two seconds. Contacts appear as it passes them and fade. Tap the orange triangles before the sweep reaches them again, or they get through. Leave the grey dots alone. One minute.', input: 'pointer', make: () => new Radar() },
  { id: 'stamp', name: 'Stamp', skill: 'timing', blurb: 'Stamp each box as it passes under the press. Not the grey ones.', how: 'Boxes ride a conveyor at different speeds. Press any key to stamp a white box as its middle passes the mark under the press. Grey boxes must not be stamped. Scored on how close to the middle you land.', input: 'both', make: () => new Stamp() },
  { id: 'drive', name: 'Drive', skill: 'timing', blurb: 'A three-press golf swing: start, set the power, hit the sweet spot.', how: 'Press to start the swing; a marker runs up the meter. Press again exactly on the orange mark, the power this hole needs. The marker then runs back: press a third time as it crosses the white line, the sweet spot. Both misses add up. It speeds up as you go.', input: 'both', make: () => new Drive() },
  { id: 'flipper', name: 'Flipper', skill: 'reaction', blurb: 'Two flippers keep the ball in play.', how: 'The ball falls. Flip with the hand on the side it comes down, just as it reaches the flipper; where it hits sets the angle back up. Miss and it drains. Gravity grows over time; three balls.', input: 'keys', minKeys: 2, make: () => new Flipper() },
  { id: 'hopper', name: 'Hopper', skill: 'timing', blurb: 'Hop across lanes of traffic through the gaps.', how: 'Each press (either hand) hops you one lane forward. Lanes of traffic move both ways at their own speeds: hop when there is a gap coming. Reach the far side and a busier road appears. Three lives.', input: 'keys', minKeys: 2, make: () => new Hopper() },
];
