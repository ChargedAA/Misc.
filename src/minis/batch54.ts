// Fifty-fourth batch.
//   Legend - learn which symbol goes with which number, then answer from memory, fast.
//   Rooms  - things appear around a floor plan, one at a time: where was this one?
//   Match  - two dot patterns: the same, or one dot different? As many as you can.
//   Shrink - a target shrinks away to nothing: click it before it is gone.

import { COL_ACCENT, COL_DIM, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALSE, SND_TAP_L, SND_TAP_R, SND_TAP_WEAK } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, handLabel, header, median, ms, pct, scaled, shuffle, sideOf, Stair, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const TAU = Math.PI * 2;
const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const rint = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
type Rect = [number, number, number, number];
const inside = (r: Rect, x: number, y: number) => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
const digitOf = (code: string) => (code.startsWith('Digit') ? code.slice(5) : code.startsWith('Numpad') ? code.slice(6) : '');

const GLYPHS = 10;

/** Ten simple, distinct symbols, drawn in the current fill and stroke colour. */
function glyph(ctx: CanvasRenderingContext2D, k: number, x: number, y: number, r: number, lw: number): void {
  ctx.lineWidth = lw;
  ctx.beginPath();
  switch (k) {
    case 0:
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
      break;
    case 1:
      ctx.fillRect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7);
      break;
    case 2:
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y + r * 0.8);
      ctx.lineTo(x - r, y + r * 0.8);
      ctx.closePath();
      ctx.fill();
      break;
    case 3:
      ctx.moveTo(x - r, y - r);
      ctx.lineTo(x + r, y + r);
      ctx.moveTo(x + r, y - r);
      ctx.lineTo(x - r, y + r);
      ctx.stroke();
      break;
    case 4:
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i / 10) * TAU;
        const rr = i % 2 ? r * 0.45 : r;
        if (i) ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        else ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
      break;
    case 5:
      ctx.arc(x, y, r * 0.85, 0, TAU);
      ctx.stroke();
      break;
    case 6:
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r * 0.75, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r * 0.75, y);
      ctx.closePath();
      ctx.stroke();
      break;
    case 7:
      ctx.fillRect(x - r, y - r * 0.25, 2 * r, r * 0.5);
      ctx.fillRect(x - r * 0.25, y - r, r * 0.5, 2 * r);
      break;
    case 8:
      ctx.arc(x, y, r, Math.PI, TAU);
      ctx.closePath();
      ctx.fill();
      break;
    default:
      ctx.strokeRect(x - r * 0.8, y - r * 0.8, r * 1.6, r * 1.6);
      ctx.fillRect(x - r * 0.3, y - r * 0.3, r * 0.6, r * 0.6);
  }
}

// --- Legend ----------------------------------------------------------------------------

const LEGEND_SETS = 4;
const PER_SET = 12;
const STUDY_MS = 6000;

