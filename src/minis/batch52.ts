// Fifty-second batch.
//   Pan     - one tone, placed a little left or right: which side? (Headphones.)
//   Held    - two tones: which one lasted longer?
//   Weekday - "Tuesday, plus 10 days": what day is it?
//   Gallery - targets ride across on belts; hit the white ones, spare the hollow ones.

import { COL_ACCENT, COL_DIM, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALSE, SND_TAP_WEAK } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, handLabel, header, median, message, ms, pct, scaled, sideOf, Stair, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const TAU = Math.PI * 2;
const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const rint = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
type Rect = [number, number, number, number];
const inside = (r: Rect, x: number, y: number) => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
const digitOf = (code: string) => (code.startsWith('Digit') ? code.slice(5) : code.startsWith('Numpad') ? code.slice(6) : '');

/** A two-choice listening drill on a staircase: shared by Pan and Held. */
abstract class Listen implements Mini {
  protected env!: MiniEnv;
  protected i = 0;
  protected readonly stair: Stair;
  protected readonly steps: readonly number[];
  /** -1 or 1: the right answer this trial. */
  protected answer = 1;
  protected state = 0; // 0 gap, 1 playing, 2 answer, 3 feedback
  protected next = 0;
  protected right = 0;
  protected levels: number[] = [];
  protected last = '';
  protected held = 0;
  protected abstract readonly trials: number;

  constructor(steps: readonly number[]) {
    this.steps = steps;
    this.stair = new Stair(0, 1, 0, steps.length - 1, 2);
  }

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.next = now + 800;
  }

  protected level(): number {
    return this.steps[Math.round(this.stair.level)]!;
  }

  /** Starts a trial's sounds; returns when the answer may be given. */
  protected abstract play(now: number): number;
  /** Runs each frame while playing, for sounds that come later. */
  protected tick(_now: number): void {}
  protected abstract wrongNote(): string;
  protected abstract prompt(): string;
  protected abstract labels(): [string, string];

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (s === 0 || this.state !== 2) return;
    const ok = s === this.answer;
    if (ok) this.right++;
    this.levels.push(this.level());
    this.stair.update(ok, 1);
    this.last = ok ? '' : this.wrongNote();
    this.env.sound(ok ? SND_TAP_WEAK : SND_FALSE);
    this.i++;
    this.state = 3;
    this.next = ts + (ok ? 500 : 1000);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  protected abstract title(): [string, string];

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if ((this.state === 0 || this.state === 3) && now >= this.next) {
      if (this.i >= scaled(this.trials)) return true;
      this.answer = Math.random() < 0.5 ? -1 : 1;
      this.next = this.play(now);
      this.state = 1;
    }
    if (this.state === 1) this.tick(now);
    if (this.state === 1 && now >= this.next) this.state = 2;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const [hl, hv] = this.title();
    header(v, touch, hl, hv, 'trial', `${Math.min(this.i + 1, scaled(this.trials))} / ${scaled(this.trials)}`);
    ctx.fillStyle = this.state === 2 ? COL_LINE : this.state === 3 ? COL_ACCENT : COL_MID;
    v.text(this.state === 1 ? 'listen…' : this.state === 2 ? this.prompt() : this.last, a.cx, a.cy, v.fontHud, 'center');
    if (this.env.muted) message(v, { ...a, cy: a.cy + 50 * a.u }, '', 'needs sound on', COL_ACCENT);
    const off = Math.min(200 * a.u, (a.right - a.left) / 2 - 30 * a.u);
    const [l, r] = this.labels();
    ctx.fillStyle = COL_MID;
    v.text(`${handLabel(this.env, -1)}  ${l}`, a.cx - off, a.bottom - 6 * a.u, v.fontTiny, 'center');
    v.text(`${r}  ${handLabel(this.env, 1)}`, a.cx + off, a.bottom - 6 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  protected threshold(): number {
    return this.levels.length >= 6 ? median(this.levels.slice(-10)) : NaN;
  }

  abstract result(): MiniResult;
}

// --- Pan -------------------------------------------------------------------------------

/** How far off centre the tone sits (stereo pan, 1 = fully to one side). */
const PAN = [0.8, 0.6, 0.45, 0.32, 0.22, 0.15, 0.1, 0.07, 0.05, 0.035, 0.025, 0.015];

