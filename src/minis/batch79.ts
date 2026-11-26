// Seventy-ninth batch.
//   Mirror  - a clock seen in a mirror: what time is it really?
//   Arrange - four bars of nearly the same length: click them from shortest to longest.

import { COL_ACCENT, COL_DIM, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALSE, SND_TAP_WEAK } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, header, mean, median, ms, scaled, shuffle, Stair, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const TAU = Math.PI * 2;
const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const rint = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
type Rect = [number, number, number, number];
const inside = (r: Rect, x: number, y: number) => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
const digitOf = (code: string) => (code.startsWith('Digit') ? code.slice(5) : code.startsWith('Numpad') ? code.slice(6) : '');

// --- Mirror (clock) --------------------------------------------------------------------

const MIRROR_MS = 60000;
const fmt = (m: number) => `${Math.floor(m / 60) || 12}:${String(m % 60).padStart(2, '0')}`;

class Mirror implements Mini {
  private env!: MiniEnv;
  /** The real time, in minutes past twelve (0..719), and the time the mirror shows. */
  private real = 0;
  private shown = 0;
  private opts: number[] = [];
  private answer = 0;
  private boxes: Rect[] = [];
  private t0 = 0;
  private at = 0;
  private started = false;
  private ok = 0;
  private bad = 0;
  private rts: number[] = [];
  private flash = 0;
  private note = '';
  private firstFrame = 0;

  start(env: MiniEnv): void {
    this.env = env;
  }

  private make(now: number): void {
    const step = this.ok < 6 ? 15 : 5;
    for (let tries = 0; tries < 50; tries++) {
      this.real = rint(0, 720 / step - 1) * step;
      this.shown = (720 - this.real) % 720;
      if (this.shown !== this.real) break;
    }
    // Wrong answers: the reading as seen, and near misses.
    const wrong = new Set<number>([this.shown]);
    for (const w of shuffle([this.real + 60, this.real - 60, this.real + 30, this.real - 30, (this.shown + 360) % 720])) {
      const x = ((w % 720) + 720) % 720;
      if (x !== this.real) wrong.add(x);
      if (wrong.size >= 3) break;
    }
    this.opts = [...wrong].slice(0, 3);
    this.answer = rint(0, 3);
    this.opts.splice(this.answer, 0, this.real);
    this.at = now;
  }

  press(): void {}

  private pick(k: number, ts: number): void {
    if (!this.started) {
      this.started = true;
      this.t0 = ts;
      this.make(ts);
      return;
    }
    if (k === this.answer) {
      this.ok++;
      this.rts.push(ts - this.at);
      this.env.sound(SND_CATCH);
    } else {
      this.bad++;
      this.note = `the mirror showed ${fmt(this.shown)}; really ${fmt(this.real)}`;
      this.flash = ts + 1600;
      this.env.sound(SND_FALSE);
    }
    this.make(ts);
  }

  typeKey(code: string, ts: number): boolean {
    const d = Number(digitOf(code));
    if (d >= 1 && d <= 4) {
      this.pick(d - 1, ts);
      return true;
    }
    if (!this.started && (code === 'Space' || code === 'Enter')) {
      this.pick(-1, ts);
      return true;
    }
    return false;
  }

