const DOT_SEP = '  \u00b7  ';
// More games, one per skill.
//   Choice - a string lights; press its key. How much slower is choosing between more?
//   Gap    - two clicks set an interval; reproduce it from a third.
//   Pairs  - turn over tiles two at a time and match them.
//   Shape  - the word names one shape, the outline is another. Answer the outline.

import { ANTICIPATION_MS, COL_ACCENT, COL_DIM, COL_LINE, COL_MID } from '../config.ts';
import { SND_BEAT, SND_BEAT_UP, SND_CATCH, SND_FALSE, SND_TAP_WEAK, SND_TONE } from '../audio.ts';
import { SHAPE_CIRCLE, SHAPE_CROSS, SHAPE_DIAMOND, SHAPE_SQUARE, SHAPE_TRIANGLE, type View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import {
  Stair,
  arena,
  footer,
  foreperiod,
  handLabel,
  header,
  mean,
  median,
  message,
  ms,
  pct,
  shuffle,
  sideOf,
  slotsOf,
  type Mini,
  type MiniDef,
  type MiniEnv,
  type MiniResult,
  gameNow,
  scaled,
} from './kit.ts';

const GREY = '#6c6c74';

// --- Choice -----------------------------------------------------------------------

const CHOICE_PER_BLOCK = 12;

class Choice implements Mini {
  private env!: MiniEnv;
  private slots: number[] = [];
  /** Number of possible strings per block, e.g. [1, 2, 4]. */
  private sizes: number[] = [];
  private block = 0;
  private active: number[] = [];
  private trial = 0;
  private state = 0; // 0 wait, 1 lit, 2 feedback, 3 block card
  private at = 0;
  private lit = 0;
  private drawnAt = 0;
  private rts = new Map<number, number[]>();
  /** Wrong presses per number of choices, shown beside each median. */
  private errBy = new Map<number, number>();
  private errors = 0;
  private early = 0;
  private feedback = '';
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.slots = slotsOf(env.mode);
    const n = this.slots.length;
    this.sizes = [...new Set([1, 2, n >= 4 ? 4 : n, n].filter((x) => x <= n))].sort((a, b) => a - b);
    this.newBlock(now);
  }

  private newBlock(now: number): void {
    const size = this.sizes[this.block]!;
    this.active = shuffle([...this.slots.keys()]).slice(0, size).sort((a, b) => a - b);
    this.trial = 0;
    this.state = 3;
    this.at = now + 1600;
  }

  private arm(now: number): void {
    this.state = 0;
    this.at = now + foreperiod(500, 600, 2000);
    this.lit = this.active[Math.floor(Math.random() * this.active.length)]!;
    this.drawnAt = 0;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const lane = this.slots.indexOf(slot);
    if (lane < 0) return;
    if (this.state === 0) {
      this.early++;
      this.trial++;
      this.feedback = 'too early';
      this.state = 2;
      this.at = ts + 700;
      this.env.sound(SND_FALSE);
      return;
    }
    if (this.state !== 1 || this.drawnAt === 0) return;
    const rt = ts - this.drawnAt;
    if (rt < ANTICIPATION_MS) return;
    this.trial++;
    if (lane === this.lit) {
      const size = this.active.length;
      const list = this.rts.get(size) ?? [];
      list.push(rt);
      this.rts.set(size, list);
      this.feedback = `${Math.round(rt)}`;
      this.env.sound(SND_TONE + (lane % 7));
    } else {
      this.errors++;
      this.errBy.set(this.active.length, (this.errBy.get(this.active.length) ?? 0) + 1);
      this.feedback = 'wrong string';
      this.env.sound(SND_FALSE);
    }
    this.state = 2;
    this.at = ts + 420;
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 3 && now >= this.at) this.arm(now);
    if (this.state === 0 && now >= this.at) this.state = 1;
    if (this.state === 1 && this.drawnAt > 0 && now - this.drawnAt > 1500) {
      this.trial++;
      this.errors++;
      this.feedback = 'too slow';
      this.state = 2;
      this.at = now + 600;
    }
    if (this.state === 2 && now >= this.at) {
      if (this.trial >= scaled(CHOICE_PER_BLOCK)) {
        this.block++;
        if (this.block >= this.sizes.length) return true;
        this.newBlock(now);
      } else this.arm(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'choices', String(this.active.length), 'block', `${Math.min(this.block + 1, this.sizes.length)} / ${this.sizes.length}`);
    const n = this.slots.length;
    const span = Math.min(a.right - a.left, n * 110 * a.u);
    const top = a.top + 30 * a.u;
    const bottom = a.bottom - 40 * a.u;
    for (let i = 0; i < n; i++) {
      const x = Math.round(a.cx - span / 2 + (span * (i + 0.5)) / n) + 0.5;
      const on = this.active.includes(i);
      const lit = this.state === 1 && this.lit === i;
      ctx.strokeStyle = lit ? COL_ACCENT : on ? COL_MID : COL_DIM;
      // Strings you can see from across a room: thick when lit, clearly drawn when idle.
      ctx.lineWidth = (lit ? 8 : on ? 3 : 1.5) * dpr;
      if (!on) ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = on ? COL_MID : COL_DIM;
      v.text(this.env.labels[this.slots[i]!] ?? '', x, bottom + 22 * dpr, v.fontTiny, 'center');
    }
    if (this.state === 1 && this.drawnAt === 0) this.drawnAt = gameNow();
    if (this.state === 3) message(v, { ...a, cy: top - 6 * dpr }, this.active.length === 1 ? 'one string: just react' : `${this.active.length} strings: press whichever lights`, '', COL_MID);
    else if (this.state === 2) {
      ctx.fillStyle = COL_MID;
      v.text(this.feedback, a.cx, top - 10 * dpr, v.fontHud, 'center');
    }
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const lines = this.sizes.map((s) => {
      const wrong = this.errBy.get(s) ?? 0;
      return { label: `${s} choice${s > 1 ? 's' : ''}: median, wrong`, value: `${ms(median(this.rts.get(s) ?? []))}${DOT_SEP}${wrong} wrong` };
    });
    // Hick's law: time grows with log2 of the number of choices.
    const pts = this.sizes.filter((s) => (this.rts.get(s) ?? []).length >= 3).map((s) => [Math.log2(s + 1), median(this.rts.get(s)!)] as const);
    let slope = 0;
    if (pts.length >= 2) {
      const mx = mean(pts.map((p) => p[0]));
      const my = mean(pts.map((p) => p[1]));
      const num = pts.reduce((acc, p) => acc + (p[0] - mx) * (p[1] - my), 0);
      const den = pts.reduce((acc, p) => acc + (p[0] - mx) ** 2, 0);
      slope = den ? num / den : 0;
    }
    lines.push({ label: 'extra per doubling of choices', value: pts.length >= 2 ? ms(slope) : '–' });
    lines.push({ label: 'wrong / too early', value: `${this.errors} / ${this.early}` });
    const all = [...this.rts.values()].flat();
    // The headline: the most choices with enough presses to give a real median.
    const topSize = [...this.sizes].reverse().find((n) => (this.rts.get(n) ?? []).length >= 3) ?? this.sizes[0]!;
    const top = median(this.rts.get(topSize) ?? []);
    return {
      score: top ? Math.round(100000 / top) : 0,
      primary: { label: `${topSize}-choice median`, value: top, unit: 'ms', lower: true },
      lines,
      series: { label: 'median by number of choices', names: this.sizes.map((n) => `${n} choice${n > 1 ? 's' : ''}`), values: this.sizes.map((n) => median(this.rts.get(n) ?? [])), unit: 'ms', lower: true },
      rts: all,
      saved: all.length >= 8,
    };
  }
}

