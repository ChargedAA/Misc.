// Eighty-sixth batch.
//   Wider - two intervals, each two notes apart in pitch: which spans more?

import { COL_ACCENT, COL_LINE, COL_MID } from '../config.ts';
import { SND_FALSE, SND_TAP_WEAK } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, handLabel, header, median, message, scaled, sideOf, Stair, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const rint = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));

const WIDER_TRIALS = 24;
/** How many semitones wider the wider interval is. */
const STEPS = [5, 4, 3, 2, 1];

class Wider implements Mini {
  private env!: MiniEnv;
  private readonly stair = new Stair(0, 1, 0, STEPS.length - 1, 2);
  private i = 0;
  private second = true;
  /** Each note to play: when (ms after start) and its pitch. */
  private notes: [number, number][] = [];
  private played = 0;
  private t0 = 0;
  private state = 0; // 0 gap, 1 playing, 2 answer, 3 feedback
  private next = 0;
  private right = 0;
  private levels: number[] = [];
  private last = '';
  private sizes: [number, number] = [0, 0];
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.next = now + 800;
  }

  private play(now: number): void {
    const d = STEPS[Math.round(this.stair.level)]!;
    const small = rint(2, 9);
    const big = small + d;
    this.second = Math.random() < 0.5;
    this.sizes = this.second ? [small, big] : [big, small];
    // Each interval starts on its own note, so the top note gives nothing away; some go down.
    const hz = (semi: number) => 220 * 2 ** (semi / 12);
    const a0 = rint(0, 10);
    const b0 = rint(0, 10);
    const dirA = Math.random() < 0.7 ? 1 : -1;
    const dirB = Math.random() < 0.7 ? 1 : -1;
    const startA = dirA > 0 ? a0 : a0 + this.sizes[0];
    const startB = dirB > 0 ? b0 : b0 + this.sizes[1];
    this.notes = [
      [0, hz(startA)],
      [450, hz(startA + dirA * this.sizes[0])],
      [1400, hz(startB)],
      [1850, hz(startB + dirB * this.sizes[1])],
    ];
    this.t0 = now + 100;
    this.played = 0;
    this.state = 1;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (s === 0 || this.state !== 2) return;
    const ok = (s > 0) === this.second;
    if (ok) this.right++;
    this.levels.push(STEPS[Math.round(this.stair.level)]!);
    this.stair.update(ok, 1);
    this.last = ok ? '' : `the ${this.second ? 'second' : 'first'} was wider: ${this.sizes[0]} against ${this.sizes[1]} semitones`;
    this.env.sound(ok ? SND_TAP_WEAK : SND_FALSE);
    this.i++;
    this.state = 3;
    this.next = ts + (ok ? 600 : 1600);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if ((this.state === 0 || this.state === 3) && now >= this.next) {
      if (this.i >= scaled(WIDER_TRIALS)) return true;
      this.play(now);
    }
    if (this.state === 1) {
      while (this.played < this.notes.length && now >= this.t0 + this.notes[this.played]![0]) {
        const hz = this.notes[this.played]![1];
        if (this.env.note) this.env.note(hz, 420);
        else this.env.tone?.(hz, 400);
        this.played++;
      }
      if (now > this.t0 + 2400) this.state = 2;
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'difference', `${STEPS[Math.round(this.stair.level)]} semitone${STEPS[Math.round(this.stair.level)] === 1 ? '' : 's'}`, 'pair', `${Math.min(this.i + 1, scaled(WIDER_TRIALS))} / ${scaled(WIDER_TRIALS)}`);
    ctx.fillStyle = this.state === 2 ? COL_LINE : this.state === 3 && this.last ? COL_ACCENT : COL_MID;
    v.text(this.state === 1 ? (this.played <= 2 ? 'first pair…' : 'second pair…') : this.state === 2 ? 'which pair of notes was further apart?' : this.last, a.cx, a.cy, v.fontHud, 'center');
    if (this.env.muted) message(v, { ...a, cy: a.cy + 50 * a.u }, '', 'needs sound on', COL_ACCENT);
    const off = Math.min(200 * a.u, (a.right - a.left) / 2 - 30 * a.u);
    ctx.fillStyle = COL_MID;
    v.text(`${handLabel(this.env, -1)}  first`, a.cx - off, a.bottom - 6 * a.u, v.fontTiny, 'center');
    v.text(`second  ${handLabel(this.env, 1)}`, a.cx + off, a.bottom - 6 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const thr = this.levels.length >= 8 ? median(this.levels.slice(-10)) : 0;
    return {
      score: thr ? Math.round((6 - thr) * 300 + this.right * 10) : 0,
      primary: { label: 'smallest difference heard', value: thr, unit: 'semitones', lower: true },
      lines: [
        { label: 'right', value: `${this.right} of ${this.i}` },
        { label: 'smallest step reached', value: this.levels.length ? `${Math.min(...this.levels)} semitones` : '–' },
      ],
      saved: this.i >= 8,
    };
  }
}

export const BATCH86: MiniDef[] = [
  { id: 'wider', name: 'Wider', skill: 'ear', blurb: 'Two pairs of notes. Which pair is further apart in pitch?', how: 'Two notes, then two more. Which pair spans the bigger interval? Left for the first, right for the second. Each pair starts on its own note and some step down, so only the distance counts. The difference shrinks to a single semitone as you get them right. Twenty-four pairs. Needs sound on.', input: 'keys', minKeys: 2, make: () => new Wider() },
];
