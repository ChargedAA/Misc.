// Fifty-first batch.
//   Area  - two different shapes: which covers more ground? Gets closer as you get it right.
//   Logic - lights A, B, C and a statement like "A and not B": true or false?
//   Same  - two short rhythms, one after the other: the same, or different?
//   Ferry - steer a ferry across a river whose current changes lane by lane, into the dock.

import { COL_ACCENT, COL_DIM, COL_FAINT, COL_LINE, COL_MID } from '../config.ts';
import { SND_BEAT, SND_CATCH, SND_FALL, SND_FALSE, SND_TAP_L, SND_TAP_R } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, handLabel, header, median, ms, pct, scaled, sideOf, Stair, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const TAU = Math.PI * 2;
const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const rint = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]!;
const tailMean = (a: readonly number[], n: number) => {
  const t = a.slice(-n);
  return t.length ? t.reduce((s, x) => s + x, 0) / t.length : 0;
};

// --- Area ------------------------------------------------------------------------------

const AREA_TRIALS = 30;
/** Shapes, with the area of each when its size parameter is 1. */
const SHAPES: { name: string; area: number }[] = [
  { name: 'circle', area: Math.PI },
  { name: 'square', area: 4 },
  { name: 'triangle', area: (3 * Math.sqrt(3)) / 4 },
  { name: 'hexagon', area: (3 * Math.sqrt(3)) / 2 },
  { name: 'bar', area: 4 * 0.35 },
];

function drawShape(ctx: CanvasRenderingContext2D, k: number, x: number, y: number, r: number, rot: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  if (k === 0) ctx.arc(0, 0, r, 0, TAU);
  else if (k === 1) ctx.rect(-r, -r, 2 * r, 2 * r);
  else if (k === 4) ctx.rect(-r, -r * 0.35, 2 * r, 0.7 * r);
  else {
    const n = k === 2 ? 3 : 6;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i / n) * TAU;
      if (i) ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      else ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
  }
  ctx.fill();
  ctx.restore();
}

class Area implements Mini {
  private env!: MiniEnv;
  /** How much bigger the bigger shape is, in percent. */
  private readonly diff = new Stair(40, 4, 2, 60, 2);
  private levels: number[] = [];
  private trial = 0;
  private shapes: [number, number, number][] = [];
  private bigger = 0;
  private state = 0;
  private at = 0;
  private right = 0;
  private held = 0;
  private lastOk = true;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.make(now);
  }

  private make(now: number): void {
    const a = rint(0, SHAPES.length - 1);
    let b = rint(0, SHAPES.length - 1);
    while (b === a) b = rint(0, SHAPES.length - 1);
    const big = Math.random() < 0.5 ? 0 : 1;
    this.bigger = big;
    // Pick the target areas, then the size of each shape that gives it.
    const base = rnd(0.8, 1.1);
    const areas = [base, base];
    areas[big] = base * (1 + this.diff.level / 100);
    const kinds = [a, b];
    this.shapes = kinds.map((k, i) => [k, Math.sqrt(areas[i]! / SHAPES[k]!.area), rnd(0, TAU)]);
    this.state = 0;
    this.at = now;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (s === 0 || this.state !== 0) return;
    const ok = (s < 0 ? 0 : 1) === this.bigger;
    this.levels.push(this.diff.level);
    this.diff.update(ok, -1);
    this.lastOk = ok;
    if (ok) this.right++;
    this.env.sound(ok ? (s < 0 ? SND_TAP_L : SND_TAP_R) : SND_FALSE);
    this.trial++;
    this.state = 1;
    this.at = ts + (ok ? 350 : 900);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 1 && now >= this.at) {
      if (this.trial >= scaled(AREA_TRIALS)) return true;
      this.make(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'difference', `${this.diff.level}%`, 'pair', `${Math.min(this.trial + 1, scaled(AREA_TRIALS))} / ${scaled(AREA_TRIALS)}`);
    const unit = Math.min((a.right - a.left) / 6, (a.bottom - a.top) / 3.2);
    this.shapes.forEach(([k, r, rot], i) => {
      const show = this.state === 1;
      ctx.fillStyle = show && i === this.bigger ? COL_LINE : show ? COL_DIM : '#c8c8ce';
      drawShape(ctx, k, a.cx + (i ? 1 : -1) * unit * 1.5, a.cy - 10 * a.u, r * unit * 0.75, rot);
    });
    ctx.fillStyle = this.state === 1 && !this.lastOk ? COL_ACCENT : COL_MID;
    v.text(this.state === 1 && !this.lastOk ? 'the other one covers more' : 'which shape covers more area?', a.cx, a.bottom - 34 * a.u, v.fontTiny, 'center');
    const off = Math.min(200 * a.u, (a.right - a.left) / 2 - 30 * a.u);
    ctx.fillStyle = COL_MID;
    v.text(`${handLabel(this.env, -1)}  left`, a.cx - off, a.bottom - 6 * a.u, v.fontTiny, 'center');
    v.text(`right  ${handLabel(this.env, 1)}`, a.cx + off, a.bottom - 6 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const th = tailMean(this.levels, 12);
    return {
      score: this.trial >= 10 ? Math.max(0, Math.round((62 - th) * 30 + this.right * 5)) : 0,
      primary: { label: 'smallest difference you see', value: Math.round(th), unit: '%', lower: true },
      lines: [
        { label: 'threshold (last 12 pairs)', value: `${th.toFixed(0)}%` },
        { label: 'right', value: `${this.right} of ${this.trial}` },
      ],
      saved: this.trial >= 10,
    };
  }
}