// --- Gap --------------------------------------------------------------------------

/** Rest between the gap and the go click (ms): always the same. */
const GAP_REST = 1200;
const GAP_TRIALS = 15;

class Gap implements Mini {
  private env!: MiniEnv;
  private i = 0;
  private interval = 800;
  private state = 0; // 0 demo, 1 waiting for press, 2 feedback
  private at = 0;
  /** Click times: the gap twice (three clicks), then the go click to measure from. */
  private clicks: number[] = [];
  private third = 0;
  private errs: number[] = [];
  private last = 0;
  private held = 0;
  private fired = 0;
  private exact = false;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.exact = !!env.soundAt && !env.muted;
    this.arm(now + 800, now);
  }

  private arm(at: number, now: number): void {
    this.interval = Math.round(400 + Math.random() * 1200);
    this.state = 0;
    this.at = at;
    this.clicks = [at, at + this.interval, at + this.interval * 2];
    // A fixed rest, the same every time, so the only thing that changes is the gap itself.
    this.third = this.clicks[2]! + GAP_REST;
    this.fired = 0;
    if (this.exact) {
      for (const c of this.clicks) this.env.soundAt!(SND_BEAT, c - now);
      this.env.soundAt!(SND_BEAT_UP, this.third - now);
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

  private hit(ts: number): void {
    // The go click was heard late by the output delay, and so the press is measured from then.
    const heard = this.third + (this.exact ? (this.env.latency ?? 0) : 0);
    if (this.state !== 1 || ts < heard) return;
    const got = ts - heard;
    this.last = (got - this.interval) / this.interval;
    this.errs.push(this.last);
    this.env.sound(Math.abs(this.last) < 0.05 ? SND_CATCH : SND_TAP_WEAK);
    this.state = 2;
    this.at = ts + 1300;
    this.i++;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0) {
      // Without scheduled audio, fire the clicks from frames.
      const times = [...this.clicks, this.third];
      while (this.fired < times.length && now >= times[this.fired]!) {
        if (!this.exact) this.env.sound(this.fired === 3 ? SND_BEAT_UP : SND_BEAT);
        this.fired++;
      }
      if (now >= this.third) this.state = 1;
    }
    if (this.state === 1 && now - this.third > this.interval * 3 + 1000) {
      this.last = 2;
      this.errs.push(1);
      this.state = 2;
      this.at = now + 1000;
      this.i++;
    }
    if (this.state === 2 && now >= this.at) {
      if (this.i >= scaled(GAP_TRIALS)) return true;
      this.arm(now + 500, now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'trial', `${Math.min(this.i + 1, scaled(GAP_TRIALS))} / ${scaled(GAP_TRIALS)}`, 'average error', this.errs.length ? pct(mean(this.errs.map(Math.abs))) : '–');
    const r = 24 * a.u;
    // Three markers for the gap played twice, a fourth (orange) for the go click.
    const times = [...this.clicks, this.third];
    const xs = [-1.5, -0.5, 0.5, 1.6].map((k) => a.cx + k * 90 * a.u);
    xs.forEach((x, k) => {
      const t = times[k]!;
      const lit = now >= t && now - t < 120;
      ctx.beginPath();
      ctx.arc(x, a.cy - 20 * a.u, r * (k === 3 ? 0.85 : 1), 0, Math.PI * 2);
      if (lit) {
        ctx.fillStyle = k === 3 ? COL_ACCENT : COL_LINE;
        ctx.fill();
      } else {
        ctx.strokeStyle = now >= t ? COL_MID : COL_DIM;
        ctx.lineWidth = dpr;
        ctx.stroke();
      }
    });
    ctx.fillStyle = COL_MID;
    if (this.state === 0) v.text('the same gap, twice: remember it', a.cx, a.cy + 50 * a.u, v.fontTiny, 'center');
    else if (this.state === 1) v.text('press when the same gap has passed since the orange one', a.cx, a.cy + 50 * a.u, v.fontTiny, 'center');
    else {
      const e = this.last;
      message(v, { ...a, cy: a.cy + 60 * a.u }, e >= 2 ? 'missed' : `${e > 0 ? '+' : ''}${Math.round(e * 100)}%`, e >= 2 ? '' : `gap was ${this.interval} ms`);
    }
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const abs = this.errs.map(Math.abs);
    const m = mean(abs);
    const signed = mean(this.errs);
    return {
      score: this.i ? Math.round(Math.max(0, 0.5 - m) * 2000) : 0,
      primary: { label: 'average error', value: Math.round(m * 100), unit: '%', lower: true },
      lines: [
        { label: 'average error', value: pct(m) },
        { label: 'within 5%', value: pct(abs.filter((x) => x < 0.05).length / (abs.length || 1)) },
        { label: 'tendency', value: `${signed >= 0 ? 'long' : 'short'} by ${pct(Math.abs(signed))}` },
      ],
      saved: this.i >= 5,
    };
  }
}

// --- Pairs ------------------------------------------------------------------------

const PAIR_SHAPES = [SHAPE_CIRCLE, SHAPE_SQUARE, SHAPE_TRIANGLE, SHAPE_DIAMOND, SHAPE_CROSS];

class Pairs implements Mini {
  private env!: MiniEnv;
  private board = 0;
  private cols = 4;
  private rows = 4;
  private faces: number[] = [];
  private matched = new Set<number>();
  private open: number[] = [];
  private closeAt = 0;
  private moves = 0;
  private totalMoves = 0;
  private totalPairs = 0;
  private t0 = 0;
  private times: number[] = [];
  private state = 0; // 0 play, 1 board done
  private at = 0;
  private geo = { x0: 0, y0: 0, cell: 0 };
  private outOfMoves = false;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.setup(now);
  }

  private setup(now: number): void {
    // Boards grow: 8, 10 and 15 pairs. Each allows five moves per pair.
    const sizes = [
      [4, 4],
      [5, 4],
      [6, 5],
    ] as const;
    [this.cols, this.rows] = sizes[this.board]!;
    const pairs = (this.cols * this.rows) / 2;
    const faces: number[] = [];
    for (let i = 0; i < pairs; i++) faces.push(i, i);
    this.faces = shuffle(faces);
    this.matched.clear();
    this.open = [];
    this.moves = 0;
    this.outOfMoves = false;
    this.state = 0;
    this.t0 = now;
  }

  press(): void {}

  pointer(x: number, y: number, ts: number): void {
    if (this.state !== 0) return;
    if (this.open.length === 2) {
      if (ts < this.closeAt) return;
      this.open = [];
    }
    const g = this.geo;
    const cx = Math.floor((x - g.x0) / g.cell);
    const cy = Math.floor((y - g.y0) / g.cell);
    if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return;
    const c = cy * this.cols + cx;
    if (this.matched.has(c) || this.open.includes(c)) return;
    this.open.push(c);
    this.env.sound(SND_TONE + (this.faces[c]! % 7));
    if (this.open.length === 2) {
      this.moves++;
      const [p, q] = this.open as [number, number];
      if (this.faces[p] === this.faces[q]) {
        this.matched.add(p);
        this.matched.add(q);
        this.open = [];
        this.env.sound(SND_CATCH);
        if (this.matched.size === this.faces.length) {
          this.times.push(ts - this.t0);
          this.totalMoves += this.moves;
          this.totalPairs += this.faces.length / 2;
          this.state = 1;
          this.at = ts + 1500;
        }
      } else {
        this.closeAt = ts + 700;
        // Out of moves: the board ends uncleared.
        if (this.moves >= (this.faces.length / 2) * 5) {
          this.outOfMoves = true;
          this.state = 1;
          this.at = ts + 1500;
        }
      }
    }
  }

  /** A face: one of 5 shapes, drawn white solid, grey solid or white outline (up to 15). */
  private drawFace(v: View, face: number, x: number, y: number, r: number): void {
    const shape = PAIR_SHAPES[face % 5]!;
    const style = Math.floor(face / 5);
    const ctx = v.ctx;
    ctx.fillStyle = style === 1 ? GREY : COL_LINE;
    ctx.strokeStyle = COL_LINE;
    ctx.lineWidth = 2 * v.dpr;
    v.shape(shape, x, y, r, style !== 2);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.open.length === 2 && now >= this.closeAt && this.faces[this.open[0]!] !== this.faces[this.open[1]!]) this.open = [];
    if (this.state === 1 && now >= this.at) {
      this.board++;
      if (this.board >= 3) return true;
      this.setup(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'board', `${Math.min(this.board + 1, 3)} / 3`, 'moves', String(this.moves));
    const cell = Math.min((a.right - a.left) / this.cols, (a.bottom - a.top) / this.rows, 110 * a.u);
    const g = (this.geo = { x0: a.cx - (cell * this.cols) / 2, y0: a.cy - (cell * this.rows) / 2, cell });
    for (let c = 0; c < this.faces.length; c++) {
      const x = g.x0 + (c % this.cols) * cell + cell / 2;
      const y = g.y0 + Math.floor(c / this.cols) * cell + cell / 2;
      const s = cell * 0.84;
      const up = this.matched.has(c) || this.open.includes(c);
      ctx.strokeStyle = this.open.includes(c) ? COL_MID : COL_DIM;
      ctx.lineWidth = dpr;
      if (!this.matched.has(c)) ctx.strokeRect(x - s / 2 + 0.5, y - s / 2 + 0.5, s - 1, s - 1);
      if (up) {
        if (this.matched.has(c)) ctx.globalAlpha = 0.4;
        this.drawFace(v, this.faces[c]!, x, y, s * 0.26);
        ctx.globalAlpha = 1;
      }
    }
    if (this.state === 1) message(v, a, this.outOfMoves ? 'out of moves' : `${this.moves} moves`, `${this.faces.length / 2} pairs`);
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const perPair = this.totalPairs ? this.totalMoves / this.totalPairs : 0;
    return {
      score: this.totalPairs ? Math.round((this.totalPairs * 100) / Math.max(1, perPair)) : 0,
      primary: { label: 'moves per pair', value: perPair, unit: '', lower: true, decimals: 2 },
      lines: [
        { label: 'boards cleared', value: `${this.times.length} of 3` },
        { label: 'moves per pair (1.00 is perfect)', value: perPair ? perPair.toFixed(2) : '–' },
        { label: 'time per board', value: this.times.map((t) => `${(t / 1000).toFixed(0)} s`).join('  ') || '–' },
      ],
      saved: this.times.length >= 1,
    };
  }
}