  pointer(x: number, y: number, ts: number): void {
    if (!this.started) return this.pick(-1, ts);
    const k = this.boxes.findIndex((r) => inside(r, x, y));
    if (k >= 0) this.pick(k, ts);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    const len = scaled(MIRROR_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'right', String(this.ok), 'time', `${left} s`);
    // A plain clock face with ticks only, showing the mirrored time.
    const R = Math.min(90 * a.u, (a.bottom - a.top) * 0.25);
    const cx = a.cx;
    const cy = a.top + R + 20 * a.u;
    ctx.strokeStyle = COL_DIM;
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.stroke();
    for (let k = 0; k < 12; k++) {
      const ang = (k / 12) * TAU;
      const r0 = k % 3 === 0 ? R * 0.8 : R * 0.88;
      ctx.strokeStyle = k === 0 ? COL_LINE : COL_DIM;
      ctx.lineWidth = (k % 3 === 0 ? 3 : 1.5) * dpr;
      ctx.beginPath();
      ctx.moveTo(cx + Math.sin(ang) * r0, cy - Math.cos(ang) * r0);
      ctx.lineTo(cx + Math.sin(ang) * R * 0.97, cy - Math.cos(ang) * R * 0.97);
      ctx.stroke();
    }
    const t = this.started ? this.shown : 120;
    const hAng = ((t / 60) % 12) / 12 * TAU;
    const mAng = (t % 60) / 60 * TAU;
    ctx.strokeStyle = COL_LINE;
    ctx.lineCap = 'round';
    ctx.lineWidth = 5 * dpr;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.sin(hAng) * R * 0.5, cy - Math.cos(hAng) * R * 0.5);
    ctx.stroke();
    ctx.lineWidth = 3 * dpr;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.sin(mAng) * R * 0.78, cy - Math.cos(mAng) * R * 0.78);
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.fillStyle = COL_MID;
    v.text('seen in a mirror · twelve is at the top', cx, cy + R + 18 * a.u, v.fontTiny, 'center');
    if (this.started) {
      const bw = Math.min(90 * a.u, (a.right - a.left) / 4 - 12 * a.u);
      const by = cy + R + 34 * a.u;
      this.boxes = this.opts.map((_, k) => [a.cx + (k - 2) * (bw + 12 * a.u) + 6 * a.u, by, bw, 46 * a.u] as Rect);
      this.boxes.forEach(([x, y, w, h], k) => {
        ctx.strokeStyle = COL_DIM;
        ctx.lineWidth = 1.5 * dpr;
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = COL_LINE;
        v.text(fmt(this.opts[k]!), x + w / 2, y + h / 2 + 6 * dpr, v.fontHud, 'center');
        ctx.fillStyle = COL_DIM;
        v.text(String(k + 1), x + 7 * dpr, y + 13 * dpr, v.fontTiny, 'left');
      });
    }
    if (now < this.flash) {
      ctx.fillStyle = COL_ACCENT;
      v.text(this.note, a.cx, a.bottom - 26 * a.u, v.fontTiny, 'center');
    }
    ctx.fillStyle = COL_MID;
    v.text(this.started ? 'what time is it really? (1 to 4, or click)' : 'click (or press Space) to start; a minute', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: Math.max(0, this.ok * 30 - this.bad * 30),
      primary: { label: 'right in a minute', value: this.ok, unit: '' },
      lines: [
        { label: 'right', value: String(this.ok) },
        { label: 'wrong', value: String(this.bad) },
        { label: 'typical time a clock', value: this.rts.length ? ms(median(this.rts)) : '–' },
      ],
      saved: this.ok + this.bad >= 4,
    };
  }
}

// --- Arrange ---------------------------------------------------------------------------

const ARRANGE_ROUNDS = 16;