class Legend implements Mini {
  private env!: MiniEnv;
  private set = 0;
  private n = 3;
  private map: number[] = [];
  private trial = 0;
  private cur = 0;
  /** 0 study, 1 answer, 2 feedback. */
  private state = 0;
  private at = 0;
  private boxes: Rect[] = [];
  private right = 0;
  private total = 0;
  private rts: number[] = [];
  private lastOk = true;
  private shownAt = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.newSet(now);
  }

  private newSet(now: number): void {
    this.n = Math.min(6, 3 + this.set);
    this.map = shuffle(Array.from({ length: GLYPHS }, (_, k) => k)).slice(0, this.n);
    this.trial = 0;
    this.state = 0;
    this.at = now + STUDY_MS + this.n * 500;
  }

  private next(now: number): void {
    let k = rint(0, this.n - 1);
    if (k === this.cur && Math.random() < 0.6) k = rint(0, this.n - 1);
    this.cur = k;
    this.state = 1;
    this.shownAt = now;
  }

  press(): void {}

  private pick(k: number, ts: number): void {
    if (this.state === 0) return;
    if (this.state !== 1 || k >= this.n) return;
    const ok = k === this.cur;
    this.lastOk = ok;
    this.total++;
    if (ok) {
      this.right++;
      this.rts.push(ts - this.shownAt);
    }
    this.env.sound(ok ? SND_TAP_WEAK : SND_FALSE);
    this.trial++;
    this.state = 2;
    this.at = ts + (ok ? 250 : 1100);
  }

  typeKey(code: string, ts: number): boolean {
    const d = Number(digitOf(code));
    if (d >= 1 && d <= 6) {
      this.pick(d - 1, ts);
      return true;
    }
    if (this.state === 0 && (code === 'Space' || code === 'Enter')) {
      this.at = ts;
      return true;
    }
    return false;
  }

  pointer(x: number, y: number, ts: number): void {
    const k = this.boxes.findIndex((r) => inside(r, x, y));
    if (k >= 0) this.pick(k, ts);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.at) this.next(now);
    if (this.state === 2 && now >= this.at) {
      if (this.trial >= PER_SET) {
        this.set++;
        if (this.set >= scaled(LEGEND_SETS)) return true;
        this.newSet(now);
      } else this.next(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'right', `${this.right} of ${this.total}`, 'set', `${Math.min(this.set + 1, scaled(LEGEND_SETS))} / ${scaled(LEGEND_SETS)}`);
    const bw = Math.min(80 * a.u, (a.right - a.left) / (this.n + 1));
    const by = a.cy + 40 * a.u;
    this.boxes = Array.from({ length: this.n }, (_, k) => [a.cx + (k - this.n / 2) * (bw + 10 * a.u) + 5 * a.u, by, bw, bw] as Rect);
    this.boxes.forEach(([x, y, w, h], k) => {
      const study = this.state === 0;
      const reveal = this.state === 2 && !this.lastOk && k === this.cur;
      ctx.strokeStyle = reveal ? COL_ACCENT : COL_DIM;
      ctx.lineWidth = (reveal ? 2.5 : 1.5) * dpr;
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = COL_LINE;
      v.text(String(k + 1), x + w / 2, y + (study || reveal ? h * 0.85 : h / 2 + 6 * dpr), study || reveal ? v.fontTiny : v.fontHud, 'center');
      if (study || reveal) {
        ctx.fillStyle = reveal ? COL_ACCENT : COL_LINE;
        ctx.strokeStyle = ctx.fillStyle;
        glyph(ctx, this.map[k]!, x + w / 2, y + h * 0.4, w * 0.22, 3 * dpr);
      }
    });
    if (this.state >= 1) {
      ctx.fillStyle = COL_LINE;
      ctx.strokeStyle = COL_LINE;
      glyph(ctx, this.map[this.cur]!, a.cx, a.cy - 50 * a.u, 34 * a.u, 5 * dpr);
    }
    ctx.fillStyle = COL_MID;
    v.text(this.state === 0 ? `learn which number goes with each symbol: ${Math.ceil((this.at - now) / 1000)} s (Space when ready)` : 'press its number (or click the box)', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: Math.max(0, this.right * 15 + (this.rts.length ? Math.round(Math.max(0, 1500 - median(this.rts)) / 3) : 0)),
      primary: { label: 'answered right', value: this.total ? Math.round((this.right / this.total) * 100) : 0, unit: '%' },
      lines: [
        { label: 'right', value: `${this.right} of ${this.total}` },
        { label: 'typical time when right', value: this.rts.length ? ms(median(this.rts)) : '–' },
        { label: 'largest set reached', value: `${this.n} symbols` },
      ],
      saved: this.total >= 8,
    };
  }
}

// --- Rooms -----------------------------------------------------------------------------

const ROOMS_ROUNDS = 12;
const ROOM_NAMES = ['hall', 'kitchen', 'study', 'bath', 'bedroom', 'den', 'attic', 'porch'];

