// Fifteenth batch.
//   Lights (reaction)  - five lights come on one by one, then go out together. Go.
//   Clock  (attention) - a dot ticks round a dial; now and then it skips a step. Catch the skips.
//   First  (judgement) - two dots race for the line and vanish on the way. Which gets there first?
//   Tangle (attention) - follow one line through a tangle to its end.

import { ANTICIPATION_MS, COL_ACCENT, COL_DIM, COL_LINE, COL_MID } from '../config.ts';
import { SND_BEAT, SND_BEAT_UP, SND_CATCH, SND_FALSE, SND_TAP_WEAK } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import {
  Stair,
  arena,
  footer,
  header,
  mean,
  median,
  message,
  ms,
  shuffle,
  sideOf,
  type Mini,
  type MiniDef,
  type MiniEnv,
  type MiniResult,
  scaled,
} from './kit.ts';

const TAU = Math.PI * 2;

function rint(lo: number, hi: number): number {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

// --- Lights -----------------------------------------------------------------------

const LIGHTS_ROUNDS = 10;

class Lights implements Mini {
  private env!: MiniEnv;
  private round = 0;
  private state = 0; // 0 lights coming on, 1 all on (hold), 2 out (go), 3 feedback
  private t0 = 0;
  private outAt = 0;
  private lit = 0;
  private rts: number[] = [];
  private jumps = 0;
  private misses = 0;
  private last = 0;
  private jumped = false;
  private at = 0;
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.arm(now + 800);
  }

  private arm(now: number): void {
    this.state = 0;
    this.t0 = now;
    this.lit = 0;
    // After the fifth light, a random hold of 0.4 to 3 seconds.
    this.outAt = now + 5 * 800 + 400 + Math.random() * 2600;
  }

  private hit(ts: number): void {
    if (this.state === 3) return;
    if (this.state < 2 || ts < this.outAt + ANTICIPATION_MS) {
      if (ts < this.t0) return;
      this.jumps++;
      this.jumped = true;
      this.env.sound(SND_FALSE);
    } else {
      this.last = ts - this.outAt;
      this.rts.push(this.last);
      this.jumped = false;
      this.round++;
      this.env.sound(SND_CATCH);
    }
    this.state = 3;
    this.at = ts + 1400;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    this.hit(ts);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  pointer(_x: number, _y: number, ts: number): void {
    this.hit(ts);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.t0) {
      const k = Math.min(5, Math.floor((now - this.t0) / 800) + 1);
      if (k > this.lit) {
        this.lit = k;
        this.env.sound(k === 5 ? SND_BEAT_UP : SND_BEAT);
      }
      if (k >= 5) this.state = 1;
    }
    if (this.state === 1 && now >= this.outAt) this.state = 2;
    // No start within a second counts as a miss: a mistake, like a jump start.
    if (this.state === 2 && now - this.outAt > 1000) {
      this.round++;
      this.misses++;
      this.last = -1;
      this.jumped = false;
      this.env.sound(SND_FALSE);
      this.state = 3;
      this.at = now + 1200;
    }
    if (this.state === 3 && now >= this.at) {
      if (this.round >= scaled(LIGHTS_ROUNDS) || this.jumps + this.misses >= 8) return true;
      this.arm(now + 400);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'best', this.rts.length ? ms(Math.min(...this.rts)) : '–', 'start', `${Math.min(this.round + 1, scaled(LIGHTS_ROUNDS))} / ${scaled(LIGHTS_ROUNDS)}`);
    const gap = Math.min(90 * a.u, (a.right - a.left) / 6);
    const r = gap * 0.3;
    const x0 = a.cx - gap * 2;
    const on = this.state <= 1 ? this.lit : 0;
    for (let k = 0; k < 5; k++) {
      const x = x0 + k * gap;
      ctx.strokeStyle = COL_DIM;
      ctx.lineWidth = v.dpr;
      ctx.strokeRect(x - gap * 0.4, a.cy - gap * 0.9, gap * 0.8, gap * 1.8);
      for (const dy of [-0.45, 0.45]) {
        ctx.beginPath();
        ctx.arc(x, a.cy + dy * gap, r, 0, TAU);
        if (k < on) {
          ctx.fillStyle = COL_ACCENT;
          ctx.fill();
        } else {
          ctx.strokeStyle = COL_DIM;
          ctx.stroke();
        }
      }
    }
    if (this.state === 3) message(v, { ...a, cy: a.cy + gap * 1.5 }, this.jumped ? 'jump start' : this.last < 0 ? 'too slow' : `${Math.round(this.last)} ms`, '', this.jumped || this.last < 0 ? COL_ACCENT : COL_LINE);
    else if (this.round === 0) {
      ctx.fillStyle = COL_MID;
      v.text('five lights come on. when they all go out, go. not before', a.cx, a.cy + gap * 1.5, v.fontTiny, 'center');
    }
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const med = median(this.rts);
    return {
      score: this.rts.length ? Math.max(0, Math.round(Math.max(0, 500 - med) * 4 + this.rts.length * 10 - (this.jumps + this.misses) * 30)) : 0,
      primary: { label: 'median start', value: med, unit: 'ms', lower: true },
      lines: [
        { label: 'median start', value: ms(med) },
        { label: 'best start', value: this.rts.length ? ms(Math.min(...this.rts)) : '–' },
        { label: 'jump starts', value: String(this.jumps) },
        { label: 'too slow', value: String(this.misses) },
      ],
      rts: this.rts,
      saved: this.rts.length >= 3,
    };
  }
}

