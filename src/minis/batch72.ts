// Seventy-second batch.
//   Operator - 6 ? 3 = 18: which sign goes in the gap?
//   Accent   - eight beats, one a little louder. Which one?

import { COL_ACCENT, COL_DIM, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALSE } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, header, median, message, ms, scaled, Stair, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const rint = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
type Rect = [number, number, number, number];
const inside = (r: Rect, x: number, y: number) => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
const digitOf = (code: string) => (code.startsWith('Digit') ? code.slice(5) : code.startsWith('Numpad') ? code.slice(6) : '');

// --- Operator --------------------------------------------------------------------------

const OPERATOR_MS = 60000;
const OPS = ['+', '−', '×', '÷'];

class Operator implements Mini {
  private env!: MiniEnv;
  private parts: (number | string)[] = [];
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

  /** a op b, and whether the answer is a whole number and unique among the four signs. */
  private apply(a: number, op: number, b: number): number {
    return op === 0 ? a + b : op === 1 ? a - b : op === 2 ? a * b : a / b;
  }

  private make(now: number): void {
    const two = this.ok >= 8;
    for (let tries = 0; tries < 200; tries++) {
      const a = rint(2, 12);
      const b = rint(2, 12);
      const op = rint(0, 3);
      if (op === 3 && a % b) continue;
      if (!two) {
        const r = this.apply(a, op, b);
        // The answer must come from one sign only.
        if ([0, 1, 2, 3].filter((o) => this.apply(a, o, b) === r).length !== 1) continue;
        this.parts = [a, '?', b, '=', r];
        this.answer = op;
        break;
      }
      // Two gaps later: a ? b + c = r, with the first gap to fill.
      const c = rint(1, 9);
      const r = this.apply(a, op, b) + c;
      if (!Number.isInteger(r) || [0, 1, 2, 3].filter((o) => this.apply(a, o, b) + c === r).length !== 1) continue;
      this.parts = [a, '?', b, '+', c, '=', r];
      this.answer = op;
      break;
    }
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
      this.note = this.parts.map((p) => (p === '?' ? OPS[this.answer] : p)).join(' ');
      this.flash = ts + 1400;
      this.env.sound(SND_FALSE);
    }
    this.make(ts);
  }

  typeKey(code: string, ts: number): boolean {
    const d = Number(digitOf(code));
    const map: Record<string, number> = { Equal: 0, NumpadAdd: 0, Minus: 1, NumpadSubtract: 1, NumpadMultiply: 2, Slash: 3, NumpadDivide: 3 };
    if (d >= 1 && d <= 4) {
      this.pick(d - 1, ts);
      return true;
    }
    if (code in map && this.started) {
      this.pick(map[code]!, ts);
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
    const len = scaled(OPERATOR_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'right', String(this.ok), 'time', `${left} s`);
    ctx.font = `600 ${Math.round(44 * a.u)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COL_LINE;
    ctx.fillText(this.started ? this.parts.map((p) => (p === '?' ? '□' : p)).join(' ') : 'which sign?', a.cx, a.cy - 60 * a.u);
    const bw = Math.min(80 * a.u, (a.right - a.left) / 4 - 12 * a.u);
    this.boxes = OPS.map((_, k) => [a.cx + (k - 2) * (bw + 12 * a.u) + 6 * a.u, a.cy, bw, bw * 0.8] as Rect);
    this.boxes.forEach(([x, y, w, h], k) => {
      ctx.strokeStyle = COL_DIM;
      ctx.lineWidth = 1.5 * dpr;
      ctx.strokeRect(x, y, w, h);
      ctx.font = `600 ${Math.round(30 * a.u)}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = COL_LINE;
      ctx.fillText(OPS[k]!, x + w / 2, y + h / 2);
      ctx.fillStyle = COL_DIM;
      v.text(String(k + 1), x + 7 * dpr, y + 13 * dpr, v.fontTiny, 'left');
    });
    if (now < this.flash) {
      ctx.fillStyle = COL_ACCENT;
      v.text(this.note, a.cx, a.cy + 110 * a.u, v.fontTiny, 'center');
    }
    ctx.fillStyle = COL_MID;
    v.text(this.started ? 'pick the sign: 1 to 4, the sign keys, or a click' : 'click (or press Space) to start; a minute', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
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
        { label: 'typical time a sum', value: this.rts.length ? ms(median(this.rts)) : '–' },
      ],
      saved: this.ok + this.bad >= 4,
    };
  }
}

// --- Accent (which beat was louder) ----------------------------------------------------

const ACCENT_TRIALS = 24;
const BEATS = 8;
/** How much louder the accent is, in decibels. */
const DB = [8, 6, 4.5, 3.5, 2.5, 2, 1.5, 1];

