// Reflex mode: a reaction test that keeps changing the question. Every round
// is one of several mini-games with a freshly shuffled rule set; stimuli appear
// at shuffled positions and each one calls for a key, two keys at once, or no
// press at all. Three strikes end the session. The response window adapts.
//
// update() and onPress() hold all the logic and take explicit times, so the
// whole thing runs headless in tests; draw() only paints.

import {
  ANTICIPATION_MS,
  COL_ACCENT,
  COL_DIM,
  COL_LINE,
  COL_MID,
  COL_TICK,
  SLOT_REFLEX,
  type ModeDef,
} from './config.ts';
import { ICON_CLOSE, SHAPE_CIRCLE, SHAPE_CROSS, SHAPE_DIAMOND, SHAPE_SQUARE, SHAPE_TRIANGLE, type View } from './render.ts';
import { Rng } from './rng.ts';
import type { TouchLayout } from './touch.ts';

// --- Answers -------------------------------------------------------------------

/**
 * What a stimulus calls for. Each group is a bitmask of slots, one of which
 * must be pressed; two groups mean two keys together; no groups mean "do not press".
 */
export interface Answer {
  groups: number[];
  label: string;
}

export const NONE: Answer = { groups: [], label: 'no press' };

export const SHADE_WHITE = 0;
export const SHADE_GREY = 1;
export const SHADE_ACCENT = 2;
const SHADE_COL = [COL_LINE, '#6c6c74', COL_ACCENT] as const;
const SHAPE_NAME = ['square', 'circle', 'triangle', 'diamond', 'cross'] as const;

/** The answers a key mode makes available. */
export class Keys {
  readonly mode: ModeDef;
  readonly labels: readonly string[];
  readonly oneKey: boolean;
  readonly leftMask: number;
  readonly rightMask: number;
  readonly left: Answer;
  readonly right: Answer;
  readonly both: Answer;
  readonly any: Answer;
  readonly press: Answer;

  constructor(mode: ModeDef, labels: readonly string[]) {
    this.mode = mode;
    this.labels = labels;
    this.oneKey = mode.right === 0;
    this.leftMask = (1 << mode.left) - 1;
    this.rightMask = ((1 << mode.right) - 1) << 3;
    const join = (from: number, n: number) => labels.slice(from, from + n).join(' / ');
    this.left = { groups: [this.leftMask], label: join(0, mode.left) };
    this.right = { groups: [this.rightMask], label: join(3, mode.right) };
    this.both = { groups: [this.leftMask, this.rightMask], label: `${join(0, mode.left)} + ${join(3, mode.right)}` };
    const all = this.leftMask | this.rightMask | (mode.reflex ? 1 << SLOT_REFLEX : 0);
    this.any = { groups: [all], label: 'any key' };
    this.press = { groups: [this.leftMask], label: labels[0] ?? '' };
  }

  single(slot: number): Answer {
    return { groups: [1 << slot], label: this.labels[slot] ?? '' };
  }

  /** Every distinct single-key answer, plus "both" when each hand has one key. */
  specific(): Answer[] {
    if (this.oneKey) return [this.press];
    const out: Answer[] = [];
    for (let i = 0; i < this.mode.left; i++) out.push(this.single(i));
    for (let i = 0; i < this.mode.right; i++) out.push(this.single(3 + i));
    if (this.mode.reflex) out.push(this.single(SLOT_REFLEX));
    if (this.mode.left === 1 && this.mode.right === 1) out.push(this.both);
    return out;
  }

  /** The answer for "the left side" / "the right side". With one key, right means press. */
  side(dir: number): Answer {
    if (this.oneKey) return dir > 0 ? this.press : NONE;
    return dir > 0 ? this.right : this.left;
  }
}

// --- Stimulus -----------------------------------------------------------------

const MAX_ITEMS = 6;
const MAX_DOTS = 18;

export class Stim {
  /** Position in the arena, each in -1..1. */
  x = 0;
  y = 0;
  shape = 0;
  shade = 0;
  solid = false;
  dir = 1;
  go = true;
  n = 0;
  readonly items = new Int8Array(MAX_ITEMS);
  readonly itemShade = new Int8Array(MAX_ITEMS);
  dots = 0;
  readonly dotX = new Float32Array(MAX_DOTS * 2);
  readonly dotY = new Float32Array(MAX_DOTS * 2);
  readonly dotShade = new Uint8Array(MAX_DOTS * 2);
  /** Dots on the left come first; this many of them. */
  dotsLeft = 0;
}

export interface RuleLine {
  /** Shape icon to draw before the text, or -1 for none. */
  shape: number;
  shade: number;
  solid: boolean;
  /** A colour swatch instead of a shape. */
  swatch: boolean;
  text: string;
  /** What to press, or null for a line that is only an instruction. */
  answer: Answer | null;
}

function line(text: string, answer: Answer | null = null): RuleLine {
  return { shape: -1, shade: SHADE_WHITE, solid: false, swatch: false, text, answer };
}

function shapeLine(shape: number, answer: Answer): RuleLine {
  return { shape, shade: SHADE_WHITE, solid: false, swatch: false, text: SHAPE_NAME[shape]!, answer };
}

// --- Mini-games ----------------------------------------------------------------

