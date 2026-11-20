// Eighteenth batch: thinking you can see, and two to steer.
//   Probe  (reasoning) - a hidden rule says yes or no to shapes. Test it three times, then classify.
//   Plan   (reasoning) - jobs with lengths, deadlines and values. Put them in the best order.
//   Crack  (reasoning) - find the hidden code from right-place and wrong-place clues.
//   Shadow (attention) - keep your pointer on a wandering target; catch flashes at the edges.
//   Keep   (timing)    - steer a paddle to keep the balls in play. A second ball joins later.

import { COL_ACCENT, COL_DIM, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALL, SND_FALSE, SND_LURCH, SND_TAP_L, SND_TAP_R, SND_TAP_WEAK, SND_TONE } from '../audio.ts';
import { SHAPE_CIRCLE, SHAPE_CROSS, SHAPE_DIAMOND, SHAPE_SQUARE, SHAPE_TRIANGLE, type View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, clamp, footer, handLabel, header, mean, median, message, ms, pct, shuffle, sideOf, type Mini, type MiniDef, type MiniEnv, type MiniResult, scaled } from './kit.ts';

const TAU = Math.PI * 2;
const GREY = '#6c6c74';

function rint(lo: number, hi: number): number {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

type Rect = [number, number, number, number];

function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
}

// --- Probe ------------------------------------------------------------------------

interface Thing {
  shape: number;
  grey: boolean;
  count: number;
}

const P_SHAPES = [SHAPE_CIRCLE, SHAPE_SQUARE, SHAPE_TRIANGLE];
const P_NAMES = ['circle', 'square', 'triangle'];

function thingKey(t: Thing): string {
  return `${t.shape}${t.grey ? 'g' : 'w'}${t.count}`;
}

function allThings(): Thing[] {
  const out: Thing[] = [];
  for (const shape of P_SHAPES) for (const grey of [false, true]) for (let count = 1; count <= 3; count++) out.push({ shape, grey, count });
  return out;
}

interface Rule {
  test: (t: Thing) => boolean;
  text: string;
}

/** A hidden rule: one property at first, then two joined by and / or, or a "not". */
function makeRule(level: number): Rule {
  const atoms: Rule[] = [
    ...P_SHAPES.map((s, i) => ({ test: (t: Thing) => t.shape === s, text: `${P_NAMES[i]}s` })),
    { test: (t) => t.grey, text: 'grey ones' },
    { test: (t) => !t.grey, text: 'white ones' },
    { test: (t) => t.count === 1, text: 'singles' },
    { test: (t) => t.count >= 2, text: 'two or more' },
    { test: (t) => t.count === 3, text: 'threes' },
  ];
  const pick = () => atoms[rint(0, atoms.length - 1)]!;
  if (level < 2) return pick();
  const a = pick();
  let b = pick();
  while (b.text === a.text) b = pick();
  const k = level < 4 ? rint(0, 1) : rint(0, 2);
  if (k === 0) return { test: (t) => a.test(t) && b.test(t), text: `${a.text} that are also ${b.text}` };
  if (k === 1) return { test: (t) => a.test(t) || b.test(t), text: `${a.text}, or ${b.text}` };
  return { test: (t) => !a.test(t), text: `anything but ${a.text}` };
}

const PROBE_PUZZLES = 6;

class Probe implements Mini {
  private env!: MiniEnv;
  private level = 0;
  private rule: Rule = makeRule(0);
  private known: { t: Thing; yes: boolean }[] = [];
  private palette: Thing[] = [];
  private tests = 3;
  private quiz: Thing[] = [];
  private answers: boolean[] = [];
  private state = 0; // 0 testing, 1 classifying, 2 reveal
  private at = 0;
  private rects: Rect[] = [];
  private yesNo: Rect[] = [];
  private i = 0;
  private right = 0;
  private asked = 0;
  private perfect = 0;

  start(env: MiniEnv): void {
    this.env = env;
    this.make();
  }

  private make(): void {
    // A rule that splits the shapes into a reasonable yes / no mix.
    let all = allThings();
    do {
      this.rule = makeRule(this.level);
      const yes = all.filter(this.rule.test).length;
      if (yes >= 3 && yes <= all.length - 3) break;
    } while (true);
    all = shuffle(all);
    const yesOne = all.find(this.rule.test)!;
    const noOne = all.find((t) => !this.rule.test(t))!;
    this.known = [
      { t: yesOne, yes: true },
      { t: noOne, yes: false },
    ];
    const used = new Set([thingKey(yesOne), thingKey(noOne)]);
    const rest = all.filter((t) => !used.has(thingKey(t)));
    this.palette = rest.slice(0, 8);
    // Six to classify, from shapes not offered to test, balanced where possible.
    const pool = rest.slice(8);
    const ys = shuffle(pool.filter(this.rule.test));
    const ns = shuffle(pool.filter((t) => !this.rule.test(t)));
    this.quiz = shuffle([...ys.slice(0, 3), ...ns.slice(0, 3), ...pool].filter((t, k, arr) => arr.findIndex((u) => thingKey(u) === thingKey(t)) === k)).slice(0, 6);
    this.tests = 3;
    this.answers = [];
    this.state = 0;
  }