// --- Shape (Stroop) ---------------------------------------------------------------

const SHAPE_TRIALS = 40;
const WORDS = ['CIRCLE', 'SQUARE'];

class Shape implements Mini {
  private env!: MiniEnv;
  private i = 0;
  private state = 0;
  private at = 0;
  private outline = 0;
  private word = 0;
  /** Answer by the outline (most rounds) or, when cued, by the word. */
  private byWord = false;
  private drawnAt = 0;
  private readonly win = new Stair(1500, 80, 250, 2000);
  private same: number[] = [];
  private clash: number[] = [];
  private errors = 0;
  private slow = 0;
  private feedback = '';
  private score = 0;
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.arm(now + 600);
  }

  private arm(now: number): void {
    this.state = 0;
    this.at = now + 300 + Math.random() * 300;
    this.outline = Math.random() < 0.5 ? 0 : 1;
    this.word = Math.random() < 0.4 ? this.outline : 1 - this.outline;
    this.byWord = this.i >= 16 && Math.random() < 0.3;
    this.drawnAt = 0;
  }

  private end(now: number, ok: boolean, rt: number, text: string): void {
    this.i++;
    this.state = 2;
    this.feedback = text;
    this.at = now + (ok ? 140 : 800);
    this.win.update(ok, -1);
    if (ok) {
      if (!this.byWord) (this.word === this.outline ? this.same : this.clash).push(rt);
      this.score += 10 + (this.word !== this.outline ? 5 : 0) + (this.byWord ? 5 : 0) + Math.max(0, Math.round((this.win.level - rt) / 40));
      this.env.sound(SND_TAP_WEAK);
    } else this.env.sound(SND_FALSE);
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (this.state !== 1 || this.drawnAt === 0) return;
    const side = sideOf(slot);
    if (side === 0) return;
    const rt = ts - this.drawnAt;
    if (rt < 120) return;
    const want = (this.byWord ? this.word : this.outline) === 0 ? -1 : 1;
    if (side === want) this.end(ts, true, rt, '');
    else {
      this.errors++;
      this.end(ts, false, 0, this.byWord ? 'the WORD this time' : 'the outline, not the word');
    }
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.at) this.state = 1;
    if (this.state === 1 && this.drawnAt > 0 && now - this.drawnAt > this.win.level) {
      this.slow++;
      this.end(now, false, 0, 'too slow');
    }
    if (this.state === 2 && now >= this.at) {
      if (this.i >= scaled(SHAPE_TRIALS)) return true;
      this.arm(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'score', String(this.score), 'trial', `${Math.min(this.i + 1, scaled(SHAPE_TRIALS))} / ${scaled(SHAPE_TRIALS)}`);
    const r = 70 * a.u;
    if (this.state === 1) {
      ctx.strokeStyle = COL_LINE;
      ctx.lineWidth = 3 * dpr;
      v.shape(this.outline === 0 ? SHAPE_CIRCLE : SHAPE_SQUARE, a.cx, a.cy, r, false);
      ctx.fillStyle = COL_LINE;
      v.text(WORDS[this.word]!, a.cx, a.cy + 6 * dpr, v.fontHud, 'center');
      if (this.byWord) {
        ctx.fillStyle = COL_ACCENT;
        v.text('WORD', a.cx, a.cy - r - 22 * dpr, v.fontTiny, 'center');
      }
      if (this.drawnAt === 0) this.drawnAt = gameNow();
    } else if (this.state === 2 && this.feedback) message(v, a, this.feedback, '', COL_MID);
    ctx.fillStyle = COL_MID;
    v.text(`circle  ${handLabel(this.env, -1)}`, a.cx - 150 * a.u, a.bottom - 20 * dpr, v.fontTiny, 'center');
    v.text(`square  ${handLabel(this.env, 1)}`, a.cx + 150 * a.u, a.bottom - 20 * dpr, v.fontTiny, 'center');
    if (this.i < 3) v.text('answer the OUTLINE, ignore the word (unless it says WORD above)', a.cx, a.bottom - 40 * dpr, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const cost = this.same.length && this.clash.length ? median(this.clash) - median(this.same) : 0;
    const done = this.i || 1;
    return {
      score: this.score,
      primary: { label: 'interference', value: cost, unit: 'ms', lower: true, zeroOk: true },
      lines: [
        { label: 'word agrees', value: ms(median(this.same)) },
        { label: 'word disagrees', value: ms(median(this.clash)) },
        { label: 'interference cost', value: ms(cost) },
        { label: 'correct', value: pct((done - this.errors - this.slow) / done) },
      ],
      rts: [...this.same, ...this.clash],
      saved: this.i >= 10,
    };
  }
}