export interface Game {
  name: string;
  /** Stretch on the response window: some stimuli take longer to read. */
  pace: number;
  /** Build this round's rules. Higher levels add rules and reversals. */
  setup(level: number, keys: Keys, rng: Rng): RuleLine[];
  /** Fill in the next stimulus and say what it calls for. */
  trial(st: Stim, keys: Keys, rng: Rng, index: number): Answer;
  draw(v: View, st: Stim, cx: number, cy: number, u: number, halfW: number): void;
}

function shuffle<T>(a: T[], rng: Rng): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    const t = a[i]!;
    a[i] = a[j]!;
    a[j] = t;
  }
  return a;
}

function pick(rng: Rng, n: number): number {
  return Math.floor(rng.next() * n);
}

/** Random cell of a 5 x 3 grid, as arena coordinates. */
function scatter(st: Stim, rng: Rng): void {
  st.x = (pick(rng, 5) - 2) / 2;
  st.y = pick(rng, 3) - 1;
}

function strokeFor(v: View, shade: number): void {
  v.ctx.strokeStyle = SHADE_COL[shade]!;
  v.ctx.fillStyle = SHADE_COL[shade]!;
  v.ctx.lineWidth = 2.25 * v.dpr;
}

// Rules: shapes and shades map to keys. The top rule that matches wins.
interface Rule {
  /** 0 shape, 1 shade, 2 solid. */
  attr: number;
  value: number;
  answer: Answer;
}

class RulesGame implements Game {
  name = 'RULES';
  pace = 1;
  private rules: Rule[] = [];
  private shapes: number[] = [];
  private useGrey = false;
  private useSolid = false;

  setup(level: number, keys: Keys, rng: Rng): RuleLine[] {
    const shapes = shuffle([SHAPE_SQUARE, SHAPE_CIRCLE, SHAPE_TRIANGLE, SHAPE_DIAMOND, SHAPE_CROSS], rng);
    // Shapes map to single keys; "both at once" is kept for the grey rule.
    const pool = shuffle(
      keys.specific().filter((a) => a.groups.length === 1),
      rng,
    );
    this.shapes = shapes;
    this.useGrey = level >= 1;
    this.useSolid = level >= 3;
    const a1 = pool[0]!;
    const a2 = keys.oneKey ? (level >= 2 ? keys.press : NONE) : pool[1 % pool.length]!;
    this.rules = [];
    const lines: RuleLine[] = [];
    if (this.useSolid) {
      this.rules.push({ attr: 2, value: 1, answer: NONE });
      lines.push({ shape: SHAPE_CIRCLE, shade: SHADE_WHITE, solid: true, swatch: false, text: 'anything filled in', answer: NONE });
    }
    if (this.useGrey) {
      // "Anything grey" overrides the shapes: both keys at once where that exists.
      const grey = keys.oneKey ? NONE : keys.mode.left === 1 && keys.mode.right === 1 ? keys.both : pool[2 % pool.length]!;
      this.rules.push({ attr: 1, value: SHADE_GREY, answer: grey });
      lines.push({ shape: -1, shade: SHADE_GREY, solid: true, swatch: true, text: 'anything grey', answer: grey });
    }
    this.rules.push({ attr: 0, value: shapes[0]!, answer: a1 });
    lines.push(shapeLine(shapes[0]!, a1));
    if (a2 !== NONE) {
      this.rules.push({ attr: 0, value: shapes[1]!, answer: a2 });
      lines.push(shapeLine(shapes[1]!, a2));
    }
    lines.push(line('anything else', NONE));
    if (lines.length > 3) lines.push(line('the top line that fits wins'));
    return lines;
  }

  trial(st: Stim, _keys: Keys, rng: Rng): Answer {
    scatter(st, rng);
    const r = rng.next();
    st.shape = r < 0.36 ? this.shapes[0]! : r < 0.72 ? this.shapes[1]! : this.shapes[2 + pick(rng, 3)]!;
    st.shade = this.useGrey && rng.next() < 0.3 ? SHADE_GREY : SHADE_WHITE;
    st.solid = this.useSolid && rng.next() < 0.22;
    for (const rule of this.rules) {
      const v = rule.attr === 0 ? st.shape : rule.attr === 1 ? st.shade : st.solid ? 1 : 0;
      if (v === rule.value) return rule.answer;
    }
    return NONE;
  }

  draw(v: View, st: Stim, cx: number, cy: number, u: number): void {
    strokeFor(v, st.shade);
    v.shape(st.shape, cx, cy, 30 * u, st.solid);
  }
}

// Arrows: where it points against where it is.
class ArrowsGame implements Game {
  name = 'ARROWS';
  pace = 0.85;
  /** 0 points, 1 against, 2 side, 3 white points / grey against. */
  private variant = 0;

