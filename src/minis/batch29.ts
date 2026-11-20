// Twenty-ninth batch: Ear. Pitch training, from "is this in tune" to naming chords.
//   In tune  - one note: in tune or not? (no reference)
//   Octave   - a note: which octave? (with C4 first, or perfect pitch)
//   Note     - a note: name it (with C first, or perfect pitch)
//   Interval - two notes, up, down or together: how far apart?
//   Chord    - a chord: name its root and its type (with C first, or perfect pitch)
//   Contour  - a melody: which of four near-identical shapes did it make?
//   Scale    - a scale: which one (major, the minors, the modes)?

import { COL_ACCENT, COL_DIM, COL_FAINT, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALSE } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { Stair, arena, footer, header, mean, scaled, shuffle, type Arena, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

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
 * The shared shape of a listening question: play something, then pick an answer from labelled
 * buttons (tap, or press its number). Subclasses say what to play and what the answers are; an
 * answer can take two steps (a chord's root, then its type).
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
  protected lastOk = false;
  protected byAnswer = new Map<string, [number, number]>();
  private rects: Rect[] = [];
  private playEnds = 0;
  private rts: number[] = [];

  /** With a reference note first (level 0, the default), or perfect pitch (level 1). */
  protected get absolute(): boolean {
    return this.env.level === 1;
  }

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

  /** A first step of a two-step answer: take it and return true to keep answering. */
  protected step(_k: number): boolean {
    return false;
  }

  /** Whether the final choice is right. */
  protected judge(k: number): boolean {
    return k === this.answer;
  }

  /** The right answer, in words, for feedback and the "hardest for you" line. */
  protected answerName(): string {
    return this.options[this.answer] ?? '';
  }

  /** What "hardest for you" is grouped by. */
  protected answerKind(): string {
    return this.answerName();
  }

  private choose(k: number, ts: number): void {
    if (this.state !== 2 || k < 0 || k >= this.options.length) return;
    if (this.step(k)) return;
    this.chosen = k;
    const ok = this.judge(k);
    this.lastOk = ok;
    const key = this.answerKind();
    const rec = this.byAnswer.get(key) ?? [0, 0];
    this.byAnswer.set(key, [rec[0] + (ok ? 1 : 0), rec[1] + 1]);
    if (ok) this.right++;
    // Answer time counts from when the sound finished.
    if (ok && ts >= this.playEnds) this.rts.push(ts - this.playEnds);
    this.onAnswer(ok);
    this.env.sound(ok ? SND_CATCH : SND_FALSE);
    this.i++;
    this.state = 3;
    this.at = ts + (ok ? 800 : 1800);
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
    if (this.state === 3) {
      ctx.fillStyle = this.lastOk ? COL_LINE : COL_ACCENT;
      v.text(this.lastOk ? `right: ${this.answerName()}` : `it was ${this.answerName()}`, a.cx, a.top + 40 * a.u, v.fontHud, 'center');
    } else {
      ctx.fillStyle = this.state === 1 ? COL_LINE : COL_MID;
      v.text(this.state === 1 ? 'listen' : this.prompt(), a.cx, a.top + 40 * a.u, v.fontHud, 'center');
    }
    this.drawExtra(v, a, now);
    // Answer buttons: rows of four, or six for long lists (the twelve notes).
    const n = this.options.length;
    const cols = n <= 4 ? n : n <= 8 ? 4 : 6;
    const bw = Math.min(150 * a.u, (a.right - a.left) / cols - 10 * a.u);
    const bh = (n > 8 ? 46 : 52) * a.u;
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
      v.text(label, x + bw / 2, y + bh / 2 + 6 * v.dpr, n > 8 || label.length > 9 ? v.fontTiny : v.fontHud, 'center');
      ctx.fillStyle = COL_DIM;
      v.text(ANSWER_LABELS[k] ?? '', x + 8 * a.u, y + 15 * a.u, v.fontTiny, 'left');
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
      rts: this.rts,
      saved: this.i >= 4,
    };
  }
}

