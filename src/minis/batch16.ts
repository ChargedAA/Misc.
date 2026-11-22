// Sixteenth batch: things you steer, with the skill underneath.
//   Swerve (reaction)     - drive a car up a road; hazards pop up in your path. Steer clear.
//   Catch  (reaction)     - slide a basket; catch the white drops, dodge the grey.
//   Sort   (attention)    - flip the switch to send each item down the right chute. The rule changes.
//   Shield (reaction)     - spin a shield round a core to block attacks from any side.
//   Dock   (coordination) - thrust a drifting ship into a dock and stop dead inside it.

import { COL_ACCENT, COL_DIM, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALL, SND_FALSE, SND_LURCH, SND_TAP_L, SND_TAP_R, SND_TONE } from '../audio.ts';
import { SHAPE_CIRCLE, SHAPE_SQUARE, type View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { TONE, car } from './sprites.ts';
import { arena, clamp, footer, handLabel, header, median, message, ms, pct, sideOf, type Mini, type MiniDef, type MiniEnv, type MiniResult, scaled } from './kit.ts';

const TAU = Math.PI * 2;
const GREY = '#6c6c74';

/** -1, 0 or +1: which way the held keys steer (left hand left, right hand right). */
function steerOf(held: number): number {
  const l = (held & 0b111) !== 0 ? 1 : 0;
  const r = (held & 0b111000) !== 0 ? 1 : 0;
  return r - l;
}

/** Common bits for the steering games: held keys, lives, an end screen, a clock. */
abstract class Steer implements Mini {
  protected env!: MiniEnv;
  protected held = 0;
  protected last = 0;
  protected t0 = 0;
  protected time = 0;
  protected lives = 3;
  protected over = false;
  protected overAt = 0;
  protected hitFlash = 0;
  protected started = false;
  protected rts: number[] = [];

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.last = now;
    this.t0 = now;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    this.started = true;
    this.onPress(sideOf(slot), ts);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  protected onPress(_side: number, _ts: number): void {}

  protected lose(now: number): void {
    this.lives--;
    this.hitFlash = now;
    this.env.sound(SND_LURCH);
    if (this.lives <= 0) {
      this.over = true;
      this.overAt = now + 1400;
      this.env.sound(SND_FALL);
    }
  }

  /** Advance the clock; false once the end screen has been shown long enough. */
  protected tick(now: number): number {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.over && this.started) this.time += dt;
    return dt;
  }

  abstract frame(now: number, v: View, touch: TouchLayout): boolean;
  abstract result(): MiniResult;
}

// --- Swerve -----------------------------------------------------------------------

interface Hazard {
  x: number;
  w: number;
  at: number;
  hitAt: number;
  firstMove: number;
  done: boolean;
}

class Swerve extends Steer {
  private x = 0;
  private hz: Hazard | null = null;
  private nextAt = 0;
  private cleared = 0;
  private scroll = 0;

  override start(env: MiniEnv, now: number): void {
    super.start(env, now);
    this.nextAt = now + 1500;
  }

  private windowMs(): number {
    return Math.max(180, 950 - this.cleared * 12);
  }