  private testThing(k: number): void {
    if (this.state !== 0 || this.tests <= 0 || k < 0 || k >= this.palette.length) return;
    const t = this.palette.splice(k, 1)[0]!;
    const yes = this.rule.test(t);
    this.known.push({ t, yes });
    this.tests--;
    this.env.sound(yes ? SND_TONE + 4 : SND_TONE + 1);
    if (this.tests === 0) this.state = 1;
  }

  private classify(yes: boolean, ts: number): void {
    if (this.state !== 1) return;
    const t = this.quiz[this.answers.length]!;
    this.answers.push(yes);
    const ok = yes === this.rule.test(t);
    this.asked++;
    if (ok) this.right++;
    this.env.sound(ok ? SND_TAP_R : SND_FALSE);
    if (this.answers.length >= this.quiz.length) {
      const allRight = this.quiz.every((q, k) => this.answers[k] === this.rule.test(q));
      if (allRight) {
        this.perfect++;
        this.level = Math.min(6, this.level + 1);
        this.env.sound(SND_CATCH);
      } else this.level = Math.max(0, this.level - 1);
      this.state = 2;
      this.at = ts + 3000;
      this.i++;
    }
  }

  press(slot: number, ts: number): void {
    const s = sideOf(slot);
    if (this.state === 1 && s) this.classify(s > 0, ts);
  }

  typeKey(code: string, ts: number): boolean {
    const m = /^(?:Digit|Numpad)([1-8])$/.exec(code);
    if (m && this.state === 0) {
      this.testThing(Number(m[1]) - 1);
      return true;
    }
    if (this.state === 2 && (code === 'Space' || code === 'Enter')) {
      this.at = ts;
      return true;
    }
    return false;
  }

  pointer(x: number, y: number, ts: number): void {
    if (this.state === 0) this.rects.forEach((r, k) => inRect(r, x, y) && this.testThing(k));
    else if (this.state === 1) this.yesNo.forEach((r, k) => inRect(r, x, y) && this.classify(k === 1, ts));
    else if (this.state === 2) this.at = ts;
  }

  private drawThing(v: View, t: Thing, cx: number, cy: number, s: number): void {
    v.ctx.fillStyle = t.grey ? GREY : COL_LINE;
    for (let k = 0; k < t.count; k++) v.shape(t.shape, cx + (k - (t.count - 1) / 2) * s * 0.3, cy, s * 0.12, true);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 2 && now >= this.at) {
      if (this.i >= scaled(PROBE_PUZZLES)) return true;
      this.make();
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'right', `${this.right} / ${this.asked}`, 'puzzle', `${Math.min(this.i + 1, scaled(PROBE_PUZZLES))} / ${scaled(PROBE_PUZZLES)}`);
    const s = Math.min(78 * a.u, (a.right - a.left) / 9);
    // What is known: yes on the left, no on the right.
    const ky = a.top + 26 * a.u;
    ctx.fillStyle = COL_MID;
    v.text('yes', a.cx - s * 3.2, ky, v.fontTiny, 'center');
    v.text('no', a.cx + s * 3.2, ky, v.fontTiny, 'center');
    const yes = this.known.filter((k) => k.yes);
    const no = this.known.filter((k) => !k.yes);
    yes.forEach((k, i) => this.drawThing(v, k.t, a.cx - s * (1.6 + (i % 3) * 1.1), ky + s * (0.7 + Math.floor(i / 3) * 0.8), s));
    no.forEach((k, i) => this.drawThing(v, k.t, a.cx + s * (1.6 + (i % 3) * 1.1), ky + s * (0.7 + Math.floor(i / 3) * 0.8), s));
    ctx.fillStyle = COL_DIM;
    ctx.fillRect(a.cx - dpr / 2, ky - 10 * a.u, dpr, s * 2.2);
    const mid = ky + s * 2.6;
    if (this.state === 0) {
      ctx.fillStyle = COL_LINE;
      v.text(`test ${this.tests} more: tap a shape (or press 1 to ${this.palette.length}) to see if the rule says yes`, a.cx, mid, v.fontTiny, 'center');
      const cols = 4;
      const w = s * 1.15;
      const x0 = a.cx - (cols * w) / 2;
      this.rects = this.palette.map((_, k) => [x0 + (k % cols) * w, mid + 14 * a.u + Math.floor(k / cols) * w * 0.8, w - 6 * dpr, w * 0.8 - 6 * dpr]);
      this.palette.forEach((t, k) => {
        const [x, y, rw, rh] = this.rects[k]!;
        ctx.strokeStyle = COL_DIM;
        ctx.lineWidth = dpr;
        ctx.strokeRect(x + 0.5, y + 0.5, rw, rh);
        this.drawThing(v, t, x + rw / 2, y + rh / 2, s);
        ctx.fillStyle = COL_DIM;
        v.text(String(k + 1), x + 8 * dpr, y + 14 * dpr, v.fontTiny, 'left');
      });
    } else {
      const k = Math.min(this.answers.length, this.quiz.length - 1);
      if (this.state === 1) {
        ctx.fillStyle = COL_LINE;
        v.text(`does the rule say yes to this one?  ·  ${this.answers.length + 1} of ${this.quiz.length}`, a.cx, mid, v.fontTiny, 'center');
        this.drawThing(v, this.quiz[k]!, a.cx, mid + s * 0.9, s * 1.3);
        const bw = 110 * a.u;
        const by = mid + s * 1.8;
        this.yesNo = [
          [a.cx - bw - 10 * a.u, by, bw, 44 * a.u],
          [a.cx + 10 * a.u, by, bw, 44 * a.u],
        ];
        ['no', 'yes'].forEach((label, i) => {
          const [x, y, w, h] = this.yesNo[i]!;
          ctx.strokeStyle = COL_MID;
          ctx.lineWidth = dpr;
          ctx.strokeRect(x + 0.5, y + 0.5, w, h);
          ctx.fillStyle = COL_LINE;
          v.text(`${label}  ${handLabel(this.env, i ? 1 : -1)}`, x + w / 2, y + h / 2 + 5 * dpr, v.fontHud, 'center');
        });
      } else {
        const got = this.quiz.filter((q, j) => this.answers[j] === this.rule.test(q)).length;
        message(v, { ...a, cy: mid + 20 * a.u }, `the rule: ${this.rule.text}`, `${got} of ${this.quiz.length} right  ·  space for the next`);
        this.quiz.forEach((q, j) => {
          const x = a.cx + (j - 2.5) * s * 1.1;
          this.drawThing(v, q, x, mid + s * 1.6, s * 0.9);
          ctx.fillStyle = this.answers[j] === this.rule.test(q) ? COL_LINE : COL_ACCENT;
          v.text(this.rule.test(q) ? 'yes' : 'no', x, mid + s * 2.3, v.fontTiny, 'center');
        });
      }
    }
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.right * 20 + this.perfect * 60,
      primary: { label: 'rules cracked', value: this.perfect, unit: `/ ${scaled(PROBE_PUZZLES)}` },
      lines: [
        { label: 'rules classified perfectly', value: `${this.perfect} of ${this.i}` },
        { label: 'shapes classified right', value: `${this.right} of ${this.asked}` },
        { label: 'accuracy', value: pct(this.right / (this.asked || 1)) },
      ],
      saved: this.i >= 2,
    };
  }
}