/** Ear games that can be played with a reference note or from memory. */
const REF_LEVELS = [
  { label: 'With a reference', desc: 'C plays first, so you can work it out from there', value: 0 },
  { label: 'Perfect pitch', desc: 'No reference: name it from memory', value: 1 },
];

// --- In tune ------------------------------------------------------------------------

/** Mistunings, in cents, each about 20% smaller than the last: from half a semitone to 2 cents. */
const MISTUNE = [50, 40, 32, 25, 20, 16, 13, 10, 8, 6, 5, 4, 3, 2];

class InTune extends EarQuiz {
  protected readonly total = scaled(24);
  private readonly st = new Stair(1, 1, 0, MISTUNE.length - 1);
  private get cents(): number {
    return MISTUNE[this.st.level]!;
  }
  private levels: number[] = [];
  private n = 60;
  private off = 0;

  protected ask(): number {
    this.n = rint(52, 76);
    // Half the notes are exactly in tune (A4 = 440 Hz, equal temperament).
    this.off = Math.random() < 0.5 ? 0 : (Math.random() < 0.5 ? -1 : 1) * this.cents;
    this.options = ['in tune', 'out of tune'];
    this.answer = this.off === 0 ? 0 : 1;
    return this.replay();
  }

  protected replay(): number {
    this.env.note?.(hz(this.n) * 2 ** (this.off / 1200), 1100, 0);
    return 1200;
  }

  protected prompt(): string {
    return 'one note: is it in tune?';
  }

  protected override answerName(): string {
    return this.off === 0 ? 'in tune' : `${Math.abs(this.off)} cents ${this.off > 0 ? 'sharp' : 'flat'}`;
  }

  protected override answerKind(): string {
    return this.off === 0 ? 'in tune' : this.off > 0 ? 'sharp' : 'flat';
  }

  protected override onAnswer(ok: boolean): void {
    if (this.off !== 0) this.levels.push(this.cents);
    this.st.update(ok);
  }

  override result(): MiniResult {
    const th = this.levels.length ? mean(this.levels.slice(-8)) : 50;
    const r = super.result();
    return {
      ...r,
      score: this.i >= 4 ? Math.max(0, Math.round((60 - th) * 15 + this.right * 10)) : 0,
      primary: { label: 'smallest mistuning you hear', value: Math.round(th), unit: 'cents', lower: true },
      lines: [...r.lines, { label: 'a semitone is', value: '100 cents' }],
    };
  }
}

// --- Octave -------------------------------------------------------------------------

class Octave extends EarQuiz {
  protected readonly total = scaled(16);
  private n = 60;

  protected ask(): number {
    const oct = rint(2, 6);
    // Notes near the edge of an octave (A, B♭, B, C, C♯) are the hard ones: half are from there.
    const pc = Math.random() < 0.5 ? [9, 10, 11, 0, 1][rint(0, 4)]! : rint(0, 11);
    this.n = 12 * (oct + 1) + pc;
    this.options = ['2', '3', '4', '5', '6'];
    this.answer = oct - 2;
    return this.replay();
  }

  protected replay(): number {
    if (this.absolute) {
      this.env.note?.(hz(this.n), 900, 0);
      return 1000;
    }
    this.env.note?.(hz(60), 700, 0);
    this.env.note?.(hz(this.n), 900, 1100);
    return 2000;
  }

  protected override answerName(): string {
    return `${NAMES[this.n % 12]}${Math.floor(this.n / 12) - 1}`;
  }

  protected override answerKind(): string {
    return `octave ${Math.floor(this.n / 12) - 1}`;
  }

  protected prompt(): string {
    return this.absolute ? 'which octave is this note in?' : 'middle C (C4), then a note: which octave?';
  }
}

// --- Note ---------------------------------------------------------------------------

class Note extends EarQuiz {
  protected readonly total = scaled(20);
  private n = 60;

  protected ask(): number {
    // All twelve, in any octave from C3 to B5.
    const pc = rint(0, 11);
    this.n = 48 + 12 * rint(0, 2) + pc;
    this.options = [...NAMES];
    this.answer = pc;
    return this.replay();
  }