  protected override onPress(side: number, ts: number): void {
    const h = this.hz;
    if (h && !h.done && !h.firstMove && side !== 0 && ts >= h.at) h.firstMove = ts;
    this.env.sound(side > 0 ? SND_TAP_R : SND_TAP_L);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const dt = this.tick(now);
    if (this.over && now >= this.overAt) return true;
    if (!this.over) {
      this.started = true;
      this.x = clamp(this.x + steerOf(this.held) * 1.7 * dt, -1, 1);
      this.scroll += dt * 1.2;
      if (!this.hz && now >= this.nextAt) {
        // Pop up right where the car is heading, so it has to move.
        const w = 0.35 + Math.random() * 0.25;
        const x = clamp(this.x + (Math.random() - 0.5) * 0.2, -1 + w / 2, 1 - w / 2);
        const W = this.windowMs();
        this.hz = { x, w, at: now, hitAt: now + W, firstMove: 0, done: false };
      }
      const h = this.hz;
      if (h && !h.done && now >= h.hitAt) {
        h.done = true;
        const carHalf = 0.06;
        if (Math.abs(this.x - h.x) < h.w / 2 + carHalf) this.lose(now);
        else {
          this.cleared++;
          if (h.firstMove) this.rts.push(h.firstMove - h.at);
          this.env.sound(SND_CATCH);
        }
        this.nextAt = now + 300 + Math.random() * 700;
      }
      if (h && h.done && now > h.hitAt + 300) this.hz = null;
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'cleared', String(this.cleared), 'window', ms(this.windowMs()), this.lives);
    const half = Math.min((a.right - a.left) / 2 - 20 * a.u, 260 * a.u);
    const H = a.bottom - a.top;
    const carY = a.top + H * 0.84;
    const toX = (x: number) => a.cx + x * half;
    ctx.fillStyle = COL_MID;
    ctx.fillRect(toX(-1.06), a.top, dpr, H);
    ctx.fillRect(toX(1.06), a.top, dpr, H);
    // Centre dashes scroll to show speed.
    ctx.fillStyle = COL_DIM;
    for (let k = -1; k < 12; k++) {
      const y = a.top + ((k + (this.scroll % 1)) / 10) * H;
      ctx.fillRect(a.cx - dpr / 2, y, dpr, H / 25);
    }
    const h = this.hz;
    if (h) {
      const speed = (carY - a.top) / 1.1; // px per second, to land on the car at hitAt
      const y = carY - ((h.hitAt - now) / 1000) * speed;
      ctx.fillStyle = h.done && Math.abs(this.x - h.x) < h.w / 2 + 0.06 ? COL_ACCENT : COL_LINE;
      ctx.fillRect(toX(h.x - h.w / 2), y - 10 * a.u, h.w * half, 20 * a.u);
    }
    // The car, from above; its nose turns as you steer.
    const cx = toX(this.x);
    car(ctx, cx, carY - 4 * a.u, 7.8 * a.u, steerOf(this.held), now - this.hitFlash < 400 ? TONE.mid : [COL_ACCENT, '#b8402a']);
    if (now - this.t0 < 3500 && !this.over) message(v, { ...a, cy: a.top + 30 * a.u }, `hold ${handLabel(this.env, -1)} / ${handLabel(this.env, 1)} to steer`, 'blocks pop up in your path: get out of the way', COL_MID);
    if (this.over) message(v, a, `${this.cleared} cleared`, this.rts.length ? `median reaction ${Math.round(median(this.rts))} ms` : '');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.cleared * 20 + (this.rts.length ? Math.max(0, 500 - Math.round(median(this.rts))) : 0),
      primary: { label: 'cleared', value: this.cleared, unit: '' },
      lines: [
        { label: 'hazards cleared', value: String(this.cleared) },
        { label: 'median time to start steering', value: ms(median(this.rts)) },
        { label: 'window reached', value: ms(this.windowMs()) },
      ],
      rts: this.rts,
      saved: this.cleared >= 3,
    };
  }
}

// --- Catch ------------------------------------------------------------------------

interface Drop {
  x: number;
  y: number;
  v: number;
  grey: boolean;
  done: boolean;
}

const BASKET_SPEED = 1.9;