// --- Plan -------------------------------------------------------------------------

interface Job {
  len: number;
  due: number;
  value: number;
}

const PLAN_PUZZLES = 8;

function earned(jobs: Job[], order: number[]): number {
  let t = 0;
  let v = 0;
  for (const k of order) {
    t += jobs[k]!.len;
    if (t <= jobs[k]!.due) v += jobs[k]!.value;
  }
  return v;
}

function permutations(n: number): number[][] {
  if (n === 1) return [[0]];
  const out: number[][] = [];
  for (const p of permutations(n - 1)) for (let i = 0; i <= p.length; i++) out.push([...p.slice(0, i), n - 1, ...p.slice(i)]);
  return out;
}

class Plan implements Mini {
  private env!: MiniEnv;
  private jobs: Job[] = [];
  private order: number[] = [];
  private best = 0;
  private bestOrder: number[] = [];
  private state = 0; // 0 choosing, 1 reveal
  private at = 0;
  private i = 0;
  private shares: number[] = [];
  private optimal = 0;
  private rects: Rect[] = [];
  private undoRect: Rect = [0, 0, 0, 0];
  private shownAt = 0;
  private times: number[] = [];

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.make(now);
  }

  private make(now: number): void {
    const n = Math.min(6, 3 + Math.floor(this.i / 2));
    for (;;) {
      this.jobs = [];
      for (let k = 0; k < n; k++) this.jobs.push({ len: rint(1, 4), due: rint(2, n * 2 + 2), value: rint(1, 9) });
      let best = -1;
      let bestOrder: number[] = [];
      let worst = Infinity;
      for (const p of permutations(n)) {
        const e = earned(this.jobs, p);
        if (e > best) {
          best = e;
          bestOrder = p;
        }
        worst = Math.min(worst, e);
      }
      // Only puzzles where order matters.
      if (best > worst + 2) {
        this.best = best;
        this.bestOrder = bestOrder;
        break;
      }
    }
    this.order = [];
    this.state = 0;
    this.shownAt = now;
  }

  private pick(k: number, ts: number): void {
    if (this.state !== 0 || k < 0 || k >= this.jobs.length || this.order.includes(k)) return;
    this.order.push(k);
    this.env.sound(SND_TAP_R);
    if (this.order.length === this.jobs.length) {
      const e = earned(this.jobs, this.order);
      const share = e / this.best;
      this.shares.push(share);
      if (share >= 0.999) this.optimal++;
      this.times.push(ts - this.shownAt);
      this.env.sound(share >= 0.999 ? SND_CATCH : share >= 0.8 ? SND_TAP_WEAK : SND_FALSE);
      this.state = 1;
      this.at = ts + 3500;
      this.i++;
    }
  }

  press(): void {}

  typeKey(code: string, ts: number): boolean {
    const m = /^(?:Digit|Numpad)([1-6])$/.exec(code);
    if (m) {
      this.pick(Number(m[1]) - 1, ts);
      return true;
    }
    if (code === 'Backspace' && this.state === 0) {
      this.order.pop();
      return true;
    }
    if (this.state === 1 && (code === 'Space' || code === 'Enter')) {
      this.at = ts;
      return true;
    }
    return false;
  }

  pointer(x: number, y: number, ts: number): void {
    if (this.state === 1) {
      this.at = ts;
      return;
    }
    if (inRect(this.undoRect, x, y)) this.order.pop();
    this.rects.forEach((r, k) => inRect(r, x, y) && this.pick(k, ts));
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 1 && now >= this.at) {
      if (this.i >= scaled(PLAN_PUZZLES)) return true;
      this.make(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'best orders', `${this.optimal} / ${this.i}`, 'puzzle', `${Math.min(this.i + 1, scaled(PLAN_PUZZLES))} / ${scaled(PLAN_PUZZLES)}`);
    const n = this.jobs.length;
    const unit = Math.min(44 * a.u, (a.right - a.left - 120 * a.u) / 16);
    const x0 = a.cx - 7 * unit;
    const rowH = 40 * a.u;
    const top = a.top + 30 * a.u;
    ctx.fillStyle = COL_MID;
    v.text('job', x0 - 60 * a.u, top - 8 * a.u, v.fontTiny, 'left');
    // Each job: its length as a bar, its deadline as a tick, its value as a number.
    this.jobs.forEach((j, k) => {
      const y = top + k * rowH;
      const pickedAt = this.order.indexOf(k);
      this.rects[k] = [x0 - 64 * a.u, y, 14 * unit + 90 * a.u, rowH - 6 * dpr];
      ctx.fillStyle = pickedAt >= 0 ? COL_DIM : COL_LINE;
      v.text(String(k + 1), x0 - 48 * a.u, y + rowH / 2 + 4 * dpr, v.fontHud, 'center');
      ctx.fillStyle = pickedAt >= 0 ? COL_DIM : COL_MID;
      ctx.fillRect(x0, y + rowH * 0.3, j.len * unit, rowH * 0.35);
      ctx.fillStyle = COL_ACCENT;
      ctx.fillRect(x0 + j.due * unit - dpr, y + 4 * dpr, 2 * dpr, rowH - 14 * dpr);
      ctx.fillStyle = pickedAt >= 0 ? COL_DIM : COL_LINE;
      v.text(`${j.value}`, x0 + 14 * unit + 14 * a.u, y + rowH / 2 + 4 * dpr, v.fontHud, 'left');
      if (pickedAt >= 0) {
        ctx.fillStyle = COL_MID;
        // Its place in your order, after the value (beside the row number it crowded on phones).
        v.text(`#${pickedAt + 1}`, x0 + 14 * unit + 44 * a.u, y + rowH / 2 + 4 * dpr, v.fontTiny, 'left');
      }
    });
    ctx.fillStyle = COL_MID;
    v.text('value', x0 + 14 * unit + 14 * a.u, top - 8 * a.u, v.fontTiny, 'left');
    // The schedule you are building, on a time line.
    const ty = top + n * rowH + 30 * a.u;
    ctx.fillStyle = COL_DIM;
    ctx.fillRect(x0, ty + 18 * a.u, 14 * unit, dpr);
    for (let t = 0; t <= 14; t += 2) v.text(String(t), x0 + t * unit, ty + 34 * a.u, v.fontTiny, 'center');
    const show = this.state === 1 ? this.order : this.order;
    let t = 0;
    show.forEach((k) => {
      const j = this.jobs[k]!;
      const late = t + j.len > j.due;
      ctx.fillStyle = late ? COL_DIM : COL_LINE;
      ctx.fillRect(x0 + t * unit + dpr, ty, j.len * unit - 2 * dpr, 16 * a.u);
      ctx.fillStyle = late ? COL_MID : '#0a0a0b';
      v.text(String(k + 1), x0 + (t + j.len / 2) * unit, ty + 12 * a.u, v.fontTiny, 'center');
      t += j.len;
    });
    this.undoRect = [a.right - 90 * a.u, ty, 90 * a.u, 30 * a.u];
    if (this.state === 0) {
      ctx.fillStyle = COL_MID;
      v.text('undo  ⌫', a.right - 45 * a.u, ty + 14 * a.u, v.fontTiny, 'center');
      if (this.i === 0) v.text('pick the order to do the jobs (tap or press 1 to 6). a job earns its value only if it ends by its orange deadline', a.cx, a.bottom - 14 * a.u, v.fontTiny, 'center');
    } else {
      const e = earned(this.jobs, this.order);
      message(v, { ...a, cy: ty + 70 * a.u }, `earned ${e} of a possible ${this.best}`, e >= this.best ? 'best possible  ·  space for the next' : `a best order: ${this.bestOrder.map((k) => k + 1).join(' ')}  ·  space for the next`);
    }
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: Math.round(mean(this.shares) * 400 + this.optimal * 50),
      primary: { label: 'share of the best possible', value: Math.round(mean(this.shares) * 100), unit: '%' },
      lines: [
        { label: 'value earned, as a share of the best', value: pct(mean(this.shares)) },
        { label: 'best possible orders found', value: `${this.optimal} of ${this.i}` },
        { label: 'median time per plan', value: this.times.length ? `${(median(this.times) / 1000).toFixed(1)} s` : '–' },
      ],
      saved: this.i >= 2,
    };
  }
}

