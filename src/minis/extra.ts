// Third batch.
//   Aim    - tap targets as they appear, smaller as you get better.
//   Echo   - hear a rhythm, tap it back.
//   Path   - blocks light in sequence; tap them in order (sometimes backwards).
//   Rotate - same shape turned, or its mirror image?
//   Count  - how many dots were there, in that blink?
//   Juggle - every key keeps its own ball in the air.
//   Steady - tap fast and perfectly even for fifteen seconds.

import { COL_ACCENT, COL_DIM, COL_LINE, COL_MID } from '../config.ts';
import { SND_BEAT, SND_BEAT_UP, SND_CATCH, SND_FALL, SND_FALSE, SND_LURCH, SND_TAP_L, SND_TAP_R, SND_TAP_WEAK, SND_TONE } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import {
  Stair,
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
  sideOf,
  slotsOf,
  type Mini,
  type MiniDef,
  type MiniEnv,
  type MiniResult,
} from './kit.ts';

const STRIKES = 3;
const TAU = Math.PI * 2;

// --- Aim --------------------------------------------------------------------------

const AIM_TARGETS = 30;

class Aim implements Mini {
  private env!: MiniEnv;
  private x = 0.5;
  private y = 0.5;
  private appeared = 0;
  private hits = 0;
  private misses = 0;
  private times: number[] = [];
  private readonly size = new Stair(0.07, 0.006, 0.022, 0.09);
  private started = false;
  private geo = { x0: 0, y0: 0, w: 1, h: 1, s: 1 };
  private fade = 0;
  private fx = 0;
  private fy = 0;

  start(env: MiniEnv): void {
    this.env = env;
  }

  private place(now: number): void {
    const px = this.x;
    const py = this.y;
    do {
      this.x = 0.08 + Math.random() * 0.84;
      this.y = 0.08 + Math.random() * 0.84;
    } while (Math.hypot(this.x - px, this.y - py) < 0.25);
    this.appeared = now;
  }

  press(): void {}

  pointer(px: number, py: number, ts: number): void {
    const g = this.geo;
    const tx = g.x0 + this.x * g.w;
    const ty = g.y0 + this.y * g.h;
    const r = this.size.level * g.s;
    if (!this.started) {
      if (Math.hypot(px - tx, py - ty) <= r * 1.6) {
        this.started = true;
        this.env.sound(SND_TAP_WEAK);
        this.place(ts);
      }
      return;
    }
    if (Math.hypot(px - tx, py - ty) <= r) {
      this.hits++;
      this.times.push(ts - this.appeared);
      this.size.update(true, -1);
      this.fade = ts + 220;
      this.fx = tx;
      this.fy = ty;
      this.env.sound(SND_TONE + (this.hits % 7));
      this.place(ts);
    } else {
      this.misses++;
      this.size.update(false, -1);
      this.env.sound(SND_FALSE);
    }
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    // Thirty hits, or thirty misses for someone just clicking around.
    if (this.hits >= AIM_TARGETS || this.misses >= AIM_TARGETS) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'targets', `${this.hits} / ${AIM_TARGETS}`, 'median', this.times.length ? ms(median(this.times)) : '–');
    const w = a.right - a.left;
    const h = a.bottom - a.top;
    const g = (this.geo = { x0: a.left, y0: a.top, w, h, s: Math.min(w, h) });
    ctx.strokeStyle = COL_DIM;
    ctx.lineWidth = dpr;
    ctx.strokeRect(g.x0 + 0.5, g.y0 + 0.5, w - 1, h - 1);
    const r = this.size.level * g.s;
    const tx = g.x0 + this.x * w;
    const ty = g.y0 + this.y * h;
    if (now < this.fade) {
      ctx.strokeStyle = COL_MID;
      ctx.beginPath();
      ctx.arc(this.fx, this.fy, r * (1 + (1 - (this.fade - now) / 220)), 0, TAU);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(tx, ty, r, 0, TAU);
    if (this.started) {
      ctx.fillStyle = COL_ACCENT;
      ctx.fill();
    } else {
      ctx.strokeStyle = COL_LINE;
      ctx.lineWidth = 2 * dpr;
      ctx.stroke();
      message(v, { ...a, cy: ty + r + 30 * dpr }, 'tap the circle to start', '', COL_MID);
    }
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const med = median(this.times);
    const acc = this.hits / Math.max(1, this.hits + this.misses);
    return {
      score: med ? Math.round((60000 / med) * acc) : 0,
      primary: { label: 'median per target', value: med, unit: 'ms', lower: true },
      lines: [
        { label: 'median per target', value: ms(med) },
        { label: 'average', value: ms(mean(this.times)) },
        { label: 'accuracy', value: pct(acc) },
        { label: 'smallest target', value: `${Math.round(this.size.level * 1000) / 10}% of the board` },
      ],
      rts: this.times,
      saved: this.hits >= 8,
    };
  }
}

// --- Echo -------------------------------------------------------------------------

