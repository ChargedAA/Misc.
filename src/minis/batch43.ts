// Forty-third batch.
//   Spin   - rings turn, each with a gap. Launch the ball when every gap lines up.
//   Turned - a word shown mirrored or upside down: a real word, or not?
//   Gears  - a train of gears: which way does the last one turn?
//   Pipes  - turn the tiles to join the pipe from start to finish.

import { COL_ACCENT, COL_DIM, COL_FAINT, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALSE, SND_TAP_L, SND_TAP_R, SND_TAP_WEAK } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, header, median, ms, pct, scaled, shown, sideOf, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';
import { ENGLISH_5K } from './words.ts';

const TAU = Math.PI * 2;
const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const rint = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]!;
type Rect = [number, number, number, number];
const inside = (r: Rect, x: number, y: number) => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
const wrapAng = (x: number) => Math.atan2(Math.sin(x), Math.cos(x));

// --- Spin ------------------------------------------------------------------------------

const SPIN_SHOTS = 20;

class Spin implements Mini {
  private env!: MiniEnv;
  private rings: { speed: number; phase: number; gap: number }[] = [];
  private i = 0;
  private hits = 0;
  private state = 0; // 0 aiming, 1 flight, 2 feedback
  private at = 0;
  private flight = 0;
  private ok = false;
  private blockedBy = -1;
  private held = 0;
  private level = 1;
  private streak = 0;
  private t0 = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.arm(now);
  }

  private arm(now: number): void {
    const n = Math.min(4, 1 + Math.floor((this.level + 1) / 2));
    this.rings = Array.from({ length: n }, (_, k) => ({
      speed: (k % 2 ? -1 : 1) * rnd(0.5, 1.1) * (1 + this.level * 0.08),
      phase: rnd(0, TAU),
      gap: Math.max(0.35, 0.8 - this.level * 0.04),
    }));
    this.state = 0;
    this.t0 = now;
  }

  /** Each ring's gap centre at a time: rings turn at their own speeds. */
  private gapAngle(k: number, t: number): number {
    const r = this.rings[k]!;
    return r.phase + r.speed * ((t - this.t0) / 1000);
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (sideOf(slot) === 0) return;
    this.launch(ts);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  pointer(_x: number, _y: number, ts: number): void {
    this.launch(ts);
  }

  private launch(ts: number): void {
    if (this.state !== 0) return;
    this.state = 1;
    this.flight = ts;
    this.env.sound(SND_TAP_L);
    // The ball flies straight up; it meets ring k after a short time. It passes if the gap is there then.
    this.ok = true;
    this.blockedBy = -1;
    for (let k = 0; k < this.rings.length; k++) {
      const meet = ts + (k + 1) * 90;
      const d = Math.abs(wrapAng(this.gapAngle(k, meet) - -Math.PI / 2));
      if (d > this.rings[k]!.gap / 2) {
        this.ok = false;
        this.blockedBy = k;
        break;
      }
    }
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 1 && now - this.flight > (this.rings.length + 1) * 90 + 150) {
      this.i++;
      if (this.ok) {
        this.hits++;
        this.streak++;
        if (this.streak >= 2) {
          this.level++;
          this.streak = 0;
        }
        this.env.sound(SND_CATCH);
      } else {
        this.streak = 0;
        this.env.sound(SND_FALSE);
      }
      this.state = 2;
      this.at = now + 700;
    }
    if (this.state === 2 && now >= this.at) {
      if (this.i >= scaled(SPIN_SHOTS)) return true;
      this.arm(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'through', `${this.hits} of ${this.i}`, 'rings', String(this.rings.length));
    const cx = a.cx;
    const cy = a.cy + 20 * a.u;
    const R0 = Math.min(a.bottom - a.top, a.right - a.left) * 0.12;
    const step = Math.min(a.bottom - a.top, a.right - a.left) * 0.09;
    const tv = this.state === 1 ? this.flight : shown(now);
    this.rings.forEach((r, k) => {
      const rad = R0 + k * step;
      const g = this.gapAngle(k, tv);
      ctx.strokeStyle = this.state === 2 && this.blockedBy === k ? COL_ACCENT : COL_LINE;
      ctx.lineWidth = 6 * dpr;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, g + r.gap / 2, g - r.gap / 2 + TAU);
      ctx.stroke();
    });
    // The launch line straight up, and the ball.
    ctx.strokeStyle = COL_FAINT;
    ctx.lineWidth = dpr;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy - R0 - this.rings.length * step - 20 * a.u);
    ctx.stroke();
    let by = cy;
    if (this.state >= 1) {
      const p = (now - this.flight) / 90;
      const stop = this.ok ? this.rings.length + 1.5 : this.blockedBy + 0.85;
      by = cy - Math.min(p, stop) * step - (Math.min(p, stop) > 0 ? R0 - step : 0);
    }
    ctx.fillStyle = COL_ACCENT;
    ctx.beginPath();
    ctx.arc(cx, by, 7 * a.u, 0, TAU);
    ctx.fill();
    ctx.fillStyle = COL_MID;
    v.text(this.i < 2 ? 'press (or tap) to launch the ball upward when every gap is at the top' : this.state === 2 ? (this.ok ? 'through' : 'blocked') : '', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.hits * 50 + this.level * 30,
      primary: { label: 'shots through', value: this.hits, unit: `of ${this.i}` },
      lines: [
        { label: 'through', value: `${this.hits} of ${this.i}  (${pct(this.hits / Math.max(1, this.i))})` },
        { label: 'level reached', value: `${this.level} (${this.rings.length} rings)` },
      ],
      saved: this.i >= 4,
    };
  }
}