// --- Crack ------------------------------------------------------------------------

const C_SHAPES = [SHAPE_CIRCLE, SHAPE_SQUARE, SHAPE_TRIANGLE, SHAPE_DIAMOND, SHAPE_CROSS];
const CRACK_CODES = 5;
const CRACK_TRIES = 8;

class Crack implements Mini {
  private env!: MiniEnv;
  private len = 3;
  private secret: number[] = [];
  private rows: { guess: number[]; exact: number; near: number }[] = [];
  private cur: number[] = [];
  private state = 0; // 0 guessing, 1 reveal
  private at = 0;
  private i = 0;
  private solved = 0;
  private tries: number[] = [];
  private keys: Rect[] = [];
  private del: Rect = [0, 0, 0, 0];
  private ok: Rect = [0, 0, 0, 0];
  private won = false;
  private shownAt = 0;
  private now = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.now = now;
    this.make();
  }

  private make(): void {
    this.shownAt = this.now;
    this.len = this.i >= 3 ? 4 : 3;
    this.secret = shuffle([0, 1, 2, 3, 4]).slice(0, this.len);
    this.rows = [];
    this.cur = [];
    this.state = 0;
  }

  private add(k: number): void {
    if (this.state !== 0 || this.cur.length >= this.len || this.cur.includes(k)) return;
    this.cur.push(k);
    this.env.sound(SND_TONE + k);
  }

  private submit(ts: number): void {
    if (this.state !== 0 || this.cur.length !== this.len) return;
    const g = this.cur;
    const exact = g.filter((x, k) => this.secret[k] === x).length;
    const near = g.filter((x, k) => this.secret[k] !== x && this.secret.includes(x)).length;
    this.rows.push({ guess: g, exact, near });
    this.cur = [];
    if (exact === this.len || this.rows.length >= CRACK_TRIES) {
      this.won = exact === this.len;
      if (this.won) {
        this.solved++;
        this.tries.push(this.rows.length);
        this.env.sound(SND_CATCH);
      } else this.env.sound(SND_FALSE);
      this.i++;
      this.state = 1;
      this.at = ts + 2600;
    } else this.env.sound(SND_TAP_R);
  }

  press(): void {}

  typeKey(code: string, ts: number): boolean {
    const m = /^(?:Digit|Numpad)([1-5])$/.exec(code);
    if (m) {
      this.add(Number(m[1]) - 1);
      return true;
    }
    if (code === 'Backspace') {
      this.cur.pop();
      return true;
    }
    if (code === 'Enter' || code === 'Space') {
      if (this.state === 1) this.at = ts;
      else this.submit(ts);
      return true;
    }
    return false;
  }

  pointer(x: number, y: number, ts: number): void {
    if (this.state === 1) {
      this.at = ts;
      return;
    }
    this.keys.forEach((r, k) => inRect(r, x, y) && this.add(k));
    if (inRect(this.del, x, y)) this.cur.pop();
    if (inRect(this.ok, x, y)) this.submit(ts);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    this.now = now;
    // Under two minutes per code: plenty to think, but it does end.
    if (this.state === 0 && now - this.shownAt > 110000) {
      this.won = false;
      this.i++;
      this.state = 1;
      this.at = now + 2600;
      this.env.sound(SND_FALSE);
    }
    if (this.state === 1 && now >= this.at) {
      if (this.i >= scaled(CRACK_CODES)) return true;
      this.make();
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'cracked', `${this.solved} / ${this.i}`, 'tries left', String(CRACK_TRIES - this.rows.length));
    const s = Math.min(40 * a.u, (a.bottom - a.top) / 16);
    const x0 = a.cx - (this.len * s * 1.2) / 2 - s;
    let y = a.top + 16 * a.u;
    const drawRow = (g: number[], yy: number, exact = -1, near = -1) => {
      for (let k = 0; k < this.len; k++) {
        const x = x0 + k * s * 1.2 + s / 2;
        ctx.strokeStyle = COL_DIM;
        ctx.lineWidth = dpr;
        ctx.strokeRect(x - s / 2 + 0.5, yy, s, s);
        if (g[k] !== undefined) {
          ctx.fillStyle = COL_LINE;
          v.shape(C_SHAPES[g[k]!]!, x, yy + s / 2, s * 0.28, true);
        }
      }
      if (exact >= 0) {
        // Clues: white for right shape, right place; grey for right shape, wrong place.
        const cx = x0 + this.len * s * 1.2 + s * 0.6;
        for (let k = 0; k < exact + near; k++) {
          ctx.fillStyle = k < exact ? COL_LINE : GREY;
          ctx.beginPath();
          ctx.arc(cx + k * s * 0.45, yy + s / 2, s * 0.14, 0, TAU);
          ctx.fill();
        }
      }
    };
    for (const r of this.rows) {
      drawRow(r.guess, y, r.exact, r.near);
      y += s * 1.15;
    }
    if (this.state === 0) {
      drawRow(this.cur, y);
      ctx.strokeStyle = COL_ACCENT;
      ctx.strokeRect(x0 - 6 * dpr, y - 4 * dpr, this.len * s * 1.2 + 6 * dpr, s + 8 * dpr);
    } else {
      ctx.fillStyle = COL_MID;
      v.text(this.won ? `cracked in ${this.rows.length}` : 'the code was', a.cx, y + s * 0.4, v.fontTiny, 'center');
      drawRow(this.secret, y + s * 0.7);
    }
    // Shape keypad.
    const ky = a.bottom - s * 2.4;
    const kw = s * 1.3;
    const kx0 = a.cx - (5 * kw + 2 * kw * 1.3) / 2;
    this.keys = C_SHAPES.map((_, k) => [kx0 + k * kw, ky, kw - 6 * dpr, kw - 6 * dpr]);
    C_SHAPES.forEach((sh, k) => {
      const [x, yy, w] = this.keys[k]!;
      ctx.strokeStyle = this.cur.includes(k) ? COL_DIM : COL_MID;
      ctx.lineWidth = dpr;
      ctx.strokeRect(x + 0.5, yy + 0.5, w, w);
      ctx.fillStyle = this.cur.includes(k) ? COL_DIM : COL_LINE;
      v.shape(sh, x + w / 2, yy + w / 2, w * 0.22, true);
      ctx.fillStyle = COL_DIM;
      v.text(String(k + 1), x + w / 2, yy + w + 14 * dpr, v.fontTiny, 'center');
    });
    this.del = [kx0 + 5 * kw + 6 * dpr, ky, kw * 1.2, kw - 6 * dpr];
    this.ok = [kx0 + 5 * kw + kw * 1.3 + 6 * dpr, ky, kw * 1.2, kw - 6 * dpr];
    for (const [r, label] of [
      [this.del, 'del'],
      [this.ok, 'try'],
    ] as const) {
      ctx.strokeStyle = label === 'try' && this.cur.length === this.len ? COL_ACCENT : COL_MID;
      ctx.strokeRect(r[0] + 0.5, r[1] + 0.5, r[2], r[3]);
      ctx.fillStyle = COL_LINE;
      v.text(label, r[0] + r[2] / 2, r[1] + r[3] / 2 + 5 * dpr, v.fontTiny, 'center');
    }
    if (this.i === 0 && this.rows.length === 0) {
      ctx.fillStyle = COL_MID;
      v.text(`find the ${this.len} hidden shapes, all different, in order. white dot: right shape, right place. grey: right shape, wrong place`, a.cx, ky - 22 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.solved * 80 + this.tries.reduce((s, t) => s + (CRACK_TRIES - t) * 15, 0),
      primary: { label: 'codes cracked', value: this.solved, unit: `/ ${scaled(CRACK_CODES)}` },
      lines: [
        { label: 'codes cracked', value: `${this.solved} of ${this.i}` },
        { label: 'average tries when cracked', value: this.tries.length ? mean(this.tries).toFixed(1) : '–' },
      ],
      saved: this.i >= 1,
    };
  }
}

