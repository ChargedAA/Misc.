// Fourteenth batch.
//   Endless: Dodge, Jump, Mix (reaction) - a ball rolls on; blocks and bars pop up a fixed
//     reaction window ahead of it. Dodge sidesteps blocks, Jump hops bars, Mix does both.
//     Difficulty is the window: progressing, 700 down to 300 ms, or custom.
//   Even  (timing) - your keys strictly in order to a metronome, then alone, perfectly even.
//     The tempo climbs while you stay even.
//   Trill (speed)  - alternate in order, flat out, for ten seconds. Fast and even both count.

import { ANTICIPATION_MS, COL_ACCENT, COL_DIM, COL_LINE, COL_MID, SLOT_REFLEX } from '../config.ts';
import { SND_BEAT, SND_BEAT_UP, SND_CATCH, SND_FALL, SND_FALSE, SND_LURCH, SND_TAP_L, SND_TAP_R, SND_TAP_WEAK } from '../audio.ts';
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
  type MiniDef,
  type Mini,
  type MiniEnv,
  type MiniResult,
} from './kit.ts';

const TAU = Math.PI * 2;

function sd(a: readonly number[]): number {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1));
}

/** Coefficient of variation: spread relative to the mean. */
function cv(a: readonly number[]): number {
  const m = mean(a);
  return m > 0 ? sd(a) / m : 0;
}

// --- Endless ----------------------------------------------------------------------

export const ENDLESS_LEVELS = [
  { label: 'Progressing', desc: 'Starts at 800 ms and tightens with every clear', value: 0 },
  { label: 'Beginner', desc: '700 ms to react', value: 700 },
  { label: 'Amateur', desc: '600 ms to react', value: 600 },
  { label: 'Intermediate', desc: '500 ms to react', value: 500 },
  { label: 'Advanced', desc: '400 ms to react', value: 400 },
  { label: 'Expert', desc: '300 ms to react', value: 300 },
];
const ENDLESS_CUSTOM = { unit: 'ms', min: 150, max: 1200, def: 450 };

type Kind = 'dodge' | 'jump' | 'mix';

interface Obstacle {
  /** 0: blocks in some lanes, sidestep them. 1: a bar across the track, jump it. */
  type: number;
  blocked: boolean[];
  at: number;
  hitAt: number;
  /** First correct response, or 0. */
  answeredAt: number;
  jumped: boolean;
  done: boolean;
  ok: boolean;
}

/** Track speed in track heights per second. */
const TRACK_SPEED = 0.9;

class Endless implements Mini {
  private env!: MiniEnv;
  private readonly kind: Kind;
  private lane = 1;
  private laneFrom = 1;
  private laneAt = 0;
  private hopAt = -1e9;
  private hopUntil = -1e9;
  private ob: Obstacle | null = null;
  private nextAt = 0;
  private lives = 3;
  private cleared = 0;
  private wrong = 0;
  private rts: number[] = [];
  private hitFlash = 0;
  private over = false;
  private overAt = 0;
  private t0 = 0;
  private now = 0;
  private held = 0;
  private fixed = 0;
  private lastWindow = 0;
  private travelled = 0;
  private last = 0;