export const MORE: MiniDef[] = [
  {
    id: 'choice',
    name: 'Choice',
    skill: 'reaction',
    blurb: 'Press whichever string lights. More strings, more thinking.',
    how: 'Each of your keys has a vertical line (a string), labelled with the key underneath. One string lights orange: press that key as fast as you can. It starts with one string and adds more each block, so you see how much each extra choice slows you.',
    input: 'keys',
    minKeys: 2,
    make: () => new Choice(),
  },
  {
    id: 'gap',
    name: 'Gap',
    skill: 'timing',
    blurb: 'Two clicks make a gap. Copy it from memory.',
    how: 'Three white clicks play the same gap twice. After a short rest an orange click goes: press when that same gap has passed since it. Scored as a percentage of the gap. Fifteen gaps.',
    input: 'both',
    make: () => new Gap(),
  },
  {
    id: 'pairs',
    name: 'Pairs',
    skill: 'memory',
    blurb: 'Turn tiles two at a time. Remember where everything was.',
    how: 'Tap two tiles to turn them over. Matching shapes stay up; the others turn back. Three boards, each bigger. Fewer moves per pair is better; 1.00 is perfect.',
    input: 'pointer',
    make: () => new Pairs(),
  },
  {
    id: 'shape',
    name: 'Shape',
    skill: 'attention',
    blurb: 'The word says square. The outline is a circle.',
    how: 'Answer the shape of the outline: circle with the left hand, square with the right. The word inside often disagrees; ignore it. Later, an orange WORD cue means answer the word instead.',
    input: 'keys',
    minKeys: 2,
    make: () => new Shape(),
  },
];