  protected replay(): number {
    if (this.absolute) {
      this.env.note?.(hz(this.n), 1000, 0);
      return 1100;
    }
    this.env.note?.(hz(60), 700, 0);
    this.env.note?.(hz(this.n), 1000, 1100);
    return 2200;
  }

  protected prompt(): string {
    return this.absolute ? 'name this note' : 'C first, then a note (any octave): name it';
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
  private how: 'up' | 'down' | 'together' = 'up';

  protected ask(): number {
    // All thirteen from the start; going up, coming down, or struck together.
    const k = rint(0, INTERVALS.length - 1);
    this.size = INTERVALS[k]![1];
    this.lo = rint(50, 67);
    const r = Math.random();
    this.how = r < 0.4 ? 'up' : r < 0.75 ? 'down' : 'together';
    this.options = INTERVALS.map((x) => x[0]);
    this.answer = k;
    return this.replay();
  }

  protected replay(): number {
    const [first, second] = this.how === 'down' ? [this.lo + this.size, this.lo] : [this.lo, this.lo + this.size];
    this.env.note?.(hz(first), 800, 0);
    this.env.note?.(hz(second), 800, this.how === 'together' ? 0 : 900);
    return this.how === 'together' ? 900 : 1800;
  }

  protected override answerName(): string {
    return `${this.options[this.answer]} (${this.how === 'together' ? 'together' : this.how})`;
  }

  protected override answerKind(): string {
    return this.options[this.answer] ?? '';
  }

  protected prompt(): string {
    return this.how === 'together' ? 'two notes at once: how far apart?' : `two notes, going ${this.how}: how far apart?`;
  }
}

// --- Chord --------------------------------------------------------------------------

const CHORDS: [string, number[]][] = [
  ['major', [0, 4, 7]],
  ['minor', [0, 3, 7]],
  ['diminished', [0, 3, 6]],
  ['augmented', [0, 4, 8]],
  ['sus2', [0, 2, 7]],
  ['sus4', [0, 5, 7]],
  ['major 7th', [0, 4, 7, 11]],
  ['dominant 7th', [0, 4, 7, 10]],
  ['minor 7th', [0, 3, 7, 10]],
  ['half-dim 7th', [0, 3, 6, 10]],
  ['diminished 7th', [0, 3, 6, 9]],
  ['minor-major 7th', [0, 3, 7, 11]],
];

class Chord extends EarQuiz {
  protected readonly total = scaled(16);
  private root = 0;
  private kind = 0;
  private notes: number[] = [];
  private rootGuess = -1;
  private pool = 6;

  protected ask(): number {
    // Triads first (six kinds); sevenths join after eight, and inversions after twelve.
    this.pool = this.i < 8 ? 6 : CHORDS.length;
    this.root = rint(0, 11);
    this.kind = rint(0, this.pool - 1);
    const base = 48 + this.root + (this.root < 5 ? 12 : 0);
    let notes = CHORDS[this.kind]![1].map((iv) => base + iv);
    if (this.i >= 12 && Math.random() < 0.6) {
      // Invert: move the lowest one or two notes up an octave.
      const inv = rint(1, notes.length - 1);
      notes = [...notes.slice(inv), ...notes.slice(0, inv).map((x) => x + 12)];
    }
    this.notes = notes;
    this.rootGuess = -1;
    this.options = [...NAMES];
    this.answer = this.root;
    return this.replay();
  }

  protected replay(): number {
    let t = 0;
    if (!this.absolute) {
      this.env.note?.(hz(60), 600, 0);
      t = 900;
    }
    this.notes.forEach((m) => this.env.note?.(hz(m), 1400, t));
    return t + 1500;
  }

  protected override step(k: number): boolean {
    if (this.rootGuess >= 0) return false;
    // First the root; then the same buttons become the chord types.
    this.rootGuess = k;
    this.options = CHORDS.slice(0, this.pool).map((c) => c[0]);
    this.answer = this.kind;
    return true;
  }

  protected override judge(k: number): boolean {
    return this.rootGuess === this.root && k === this.kind;
  }

