// Eighty-eighth batch.
//   Switched - a row of symbols; after a blink, two have traded places. Click both.

import { COL_ACCENT, COL_DIM, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALSE, SND_TAP_WEAK } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, header, pct, scaled, shuffle, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const TAU = Math.PI * 2;
const rint = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
type Rect = [number, number, number, number];
const inside = (r: Rect, x: number, y: number) => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];

const SWITCH_ROUNDS = 14;
const SYMS = 10;

function sym(ctx: CanvasRenderingContext2D, k: number, x: number, y: number, r: number, lw: number): void {
  ctx.lineWidth = lw;
  ctx.beginPath();
  switch (k) {
    case 0: ctx.arc(x, y, r, 0, TAU); ctx.fill(); break;
    case 1: ctx.fillRect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7); break;
    case 2: ctx.moveTo(x, y - r); ctx.lineTo(x + r, y + r * 0.8); ctx.lineTo(x - r, y + r * 0.8); ctx.closePath(); ctx.fill(); break;
    case 3: ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r); ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r); ctx.stroke(); break;
    case 4: ctx.arc(x, y, r * 0.85, 0, TAU); ctx.stroke(); break;
    case 5: ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.75, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.75, y); ctx.closePath(); ctx.stroke(); break;
    case 6: ctx.fillRect(x - r, y - r * 0.25, 2 * r, r * 0.5); ctx.fillRect(x - r * 0.25, y - r, r * 0.5, 2 * r); break;
    case 7: ctx.arc(x, y, r, Math.PI, TAU); ctx.closePath(); ctx.fill(); break;
    case 8: ctx.strokeRect(x - r * 0.8, y - r * 0.8, r * 1.6, r * 1.6); break;
    default: ctx.moveTo(x, y + r); ctx.lineTo(x + r, y - r * 0.8); ctx.lineTo(x - r, y - r * 0.8); ctx.closePath(); ctx.stroke();
  }
}

class Switched implements Mini {
  private env!: MiniEnv;
  private round = 0;
  private n = 4;
  private row: number[] = [];
  private after: number[] = [];
  private pair: [number, number] = [0, 1];
  private picked: number[] = [];
  /** 0 study, 1 blank, 2 picking, 3 feedback. */
  private state = 0;
  private at = 0;
  private boxes: Rect[] = [];
  private right = 0;
  private best = 0;
  private streak = 0;
  private lastOk = true;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.arm(now);
  }

  private arm(now: number): void {
    this.row = shuffle(Array.from({ length: SYMS }, (_, k) => k)).slice(0, this.n);
    const i = rint(0, this.n - 1);
    let j = rint(0, this.n - 1);
    while (j === i) j = rint(0, this.n - 1);
    this.pair = [i, j];
    this.after = [...this.row];
    [this.after[i], this.after[j]] = [this.after[j]!, this.after[i]!];
    this.picked = [];
    this.state = 0;
    this.at = now + 1200 + this.n * 300;
  }

  press(): void {}

  pointer(x: number, y: number, ts: number): void {
    if (this.state === 0) {
      this.state = 1;
      this.at = ts + 600;
      return;
    }
    if (this.state !== 2) return;
    const k = this.boxes.findIndex((r) => inside(r, x, y));
    if (k < 0 || this.picked.includes(k)) return;
    this.picked.push(k);
    this.env.sound(SND_TAP_WEAK);
    if (this.picked.length < 2) return;
    const ok = this.picked.every((p) => this.pair.includes(p));
    this.lastOk = ok;
    if (ok) {
      this.right++;
      this.best = Math.max(this.best, this.n);
      if (++this.streak % 2 === 0) this.n = Math.min(9, this.n + 1);
    } else {
      this.streak = 0;
      this.n = Math.max(3, this.n - 1);
    }
    this.env.sound(ok ? SND_CATCH : SND_FALSE);
    this.round++;
    this.state = 3;
    this.at = ts + (ok ? 800 : 1500);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.at) {
      this.state = 1;
      this.at = now + 600;
    } else if (this.state === 1 && now >= this.at) this.state = 2;
    else if (this.state === 3 && now >= this.at) {
      if (this.round >= scaled(SWITCH_ROUNDS)) return true;
      this.arm(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'right', `${this.right} of ${this.round}`, 'row', `${Math.min(this.round + 1, scaled(SWITCH_ROUNDS))} / ${scaled(SWITCH_ROUNDS)}`);
    const bw = Math.min(80 * a.u, (a.right - a.left) / (this.n + 1));
    this.boxes = this.row.map((_, k) => [a.cx + (k - this.n / 2) * bw + 4 * dpr, a.cy - bw / 2 - 10 * a.u, bw - 8 * dpr, bw] as Rect);
    const shown = this.state === 0 ? this.row : this.state >= 2 ? this.after : null;
    this.boxes.forEach(([x, y, w, h], k) => {
      const pick = this.picked.includes(k);
      const isPair = this.state === 3 && this.pair.includes(k);
      ctx.strokeStyle = isPair ? COL_LINE : pick ? (this.state === 3 ? COL_ACCENT : COL_LINE) : COL_DIM;
      ctx.lineWidth = (isPair || pick ? 2.5 : 1.5) * dpr;
      ctx.strokeRect(x, y, w, h);
      if (shown) {
        ctx.fillStyle = COL_LINE;
        ctx.strokeStyle = COL_LINE;
        sym(ctx, shown[k]!, x + w / 2, y + h / 2, w * 0.25, 3 * dpr);
      }
    });
    ctx.fillStyle = COL_MID;
    v.text(this.state === 0 ? 'remember the order (click when ready)' : this.state === 2 ? 'two have swapped places: click both' : this.state === 3 && !this.lastOk ? 'the ringed pair had swapped' : '', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.right * 60 + this.best * 30,
      primary: { label: 'longest row kept', value: this.best, unit: 'symbols' },
      lines: [
        { label: 'right', value: `${this.right} of ${this.round}` },
        { label: 'accuracy', value: this.round ? pct(this.right / this.round) : '–' },
      ],
      saved: this.round >= 4,
    };
  }
}

export const BATCH88: MiniDef[] = [
  { id: 'switched', name: 'Switched', skill: 'memory', blurb: 'A row of symbols. After a blink, two have traded places. Click both.', how: 'A row of symbols: remember their order (click when ready). The row blinks off, then comes back with two of them swapped. Click the two that moved. Two right in a row and the next row is longer; a miss and it is shorter. Fourteen rows.', input: 'pointer', make: () => new Switched() },
];