// --- Clock ------------------------------------------------------------------------

const CLOCK_STEPS = 150;
const CLOCK_TICK = 800;

class Clock implements Mini {
  private env!: MiniEnv;
  private t0 = 0;
  /** Position after each tick; a skip moves two places. */
  private pos: number[] = [];
  private skip: boolean[] = [];
  private k = -1;
  private hits = 0;
  private misses = 0;
  private fas = 0;
  private rts: number[] = [];
  /** Skips already caught or counted as missed. */
  private done = new Set<number>();
  private flash = 0;
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    // About one skip per sixteen ticks, never in the first ten ticks, never close together.
    // Placed by walking forward in random strides, so it always finishes whatever the length.
    const skips = new Set<number>();
    const steps = scaled(CLOCK_STEPS);
    for (let s = 10 + rint(0, 8); s < steps - 3; s += rint(9, 23)) skips.add(s);
    let p = 0;
    for (let i = 0; i < scaled(CLOCK_STEPS); i++) {
      const sk = skips.has(i);
      p = (p + (sk ? 2 : 1)) % 60;
      this.pos.push(p);
      this.skip.push(sk);
    }
    this.t0 = now + 1000;
  }

  private hit(ts: number): void {
    if (this.k < 0) return;
    // A press within 1.5 ticks of a skip counts for it.
    const lookback = [this.k, this.k - 1].find((i) => i >= 0 && this.skip[i] && !this.done.has(i));
    if (lookback !== undefined) {
      this.done.add(lookback);
      this.hits++;
      this.rts.push(ts - (this.t0 + lookback * CLOCK_TICK));
      this.env.sound(SND_CATCH);
    } else {
      this.fas++;
      this.flash = ts;
      this.env.sound(SND_TAP_WEAK);
    }
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    this.hit(ts);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  pointer(_x: number, _y: number, ts: number): void {
    this.hit(ts);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const k = Math.floor((now - this.t0) / CLOCK_TICK);
    if (now >= this.t0 && k !== this.k) {
      // A skip two ticks back that was never pressed is a miss.
      const old = k - 2;
      if (old >= 0 && this.skip[old] && !this.done.has(old)) {
        this.done.add(old);
        this.misses++;
      }
      this.k = k;
      if (k >= scaled(CLOCK_STEPS) + 1) return true;
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'caught', String(this.hits), 'time left', `${Math.max(0, Math.ceil(((scaled(CLOCK_STEPS) - Math.max(0, this.k)) * CLOCK_TICK) / 1000))} s`);
    const R = Math.min((a.bottom - a.top) * 0.38, 190 * a.u);
    for (let i = 0; i < 60; i++) {
      const ang = (i / 60) * TAU - Math.PI / 2;
      ctx.fillStyle = i % 5 === 0 ? COL_MID : COL_DIM;
      const r0 = R * (i % 5 === 0 ? 0.9 : 0.94);
      ctx.fillRect(a.cx + Math.cos(ang) * R - dpr, a.cy + Math.sin(ang) * R - dpr, 2 * dpr, 2 * dpr);
      if (i % 5 === 0) {
        ctx.beginPath();
        ctx.moveTo(a.cx + Math.cos(ang) * r0, a.cy + Math.sin(ang) * r0);
        ctx.lineTo(a.cx + Math.cos(ang) * R, a.cy + Math.sin(ang) * R);
        ctx.strokeStyle = COL_MID;
        ctx.lineWidth = dpr;
        ctx.stroke();
      }
    }
    if (this.k >= 0 && this.k < scaled(CLOCK_STEPS)) {
      const p = this.pos[this.k]!;
      const ang = (p / 60) * TAU - Math.PI / 2;
      ctx.fillStyle = COL_LINE;
      ctx.beginPath();
      ctx.arc(a.cx + Math.cos(ang) * R * 0.82, a.cy + Math.sin(ang) * R * 0.82, 6 * a.u, 0, TAU);
      ctx.fill();
    }
    if (now - this.flash < 300) {
      ctx.fillStyle = COL_MID;
      v.text('no skip there', a.cx, a.bottom - 6 * a.u, v.fontTiny, 'center');
    } else if (this.k < 10) {
      ctx.fillStyle = COL_MID;
      v.text('the dot steps once a tick. press when it skips a step', a.cx, a.bottom - 6 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const total = this.hits + this.misses;
    return {
      score: this.hits ? Math.max(0, this.hits * 80 - this.fas * 20 + Math.round(Math.max(0, 900 - median(this.rts)) / 3)) : 0,
      primary: { label: 'skips caught', value: total ? (this.hits / total) * 100 : 0, unit: '%' },
      lines: [
        { label: 'skips caught', value: `${this.hits} of ${total}` },
        { label: 'false alarms', value: String(this.fas) },
        { label: 'median time to catch', value: ms(median(this.rts)) },
      ],
      rts: this.rts,
      saved: this.k >= 30,
    };
  }
}

// --- First ------------------------------------------------------------------------

/** Arrival-time differences in ms, easy to hard. */
const GAPS = [450, 340, 260, 200, 150, 115, 90, 70, 55, 42, 32, 24, 18, 13, 10];
const FIRST_TRIALS = 28;

class First implements Mini {
  private env!: MiniEnv;
  private readonly st = new Stair(0, 1, 0, GAPS.length - 1);
  private i = 0;
  private state = 0; // 0 running (visible), 1 hidden, answer, 2 feedback
  private t0 = 0;
  private at = 0;
  private arrive = [0, 0];
  private speed = [0, 0];
  private hideAt = 0;
  private winner = -1;
  private lastOk = false;
  private correct = 0;
  private hist: number[] = [];
  private held = 0;
  private cx = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.arm(now + 500);
  }

  private arm(now: number): void {
    const gap = GAPS[this.st.level]!;
    this.winner = Math.random() < 0.5 ? -1 : 1;
    const base = 1500 + Math.random() * 700;
    const early = base;
    const late = base + gap;
    this.arrive = this.winner < 0 ? [early, late] : [late, early];
    // Different speeds, so the nearer dot is not always first.
    this.speed = [0.35 + Math.random() * 0.35, 0.35 + Math.random() * 0.35];
    this.hideAt = 600 + Math.random() * 300;
    this.t0 = now;
    this.state = 0;
  }

  private answer(side: number, ts: number): void {
    if (this.state === 2 || side === 0 || ts < this.t0) return;
    this.lastOk = side === this.winner;
    if (this.lastOk) this.correct++;
    this.hist.push(GAPS[this.st.level]!);
    this.st.update(this.lastOk);
    this.env.sound(this.lastOk ? SND_CATCH : SND_FALSE);
    this.i++;
    this.state = 2;
    this.at = ts + 1200;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    this.answer(sideOf(slot), ts);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  pointer(x: number, _y: number, ts: number): void {
    this.answer(x < this.cx ? -1 : 1, ts);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const t = now - this.t0;
    if (this.state === 0 && t > this.hideAt) this.state = 1;
    if (this.state === 1 && t > Math.max(...this.arrive) + 3000) this.answer(-this.winner, now);
    if (this.state === 2 && now >= this.at) {
      if (this.i >= scaled(FIRST_TRIALS)) return true;
      this.arm(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    this.cx = a.cx;
    header(v, touch, 'gap', ms(GAPS[this.st.level]!), 'race', `${Math.min(this.i + 1, scaled(FIRST_TRIALS))} / ${scaled(FIRST_TRIALS)}`);
    const top = a.top + 20 * a.u;
    const H = a.bottom - top - 40 * a.u;
    const lineY = top;
    const half = Math.min((a.right - a.left) / 4, 150 * a.u);
    ctx.fillStyle = COL_LINE;
    ctx.fillRect(a.cx - half * 2, lineY, half * 4, dpr);
    for (let s = 0; s < 2; s++) {
      const x = a.cx + (s ? half : -half);
      ctx.fillStyle = COL_DIM;
      ctx.fillRect(x - dpr / 2, lineY, dpr, H);
      // Distance to the line is speed x time left, in board heights.
      const tl = this.state === 2 ? 0 : Math.max(0, this.arrive[s]! - t) / 1000;
      const y = lineY + Math.min(1, tl * this.speed[s]!) * H;
      if (this.state === 0 || this.state === 2) {
        ctx.fillStyle = this.state === 2 && (s ? 1 : -1) === this.winner ? (this.lastOk ? COL_LINE : COL_ACCENT) : this.state === 2 ? COL_MID : COL_LINE;
        ctx.beginPath();
        ctx.arc(x, this.state === 2 ? lineY + ((s ? 1 : -1) === this.winner ? 0 : 14 * a.u) : y, 8 * a.u, 0, TAU);
        ctx.fill();
      }
    }
    // The hidden stretch.
    if (this.state === 1) {
      ctx.fillStyle = COL_MID;
      v.text('which reaches the line first?', a.cx, a.cy + 40 * a.u, v.fontTiny, 'center');
    } else if (this.i === 0 && this.state === 0) {
      ctx.fillStyle = COL_MID;
      v.text('watch their speeds. they vanish before the line', a.cx, a.cy + 40 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const tail = this.hist.slice(-12);
    const thr = tail.length ? mean(tail) : 0;
    return {
      score: Math.round(this.correct * 10 + (thr ? Math.max(0, 450 - thr) : 0)),
      primary: { label: 'smallest gap you can call', value: thr, unit: 'ms', lower: true },
      lines: [
        { label: 'smallest arrival gap you can call (last 12)', value: ms(thr) },
        { label: 'correct', value: `${this.correct} of ${this.i}` },
      ],
      saved: this.i >= 8,
    };
  }
}

// --- Tangle -----------------------------------------------------------------------

const TANGLE_N = 12;

class Tangle implements Mini {
  private env!: MiniEnv;
  private n = 3;
  /** For each line: left row, right row, and two middle control heights (0..1). */
  private lines: { l: number; r: number; c1: number; c2: number }[] = [];
  private origin = 0;
  private state = 0; // 0 tracing, 1 feedback
  private shownAt = 0;
  private at = 0;
  private i = 0;
  private right = 0;
  private picked = -1;
  private times: number[] = [];
  private ends: number[][] = [];

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.make(now + 300);
  }

  private make(now: number): void {
    const n = this.n;
    const rs = shuffle([...Array(n).keys()]);
    this.lines = rs.map((r, l) => ({ l, r, c1: Math.random(), c2: Math.random() }));
    this.origin = rint(0, n - 1);
    this.state = 0;
    this.shownAt = now;
    this.picked = -1;
  }

  private choose(row: number, ts: number): void {
    if (this.state !== 0 || row < 0 || row >= this.n) return;
    this.picked = row;
    const ok = this.lines[this.origin]!.r === row;
    if (ok) {
      this.right++;
      this.times.push(ts - this.shownAt);
      this.n = Math.min(8, this.n + 1);
    } else this.n = Math.max(3, this.n - 1);
    this.env.sound(ok ? SND_CATCH : SND_FALSE);
    this.i++;
    this.state = 1;
    this.at = ts + (ok ? 800 : 1600);
  }

  press(): void {}

  typeKey(code: string, ts: number): boolean {
    const m = /^(?:Digit|Numpad)([1-8])$/.exec(code);
    if (!m) return false;
    this.choose(Number(m[1]) - 1, ts);
    return true;
  }

  pointer(x: number, y: number, ts: number): void {
    this.ends.forEach(([ex, ey, r], row) => {
      if (Math.hypot(x - ex!, y - ey!) < r!) this.choose(row, ts);
    });
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now - this.shownAt > 30000) this.choose((this.lines[this.origin]!.r + 1) % this.n, now);
    if (this.state === 1 && now >= this.at) {
      if (this.i >= TANGLE_N) return true;
      this.make(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'lines', String(this.n), 'puzzle', `${Math.min(this.i + 1, TANGLE_N)} / ${TANGLE_N}`);
    const W = Math.min(a.right - a.left - 60 * a.u, 640 * a.u);
    const H = a.bottom - a.top - 50 * a.u;
    const x0 = a.cx - W / 2;
    const x1 = a.cx + W / 2;
    const y0 = a.top + 20 * a.u;
    const rowY = (k: number) => y0 + ((k + 0.5) / this.n) * H;
    this.lines.forEach((ln, k) => {
      const isStart = k === this.origin;
      ctx.strokeStyle = this.state === 1 && isStart ? COL_ACCENT : COL_LINE;
      ctx.lineWidth = (this.state === 1 && isStart ? 2.5 : 1.5) * dpr;
      ctx.beginPath();
      ctx.moveTo(x0, rowY(ln.l));
      ctx.bezierCurveTo(x0 + W * 0.33, y0 + ln.c1 * H, x0 + W * 0.66, y0 + ln.c2 * H, x1, rowY(ln.r));
      ctx.stroke();
    });
    // Ends: the start on the left lit, numbered ends on the right.
    for (let k = 0; k < this.n; k++) {
      ctx.fillStyle = k === this.origin ? COL_ACCENT : COL_DIM;
      ctx.beginPath();
      ctx.arc(x0, rowY(k), 6 * a.u, 0, TAU);
      ctx.fill();
    }
    this.ends = [];
    for (let k = 0; k < this.n; k++) {
      const ex = x1 + 22 * a.u;
      const ey = rowY(k);
      this.ends.push([ex, ey, 22 * a.u]);
      const isAns = this.lines[this.origin]!.r === k;
      ctx.strokeStyle = this.state === 1 && isAns ? COL_LINE : this.state === 1 && k === this.picked ? COL_ACCENT : COL_DIM;
      ctx.lineWidth = dpr;
      ctx.beginPath();
      ctx.arc(ex, ey, 14 * a.u, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = COL_LINE;
      v.text(String(k + 1), ex, ey + 4 * dpr, v.fontTiny, 'center');
    }
    if (this.i === 0 && this.state === 0) {
      ctx.fillStyle = COL_MID;
      v.text('follow the line from the orange dot. where does it end? tap the number or press it', a.cx, a.bottom - 10 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.right * 60 + (this.times.length ? Math.round(Math.max(0, 8000 - median(this.times)) / 40) : 0),
      primary: { label: 'right', value: this.right, unit: `/ ${TANGLE_N}` },
      lines: [
        { label: 'right', value: `${this.right} of ${this.i}` },
        { label: 'median time when right', value: this.times.length ? `${(median(this.times) / 1000).toFixed(1)} s` : '–' },
        { label: 'most lines', value: String(this.n) },
      ],
      rts: this.times, saved: this.i >= 4,
    };
  }
}

export const BATCH15: MiniDef[] = [
  {
    id: 'lights',
    name: 'Lights',
    skill: 'reaction',
    blurb: 'Five lights come on one by one, then go out together. Go.',
    how: 'Five lights come on, one a second. Then, after a random wait, they all go out: press the moment they do. Press while any are still lit and it is a jump start. Ten starts.',
    input: 'both',
    make: () => new Lights(),
  },
  {
    id: 'clock',
    name: 'Clock',
    skill: 'attention',
    blurb: 'A dot ticks round a dial. Now and then it skips a step. Catch the skips.',
    how: 'The dot moves one mark each tick, for two minutes. About nine times it jumps two marks instead: press when it does. A classic vigilance test: the skips are rare, and that is the hard part.',
    input: 'both',
    make: () => new Clock(),
  },
  {
    id: 'first',
    name: 'First',
    skill: 'judgement',
    blurb: 'Two dots race for the line and vanish on the way. Which gets there first?',
    how: 'Two dots head for the line at different speeds and from different distances, then disappear. Judge which arrives first: that hand, or tap that side. The difference shrinks as you get it right.',
    input: 'both',
    minKeys: 2,
    make: () => new First(),
  },
  {
    id: 'tangle',
    name: 'Tangle',
    skill: 'attention',
    blurb: 'Follow one line through a tangle to its end.',
    how: 'Lines cross and recross. Follow the one from the orange dot to its end and tap that number (or press it). Get it right and there is one more line next time.',
    input: 'pointer',
    make: () => new Tangle(),
  },
];
