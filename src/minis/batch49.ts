// Forty-ninth batch.
//   Graph - a line chart and a question about it: read it fast and right.
//   Units - two amounts in different units: which is bigger?
//   Venn  - two overlapping circles with rules: where does this shape belong?
//   Map   - two places on a map and a scale bar: how far apart are they?

import { COL_ACCENT, COL_DIM, COL_FAINT, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALSE, SND_TAP_L, SND_TAP_R, SND_TAP_WEAK } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, header, mean, median, ms, pct, scaled, sideOf, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const TAU = Math.PI * 2;
const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const rint = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]!;
type Rect = [number, number, number, number];
const inside = (r: Rect, x: number, y: number) => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
const digitOf = (code: string) => (code.startsWith('Digit') ? code.slice(5) : code.startsWith('Numpad') ? code.slice(6) : '');

// --- Graph -----------------------------------------------------------------------------

const GRAPH_ROUNDS = 12;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

class Graph implements Mini {
  private env!: MiniEnv;
  private round = 0;
  private series: number[][] = [];
  private q = '';
  private opts: string[] = [];
  private answer = 0;
  private state = 0;
  private at = 0;
  private chosen = -1;
  private boxes: Rect[] = [];
  private right = 0;
  private rts: number[] = [];

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.make(now);
  }

  private make(now: number): void {
    const two = this.round >= 5;
    const walk = () => {
      let v = rint(20, 60);
      return MONTHS.map(() => (v = Math.max(5, Math.min(95, v + rint(-14, 14)))));
    };
    this.series = two ? [walk(), walk()] : [walk()];
    const s = this.series[0]!;
    const kind = rint(0, two ? 4 : 2);
    let ans = '';
    let wrong: string[] = [];
    if (kind === 0) {
      const m = rint(0, 11);
      this.q = `What was the value in ${MONTHS[m]}?`;
      ans = String(s[m]);
      const near = new Set<number>();
      while (near.size < 3) {
        const w = s[m]! + rint(-20, 20);
        if (w >= 0 && Math.abs(w - s[m]!) >= 5) near.add(w);
      }
      wrong = [...near].map(String);
    } else if (kind === 1) {
      const hi = s.indexOf(Math.max(...s));
      this.q = 'In which month was it highest?';
      ans = MONTHS[hi]!;
      wrong = [...MONTHS].filter((x) => x !== ans).sort(() => Math.random() - 0.5).slice(0, 3);
    } else if (kind === 2) {
      let best = 0;
      let at = 1;
      for (let m = 1; m < 12; m++) if (s[m]! - s[m - 1]! > best) [best, at] = [s[m]! - s[m - 1]!, m];
      this.q = 'Which month had the biggest rise from the month before?';
      ans = MONTHS[at]!;
      wrong = [...MONTHS].filter((x) => x !== ans).sort(() => Math.random() - 0.5).slice(0, 3);
    } else if (kind === 3) {
      const b = this.series[1]!;
      const n = s.filter((x, m) => x > b[m]!).length;
      this.q = 'In how many months was the white line above the grey one?';
      ans = String(n);
      wrong = [n + 1, n - 1, n + 2].map((x) => String(Math.max(0, x))).filter((x) => x !== ans);
      while (wrong.length < 3) wrong.push(String(n + 3 + wrong.length));
    } else {
      const b = this.series[1]!;
      const gaps = s.map((x, m) => Math.abs(x - b[m]!));
      const g = gaps.indexOf(Math.max(...gaps));
      this.q = 'In which month were the two lines furthest apart?';
      ans = MONTHS[g]!;
      wrong = [...MONTHS].filter((x) => x !== ans).sort(() => Math.random() - 0.5).slice(0, 3);
    }
    this.answer = rint(0, 3);
    this.opts = wrong.slice(0, 3);
    this.opts.splice(this.answer, 0, ans);
    this.chosen = -1;
    this.state = 0;
    this.at = now;
  }

  press(): void {}

  private pick(k: number, ts: number): void {
    if (this.state !== 0) return;
    this.chosen = k;
    const ok = k === this.answer;
    if (ok) {
      this.right++;
      this.rts.push(ts - this.at);
    }
    this.env.sound(ok ? SND_CATCH : SND_FALSE);
    this.round++;
    this.state = 1;
    this.at = ts + (ok ? 900 : 1800);
  }

  typeKey(code: string, ts: number): boolean {
    const d = Number(digitOf(code));
    if (d >= 1 && d <= 4) {
      this.pick(d - 1, ts);
      return true;
    }
    return false;
  }

  pointer(x: number, y: number, ts: number): void {
    const k = this.boxes.findIndex((r) => inside(r, x, y));
    if (k >= 0) this.pick(k, ts);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 1 && now >= this.at) {
      if (this.round >= scaled(GRAPH_ROUNDS)) return true;
      this.make(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'right', String(this.right), 'chart', `${Math.min(this.round + 1, scaled(GRAPH_ROUNDS))} / ${scaled(GRAPH_ROUNDS)}`);
    const gx = a.left + 40 * a.u;
    const gw = a.right - a.left - 60 * a.u;
    const gy = a.top + 30 * a.u;
    const gh = (a.bottom - a.top) * 0.48;
    // Grid lines every 10.
    for (let val = 0; val <= 100; val += 10) {
      const y = gy + gh - (val / 100) * gh;
      ctx.fillStyle = val % 50 === 0 ? COL_DIM : COL_FAINT;
      ctx.fillRect(gx, y, gw, dpr);
      if (val % 20 === 0) {
        ctx.fillStyle = COL_MID;
        v.text(String(val), gx - 8 * dpr, y + 4 * dpr, v.fontTiny, 'right');
      }
    }
    MONTHS.forEach((m, k) => {
      ctx.fillStyle = COL_MID;
      v.text(m, gx + (k / 11) * gw, gy + gh + 18 * dpr, v.fontTiny, 'center');
    });
    this.series.forEach((s, k) => {
      ctx.strokeStyle = k ? COL_DIM : COL_LINE;
      ctx.lineWidth = 2.5 * dpr;
      ctx.beginPath();
      s.forEach((val, m) => {
        const x = gx + (m / 11) * gw;
        const y = gy + gh - (val / 100) * gh;
        if (m) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.stroke();
      ctx.fillStyle = k ? COL_DIM : COL_LINE;
      s.forEach((val, m) => {
        ctx.beginPath();
        ctx.arc(gx + (m / 11) * gw, gy + gh - (val / 100) * gh, 3 * dpr, 0, TAU);
        ctx.fill();
      });
    });
    ctx.fillStyle = COL_LINE;
    v.text(this.q, a.cx, gy + gh + 48 * a.u, v.fontHud, 'center');
    const bw = Math.min(120 * a.u, (a.right - a.left) / 4 - 12 * a.u);
    const by = gy + gh + 70 * a.u;
    this.boxes = this.opts.map((_, k) => [a.cx + (k - 2) * (bw + 12 * a.u) + 6 * a.u, by, bw, 40 * a.u] as Rect);
    this.opts.forEach((o, k) => {
      const [x, y, w, h] = this.boxes[k]!;
      const show = this.state === 1;
      ctx.strokeStyle = show && k === this.answer ? COL_LINE : show && k === this.chosen ? COL_ACCENT : COL_DIM;
      ctx.lineWidth = (show && (k === this.answer || k === this.chosen) ? 2.5 : 1.5) * dpr;
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = COL_LINE;
      v.text(o, x + w / 2, y + h / 2 + 5 * dpr, v.fontTiny, 'center');
      ctx.fillStyle = COL_DIM;
      v.text(String(k + 1), x + 8 * dpr, y + 12 * dpr, v.fontTiny, 'left');
    });
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.right * 80 + (this.rts.length ? Math.round(Math.max(0, 10000 - median(this.rts)) / 40) : 0),
      primary: { label: 'charts read right', value: this.right, unit: `of ${this.round}` },
      lines: [
        { label: 'right', value: `${this.right} of ${this.round}` },
        { label: 'typical time when right', value: this.rts.length ? ms(median(this.rts)) : '–' },
      ],
      saved: this.round >= 3,
    };
  }
}

