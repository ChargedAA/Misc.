// Sixty-third batch.
//   Ripple   - a ring spreads from the middle; press as it reaches the line. Later it fades early.
//   Backward - squares light up in turn; click them back in reverse order.
//   Squeeze  - a block slides toward a gap in a wall: will it fit through?
//   Solve    - find x: x + 7 = 15, 3x = 21, 2x + 3 = 11.

import { COL_ACCENT, COL_FAINT, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALSE, SND_TAP_L, SND_TAP_R, SND_TAP_WEAK } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, handLabel, header, mean, median, ms, scaled, sideOf, Stair, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const TAU = Math.PI * 2;
const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const rint = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
type Rect = [number, number, number, number];
const inside = (r: Rect, x: number, y: number) => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
const digitOf = (code: string) => (code.startsWith('Digit') ? code.slice(5) : code.startsWith('Numpad') ? code.slice(6) : '');

// --- Ripple ----------------------------------------------------------------------------

const RIPPLE_TRIALS = 20;

class Ripple implements Mini {
  private env!: MiniEnv;
  private trial = 0;
  /** The target line's radius and the ring's speed, as shares of the field's half-height. */
  private target = 0.7;
  private speed = 0.4;
  /** The ring fades out past this share of the target (1 = never). */
  private fade = 1;
  private born = 0;
  private state = 0; // 0 gap, 1 spreading, 2 result
  private at = 0;
  private errs: number[] = [];
  private last = 0;
  private held = 0;
  private firstAt = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.firstAt = now;
    this.at = now + 700;
  }

  private arm(now: number): void {
    this.target = rnd(0.45, 0.9);
    this.speed = rnd(0.3, 0.7);
    this.fade = this.trial < 6 ? 1 : rnd(0.35, 0.65);
    this.born = now;
    this.state = 1;
  }

  private due(): number {
    return this.born + (this.target / this.speed) * 1000;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (this.state !== 1) return;
    this.finish(ts - this.due(), ts);
  }

  private finish(err: number, now: number): void {
    this.last = err;
    this.errs.push(Math.abs(err));
    this.env.sound(Math.abs(err) < 40 ? SND_CATCH : SND_TAP_WEAK);
    this.trial++;
    this.state = 2;
    this.at = now + 1000;
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  pointer(_x: number, _y: number, ts: number): void {
    this.press(0, ts);
    this.release(0);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.at) this.arm(now);
    if (this.state === 1 && now > this.due() + 600) this.finish(600, now);
    if (this.state === 2 && now >= this.at) {
      if (this.trial >= scaled(RIPPLE_TRIALS)) return true;
      this.state = 0;
      this.at = now + rnd(400, 900);
    }
    if (now - this.firstAt > 600000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'typical miss', this.errs.length ? ms(median(this.errs)) : '–', 'ring', `${Math.min(this.trial + 1, scaled(RIPPLE_TRIALS))} / ${scaled(RIPPLE_TRIALS)}`);
    const R = (a.bottom - a.top) / 2 - 20 * a.u;
    const cy = a.cy - 6 * a.u;
    ctx.strokeStyle = COL_ACCENT;
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.arc(a.cx, cy, this.target * R, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = COL_LINE;
    ctx.beginPath();
    ctx.arc(a.cx, cy, 4 * dpr, 0, TAU);
    ctx.fill();
    if (this.state === 1) {
      const r = (((now - this.born) / 1000) * this.speed);
      const vis = r < this.target * this.fade ? 1 : Math.max(0, 1 - (r - this.target * this.fade) / 0.05);
      if (vis > 0) {
        ctx.globalAlpha = vis;
        ctx.strokeStyle = COL_LINE;
        ctx.lineWidth = 3 * dpr;
        ctx.beginPath();
        ctx.arc(a.cx, cy, r * R, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    ctx.fillStyle = COL_MID;
    const msg = this.state === 2 ? (this.last === 600 ? 'no press' : `${this.last < 0 ? 'early' : 'late'} by ${ms(Math.abs(this.last))}`) : this.trial === 0 ? 'press any key (or tap) as the white ring reaches the orange line' : this.trial === 6 && this.state !== 1 ? 'from now on the ring fades before it gets there' : '';
    v.text(msg, a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const m = median(this.errs);
    return {
      score: this.errs.length ? Math.max(0, Math.round((300 - m) * 6)) : 0,
      primary: { label: 'typical miss', value: m, unit: 'ms', lower: true },
      lines: [
        { label: 'typical miss', value: this.errs.length ? ms(m) : '–' },
        { label: 'average miss', value: this.errs.length ? ms(mean(this.errs)) : '–' },
        { label: 'within 40 ms', value: String(this.errs.filter((e) => e < 40).length) },
      ],
      saved: this.errs.length >= 5,
    };
  }
}

// --- Backward (reverse spatial span) ---------------------------------------------------

const BACK_LIVES = 3;
const G = 4;

class Backward implements Mini {
  private env!: MiniEnv;
  private span = 3;
  private seq: number[] = [];
  private got: number[] = [];
  private state = 0; // 0 showing, 1 answering, 2 feedback
  private at = 0;
  private lives = BACK_LIVES;
  private best = 0;
  private streak = 0;
  private cells: Rect[] = [];
  private lastOk = true;
  private rounds = 0;
  private firstAt = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.firstAt = now;
    this.arm(now);
  }

  private arm(now: number): void {
    this.seq = [];
    while (this.seq.length < this.span) {
      const k = rint(0, G * G - 1);
      if (this.seq[this.seq.length - 1] !== k && !this.seq.includes(k)) this.seq.push(k);
    }
    this.got = [];
    this.state = 0;
    this.at = now + 600;
  }

  press(): void {}

  pointer(x: number, y: number, ts: number): void {
    if (this.state !== 1) return;
    const k = this.cells.findIndex((r) => inside(r, x, y));
    if (k < 0) return;
    const want = this.seq[this.seq.length - 1 - this.got.length]!;
    this.got.push(k);
    if (k !== want) {
      this.lastOk = false;
      this.lives--;
      this.streak = 0;
      this.env.sound(SND_FALSE);
      this.rounds++;
      this.state = 2;
      this.at = ts + 1500;
      return;
    }
    this.env.sound(SND_TAP_WEAK);
    if (this.got.length === this.seq.length) {
      this.lastOk = true;
      this.best = Math.max(this.best, this.span);
      if (++this.streak >= 2) {
        this.span = Math.min(10, this.span + 1);
        this.streak = 0;
      }
      this.env.sound(SND_CATCH);
      this.rounds++;
      this.state = 2;
      this.at = ts + 700;
    }
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const per = 700;
    if (this.state === 0 && now >= this.at + this.seq.length * per) this.state = 1;
    if (this.state === 2 && now >= this.at) {
      if (this.lives <= 0) return true;
      this.arm(now);
    }
    if (now - this.firstAt > 900000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'span', String(this.span), 'best', this.best ? String(this.best) : '–', this.lives, BACK_LIVES);
    const S = Math.min(a.right - a.left, a.bottom - a.top - 50 * a.u);
    const s = S / G;
    const x0 = a.cx - S / 2;
    const y0 = a.cy - S / 2 - 10 * a.u;
    const lit = this.state === 0 ? Math.floor((now - this.at) / per) : -1;
    const into = this.state === 0 ? (now - this.at) % per : 0;
    this.cells = [];
    for (let k = 0; k < G * G; k++) {
      const r: Rect = [x0 + (k % G) * s + 4 * dpr, y0 + Math.floor(k / G) * s + 4 * dpr, s - 8 * dpr, s - 8 * dpr];
      this.cells.push(r);
      const showing = lit >= 0 && lit < this.seq.length && this.seq[lit] === k && into < per * 0.75;
      const picked = this.state >= 1 && this.got.includes(k);
      const wrong = this.state === 2 && !this.lastOk && this.got[this.got.length - 1] === k;
      ctx.fillStyle = showing ? COL_LINE : wrong ? COL_ACCENT : picked ? '#5a5a62' : '#16161a';
      ctx.fillRect(...r);
    }
    ctx.fillStyle = COL_MID;
    v.text(this.state === 0 ? 'watch the order' : this.state === 1 ? 'now click them in reverse: last one first' : this.lastOk ? '' : 'wrong square', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.best * 100,
      primary: { label: 'longest run reversed', value: this.best, unit: 'squares' },
      lines: [
        { label: 'longest reversed', value: this.best ? `${this.best} squares` : '–' },
        { label: 'runs played', value: String(this.rounds) },
      ],
      saved: this.rounds >= 2,
    };
  }
}

// --- Squeeze ---------------------------------------------------------------------------

const SQUEEZE_TRIALS = 30;

class Squeeze implements Mini {
  private env!: MiniEnv;
  /** How different the block's height is from the gap, in percent. */
  private readonly diff = new Stair(30, 3, 2, 50, 2);
  private levels: number[] = [];
  private trial = 0;
  private gap = 0.3;
  private gapY = 0.5;
  private bw = 0.2;
  private bh = 0.2;
  private by = 0.5;
  private fits = true;
  private state = 0;
  private at = 0;
  private right = 0;
  private lastOk = true;
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.make(now);
  }

  private make(now: number): void {
    this.fits = Math.random() < 0.5;
    this.gap = rnd(0.18, 0.4);
    this.gapY = rnd(0.25, 0.75);
    const d = this.diff.level / 100;
    this.bh = this.gap * (this.fits ? 1 - d : 1 + d);
    // Width varies freely, so the block's area is no guide.
    this.bw = this.bh * rnd(0.5, 2.2);
    this.by = Math.min(0.85, Math.max(0.15, this.gapY + rnd(-0.3, 0.3)));
    this.state = 0;
    this.at = now;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (s === 0 || this.state !== 0) return;
    const ok = (s > 0) === this.fits;
    this.lastOk = ok;
    this.levels.push(this.diff.level);
    this.diff.update(ok, -1);
    if (ok) this.right++;
    this.env.sound(ok ? (s < 0 ? SND_TAP_L : SND_TAP_R) : SND_FALSE);
    this.trial++;
    this.state = 1;
    this.at = ts + (ok ? 400 : 1000);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 1 && now >= this.at) {
      if (this.trial >= scaled(SQUEEZE_TRIALS)) return true;
      this.make(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'difference', `${this.diff.level}%`, 'block', `${Math.min(this.trial + 1, scaled(SQUEEZE_TRIALS))} / ${scaled(SQUEEZE_TRIALS)}`);
    const H = a.bottom - a.top - 60 * a.u;
    const top = a.top + 10 * a.u;
    const wallX = a.cx + Math.min(200 * a.u, (a.right - a.left) / 3);
    // The wall with its gap.
    ctx.fillStyle = '#3a3a41';
    const g0 = top + (this.gapY - this.gap / 2) * H;
    const g1 = top + (this.gapY + this.gap / 2) * H;
    ctx.fillRect(wallX, top, 16 * a.u, g0 - top);
    ctx.fillRect(wallX, g1, 16 * a.u, top + H - g1);
    // The block, off to the left, sliding straight across.
    const bx = a.cx - Math.min(200 * a.u, (a.right - a.left) / 3);
    const bwPx = this.bw * H;
    const bhPx = this.bh * H;
    const byPx = top + this.by * H;
    let dx = 0;
    let dy = 0;
    if (this.state === 1) {
      // Show the answer: the block lined up with the gap.
      dx = wallX - bwPx - 6 * a.u - (bx - bwPx / 2);
      dy = top + this.gapY * H - byPx;
    }
    ctx.fillStyle = this.state === 1 ? (this.fits ? COL_LINE : COL_ACCENT) : '#c8c8ce';
    ctx.fillRect(bx - bwPx / 2 + dx, byPx - bhPx / 2 + dy, bwPx, bhPx);
    ctx.strokeStyle = COL_FAINT;
    ctx.lineWidth = dpr;
    ctx.setLineDash?.([4 * dpr, 6 * dpr]);
    ctx.beginPath();
    ctx.moveTo(bx + bwPx / 2 + 6 * a.u, byPx);
    ctx.lineTo(wallX - 10 * a.u, byPx);
    ctx.stroke();
    ctx.setLineDash?.([]);
    ctx.fillStyle = this.state === 1 && !this.lastOk ? COL_ACCENT : COL_MID;
    v.text(this.state === 1 && !this.lastOk ? (this.fits ? 'it would have fitted' : 'too tall for the gap') : 'could the block fit through the gap, if lined up with it?', a.cx, a.bottom - 34 * a.u, v.fontTiny, 'center');
    const off = Math.min(200 * a.u, (a.right - a.left) / 2 - 30 * a.u);
    ctx.fillStyle = COL_MID;
    v.text(`${handLabel(this.env, -1)}  no`, a.cx - off, a.bottom - 6 * a.u, v.fontTiny, 'center');
    v.text(`fits  ${handLabel(this.env, 1)}`, a.cx + off, a.bottom - 6 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const th = this.levels.length >= 10 ? mean(this.levels.slice(-12)) : 0;
    return {
      score: th ? Math.max(0, Math.round((52 - th) * 40 + this.right * 5)) : 0,
      primary: { label: 'smallest difference you see', value: Math.round(th), unit: '%', lower: true },
      lines: [
        { label: 'threshold (last 12 blocks)', value: th ? `${th.toFixed(0)}%` : '–' },
        { label: 'right', value: `${this.right} of ${this.trial}` },
      ],
      saved: this.trial >= 10,
    };
  }
}

// --- Solve -----------------------------------------------------------------------------

const SOLVE_MS = 60000;

class Solve implements Mini {
  private env!: MiniEnv;
  private q = '';
  private x = 0;
  private typed = '';
  private neg = false;
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

  private make(now: number): void {
    const hard = this.ok >= 8;
    const x = rint(hard ? -9 : 1, hard ? 15 : 12) || 3;
    const a = rint(2, 9);
    const b = rint(1, 20);
    const kind = rint(0, hard ? 4 : 2);
    const sign = (n: number) => (n < 0 ? `− ${-n}` : `+ ${n}`);
    if (kind === 0) this.q = `x ${sign(b)} = ${x + b}`;
    else if (kind === 1) this.q = `${a}x = ${a * x}`;
    else if (kind === 2) this.q = `x − ${b} = ${x - b}`;
    else if (kind === 3) this.q = `${a}x ${sign(b)} = ${a * x + b}`;
    else this.q = `${a}x − ${b} = ${a * x - b}`;
    this.x = x;
    this.typed = '';
    this.neg = false;
    this.at = now;
  }

  press(): void {}

  typeKey(code: string, ts: number): boolean {
    if (!this.started) {
      if (code === 'Space' || code === 'Enter' || digitOf(code)) {
        this.started = true;
        this.t0 = ts;
        this.make(ts);
        return true;
      }
      return false;
    }
    const d = digitOf(code);
    if (d) {
      if (this.typed.length < 3) this.typed += d;
      return true;
    }
    if (code === 'Minus' || code === 'NumpadSubtract') {
      this.neg = !this.neg;
      return true;
    }
    if (code === 'Backspace') {
      if (this.typed) this.typed = this.typed.slice(0, -1);
      else this.neg = false;
      return true;
    }
    if ((code === 'Enter' || code === 'NumpadEnter' || code === 'Space') && this.typed) {
      const got = Number(this.typed) * (this.neg ? -1 : 1);
      if (got === this.x) {
        this.ok++;
        this.rts.push(ts - this.at);
        this.env.sound(SND_CATCH);
      } else {
        this.bad++;
        this.note = `${this.q}: x = ${this.x}`;
        this.flash = ts + 1500;
        this.env.sound(SND_FALSE);
      }
      this.make(ts);
      return true;
    }
    return false;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    const len = scaled(SOLVE_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'solved', String(this.ok), 'time', `${left} s`);
    ctx.font = `600 ${Math.round(40 * a.u)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COL_LINE;
    ctx.fillText(this.started ? this.q : 'find x', a.cx, a.cy - 50 * a.u);
    if (this.started) {
      ctx.fillStyle = COL_MID;
      ctx.fillText(`x = ${this.neg ? '−' : ''}${this.typed || '_'}`, a.cx, a.cy + 20 * a.u);
    }
    if (now < this.flash) {
      ctx.fillStyle = COL_ACCENT;
      v.text(this.note, a.cx, a.cy + 70 * a.u, v.fontTiny, 'center');
    }
    ctx.fillStyle = COL_MID;
    v.text(this.started ? 'type x, then Enter (minus key for negatives)' : 'press Space to start: solve for x, as many as you can in a minute', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: Math.max(0, this.ok * 40 - this.bad * 30),
      primary: { label: 'solved in a minute', value: this.ok, unit: '' },
      lines: [
        { label: 'solved', value: String(this.ok) },
        { label: 'wrong', value: String(this.bad) },
        { label: 'typical time an equation', value: this.rts.length ? ms(median(this.rts)) : '–' },
      ],
      saved: this.ok + this.bad >= 3,
    };
  }
}

export const BATCH63: MiniDef[] = [
  { id: 'ripple', name: 'Ripple', skill: 'timing', blurb: 'A ring spreads from the middle. Press as it reaches the line.', how: 'A white ring spreads out from the middle at its own speed. Press any key (or tap) as it reaches the orange circle. From the seventh ring on it fades out before it gets there, so you have to carry its speed in your head. Twenty rings; scored on your typical miss.', input: 'both', make: () => new Ripple() },
  { id: 'backward', name: 'Backward', skill: 'memory', blurb: 'Squares light up in turn. Click them back in reverse order.', how: 'Squares on a grid light up one after another. Then click them back in reverse: the last one first. Two right in a row and the run grows by one. Three mistakes and it ends. Scored on the longest run you reversed.', input: 'pointer', make: () => new Backward() },
  { id: 'squeeze', name: 'Squeeze', skill: 'judgement', blurb: 'A block and a gap in a wall. Would it fit through?', how: 'A block on the left, a wall with a gap on the right, at different heights. If the block slid across lined up with the gap, would it fit? Only its height matters, not its width. Right for yes, left for no. Get them right and the difference shrinks. Thirty blocks.', input: 'keys', minKeys: 2, make: () => new Squeeze() },
  { id: 'solve', name: 'Solve', skill: 'reasoning', blurb: 'Find x: x + 7 = 15, 3x = 21, 2x + 3 = 11.', how: 'An equation with one unknown. Type x and press Enter (the minus key makes it negative). One-step equations first; after eight right, two-step ones and negative answers. A minute; a mistake shows the answer. Needs a keyboard.', input: 'type', make: () => new Solve() },
];