// --- Shadow -----------------------------------------------------------------------

const SHADOW_MS = 60000;

class Shadow implements Mini {
  private env!: MiniEnv;
  private t0 = 0;
  private px = -1;
  private py = -1;
  private onFrames = 0;
  private allFrames = 0;
  private flashes: { x: number; y: number; at: number; caught: boolean }[] = [];
  private nextFlash = 0;
  private caught = 0;
  private falses = 0;
  private rts: number[] = [];
  private seed = Math.random() * 100;
  /** Where the ring is, in canvas pixels. */
  ringX = 0;
  ringY = 0;
  private held = 0;
  private started = false;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.t0 = now + 600;
    this.nextFlash = now + 4000;
  }

  pointerMove(x: number, y: number): void {
    this.px = x;
    this.py = y;
    this.started = true;
  }

  pointer(x: number, y: number): void {
    this.pointerMove(x, y);
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const f = this.flashes.find((q) => !q.caught && ts >= q.at && ts - q.at < 900);
    if (f) {
      f.caught = true;
      this.caught++;
      this.rts.push(ts - f.at);
      this.env.sound(SND_CATCH);
    } else {
      this.falses++;
      this.env.sound(SND_TAP_WEAK);
    }
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  /** The target's path: a smooth wander inside the board, faster as time goes on. */
  private target(t: number): [number, number] {
    const s = this.seed;
    const k = 1 + t / 90000;
    const x = 0.5 * Math.sin(t * 0.00047 * k + s) + 0.3 * Math.sin(t * 0.00113 * k + s * 2);
    const y = 0.5 * Math.sin(t * 0.00061 * k + s * 3) + 0.3 * Math.sin(t * 0.00089 * k + s * 4);
    return [x / 0.8, y / 0.8];
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const t = now - this.t0;
    if (t > scaled(SHADOW_MS) + 600) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const R = Math.min((a.right - a.left) / 2 - 30 * a.u, (a.bottom - a.top) / 2 - 20 * a.u);
    const [tx, ty] = this.target(Math.max(0, t));
    const X = (this.ringX = a.cx + tx * R * 0.85);
    const Y = (this.ringY = a.cy + ty * R * 0.85);
    const ringR = 26 * a.u;
    const on = this.px >= 0 && Math.hypot(this.px - X, this.py - Y) < ringR;
    if (t >= 0 && t <= scaled(SHADOW_MS) && this.started) {
      this.allFrames++;
      if (on) this.onFrames++;
      // Flashes near the edge: press any key when you see one.
      if (now >= this.nextFlash) {
        const ang = Math.random() * TAU;
        this.flashes.push({ x: a.cx + Math.cos(ang) * R, y: a.cy + Math.sin(ang) * R * 0.9, at: now, caught: false });
        this.nextFlash = now + 2500 + Math.random() * 4000;
      }
    }
    header(v, touch, 'on target', this.allFrames ? pct(this.onFrames / this.allFrames) : '–', 'flashes', `${this.caught} / ${this.flashes.length}`);
    ctx.strokeStyle = COL_DIM;
    ctx.lineWidth = dpr;
    ctx.strokeRect(a.cx - R, a.cy - R * 0.95, R * 2, R * 1.9);
    ctx.strokeStyle = on ? COL_LINE : COL_MID;
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.arc(X, Y, ringR, 0, TAU);
    ctx.stroke();
    if (this.px >= 0) {
      ctx.fillStyle = COL_ACCENT;
      ctx.beginPath();
      ctx.arc(this.px, this.py, 4 * a.u, 0, TAU);
      ctx.fill();
    }
    for (const f of this.flashes) {
      if (now - f.at > 450 || f.caught) continue;
      ctx.fillStyle = COL_LINE;
      ctx.fillRect(f.x - 6 * a.u, f.y - 6 * a.u, 12 * a.u, 12 * a.u);
    }
    if (!this.started) message(v, a, 'keep the pointer inside the ring', 'and press any key when a square flashes at the edge', COL_MID);
    else {
      ctx.fillStyle = COL_DIM;
      ctx.fillRect(a.cx - 120 * a.u, a.bottom - 6 * a.u, 240 * a.u, dpr);
      ctx.fillStyle = COL_MID;
      ctx.fillRect(a.cx - 120 * a.u, a.bottom - 6 * a.u, 240 * a.u * clamp(t / scaled(SHADOW_MS), 0, 1), dpr);
    }
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const share = this.allFrames ? this.onFrames / this.allFrames : 0;
    const n = this.flashes.length;
    return {
      score: Math.max(0, Math.round(share * 600 + this.caught * 25 - this.falses * 10)),
      primary: { label: 'time on target', value: Math.round(share * 100), unit: '%' },
      lines: [
        { label: 'time on target', value: pct(share) },
        { label: 'flashes caught', value: `${this.caught} of ${n}` },
        { label: 'median time to catch a flash', value: ms(median(this.rts)) },
        { label: 'presses with no flash', value: String(this.falses) },
      ],
      rts: this.rts, saved: this.allFrames > 600,
    };
  }
}