  setup(level: number, keys: Keys, rng: Rng): RuleLine[] {
    this.variant = level === 0 ? 0 : level === 1 ? 1 + pick(rng, 2) : 1 + pick(rng, 3);
    const one = keys.oneKey;
    const k = keys.press.label;
    switch (this.variant) {
      case 0:
        return [line(one ? `pointing right: press ${k}` : 'press the side it points to'), ...(one ? [line('pointing left', NONE)] : [])];
      case 1:
        return [line(one ? `pointing LEFT: press ${k}` : 'press the side it points AWAY from'), ...(one ? [line('pointing right', NONE)] : [])];
      case 2:
        return [line('ignore where it points'), line(one ? `on the right half: press ${k}` : 'press the side of the screen it is on'), ...(one ? [line('on the left half', NONE)] : [])];
      default:
        return [
          { shape: -1, shade: SHADE_WHITE, solid: true, swatch: true, text: one ? `white pointing right: press ${k}` : 'white: the side it points to', answer: null },
          { shape: -1, shade: SHADE_GREY, solid: true, swatch: true, text: one ? `grey pointing left: press ${k}` : 'grey: the OPPOSITE side', answer: null },
          ...(one ? [line('anything else', NONE)] : []),
        ];
    }
  }

  trial(st: Stim, keys: Keys, rng: Rng): Answer {
    scatter(st, rng);
    if (st.x === 0) st.x = rng.next() < 0.5 ? -0.5 : 0.5;
    st.dir = rng.next() < 0.5 ? -1 : 1;
    st.shade = this.variant === 3 && rng.next() < 0.5 ? SHADE_GREY : SHADE_WHITE;
    let side = st.dir;
    if (this.variant === 1) side = -st.dir;
    else if (this.variant === 2) side = st.x < 0 ? -1 : 1;
    else if (this.variant === 3 && st.shade === SHADE_GREY) side = -st.dir;
    return keys.side(side);
  }

  draw(v: View, st: Stim, cx: number, cy: number, u: number): void {
    strokeFor(v, st.shade);
    v.ctx.lineWidth = 3 * v.dpr;
    v.arrow(cx, cy, 34 * u, st.dir);
  }
}

// Odd one: a row of shapes, one of which may differ.
class OddGame implements Game {
  name = 'ODD ONE';
  pace = 1.3;
  private noOdd = 0;
  private reverse = false;
  private byShade = false;
  private answerSide = 0;

  setup(level: number, keys: Keys, rng: Rng): RuleLine[] {
    this.noOdd = keys.oneKey ? 0.45 : level >= 1 ? 0.22 : 0;
    this.reverse = !keys.oneKey && level >= 3 && rng.next() < 0.6;
    this.byShade = level >= 2 && rng.next() < 0.5;
    const what = this.byShade ? 'one is a different shade' : 'one is a different shape';
    if (keys.oneKey) return [line(`${what}: press ${keys.press.label}`), line('all the same', NONE)];
    const lines = [line(what), line(this.reverse ? 'press the side it is NOT on' : 'press the side it is on')];
    if (this.noOdd > 0) lines.push(line('all the same', NONE));
    return lines;
  }

  trial(st: Stim, keys: Keys, rng: Rng): Answer {
    // Centred across the screen, so "which side" is the side of the screen too.
    st.x = 0;
    st.y = pick(rng, 3) - 1;
    st.n = rng.next() < 0.5 ? 4 : 6;
    const base = pick(rng, 4);
    const baseShade = this.byShade && rng.next() < 0.5 ? SHADE_GREY : SHADE_WHITE;
    for (let i = 0; i < st.n; i++) {
      st.items[i] = base;
      st.itemShade[i] = baseShade;
    }
    if (rng.next() < this.noOdd) {
      this.answerSide = 0;
      return NONE;
    }
    const at = pick(rng, st.n);
    if (this.byShade) st.itemShade[at] = baseShade === SHADE_WHITE ? SHADE_GREY : SHADE_WHITE;
    else st.items[at] = (base + 1 + pick(rng, 3)) % 4;
    const side = at < st.n / 2 ? -1 : 1;
    this.answerSide = this.reverse ? -side : side;
    return keys.oneKey ? keys.press : keys.side(this.answerSide);
  }

  draw(v: View, st: Stim, cx: number, cy: number, u: number, halfW: number): void {
    const gap = Math.min(64 * u, (halfW * 2) / st.n);
    const x0 = cx - (gap * (st.n - 1)) / 2;
    for (let i = 0; i < st.n; i++) {
      strokeFor(v, st.itemShade[i]!);
      v.shape(st.items[i]!, x0 + i * gap, cy, gap * 0.3, false);
    }
    // A hairline marks the middle, so "which side" is never a guess.
    v.ctx.strokeStyle = COL_TICK;
    v.ctx.lineWidth = v.dpr;
    v.ctx.beginPath();
    v.ctx.moveTo(Math.round(cx) + 0.5, cy - gap * 0.55);
    v.ctx.lineTo(Math.round(cx) + 0.5, cy + gap * 0.55);
    v.ctx.stroke();
  }
}

// More: two clusters of dots.
class MoreGame implements Game {
  name = 'MORE';
  pace = 1.45;
  private fewer = false;
  private greyOut = false;
  private minDiff = 3;

  setup(level: number, keys: Keys, rng: Rng): RuleLine[] {
    this.fewer = level >= 1 && rng.next() < 0.5;
    this.greyOut = level >= 2;
    this.minDiff = level === 0 ? 3 : level === 1 ? 2 : 1;
    const word = this.fewer ? 'FEWER' : 'MORE';
    const lines = keys.oneKey
      ? [line(`right side has ${word}: press ${keys.press.label}`), line(`left side has ${word.toLowerCase()}`, NONE)]
      : [line(`press the side with ${word} dots`)];
    if (this.greyOut) lines.push(line('grey dots do not count'));
    return lines;
  }