class Catch extends Steer {
  private x = 0;
  private lastX = 0;
  private lastArrive = 0;
  private drops: Drop[] = [];
  private spawn = 0.8;
  private caught = 0;
  private dodged = 0;
  private missed = 0;

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const dt = this.tick(now);
    if (this.over && now >= this.overAt) return true;
    if (!this.over) {
      this.started = true;
      this.x = clamp(this.x + steerOf(this.held) * BASKET_SPEED * dt, -1, 1);
      this.spawn -= dt;
      if (this.spawn <= 0) {
        const v = 0.35 + this.time * 0.006 + Math.random() * 0.15;
        const grey = this.time > 6 && Math.random() < 0.3;
        let x = -0.95 + Math.random() * 1.9;
        // Every white drop must be reachable from the white drop before it.
        const arrive = this.time + 0.92 / v;
        if (!grey && this.lastArrive) {
          const reach = Math.max(0.1, (arrive - this.lastArrive) * BASKET_SPEED * 0.8);
          x = clamp(x, this.lastX - reach, this.lastX + reach);
        }
        if (!grey) {
          this.lastX = x;
          this.lastArrive = Math.max(arrive, this.lastArrive);
        }
        this.drops.push({ x, y: 0, v, grey, done: false });
        this.spawn = Math.max(0.35, 1.0 - this.time * 0.01) * (0.7 + Math.random() * 0.6);
      }
      for (const d of this.drops) {
        if (d.done) continue;
        d.y += d.v * dt;
        if (d.y >= 0.92) {
          d.done = true;
          const inBasket = Math.abs(d.x - this.x) < 0.14;
          if (d.grey) {
            if (inBasket) this.lose(now);
            else this.dodged++;
          } else if (inBasket) {
            this.caught++;
            this.env.sound(SND_TONE + (this.caught % 7));
          } else {
            this.missed++;
            this.lose(now);
          }
          if (this.over) break;
        }
      }
      this.drops = this.drops.filter((d) => !d.done);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'caught', String(this.caught), 'time', `${this.time.toFixed(0)} s`, this.lives);
    const half = Math.min((a.right - a.left) / 2 - 20 * a.u, 300 * a.u);
    const H = a.bottom - a.top - 10 * a.u;
    const toX = (x: number) => a.cx + x * half;
    const toY = (y: number) => a.top + y * H;
    for (const d of this.drops) {
      ctx.fillStyle = d.grey ? GREY : COL_LINE;
      ctx.beginPath();
      ctx.arc(toX(d.x), toY(d.y), 7 * a.u, 0, TAU);
      ctx.fill();
    }
    // Basket.
    const bx = toX(this.x);
    const by = toY(0.94);
    ctx.strokeStyle = now - this.hitFlash < 400 ? COL_MID : COL_ACCENT;
    ctx.lineWidth = 3 * dpr;
    ctx.beginPath();
    ctx.moveTo(bx - 0.14 * half, by - 14 * a.u);
    ctx.lineTo(bx - 0.11 * half, by);
    ctx.lineTo(bx + 0.11 * half, by);
    ctx.lineTo(bx + 0.14 * half, by - 14 * a.u);
    ctx.stroke();
    ctx.fillStyle = COL_DIM;
    ctx.fillRect(toX(-1), by + 6 * a.u, half * 2, dpr);
    if (now - this.t0 < 3500 && !this.over) message(v, { ...a, cy: a.top + 30 * a.u }, `hold ${handLabel(this.env, -1)} / ${handLabel(this.env, 1)} to move`, 'catch the white drops, let the grey ones fall', COL_MID);
    if (this.over) message(v, a, `${this.caught} caught`, '');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.caught * 15 + this.dodged * 5,
      primary: { label: 'caught', value: this.caught, unit: '' },
      lines: [
        { label: 'caught', value: String(this.caught) },
        { label: 'grey dodged', value: String(this.dodged) },
        { label: 'lasted', value: `${this.time.toFixed(1)} s` },
      ],
      saved: this.caught >= 3,
    };
  }
}

// --- Sort -------------------------------------------------------------------------

interface Parcel {
  circle: boolean;
  grey: boolean;
  y: number;
  done: boolean;
}

class Sort extends Steer {
  private sw = -1;
  private items: Parcel[] = [];
  private spawn = 0.6;
  /** 0: by shape (circles left). 1: by shade (white left). */
  private rule = 0;
  private ruleLeft = 10;
  private ruleAt = 0;
  private right = 0;
  private wrong = 0;
  private afterSwitch: boolean[] = [];
  private lastWrong = 0;

  override start(env: MiniEnv, now: number): void {
    super.start(env, now);
    this.ruleAt = now;
  }

  protected override onPress(side: number): void {
    if (side === 0) return;
    this.sw = side;
    this.env.sound(side > 0 ? SND_TAP_R : SND_TAP_L);
  }