// --- Keep -------------------------------------------------------------------------

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

class Keep implements Mini {
  private env!: MiniEnv;
  private x = 0.5;
  private balls: Ball[] = [];
  private hits = 0;
  private lives = 3;
  private last = 0;
  private time = 0;
  private over = false;
  private overAt = 0;
  private held = 0;
  private started = false;
  private flash = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.last = now;
    this.serve();
  }

  private serve(): void {
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.2;
    const sp = 0.55 + this.hits * 0.012;
    this.balls.push({ x: 0.2 + Math.random() * 0.6, y: 0.3, vx: Math.cos(ang) * sp, vy: Math.abs(Math.sin(ang)) * sp });
  }

  press(slot: number): void {
    this.held |= 1 << slot;
    this.started = true;
    this.env.sound(sideOf(slot) > 0 ? SND_TAP_R : SND_TAP_L);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const dt = Math.min(0.033, (now - this.last) / 1000);
    this.last = now;
    if (this.over && now >= this.overAt) return true;
    const pw = Math.max(0.12, 0.2 - this.hits * 0.002);
    if (!this.over && this.started) {
      this.time += dt;
      const l = (this.held & 0b111) !== 0 ? 1 : 0;
      const r = (this.held & 0b111000) !== 0 ? 1 : 0;
      this.x = clamp(this.x + (r - l) * 1.1 * dt, pw / 2, 1 - pw / 2);
      for (const b of this.balls) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.x < 0.02 || b.x > 0.98) {
          b.vx = -b.vx;
          b.x = clamp(b.x, 0.02, 0.98);
        }
        if (b.y < 0.02) {
          b.vy = Math.abs(b.vy);
          b.y = 0.02;
        }
        if (b.vy > 0 && b.y >= 0.93 && b.y < 0.97 && Math.abs(b.x - this.x) < pw / 2 + 0.015) {
          // Where it hits the paddle sets the bounce angle.
          const off = (b.x - this.x) / (pw / 2);
          const sp = Math.hypot(b.vx, b.vy) * 1.03;
          const ang = -Math.PI / 2 + off * 1.0;
          b.vx = Math.cos(ang) * sp;
          b.vy = Math.sin(ang) * sp;
          b.y = 0.93;
          this.hits++;
          this.env.sound(SND_TONE + (this.hits % 7));
          if (this.hits === 12 || this.hits === 35) this.serve();
        }
      }
      const lost = this.balls.filter((b) => b.y > 1.02);
      if (lost.length) {
        this.balls = this.balls.filter((b) => b.y <= 1.02);
        this.lives -= lost.length;
        this.flash = now;
        this.env.sound(SND_LURCH);
        if (this.lives <= 0) {
          this.over = true;
          this.overAt = now + 1300;
          this.env.sound(SND_FALL);
        } else if (!this.balls.length) this.serve();
      }
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'returns', String(this.hits), 'balls', String(this.balls.length), Math.max(0, this.lives));
    const S = Math.min(a.right - a.left, (a.bottom - a.top) * 1.2, 560 * a.u);
    const H = Math.min(a.bottom - a.top, S / 1.2);
    const x0 = a.cx - S / 2;
    const y0 = a.top + (a.bottom - a.top - H) / 2;
    ctx.strokeStyle = COL_DIM;
    ctx.lineWidth = dpr;
    ctx.beginPath();
    ctx.moveTo(x0, y0 + H);
    ctx.lineTo(x0, y0);
    ctx.lineTo(x0 + S, y0);
    ctx.lineTo(x0 + S, y0 + H);
    ctx.stroke();
    for (const b of this.balls) {
      ctx.fillStyle = COL_LINE;
      ctx.beginPath();
      ctx.arc(x0 + b.x * S, y0 + b.y * H, 6 * a.u, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = now - this.flash < 400 ? COL_MID : COL_ACCENT;
    ctx.fillRect(x0 + (this.x - pw / 2) * S, y0 + 0.95 * H, pw * S, 5 * dpr);
    if (!this.started) message(v, a, `hold ${handLabel(this.env, -1)} / ${handLabel(this.env, 1)} to move the paddle`, 'keep the ball in play. a second one joins later', COL_MID);
    if (this.over) message(v, a, `${this.hits} returns`, '');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.hits * 15,
      primary: { label: 'returns', value: this.hits, unit: '' },
      lines: [
        { label: 'returns', value: String(this.hits) },
        { label: 'lasted', value: `${this.time.toFixed(1)} s` },
      ],
      saved: this.hits >= 3,
    };
  }
}