class Echo implements Mini {
  private env!: MiniEnv;
  private len = 3;
  private beat = 500; // ms per beat
  private pattern: number[] = []; // onset times in ms from the first
  private state = 0; // 0 playing, 1 your turn, 2 feedback
  private at = 0;
  private played = 0;
  private taps: number[] = [];
  private strikes = 0;
  private best = 0;
  private lastErr = 0;
  private passed = false;
  private errs: number[] = [];
  private held = 0;
  private flash = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.make(now + 800);
  }

  private make(at: number): void {
    this.beat = Math.round(60000 / (90 + Math.random() * 40));
    const step = this.beat / 2; // eighth notes
    // Onsets on an eighth-note grid, with gaps of one to three steps.
    this.pattern = [0];
    let t = 0;
    for (let i = 1; i < this.len; i++) {
      const r = Math.random();
      t += step * (r < 0.45 ? 1 : r < 0.85 ? 2 : 3);
      this.pattern.push(t);
    }
    this.state = 0;
    this.at = at;
    this.played = 0;
    this.taps = [];
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    this.tap(ts, slot);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  pointer(_x: number, _y: number, ts: number): void {
    this.tap(ts, 0);
  }

  private tap(ts: number, slot: number): void {
    if (this.state !== 1) return;
    this.taps.push(ts);
    this.flash = ts + 100;
    this.env.sound(sideOf(slot) > 0 ? SND_TAP_R : SND_TAP_L);
    if (this.taps.length === this.pattern.length) this.judge(ts);
  }

  private judge(now: number): void {
    // Compare the gaps between taps with the gaps in the pattern, in eighth notes.
    const step = this.beat / 2;
    const errs: number[] = [];
    for (let i = 1; i < this.pattern.length; i++) {
      const want = this.pattern[i]! - this.pattern[i - 1]!;
      const got = this.taps[i]! - this.taps[i - 1]!;
      errs.push(Math.abs(got - want) / step);
    }
    this.lastErr = mean(errs);
    this.passed = this.lastErr < 0.28 && errs.every((e) => e < 0.55);
    this.errs.push(this.lastErr);
    if (this.passed) {
      if (this.len > this.best) this.best = this.len;
      this.len++;
      this.env.sound(SND_CATCH);
    } else {
      this.strikes++;
      this.env.sound(SND_FALSE);
    }
    this.state = 2;
    this.at = now + 1500;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.at) {
      const t = now - this.at;
      while (this.played < this.pattern.length && t >= this.pattern[this.played]!) {
        this.env.sound(this.played === 0 ? SND_BEAT_UP : SND_BEAT);
        this.flash = now + 100;
        this.played++;
      }
      if (t > this.pattern[this.pattern.length - 1]! + this.beat) this.state = 1;
    }
    if (this.state === 1 && this.taps.length > 0 && now - this.taps[this.taps.length - 1]! > this.beat * 3) {
      // Stopped early: judge with what there is (a wrong count fails).
      this.lastErr = 1;
      this.passed = false;
      this.strikes++;
      this.env.sound(SND_FALSE);
      this.state = 2;
      this.at = now + 1500;
    }
    if (this.state === 2 && now >= this.at) {
      if (this.strikes >= STRIKES) return true;
      this.make(now + 500);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'notes', String(this.len), 'best', String(this.best), STRIKES - this.strikes);
    const span = Math.min(a.right - a.left, 560 * a.u);
    const x0 = a.cx - span / 2;
    const total = this.pattern[this.pattern.length - 1]! || 1;
    const xOf = (t: number) => x0 + (t / total) * span;
    // The pattern as dots on a line; revealed as it plays.
    const y1 = a.cy - 30 * a.u;
    const y2 = a.cy + 30 * a.u;
    ctx.fillStyle = COL_DIM;
    ctx.fillRect(x0, y1, span, dpr);
    ctx.fillRect(x0, y2, span, dpr);
    for (let i = 0; i < this.pattern.length; i++) {
      const shown = this.state !== 0 || i < this.played;
      ctx.beginPath();
      ctx.arc(xOf(this.pattern[i]!), y1, 7 * a.u, 0, TAU);
      if (shown) {
        ctx.fillStyle = COL_LINE;
        ctx.fill();
      } else {
        ctx.strokeStyle = COL_DIM;
        ctx.lineWidth = dpr;
        ctx.stroke();
      }
    }
    // Your taps, aligned on the first.
    if (this.taps.length) {
      const t0 = this.taps[0]!;
      ctx.fillStyle = this.state === 2 ? (this.passed ? COL_LINE : COL_MID) : COL_ACCENT;
      for (const t of this.taps) {
        ctx.beginPath();
        ctx.arc(xOf(clamp(t - t0, 0, total * 1.3)), y2, 7 * a.u, 0, TAU);
        ctx.fill();
      }
    }
    ctx.fillStyle = COL_MID;
    const status = this.state === 0 ? 'listen' : this.state === 1 ? `tap it back  ${this.taps.length} / ${this.pattern.length}` : this.passed ? `yes, ${Math.round(this.lastErr * 100)}% off` : 'not quite';
    v.text(status, a.cx, y1 - 26 * dpr, v.fontTiny, 'center');
    if (now < this.flash) {
      ctx.strokeStyle = this.state === 1 ? COL_ACCENT : COL_LINE;
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.arc(a.cx, a.cy + 90 * a.u, 14 * a.u, 0, TAU);
      ctx.stroke();
    }
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.best * 100 + Math.round(Math.max(0, 0.3 - mean(this.errs)) * 300),
      primary: { label: 'longest rhythm', value: this.best, unit: 'notes' },
      lines: [
        { label: 'longest rhythm copied', value: `${this.best} notes` },
        { label: 'average timing error', value: pct(mean(this.errs.filter((e) => e < 1))) },
        { label: 'patterns tried', value: String(this.errs.length) },
      ],
      saved: this.errs.length >= 2,
    };
  }
}