  trial(st: Stim, keys: Keys, rng: Rng): Answer {
    st.x = 0;
    st.y = pick(rng, 3) - 1;
    let a = 1 + pick(rng, 8);
    let b = 1 + pick(rng, 8);
    while (Math.abs(a - b) < this.minDiff) {
      a = 1 + pick(rng, 8);
      b = 1 + pick(rng, 8);
    }
    const ga = this.greyOut ? pick(rng, Math.min(4, 9 - a) + 1) : 0;
    const gb = this.greyOut ? pick(rng, Math.min(4, 9 - b) + 1) : 0;
    this.place(st, 0, a, ga, rng);
    st.dotsLeft = a + ga;
    this.place(st, st.dotsLeft, b, gb, rng);
    st.dots = st.dotsLeft + b + gb;
    const more = a > b ? -1 : 1;
    return keys.side(this.fewer ? -more : more);
  }

  /** Scatter `white + grey` dots over a jittered 3 x 3 grid, starting at index `from`. */
  private place(st: Stim, from: number, white: number, grey: number, rng: Rng): void {
    const cells = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8], rng);
    for (let i = 0; i < white + grey; i++) {
      const c = cells[i]!;
      st.dotX[from + i] = (c % 3) - 1 + (rng.next() - 0.5) * 0.5;
      st.dotY[from + i] = Math.floor(c / 3) - 1 + (rng.next() - 0.5) * 0.5;
      st.dotShade[from + i] = i < white ? SHADE_WHITE : SHADE_GREY;
    }
  }

  draw(v: View, st: Stim, cx: number, cy: number, u: number, halfW: number): void {
    const off = Math.min(150 * u, halfW * 0.55);
    const cell = Math.min(30 * u, off * 0.3);
    const ctx = v.ctx;
    for (let i = 0; i < st.dots; i++) {
      const sx = i < st.dotsLeft ? cx - off : cx + off;
      ctx.fillStyle = SHADE_COL[st.dotShade[i]!]!;
      ctx.beginPath();
      ctx.arc(sx + st.dotX[i]! * cell, cy + st.dotY[i]! * cell, cell * 0.27, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = COL_TICK;
    ctx.lineWidth = v.dpr;
    ctx.beginPath();
    ctx.moveTo(Math.round(cx) + 0.5, cy - cell * 1.6);
    ctx.lineTo(Math.round(cx) + 0.5, cy + cell * 1.6);
    ctx.stroke();
  }
}

// Same: compare each stimulus with the one before it.
class SameGame implements Game {
  name = 'SAME';
  pace = 1.05;
  private byShade = false;
  private same: Answer = NONE;
  private diff: Answer = NONE;
  private lastShape = -1;
  private lastShade = -1;
  private distract = false;

  setup(level: number, keys: Keys, rng: Rng): RuleLine[] {
    this.byShade = level >= 2 && rng.next() < 0.5;
    this.distract = level >= 1;
    const flip = !keys.oneKey && rng.next() < 0.5;
    this.same = keys.oneKey ? keys.press : keys.side(flip ? 1 : -1);
    this.diff = keys.oneKey ? NONE : keys.side(flip ? -1 : 1);
    this.lastShape = -1;
    this.lastShade = -1;
    const what = this.byShade ? 'shade' : 'shape';
    return [line(`same ${what} as the one before`, this.same), line(`different ${what}`, this.diff), line('the first one', NONE)];
  }

  trial(st: Stim, _keys: Keys, rng: Rng, index: number): Answer {
    scatter(st, rng);
    st.solid = false;
    const repeat = index > 0 && rng.next() < 0.45;
    if (this.byShade) {
      st.shade = repeat ? this.lastShade : index > 0 ? 1 - this.lastShade : pick(rng, 2);
      st.shape = pick(rng, 4);
    } else {
      st.shape = repeat ? this.lastShape : index > 0 ? (this.lastShape + 1 + pick(rng, 3)) % 4 : pick(rng, 4);
      st.shade = this.distract && rng.next() < 0.4 ? SHADE_GREY : SHADE_WHITE;
    }
    this.lastShape = st.shape;
    this.lastShade = st.shade;
    return index === 0 ? NONE : repeat ? this.same : this.diff;
  }

  draw(v: View, st: Stim, cx: number, cy: number, u: number): void {
    strokeFor(v, st.shade);
    v.shape(st.shape, cx, cy, 30 * u, false);
  }
}

// Cable: the plain reaction test. Orange means go, grey means hold.
class CableGame implements Game {
  name = 'CABLE';
  pace = 0.75;
  /** 0 any key, 1 its side, 2 the other side. */
  private variant = 0;

  setup(level: number, keys: Keys, rng: Rng): RuleLine[] {
    this.variant = keys.oneKey || level === 0 ? 0 : level === 1 ? 1 : 1 + pick(rng, 2);
    const go: RuleLine = { shape: -1, shade: SHADE_ACCENT, solid: true, swatch: true, text: 'orange', answer: null };
    if (this.variant === 0) go.answer = keys.oneKey ? keys.press : keys.any;
    else go.text = this.variant === 1 ? 'orange: press the side it is on' : 'orange: press the OTHER side';
    return [go, { shape: -1, shade: SHADE_GREY, solid: true, swatch: true, text: 'grey', answer: NONE }];
  }

  trial(st: Stim, keys: Keys, rng: Rng): Answer {
    st.x = (pick(rng, 4) - 1.5) / 1.5;
    st.y = 0;
    st.go = rng.next() < 0.7;
    if (!st.go) return NONE;
    if (this.variant === 0) return keys.oneKey ? keys.press : keys.any;
    const side = st.x < 0 ? -1 : 1;
    return keys.side(this.variant === 1 ? side : -side);
  }

  draw(v: View, st: Stim, cx: number, cy: number, u: number): void {
    const ctx = v.ctx;
    ctx.strokeStyle = st.go ? COL_ACCENT : SHADE_COL[SHADE_GREY];
    ctx.lineWidth = (st.go ? 3 : 1.5) * v.dpr;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 150 * u);
    ctx.lineTo(cx, cy + 30 * u);
    ctx.stroke();
    ctx.fillStyle = st.go ? COL_ACCENT : SHADE_COL[SHADE_GREY];
    const q = 5 * v.dpr;
    ctx.fillRect(cx - q, cy + 30 * u - q, q * 2, q * 2);
  }
}