export const BATCH18: MiniDef[] = [
  {
    id: 'probe',
    name: 'Probe',
    skill: 'reasoning',
    blurb: 'A hidden rule says yes or no to shapes. Test it three times, then classify.',
    how: 'You see one shape the rule accepts and one it rejects. Pick three more to test (tap, or press 1 to 8): choosing a useful test is the skill. Then say yes or no to six new shapes (left hand no, right hand yes, or tap). Rules start simple and combine later. Take your time.',
    input: 'both',
    minKeys: 2,
    make: () => new Probe(),
  },
  {
    id: 'plan',
    name: 'Plan',
    skill: 'reasoning',
    blurb: 'Jobs with lengths, deadlines and values. Put them in the best order.',
    how: 'Each job has a length (the bar), a deadline (the orange tick) and a value. Jobs run one after another in the order you pick (tap, or press 1 to 6; backspace to undo). A job earns its value only if it finishes by its deadline. Scored against the best order possible. Take your time.',
    input: 'pointer',
    make: () => new Plan(),
  },
  {
    id: 'crack',
    name: 'Crack',
    skill: 'reasoning',
    blurb: 'Find the hidden code from right-place and wrong-place clues.',
    how: 'The code is three shapes (later four), all different, in order. Enter a guess (tap the shapes or press 1 to 5, then try or Enter). A white dot means a right shape in the right place; grey means right shape, wrong place. Eight tries and just under two minutes per code.',
    input: 'pointer',
    make: () => new Crack(),
  },
  {
    id: 'shadow',
    name: 'Shadow',
    skill: 'attention',
    blurb: 'Keep your pointer on a wandering target. Catch flashes at the edges.',
    how: 'Move the mouse (or drag a finger) to keep the dot inside the wandering ring. Meanwhile, small squares flash at the edge of the board: press any key when you see one. Both count, so watch the ring without losing the edges. One minute.',
    input: 'pointer',
    make: () => new Shadow(),
  },
  {
    id: 'keep',
    name: 'Keep',
    skill: 'timing',
    blurb: 'Steer a paddle to keep the balls in play. A second one joins later.',
    how: 'Hold left or right to move the paddle and return the ball. Where it lands on the paddle sets the angle. It speeds up with every return, and a second ball joins at twelve. Three dropped balls end it.',
    input: 'keys',
    minKeys: 2,
    make: () => new Keep(),
  },
];