  protected override answerName(): string {
    const name = `${NAMES[this.root]} ${CHORDS[this.kind]![0]}`;
    if (this.state !== 3 || this.lastOk) return name;
    const rootOk = this.rootGuess === this.root;
    const kindOk = this.chosen === this.kind;
    return `${name}${rootOk ? ' (root right)' : kindOk ? ' (type right)' : ''}`;
  }

  protected override answerKind(): string {
    return CHORDS[this.kind]![0];
  }

  protected prompt(): string {
    const ref = this.absolute ? '' : 'after the C, ';
    return this.rootGuess < 0 ? `${ref}what is the chord?  first its root note` : `root ${NAMES[this.rootGuess]}: now what type?`;
  }
}

// --- Contour ------------------------------------------------------------------------

class Contour extends EarQuiz {
  protected readonly total = scaled(14);
  private melody: number[] = [];
  private shapes: number[][] = [];

  protected ask(): number {
    // Longer melodies, small steps, and decoys that differ in only one or two moves.
    const len = 6 + Math.min(3, Math.floor(this.i / 4));
    const m = [rint(57, 67)];
    for (let k = 1; k < len; k++) m.push(m[k - 1]! + (Math.random() < 0.5 ? -1 : 1) * rint(1, 2));
    this.melody = m;
    const sign = (x: number[]) => x.slice(1).map((y, k) => Math.sign(y - x[k]!)).join('');
    const opts = [m];
    let guard = 0;
    while (opts.length < 4 && guard++ < 200) {
      const o = [...m];
      const flips = rint(1, 2);
      for (let f = 0; f < flips; f++) {
        const at = rint(1, len - 1);
        const d = o[at]! - o[at - 1]!;
        const delta = -2 * d;
        for (let j = at; j < len; j++) o[j]! += delta;
      }
      if (!opts.some((p) => sign(p) === sign(o))) opts.push(o);
    }
    this.shapes = shuffle(opts);
    this.answer = this.shapes.indexOf(m);
    this.options = this.shapes.map((_, k) => String(k + 1));
    return this.replay();
  }

  protected replay(): number {
    this.melody.forEach((n, k) => this.env.note?.(hz(n), 340, k * 380));
    return this.melody.length * 380 + 100;
  }

  protected prompt(): string {
    return 'which shape did the melody make?';
  }

  protected override answerName(): string {
    return `shape ${this.answer + 1}`;
  }

  protected override answerKind(): string {
    return `${this.melody.length} notes`;
  }