  constructor(kind: Kind) {
    this.kind = kind;
  }

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.fixed = env.level ?? 0;
    this.t0 = now;
    this.last = now;
    this.nextAt = now + 1200;
  }

  private windowMs(): number {
    return this.fixed > 0 ? this.fixed : Math.max(230, 800 - this.cleared * 8);
  }

  /** What a slot does here: -1 / +1 move, 2 jump, 0 nothing. */
  private role(slot: number): number {
    if (this.kind === 'jump') return 2;
    const side = sideOf(slot);
    if (this.kind === 'dodge') return side;
    // Mix: the outermost key of each hand moves; every other key jumps.
    if (slot === SLOT_REFLEX) return 2;
    if (slot === 0) return -1;
    if (slot === 3 + this.env.mode.right - 1) return 1;
    return 2;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (this.over) return;
    const r = this.role(slot);
    if (r === -1 || r === 1) {
      const to = clamp(this.lane + r, 0, 2);
      if (to !== this.lane) {
        this.laneFrom = this.lane;
        this.lane = to;
        this.laneAt = ts;
        this.env.sound(r > 0 ? SND_TAP_R : SND_TAP_L);
        const o = this.ob;
        if (o && !o.done && o.type === 0 && !o.blocked[to] && !o.answeredAt && ts >= o.at) o.answeredAt = ts;
      }
    } else if (r === 2) {
      const o = this.ob;
      if (o && !o.done && o.type === 1 && !o.jumped && ts >= o.at) {
        o.jumped = true;
        o.answeredAt = ts;
        this.hopAt = ts;
        this.hopUntil = o.hitAt + 180;
        this.env.sound(SND_TAP_R);
      } else if (ts > this.hopUntil) {
        // A hop with nothing to clear: harmless, just a little bounce.
        this.hopAt = ts;
        this.hopUntil = ts + 220;
        this.env.sound(SND_TAP_WEAK);
      }
    }
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  private spawn(now: number): void {
    const type = this.kind === 'dodge' ? 0 : this.kind === 'jump' ? 1 : Math.random() < 0.5 ? 0 : 1;
    const blocked = [false, false, false];
    if (type === 0) {
      blocked[this.lane] = true;
      // Often a second block, but always leave a lane one step away.
      if (Math.random() < 0.5) {
        if (this.lane === 1) blocked[Math.random() < 0.5 ? 0 : 2] = true;
        else blocked[this.lane === 0 ? 2 : 0] = true;
      }
    } else blocked.fill(true);
    const w = this.windowMs();
    this.lastWindow = w;
    this.ob = { type, blocked, at: now, hitAt: now + w, answeredAt: 0, jumped: false, done: false, ok: false };
  }

  private resolve(now: number): void {
    const o = this.ob!;
    o.done = true;
    o.ok = o.type === 1 ? o.jumped : !o.blocked[this.lane];
    if (o.ok) {
      this.cleared++;
      if (o.answeredAt) this.rts.push(o.answeredAt - o.at);
      this.env.sound(SND_CATCH);
    } else {
      this.lives--;
      this.hitFlash = now;
      this.env.sound(SND_LURCH);
      if (o.type === 0 && o.answeredAt === 0 && this.lane !== this.laneFrom && now - this.laneAt < this.windowMs()) this.wrong++;
      if (this.lives <= 0) {
        this.over = true;
        this.overAt = now + 1400;
        this.env.sound(SND_FALL);
      }
    }
    this.nextAt = now + 350 + Math.random() * 700;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.now = now;
    if (this.over && now >= this.overAt) return true;
    if (!this.over) {
      this.travelled += TRACK_SPEED * dt;
      if (!this.ob || (this.ob.done && now > this.ob.hitAt + 250)) {
        if (this.ob?.done) this.ob = null;
        if (!this.ob && now >= this.nextAt) this.spawn(now);
      }
      if (this.ob && !this.ob.done && now >= this.ob.hitAt) this.resolve(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const med = median(this.rts);
    header(v, touch, 'cleared', String(this.cleared), 'window', ms(this.ob && !this.ob.done ? this.lastWindow : this.windowMs()), this.lives);
    // The track: three lanes running up the screen; the ball sits low and the world scrolls down.
    const H = a.bottom - a.top - 10 * a.u;
    const laneW = Math.min(90 * a.u, (a.right - a.left) / 4);
    const x0 = a.cx - laneW * 1.5;
    const ballY = a.top + H * 0.86;
    const laneX = (l: number) => x0 + laneW * (l + 0.5);
    ctx.fillStyle = COL_DIM;
    for (let l = 0; l <= 3; l++) ctx.fillRect(x0 + l * laneW - dpr / 2, a.top, dpr, H);
    // Ticks moving down to show motion.
    const tick = 0.08;
    const off = (this.travelled % tick) / tick;
    for (let k = 0; k < 14; k++) {
      const y = a.top + ((k + off) * tick) * H;
      if (y > a.top + H) break;
      ctx.fillRect(x0 - 8 * a.u, y, 5 * a.u, dpr);
      ctx.fillRect(x0 + laneW * 3 + 3 * a.u, y, 5 * a.u, dpr);
    }
    // The obstacle, coming down to meet the ball.
    const o = this.ob;
    if (o) {
      const toGo = (o.hitAt - now) / 1000; // seconds left
      const y = ballY - toGo * TRACK_SPEED * H;
      const fresh = now - o.at < 90;
      if (y < a.top + H + 30 * a.u) {
        ctx.fillStyle = o.done && !o.ok ? COL_ACCENT : fresh ? COL_LINE : COL_LINE;
        if (o.type === 0) {
          o.blocked.forEach((b, l) => {
            if (b) ctx.fillRect(laneX(l) - laneW * 0.36, y - laneW * 0.36, laneW * 0.72, laneW * 0.72);
          });
        } else {
          ctx.fillRect(x0 + 4 * dpr, y - 5 * a.u, laneW * 3 - 8 * dpr, 10 * a.u);
        }
        if (fresh) {
          ctx.strokeStyle = COL_MID;
          ctx.lineWidth = dpr;
          ctx.strokeRect(x0 - 2 * dpr, y - laneW * 0.45, laneW * 3 + 4 * dpr, laneW * 0.9);
        }
      }
    }
    // The ball, sliding between lanes and hopping.
    const slide = clamp((now - this.laneAt) / 80, 0, 1);
    const bx = laneX(this.laneFrom) + (laneX(this.lane) - laneX(this.laneFrom)) * (1 - (1 - slide) * (1 - slide));
    let lift = 0;
    if (now < this.hopUntil) {
      const p = (now - this.hopAt) / (this.hopUntil - this.hopAt);
      lift = Math.sin(Math.PI * clamp(p, 0, 1)) * (this.hopUntil - this.hopAt > 300 ? laneW * 0.7 : laneW * 0.18);
    }
    const r = laneW * 0.2 * (1 + lift / (laneW * 2));
    ctx.fillStyle = now - this.hitFlash < 400 ? COL_MID : COL_ACCENT;
    ctx.beginPath();
    ctx.arc(bx, ballY - lift * 0.4, r, 0, TAU);
    ctx.fill();
    if (lift > 2) {
      ctx.fillStyle = COL_DIM;
      ctx.beginPath();
      ctx.ellipse(bx, ballY + r * 0.9, r * 0.8, r * 0.2, 0, 0, TAU);
      ctx.fill();
    }
    // Side text.
    ctx.fillStyle = COL_MID;
    const sx = x0 + laneW * 3 + 40 * a.u;
    if (sx < a.right - 60 * a.u) {
      v.text(this.rts.length ? `median ${Math.round(med)} ms` : '', sx, a.top + 30 * a.u, v.fontTiny, 'left');
      v.text(this.fixed ? `fixed ${this.fixed} ms` : 'progressing', sx, a.top + 50 * a.u, v.fontTiny, 'left');
    }
    if (now - this.t0 < 3500 && !this.over) {
      const how =
        this.kind === 'dodge'
          ? `blocks pop up ahead: sidestep with ${handLabel(this.env, -1)} / ${handLabel(this.env, 1)}`
          : this.kind === 'jump'
            ? 'bars pop up across the track: press to jump'
            : 'blocks: sidestep with your outer keys. bars: jump with any other key';
      message(v, { ...a, cy: a.top + 30 * a.u }, how, '', COL_MID);
    }
    if (this.over) message(v, { ...a, cy: a.cy - 40 * a.u }, `${this.cleared} cleared`, this.rts.length ? `median ${Math.round(med)} ms` : '');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const med = median(this.rts);
    const w = this.fixed || this.windowMs();
    return {
      score: Math.round(this.cleared * (900 / w) * 10),
      primary: { label: 'cleared', value: this.cleared, unit: '' },
      lines: [
        { label: 'cleared', value: String(this.cleared) },
        { label: this.fixed ? 'window' : 'window reached', value: ms(w) },
        { label: 'median reaction', value: ms(med) },
        { label: 'fastest', value: this.rts.length ? ms(Math.min(...this.rts)) : '–' },
      ],
      rts: this.rts,
      saved: this.cleared >= 3 || this.now - this.t0 > 8000,
    };
  }
}

// --- Alternation order ------------------------------------------------------------

/** The keys in order, alternating hands: left outer, right outer, left next, right next... */
function altOrder(env: MiniEnv): number[] {
  const left: number[] = [];
  const right: number[] = [];
  for (let i = 0; i < env.mode.left; i++) left.push(i);
  // Right hand outer first too: its outermost key is the last slot.
  for (let i = env.mode.right - 1; i >= 0; i--) right.push(3 + i);
  const out: number[] = [];
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    if (left[i] !== undefined) out.push(left[i]!);
    if (right[i] !== undefined) out.push(right[i]!);
  }
  return out;
}

function drawOrder(v: View, env: MiniEnv, order: number[], next: number, cx: number, y: number, u: number, flash: boolean): void {
  const ctx = v.ctx;
  const w = 50 * u;
  const x0 = cx - (order.length * w) / 2;
  order.forEach((slot, i) => {
    const x = x0 + i * w + w / 2;
    const on = i === next;
    ctx.strokeStyle = on ? (flash ? COL_ACCENT : COL_LINE) : COL_DIM;
    ctx.lineWidth = (on ? 2 : 1) * v.dpr;
    ctx.strokeRect(x - 18 * u, y - 18 * u, 36 * u, 36 * u);
    ctx.fillStyle = on ? COL_LINE : COL_MID;
    v.text(env.labels[slot] ?? '', x, y + 5 * v.dpr, v.fontHud, 'center');
  });
}

/** Recent intervals as bars around a target line; bars alternate shade by which hand pressed. */
function drawIntervals(v: View, ints: readonly number[], hands: readonly number[], target: number, cx: number, y: number, w: number, h: number): void {
  const ctx = v.ctx;
  const n = 24;
  const shown = ints.slice(-n);
  const hs = hands.slice(-n);
  const bw = w / n;
  const x0 = cx - w / 2;
  ctx.fillStyle = COL_DIM;
  ctx.fillRect(x0, y, w, v.dpr);
  const scale = h / (target * 2);
  ctx.fillStyle = COL_MID;
  ctx.fillRect(x0, y - target * scale, w, v.dpr);
  shown.forEach((iv, i) => {
    const bh = Math.min(h, iv * scale);
    ctx.fillStyle = hs[i]! > 0 ? COL_LINE : COL_MID;
    ctx.fillRect(x0 + i * bw + bw * 0.2, y - bh, bw * 0.6, bh);
  });
}

/** How much one hand's gaps differ from the other's: the "gallop". */
function asymmetry(ints: readonly number[], hands: readonly number[]): number {
  const l = ints.filter((_, i) => hands[i]! < 0);
  const r = ints.filter((_, i) => hands[i]! > 0);
  if (l.length < 3 || r.length < 3) return 0;
  const a = mean(l);
  const b = mean(r);
  return Math.abs(a - b) / ((a + b) / 2);
}

// --- Even -------------------------------------------------------------------------

const EVEN_LEAD = 8;
const EVEN_JUDGE = 16;

class Even implements Mini {
  private env!: MiniEnv;
  private order: number[] = [];
  private next = 0;
  private rate = 3;
  private state = 0; // 0 lead-in with clicks, 1 alone, 2 feedback
  private t0 = 0;
  private at = 0;
  private lastClick = -1;
  private lastTap = 0;
  private ints: number[] = [];
  private hands: number[] = [];
  private slips = 0;
  private judged = 0;
  private strikes = 0;
  private best = 0;
  private cvs: number[] = [];
  private asyms: number[] = [];
  private verdict = '';
  private lastCv = 0;
  private flash = 0;
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.order = altOrder(env);
    this.level(now + 600);
  }

  private level(now: number): void {
    this.state = 0;
    this.t0 = now;
    this.lastClick = -1;
    this.lastTap = 0;
    this.ints = [];
    this.hands = [];
    this.slips = 0;
    this.judged = 0;
    this.next = 0;
  }

  private period(): number {
    return 1000 / this.rate;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (this.state === 2 || sideOf(slot) === 0) return;
    if (slot !== this.order[this.next]) {
      this.slips++;
      this.flash = ts;
      this.env.sound(SND_FALSE);
      return;
    }
    this.env.sound(sideOf(slot) > 0 ? SND_TAP_R : SND_TAP_L);
    if (this.lastTap) {
      const iv = ts - this.lastTap;
      if (iv > ANTICIPATION_MS / 4) {
        this.ints.push(iv);
        this.hands.push(sideOf(slot));
        if (this.state === 1) this.judged++;
      }
    }
    this.lastTap = ts;
    this.next = (this.next + 1) % this.order.length;
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  private judge(now: number): void {
    const alone = this.ints.slice(-EVEN_JUDGE);
    const c = cv(alone);
    const rateHit = alone.length ? 1000 / mean(alone) : 0;
    const onPace = Math.abs(rateHit - this.rate) / this.rate < 0.12;
    const ok = alone.length >= EVEN_JUDGE && this.slips === 0 && c < 0.1 && onPace;
    this.lastCv = c;
    if (alone.length >= 4) {
      this.cvs.push(c);
      this.asyms.push(asymmetry(alone, this.hands.slice(-EVEN_JUDGE)));
    }
    if (ok) {
      this.best = Math.max(this.best, this.rate);
      this.verdict = `even at ${this.rate.toFixed(1)} a second`;
      this.rate += 0.5;
      this.env.sound(SND_CATCH);
    } else {
      this.strikes++;
      this.verdict =
        alone.length < EVEN_JUDGE ? 'keep going after the clicks stop' : this.slips ? `${this.slips} out of order` : !onPace ? (rateHit > this.rate ? 'drifted faster' : 'drifted slower') : 'not even enough';
      this.env.sound(SND_FALSE);
    }
    this.state = 2;
    this.at = now + 1600;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const P = this.period();
    if (this.state === 0 && now >= this.t0) {
      const k = Math.floor((now - this.t0) / P);
      if (k !== this.lastClick && k < EVEN_LEAD) {
        this.lastClick = k;
        this.env.sound(k % 4 === 0 ? SND_BEAT_UP : SND_BEAT);
      }
      if (k >= EVEN_LEAD) this.state = 1;
    }
    if (this.state === 1 && (this.judged >= EVEN_JUDGE || now - Math.max(this.lastTap, this.t0 + EVEN_LEAD * P) > 2000)) this.judge(now);
    if (this.state === 2 && now >= this.at) {
      if (this.strikes >= 2) return true;
      this.level(now + 500);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'pace', `${this.rate.toFixed(1)} / s`, 'best', this.best ? `${this.best.toFixed(1)} / s` : '–', 2 - this.strikes, 2);
    drawOrder(v, this.env, this.order, this.next, a.cx, a.cy - 70 * a.u, a.u, now - this.flash < 200);
    const w = Math.min(a.right - a.left, 480 * a.u);
    drawIntervals(v, this.ints, this.hands, P, a.cx, a.cy + 90 * a.u, w, 100 * a.u);
    ctx.fillStyle = this.state === 1 ? COL_LINE : COL_MID;
    const msg =
      this.state === 0
        ? now < this.t0
          ? 'ready'
          : `with the clicks  ·  ${EVEN_LEAD - Math.max(0, this.lastClick)}`
        : this.state === 1
          ? `alone  ·  ${EVEN_JUDGE - this.judged} to go`
          : `${this.verdict}  ·  ${pct(this.lastCv)} uneven`;
    v.text(msg, a.cx, a.cy - 120 * a.u, v.fontHud, 'center');
    if (this.best === 0 && this.strikes === 0 && this.state === 0) {
      ctx.fillStyle = COL_MID;
      v.text('press the keys in this order, one per click. when the clicks stop, keep the same even pace', a.cx, a.bottom - 16 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: Math.round(this.best * 120 + Math.max(0, 0.15 - mean(this.cvs)) * 1000),
      primary: { label: 'fastest even pace', value: this.best, unit: '/s', decimals: 1 },
      lines: [
        { label: 'fastest pace held evenly', value: this.best ? `${this.best.toFixed(1)} presses a second` : '–' },
        { label: 'average unevenness', value: this.cvs.length ? pct(mean(this.cvs)) : '–' },
        { label: 'hand imbalance', value: this.asyms.length ? pct(mean(this.asyms)) : '–' },
      ],
      saved: this.cvs.length >= 1,
    };
  }
}

// --- Trill ------------------------------------------------------------------------

const TRILL_MS = 10000;

class Trill implements Mini {
  private env!: MiniEnv;
  private order: number[] = [];
  private next = 0;
  private t0 = 0;
  private lastTap = 0;
  private ints: number[] = [];
  private hands: number[] = [];
  private good = 0;
  private slips = 0;
  private flash = 0;
  private done = false;
  private held = 0;

  start(env: MiniEnv): void {
    this.env = env;
    this.order = altOrder(env);
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (this.done || sideOf(slot) === 0) return;
    if (!this.t0) this.t0 = ts;
    if (ts - this.t0 > TRILL_MS) return;
    if (slot !== this.order[this.next]) {
      this.slips++;
      this.flash = ts;
      this.env.sound(SND_TAP_WEAK);
      return;
    }
    this.env.sound(sideOf(slot) > 0 ? SND_TAP_R : SND_TAP_L);
    if (this.lastTap) {
      this.ints.push(ts - this.lastTap);
      this.hands.push(sideOf(slot));
    }
    this.lastTap = ts;
    this.good++;
    this.next = (this.next + 1) % this.order.length;
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  private stats(): { rate: number; c: number; even: number } {
    const rate = this.good / (TRILL_MS / 1000);
    const c = cv(this.ints);
    return { rate, c, even: rate * Math.max(0, 1 - c * 2) };
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.t0 && now - this.t0 > TRILL_MS) {
      if (!this.done) {
        this.done = true;
        this.env.sound(SND_CATCH);
      }
      if (now - this.t0 > TRILL_MS + 900) return true;
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const el = this.t0 ? Math.max(0.3, Math.min(TRILL_MS, now - this.t0) / 1000) : 0;
    const recent = this.ints.slice(-16);
    header(v, touch, 'rate', el ? `${(this.good / el).toFixed(1)} / s` : '–', 'uneven', recent.length > 3 ? pct(cv(recent)) : '–');
    drawOrder(v, this.env, this.order, this.next, a.cx, a.cy - 70 * a.u, a.u, now - this.flash < 150);
    const target = recent.length ? mean(recent) : 125;
    drawIntervals(v, this.ints, this.hands, target, a.cx, a.cy + 90 * a.u, Math.min(a.right - a.left, 480 * a.u), 100 * a.u);
    if (!this.t0) {
      ctx.fillStyle = COL_MID;
      v.text('alternate in this order, as fast as you can while staying even. the clock starts on your first press', a.cx, a.bottom - 16 * a.u, v.fontTiny, 'center');
    } else progress(v, a.cx, a.bottom - 20 * a.u, 120 * a.u, clamp((now - this.t0) / TRILL_MS, 0, 1));
    if (this.done) {
      const s = this.stats();
      message(v, { ...a, cy: a.cy - 130 * a.u }, `${s.rate.toFixed(1)} / s`, `${pct(s.c)} uneven`);
    }
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const s = this.stats();
    return {
      score: Math.round(s.even * 60),
      primary: { label: 'even speed', value: s.even, unit: '/s', decimals: 1 },
      lines: [
        { label: 'presses a second', value: s.rate.toFixed(1) },
        { label: 'unevenness (spread of gaps)', value: pct(s.c) },
        { label: 'hand imbalance', value: pct(asymmetry(this.ints, this.hands)) },
        { label: 'out of order', value: String(this.slips) },
        { label: 'even speed (rate, discounted for unevenness)', value: s.even.toFixed(1) },
      ],
      saved: this.good >= 10,
    };
  }
}

const ENDLESS_HOW = 'Pick a difficulty: the window is how long you get from the moment something pops up to the moment it reaches you. Progressing starts slow and tightens with every clear. Three hits end it.';

export const BATCH14: MiniDef[] = [
  {
    id: 'lanes',
    name: 'Lanes',
    skill: 'reaction',
    blurb: 'The ball rolls on. Blocks pop up ahead: sidestep them.',
    how: `Three lanes. Blocks pop up in front of the ball; move left or right (that hand) to a free lane before they reach you. ${ENDLESS_HOW}`,
    input: 'keys',
    minKeys: 2,
    levels: ENDLESS_LEVELS,
    custom: ENDLESS_CUSTOM,
    make: () => new Endless('dodge'),
  },
  {
    id: 'hurdles',
    name: 'Hurdles',
    skill: 'reaction',
    blurb: 'The ball rolls on. Bars pop up across the track: jump them.',
    how: `Bars pop up across the whole track. Press any key to jump before one reaches you. ${ENDLESS_HOW}`,
    input: 'keys',
    levels: ENDLESS_LEVELS,
    custom: ENDLESS_CUSTOM,
    make: () => new Endless('jump'),
  },
  {
    id: 'rush',
    name: 'Rush',
    skill: 'reaction',
    blurb: 'Blocks and bars, at random. Sidestep or jump, and do not mix them up.',
    how: `Blocks or bars pop up at random. Your outermost key on each side moves the ball; every other key (Space with three keys) jumps. Choose fast and right. ${ENDLESS_HOW}`,
    input: 'keys',
    minKeys: 3,
    levels: ENDLESS_LEVELS,
    custom: ENDLESS_CUSTOM,
    make: () => new Endless('mix'),
  },
  {
    id: 'even',
    name: 'Even',
    skill: 'timing',
    blurb: 'Your keys in order, to a click, then alone. Perfectly even. The pace climbs.',
    how: 'Press your keys in the order shown, alternating hands, one per click. After eight clicks the metronome stops: keep the same pace, evenly, for sixteen more. Stay in order and even (gaps within about 10% of each other) and the pace goes up half a press a second. Two misses end it.',
    input: 'keys',
    minKeys: 2,
    make: () => new Even(),
  },
  {
    id: 'trill',
    name: 'Trill',
    skill: 'speed',
    blurb: 'Alternate in order, flat out, for ten seconds. Fast and even both count.',
    how: 'Alternate your keys in the order shown as fast as you can for ten seconds, keeping every gap the same. The bars show each gap: one hand faster than the other shows as a zigzag. Scored on speed discounted for unevenness.',
    input: 'keys',
    minKeys: 2,
    make: () => new Trill(),
  },
];