// --- Logic -----------------------------------------------------------------------------

const LOGIC_MS = 60000;
type Expr = { text: string; val: (v: boolean[]) => boolean; vars: number };

const atoms = (n: number): Expr[] => ['A', 'B', 'C'].slice(0, n).map((t, i) => ({ text: t, val: (v) => v[i]!, vars: i + 1 }));
const not = (e: Expr): Expr => ({ text: e.text.length > 1 ? `not (${e.text})` : `not ${e.text}`, val: (v) => !e.val(v), vars: e.vars });
const and = (a: Expr, b: Expr): Expr => ({ text: `${a.text} and ${b.text}`, val: (v) => a.val(v) && b.val(v), vars: Math.max(a.vars, b.vars) });
const or = (a: Expr, b: Expr): Expr => ({ text: `${a.text} or ${b.text}`, val: (v) => a.val(v) || b.val(v), vars: Math.max(a.vars, b.vars) });
const wrap = (e: Expr): Expr => (e.text.includes(' ') && !e.text.startsWith('not') ? { ...e, text: `(${e.text})` } : e);

/** A statement whose difficulty grows with the level. */
function statement(level: number): Expr {
  const n = level < 4 ? 2 : 3;
  const at = atoms(n);
  const lit = () => (Math.random() < 0.35 ? not(pick(at)) : pick(at));
  if (level < 2) return Math.random() < 0.5 ? and(lit(), lit()) : or(lit(), lit());
  if (level < 4) return pick([() => not(and(pick(at), pick(at))), () => not(or(pick(at), pick(at))), () => and(lit(), lit()), () => or(lit(), lit())])();
  const pair = () => wrap(Math.random() < 0.5 ? and(lit(), lit()) : or(lit(), lit()));
  return Math.random() < 0.5 ? and(pair(), lit()) : or(pair(), lit());
}

class Logic implements Mini {
  private env!: MiniEnv;
  private expr: Expr = statement(0);
  private lights: boolean[] = [];
  private t0 = 0;
  private at = 0;
  private started = false;
  private ok = 0;
  private bad = 0;
  private streak = 0;
  private level = 0;
  private rts: number[] = [];
  private flash = 0;
  private note = '';
  private held = 0;
  private firstFrame = 0;

  start(env: MiniEnv): void {
    this.env = env;
  }