class Pan extends Listen {
  protected readonly trials = 30;

  constructor() {
    super(PAN);
  }

  protected play(now: number): number {
    const hz = 400 * 2 ** (Math.random() * 1.5);
    this.env.tone?.(hz, 350, this.answer * this.level(), 0.12);
    return now + 450;
  }

  protected wrongNote(): string {
    return `it was to the ${this.answer < 0 ? 'left' : 'right'}`;
  }

  protected prompt(): string {
    return 'left or right of the middle?';
  }

  protected labels(): [string, string] {
    return ['left', 'right'];
  }

  protected title(): [string, string] {
    return ['off centre', `${Math.round(this.level() * 100)}%`];
  }

  result(): MiniResult {
    const thr = this.threshold();
    return {
      score: Number.isFinite(thr) ? Math.round(Math.max(0, 0.6 - thr) * 2000) : 0,
      primary: { label: 'smallest offset heard', value: Number.isFinite(thr) ? Math.round(thr * 100) : NaN, unit: '%', lower: true },
      lines: [
        { label: 'right', value: `${this.right} of ${this.i}` },
        { label: 'smallest offset reached', value: this.levels.length ? `${Math.round(Math.min(...this.levels) * 100)}%` : '–' },
        { label: 'note', value: 'best with headphones' },
      ],
      saved: this.i >= 10,
    };
  }
}

// --- Held (which tone was longer) ------------------------------------------------------

/** How much longer the longer tone is (ms), over a base of about 300. */
const HELD = [200, 150, 110, 85, 65, 50, 40, 32, 25, 20, 15, 11, 8];

class Held extends Listen {
  protected readonly trials = 30;
  private second = 0;
  private secondMs = 0;
  private hz = 500;

  constructor() {
    super(HELD);
  }

  protected play(now: number): number {
    const base = rint(260, 340);
    const d1 = this.answer < 0 ? base + this.level() : base;
    const d2 = this.answer < 0 ? base : base + this.level();
    this.hz = 350 * 2 ** (Math.random() * 1.2);
    this.env.tone?.(this.hz, d1, 0, 0.1);
    this.second = now + d1 + 600;
    this.secondMs = d2;
    return this.second + d2 + 100;
  }

  protected override tick(now: number): void {
    if (this.second && now >= this.second) {
      this.second = 0;
      this.env.tone?.(this.hz, this.secondMs, 0, 0.1);
    }
  }

  protected wrongNote(): string {
    return `the ${this.answer < 0 ? 'first' : 'second'} was longer`;
  }

  protected prompt(): string {
    return 'which tone lasted longer?';
  }

  protected labels(): [string, string] {
    return ['first', 'second'];
  }

  protected title(): [string, string] {
    return ['difference', `${this.level()} ms`];
  }

  result(): MiniResult {
    const thr = this.threshold();
    return {
      score: Number.isFinite(thr) ? Math.round(Math.max(0, 210 - thr) * 7) : 0,
      primary: { label: 'smallest difference heard', value: thr, unit: 'ms', lower: true },
      lines: [
        { label: 'right', value: `${this.right} of ${this.i}` },
        { label: 'smallest step reached', value: this.levels.length ? `${Math.min(...this.levels)} ms` : '–' },
        { label: 'as a share of the tone', value: Number.isFinite(thr) ? pct(thr / 300) : '–' },
      ],
      saved: this.i >= 10,
    };
  }
}

// --- Weekday ---------------------------------------------------------------------------

const WEEKDAY_MS = 60000;
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