export function makeGames(): Game[] {
  return [new RulesGame(), new ArrowsGame(), new OddGame(), new MoreGame(), new SameGame(), new CableGame()];
}

// --- Session -------------------------------------------------------------------

const ST_BRIEF = 0;
const ST_GAP = 1;
const ST_STIM = 2;
const ST_FEEDBACK = 3;
const ST_ROUND_END = 4;
const ST_DONE = 5;

export const OUT_NONE = 0;
export const OUT_CORRECT = 1;
export const OUT_WRONG = 2;
export const OUT_LATE = 3;
export const OUT_EARLY = 4;
export const OUT_START = 5;

const BRIEF_GUARD = 450;
const BRIEF_MAX = 12000;
const CHORD_WAIT = 160;
const WINDOW_START = 1250;
const WINDOW_MIN = 360;
const WINDOW_MAX = 1700;
/** The window stops shrinking once an answer uses more than this share of it. */
const WINDOW_ROOM = 0.72;
const HOLD_SHOW = 900;
export const STRIKES = 3;
const RT_CAP = 4096;
const OUT_TEXT = ['', '', 'wrong', 'too slow', 'too early'] as const;

export class ReflexSession {
  readonly games = makeGames();
  keys!: Keys;
  readonly rts = new Float32Array(RT_CAP);
  n = 0;
  round = 0;
  trials = 0;
  correct = 0;
  wrong = 0;
  late = 0;
  early = 0;
  strikes = 0;
  score = 0;
  roundsCleared = 0;
  windowMs = WINDOW_START;
  windowMin = WINDOW_START;
  startedAt = 0;
  // Per mini-game tallies, indexed like `games`.
  readonly gTried = new Uint16Array(8);
  readonly gCorrect = new Uint16Array(8);
  readonly gRtSum = new Float64Array(8);
  readonly gRtN = new Uint16Array(8);

  private readonly rng = new Rng();
  private readonly st = new Stim();
  private state = ST_BRIEF;
  private gameIdx = 0;
  private readonly seen = new Uint8Array(8);
  private bag: number[] = [];
  private rules: RuleLine[] = [];
  private answer: Answer = NONE;
  private got = 0;
  private firstPress = 0;
  private firstRt = 0;
  private drawnAt = 0;
  private stateAt = 0;
  private nextAt = 0;
  private trialIdx = 0;
  private trialCount = 0;
  private roundErrors = 0;
  private roundCorrect = 0;
  private roundRtSum = 0;
  private roundRtN = 0;
  private lastOut = OUT_NONE;
  private lastRt = 0;
  private held = 0;

  start(mode: ModeDef, labels: readonly string[], now: number, seed = (Math.random() * 0x100000000) >>> 0): void {
    this.keys = new Keys(mode, labels);
    this.rng.seed(seed);
    this.n = 0;
    this.round = 0;
    this.trials = this.correct = this.wrong = this.late = this.early = 0;
    this.strikes = 0;
    this.score = 0;
    this.roundsCleared = 0;
    this.windowMs = this.windowMin = WINDOW_START;
    this.startedAt = now;
    this.gTried.fill(0);
    this.gCorrect.fill(0);
    this.gRtSum.fill(0);
    this.gRtN.fill(0);
    this.seen.fill(0);
    this.bag = [];
    this.lastOut = OUT_NONE;
    this.held = 0;
    this.beginRound(now);
  }

  get done(): boolean {
    return this.state === ST_DONE;
  }

  /** Name of the mini-game being played. */
  get gameName(): string {
    return this.games[this.gameIdx]!.name;
  }

  /** What the stimulus on screen calls for (for tests and tools). */
  get expected(): Answer | null {
    return this.state === ST_STIM ? this.answer : null;
  }

  get briefing(): boolean {
    return this.state === ST_BRIEF;
  }

  get rulesNow(): readonly RuleLine[] {
    return this.rules;
  }