// --- Path (Corsi blocks) ----------------------------------------------------------

const PATH_BLOCKS = 9;

class Path implements Mini {
  private env!: MiniEnv;
  private bx: number[] = [];
  private by: number[] = [];
  private len = 3;
  private seq: number[] = [];
  private reverse = false;
  private round = 0;
  private state = 0; // 0 show, 1 input, 2 feedback
  private at = 0;
  private pos = 0;
  private strikes = 0;
  private best = 0;
  private bestBack = 0;
  private lit = -1;
  private litUntil = 0;
  private ok = true;
  private geo = { x0: 0, y0: 0, s: 1 };

  start(env: MiniEnv, now: number): void {
    this.env = env;
    // Nine blocks scattered over the board, not on a grid, not touching.
    while (this.bx.length < PATH_BLOCKS) {
      const x = 0.1 + Math.random() * 0.8;
      const y = 0.1 + Math.random() * 0.8;
      if (this.bx.every((bx, i) => Math.hypot(bx - x, this.by[i]! - y) > 0.2)) {
        this.bx.push(x);
        this.by.push(y);
      }
    }
    this.next(now + 700);
  }

  private next(at: number): void {
    this.round++;
    this.reverse = this.round > 2 && this.round % 3 === 0;
    this.seq = [];
    while (this.seq.length < this.len) {
      const b = Math.floor(Math.random() * PATH_BLOCKS);
      if (b !== this.seq[this.seq.length - 1]) this.seq.push(b);
    }
    this.state = 0;
    this.at = at;
    this.pos = 0;
  }

  press(): void {}

  pointer(px: number, py: number, ts: number): void {
    if (this.state !== 1) return;
    const g = this.geo;
    const half = 0.06 * g.s;
    let hit = -1;
    for (let i = 0; i < PATH_BLOCKS; i++) {
      const cx = g.x0 + this.bx[i]! * g.s;
      const cy = g.y0 + this.by[i]! * g.s;
      if (Math.abs(px - cx) <= half && Math.abs(py - cy) <= half) hit = i;
    }
    if (hit < 0) return;
    const want = this.reverse ? this.seq[this.seq.length - 1 - this.pos]! : this.seq[this.pos]!;
    this.lit = hit;
    this.litUntil = ts + 200;
    if (hit === want) {
      this.ok = true;
      this.pos++;
      this.env.sound(SND_TONE + (this.pos % 7));
      if (this.pos === this.seq.length) {
        if (this.reverse) this.bestBack = Math.max(this.bestBack, this.len);
        else this.best = Math.max(this.best, this.len);
        this.len++;
        this.state = 2;
        this.at = ts + 800;
        this.env.sound(SND_CATCH);
      }
    } else {
      this.ok = false;
      this.strikes++;
      this.env.sound(SND_FALSE);
      this.state = 2;
      this.at = ts + 1200;
    }
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const step = Math.max(420, 750 - this.len * 25);
    let showing = -1;
    if (this.state === 0 && now >= this.at) {
      const k = Math.floor((now - this.at) / step);
      if (k >= this.seq.length) this.state = 1;
      else if ((now - this.at) % step < step * 0.65) {
        showing = this.seq[k]!;
        if (this.lit !== k + 100) {
          this.lit = k + 100;
          this.env.sound(SND_BEAT);
        }
      }
    }
    if (this.state === 2 && now >= this.at) {
      if (this.strikes >= STRIKES) return true;
      this.next(now + 400);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'length', String(this.len), 'best', String(this.best), STRIKES - this.strikes);
    const s = Math.min(a.bottom - a.top - 30 * a.u, a.right - a.left, 540 * a.u);
    const g = (this.geo = { x0: a.cx - s / 2, y0: a.cy - s / 2 + 12 * a.u, s });
    const half = 0.06 * s;
    for (let i = 0; i < PATH_BLOCKS; i++) {
      const cx = g.x0 + this.bx[i]! * s;
      const cy = g.y0 + this.by[i]! * s;
      if (showing === i) {
        ctx.fillStyle = COL_ACCENT;
        ctx.fillRect(cx - half, cy - half, half * 2, half * 2);
      } else if (this.lit === i && now < this.litUntil) {
        ctx.fillStyle = this.ok ? COL_LINE : COL_MID;
        ctx.fillRect(cx - half, cy - half, half * 2, half * 2);
      } else {
        ctx.strokeStyle = COL_MID;
        ctx.lineWidth = dpr;
        ctx.strokeRect(cx - half + 0.5, cy - half + 0.5, half * 2 - 1, half * 2 - 1);
      }
    }
    ctx.fillStyle = this.reverse ? COL_ACCENT : COL_MID;
    const status = this.state === 0 ? (this.reverse ? 'watch: then tap it BACKWARDS' : 'watch') : this.state === 1 ? `${this.reverse ? 'backwards  ' : ''}${this.pos} / ${this.seq.length}` : this.ok ? 'yes' : 'wrong block';
    v.text(status, a.cx, g.y0 - 10 * dpr, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.best * 100 + this.bestBack * 120,
      primary: { label: 'span', value: this.best, unit: 'blocks' },
      lines: [
        { label: 'longest path forwards', value: String(this.best) },
        { label: 'longest path backwards', value: this.bestBack ? String(this.bestBack) : '–' },
      ],
      saved: this.round >= 2,
    };
  }
}

