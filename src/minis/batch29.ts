// Twenty-ninth batch: Ear, a new skill. Pitch training, from "which is higher" to naming chords.
//   In tune  - a reference note, then two more: which one matches it?
//   Octave   - C4 for reference, then a note: which octave is it in?
//   Note     - C for reference, then a note: name it.
//   Interval - two notes: how far apart?
//   Chord    - three notes at once: major, minor, diminished or augmented?
//   Contour  - a short melody: which shape did it make?
//   Scale    - a scale goes up: major or minor?

import { COL_ACCENT, COL_DIM, COL_FAINT, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALSE } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { Stair, arena, footer, handLabel, header, mean, scaled, shuffle, sideOf, type Arena, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

function rint(lo: number, hi: number): number {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

type Rect = [number, number, number, number];

function inside(r: Rect, x: number, y: number): boolean {
  return x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
}

/** Frequency of a MIDI note number (69 = A4 = 440 Hz). */
function hz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

function note(v: View, a: Arena, text: string, color = COL_MID): void {
  v.ctx.fillStyle = color;
  v.text(text, a.cx, a.bottom - 14 * a.u, v.fontTiny, 'center');
}

// --- A question with a few labelled answers -----------------------------------------

/** Keys for answers 1-13: the number row, then - = [. */
const ANSWER_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal', 'BracketLeft'];
const ANSWER_LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', '['];

/**
 * The shared shape of a listening question: play something, then pick an answer from a few
 * buttons (tap, or press its number). Subclasses say what to play and what the answers are.
 */
abstract class EarQuiz implements Mini {
  protected env!: MiniEnv;
  protected i = 0;
  protected abstract readonly total: number;
  protected state = 0; // 0 gap, 1 playing, 2 answering, 3 feedback
  protected at = 0;
  protected options: string[] = [];
  protected answer = 0;
  protected chosen = -1;
  protected right = 0;
  protected byAnswer = new Map<string, [number, number]>();
  private rects: Rect[] = [];
  private playEnds = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.at = now + 700;
  }

  press(): void {}

  /** Set options and answer, and play the sound; return how long it lasts (ms). */
  protected abstract ask(): number;
  /** Play it again (the replay key). */
  protected abstract replay(): number;
  protected abstract prompt(): string;

  private choose(k: number, ts: number): void {
    if (this.state !== 2 || k < 0 || k >= this.options.length) return;
    this.chosen = k;
    const ok = k === this.answer;
    const key = this.options[this.answer]!;
    const rec = this.byAnswer.get(key) ?? [0, 0];
    this.byAnswer.set(key, [rec[0] + (ok ? 1 : 0), rec[1] + 1]);
    if (ok) this.right++;
    this.onAnswer(ok);
    this.env.sound(ok ? SND_CATCH : SND_FALSE);
    this.i++;
    this.state = 3;
    this.at = ts + (ok ? 800 : 1600);
  }

  protected onAnswer(_ok: boolean): void {}

  pointer(x: number, y: number, ts: number): void {
    const k = this.rects.findIndex((r) => inside(r, x, y));
    if (k >= 0) this.choose(k, ts);
  }

  typeKey(code: string, ts: number): boolean {
    const k = ANSWER_KEYS.indexOf(code);
    if (k >= 0) {
      this.choose(k, ts);
      return true;
    }
    if (code === 'KeyR' && (this.state === 2 || this.state === 1)) {
      this.playEnds = ts + this.replay();
      this.state = 1;
      return true;
    }
    return false;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.at) {
      this.chosen = -1;
      this.playEnds = now + this.ask();
      this.state = 1;
    } else if (this.state === 1 && now >= this.playEnds) this.state = 2;
    else if (this.state === 3 && now >= this.at) {
      if (this.i >= this.total) return true;
      this.state = 0;
      this.at = now + 300;
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'right', `${this.right} of ${this.i}`, 'question', `${Math.min(this.i + 1, this.total)} / ${this.total}`);
    ctx.fillStyle = this.state === 1 ? COL_LINE : COL_MID;
    v.text(this.state === 1 ? 'listen' : this.prompt(), a.cx, a.top + 40 * a.u, v.fontHud, 'center');
    this.drawExtra(v, a, now);
    // Answer buttons, in rows of up to four.
    const n = this.options.length;
    const cols = Math.min(4, n);
    const bw = Math.min(150 * a.u, (a.right - a.left) / cols - 10 * a.u);
    const bh = 52 * a.u;
    const rows = Math.ceil(n / cols);
    const y0 = a.cy - (rows * (bh + 10 * a.u)) / 2 + 30 * a.u;
    this.rects = [];
    this.options.forEach((label, k) => {
      const r = Math.floor(k / cols);
      const c = k % cols;
      const inRow = Math.min(cols, n - r * cols);
      const x = a.cx + (c - (inRow - 1) / 2) * (bw + 10 * a.u) - bw / 2;
      const y = y0 + r * (bh + 10 * a.u);
      this.rects.push([x, y, bw, bh]);
      const isAns = k === this.answer;
      const show = this.state === 3;
      ctx.strokeStyle = show && isAns ? COL_LINE : show && k === this.chosen ? COL_ACCENT : this.state === 2 ? COL_MID : COL_FAINT;
      ctx.lineWidth = v.dpr;
      ctx.strokeRect(x, y, bw, bh);
      ctx.fillStyle = this.state >= 2 ? COL_LINE : COL_DIM;
      v.text(label, x + bw / 2, y + bh / 2 + 6 * v.dpr, v.fontHud, 'center');
      ctx.fillStyle = COL_DIM;
      v.text(ANSWER_LABELS[k] ?? '', x + 10 * a.u, y + 16 * a.u, v.fontTiny, 'left');
    });
    note(v, a, this.env.muted ? 'sound is off: turn it on for these' : 'tap an answer or press its number  ·  R to hear it again');
    footer(v, touch, 0);
    return false;
  }

  protected drawExtra(_v: View, _a: Arena, _now: number): void {}

  result(): MiniResult {
    const worst = [...this.byAnswer.entries()].filter(([, r]) => r[1] >= 2).sort((x, y) => x[1][0] / x[1][1] - y[1][0] / y[1][1])[0];
    return {
      score: this.right * 40,
      primary: { label: 'right', value: this.i ? Math.round((this.right / this.i) * 100) : 0, unit: '%' },
      lines: [
        { label: 'right', value: `${this.right} of ${this.i}` },
        { label: 'hardest for you', value: worst ? `${worst[0]} (${worst[1][0]} of ${worst[1][1]})` : '–' },
      ],
      saved: this.i >= 4,
    };
  }
}

// --- In tune ------------------------------------------------------------------------

class InTune extends EarQuiz {
  protected readonly total = scaled(20);
  private readonly cents = new Stair(50, 6, 4, 80, 2);
  private levels: number[] = [];
  private ref = 60;
  private offFirst = false;
  private off = 0;

  protected ask(): number {
    this.ref = rint(55, 72);
    this.offFirst = Math.random() < 0.5;
    this.off = (Math.random() < 0.5 ? -1 : 1) * this.cents.level;
    this.options = ['the first', 'the second'];
    this.answer = this.offFirst ? 1 : 0;
    return this.replay();
  }

  protected replay(): number {
    const f = hz(this.ref);
    const bad = f * 2 ** (this.off / 1200);
    this.env.note?.(f, 600, 0);
    this.env.note?.(this.offFirst ? bad : f, 600, 900);
    this.env.note?.(this.offFirst ? f : bad, 600, 1700);
    return 2400;
  }

  protected prompt(): string {
    return `reference, then two notes: which one matches it?  (off by ${this.cents.level} cents)`;
  }

  protected override onAnswer(ok: boolean): void {
    this.levels.push(this.cents.level);
    this.cents.update(ok, -1);
  }

  override result(): MiniResult {
    const th = mean(this.levels.slice(-10));
    const r = super.result();
    return { ...r, score: this.i >= 4 ? Math.max(0, Math.round((90 - th) * 12)) : 0, primary: { label: 'smallest mistuning you hear', value: Math.round(th), unit: 'cents', lower: true }, lines: [{ label: 'right', value: `${this.right} of ${this.i}` }, { label: 'a semitone is', value: '100 cents' }] };
  }
}

// --- Octave -------------------------------------------------------------------------

class Octave extends EarQuiz {
  protected readonly total = scaled(16);
  private n = 60;

  protected ask(): number {
    const oct = rint(2, 6);
    this.n = 12 * (oct + 1) + rint(0, 11);
    this.options = ['2', '3', '4', '5', '6'];
    this.answer = oct - 2;
    return this.replay();
  }

  protected replay(): number {
    this.env.note?.(hz(60), 700, 0);
    this.env.note?.(hz(this.n), 900, 1100);
    return 2000;
  }

  protected prompt(): string {
    return 'middle C (C4) first, then a note: which octave is it in?';
  }
}

// --- Note ---------------------------------------------------------------------------

class Note extends EarQuiz {
  protected readonly total = scaled(20);
  private n = 60;

  protected ask(): number {
    // The white notes first; sharps and flats join later.
    const chromatic = this.i >= 10;
    const pcs = chromatic ? [...Array(12).keys()] : [0, 2, 4, 5, 7, 9, 11];
    const pc = pcs[rint(0, pcs.length - 1)]!;
    this.n = 60 + pc;
    this.options = pcs.map((p) => NAMES[p]!);
    this.answer = pcs.indexOf(pc);
    return this.replay();
  }

  protected replay(): number {
    this.env.note?.(hz(60), 700, 0);
    this.env.note?.(hz(this.n), 900, 1100);
    return 2000;
  }

  protected prompt(): string {
    return 'C first, then a note above it: which note?';
  }
}

// --- Interval -----------------------------------------------------------------------

const INTERVALS: [string, number][] = [
  ['unison', 0],
  ['minor 2nd', 1],
  ['major 2nd', 2],
  ['minor 3rd', 3],
  ['major 3rd', 4],
  ['4th', 5],
  ['tritone', 6],
  ['5th', 7],
  ['minor 6th', 8],
  ['major 6th', 9],
  ['minor 7th', 10],
  ['major 7th', 11],
  ['octave', 12],
];

class Interval extends EarQuiz {
  protected readonly total = scaled(20);
  private lo = 60;
  private size = 7;
  private together = false;

  protected ask(): number {
    // Start with a few clear ones; the set grows.
    const sets = [
      ['major 2nd', 'major 3rd', '5th', 'octave'],
      ['major 2nd', 'minor 3rd', 'major 3rd', '4th', '5th', 'octave'],
      INTERVALS.map((x) => x[0]),
    ];
    const pool = sets[Math.min(2, Math.floor(this.i / 7))]!;
    const name = pool[rint(0, pool.length - 1)]!;
    this.size = INTERVALS.find((x) => x[0] === name)![1];
    this.lo = rint(52, 67);
    this.together = this.i >= 14 && Math.random() < 0.5;
    this.options = pool;
    this.answer = pool.indexOf(name);
    return this.replay();
  }

  protected replay(): number {
    this.env.note?.(hz(this.lo), 800, 0);
    this.env.note?.(hz(this.lo + this.size), 800, this.together ? 0 : 900);
    return this.together ? 900 : 1800;
  }

  protected prompt(): string {
    return this.together ? 'two notes at once: how far apart?' : 'two notes, one after the other: how far apart?';
  }
}

// --- Chord --------------------------------------------------------------------------

const CHORDS: [string, number[]][] = [
  ['major', [0, 4, 7]],
  ['minor', [0, 3, 7]],
  ['diminished', [0, 3, 6]],
  ['augmented', [0, 4, 8]],
  ['major 7th', [0, 4, 7, 11]],
  ['dominant 7th', [0, 4, 7, 10]],
  ['minor 7th', [0, 3, 7, 10]],
];

class Chord extends EarQuiz {
  protected readonly total = scaled(20);
  private root = 60;
  private shape: number[] = [0, 4, 7];
  private spread = false;

  protected ask(): number {
    const n = this.i < 6 ? 2 : this.i < 12 ? 4 : 7;
    const pool = CHORDS.slice(0, n);
    const k = rint(0, pool.length - 1);
    this.shape = pool[k]![1];
    this.root = rint(52, 64);
    this.spread = Math.random() < 0.3;
    this.options = pool.map((c) => c[0]);
    this.answer = k;
    return this.replay();
  }

  protected replay(): number {
    // Struck together, sometimes rolled from the bottom.
    this.shape.forEach((iv, j) => this.env.note?.(hz(this.root + iv), 1200, this.spread ? j * 90 : 0));
    return 1300;
  }

  protected prompt(): string {
    return 'what kind of chord?';
  }
}

// --- Contour ------------------------------------------------------------------------

class Contour extends EarQuiz {
  protected readonly total = scaled(14);
  private melody: number[] = [];
  private shapes: number[][] = [];

  protected ask(): number {
    const len = 4 + Math.min(3, Math.floor(this.i / 4));
    const make = (): number[] => {
      const m = [rint(57, 67)];
      for (let k = 1; k < len; k++) m.push(m[k - 1]! + (Math.random() < 0.5 ? -1 : 1) * rint(1, 4));
      return m;
    };
    this.melody = make();
    const sign = (m: number[]) => m.slice(1).map((x, k) => Math.sign(x - m[k]!)).join('');
    const opts = [this.melody];
    while (opts.length < 3) {
      const o = make();
      if (!opts.some((p) => sign(p) === sign(o))) opts.push(o);
    }
    this.shapes = shuffle(opts);
    this.answer = this.shapes.indexOf(this.melody);
    this.options = ['1', '2', '3'];
    return this.replay();
  }

  protected replay(): number {
    this.melody.forEach((n, k) => this.env.note?.(hz(n), 380, k * 420));
    return this.melody.length * 420 + 100;
  }

  protected prompt(): string {
    return 'which shape did the melody make?';
  }

  protected override drawExtra(v: View, a: Arena): void {
    // Each option drawn as a line going up and down, above its button.
    const ctx = v.ctx;
    const w = Math.min(150 * a.u, (a.right - a.left) / 3 - 10 * a.u);
    this.shapes.forEach((m, k) => {
      const x0 = a.cx + (k - 1) * (w + 10 * a.u) - w / 2 + 14 * a.u;
      const lo = Math.min(...m);
      const hi = Math.max(...m, lo + 1);
      ctx.strokeStyle = this.state === 3 && k === this.answer ? COL_LINE : COL_MID;
      ctx.lineWidth = 2 * v.dpr;
      ctx.beginPath();
      m.forEach((n, j) => {
        const x = x0 + (j / (m.length - 1)) * (w - 28 * a.u);
        const y = a.cy - 10 * a.u - ((n - lo) / (hi - lo)) * 60 * a.u;
        if (j) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.stroke();
    });
  }
}

// --- Scale --------------------------------------------------------------------------

class Scale implements Mini {
  private env!: MiniEnv;
  private readonly total = scaled(16);
  private i = 0;
  private major = true;
  private state = 0;
  private at = 0;
  private right = 0;
  private lastOk = true;
  private held = 0;
  private notes: number[] = [];

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.at = now + 700;
  }

  private play(now: number): void {
    this.major = Math.random() < 0.5;
    const steps = this.major ? [0, 2, 4, 5, 7, 9, 11, 12] : [0, 2, 3, 5, 7, 8, 10, 12];
    const root = rint(55, 64);
    // Later ones play only the first five notes, so the third has to tell you.
    const n = this.i < 8 ? 8 : 5;
    this.notes = steps.slice(0, n).map((s) => root + s);
    this.notes.forEach((m, k) => this.env.note?.(hz(m), 300, k * 320));
    this.state = 1;
    this.at = now + n * 320 + 100;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (s === 0 || this.state !== 2) return;
    const ok = (s > 0) === !this.major;
    this.lastOk = ok;
    if (ok) this.right++;
    this.env.sound(ok ? SND_CATCH : SND_FALSE);
    this.i++;
    this.state = 3;
    this.at = ts + 1100;
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.at) this.play(now);
    else if (this.state === 1 && now >= this.at) this.state = 2;
    else if (this.state === 3 && now >= this.at) {
      if (this.i >= this.total) return true;
      this.state = 0;
      this.at = now + 300;
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'right', `${this.right} of ${this.i}`, 'scale', `${Math.min(this.i + 1, this.total)} / ${this.total}`);
    ctx.fillStyle = this.state === 3 && !this.lastOk ? COL_ACCENT : COL_LINE;
    v.text(this.state === 1 ? 'listen' : this.state === 3 ? (this.major ? 'major' : 'minor') : 'major or minor?', a.cx, a.cy - 20 * a.u, v.fontBig, 'center');
    note(v, a, this.env.muted ? 'sound is off: turn it on for this one' : `${handLabel(this.env, -1)} major (bright)  ·  ${handLabel(this.env, 1)} minor (dark)`);
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.right * 40,
      primary: { label: 'right', value: this.i ? Math.round((this.right / this.i) * 100) : 0, unit: '%' },
      lines: [{ label: 'right', value: `${this.right} of ${this.i}` }],
      saved: this.i >= 4,
    };
  }
}