// --- Units -----------------------------------------------------------------------------

const UNITS_MS = 60000;

/** Units of a kind, each with its size in the kind's base unit. */
const KINDS: { name: string; units: [string, number][] }[] = [
  { name: 'length', units: [['mm', 0.001], ['cm', 0.01], ['m', 1], ['km', 1000]] },
  { name: 'mass', units: [['mg', 0.001], ['g', 1], ['kg', 1000], ['t', 1e6]] },
  { name: 'time', units: [['s', 1], ['min', 60], ['h', 3600], ['days', 86400]] },
  { name: 'volume', units: [['ml', 0.001], ['cl', 0.01], ['l', 1]] },
  { name: 'data', units: [['KB', 1e3], ['MB', 1e6], ['GB', 1e9]] },
];

class Units implements Mini {
  private env!: MiniEnv;
  private left = '';
  private right = '';
  private bigger = 0;
  private at = 0;
  private t0 = 0;
  private started = false;
  private ok = 0;
  private bad = 0;
  private rts: number[] = [];
  private flash = 0;
  private note = '';
  private held = 0;
  private firstFrame = 0;

  start(env: MiniEnv): void {
    this.env = env;
  }

  private make(now: number): void {
    const k = pick(KINDS);
    for (let tries = 0; tries < 100; tries++) {
      const [u1, s1] = pick(k.units);
      const [u2, s2] = pick(k.units.filter((u) => u[0] !== u1));
      const v1 = pick([rint(1, 9), rint(10, 99), rint(100, 999), Math.round(rnd(0.1, 9.9) * 10) / 10]);
      // The other amount within a factor of three, so it takes thought.
      const target = v1 * s1 * rnd(0.33, 3);
      const v2raw = target / s2;
      // Two significant figures, so the amount reads cleanly whatever its size.
      const v2 = Number(v2raw.toPrecision(2));
      if (v2 < 0.01 || v2 > 99000) continue;
      if (v2 <= 0 || Math.abs(v1 * s1 - v2 * s2) / (v1 * s1) < 0.04) continue;
      this.left = `${v1} ${u1}`;
      this.right = `${v2} ${u2}`;
      this.bigger = v1 * s1 > v2 * s2 ? 0 : 1;
      break;
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
    const good = (s < 0 ? 0 : 1) === this.bigger;
    if (good) {
      this.ok++;
      this.rts.push(ts - this.at);
      this.env.sound(s < 0 ? SND_TAP_L : SND_TAP_R);
      this.note = '';
    } else {
      this.bad++;
      this.note = `${this.bigger ? this.right : this.left} is bigger`;
      this.flash = ts + 1000;
      this.env.sound(SND_FALSE);
    }
    this.make(ts);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    const len = scaled(UNITS_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'right', String(this.ok), 'time', `${left} s`);
    ctx.font = `600 ${Math.round(42 * a.u)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COL_LINE;
    if (this.started) {
      ctx.fillText(this.left, a.cx - 140 * a.u, a.cy - 10 * a.u);
      ctx.fillText(this.right, a.cx + 140 * a.u, a.cy - 10 * a.u);
    } else ctx.fillText('which is bigger?', a.cx, a.cy - 10 * a.u);
    ctx.fillStyle = COL_MID;
    v.text('press the side of the bigger amount', a.cx, a.cy + 50 * a.u, v.fontTiny, 'center');
    if (now < this.flash) {
      ctx.fillStyle = COL_ACCENT;
      v.text(this.note, a.cx, a.cy + 80 * a.u, v.fontTiny, 'center');
    }
    if (!this.started) v.text('press either side to start; a minute', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: Math.max(0, this.ok * 20 - this.bad * 30),
      primary: { label: 'right in a minute', value: this.ok, unit: '' },
      lines: [
        { label: 'right', value: String(this.ok) },
        { label: 'wrong', value: String(this.bad) },
        { label: 'typical time a pair', value: this.rts.length ? ms(median(this.rts)) : '–' },
      ],
      saved: this.ok + this.bad >= 5,
    };
  }
}

// --- Venn ------------------------------------------------------------------------------

const VENN_MS = 60000;
type Item = { shape: number; fill: number; size: number };
const SHAPE_NAMES = ['circles', 'squares', 'triangles'];
const FILL_NAMES = ['white', 'grey', 'outlined'];
const SIZE_NAMES = ['small', 'large'];

class Venn implements Mini {
  private env!: MiniEnv;
  /** Each rule: a feature (0 shape, 1 fill, 2 size) and its value. */
  private rules: [number, number][] = [];
  private item: Item = { shape: 0, fill: 0, size: 0 };
  private t0 = 0;
  private started = false;
  private ok = 0;
  private bad = 0;
  private at = 0;
  private rts: number[] = [];
  private count = 0;
  private flash = 0;
  private note = '';
  private firstFrame = 0;
  private cx = 0;
  private cy = 0;
  private R = 0;

  start(env: MiniEnv): void {
    this.env = env;
    this.newRules();
  }

  private newRules(): void {
    const f1 = rint(0, 2);
    let f2 = rint(0, 2);
    while (f2 === f1) f2 = rint(0, 2);
    this.rules = [[f1, rint(0, f1 === 2 ? 1 : 2)], [f2, rint(0, f2 === 2 ? 1 : 2)]];
  }

  private makeItem(now: number): void {
    this.item = { shape: rint(0, 2), fill: rint(0, 2), size: rint(0, 1) };
    this.at = now;
  }

  private value(it: Item, f: number): number {
    return f === 0 ? it.shape : f === 1 ? it.fill : it.size;
  }

  /** 0 neither, 1 left only, 2 right only, 3 both. */
  private region(it: Item): number {
    const a = this.value(it, this.rules[0]![0]) === this.rules[0]![1];
    const b = this.value(it, this.rules[1]![0]) === this.rules[1]![1];
    return (a ? 1 : 0) + (b ? 2 : 0);
  }

  private ruleName([f, v]: [number, number]): string {
    return f === 0 ? SHAPE_NAMES[v]! : f === 1 ? FILL_NAMES[v]! : SIZE_NAMES[v]!;
  }

  press(): void {}

  pointer(x: number, y: number, ts: number): void {
    if (!this.started) {
      this.started = true;
      this.t0 = ts;
      this.makeItem(ts);
      return;
    }
    const inL = Math.hypot(x - (this.cx - this.R * 0.5), y - this.cy) < this.R;
    const inR = Math.hypot(x - (this.cx + this.R * 0.5), y - this.cy) < this.R;
    const said = (inL ? 1 : 0) + (inR ? 2 : 0);
    const truth = this.region(this.item);
    if (said === truth) {
      this.ok++;
      this.rts.push(ts - this.at);
      this.env.sound(SND_TAP_WEAK);
    } else {
      this.bad++;
      this.note = ['outside both circles', 'in the left circle only', 'in the right circle only', 'in the middle, in both'][truth]!;
      this.flash = ts + 1100;
      this.env.sound(SND_FALSE);
    }
    this.count++;
    // New rules every eight items.
    if (this.count % 8 === 0) this.newRules();
    this.makeItem(ts);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    const len = scaled(VENN_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'right', String(this.ok), 'time', `${left} s`);
    this.R = Math.min((a.right - a.left) / 3.2, (a.bottom - a.top) * 0.36);
    this.cx = a.cx;
    this.cy = a.cy + 30 * a.u;
    for (const s of [-1, 1]) {
      ctx.strokeStyle = COL_MID;
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.arc(this.cx + s * this.R * 0.5, this.cy, this.R, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = COL_LINE;
      v.text(this.ruleName(this.rules[s < 0 ? 0 : 1]!), this.cx + s * this.R * 0.85, this.cy - this.R - 10 * a.u, v.fontHud, 'center');
    }
    // The item to place, above the circles.
    if (this.started) {
      const it = this.item;
      const r = (it.size ? 20 : 11) * a.u;
      const x = a.cx;
      const y = a.top + 18 * a.u;
      ctx.beginPath();
      if (it.shape === 0) ctx.arc(x, y, r, 0, TAU);
      else if (it.shape === 1) ctx.rect(x - r * 0.9, y - r * 0.9, r * 1.8, r * 1.8);
      else {
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r, y + r * 0.8);
        ctx.lineTo(x - r, y + r * 0.8);
        ctx.closePath();
      }
      if (it.fill === 2) {
        ctx.strokeStyle = COL_LINE;
        ctx.lineWidth = 2.5 * dpr;
        ctx.stroke();
      } else {
        ctx.fillStyle = it.fill === 0 ? COL_LINE : '#7a7a82';
        ctx.fill();
      }
    }
    ctx.fillStyle = now < this.flash ? COL_ACCENT : COL_MID;
    v.text(now < this.flash ? `it goes ${this.note}` : this.started ? 'click where the shape belongs (outside both counts too)' : 'click to start: put each shape in the right part of the diagram', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: Math.max(0, this.ok * 20 - this.bad * 25),
      primary: { label: 'placed right', value: this.ok, unit: '' },
      lines: [
        { label: 'right', value: String(this.ok) },
        { label: 'wrong', value: String(this.bad) },
        { label: 'typical time a shape', value: this.rts.length ? ms(median(this.rts)) : '–' },
        { label: 'accuracy', value: pct(this.ok / Math.max(1, this.ok + this.bad)) },
      ],
      saved: this.ok + this.bad >= 5,
    };
  }
}

// --- Map (distance by scale) -----------------------------------------------------------

const MAP_ROUNDS = 12;

class MapDrill implements Mini {
  private env!: MiniEnv;
  private round = 0;
  private p: [number, number][] = [];
  /** Kilometres the scale bar stands for, and its length (share of the map width). */
  private barKm = 10;
  private barLen = 0.2;
  private truth = 0;
  private typed = '';
  private state = 0;
  private at = 0;
  private errs: number[] = [];

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.arm(now);
  }

  private arm(now: number): void {
    this.barKm = pick([1, 2, 5, 10, 20, 50, 100]);
    this.barLen = rnd(0.12, 0.25);
    this.p = [[rnd(0.08, 0.92), rnd(0.12, 0.88)], [rnd(0.08, 0.92), rnd(0.12, 0.88)]];
    const d = Math.hypot((this.p[0]![0] - this.p[1]![0]) * 1.6, this.p[0]![1] - this.p[1]![1]);
    // Map units: the map is 1.6 wide, 1 tall; the bar's length is a share of the width.
    this.truth = (d / (this.barLen * 1.6)) * this.barKm;
    this.typed = '';
    this.state = 0;
    this.at = now;
  }

  press(): void {}

  typeKey(code: string, ts: number): boolean {
    const d = digitOf(code);
    if (this.state !== 0) return !!d;
    if (d) {
      if (this.typed.length < 5) this.typed += d;
      return true;
    }
    if (code === 'Backspace') {
      this.typed = this.typed.slice(0, -1);
      return true;
    }
    if ((code === 'Enter' || code === 'NumpadEnter' || code === 'Space') && this.typed) {
      const e = (Math.abs(Number(this.typed) - this.truth) / this.truth) * 100;
      this.errs.push(e);
      this.env.sound(e < 10 ? SND_CATCH : SND_TAP_WEAK);
      this.round++;
      this.state = 1;
      this.at = ts + 1800;
      return true;
    }
    return false;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 1 && now >= this.at) {
      if (this.round >= scaled(MAP_ROUNDS)) return true;
      this.arm(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'off by', this.errs.length ? `${mean(this.errs.slice(-3)).toFixed(0)}%` : '–', 'map', `${Math.min(this.round + 1, scaled(MAP_ROUNDS))} / ${scaled(MAP_ROUNDS)}`);
    const s = Math.min((a.right - a.left) / 1.6, a.bottom - a.top - 70 * a.u);
    const x0 = a.cx - 0.8 * s;
    const y0 = a.top + 6 * a.u;
    ctx.fillStyle = '#121215';
    ctx.fillRect(x0, y0, 1.6 * s, s);
    // A few faint roads, for the look of a map.
    ctx.strokeStyle = COL_FAINT;
    ctx.lineWidth = 3 * dpr;
    for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      ctx.moveTo(x0 + ((k * 0.37 + this.barLen) % 1) * 1.6 * s, y0);
      ctx.lineTo(x0 + ((k * 0.53 + this.barKm / 100) % 1) * 1.6 * s, y0 + s);
      ctx.stroke();
    }
    for (const [px, py] of this.p) {
      ctx.fillStyle = COL_ACCENT;
      ctx.beginPath();
      ctx.arc(x0 + px * 1.6 * s, y0 + py * s, 6 * dpr, 0, TAU);
      ctx.fill();
    }
    if (this.state === 1) {
      ctx.strokeStyle = COL_LINE;
      ctx.lineWidth = 1.5 * dpr;
      ctx.setLineDash?.([5 * dpr, 4 * dpr]);
      ctx.beginPath();
      ctx.moveTo(x0 + this.p[0]![0] * 1.6 * s, y0 + this.p[0]![1] * s);
      ctx.lineTo(x0 + this.p[1]![0] * 1.6 * s, y0 + this.p[1]![1] * s);
      ctx.stroke();
      ctx.setLineDash?.([]);
    }
    // The scale bar.
    const bx = x0 + 14 * a.u;
    const by = y0 + s - 16 * a.u;
    const bl = this.barLen * 1.6 * s;
    ctx.fillStyle = COL_LINE;
    ctx.fillRect(bx, by, bl, 3 * dpr);
    ctx.fillRect(bx, by - 6 * dpr, 2 * dpr, 9 * dpr);
    ctx.fillRect(bx + bl - 2 * dpr, by - 6 * dpr, 2 * dpr, 9 * dpr);
    v.text(`${this.barKm} km`, bx + bl / 2, by - 10 * dpr, v.fontTiny, 'center');
    ctx.fillStyle = COL_LINE;
    v.text(this.state === 1 ? `${Math.round(this.truth)} km  ·  you said ${this.typed} km` : `${this.typed || '_'} km`, a.cx, y0 + s + 34 * a.u, v.fontHud, 'center');
    if (this.round === 0 && this.state === 0) {
      ctx.fillStyle = COL_MID;
      v.text('how far apart are the two orange places, as the crow flies? type it in km, then Enter', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const m = mean(this.errs);
    return {
      score: this.errs.length ? Math.round(Math.max(0, 40 - m) * 25) : 0,
      primary: { label: 'average miss', value: m, unit: '%', lower: true },
      lines: [
        { label: 'average miss', value: this.errs.length ? `${m.toFixed(0)}%` : '–' },
        { label: 'within 10%', value: this.errs.length ? pct(this.errs.filter((e) => e < 10).length / this.errs.length) : '–' },
      ],
      saved: this.errs.length >= 3,
    };
  }
}

export const BATCH49: MiniDef[] = [
  { id: 'graph', name: 'Graph', skill: 'reasoning', blurb: 'A line chart and a question about it. Read it fast and right.', how: 'A chart of twelve months and a question: the value in a month, the highest month, the biggest rise; later two lines to compare. Pick the answer (1 to 4, or tap). Twelve charts; scored on how many you read right, and how fast.', input: 'pointer', make: () => new Graph() },
  { id: 'units', name: 'Units', skill: 'reasoning', blurb: 'Two amounts in different units. Which is bigger?', how: 'Two amounts of the same kind (lengths, weights, times, volumes or data sizes) in different units, like 2.5 km against 1800 m. Press the side of the bigger one. A minute; mistakes count against you and show the answer.', input: 'keys', minKeys: 2, make: () => new Units() },
  { id: 'venn', name: 'Venn', skill: 'reasoning', blurb: 'Two overlapping circles with rules. Where does this shape belong?', how: 'Two overlapping circles, each with a rule like “circles” or “grey”. A shape appears: click where it belongs: the left circle only, the right only, the middle if it fits both, or outside if neither. The rules change every eight shapes. A minute.', input: 'pointer', make: () => new Venn() },
  { id: 'map', name: 'Map', skill: 'judgement', blurb: 'Two places on a map and a scale bar. How far apart are they?', how: 'Two orange places on a map, and a scale bar. How far apart are they in a straight line? Type it in kilometres and press Enter. The scale changes every time. Scored as a percentage off. Twelve maps. Needs a keyboard.', input: 'type', make: () => new MapDrill() },
];
