// Shared pieces for the mini-games: the game interface, an adaptive staircase,
// arena layout, and a few drawing helpers that keep every game looking alike.

import { COL_DIM, COL_LINE, COL_MID, SLOT_REFLEX, type ModeDef } from '../config.ts';
import { ICON_CLOSE, type View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';

export type Skill = 'coordination' | 'reaction' | 'speed' | 'timing' | 'memory' | 'attention';

export const SKILLS: readonly { id: Skill; name: string; blurb: string }[] = [
  { id: 'reaction', name: 'Reaction', blurb: 'See it, press it.' },
  { id: 'speed', name: 'Speed', blurb: 'Tap rate you can hold and control.' },
  { id: 'timing', name: 'Timing', blurb: 'Press at exactly the right moment.' },
  { id: 'memory', name: 'Memory', blurb: 'Hold more in your head.' },
  { id: 'attention', name: 'Attention', blurb: 'Pick the signal out of the noise.' },
  { id: 'coordination', name: 'Coordination', blurb: 'Several things at once.' },
];

/** 'keys' games use the chosen key count; 'pointer' games are click or tap; 'both' accept either. */
export type InputKind = 'keys' | 'pointer' | 'both';

export interface MiniLine {
  label: string;
  value: string;
}

export interface MiniResult {
  /** Higher is better; used for "best". */
  score: number;
  /** The one number tracked across sessions. */
  primary: { label: string; value: number; unit: string; lower?: boolean; decimals?: number };
  lines: MiniLine[];
  /** Reaction times (ms) for a histogram, when the game measures them. */
  rts?: number[];
  /** Short sessions are not saved. */
  saved: boolean;
}

export interface MiniEnv {
  mode: ModeDef;
  /** Label of each slot (0..5 lift keys, 6 reflex). */
  labels: readonly string[];
  sound(id: number): void;
  /** True when sound is off (games that need audio fall back). */
  muted: boolean;
}

export interface Mini {
  start(env: MiniEnv, now: number): void;
  /** A key or pad went down. `ts` is the event's timeStamp. */
  press(slot: number, ts: number): void;
  release?(slot: number): void;
  /** A click or tap at canvas device pixels (pointer games). */
  pointer?(x: number, y: number, ts: number): void;
  /** Advance and draw. Returns true once the session is over. */
  frame(now: number, v: View, touch: TouchLayout): boolean;
  result(): MiniResult;
}

export interface MiniDef {
  id: string;
  name: string;
  skill: Skill;
  /** One line for the title screen. */
  blurb: string;
  /** How to play, a sentence or two for the pop-out. */
  how: string;
  input: InputKind;
  /** Fewest keys the game makes sense with. */
  minKeys?: number;
  make(): Mini;
}

// --- Keys ---------------------------------------------------------------------

/** -1 for a left-hand key, +1 for right, 0 for the reflex key. */
export function sideOf(slot: number): number {
  return slot === SLOT_REFLEX ? 0 : slot >= 3 ? 1 : -1;
}

/** Slots in play for a mode, left to right on the keyboard (reflex in the middle). */
export function slotsOf(m: ModeDef): number[] {
  const out: number[] = [];
  for (let i = 0; i < m.left; i++) out.push(i);
  if (m.reflex) out.push(SLOT_REFLEX);
  for (let i = 0; i < m.right; i++) out.push(3 + i);
  return out;
}

/** "Z / X" for the left hand, "N / M" for the right. */
export function handLabel(env: MiniEnv, side: number): string {
  const out: string[] = [];
  const n = side < 0 ? env.mode.left : env.mode.right;
  for (let i = 0; i < n; i++) out.push(env.labels[(side < 0 ? 0 : 3) + i] ?? '');
  return out.join(' / ');
}

// --- Adaptive difficulty -----------------------------------------------------

/**
 * Transformed up-down staircase: `down` correct answers in a row make it
 * harder, one miss makes it easier. 2-down 1-up settles near 71% correct,
 * the usual target for staying challenged without giving up.
 */
export class Stair {
  level: number;
  readonly step: number;
  readonly min: number;
  readonly max: number;
  readonly down: number;
  private run = 0;
  constructor(start: number, step: number, min: number, max: number, down = 2) {
    this.level = start;
    this.step = step;
    this.min = min;
    this.max = max;
    this.down = down;
  }
  /** `harder` is the direction that makes the task harder (+1 or -1). */
  update(correct: boolean, harder = 1): void {
    if (correct) {
      if (++this.run >= this.down) {
        this.run = 0;
        this.level = clamp(this.level + this.step * harder, this.min, this.max);
      }
    } else {
      this.run = 0;
      this.level = clamp(this.level - this.step * harder, this.min, this.max);
    }
  }
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function median(a: readonly number[]): number {
  if (a.length === 0) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function mean(a: readonly number[]): number {
  return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
}

export function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]!;
    a[i] = a[j]!;
    a[j] = t;
  }
  return a;
}

/** Exponential foreperiod: the wait is never more "due" than it was a moment ago. */
export function foreperiod(min: number, mean: number, max: number): number {
  return min + Math.min(max - min, -Math.log(1 - Math.random()) * mean);
}