// --- Rotate -----------------------------------------------------------------------

const ROTATE_TRIALS = 30;

/** A random chiral shape: six cells grown from a random walk. */
function randomShape(): [number, number][] {
  for (;;) {
    const cells: [number, number][] = [[0, 0]];
    while (cells.length < 6) {
      const [x, y] = cells[Math.floor(Math.random() * cells.length)]!;
      const d = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ][Math.floor(Math.random() * 4)]!;
      const n: [number, number] = [x + d[0]!, y + d[1]!];
      if (!cells.some((c) => c[0] === n[0] && c[1] === n[1])) cells.push(n);
    }
    if (chiral(cells)) return cells;
  }
}

function norm(cells: [number, number][]): string {
  const mx = Math.min(...cells.map((c) => c[0]));
  const my = Math.min(...cells.map((c) => c[1]));
  return cells
    .map((c) => `${c[0] - mx},${c[1] - my}`)
    .sort()
    .join(' ');
}

/** True if no rotation of the shape equals its mirror image. */
function chiral(cells: [number, number][]): boolean {
  const mirror = norm(cells.map(([x, y]) => [-x, y]));
  let r = cells;
  for (let k = 0; k < 4; k++) {
    if (norm(r) === mirror) return false;
    r = r.map(([x, y]) => [-y, x]);
  }
  return true;
}