class Weekday implements Mini {
  private env!: MiniEnv;
  private q = '';
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
    const from = rint(0, 6);
    const hard = this.ok >= 8;
    const kind = rint(0, hard ? 3 : 1);
    let off = 0;
    if (kind === 0) {
      off = rint(2, hard ? 60 : 20);
      this.q = `${DAYS[from]}, plus ${off} days`;
    } else if (kind === 1) {
      off = -rint(2, hard ? 40 : 12);
      this.q = `${DAYS[from]}, ${-off} days ago`;
    } else if (kind === 2) {
      const w = rint(2, 5);
      const d = rint(1, 6);
      off = w * 7 + d;
      this.q = `${DAYS[from]}, plus ${w} weeks and ${d} days`;
    } else {
      off = rint(2, 4) * 7 + rint(-3, 3);
      this.q = `${DAYS[from]}, plus ${off} days`;
    }
    this.answer = (((from + off) % 7) + 7) % 7;
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
      this.note = `${this.q}: ${DAYS[this.answer]}`;
      this.flash = ts + 1400;
      this.env.sound(SND_FALSE);
    }
    this.make(ts);
  }

  typeKey(code: string, ts: number): boolean {
    const d = Number(digitOf(code));
    if (d >= 1 && d <= 7) {
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
    const len = scaled(WEEKDAY_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'right', String(this.ok), 'time', `${left} s`);
    ctx.font = `600 ${Math.round(30 * a.u)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COL_LINE;
    ctx.fillText(this.started ? this.q : 'what day will it be?', a.cx, a.cy - 60 * a.u);
    const bw = Math.min(90 * a.u, (a.right - a.left) / 7 - 8 * a.u);
    this.boxes = DAYS.map((_, k) => [a.cx + (k - 3.5) * (bw + 8 * a.u) + 4 * a.u, a.cy, bw, 44 * a.u] as Rect);
    this.boxes.forEach(([x, y, w, h], k) => {
      ctx.strokeStyle = COL_DIM;
      ctx.lineWidth = 1.5 * dpr;
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = COL_LINE;
      v.text(DAYS[k]!.slice(0, 3), x + w / 2, y + h / 2 + 5 * dpr, v.fontTiny, 'center');
      ctx.fillStyle = COL_DIM;
      v.text(String(k + 1), x + 6 * dpr, y + 12 * dpr, v.fontTiny, 'left');
    });
    if (now < this.flash) {
      ctx.fillStyle = COL_ACCENT;
      v.text(this.note, a.cx, a.cy + 80 * a.u, v.fontTiny, 'center');
    }
    ctx.fillStyle = COL_MID;
    if (!this.started) v.text('click (or press Space) to start; pick the day with 1 to 7 or a click. a minute', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
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
        { label: 'typical time a question', value: this.rts.length ? ms(median(this.rts)) : '–' },
      ],
      saved: this.ok + this.bad >= 4,
    };
  }
}

// --- Gallery ---------------------------------------------------------------------------

const GALLERY_MS = 60000;
const BELTS = 3;

type Target = { belt: number; x: number; friend: boolean; hit: number; born: number };

class Gallery implements Mini {
  private env!: MiniEnv;
  private targets: Target[] = [];
  private t0 = 0;
  private started = false;
  private last = 0;
  private nextSpawn = 0;
  private hits = 0;
  private escaped = 0;
  private friendly = 0;
  private wasted = 0;
  private rects: Rect = [0, 0, 1, 1];
  private shots: [number, number, number][] = [];
  private firstFrame = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.last = now;
  }

  private speed(belt: number, now: number): number {
    // Shares of the width per second; each belt its own speed and direction, faster with time.
    const t = this.started ? (now - this.t0) / 1000 : 0;
    return [0.16, -0.22, 0.28][belt]! * (1 + t / 70);
  }

  press(): void {}

  pointer(x: number, y: number, ts: number): void {
    if (!this.started) {
      this.started = true;
      this.t0 = ts;
      this.nextSpawn = ts;
      return;
    }
    const [fx, fy, fw, fh] = this.rects;
    const r = fh / BELTS * 0.22;
    this.shots.push([x, y, ts]);
    const k = this.targets.findIndex((t) => !t.hit && Math.hypot(fx + t.x * fw - x, fy + (t.belt + 0.5) * (fh / BELTS) - y) < r);
    if (k < 0) {
      this.wasted++;
      this.env.sound(SND_TAP_WEAK);
      return;
    }
    const t = this.targets[k]!;
    t.hit = ts;
    if (t.friend) {
      this.friendly++;
      this.env.sound(SND_FALSE);
    } else {
      this.hits++;
      this.env.sound(SND_CATCH);
    }
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    const len = scaled(GALLERY_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.started) {
      while (now >= this.nextSpawn) {
        const belt = rint(0, BELTS - 1);
        const dir = Math.sign(this.speed(belt, now));
        this.targets.push({ belt, x: dir > 0 ? -0.04 : 1.04, friend: Math.random() < 0.25, hit: 0, born: now });
        this.nextSpawn += Math.max(320, 900 - ((now - this.t0) / 1000) * 8) * rnd(0.6, 1.4);
      }
      for (const t of this.targets) if (!t.hit) t.x += this.speed(t.belt, now) * dt;
      this.targets = this.targets.filter((t) => {
        if (t.hit) return now - t.hit < 300;
        const out = t.x < -0.06 || t.x > 1.06;
        if (out && !t.friend) this.escaped++;
        return !out;
      });
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'hits', String(this.hits), 'time', `${left} s`);
    const fw = a.right - a.left;
    const fh = Math.min(a.bottom - a.top - 30 * a.u, fw * 0.6);
    const fx = a.left;
    const fy = a.top + 6 * a.u;
    this.rects = [fx, fy, fw, fh];
    const bh = fh / BELTS;
    const r = bh * 0.22;
    for (let b = 0; b < BELTS; b++) {
      ctx.fillStyle = '#16161a';
      ctx.fillRect(fx, fy + b * bh + bh * 0.5 + r + 4 * dpr, fw, 3 * dpr);
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(fx, fy, fw, fh);
    ctx.clip();
    for (const t of this.targets) {
      const x = fx + t.x * fw;
      const y = fy + (t.belt + 0.5) * bh;
      const k = t.hit ? 1 - (now - t.hit) / 300 : 1;
      ctx.globalAlpha = Math.max(0, k);
      if (t.friend) {
        ctx.strokeStyle = t.hit ? COL_ACCENT : COL_MID;
        ctx.lineWidth = 3 * dpr;
        ctx.beginPath();
        ctx.arc(x, y, r * 0.85, 0, TAU);
        ctx.stroke();
      } else {
        ctx.fillStyle = COL_LINE;
        ctx.beginPath();
        ctx.arc(x, y, r * (t.hit ? 1 + (1 - k) * 0.5 : 1), 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#111114';
        ctx.beginPath();
        ctx.arc(x, y, r * 0.35, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    ctx.fillStyle = COL_MID;
    v.text(this.started ? `${this.escaped} got away · ${this.friendly} hollow hit` : 'click to start: hit the solid white targets, spare the hollow rings. a minute', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const shots = this.hits + this.friendly + this.wasted;
    return {
      score: Math.max(0, this.hits * 20 - this.friendly * 40 - this.escaped * 5 - this.wasted * 3),
      primary: { label: 'targets hit', value: this.hits, unit: '' },
      lines: [
        { label: 'hits', value: String(this.hits) },
        { label: 'got away', value: String(this.escaped) },
        { label: 'hollow rings hit', value: String(this.friendly) },
        { label: 'accuracy', value: shots ? pct(this.hits / shots) : '–' },
      ],
      saved: this.started && shots >= 5,
    };
  }
}

export const BATCH52: MiniDef[] = [
  { id: 'pan', name: 'Pan', skill: 'ear', blurb: 'One tone, placed a little left or right. Which side? Best with headphones.', how: 'A short tone plays, placed slightly to the left or the right. Press the side it came from. Get it right and the next sits closer to the middle; miss and it moves out. Thirty tones; scored on the smallest offset you can hear. Use headphones: speakers smear the sides together.', input: 'keys', minKeys: 2, make: () => new Pan() },
  { id: 'held', name: 'Held', skill: 'ear', blurb: 'Two tones. Which one lasted longer?', how: 'Two tones of the same pitch, one after the other. Left if the first lasted longer, right if the second. The difference shrinks as you get them right. Thirty pairs; scored on the smallest difference you can hear.', input: 'keys', minKeys: 2, make: () => new Held() },
  { id: 'weekday', name: 'Weekday', skill: 'reasoning', blurb: '“Tuesday, plus 10 days.” What day is it?', how: 'A day and a jump forward or back, in days or weeks and days. Pick the day you land on (1 for Monday to 7 for Sunday, or click). The jumps grow after eight right. A minute; mistakes show the answer.', input: 'pointer', make: () => new Weekday() },
  { id: 'gallery', name: 'Gallery', skill: 'aim', blurb: 'Targets ride across on belts. Hit the white ones, spare the hollow ones.', how: 'Three belts carry targets across, each at its own speed and direction. Click the solid white targets before they leave; leave the hollow rings alone. Hitting a ring costs more than letting a target go. The belts speed up. A minute.', input: 'pointer', make: () => new Gallery() },
];