  private beginRound(now: number): void {
    this.round++;
    // The first round is always Rules; after that, a shuffled bag with no repeats in a row.
    if (this.round === 1) this.gameIdx = 0;
    else {
      if (this.bag.length === 0) {
        this.bag = shuffle([0, 1, 2, 3, 4, 5], this.rng);
        if (this.bag[this.bag.length - 1] === this.gameIdx) this.bag.reverse();
      }
      this.gameIdx = this.bag.pop()!;
    }
    const level = this.seen[this.gameIdx]! + Math.floor((this.round - 1) / 6);
    this.seen[this.gameIdx]!++;
    this.rules = this.games[this.gameIdx]!.setup(level, this.keys, this.rng);
    this.trialIdx = 0;
    this.trialCount = 7 + Math.min(5, this.round);
    this.roundErrors = 0;
    this.roundCorrect = 0;
    this.roundRtSum = 0;
    this.roundRtN = 0;
    this.state = ST_BRIEF;
    this.stateAt = now;
  }

  private gap(now: number): void {
    this.state = ST_GAP;
    this.stateAt = now;
    this.nextAt = now + 480 + Math.min(900, -Math.log(1 - this.rng.next()) * 320);
  }

  private window(): number {
    return this.windowMs * this.games[this.gameIdx]!.pace;
  }

  private resolve(now: number, out: number, rt: number): void {
    const g = this.gameIdx;
    this.trials++;
    this.gTried[g]!++;
    this.lastOut = out;
    this.lastRt = rt;
    if (out === OUT_CORRECT) {
      this.correct++;
      this.gCorrect[g]!++;
      this.roundCorrect++;
      const w = this.window();
      if (rt > 0) {
        if (this.n < RT_CAP) this.rts[this.n++] = rt;
        this.gRtSum[g]! += rt;
        this.gRtN[g]!++;
        this.roundRtSum += rt;
        this.roundRtN++;
        this.score += Math.round(60 + 60 * Math.max(0, 1 - rt / w) + 10 * this.round);
        // Tighten only while there is room to spare, so the window settles a
        // little above your pace instead of grinding down until you miss.
        if (rt < w * WINDOW_ROOM) this.windowMs = Math.max(WINDOW_MIN, this.windowMs * 0.97);
        if (this.windowMs < this.windowMin) this.windowMin = this.windowMs;
      } else {
        this.score += 40 + 5 * this.round;
      }
    } else {
      if (out === OUT_WRONG) this.wrong++;
      else if (out === OUT_LATE) this.late++;
      else this.early++;
      this.roundErrors++;
      this.strikes++;
      this.windowMs = Math.min(WINDOW_MAX, this.windowMs * 1.07);
    }
    this.state = ST_FEEDBACK;
    this.stateAt = now;
  }

  /** A key or pad. `ts` is the event's timeStamp. Returns an OUT_* code for sound. */
  onPress(slot: number, ts: number): number {
    this.held |= 1 << slot;
    switch (this.state) {
      case ST_BRIEF:
        return this.ready(ts) ? OUT_START : OUT_NONE;
      case ST_GAP:
        // A press with nothing on screen is a guess.
        if (ts - this.stateAt < 220) return OUT_NONE;
        this.trialIdx++;
        this.resolve(ts, OUT_EARLY, 0);
        return OUT_EARLY;
      case ST_STIM: {
        if (this.drawnAt === 0) return OUT_NONE;
        const rt = ts - this.drawnAt;
        if (rt < ANTICIPATION_MS) {
          this.resolve(ts, OUT_EARLY, 0);
          return OUT_EARLY;
        }
        const groups = this.answer.groups;
        for (let i = 0; i < groups.length; i++) {
          if ((this.got & (1 << i)) === 0 && (groups[i]! & (1 << slot)) !== 0) {
            if (this.got === 0) {
              this.firstPress = ts;
              this.firstRt = rt;
            }
            this.got |= 1 << i;
            if (this.got === (1 << groups.length) - 1) {
              this.resolve(ts, OUT_CORRECT, this.firstRt);
              return OUT_CORRECT;
            }
            return OUT_NONE; // half of a two-key answer
          }
        }
        this.resolve(ts, OUT_WRONG, 0);
        return OUT_WRONG;
      }
      default:
        return OUT_NONE;
    }
  }

  onRelease(slot: number): void {
    this.held &= ~(1 << slot);
  }

  /** Dismiss the briefing card. Returns true if that started the round. */
  ready(ts: number): boolean {
    if (this.state !== ST_BRIEF || ts - this.stateAt < BRIEF_GUARD) return false;
    this.gap(ts);
    return true;
  }

  /** Called by draw() on the frame a stimulus first appears. */
  markDrawn(now: number): void {
    if (this.state === ST_STIM && this.drawnAt === 0) this.drawnAt = now;
  }