  private wants(p: Parcel): number {
    return (this.rule === 0 ? p.circle : !p.grey) ? -1 : 1;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const dt = this.tick(now);
    if (this.over && now >= this.overAt) return true;
    if (!this.over) {
      this.started = true;
      this.spawn -= dt;
      if (this.spawn <= 0) {
        this.items.push({ circle: Math.random() < 0.5, grey: Math.random() < 0.5, y: 0, done: false });
        this.spawn = Math.max(0.55, 1.4 - this.time * 0.012);
      }
      const speed = 0.32 + this.time * 0.003;
      for (const p of this.items) {
        if (p.done) continue;
        p.y += speed * dt;
        if (p.y >= 0.7) {
          p.done = true;
          const ok = this.sw === this.wants(p);
          this.afterSwitch.push(ok);
          if (ok) {
            this.right++;
            this.env.sound(SND_CATCH);
          } else {
            this.wrong++;
            this.lastWrong = now;
            this.lose(now);
          }
          if (--this.ruleLeft <= 0 && !this.over) {
            this.rule ^= 1;
            this.ruleLeft = 7 + Math.floor(Math.random() * 6);
            this.ruleAt = now;
            this.env.sound(SND_FALSE);
          }
        }
      }
      this.items = this.items.filter((p) => !p.done || p.y < 1.1);
      for (const p of this.items) if (p.done) p.y += speed * dt;
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'sorted', String(this.right), 'rule', this.rule === 0 ? 'by shape' : 'by shade', this.lives);
    const H = a.bottom - a.top - 20 * a.u;
    const w = Math.min(240 * a.u, (a.right - a.left) / 3);
    const forkY = a.top + H * 0.7;
    const toY = (y: number) => a.top + y * H;
    // Chute, fork, and the two bins with what goes in each.
    ctx.strokeStyle = COL_DIM;
    ctx.lineWidth = dpr;
    ctx.beginPath();
    ctx.moveTo(a.cx - 24 * a.u, a.top);
    ctx.lineTo(a.cx - 24 * a.u, forkY);
    ctx.moveTo(a.cx + 24 * a.u, a.top);
    ctx.lineTo(a.cx + 24 * a.u, forkY);
    ctx.stroke();
    ctx.strokeStyle = COL_LINE;
    ctx.lineWidth = 3 * dpr;
    ctx.beginPath();
    ctx.moveTo(a.cx, forkY);
    ctx.lineTo(a.cx + this.sw * w * 0.6, forkY + H * 0.22);
    ctx.stroke();
    const flash = now - this.ruleAt < 900;
    for (const s of [-1, 1]) {
      const bx = a.cx + s * w * 0.75;
      ctx.strokeStyle = flash ? COL_ACCENT : COL_MID;
      ctx.lineWidth = dpr;
      ctx.strokeRect(bx - 34 * a.u, forkY + H * 0.22, 68 * a.u, 30 * a.u);
      // What belongs in this bin under the current rule.
      ctx.fillStyle = this.rule === 1 ? (s < 0 ? COL_LINE : GREY) : COL_LINE;
      v.shape(this.rule === 0 ? (s < 0 ? SHAPE_CIRCLE : SHAPE_SQUARE) : SHAPE_CIRCLE, bx, forkY + H * 0.22 + 15 * a.u, 8 * a.u, this.rule === 1);
      if (this.rule === 1) v.shape(SHAPE_SQUARE, bx + 18 * a.u, forkY + H * 0.22 + 15 * a.u, 7 * a.u, true);
      ctx.fillStyle = COL_MID;
      v.text(handLabel(this.env, s), bx, forkY + H * 0.22 + 50 * a.u, v.fontTiny, 'center');
    }
    for (const p of this.items) {
      const x = p.done ? a.cx + (this.wants(p) * (p.y - 0.7) * w * 2.2) : a.cx;
      ctx.fillStyle = p.grey ? GREY : COL_LINE;
      v.shape(p.circle ? SHAPE_CIRCLE : SHAPE_SQUARE, x, toY(Math.min(p.y, 0.95)), 11 * a.u, true);
    }
    if (flash && this.right + this.wrong > 0) message(v, { ...a, cy: a.top + 20 * a.u }, 'the rule changed', this.rule === 0 ? 'circles left, squares right' : 'white left, grey right', COL_ACCENT);
    else if (now - this.t0 < 4000) message(v, { ...a, cy: a.top + 20 * a.u }, 'set the switch before each item reaches the fork', 'the bins show what goes where', COL_MID);
    if (now - this.lastWrong < 300) {
      ctx.fillStyle = COL_ACCENT;
      ctx.fillRect(a.cx - 30 * a.u, forkY - 2 * dpr, 60 * a.u, 4 * dpr);
    }
    if (this.over) message(v, a, `${this.right} sorted`, '');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const n = this.right + this.wrong;
    return {
      score: this.right * 15,
      primary: { label: 'sorted', value: this.right, unit: '' },
      lines: [
        { label: 'sorted right', value: String(this.right) },
        { label: 'accuracy', value: pct(this.right / (n || 1)) },
        { label: 'lasted', value: `${this.time.toFixed(1)} s` },
      ],
      saved: this.right >= 3,
    };
  }
}