class Accent implements Mini {
  private env!: MiniEnv;
  private readonly stair = new Stair(0, 1, 0, DB.length - 1, 2);
  private trial = 0;
  private loud = 0;
  private ioi = 380;
  private t0 = 0;
  private played = 0;
  private hz = 600;
  /** 0 pause, 1 playing, 2 answer, 3 feedback. */
  private state = 0;
  private at = 0;
  private boxes: Rect[] = [];
  private chosen = -1;
  private right = 0;
  private levels: number[] = [];

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.at = now + 800;
  }

  private play(now: number): void {
    this.loud = rint(1, BEATS - 2);
    this.hz = 500 * 2 ** (Math.random() * 0.8);
    this.t0 = now + 100;
    this.played = 0;
    this.state = 1;
    this.chosen = -1;
  }

  press(): void {}

  private pick(k: number, ts: number): void {
    if (this.state !== 2) return;
    this.chosen = k;
    const ok = k === this.loud;
    if (ok) this.right++;
    this.levels.push(DB[Math.round(this.stair.level)]!);
    this.stair.update(ok, 1);
    this.env.sound(ok ? SND_CATCH : SND_FALSE);
    this.trial++;
    this.state = 3;
    this.at = ts + (ok ? 700 : 1300);
  }

  typeKey(code: string, ts: number): boolean {
    const d = Number(digitOf(code));
    if (d >= 1 && d <= BEATS) {
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
    if (this.state === 0 && now >= this.at) this.play(now);
    if (this.state === 1) {
      // Each beat starts on its frame: a few milliseconds of jitter do not matter for loudness.
      while (this.played < BEATS && now >= this.t0 + this.played * this.ioi) {
        const db = this.played === this.loud ? DB[Math.round(this.stair.level)]! : 0;
        // Rove every beat's level a touch, so only a clear accent stands out.
        const g = 0.06 * 10 ** ((db + (Math.random() - 0.5) * 0.6) / 20);
        this.env.tone?.(this.hz, 90, 0, g);
        this.played++;
      }
      if (now >= this.t0 + BEATS * this.ioi) this.state = 2;
    }
    if (this.state === 3 && now >= this.at) {
      if (this.trial >= scaled(ACCENT_TRIALS)) return true;
      this.state = 0;
      this.at = now + 400;
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'accent', `${DB[Math.round(this.stair.level)]} dB`, 'run', `${Math.min(this.trial + 1, scaled(ACCENT_TRIALS))} / ${scaled(ACCENT_TRIALS)}`);
    const bw = Math.min(54 * a.u, (a.right - a.left) / (BEATS + 1));
    this.boxes = Array.from({ length: BEATS }, (_, k) => [a.cx + (k - BEATS / 2) * bw + 4 * dpr, a.cy - bw / 2, bw - 8 * dpr, bw] as Rect);
    this.boxes.forEach(([x, y, w, h], k) => {
      const show = this.state === 3;
      const now_ = this.state === 1 && k === this.played - 1 && now < this.t0 + k * this.ioi + 120;
      ctx.strokeStyle = show && k === this.loud ? COL_LINE : show && k === this.chosen ? COL_ACCENT : COL_DIM;
      ctx.lineWidth = (show && (k === this.loud || k === this.chosen) ? 2.5 : 1.5) * dpr;
      ctx.strokeRect(x, y, w, h);
      // Every beat lights the same, so the eye cannot tell which was loud.
      if (now_) {
        ctx.fillStyle = COL_MID;
        ctx.fillRect(x + 6 * dpr, y + 6 * dpr, w - 12 * dpr, h - 12 * dpr);
      }
      ctx.fillStyle = COL_MID;
      v.text(String(k + 1), x + w / 2, y + h + 18 * a.u, v.fontTiny, 'center');
    });
    ctx.fillStyle = this.state === 2 ? COL_LINE : COL_MID;
    v.text(this.state === 1 ? 'listen: one beat is louder' : this.state === 2 ? 'which beat was louder? press its number' : '', a.cx, a.cy - bw - 20 * a.u, v.fontHud, 'center');
    if (this.env.muted) message(v, { ...a, cy: a.cy + 90 * a.u }, '', 'needs sound on', COL_ACCENT);
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const thr = this.levels.length >= 8 ? median(this.levels.slice(-10)) : 0;
    return {
      score: thr ? Math.round(Math.max(0, 9 - thr) * 250) : 0,
      primary: { label: 'smallest accent heard', value: thr, unit: 'dB', lower: true, decimals: 1 },
      lines: [
        { label: 'right', value: `${this.right} of ${this.trial}` },
        { label: 'smallest step reached', value: this.levels.length ? `${Math.min(...this.levels)} dB` : '–' },
      ],
      saved: this.trial >= 8,
    };
  }
}

export const BATCH72: MiniDef[] = [
  { id: 'operator', name: 'Operator', skill: 'reasoning', blurb: '6 □ 3 = 18. Which sign goes in the gap?', how: 'A sum with its sign missing. Pick plus, minus, times or divide (1 to 4, the sign keys, or a click). After eight right, a second step is added after the gap. Only one sign ever fits. A minute; a mistake shows the full sum.', input: 'pointer', make: () => new Operator() },
  { id: 'accent', name: 'Accent', skill: 'ear', blurb: 'Eight beats, one a little louder. Which one?', how: 'Eight short beats at the same pitch; one of them is slightly louder. Press its number, 1 to 8 (or click its box). Get it right and the next accent is softer; miss and it is stronger. Twenty-four runs; scored on the smallest accent you can hear. Needs sound on.', input: 'pointer', make: () => new Accent() },
];