export const ms = (v: number): string => `${Math.round(v)} ms`;
export const pct = (v: number): string => `${Math.round(v * 100)}%`;

// --- Layout and drawing ------------------------------------------------------

export interface Arena {
  cx: number;
  cy: number;
  top: number;
  bottom: number;
  left: number;
  right: number;
  /** Device pixels per layout unit: about 1 CSS pixel, shrinking on small screens. */
  u: number;
}

/** The free area below the header and above any touch pads. */
export function arena(v: View, touch: TouchLayout): Arena {
  const dpr = v.dpr;
  const top = 92 * dpr;
  let bottom = v.h - 40 * dpr;
  if (touch.active && touch.pads.length > 0) {
    let padTop = v.h;
    for (const p of touch.pads) if (p.y < padTop) padTop = p.y;
    bottom = Math.min(bottom, padTop - 16 * dpr);
  }
  const w = Math.min(v.w - 32 * dpr, 760 * dpr);
  const left = v.ox - w / 2;
  const u = Math.max(0.6 * dpr, Math.min(dpr * 1.2, (bottom - top) / 420, w / 560));
  return { cx: v.ox, cy: (top + bottom) / 2, top, bottom, left, right: left + w, u };
}

/**
 * The header every game shares: a label and number on the left, another on
 * the right, optional strikes (filled = left) in the middle.
 */
export function header(
  v: View,
  touch: TouchLayout,
  leftLabel: string,
  leftValue: string,
  rightLabel: string,
  rightValue: string,
  strikesLeft = -1,
  strikesMax = 3,
): void {
  const ctx = v.ctx;
  const dpr = v.dpr;
  const ty = 40 * dpr;
  const lx = Math.max(24 * dpr, v.ox - 330 * dpr);
  const rx = Math.min(v.w - (touch.active ? 84 : 24) * dpr, v.ox + 330 * dpr);
  ctx.fillStyle = COL_MID;
  v.text(leftLabel, lx, ty, v.fontTiny, 'left');
  v.text(rightLabel, rx, ty, v.fontTiny, 'right');
  ctx.fillStyle = COL_LINE;
  v.text(leftValue, lx, ty + 22 * dpr, v.fontHud, 'left');
  v.text(rightValue, rx, ty + 22 * dpr, v.fontHud, 'right');
  if (strikesLeft >= 0) {
    const q = 4 * dpr;
    ctx.lineWidth = dpr;
    for (let i = 0; i < strikesMax; i++) {
      const sx = v.ox + (i - (strikesMax - 1) / 2) * 16 * dpr;
      if (i < strikesLeft) {
        ctx.fillStyle = COL_LINE;
        ctx.fillRect(sx - q, ty + 10 * dpr, q * 2, q * 2);
      } else {
        ctx.strokeStyle = COL_DIM;
        ctx.strokeRect(sx - q + 0.5, ty + 10 * dpr + 0.5, q * 2 - 1, q * 2 - 1);
      }
    }
  }
}

/** The footer hint and touch controls. Call last. */
export function footer(v: View, touch: TouchLayout, held: number, hint = 'esc to finish'): void {
  if (!touch.active) {
    v.ctx.fillStyle = COL_DIM;
    v.text(hint, v.ox, v.h - 22 * v.dpr, v.fontTiny, 'center');
  }
  v.drawTouch(touch, ICON_CLOSE, held);
}

/** A centred message in the arena, with an optional smaller line under it. */
export function message(v: View, a: Arena, text: string, sub = '', color = COL_LINE): void {
  v.ctx.fillStyle = color;
  v.text(text, a.cx, a.cy, v.fontHud, 'center');
  if (sub) {
    v.ctx.fillStyle = COL_MID;
    v.text(sub, a.cx, a.cy + 22 * v.dpr, v.fontTiny, 'center');
  }
}

/** A thin progress line, `p` in 0..1, centred at (cx, y). */
export function progress(v: View, cx: number, y: number, half: number, p: number, color = COL_LINE): void {
  const ctx = v.ctx;
  ctx.lineWidth = 2 * v.dpr;
  ctx.strokeStyle = COL_DIM;
  ctx.beginPath();
  ctx.moveTo(cx - half, y);
  ctx.lineTo(cx + half, y);
  ctx.stroke();
  if (p > 0) {
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx - half, y);
    ctx.lineTo(cx - half + half * 2 * clamp(p, 0, 1), y);
    ctx.stroke();
  }
}

/** Big centred number with a small unit beside it. */
export function bigNumber(v: View, x: number, y: number, value: string, unit = '', color = COL_LINE): void {
  const ctx = v.ctx;
  ctx.font = v.fontBig;
  const w = ctx.measureText(value).width;
  ctx.fillStyle = color;
  v.text(value, x, y, v.fontBig, 'center');
  if (unit) {
    ctx.fillStyle = COL_MID;
    v.text(unit, x + w / 2 + 8 * v.dpr, y, v.fontTiny, 'left');
  }
}