  protected override drawExtra(v: View, a: Arena): void {
    // Each option drawn as a line going up and down, above its button.
    const ctx = v.ctx;
    const n = this.shapes.length;
    const w = Math.min(140 * a.u, (a.right - a.left) / n - 10 * a.u);
    this.shapes.forEach((m, k) => {
      const x0 = a.cx + (k - (n - 1) / 2) * (w + 10 * a.u) - w / 2 + 12 * a.u;
      const lo = Math.min(...m);
      const hi = Math.max(...m, lo + 1);
      ctx.strokeStyle = this.state === 3 && k === this.answer ? COL_LINE : COL_MID;
      ctx.lineWidth = 2 * v.dpr;
      ctx.beginPath();
      m.forEach((note, j) => {
        const x = x0 + (j / (m.length - 1)) * (w - 24 * a.u);
        const y = a.cy - 10 * a.u - ((note - lo) / (hi - lo)) * 60 * a.u;
        if (j) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.stroke();
    });
  }
}

// --- Scale --------------------------------------------------------------------------

const SCALES: [string, number[]][] = [
  ['major', [0, 2, 4, 5, 7, 9, 11, 12]],
  ['natural minor', [0, 2, 3, 5, 7, 8, 10, 12]],
  ['harmonic minor', [0, 2, 3, 5, 7, 8, 11, 12]],
  ['melodic minor', [0, 2, 3, 5, 7, 9, 11, 12]],
  ['dorian', [0, 2, 3, 5, 7, 9, 10, 12]],
  ['mixolydian', [0, 2, 4, 5, 7, 9, 10, 12]],
  ['lydian', [0, 2, 4, 6, 7, 9, 11, 12]],
  ['phrygian', [0, 1, 3, 5, 7, 8, 10, 12]],
];

class Scale extends EarQuiz {
  protected readonly total = scaled(16);
  private notes: number[] = [];
  private kind = 0;
  private down = false;

  protected ask(): number {
    // Major and the three minors first; the modes join after six.
    const pool = this.i < 6 ? 4 : SCALES.length;
    this.kind = rint(0, pool - 1);
    const root = rint(53, 64);
    this.down = this.i >= 6 && Math.random() < 0.4;
    const up = SCALES[this.kind]![1].map((s) => root + s);
    this.notes = this.down ? [...up].reverse() : up;
    this.options = SCALES.slice(0, pool).map((x) => x[0]);
    this.answer = this.kind;
    return this.replay();
  }

  protected replay(): number {
    this.notes.forEach((m, k) => this.env.note?.(hz(m), 300, k * 300));
    return this.notes.length * 300 + 100;
  }

  protected prompt(): string {
    return `a scale going ${this.down ? 'down' : 'up'}: which one?`;
  }
}

export const BATCH29: MiniDef[] = [
  { id: 'intune', name: 'In tune', skill: 'ear', blurb: 'One note, no reference: is it in tune?', how: 'One note plays, with nothing to compare it to. Is it in tune (A = 440 Hz, as on a tuned piano) or out of tune? Half are in tune. Get them right and the out-of-tune ones get closer to true. Press 1 for in tune, 2 for out of tune (or tap); R plays it again. Scored in cents. Needs sound on.', input: 'pointer', make: () => new InTune() },
  { id: 'octave', name: 'Octave', skill: 'ear', blurb: 'A note: which octave is it in?', how: 'A note plays. Which octave is it in, from 2 (low) to 6 (high)? Notes near the edges (A, B, C) come up often. With a reference, middle C (C4) plays first; with perfect pitch there is no reference. Tap or press 1 to 5; R plays it again. Needs sound on.', input: 'pointer', levels: REF_LEVELS, make: () => new Octave() },
  { id: 'note', name: 'Note', skill: 'ear', blurb: 'A note in any octave: name it.', how: 'A note plays, in any octave. Name it: all twelve, sharps and flats included. With a reference, C plays first; with perfect pitch there is no reference. Tap or press its key (1 to 0, then - and =); R plays it again. Needs sound on.', input: 'pointer', levels: REF_LEVELS, make: () => new Note() },
  { id: 'interval', name: 'Interval', skill: 'ear', blurb: 'Two notes, up, down or together: how far apart?', how: 'Two notes play: going up, coming down, or struck together. Name the interval, from unison to octave, all thirteen from the start. Tap or press its key (1 to 0, then - = [); R plays it again. Needs sound on.', input: 'pointer', make: () => new Interval() },
  { id: 'chord', name: 'Chord', skill: 'ear', blurb: 'A chord: name it, root and type.', how: 'A chord plays. Name it in two steps: first its root note (C to B), then its type: major, minor, diminished, augmented, sus2, sus4, then the sevenths, and later inversions. Both must be right. With a reference, C plays first; with perfect pitch there is no reference. Tap or press keys; R plays it again. Needs sound on.', input: 'pointer', levels: REF_LEVELS, make: () => new Chord() },
  { id: 'contour', name: 'Contour', skill: 'ear', blurb: 'A melody: which of four near-identical shapes?', how: 'A melody of six to nine notes plays, in small steps. Four shapes show lines going up and down that differ by only a move or two: pick the one the melody followed. Tap or press 1 to 4; R plays it again. Needs sound on.', input: 'pointer', make: () => new Contour() },
  { id: 'scale', name: 'Scale', skill: 'ear', blurb: 'A scale: major, which minor, or which mode?', how: 'A scale plays. Name it: major, natural, harmonic or melodic minor; then the modes (dorian, mixolydian, lydian, phrygian) join, and some go down instead of up. Tap or press its number; R plays it again. Needs sound on.', input: 'pointer', make: () => new Scale() },
];