class Rooms implements Mini {
  private env!: MiniEnv;
  private round = 0;
  private items = 4;
  private placed: [number, number][] = [];
  private ask = 0;
  /** 0 showing, 1 answer, 2 feedback. */
  private state = 0;
  private at = 0;
  private rects: Rect[] = [];
  private right = 0;
  private chosen = -1;
  private streak = 0;
  private best = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.arm(now);
  }

  private arm(now: number): void {
    const glyphs = shuffle(Array.from({ length: GLYPHS }, (_, k) => k)).slice(0, this.items);
    this.placed = glyphs.map((g) => [g, rint(0, 7)]);
    this.ask = rint(0, this.items - 1);
    this.state = 0;
    this.at = now + 400;
    this.chosen = -1;
  }

  press(): void {}

  pointer(x: number, y: number, ts: number): void {
    if (this.state !== 1) return;
    const k = this.rects.findIndex((r) => inside(r, x, y));
    if (k < 0) return;
    this.chosen = k;
    const ok = k === this.placed[this.ask]![1];
    if (ok) {
      this.right++;
      this.best = Math.max(this.best, this.items);
      if (++this.streak % 2 === 0) this.items = Math.min(9, this.items + 1);
    } else {
      this.streak = 0;
      this.items = Math.max(3, this.items - 1);
    }
    this.env.sound(ok ? SND_CATCH : SND_FALSE);
    this.round++;
    this.state = 2;
    this.at = ts + (ok ? 900 : 1800);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const per = 1000;
    if (this.state === 0 && now >= this.at + this.placed.length * per) this.state = 1;
    if (this.state === 2 && now >= this.at) {
      if (this.round >= scaled(ROOMS_ROUNDS)) return true;
      this.arm(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'right', String(this.right), 'house', `${Math.min(this.round + 1, scaled(ROOMS_ROUNDS))} / ${scaled(ROOMS_ROUNDS)}`);
    // A floor plan: four rooms over four, of uneven widths.
    const W = Math.min(a.right - a.left, 640 * a.u);
    const H = Math.min(a.bottom - a.top - 80 * a.u, W * 0.55);
    const x0 = a.cx - W / 2;
    const y0 = a.top + 46 * a.u;
    const cols = [[0, 0.3, 0.55, 0.75, 1], [0, 0.2, 0.45, 0.7, 1]];
    this.rects = [];
    for (let row = 0; row < 2; row++) for (let c = 0; c < 4; c++) {
      const cs = cols[row]!;
      this.rects.push([x0 + cs[c]! * W, y0 + row * (H / 2), (cs[c + 1]! - cs[c]!) * W, H / 2]);
    }
    const target = this.placed[this.ask]!;
    this.rects.forEach(([x, y, w, h], k) => {
      const show = this.state === 2;
      const good = show && k === target[1];
      const bad = show && k === this.chosen && !good;
      ctx.fillStyle = good ? '#22222a' : '#141418';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = good ? COL_LINE : bad ? COL_ACCENT : COL_DIM;
      ctx.lineWidth = (good || bad ? 3 : 2) * dpr;
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = COL_DIM;
      v.text(ROOM_NAMES[k]!, x + 8 * dpr, y + 14 * dpr, v.fontTiny, 'left');
    });
    if (this.state === 0) {
      const i = Math.floor((now - this.at) / per);
      const into = (now - this.at) % per;
      if (i >= 0 && i < this.placed.length && into < per * 0.8) {
        const [g, room] = this.placed[i]!;
        const [x, y, w, h] = this.rects[room]!;
        ctx.fillStyle = COL_LINE;
        ctx.strokeStyle = COL_LINE;
        glyph(ctx, g, x + w / 2, y + h / 2 + 6 * a.u, Math.min(w, h) * 0.2, 4 * dpr);
      }
      ctx.fillStyle = COL_MID;
      v.text(`remember where each one goes · ${Math.min(this.placed.length, Math.max(1, i + 1))} of ${this.placed.length}`, a.cx, a.top + 18 * a.u, v.fontTiny, 'center');
    } else {
      ctx.fillStyle = COL_LINE;
      ctx.strokeStyle = COL_LINE;
      glyph(ctx, target[0], a.cx - 70 * a.u, a.top + 20 * a.u, 14 * a.u, 3 * dpr);
      v.text('which room was this in?', a.cx + 10 * a.u, a.top + 26 * a.u, v.fontHud, 'center');
      if (this.state === 2) {
        const [x, y, w, h] = this.rects[target[1]]!;
        glyph(ctx, target[0], x + w / 2, y + h / 2 + 6 * a.u, Math.min(w, h) * 0.2, 4 * dpr);
      }
    }
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.right * 60 + this.best * 40,
      primary: { label: 'rooms remembered', value: this.right, unit: `of ${this.round}` },
      lines: [
        { label: 'right', value: `${this.right} of ${this.round}` },
        { label: 'most things remembered', value: this.best ? `${this.best} in a house` : '–' },
      ],
      saved: this.round >= 4,
    };
  }
}

// --- Match (perceptual speed) ----------------------------------------------------------

const MATCH_MS = 45000;

class Match implements Mini {
  private env!: MiniEnv;
  private size = 3;
  private left: boolean[] = [];
  private right: boolean[] = [];
  private same = true;
  private t0 = 0;
  private at = 0;
  private started = false;
  private ok = 0;
  private bad = 0;
  private rts: number[] = [];
  private flash = 0;
  private held = 0;
  private firstFrame = 0;