// --- Shield -----------------------------------------------------------------------

interface Shot {
  ang: number;
  at: number;
  hitAt: number;
  done: boolean;
}

const SHIELD_SPAN = (75 * Math.PI) / 180;

class Shield extends Steer {
  private ang = -Math.PI / 2;
  private shots: Shot[] = [];
  private nextAt = 0;
  private blocked = 0;
  private turned: number[] = [];

  override start(env: MiniEnv, now: number): void {
    super.start(env, now);
    this.nextAt = now + 1500;
  }

  private windowMs(): number {
    return Math.max(450, 1300 - this.blocked * 12);
  }

  protected override onPress(side: number, ts: number): void {
    const s = this.shots.find((x) => !x.done);
    if (s && side !== 0) this.turned.push(ts - s.at);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const dt = this.tick(now);
    if (this.over && now >= this.overAt) return true;
    if (!this.over) {
      this.started = true;
      // Right hand clockwise, left hand anticlockwise.
      this.ang = (this.ang + steerOf(this.held) * 5.2 * dt + TAU) % TAU;
      if (now >= this.nextAt) {
        this.shots.push({ ang: Math.random() * TAU, at: now, hitAt: now + this.windowMs(), done: false });
        // Later, sometimes two close together.
        this.nextAt = now + (this.blocked > 15 && Math.random() < 0.3 ? 350 : this.windowMs() * (0.6 + Math.random() * 0.6));
      }
      for (const s of this.shots) {
        if (s.done || now < s.hitAt) continue;
        s.done = true;
        let d = Math.abs(((s.ang - this.ang + Math.PI * 3) % TAU) - Math.PI);
        d = Math.min(d, TAU - d);
        if (d <= SHIELD_SPAN / 2) {
          this.blocked++;
          this.env.sound(SND_CATCH);
        } else this.lose(now);
        if (this.over) break;
      }
      this.shots = this.shots.filter((s) => !s.done || now - s.hitAt < 200);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'blocked', String(this.blocked), 'window', ms(this.windowMs()), this.lives);
    const R = Math.min((a.bottom - a.top) * 0.42, (a.right - a.left) * 0.4, 220 * a.u);
    const r0 = R * 0.28;
    ctx.fillStyle = now - this.hitFlash < 400 ? COL_ACCENT : COL_MID;
    ctx.beginPath();
    ctx.arc(a.cx, a.cy, 10 * a.u, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = COL_DIM;
    ctx.lineWidth = dpr;
    ctx.beginPath();
    ctx.arc(a.cx, a.cy, R, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = COL_LINE;
    ctx.lineWidth = 5 * dpr;
    ctx.beginPath();
    ctx.arc(a.cx, a.cy, r0, this.ang - SHIELD_SPAN / 2, this.ang + SHIELD_SPAN / 2);
    ctx.stroke();
    for (const s of this.shots) {
      const p = clamp((now - s.at) / (s.hitAt - s.at), 0, 1);
      const rr = R - (R - r0) * p;
      ctx.fillStyle = s.done ? COL_MID : COL_LINE;
      ctx.beginPath();
      ctx.arc(a.cx + Math.cos(s.ang) * rr, a.cy + Math.sin(s.ang) * rr, 6 * a.u, 0, TAU);
      ctx.fill();
    }
    if (now - this.t0 < 3500 && !this.over) message(v, { ...a, cy: a.top + 20 * a.u }, `hold ${handLabel(this.env, -1)} to turn left, ${handLabel(this.env, 1)} to turn right`, 'face the shield toward each shot before it lands', COL_MID);
    if (this.over) message(v, { ...a, cy: a.top + 20 * a.u }, `${this.blocked} blocked`, '');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.blocked * 20,
      primary: { label: 'blocked', value: this.blocked, unit: '' },
      lines: [
        { label: 'blocked', value: String(this.blocked) },
        { label: 'median time to start turning', value: ms(median(this.turned)) },
        { label: 'window reached', value: ms(this.windowMs()) },
      ],
      rts: this.turned,
      saved: this.blocked >= 3,
    };
  }
}

// --- Dock -------------------------------------------------------------------------

const DOCK_MS = 60000;

class Dock extends Steer {
  private x = -0.6;
  private v = 0;
  private dockX = 0.4;
  private dockW = 0.18;
  private dockV = 0;
  private settleAt = 0;
  private docks = 0;
  private times: number[] = [];
  private placedAt = 0;
  private done = false;