class Rotate implements Mini {
  private env!: MiniEnv;
  private cells: [number, number][] = [];
  private angle = 0;
  private mirror = false;
  private i = 0;
  private state = 0;
  private at = 0;
  private drawnAt = 0;
  private rts: { angle: number; rt: number }[] = [];
  private errors = 0;
  private slow = 0;
  private feedback = '';
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.arm(now + 500);
  }

  private arm(now: number): void {
    this.cells = randomShape();
    this.angle = [0, 45, 90, 135, 180, 225, 270, 315][Math.floor(Math.random() * 8)]!;
    this.mirror = Math.random() < 0.5;
    this.state = 0;
    this.at = now + 300;
    this.drawnAt = 0;
  }

  private end(now: number, ok: boolean, rt: number): void {
    this.i++;
    this.state = 2;
    this.at = now + (ok ? 300 : 1100);
    if (ok) {
      const a = this.angle > 180 ? 360 - this.angle : this.angle;
      this.rts.push({ angle: a, rt });
      this.env.sound(SND_TAP_WEAK);
      this.feedback = '';
    } else {
      this.env.sound(SND_FALSE);
    }
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (this.state !== 1 || this.drawnAt === 0) return;
    const side = sideOf(slot);
    if (side === 0) return;
    const rt = ts - this.drawnAt;
    const sayMirror = side > 0;
    if (sayMirror === this.mirror) this.end(ts, true, rt);
    else {
      this.errors++;
      this.feedback = this.mirror ? 'it was the mirror image' : 'it was the same shape, turned';
      this.end(ts, false, 0);
    }
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  private drawShape(v: View, cells: [number, number][], cx: number, cy: number, cell: number, angle: number, mirror: boolean): void {
    const ctx = v.ctx;
    const xs = cells.map((c) => c[0]);
    const ys = cells.map((c) => c[1]);
    const mx = (Math.min(...xs) + Math.max(...xs) + 1) / 2;
    const my = (Math.min(...ys) + Math.max(...ys) + 1) / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((angle * Math.PI) / 180);
    if (mirror) ctx.scale(-1, 1);
    ctx.fillStyle = COL_LINE;
    for (const [x, y] of cells) ctx.fillRect((x - mx) * cell + 1, (y - my) * cell + 1, cell - 2, cell - 2);
    ctx.restore();
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.at) this.state = 1;
    if (this.state === 1 && this.drawnAt > 0 && now - this.drawnAt > 6000) {
      this.slow++;
      this.feedback = 'too slow';
      this.end(now, false, 0);
    }
    if (this.state === 2 && now >= this.at) {
      if (this.i >= ROTATE_TRIALS) return true;
      this.arm(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'trial', `${Math.min(this.i + 1, ROTATE_TRIALS)} / ${ROTATE_TRIALS}`, 'correct', this.i ? pct((this.i - this.errors - this.slow) / this.i) : '–');
    const cell = Math.min(34 * a.u, (a.right - a.left) / 14);
    if (this.state === 1) {
      this.drawShape(v, this.cells, a.cx - 140 * a.u, a.cy, cell, 0, false);
      this.drawShape(v, this.cells, a.cx + 140 * a.u, a.cy, cell, this.angle, this.mirror);
      if (this.drawnAt === 0) this.drawnAt = performance.now();
    } else if (this.state === 2 && this.feedback) message(v, a, this.feedback, '', COL_MID);
    ctx.fillStyle = COL_DIM;
    ctx.fillRect(Math.round(a.cx), a.cy - 80 * a.u, dpr, 160 * a.u);
    ctx.fillStyle = COL_MID;
    v.text(`same, turned  ${handLabel(this.env, -1)}`, a.cx - 150 * a.u, a.bottom - 20 * dpr, v.fontTiny, 'center');
    v.text(`mirror image  ${handLabel(this.env, 1)}`, a.cx + 150 * a.u, a.bottom - 20 * dpr, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const all = this.rts.map((r) => r.rt);
    const small = this.rts.filter((r) => r.angle <= 45).map((r) => r.rt);
    const big = this.rts.filter((r) => r.angle >= 135).map((r) => r.rt);
    const done = this.i || 1;
    const acc = (done - this.errors - this.slow) / done;
    return {
      score: all.length ? Math.round((acc * 300000) / Math.max(400, median(all))) : 0,
      primary: { label: 'median', value: median(all), unit: 'ms', lower: true },
      lines: [
        { label: 'correct', value: pct(acc) },
        { label: 'small turns (0-45°)', value: ms(median(small)) },
        { label: 'big turns (135-180°)', value: ms(median(big)) },
        { label: 'extra time for a big turn', value: small.length && big.length ? ms(median(big) - median(small)) : '–' },
      ],
      saved: this.i >= 8,
    };
  }
}

// --- Count ------------------------------------------------------------------------

const COUNT_TRIALS = 24;

class Count implements Mini {
  private env!: MiniEnv;
  private n = 5;
  private dots: [number, number][] = [];
  private options: number[] = [];
  private state = 0; // 0 wait, 1 flash, 2 choose, 3 feedback
  private at = 0;
  private i = 0;
  private correct = 0;
  private readonly show = new Stair(700, 60, 80, 900);
  private optRects: [number, number, number, number][] = [];
  private shortest = 900;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.arm(now + 600);
  }

  private arm(now: number): void {
    this.n = 3 + Math.floor(Math.random() * 7);
    this.dots = [];
    while (this.dots.length < this.n) {
      const x = 0.1 + Math.random() * 0.8;
      const y = 0.1 + Math.random() * 0.8;
      if (this.dots.every((d) => Math.hypot(d[0] - x, d[1] - y) > 0.14)) this.dots.push([x, y]);
    }
    const opts = new Set([this.n]);
    while (opts.size < 4) {
      const o = this.n + Math.floor(Math.random() * 5) - 2;
      if (o >= 1) opts.add(o);
    }
    this.options = [...opts].sort((a, b) => a - b);
    this.state = 0;
    this.at = now + 500;
  }

  press(): void {}

  pointer(px: number, py: number, ts: number): void {
    if (this.state !== 2) return;
    for (let k = 0; k < this.optRects.length; k++) {
      const [x, y, w, h] = this.optRects[k]!;
      if (px >= x && px <= x + w && py >= y && py <= y + h) {
        const ok = this.options[k] === this.n;
        this.i++;
        if (ok) {
          this.correct++;
          if (this.show.level < this.shortest) this.shortest = this.show.level;
          this.env.sound(SND_TAP_WEAK);
        } else this.env.sound(SND_FALSE);
        this.show.update(ok, -1);
        this.state = 3;
        this.at = ts + (ok ? 500 : 1100);
        return;
      }
    }
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.at) {
      this.state = 1;
      this.at = now + this.show.level;
    } else if (this.state === 1 && now >= this.at) this.state = 2;
    else if (this.state === 3 && now >= this.at) {
      if (this.i >= COUNT_TRIALS) return true;
      this.arm(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'correct', `${this.correct} / ${this.i}`, 'shown for', ms(this.show.level));
    const s = Math.min(a.bottom - a.top - 110 * a.u, a.right - a.left, 420 * a.u);
    const x0 = a.cx - s / 2;
    const y0 = a.top + 10 * a.u;
    ctx.strokeStyle = COL_DIM;
    ctx.lineWidth = dpr;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, s - 1, s - 1);
    if (this.state === 1) {
      ctx.fillStyle = COL_LINE;
      for (const [x, y] of this.dots) {
        ctx.beginPath();
        ctx.arc(x0 + x * s, y0 + y * s, s * 0.03, 0, TAU);
        ctx.fill();
      }
    } else if (this.state === 2 || this.state === 3) {
      // A mask of scattered dashes so the image does not linger.
      if (this.state === 2) {
        ctx.fillStyle = '#1a1a1e';
        for (let k = 0; k < 40; k++) ctx.fillRect(x0 + ((k * 37) % 97) / 97 * s, y0 + ((k * 61) % 89) / 89 * s, s * 0.05, dpr * 2);
      }
      const bw = Math.min(90 * a.u, s / 4.4);
      const gap = 10 * a.u;
      const total = bw * 4 + gap * 3;
      const by = y0 + s + 20 * a.u;
      this.optRects = [];
      for (let k = 0; k < 4; k++) {
        const bx = a.cx - total / 2 + k * (bw + gap);
        this.optRects.push([bx, by, bw, bw * 0.7]);
        const right = this.state === 3 && this.options[k] === this.n;
        ctx.strokeStyle = right ? COL_LINE : COL_DIM;
        ctx.lineWidth = (right ? 2 : 1) * dpr;
        ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bw * 0.7 - 1);
        ctx.fillStyle = right ? COL_LINE : COL_MID;
        v.text(String(this.options[k]), bx + bw / 2, by + bw * 0.35 + 6 * dpr, v.fontHud, 'center');
      }
      if (this.state === 3) {
        ctx.fillStyle = COL_MID;
        for (const [x, y] of this.dots) {
          ctx.beginPath();
          ctx.arc(x0 + x * s, y0 + y * s, s * 0.03, 0, TAU);
          ctx.fill();
        }
      }
    }
    if (this.i === 0 && this.state <= 1) message(v, { ...a, cy: y0 + s / 2 }, this.state === 0 ? 'how many dots? they only flash' : '', '', COL_MID);
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: Math.round(this.correct * 40 + Math.max(0, 900 - this.shortest)),
      primary: { label: 'shortest flash', value: this.shortest < 900 ? this.shortest : 0, unit: 'ms', lower: true },
      lines: [
        { label: 'correct', value: `${this.correct} of ${this.i} (${pct(this.correct / (this.i || 1))})` },
        { label: 'shortest flash you got right', value: this.shortest < 900 ? ms(this.shortest) : '–' },
      ],
      saved: this.i >= 6,
    };
  }
}