  /** Advance timers. Returns true once the session is over. */
  update(now: number): boolean {
    switch (this.state) {
      case ST_BRIEF:
        if (now - this.stateAt > BRIEF_MAX) this.gap(now);
        break;
      case ST_GAP:
        if (now >= this.nextAt) {
          this.answer = this.games[this.gameIdx]!.trial(this.st, this.keys, this.rng, this.trialIdx);
          this.trialIdx++;
          this.got = 0;
          this.drawnAt = 0;
          this.state = ST_STIM;
          this.stateAt = now;
        }
        break;
      case ST_STIM:
        if (this.drawnAt === 0) break;
        if (this.got !== 0 && now - this.firstPress > CHORD_WAIT) {
          // Only half of a two-key answer arrived.
          this.resolve(now, OUT_WRONG, 0);
        } else if (this.answer.groups.length === 0) {
          if (now - this.drawnAt > Math.min(this.window(), HOLD_SHOW)) this.resolve(now, OUT_CORRECT, 0);
        } else if (now - this.drawnAt > this.window()) {
          this.resolve(now, OUT_LATE, 0);
        }
        break;
      case ST_FEEDBACK:
        if (now - this.stateAt > (this.lastOut === OUT_CORRECT ? 240 : 520)) {
          if (this.strikes >= STRIKES) this.state = ST_DONE;
          else if (this.trialIdx >= this.trialCount) {
            this.roundsCleared++;
            if (this.roundErrors === 0 && this.strikes > 0) this.strikes--;
            this.state = ST_ROUND_END;
            this.stateAt = now;
          } else this.gap(now);
        }
        break;
      case ST_ROUND_END:
        if (now - this.stateAt > 1100) this.beginRound(now);
        break;
    }
    return this.state === ST_DONE;
  }

  // --- Drawing ------------------------------------------------------------------

  draw(now: number, v: View, touch: TouchLayout): void {
    const ctx = v.ctx;
    const dpr = v.dpr;
    v.clear();
    const cx = v.ox;
    const padTop = touch.active && touch.pads.length > 0 ? touch.pads[touch.pads.length - 1]!.y : v.h;
    const usable = Math.min(v.h, padTop) - 70 * dpr;
    const cy = 70 * dpr + usable * 0.5;
    const halfW = Math.min(v.w * 0.38, 340 * dpr);
    const halfH = Math.min(usable * 0.3, 150 * dpr);
    const u = Math.min(dpr * 1.15, halfH / 110);

    // Round, game, strikes, window.
    const ty = 40 * dpr;
    const lx = Math.max(24 * dpr, cx - 330 * dpr);
    const rx = Math.min(v.w - (touch.active ? 84 : 24) * dpr, cx + 330 * dpr);
    ctx.fillStyle = COL_MID;
    v.text('round', lx, ty, v.fontTiny, 'left');
    ctx.fillStyle = COL_LINE;
    const rw = v.numberWidth(this.round, 0, v.fontHud);
    v.number(this.round, 0, lx + rw, ty + 22 * dpr, v.fontHud);
    ctx.fillStyle = COL_MID;
    v.text(this.gameName, lx + rw + 12 * dpr, ty + 22 * dpr, v.fontTiny, 'left');
    v.text('window', rx, ty, v.fontTiny, 'right');
    ctx.fillStyle = COL_LINE;
    v.number(this.window(), 0, rx, ty + 22 * dpr, v.fontHud);
    for (let i = 0; i < STRIKES; i++) {
      const q = 4 * dpr;
      const sx = cx + (i - (STRIKES - 1) / 2) * 16 * dpr;
      ctx.fillStyle = COL_LINE;
      ctx.strokeStyle = COL_DIM;
      ctx.lineWidth = dpr;
      if (i < STRIKES - this.strikes) ctx.fillRect(sx - q, ty + 10 * dpr, q * 2, q * 2);
      else ctx.strokeRect(sx - q + 0.5, ty + 10 * dpr + 0.5, q * 2 - 1, q * 2 - 1);
    }

    if (this.state === ST_BRIEF) {
      this.drawCard(now, v, cx, cy);
    } else {
      // The rules stay in view for the first two rounds; after that they are from memory.
      if (this.round <= 2) this.drawRules(v, lx, ty + 54 * dpr, v.fontTiny, 15 * dpr, false);

      if (this.state === ST_STIM) {
        const sx = cx + this.st.x * halfW * 0.9;
        const sy = cy + this.st.y * halfH;
        this.games[this.gameIdx]!.draw(v, this.st, sx, sy, u, halfW);
        this.markDrawn(performance.now());
      } else if (this.state === ST_FEEDBACK) {
        const sx = cx + this.st.x * halfW * 0.9;
        const sy = cy + this.st.y * halfH;
        if (this.lastOut === OUT_CORRECT) {
          ctx.fillStyle = COL_LINE;
          if (this.lastRt > 0) {
            const w = v.numberWidth(this.lastRt, 0, v.fontHud);
            v.number(this.lastRt, 0, sx + w / 2, sy + 5 * dpr, v.fontHud);
          } else {
            v.text('held', sx, sy + 5 * dpr, v.fontHud, 'center');
          }
        } else {
          ctx.fillStyle = COL_MID;
          v.text(OUT_TEXT[this.lastOut]!, sx, sy + 5 * dpr, v.fontHud, 'center');
          v.text(`it was: ${this.answer.label}`, sx, sy + 24 * dpr, v.fontTiny, 'center');
        }
      } else if (this.state === ST_ROUND_END) {
        ctx.fillStyle = COL_LINE;
        const total = this.roundCorrect + this.roundErrors;
        v.number(this.roundCorrect, 0, cx - 10 * dpr, cy, v.fontBig);
        ctx.fillStyle = COL_MID;
        v.text('of', cx + 6 * dpr, cy, v.fontHud, 'center');
        const w2 = v.numberWidth(total, 0, v.fontHud);
        v.number(total, 0, cx + 22 * dpr + w2, cy, v.fontHud);
        if (this.roundRtN > 0) {
          const avg = this.roundRtSum / this.roundRtN;
          const aw = v.numberWidth(avg, 0, v.fontHud);
          ctx.fillStyle = COL_LINE;
          v.number(avg, 0, cx + aw / 2 - 10 * dpr, cy + 34 * dpr, v.fontHud);
          ctx.fillStyle = COL_MID;
          v.text('ms', cx + aw / 2 - 2 * dpr, cy + 34 * dpr, v.fontTiny, 'left');
        }
      }
    }

    if (!touch.active) {
      ctx.fillStyle = COL_DIM;
      v.text('esc to pause', cx, v.h - 26 * dpr, v.fontTiny, 'center');
    }
    v.drawTouch(touch, ICON_CLOSE, this.held);
  }