  override start(env: MiniEnv, now: number): void {
    super.start(env, now);
    this.placedAt = now;
  }

  private place(now: number): void {
    let x = -0.8 + Math.random() * 1.6;
    while (Math.abs(x - this.x) < 0.5) x = -0.8 + Math.random() * 1.6;
    this.dockX = x;
    this.dockW = Math.max(0.08, 0.18 - this.docks * 0.008);
    // After a few, the dock drifts too.
    this.dockV = this.docks >= 4 ? (Math.random() < 0.5 ? -1 : 1) * (0.05 + Math.random() * 0.08) : 0;
    this.placedAt = now;
    this.settleAt = 0;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const dt = this.tick(now);
    if (this.time * 1000 >= scaled(DOCK_MS)) {
      if (!this.done) {
        this.done = true;
        this.overAt = now + 1200;
      }
      if (now >= this.overAt) return true;
    }
    if (!this.done) {
      this.started = true;
      // Thrust with inertia: easy to start, hard to stop on the mark.
      this.v += steerOf(this.held) * 1.6 * dt;
      this.v *= Math.exp(-0.35 * dt);
      this.x += this.v * dt;
      if (this.x < -1 || this.x > 1) {
        this.x = clamp(this.x, -1, 1);
        this.v *= -0.4;
      }
      this.dockX += this.dockV * dt;
      if (this.dockX < -0.85 || this.dockX > 0.85) this.dockV = -this.dockV;
      const inside = Math.abs(this.x - this.dockX) < this.dockW / 2;
      const slow = Math.abs(this.v - this.dockV) < 0.06;
      if (inside && slow) {
        if (!this.settleAt) this.settleAt = now;
        else if (now - this.settleAt > 500) {
          this.docks++;
          this.times.push(now - this.placedAt);
          this.env.sound(SND_CATCH);
          this.place(now);
        }
      } else this.settleAt = 0;
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'docked', String(this.docks), 'time left', `${Math.max(0, Math.ceil((scaled(DOCK_MS) - this.time * 1000) / 1000))} s`);
    const half = Math.min((a.right - a.left) / 2 - 20 * a.u, 320 * a.u);
    const y = a.cy;
    const toX = (x: number) => a.cx + x * half;
    ctx.fillStyle = COL_DIM;
    ctx.fillRect(toX(-1), y + 20 * a.u, half * 2, dpr);
    // The dock: two posts.
    const settling = this.settleAt ? clamp((now - this.settleAt) / 500, 0, 1) : 0;
    ctx.fillStyle = settling ? COL_LINE : COL_MID;
    for (const s of [-1, 1]) ctx.fillRect(toX(this.dockX + (s * this.dockW) / 2) - dpr, y - 20 * a.u, 2 * dpr, 40 * a.u);
    if (settling) {
      ctx.fillStyle = COL_LINE;
      ctx.fillRect(toX(this.dockX - this.dockW / 2), y + 24 * a.u, this.dockW * half * settling, 2 * dpr);
    }
    // The ship, with a thrust flame on the pushing side.
    const sx = toX(this.x);
    ctx.fillStyle = COL_ACCENT;
    ctx.fillRect(sx - 9 * a.u, y - 6 * a.u, 18 * a.u, 12 * a.u);
    const st = steerOf(this.held);
    if (st) {
      ctx.fillStyle = COL_MID;
      ctx.fillRect(sx - st * 16 * a.u - 4 * a.u, y - 2 * a.u, 8 * a.u, 4 * a.u);
    }
    // Speed readout: a short bar.
    ctx.fillStyle = Math.abs(this.v - this.dockV) < 0.06 ? COL_LINE : COL_MID;
    ctx.fillRect(a.cx, a.bottom - 30 * a.u, clamp(this.v, -1, 1) * 120 * a.u, 3 * dpr);
    ctx.fillStyle = COL_DIM;
    v.text('speed', a.cx, a.bottom - 12 * a.u, v.fontTiny, 'center');
    if (now - this.t0 < 4000) message(v, { ...a, cy: a.top + 30 * a.u }, `${handLabel(this.env, -1)} thrusts left, ${handLabel(this.env, 1)} thrusts right`, 'stop dead inside the dock for half a second', COL_MID);
    if (this.done) message(v, { ...a, cy: a.top + 30 * a.u }, `${this.docks} docked`, '');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const med = median(this.times);
    return {
      score: this.docks * 60 + (med ? Math.max(0, Math.round((6000 - med) / 20)) : 0),
      primary: { label: 'docked', value: this.docks, unit: '' },
      lines: [
        { label: 'docked in a minute', value: String(this.docks) },
        { label: 'median time per dock', value: med ? `${(med / 1000).toFixed(1)} s` : '–' },
      ],
      saved: this.time > 10,
    };
  }
}

export const BATCH16: MiniDef[] = [
  {
    id: 'swerve',
    name: 'Swerve',
    skill: 'reaction',
    blurb: 'Drive up the road. Hazards pop up in your path: steer clear.',
    how: 'Hold a left-hand key to steer left and a right-hand key to steer right. A block pops up right where you are heading; get out of its way before it reaches you. The warning gets shorter with every one you clear. Three hits.',
    input: 'keys',
    minKeys: 2,
    make: () => new Swerve(),
  },
  {
    id: 'catch',
    name: 'Catch',
    skill: 'reaction',
    blurb: 'Slide a basket. Catch the white drops, dodge the grey.',
    how: 'Hold left or right to slide the basket. Catch every white drop; let grey ones fall past. A missed white or a caught grey costs a life. Drops come faster and from further apart. Three lives.',
    input: 'keys',
    minKeys: 2,
    make: () => new Catch(),
  },
  {
    id: 'sort',
    name: 'Sort',
    skill: 'attention',
    blurb: 'Flip the switch to send each item down the right chute. The rule changes.',
    how: 'Items drop down a chute to a fork. Press left or right to set the switch before each one arrives. The bins show the rule: by shape or by shade. Every so often the rule flips (the bins flash). Three wrong ones end it.',
    input: 'keys',
    minKeys: 2,
    make: () => new Sort(),
  },
  {
    id: 'shield',
    name: 'Shield',
    skill: 'reaction',
    blurb: 'Spin a shield round the core. Block every shot, from any side.',
    how: 'Shots fly at the core from any angle. Hold left to turn the shield anticlockwise and right to turn it clockwise; face it toward each shot before it lands, taking the shorter way round. Shots come faster as you go. Three hits.',
    input: 'keys',
    minKeys: 2,
    make: () => new Shield(),
  },
  {
    id: 'dock',
    name: 'Dock',
    skill: 'coordination',
    blurb: 'Thrust a drifting ship into the dock and stop dead inside it.',
    how: 'Hold left or right to thrust. The ship keeps drifting, so brake by thrusting the other way. Come to rest between the posts for half a second to dock. The dock shrinks, and later it drifts too. One minute.',
    input: 'keys',
    minKeys: 2,
    make: () => new Dock(),
  },
];