// --- Juggle -----------------------------------------------------------------------

const JUGGLE_G = 2.2; // heights per second squared

class Juggle implements Mini {
  private env!: MiniEnv;
  private slots: number[] = [];
  private y: number[] = [];
  private vy: number[] = [];
  private live: boolean[] = [];
  private grav: number[] = [];
  private respawn: number[] = [];
  private last = 0;
  private time = 0;
  private bounces = 0;
  private perfect = 0;
  private strikes = 0;
  private combo = 0;
  private best = 0;
  private nextBall = 0;
  private over = false;
  private overAt = 0;
  private flash: number[] = [];
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.slots = slotsOf(env.mode);
    const n = this.slots.length;
    for (let i = 0; i < n; i++) {
      this.y.push(0.9);
      this.vy.push(0);
      this.live.push(false);
      this.grav.push(JUGGLE_G * (0.85 + 0.3 * ((i * 7) % n) / Math.max(1, n - 1)));
      this.respawn.push(0);
      this.flash.push(0);
    }
    this.last = now;
    this.nextBall = 0.8;
    this.add(Math.floor(n / 2));
  }

  private add(i: number): void {
    this.live[i] = true;
    this.y[i] = 1;
    this.vy[i] = 0;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (this.over) return;
    const i = this.slots.indexOf(slot);
    if (i < 0 || !this.live[i]) return;
    if (this.y[i]! < 0.18 && this.vy[i]! < 0) {
      // A good hit sends it back up; the lower it was, the better.
      const perfect = this.y[i]! < 0.08;
      const apex = perfect ? 0.95 : 0.8;
      this.vy[i] = Math.sqrt(2 * this.grav[i]! * apex);
      this.bounces++;
      this.combo++;
      if (this.combo > this.best) this.best = this.combo;
      if (perfect) this.perfect++;
      this.flash[i] = ts + 120;
      this.env.sound(SND_TONE + (i % 7));
    } else {
      // Swatting at a ball that is still high: it loses height.
      this.combo = 0;
      this.vy[i] = Math.min(this.vy[i]!, -0.6);
      this.env.sound(SND_TAP_WEAK);
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
      // Another ball every 12 seconds, until every key has one.
      this.nextBall -= dt / 12;
      const n = this.slots.length;
      if (this.nextBall <= 0) {
        this.nextBall = 1;
        const free = this.live.map((l, i) => (l ? -1 : i)).filter((i) => i >= 0 && this.respawn[i] === 0);
        if (free.length) this.add(free[Math.floor(Math.random() * free.length)]!);
      }
      for (let i = 0; i < n; i++) {
        if (this.respawn[i]! > 0) {
          this.respawn[i]! -= dt;
          if (this.respawn[i]! <= 0) {
            this.respawn[i] = 0;
            this.add(i);
          }
          continue;
        }
        if (!this.live[i]) continue;
        this.vy[i]! -= this.grav[i]! * (1 + this.time / 120) * dt;
        this.y[i]! += this.vy[i]! * dt;
        if (this.y[i]! <= 0) {
          this.live[i] = false;
          this.respawn[i] = 1.5;
          this.strikes++;
          this.combo = 0;
          this.env.sound(SND_LURCH);
          if (this.strikes >= STRIKES) {
            this.over = true;
            this.overAt = now + 1200;
            this.env.sound(SND_FALL);
          }
        }
      }
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'bounces', String(this.bounces), 'combo', String(this.combo), STRIKES - this.strikes);
    const n = this.slots.length;
    const span = Math.min(a.right - a.left, n * 110 * a.u);
    const top = a.top + 10 * a.u;
    const floor = a.bottom - 40 * a.u;
    const H = floor - top;
    // The hit zone near the floor.
    ctx.fillStyle = '#141417';
    ctx.fillRect(a.cx - span / 2, floor - 0.18 * H, span, 0.18 * H);
    ctx.fillStyle = COL_DIM;
    ctx.fillRect(a.cx - span / 2, floor - 0.08 * H, span, dpr);
    ctx.fillStyle = COL_LINE;
    ctx.fillRect(a.cx - span / 2, floor, span, dpr);
    for (let i = 0; i < n; i++) {
      const x = a.cx - span / 2 + (span * (i + 0.5)) / n;
      ctx.fillStyle = COL_MID;
      v.text(this.env.labels[this.slots[i]!] ?? '', x, floor + 22 * dpr, v.fontTiny, 'center');
      if (!this.live[i]) continue;
      const y = floor - clamp(this.y[i]!, 0, 1.1) * H;
      ctx.fillStyle = now < this.flash[i]! ? COL_LINE : COL_ACCENT;
      ctx.beginPath();
      ctx.arc(x, y - 10 * a.u, 10 * a.u, 0, TAU);
      ctx.fill();
    }
    if (this.time < 3 && !this.over) message(v, { ...a, cy: top + 40 * a.u }, 'hit a ball’s key as it drops into the shaded zone', 'lower is better', COL_MID);
    if (this.over) message(v, a, `${this.bounces} bounces`, `best combo ${this.best}`);
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.bounces * 10 + this.perfect * 5,
      primary: { label: 'bounces', value: this.bounces, unit: '' },
      lines: [
        { label: 'bounces', value: String(this.bounces) },
        { label: 'low (perfect) hits', value: pct(this.perfect / (this.bounces || 1)) },
        { label: 'best combo', value: String(this.best) },
        { label: 'time', value: `${this.time.toFixed(0)} s` },
      ],
      saved: this.bounces >= 3,
    };
  }
}