// --- Turned (lexical decision on transformed words) ------------------------------------

const TURNED_TRIALS = 40;
const VOWELS = 'aeiou';

/** A pronounceable non-word: a real word with one letter swapped for a similar one. */
function nonword(w: string): string {
  for (let tries = 0; tries < 20; tries++) {
    const k = rint(0, w.length - 1);
    const c = w[k]!;
    const pool = VOWELS.includes(c) ? VOWELS : 'bcdfghklmnprstvw';
    const r = pick([...pool].filter((x) => x !== c));
    const out = w.slice(0, k) + r + w.slice(k + 1);
    if (!ENGLISH_5K.includes(out)) return out;
  }
  return w.split('').reverse().join('');
}

class Turned implements Mini {
  private env!: MiniEnv;
  private i = 0;
  private word = '';
  private real = true;
  /** 0 normal, 1 mirrored, 2 upside down, 3 rotated half way (both). */
  private how = 0;
  private state = 0;
  private at = 0;
  private next = 0;
  private rtsBy: number[][] = [[], [], [], []];
  private right = 0;
  private wrong = 0;
  private held = 0;
  private last = '';

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.next = now + 700;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (s === 0 || this.state !== 1) return;
    const ok = (s > 0) === this.real;
    if (ok) {
      this.right++;
      this.rtsBy[this.how]!.push(ts - this.at);
    } else this.wrong++;
    this.last = ok ? '' : `${this.word.toUpperCase()} is ${this.real ? '' : 'not '}a word`;
    this.env.sound(ok ? (s < 0 ? SND_TAP_L : SND_TAP_R) : SND_FALSE);
    this.i++;
    this.state = 2;
    this.next = ts + (ok ? 300 : 1100);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state !== 1 && now >= this.next) {
      if (this.i >= scaled(TURNED_TRIALS)) return true;
      const w = pick(ENGLISH_5K.filter((x) => x.length >= 4 && x.length <= 7 && /^[a-z]+$/.test(x)));
      this.real = Math.random() < 0.5;
      this.word = this.real ? w : nonword(w);
      this.how = this.i < 6 ? rint(0, 1) : rint(0, 3);
      this.state = 1;
      this.at = now;
    }
    if (this.state === 1 && now - this.at > 3000) {
      this.wrong++;
      this.i++;
      this.last = 'too slow';
      this.state = 2;
      this.next = now + 800;
      this.env.sound(SND_FALSE);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'right', String(this.right), 'word', `${Math.min(this.i + 1, scaled(TURNED_TRIALS))} / ${scaled(TURNED_TRIALS)}`);
    if (this.state === 1) {
      ctx.save();
      ctx.translate(a.cx, a.cy - 10 * a.u);
      if (this.how === 1) ctx.scale(-1, 1);
      else if (this.how === 2) ctx.scale(1, -1);
      else if (this.how === 3) ctx.rotate(Math.PI);
      ctx.font = `600 ${Math.round(54 * a.u)}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = COL_LINE;
      ctx.fillText(this.word.toUpperCase(), 0, 0);
      ctx.restore();
    } else if (this.last) {
      ctx.fillStyle = COL_MID;
      v.text(this.last, a.cx, a.cy - 10 * a.u, v.fontHud, 'center');
    }
    ctx.fillStyle = COL_MID;
    v.text('not a word (left)   ·   a real word (right)', a.cx, a.cy + 60 * a.u, v.fontTiny, 'center');
    if (this.i < 2) v.text('words come mirrored, upside down or turned round: read them anyway', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const med = (k: number) => (this.rtsBy[k]!.length ? median(this.rtsBy[k]!) : NaN);
    const all = this.rtsBy.flat();
    const names = ['as normal', 'mirrored', 'upside down', 'turned round'];
    return {
      score: all.length ? Math.round(Math.max(0, 2500 - median(all)) * (this.right / Math.max(1, this.i))) : 0,
      primary: { label: 'typical answer', value: all.length ? median(all) : 0, unit: 'ms', lower: true },
      lines: [0, 1, 2, 3].map((k) => ({ label: names[k]!, value: Number.isFinite(med(k)) ? ms(med(k)) : '–' })).concat([{ label: 'right', value: `${this.right} of ${this.i}` }]),
      rts: all,
      saved: this.i >= 8,
    };
  }
}

// --- Gears -----------------------------------------------------------------------------

const GEARS_TRIALS = 20;

interface Gear {
  x: number;
  y: number;
  r: number;
  teeth: number;
  /** Joined to the previous gear by a belt (same direction, or crossed: opposite) instead of teeth. */
  belt: 0 | 1 | 2;
}

class Gears implements Mini {
  private env!: MiniEnv;
  private gears: Gear[] = [];
  private i = 0;
  private answer = 1;
  private state = 0;
  private at = 0;
  private next = 0;
  private right = 0;
  private lives = 3;
  private rts: number[] = [];
  private held = 0;
  private turn = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.next = now + 500;
  }

  private make(w: number, h: number, x0: number, y0: number, u: number): void {
    const n = Math.min(9, 3 + Math.floor(this.i / 2));
    this.gears = [];
    let x = x0 + Math.min(h * 0.22, w / (n * 2.1)) + 10 * u;
    let y = y0 + h / 2;
    let dir = 1;
    for (let k = 0; k < n; k++) {
      // Sized so a train of this many spans most of the width.
      const r = rnd(0.7, 1.2) * Math.min(h * 0.22, w / (n * 2.1));
      const belt: 0 | 1 | 2 = k > 0 && this.i >= 6 && Math.random() < 0.25 ? (Math.random() < 0.5 ? 1 : 2) : 0;
      if (k > 0) {
        const prev = this.gears[k - 1]!;
        // Meshing gears touch; belted ones sit apart.
        const dist = belt ? prev.r + r + 40 * u : prev.r + r - 4 * u;
        const ang = rnd(-0.6, 0.6);
        x = prev.x + Math.cos(ang) * dist;
        y = Math.max(y0 + r + 10 * u, Math.min(y0 + h - r - 10 * u, prev.y + Math.sin(ang) * dist));
        if (x > x0 + w - r) break;
        dir = belt === 1 ? dir : -dir;
      }
      this.gears.push({ x, y, r, teeth: Math.round(r / (3.2 * u)), belt });
    }
    this.answer = dir;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (s === 0 || this.state !== 1) return;
    // Left: anticlockwise, right: clockwise.
    const ok = (s > 0 ? 1 : -1) === this.answer;
    if (ok) {
      this.right++;
      this.rts.push(ts - this.at);
      this.env.sound(SND_CATCH);
    } else {
      this.lives--;
      this.env.sound(SND_FALSE);
    }
    this.i++;
    this.state = 2;
    this.next = ts + (ok ? 1100 : 2000);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const a = arena(v, touch);
    if (this.state !== 1 && now >= this.next) {
      if (this.lives <= 0 || this.i >= scaled(GEARS_TRIALS)) return true;
      this.make(a.right - a.left, a.bottom - a.top - 60 * a.u, a.left, a.top, a.u);
      this.state = 1;
      this.at = now;
      this.turn = 0;
    }
    v.clear();
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'right', String(this.right), 'train', `${Math.min(this.i + 1, scaled(GEARS_TRIALS))} / ${scaled(GEARS_TRIALS)}`, this.lives);
    // After the answer, the whole train turns so you can see why.
    if (this.state === 2) this.turn += 0.03;
    let dir = 1;
    this.gears.forEach((g, k) => {
      if (k > 0) dir = g.belt === 1 ? dir : -dir;
      if (g.belt && k > 0) {
        const p = this.gears[k - 1]!;
        ctx.strokeStyle = COL_MID;
        ctx.lineWidth = 1.5 * dpr;
        ctx.beginPath();
        if (g.belt === 1) {
          ctx.moveTo(p.x, p.y - p.r * 0.6);
          ctx.lineTo(g.x, g.y - g.r * 0.6);
          ctx.moveTo(p.x, p.y + p.r * 0.6);
          ctx.lineTo(g.x, g.y + g.r * 0.6);
        } else {
          ctx.moveTo(p.x, p.y - p.r * 0.6);
          ctx.lineTo(g.x, g.y + g.r * 0.6);
          ctx.moveTo(p.x, p.y + p.r * 0.6);
          ctx.lineTo(g.x, g.y - g.r * 0.6);
        }
        ctx.stroke();
      }
      const rot = (this.turn * dir * 30 * a.u) / g.r;
      ctx.fillStyle = k === 0 ? '#3a3a41' : k === this.gears.length - 1 ? '#2c2c33' : '#1f1f24';
      ctx.strokeStyle = k === this.gears.length - 1 ? COL_ACCENT : COL_LINE;
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      for (let t = 0; t < g.teeth * 2; t++) {
        const a0 = rot + (t / (g.teeth * 2)) * TAU;
        const rr = t % 2 ? g.r : g.r + 4 * a.u;
        const a1 = rot + ((t + 1) / (g.teeth * 2)) * TAU;
        ctx.lineTo(g.x + Math.cos(a0) * rr, g.y + Math.sin(a0) * rr);
        ctx.lineTo(g.x + Math.cos(a1) * rr, g.y + Math.sin(a1) * rr);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = COL_DIM;
      ctx.beginPath();
      ctx.arc(g.x, g.y, 3 * dpr, 0, TAU);
      ctx.fill();
    });
    // The first gear's arrow: it turns clockwise.
    const g0 = this.gears[0];
    if (g0) {
      ctx.strokeStyle = COL_ACCENT;
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.arc(g0.x, g0.y, g0.r * 0.55, -2.4, 0.4);
      ctx.stroke();
      const ex = g0.x + Math.cos(0.4) * g0.r * 0.55;
      const ey = g0.y + Math.sin(0.4) * g0.r * 0.55;
      ctx.fillStyle = COL_ACCENT;
      ctx.beginPath();
      ctx.moveTo(ex - 6 * dpr, ey - 2 * dpr);
      ctx.lineTo(ex + 4 * dpr, ey - 4 * dpr);
      ctx.lineTo(ex, ey + 6 * dpr);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = COL_MID;
    v.text(this.state === 2 ? (this.answer > 0 ? 'clockwise' : 'anticlockwise') : 'the first gear turns clockwise. the orange one: anticlockwise (left) or clockwise (right)?', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.right * 80,
      primary: { label: 'trains right', value: this.right, unit: '' },
      lines: [
        { label: 'right', value: `${this.right} of ${this.i}` },
        { label: 'typical time a train', value: this.rts.length ? ms(median(this.rts)) : '–' },
      ],
      saved: this.i >= 3,
    };
  }
}

// --- Pipes -----------------------------------------------------------------------------

/** Tile openings as bits: 1 up, 2 right, 4 down, 8 left. */
const UP = 1;
const RIGHT = 2;
const DOWN = 4;
const LEFT = 8;
const rotBits = (b: number) => ((b << 1) | (b >> 3)) & 15;
const PIPES_MS = 120000;

class Pipes implements Mini {
  private env!: MiniEnv;
  private n = 4;
  private tiles: number[] = [];
  private solved = 0;
  private turns = 0;
  private t0 = 0;
  private started = false;
  private boardAt = 0;
  private times: number[] = [];
  private cells: Rect[] = [];
  private flashUntil = 0;
  private firstFrame = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.build(now);
  }

  /** A random path from the left edge (row 0) to the right edge (last row), then every tile turned at random. */
  private build(now: number): void {
    this.n = Math.min(7, 4 + Math.floor(this.solved / 2));
    const n = this.n;
    this.tiles = new Array(n * n).fill(0);
    // Random walk with no revisits, from (0,0) going right to (n-1, n-1).
    for (let tries = 0; tries < 200; tries++) {
      const path: [number, number][] = [[0, 0]];
      const seen = new Set(['0,0']);
      let ok = false;
      for (let step = 0; step < n * n * 3; step++) {
        const [x, y] = path[path.length - 1]!;
        if (x === n - 1 && y === n - 1) {
          ok = true;
          break;
        }
        const opts = ([[1, 0], [0, 1], [0, -1], [-1, 0]] as const)
          .map(([dx, dy]) => [x + dx, y + dy] as [number, number])
          .filter(([px, py]) => px >= 0 && py >= 0 && px < n && py < n && !seen.has(`${px},${py}`));
        if (!opts.length) break;
        // Lean right and down, so paths finish.
        const nxt = Math.random() < 0.6 ? opts[0]! : pick(opts);
        seen.add(`${nxt[0]},${nxt[1]}`);
        path.push(nxt);
      }
      if (!ok) continue;
      this.tiles.fill(0);
      path.forEach(([x, y], k) => {
        let bits = 0;
        const link = (p: [number, number] | undefined, fallback: number) => {
          if (!p) return fallback;
          return p[0] > x ? RIGHT : p[0] < x ? LEFT : p[1] > y ? DOWN : UP;
        };
        bits |= link(path[k - 1], LEFT);
        bits |= link(path[k + 1], RIGHT);
        this.tiles[y * n + x] = bits;
      });
      // Off-path tiles: random corners and straights, as decoys.
      for (let c = 0; c < n * n; c++) if (!this.tiles[c]) this.tiles[c] = pick([UP | DOWN, LEFT | RIGHT, UP | RIGHT, RIGHT | DOWN, DOWN | LEFT, LEFT | UP]);
      for (let c = 0; c < n * n; c++) for (let r = rint(1, 3); r > 0; r--) this.tiles[c] = rotBits(this.tiles[c]!);
      if (!this.connected()) break;
    }
    this.boardAt = now;
  }

  /** Is there a run of joined pipes from the left of the top-left tile to the right of the bottom-right one? */
  private connected(): boolean {
    const n = this.n;
    if (!(this.tiles[0]! & LEFT)) return false;
    const seen = new Set([0]);
    const stack = [0];
    while (stack.length) {
      const c = stack.pop()!;
      const x = c % n;
      const y = Math.floor(c / n);
      const b = this.tiles[c]!;
      if (c === n * n - 1 && b & RIGHT) return true;
      const moves: [number, number, number, number][] = [[UP, 0, -1, DOWN], [RIGHT, 1, 0, LEFT], [DOWN, 0, 1, UP], [LEFT, -1, 0, RIGHT]];
      for (const [bit, dx, dy, back] of moves) {
        const nx = x + dx;
        const ny = y + dy;
        if (!(b & bit) || nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
        const d = ny * n + nx;
        if (seen.has(d) || !(this.tiles[d]! & back)) continue;
        seen.add(d);
        stack.push(d);
      }
    }
    return false;
  }

  press(): void {}

  pointer(x: number, y: number, ts: number): void {
    if (!this.started) {
      this.started = true;
      this.t0 = ts;
      this.boardAt = ts;
    }
    if (ts < this.flashUntil) return;
    const c = this.cells.findIndex((r) => inside(r, x, y));
    if (c < 0) return;
    this.tiles[c] = rotBits(this.tiles[c]!);
    this.turns++;
    this.env.sound(SND_TAP_WEAK);
    if (this.connected()) {
      this.solved++;
      this.times.push((ts - this.boardAt) / 1000);
      this.env.sound(SND_CATCH);
      this.flashUntil = ts + 900;
    }
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    const len = scaled(PIPES_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.firstFrame > 180000) return true;
    if (this.flashUntil && now >= this.flashUntil) {
      this.flashUntil = 0;
      this.build(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'boards joined', String(this.solved), 'time', `${left} s`);
    const n = this.n;
    const size = Math.min(a.bottom - a.top - 30 * a.u, a.right - a.left - 80 * a.u);
    const cs = size / n;
    const x0 = a.cx - size / 2;
    const y0 = a.top + 4 * a.u;
    const done = this.flashUntil > 0;
    this.cells = [];
    for (let c = 0; c < n * n; c++) {
      const x = x0 + (c % n) * cs;
      const y = y0 + Math.floor(c / n) * cs;
      this.cells.push([x, y, cs, cs]);
      ctx.fillStyle = '#121215';
      ctx.fillRect(x + dpr, y + dpr, cs - 2 * dpr, cs - 2 * dpr);
      const b = this.tiles[c]!;
      ctx.strokeStyle = done ? COL_ACCENT : COL_LINE;
      ctx.lineWidth = cs * 0.18;
      ctx.lineCap = 'butt';
      ctx.beginPath();
      const mx = x + cs / 2;
      const my = y + cs / 2;
      if (b & UP) { ctx.moveTo(mx, my); ctx.lineTo(mx, y); }
      if (b & RIGHT) { ctx.moveTo(mx, my); ctx.lineTo(x + cs, my); }
      if (b & DOWN) { ctx.moveTo(mx, my); ctx.lineTo(mx, y + cs); }
      if (b & LEFT) { ctx.moveTo(mx, my); ctx.lineTo(x, my); }
      ctx.stroke();
      ctx.fillStyle = done ? COL_ACCENT : COL_LINE;
      ctx.beginPath();
      ctx.arc(mx, my, cs * 0.09, 0, TAU);
      ctx.fill();
    }
    // Start and finish.
    ctx.fillStyle = COL_ACCENT;
    ctx.fillRect(x0 - 26 * a.u, y0 + cs / 2 - cs * 0.09, 26 * a.u, cs * 0.18);
    ctx.fillRect(x0 + size, y0 + size - cs / 2 - cs * 0.09, 26 * a.u, cs * 0.18);
    ctx.fillStyle = COL_MID;
    v.text(done ? 'joined' : 'click a tile to turn it. join the pipe from the orange start (top left) to the end (bottom right)', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.solved * 100 + Math.max(0, 200 - this.turns),
      primary: { label: 'boards joined', value: this.solved, unit: '' },
      lines: [
        { label: 'boards joined', value: String(this.solved) },
        { label: 'typical time a board', value: this.times.length ? `${median(this.times).toFixed(1)} s` : '–' },
        { label: 'turns', value: String(this.turns) },
      ],
      saved: this.started && this.turns >= 3,
    };
  }
}

export const BATCH43: MiniDef[] = [
  { id: 'spin', name: 'Spin', skill: 'timing', blurb: 'Rings turn, each with a gap. Launch the ball when every gap lines up.', how: 'One or more rings turn around the ball, each with a gap, at their own speeds and directions. Press (or tap) to launch the ball straight up: it gets through only if every ring’s gap is at the top as the ball reaches it. Two through in a row and another ring joins, the gaps narrow and they spin faster. Twenty shots.', input: 'both', make: () => new Spin() },
  { id: 'turned', name: 'Turned', skill: 'attention', blurb: 'A word shown mirrored or upside down. A real word, or not?', how: 'A word appears, written backwards in a mirror, upside down or turned round. Is it a real English word (right) or a near miss with one letter changed (left)? Answer fast; the results show how much each kind of turn slows your reading. Forty words.', input: 'keys', minKeys: 2, make: () => new Turned() },
  { id: 'gears', name: 'Gears', skill: 'reasoning', blurb: 'A train of gears. Which way does the last one turn?', how: 'A chain of gears; the first turns clockwise. Meshing gears turn opposite ways; a straight belt keeps the direction, a crossed belt flips it. Which way does the orange gear turn: anticlockwise (left) or clockwise (right)? Trains get longer, and belts join in. Three wrong ends it.', input: 'keys', minKeys: 2, make: () => new Gears() },
  { id: 'pipes', name: 'Pipes', skill: 'reasoning', blurb: 'Turn the tiles to join the pipe from start to finish.', how: 'A grid of pipe tiles, each turned at random. Click a tile to turn it a quarter. Join a pipe from the orange start at the top left to the end at the bottom right. Each joined board brings a bigger one. Two minutes.', input: 'pointer', make: () => new Pipes() },
];