  private drawCard(now: number, v: View, cx: number, cy: number): void {
    const ctx = v.ctx;
    const dpr = v.dpr;
    const step = 30 * dpr;
    const top = cy - (this.rules.length * step) / 2 - 20 * dpr;
    ctx.fillStyle = COL_MID;
    v.text(this.gameName, cx, top - 16 * dpr, v.fontTiny, 'center');
    this.drawRules(v, cx, top + 24 * dpr, v.fontHud, step, true);
    const by = top + 24 * dpr + this.rules.length * step + 18 * dpr;
    // A thin line runs out while the card is up.
    const left = 1 - Math.min(1, (now - this.stateAt) / BRIEF_MAX);
    const half = 90 * dpr;
    ctx.strokeStyle = COL_DIM;
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.moveTo(cx - half, by);
    ctx.lineTo(cx + half, by);
    ctx.stroke();
    ctx.strokeStyle = COL_MID;
    ctx.beginPath();
    ctx.moveTo(cx - half, by);
    ctx.lineTo(cx - half + half * 2 * left, by);
    ctx.stroke();
    ctx.fillStyle = COL_MID;
    v.text('press a key or tap when you have it', cx, by + 24 * dpr, v.fontTiny, 'center');
  }

  /**
   * The rule list. Centred (two columns around `x`) on the briefing card,
   * left-aligned from `x` as the small reminder during play.
   */
  private drawRules(v: View, x: number, y: number, font: string, step: number, centred: boolean): void {
    const ctx = v.ctx;
    const dpr = v.dpr;
    const big = centred;
    const icon = (big ? 9 : 5.5) * dpr;
    for (let i = 0; i < this.rules.length; i++) {
      const r = this.rules[i]!;
      const ly = y + i * step;
      const hasIcon = r.shape >= 0 || r.swatch;
      if (centred) {
        if (r.answer === null) {
          ctx.fillStyle = COL_LINE;
          const w = hasIcon ? icon * 3 : 0;
          v.text(r.text, shiftForIcon(x, w), ly, font, 'center');
          if (hasIcon) {
            ctx.font = font;
            const tw = ctx.measureText(r.text).width;
            this.drawIcon(v, r, x + w / 2 - tw / 2 - icon * 1.8, ly - icon * 0.75, icon);
          }
          continue;
        }
        const mid = 22 * dpr;
        ctx.fillStyle = COL_LINE;
        v.text(r.text, x - mid, ly, font, 'right');
        if (hasIcon) {
          ctx.font = font;
          const tw = ctx.measureText(r.text).width;
          this.drawIcon(v, r, x - mid - tw - icon * 1.9, ly - icon * 0.75, icon);
        }
        ctx.strokeStyle = COL_DIM;
        ctx.lineWidth = 1.25 * dpr;
        v.arrow(x, ly - 5 * dpr, 9 * dpr, 1);
        ctx.fillStyle = r.answer === NONE ? COL_MID : COL_LINE;
        v.text(r.answer.label, x + mid, ly, font, 'left');
      } else {
        let tx = x;
        if (hasIcon) {
          this.drawIcon(v, r, x + icon, ly - icon * 0.7, icon);
          tx += icon * 3;
        }
        ctx.fillStyle = COL_MID;
        v.text(r.answer ? `${r.text}  →  ${r.answer.label}` : r.text, tx, ly, font, 'left');
      }
    }
  }

  private drawIcon(v: View, r: RuleLine, x: number, y: number, size: number): void {
    const ctx = v.ctx;
    ctx.fillStyle = SHADE_COL[r.shade]!;
    ctx.strokeStyle = SHADE_COL[r.shade]!;
    ctx.lineWidth = 1.5 * v.dpr;
    if (r.swatch) ctx.fillRect(x - size * 0.8, y - size * 0.8, size * 1.6, size * 1.6);
    else v.shape(r.shape, x, y, size, r.solid);
  }
}

/** Centre of a text line that has an icon in front of it. */
function shiftForIcon(x: number, iconWidth: number): number {
  return x + iconWidth / 2;
}