class Arrange implements Mini {
  private env!: MiniEnv;
  /** Step between neighbouring lengths, in percent. */
  private readonly gap = new Stair(12, 1, 2, 20, 2);
  private levels: number[] = [];
  private round = 0;
  private lens: number[] = [];
  private order: number[] = [];
  private got: number[] = [];
  private state = 0; // 0 picking, 1 result
  private at = 0;
  private boxes: Rect[] = [];
  private right = 0;
  private lastOk = true;
  private shownAt = 0;
  private rts: number[] = [];

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.arm(now);
  }

  private arm(now: number): void {
    const base = rnd(0.45, 0.6);
    const g = this.gap.level / 100;
    const sizes = [0, 1, 2, 3].map((k) => base * (1 + g) ** k);
    this.lens = shuffle(sizes);
    this.order = this.lens.map((_, k) => k).sort((x, y) => this.lens[x]! - this.lens[y]!);
    this.got = [];
    this.state = 0;
    this.shownAt = now;
  }

  press(): void {}

  pointer(x: number, y: number, ts: number): void {
    if (this.state !== 0) return;
    const k = this.boxes.findIndex((r) => inside(r, x, y));
    if (k < 0 || this.got.includes(k)) return;
    this.got.push(k);
    const ok = this.order[this.got.length - 1] === k;
    if (!ok || this.got.length === 4) {
      this.lastOk = ok;
      this.levels.push(this.gap.level);
      this.gap.update(ok, -1);
      if (ok) {
        this.right++;
        this.rts.push(ts - this.shownAt);
      }
      this.env.sound(ok ? SND_CATCH : SND_FALSE);
      this.round++;
      this.state = 1;
      this.at = ts + (ok ? 600 : 1300);
    } else this.env.sound(SND_TAP_WEAK);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 1 && now >= this.at) {
      if (this.round >= scaled(ARRANGE_ROUNDS)) return true;
      this.arm(now);
    }
    if (this.state === 0 && now - this.shownAt > 60000) {
      this.levels.push(this.gap.level);
      this.gap.update(false, -1);
      this.lastOk = false;
      this.round++;
      this.state = 1;
      this.at = now + 1300;
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'step', `${this.gap.level}%`, 'set', `${Math.min(this.round + 1, scaled(ARRANGE_ROUNDS))} / ${scaled(ARRANGE_ROUNDS)}`);
    const H = a.bottom - a.top - 70 * a.u;
    const bw = Math.min(50 * a.u, (a.right - a.left) / 8);
    // Bars stand at different heights off the ground, so tops cannot simply be compared.
    this.boxes = this.lens.map((len, k) => {
      const x = a.cx + (k - 1.5) * (bw * 2.4) - bw / 2;
      const lift = ((k * 37) % 5) * 0.03 * H;
      const h = len * H * 0.9;
      return [x, a.top + 20 * a.u + H - h - lift, bw, h] as Rect;
    });
    this.boxes.forEach(([x, y, w, h], k) => {
      const pickedAt = this.got.indexOf(k);
      const show = this.state === 1;
      ctx.fillStyle = pickedAt >= 0 ? (show && !this.lastOk && pickedAt === this.got.length - 1 ? COL_ACCENT : '#8a8a92') : COL_LINE;
      ctx.fillRect(x, y, w, h);
      if (pickedAt >= 0) {
        ctx.fillStyle = COL_MID;
        v.text(String(pickedAt + 1), x + w / 2, y - 10 * a.u, v.fontTiny, 'center');
      }
      if (show && !this.lastOk) {
        ctx.fillStyle = COL_DIM;
        v.text(`${this.order.indexOf(k) + 1}`, x + w / 2, y + h + 18 * a.u, v.fontTiny, 'center');
      }
    });
    ctx.fillStyle = this.state === 1 && !this.lastOk ? COL_ACCENT : COL_MID;
    v.text(this.state === 1 && !this.lastOk ? 'the right order is shown under the bars' : 'click the bars from shortest to longest', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const th = this.levels.length >= 6 ? mean(this.levels.slice(-8)) : 0;
    return {
      score: th ? Math.max(0, Math.round((21 - th) * 100 + this.right * 10)) : 0,
      primary: { label: 'smallest step you can order', value: Math.round(th * 10) / 10, unit: '%', lower: true, decimals: 1 },
      lines: [
        { label: 'step (last 8 sets)', value: th ? `${th.toFixed(1)}%` : '–' },
        { label: 'sets in order', value: `${this.right} of ${this.round}` },
        { label: 'typical time a set', value: this.rts.length ? ms(median(this.rts)) : '–' },
      ],
      saved: this.round >= 5,
    };
  }
}

export const BATCH79: MiniDef[] = [
  { id: 'glass', name: 'Glass', skill: 'reasoning', blurb: 'A clock seen in a mirror. What time is it really?', how: 'A clock face with no numbers, as seen in a mirror: left and right are swapped. Work out the real time and pick it (1 to 4, or click). One of the wrong answers is always the time as it appears. Quarter hours first, then any five minutes. A minute.', input: 'pointer', make: () => new Mirror() },
  { id: 'arrange', name: 'Arrange', skill: 'judgement', blurb: 'Four bars of nearly the same length. Click them from shortest to longest.', how: 'Four bars stand at different heights, so their tops are no guide. Click them in order from the shortest to the longest. Get a set right and the next is closer in length; a slip ends the set and shows the order. Sixteen sets; scored on the smallest step you can still order.', input: 'pointer', make: () => new Arrange() },
];