// --- Steady -----------------------------------------------------------------------

const STEADY_MS = 15000;

class Steady implements Mini {
  private env!: MiniEnv;
  private t0 = 0;
  private times: number[] = [];
  private keys: number[] = [];
  private over = false;
  private endAt = 0;
  private held = 0;

  start(env: MiniEnv): void {
    this.env = env;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (this.over || slot === 6) return;
    if (!this.t0) this.t0 = ts;
    if (ts - this.t0 > STEADY_MS) return;
    this.times.push(ts - this.t0);
    this.keys.push(slot);
    this.env.sound(sideOf(slot) > 0 ? SND_TAP_R : SND_TAP_L);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  private gaps(): number[] {
    const g: number[] = [];
    for (let i = 1; i < this.times.length; i++) g.push(this.times[i]! - this.times[i - 1]!);
    return g;
  }

  /** Evenness: 100% minus the coefficient of variation of the gaps. */
  private evenness(g: number[]): number {
    if (g.length < 4) return 0;
    const m = mean(g);
    const sd = Math.sqrt(g.reduce((s, x) => s + (x - m) ** 2, 0) / (g.length - 1));
    return Math.max(0, 1 - sd / m);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const t = this.t0 ? now - this.t0 : 0;
    if (this.t0 && !this.over && t >= STEADY_MS) {
      this.over = true;
      this.endAt = now + 1000;
    }
    if (this.over && now >= this.endAt) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const g = this.gaps();
    const recent = g.slice(-24);
    header(v, touch, 'evenness', recent.length >= 4 ? pct(this.evenness(recent)) : '–', 'time', `${(Math.max(0, STEADY_MS - t) / 1000).toFixed(1)} s`);
    // Each gap as a vertical tick: a perfect run is a flat row.
    const span = Math.min(a.right - a.left, 560 * a.u);
    const x0 = a.cx - span / 2;
    const base = a.cy + 40 * a.u;
    const m = recent.length ? mean(recent) : 100;
    ctx.fillStyle = COL_DIM;
    ctx.fillRect(x0, base, span, dpr);
    recent.forEach((gap, i) => {
      const dev = clamp((gap - m) / m, -0.6, 0.6);
      const x = x0 + ((i + 0.5) / 24) * span;
      ctx.fillStyle = Math.abs(dev) < 0.1 ? COL_LINE : COL_MID;
      ctx.fillRect(x - 2 * dpr, base - dev * 160 * a.u - 2 * dpr, 4 * dpr, 4 * dpr);
    });
    const rate = recent.length ? 1000 / m : 0;
    ctx.fillStyle = this.t0 ? COL_LINE : COL_MID;
    v.text(this.t0 ? `${rate.toFixed(1)} per second` : 'tap fast and perfectly even. starts on your first tap', a.cx, a.cy - 70 * a.u, v.fontHud, 'center');
    progress2(v, a.cx, a.cy - 40 * a.u, 160 * a.u, t / STEADY_MS);
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const g = this.gaps();
    const even = this.evenness(g);
    const rate = g.length ? 1000 / mean(g) : 0;
    let alt = '';
    const slots = slotsOf(this.env.mode).filter((s) => s !== 6);
    if (slots.length > 1 && this.keys.length > 2) {
      let rep = 0;
      for (let i = 1; i < this.keys.length; i++) if (this.keys[i] === this.keys[i - 1]) rep++;
      alt = pct(rep / (this.keys.length - 1));
    }
    const lines = [
      { label: 'evenness', value: pct(even) },
      { label: 'rate', value: `${rate.toFixed(1)} /s` },
      { label: 'taps', value: String(this.times.length) },
    ];
    if (alt) lines.push({ label: 'same key twice in a row', value: alt });
    return {
      score: Math.round(even * rate * 100),
      primary: { label: 'evenness', value: Math.round(even * 100), unit: '%' },
      lines,
      saved: this.times.length >= 20,
    };
  }
}

function progress2(v: View, cx: number, y: number, half: number, p: number): void {
  const ctx = v.ctx;
  ctx.lineWidth = 2 * v.dpr;
  ctx.strokeStyle = COL_DIM;
  ctx.beginPath();
  ctx.moveTo(cx - half, y);
  ctx.lineTo(cx + half, y);
  ctx.stroke();
  if (p > 0) {
    ctx.strokeStyle = COL_LINE;
    ctx.beginPath();
    ctx.moveTo(cx - half, y);
    ctx.lineTo(cx - half + half * 2 * clamp(p, 0, 1), y);
    ctx.stroke();
  }
}

export const EXTRA: MiniDef[] = [
  {
    id: 'aim',
    name: 'Aim',
    skill: 'reaction',
    blurb: 'Tap each target the moment it appears. They shrink.',
    how: 'Tap the circle to start, then tap each orange target as fast as you can. Hits make them smaller; misses make them bigger. Thirty targets.',
    input: 'pointer',
    make: () => new Aim(),
  },
  {
    id: 'echo',
    name: 'Echo',
    skill: 'timing',
    blurb: 'Hear a rhythm. Tap it back. It gets longer.',
    how: 'Listen to the rhythm (and watch the dots), then tap it back with any key or a tap. Only the gaps between your taps matter, so start whenever you like. One more note each time you get it.',
    input: 'both',
    make: () => new Echo(),
  },
  {
    id: 'path',
    name: 'Path',
    skill: 'memory',
    blurb: 'Blocks light up in order. Tap the same path, sometimes backwards.',
    how: 'Scattered blocks light up one after another. Tap them in the same order. Every third round, tap them in reverse. The path grows by one each time; three mistakes end it.',
    input: 'pointer',
    make: () => new Path(),
  },
  {
    id: 'rotate',
    name: 'Rotate',
    skill: 'attention',
    blurb: 'Same shape, turned, or its mirror image?',
    how: 'Two block shapes appear. The right one is the left one turned, or a mirror image of it turned. Left hand: same. Right hand: mirror. Bigger turns take longer; the game measures how much.',
    input: 'keys',
    minKeys: 2,
    make: () => new Rotate(),
  },
  {
    id: 'count',
    name: 'Count',
    skill: 'attention',
    blurb: 'How many dots were there, in that blink?',
    how: 'Dots flash for a moment. Tap how many there were. Each right answer shortens the flash.',
    input: 'pointer',
    make: () => new Count(),
  },
  {
    id: 'juggle',
    name: 'Juggle',
    skill: 'coordination',
    blurb: 'Every key keeps its own ball in the air.',
    how: 'Each string has a ball. Press its key as it falls into the shaded zone to send it back up (lower is better). Pressing too early knocks it down faster. A new ball joins every twelve seconds; three drops and it is over.',
    input: 'keys',
    make: () => new Juggle(),
  },
  {
    id: 'steady',
    name: 'Steady',
    skill: 'speed',
    blurb: 'Fast is not enough. Fifteen seconds, perfectly even.',
    how: 'Tap at a fast pace you can keep perfectly even for fifteen seconds. Each gap between taps shows as a dot; a perfect run is a flat line. Scored on evenness times speed.',
    input: 'keys',
    make: () => new Steady(),
  },
];