export const BATCH29: MiniDef[] = [
  { id: 'intune', name: 'In tune', skill: 'ear', blurb: 'A reference note, then two more: which one matches it?', how: 'A reference note plays, then two more. One is exactly the reference; the other is slightly out of tune. Pick the one that matches (tap, or press 1 or 2; R plays it again). Get it right and the out-of-tune one gets closer. Scored in cents. Needs sound on.', input: 'pointer', make: () => new InTune() },
  { id: 'octave', name: 'Octave', skill: 'ear', blurb: 'Middle C for reference, then a note: which octave is it in?', how: 'Middle C (C4) plays, then another note. Which octave is it in, from 2 (low) to 6 (high)? Tap or press 1 to 5; R plays it again. Needs sound on.', input: 'pointer', make: () => new Octave() },
  { id: 'note', name: 'Note', skill: 'ear', blurb: 'C for reference, then a note: name it.', how: 'C plays, then a note above it. Name the note. The white notes (C D E F G A B) first; sharps and flats join halfway. Tap or press its number; R plays it again. Needs sound on.', input: 'pointer', make: () => new Note() },
  { id: 'interval', name: 'Interval', skill: 'ear', blurb: 'Two notes: how far apart?', how: 'Two notes play, one after the other (later sometimes together). Name the interval between them: 2nd, 3rd, 5th, octave… It starts with four clear choices and grows to all twelve. Tap or press its number; R plays it again. Needs sound on.', input: 'pointer', make: () => new Interval() },
  { id: 'chord', name: 'Chord', skill: 'ear', blurb: 'Three notes at once: major, minor, diminished or augmented?', how: 'A chord plays. What kind is it? Major and minor first; diminished and augmented join, then sevenths. Tap or press its number; R plays it again. Needs sound on.', input: 'pointer', make: () => new Chord() },
  { id: 'contour', name: 'Contour', skill: 'ear', blurb: 'A short melody: which shape did it make?', how: 'A short melody plays. Three shapes show lines going up and down: pick the one the melody followed. Melodies get longer. Tap or press 1 to 3; R plays it again. Needs sound on.', input: 'pointer', make: () => new Contour() },
  { id: 'scale', name: 'Scale', skill: 'ear', blurb: 'A scale goes up: major or minor?', how: 'A scale runs up. Left hand if it is major (bright), right hand if it is minor (dark). Later only the first five notes play, so the third note has to tell you. Needs sound on.', input: 'keys', minKeys: 2, make: () => new Scale() },
];