  private make(now: number): void {
    for (let tries = 0; tries < 50; tries++) {
      const e = statement(this.level);
      if (e.text.replace(/[^ABC]/g, '').length >= 2) {
        this.expr = e;
        break;
      }
    }
    this.lights = [Math.random() < 0.5, Math.random() < 0.5, Math.random() < 0.5];
    this.at = now;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (s === 0) return;
    if (!this.started) {
      this.started = true;
      this.t0 = ts;
      this.make(ts);
      return;
    }
    const truth = this.expr.val(this.lights);
    if ((s > 0) === truth) {
      this.ok++;
      this.streak++;
      this.rts.push(ts - this.at);
      if (this.streak % 4 === 0) this.level = Math.min(6, this.level + 1);
      this.env.sound(s < 0 ? SND_TAP_L : SND_TAP_R);
    } else {
      this.bad++;
      this.streak = 0;
      this.level = Math.max(0, this.level - 1);
      this.note = `“${this.expr.text}” was ${truth ? 'true' : 'false'}`;
      this.flash = ts + 1300;
      this.env.sound(SND_FALSE);
    }
    this.make(ts);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    const len = scaled(LOGIC_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'right', String(this.ok), 'time', `${left} s`);
    const n = this.started ? (this.expr.text.includes('C') ? 3 : 2) : 3;
    const s = 46 * a.u;
    for (let i = 0; i < n; i++) {
      const x = a.cx + (i - (n - 1) / 2) * (s + 24 * a.u);
      const y = a.cy - 70 * a.u;
      const on = this.started && this.lights[i];
      ctx.fillStyle = on ? COL_LINE : '#1a1a1e';
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
      ctx.strokeStyle = COL_DIM;
      ctx.lineWidth = 1.5 * dpr;
      ctx.strokeRect(x - s / 2, y - s / 2, s, s);
      ctx.fillStyle = on ? '#111114' : COL_MID;
      v.text('ABC'[i]!, x, y + 5 * dpr, v.fontHud, 'center');
    }
    ctx.fillStyle = COL_MID;
    v.text('lit = true, dark = false', a.cx, a.cy - 26 * a.u, v.fontTiny, 'center');
    ctx.font = `600 ${Math.round(30 * a.u)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COL_LINE;
    ctx.fillText(this.started ? this.expr.text : 'true or false?', a.cx, a.cy + 24 * a.u);
    if (now < this.flash) {
      ctx.fillStyle = COL_ACCENT;
      v.text(this.note, a.cx, a.cy + 64 * a.u, v.fontTiny, 'center');
    }
    const off = Math.min(200 * a.u, (a.right - a.left) / 2 - 30 * a.u);
    ctx.fillStyle = COL_MID;
    v.text(`${handLabel(this.env, -1)}  false`, a.cx - off, a.bottom - 6 * a.u, v.fontTiny, 'center');
    v.text(`true  ${handLabel(this.env, 1)}`, a.cx + off, a.bottom - 6 * a.u, v.fontTiny, 'center');
    if (!this.started) v.text('press either side to start; a minute', a.cx, a.bottom - 30 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: Math.max(0, this.ok * 20 - this.bad * 30 + this.level * 20),
      primary: { label: 'right in a minute', value: this.ok, unit: '' },
      lines: [
        { label: 'right', value: String(this.ok) },
        { label: 'wrong', value: String(this.bad) },
        { label: 'typical time a statement', value: this.rts.length ? ms(median(this.rts)) : '–' },
        { label: 'level reached', value: `${this.level + 1} of 7` },
      ],
      saved: this.ok + this.bad >= 5,
    };
  }
}

// --- Same (two rhythms) ----------------------------------------------------------------

const SAME_TRIALS = 16;
/** One grid step of the rhythms (ms): eighth notes at 100 bpm. */
const STEP = 300;
const SLOTS = 8;

class Same implements Mini {
  private env!: MiniEnv;
  private trial = 0;
  private notes = 4;
  private a: number[] = [];
  private b: number[] = [];
  private same = true;
  /** 0 gap, 1 playing, 2 answer, 3 feedback. */
  private state = 0;
  private at = 0;
  private t0 = 0;
  private visual = false;
  private right = 0;
  private streak = 0;
  private lastOk = true;
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.visual = env.muted || !env.soundAt;
    this.at = now + 800;
  }

  private rhythm(): number[] {
    const slots = new Set<number>([0]);
    while (slots.size < this.notes) slots.add(rint(1, SLOTS - 1));
    return [...slots].sort((x, y) => x - y);
  }

  private play(now: number): void {
    this.a = this.rhythm();
    this.same = Math.random() < 0.5;
    this.b = [...this.a];
    if (!this.same) {
      // Move one note (not the first) to an empty slot next to it.
      for (let tries = 0; tries < 40; tries++) {
        const i = rint(1, this.b.length - 1);
        const to = this.b[i]! + (Math.random() < 0.5 ? -1 : 1);
        if (to > 0 && to < SLOTS && !this.b.includes(to)) {
          this.b[i] = to;
          this.b.sort((x, y) => x - y);
          break;
        }
      }
      if (this.b.join() === this.a.join()) this.same = true;
    }
    this.t0 = now + 150;
    if (!this.visual) {
      for (const s of this.a) this.env.soundAt!(SND_BEAT, 150 + s * STEP);
      for (const s of this.b) this.env.soundAt!(SND_BEAT, 150 + (SLOTS + 4 + s) * STEP);
    }
    this.state = 1;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (s === 0 || this.state !== 2) return;
    const ok = (s < 0) === this.same;
    this.lastOk = ok;
    if (ok) {
      this.right++;
      if (++this.streak % 2 === 0) this.notes = Math.min(7, this.notes + 1);
    } else {
      this.streak = 0;
      this.notes = Math.max(3, this.notes - 1);
    }
    this.env.sound(ok ? SND_CATCH : SND_FALSE);
    this.trial++;
    this.state = 3;
    this.at = ts + 1400;
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.at) this.play(now);
    else if (this.state === 1 && now > this.t0 + (2 * SLOTS + 4) * STEP) this.state = 2;
    else if (this.state === 3 && now >= this.at) {
      if (this.trial >= scaled(SAME_TRIALS)) return true;
      this.state = 0;
      this.at = now + 500;
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'notes', String(this.notes), 'pair', `${Math.min(this.trial + 1, scaled(SAME_TRIALS))} / ${scaled(SAME_TRIALS)}`);
    const gw = Math.min(36 * a.u, (a.right - a.left) / (SLOTS + 2));
    const rows: [number[], number, string][] = [[this.a, 0, 'first'], [this.b, SLOTS + 4, 'second']];
    rows.forEach(([r, startSlot, label], row) => {
      const y = a.cy - 50 * a.u + row * 70 * a.u;
      const x0 = a.cx - (SLOTS * gw) / 2;
      ctx.fillStyle = COL_DIM;
      v.text(label, x0 - 14 * a.u, y + 4 * dpr, v.fontTiny, 'right');
      for (let i = 0; i < SLOTS; i++) {
        const x = x0 + (i + 0.5) * gw;
        const t = this.t0 + (startSlot + i) * STEP;
        const now_ = this.state === 1 && now >= t && now < t + STEP;
        const hasNote = r.includes(i);
        // While playing, a cursor runs along; notes are only drawn by eye with sound off, or after.
        const reveal = this.state === 3 || (this.visual && this.state === 1 && now >= t);
        ctx.fillStyle = now_ ? COL_LINE : COL_DIM;
        ctx.fillRect(x - gw * 0.4, y + 14 * a.u, gw * 0.8, (now_ ? 3 : 2) * dpr);
        if (hasNote && reveal) {
          const differs = this.state === 3 && !this.same && row === 1 && !this.a.includes(i);
          ctx.fillStyle = differs ? COL_ACCENT : COL_LINE;
          ctx.beginPath();
          ctx.arc(x, y, (this.visual && now_ ? 9 : 6) * a.u, 0, TAU);
          ctx.fill();
        }
      }
    });
    ctx.fillStyle = COL_MID;
    if (this.state === 1) v.text(this.visual ? 'watch the two rhythms (sound is off)' : 'listen to the two rhythms', a.cx, a.cy + 70 * a.u, v.fontTiny, 'center');
    else if (this.state === 2) {
      ctx.fillStyle = COL_LINE;
      v.text('the same, or different?', a.cx, a.cy + 70 * a.u, v.fontHud, 'center');
    } else if (this.state === 3) {
      ctx.fillStyle = this.lastOk ? COL_MID : COL_ACCENT;
      v.text(this.lastOk ? 'right' : this.same ? 'they were the same' : 'they were different', a.cx, a.cy + 70 * a.u, v.fontTiny, 'center');
    }
    const off = Math.min(200 * a.u, (a.right - a.left) / 2 - 30 * a.u);
    ctx.fillStyle = COL_MID;
    v.text(`${handLabel(this.env, -1)}  same`, a.cx - off, a.bottom - 6 * a.u, v.fontTiny, 'center');
    v.text(`different  ${handLabel(this.env, 1)}`, a.cx + off, a.bottom - 6 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.right * 60 + this.notes * 30,
      primary: { label: 'pairs told apart', value: this.right, unit: `of ${this.trial}` },
      lines: [
        { label: 'right', value: `${this.right} of ${this.trial}` },
        { label: 'accuracy', value: this.trial ? pct(this.right / this.trial) : '–' },
        { label: 'longest rhythm reached', value: `${this.notes} notes` },
        ...(this.visual ? [{ label: 'note', value: 'played with sound off, by eye' }] : []),
      ],
      saved: this.trial >= 6,
    };
  }
}

// --- Ferry -----------------------------------------------------------------------------

const FERRY_TRIPS = 10;
const LANES = 5;

class Ferry implements Mini {
  private env!: MiniEnv;
  private trip = 0;
  /** Boat position: x across (0..1), y from the near bank (0) to the far (1). */
  private x = 0.5;
  private y = 0;
  private vx = 0;
  private current: number[] = [];
  private dock = 0.5;
  private dockW = 0.12;
  private held = 0;
  private last = 0;
  private state = 0;
  private at = 0;
  private docked = 0;
  private misses: number[] = [];
  private result_ = '';
  private firstAt = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.arm(now);
    this.firstAt = now;
  }

  private arm(now: number): void {
    const strength = 0.12 + this.trip * 0.025;
    this.current = Array.from({ length: LANES }, () => rnd(-1, 1) * strength);
    this.dock = rnd(0.2, 0.8);
    this.dockW = Math.max(0.07, 0.13 - this.trip * 0.005);
    this.x = rnd(0.25, 0.75);
    this.y = 0;
    this.vx = 0;
    this.state = 0;
    this.at = now + 900;
    this.last = now;
  }

  press(slot: number): void {
    this.held |= 1 << slot;
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  private steer(): number {
    let s = 0;
    for (let k = 0; k < 6; k++) if (this.held & (1 << k)) s += sideOf(k);
    return Math.sign(s);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.state === 0 && now >= this.at) this.state = 1;
    if (this.state === 1) {
      const lane = Math.min(LANES - 1, Math.floor(this.y * LANES));
      // The engine pushes sideways against a little drag; the current carries the boat.
      this.vx += this.steer() * 0.9 * dt;
      this.vx *= Math.pow(0.35, dt);
      this.x += (this.vx + this.current[lane]!) * dt;
      this.y += 0.11 * dt;
      if (this.x < 0 || this.x > 1) {
        this.misses.push(1);
        this.result_ = 'swept away';
        this.env.sound(SND_FALL);
        this.state = 2;
        this.at = now + 1300;
      } else if (this.y >= 1) {
        const off = Math.abs(this.x - this.dock);
        if (off <= this.dockW / 2) {
          this.docked++;
          this.misses.push(off);
          this.result_ = 'docked';
          this.env.sound(SND_CATCH);
        } else {
          this.misses.push(off);
          this.result_ = this.x < this.dock ? 'missed: too far left' : 'missed: too far right';
          this.env.sound(SND_FALSE);
        }
        this.y = 1;
        this.state = 2;
        this.at = now + 1300;
      }
    } else if (this.state === 2 && now >= this.at) {
      this.trip++;
      if (this.trip >= scaled(FERRY_TRIPS)) return true;
      this.arm(now);
    }
    if (now - this.firstAt > 600000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'docked', String(this.docked), 'trip', `${Math.min(this.trip + 1, scaled(FERRY_TRIPS))} / ${scaled(FERRY_TRIPS)}`);
    const W = Math.min(a.right - a.left, 640 * a.u);
    const x0 = a.cx - W / 2;
    const top = a.top + 26 * a.u;
    const bot = a.bottom - 36 * a.u;
    const H = bot - top;
    // The water, lane by lane, with streaks drifting at each lane's current.
    for (let l = 0; l < LANES; l++) {
      const y1 = bot - ((l + 1) / LANES) * H;
      const c = this.current[l]!;
      ctx.fillStyle = l % 2 ? '#101318' : '#0d1015';
      ctx.fillRect(x0, y1, W, H / LANES);
      ctx.fillStyle = '#26303c';
      for (let k = 0; k < 7; k++) {
        const p = (((k / 7 + (c * now) / 1000 / 1) % 1) + 1) % 1;
        const len = Math.min(60, 8 + Math.abs(c) * 160) * a.u;
        ctx.fillRect(x0 + p * W - (c > 0 ? len : 0), y1 + (H / LANES) * (0.3 + 0.4 * ((k * 37) % 7) / 7), len, 2 * dpr);
      }
    }
    // Banks and the dock.
    ctx.fillStyle = '#2a2a30';
    ctx.fillRect(x0, top - 10 * a.u, W, 10 * a.u);
    ctx.fillRect(x0, bot, W, 10 * a.u);
    ctx.fillStyle = COL_LINE;
    ctx.fillRect(x0 + (this.dock - this.dockW / 2) * W, top - 12 * a.u, this.dockW * W, 12 * a.u);
    // The boat.
    const bx = x0 + this.x * W;
    const by = bot - this.y * H;
    ctx.fillStyle = COL_ACCENT;
    ctx.beginPath();
    ctx.moveTo(bx, by - 12 * a.u);
    ctx.lineTo(bx + 7 * a.u, by + 6 * a.u);
    ctx.lineTo(bx - 7 * a.u, by + 6 * a.u);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = COL_MID;
    if (this.state === 2) v.text(this.result_, a.cx, a.bottom - 6 * a.u, v.fontTiny, 'center');
    else if (this.trip === 0) v.text('hold left or right to steer; the streaks show which way each band of water flows', a.cx, a.bottom - 6 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const n = this.misses.length;
    return {
      score: this.docked * 100 + Math.round(n ? Math.max(0, 0.3 - tailMean(this.misses, n)) * 300 : 0),
      primary: { label: 'docked', value: this.docked, unit: `of ${n}` },
      lines: [
        { label: 'docked', value: `${this.docked} of ${n}` },
        { label: 'typical distance from the dock', value: n ? `${Math.round(median(this.misses) * 100)}% of the river` : '–' },
      ],
      saved: n >= 3,
    };
  }
}

export const BATCH51: MiniDef[] = [
  { id: 'area', name: 'Area', skill: 'judgement', blurb: 'Two different shapes. Which covers more ground?', how: 'Two different shapes, like a circle and a triangle, turned any way. Press the side of the one with more area. Get them right and the difference shrinks; miss and it grows. Thirty pairs; scored on the smallest difference you can still see.', input: 'keys', minKeys: 2, make: () => new Area() },
  { id: 'logic', name: 'Logic', skill: 'reasoning', blurb: 'Lights A, B, C and a statement like “A and not B”. True or false?', how: 'Two or three lights, each lit (true) or dark (false), and a statement about them, like “A and not B” or “not (A or C)”. Press right if it is true, left if false. Four right in a row and the statements get harder; a mistake shows the answer and steps back. A minute.', input: 'keys', minKeys: 2, make: () => new Logic() },
  { id: 'same', name: 'Same', skill: 'ear', blurb: 'Two short rhythms, one after the other. The same, or different?', how: 'Two short rhythms play one after the other. Left if they were the same, right if different: when they differ, one note has moved by a single step. Get them right and the rhythms grow longer. Sixteen pairs. Best with sound; with it off the notes flash instead.', input: 'keys', minKeys: 2, make: () => new Same() },
  { id: 'ferry', name: 'Ferry', skill: 'coordination', blurb: 'Steer a ferry across a river whose current changes band by band, into the dock.', how: 'The ferry crosses the river by itself; hold left or right to push it sideways. Each band of water flows its own way and speed (watch the streaks), so you steer ahead of the current. Bring it into the white dock on the far bank. Currents get stronger and docks smaller. Ten crossings.', input: 'keys', minKeys: 2, make: () => new Ferry() },
];