  start(env: MiniEnv): void {
    this.env = env;
  }

  private make(now: number): void {
    this.size = this.ok >= 20 ? 5 : this.ok >= 8 ? 4 : 3;
    const n = this.size * this.size;
    this.left = Array.from({ length: n }, () => Math.random() < 0.45);
    this.right = [...this.left];
    this.same = Math.random() < 0.5;
    if (!this.same) {
      const k = rint(0, n - 1);
      this.right[k] = !this.right[k];
    }
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
    if ((s < 0) === this.same) {
      this.ok++;
      this.rts.push(ts - this.at);
      this.env.sound(s < 0 ? SND_TAP_L : SND_TAP_R);
    } else {
      this.bad++;
      this.flash = ts + 500;
      this.env.sound(SND_FALSE);
    }
    this.make(ts);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    const len = scaled(MATCH_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'right', String(this.ok), 'time', `${left} s`);
    const G = Math.min(150 * a.u, (a.right - a.left) / 2.6);
    const cell = G / this.size;
    [this.left, this.right].forEach((pat, side) => {
      const x0 = a.cx + (side ? 0.15 : -1.15) * G;
      const y0 = a.cy - G / 2 - 20 * a.u;
      ctx.strokeStyle = now < this.flash ? COL_ACCENT : COL_DIM;
      ctx.lineWidth = 1.5 * dpr;
      ctx.strokeRect(x0, y0, G, G);
      if (!this.started) return;
      ctx.fillStyle = COL_LINE;
      pat.forEach((on, k) => {
        if (!on) return;
        ctx.beginPath();
        ctx.arc(x0 + ((k % this.size) + 0.5) * cell, y0 + (Math.floor(k / this.size) + 0.5) * cell, cell * 0.3, 0, TAU);
        ctx.fill();
      });
    });
    const off = Math.min(200 * a.u, (a.right - a.left) / 2 - 30 * a.u);
    ctx.fillStyle = COL_MID;
    v.text(`${handLabel(this.env, -1)}  same`, a.cx - off, a.bottom - 6 * a.u, v.fontTiny, 'center');
    v.text(`different  ${handLabel(this.env, 1)}`, a.cx + off, a.bottom - 6 * a.u, v.fontTiny, 'center');
    if (!this.started) v.text('are the two patterns the same? press either side to start', a.cx, a.bottom - 30 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: Math.max(0, this.ok * 15 - this.bad * 25),
      primary: { label: 'right in 45 seconds', value: this.ok, unit: '' },
      lines: [
        { label: 'right', value: String(this.ok) },
        { label: 'wrong', value: String(this.bad) },
        { label: 'typical time a pair', value: this.rts.length ? ms(median(this.rts)) : '–' },
      ],
      saved: this.ok + this.bad >= 5,
    };
  }
}

// --- Shrink ----------------------------------------------------------------------------

const SHRINK_TARGETS = 30;

class Shrink implements Mini {
  private env!: MiniEnv;
  /** How long a target lasts before it shrinks to nothing (ms). */
  private readonly life = new Stair(1600, 100, 300, 2000, 2);
  private levels: number[] = [];
  private n = 0;
  private x = 0.5;
  private y = 0.5;
  private born = 0;
  private gap = 0;
  private hits = 0;
  private lost = 0;
  private clicks = 0;
  private sizes: number[] = [];
  private field: Rect = [0, 0, 1, 1];
  private pop: [number, number, number] | null = null;
  private firstAt = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.firstAt = now;
    this.gap = now + 700;
    this.born = 0;
  }

  private spawn(now: number): void {
    this.x = rnd(0.08, 0.92);
    this.y = rnd(0.1, 0.9);
    this.born = now;
  }

  /** Radius share of the target at a moment: 1 when born, 0 when gone. */
  private share(now: number): number {
    return Math.max(0, 1 - (now - this.born) / this.life.level);
  }

  private end(ok: boolean, now: number): void {
    this.levels.push(this.life.level);
    this.life.update(ok, -1);
    this.n++;
    this.born = 0;
    this.gap = now + rnd(300, 700);
  }

  press(): void {}

  pointer(px: number, py: number, ts: number): void {
    if (!this.born) return;
    this.clicks++;
    const [fx, fy, fw, fh] = this.field;
    const R = Math.min(fw, fh) * 0.08 * this.share(ts);
    const tx = fx + this.x * fw;
    const ty = fy + this.y * fh;
    if (Math.hypot(px - tx, py - ty) <= Math.max(R, 2)) {
      this.hits++;
      this.sizes.push(this.share(ts));
      this.pop = [tx, ty, ts];
      this.env.sound(SND_CATCH);
      this.end(true, ts);
    } else this.env.sound(SND_TAP_WEAK);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.born && this.gap && now >= this.gap) {
      if (this.n >= scaled(SHRINK_TARGETS)) return true;
      this.gap = 0;
      this.spawn(now);
    }
    if (this.born && this.share(now) <= 0) {
      this.lost++;
      this.env.sound(SND_FALSE);
      this.end(false, now);
    }
    if (now - this.firstAt > 600000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'lasts', `${this.life.level} ms`, 'target', `${Math.min(this.n + 1, scaled(SHRINK_TARGETS))} / ${scaled(SHRINK_TARGETS)}`);
    const fx = a.left;
    const fy = a.top + 10 * a.u;
    const fw = a.right - a.left;
    const fh = a.bottom - a.top - 40 * a.u;
    this.field = [fx, fy, fw, fh];
    if (this.born) {
      const R = Math.min(fw, fh) * 0.08;
      const s = this.share(now);
      const tx = fx + this.x * fw;
      const ty = fy + this.y * fh;
      ctx.strokeStyle = COL_DIM;
      ctx.lineWidth = dpr;
      ctx.beginPath();
      ctx.arc(tx, ty, R, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = COL_LINE;
      ctx.beginPath();
      ctx.arc(tx, ty, Math.max(1, R * s), 0, TAU);
      ctx.fill();
    }
    if (this.pop && now - this.pop[2] < 250) {
      ctx.strokeStyle = COL_ACCENT;
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.arc(this.pop[0], this.pop[1], 10 * dpr + (now - this.pop[2]) * 0.1 * dpr, 0, TAU);
      ctx.stroke();
    }
    ctx.fillStyle = COL_MID;
    v.text(this.n === 0 ? 'click each target before it shrinks away' : `${this.hits} hit · ${this.lost} lost`, a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const th = this.levels.length >= 8 ? median(this.levels.slice(-12)) : 0;
    return {
      score: th ? Math.max(0, Math.round((2100 - th) * 0.8 + this.hits * 10)) : 0,
      primary: { label: 'shortest life you catch', value: th, unit: 'ms', lower: true },
      lines: [
        { label: 'typical life near the end', value: th ? ms(th) : '–' },
        { label: 'hit', value: `${this.hits} of ${this.n}` },
        { label: 'clicks that hit', value: this.clicks ? pct(this.hits / this.clicks) : '–' },
        { label: 'typical size left when hit', value: this.sizes.length ? pct(median(this.sizes)) : '–' },
      ],
      saved: this.n >= 8,
    };
  }
}

export const BATCH54: MiniDef[] = [
  { id: 'legend', name: 'Legend', skill: 'memory', blurb: 'Learn which symbol goes with which number, then answer from memory, fast.', how: 'A key of symbols and numbers is shown for a few seconds; learn it. Then the key hides and symbols appear one at a time: press each one’s number (or click its box). A miss shows the right box. Each new set adds a symbol, from three up to six. Four sets of twelve.', input: 'pointer', make: () => new Legend() },
  { id: 'rooms', name: 'Rooms', skill: 'memory', blurb: 'Things appear around a floor plan, one at a time. Where was this one?', how: 'A floor plan of eight rooms. Symbols appear one at a time, each in a room. Then one of them is shown again: click the room it was in. Two right in a row and the next house has one more thing; a miss and it has one fewer. Twelve houses.', input: 'pointer', make: () => new Rooms() },
  { id: 'match', name: 'Match', skill: 'speed', blurb: 'Two dot patterns: the same, or one dot different? As many as you can.', how: 'Two grids of dots side by side. Left if they are exactly the same, right if one dot differs. The grids grow from 3 by 3 to 5 by 5 as you go. Forty-five seconds; mistakes count against you.', input: 'keys', minKeys: 2, make: () => new Match() },
  { id: 'shrink', name: 'Shrink', skill: 'aim', blurb: 'A target shrinks away to nothing. Click it before it is gone.', how: 'Targets appear one at a time anywhere on the screen and shrink to nothing. Click each before it vanishes. Catch them and the next shrinks faster; lose one and it slows. Thirty targets; scored on the shortest life you can still catch.', input: 'pointer', make: () => new Shrink() },
];
