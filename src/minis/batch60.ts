// Sixtieth batch.
//   Doors   - sliding doors open and shut; set off so you arrive while they are open.
//   Mover   - a field of still dots; one starts to creep. Click it.
//   Dense   - two boxes of dots, different sizes: which is more crowded?
//   Percent - quick percentages: 15% of 80, or what share 12 is of 48.

import { COL_ACCENT, COL_DIM, COL_FAINT, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALL, SND_FALSE, SND_TAP_L, SND_TAP_R, SND_TAP_WEAK } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, foreperiod, handLabel, header, mean, median, ms, pct, scaled, shuffle, sideOf, Stair, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const TAU = Math.PI * 2;
const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const rint = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
type Rect = [number, number, number, number];
const inside = (r: Rect, x: number, y: number) => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
const digitOf = (code: string) => (code.startsWith('Digit') ? code.slice(5) : code.startsWith('Numpad') ? code.slice(6) : '');

// --- Doors -----------------------------------------------------------------------------

const DOORS_ROUNDS = 15;

class Doors implements Mini {
  private env!: MiniEnv;
  private round = 0;
  /** Door cycle (ms) and the share of it the doors are open; the phase it starts at. */
  private cycle = 2400;
  private openShare = 0.4;
  private phase0 = 0;
  /** How long the walk to the door takes (ms). */
  private walk = 1500;
  private setOff = 0;
  /** 0 waiting, 1 walking, 2 result. */
  private state = 0;
  private at = 0;
  private passed = 0;
  private margins: number[] = [];
  private lastOk = true;
  private lastNote = '';
  private held = 0;
  private firstAt = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.firstAt = now;
    this.arm(now);
  }

  private arm(now: number): void {
    this.cycle = rnd(1800, 3200) * Math.max(0.6, 1 - this.round * 0.02);
    this.openShare = Math.max(0.18, 0.4 - this.round * 0.015);
    this.phase0 = now - rnd(0, this.cycle);
    this.walk = rnd(900, 2400);
    this.state = 0;
  }

  /** How open the doors are at a moment, 0 shut to 1 wide open, easing at each end. */
  private open(t: number): number {
    const p = (((t - this.phase0) % this.cycle) + this.cycle) % this.cycle / this.cycle;
    const o = this.openShare;
    const ease = 0.12;
    if (p < ease) return p / ease;
    if (p < ease + o) return 1;
    if (p < 2 * ease + o) return 1 - (p - ease - o) / ease;
    return 0;
  }

  /** How far into the fully open stretch an arrival lands: 0 at either edge, 0.5 in the middle. */
  private margin(t: number): number {
    const p = (((t - this.phase0) % this.cycle) + this.cycle) % this.cycle / this.cycle;
    const ease = 0.12;
    if (p < ease || p > ease + this.openShare) return -1;
    const q = (p - ease) / this.openShare;
    return Math.min(q, 1 - q);
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (this.state !== 0) return;
    this.setOff = ts;
    this.state = 1;
    this.env.sound(SND_TAP_WEAK);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  pointer(_x: number, _y: number, ts: number): void {
    this.press(0, ts);
    this.release(0);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 1 && now >= this.setOff + this.walk) {
      const arrive = this.setOff + this.walk;
      const m = this.margin(arrive);
      this.lastOk = m >= 0;
      if (this.lastOk) {
        this.passed++;
        this.margins.push(m);
        this.lastNote = m > 0.3 ? 'straight through' : 'just made it';
        this.env.sound(SND_CATCH);
      } else {
        this.margins.push(0);
        this.lastNote = this.open(arrive) > 0 ? 'clipped by the doors' : 'walked into shut doors';
        this.env.sound(SND_FALL);
      }
      this.round++;
      this.state = 2;
      this.at = now + 1200;
    }
    if (this.state === 2 && now >= this.at) {
      if (this.round >= scaled(DOORS_ROUNDS)) return true;
      this.arm(now);
    }
    if (now - this.firstAt > 600000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'through', `${this.passed} of ${this.round}`, 'door', `${Math.min(this.round + 1, scaled(DOORS_ROUNDS))} / ${scaled(DOORS_ROUNDS)}`);
    // A corridor from the left to the doors on the right; the walk's length is drawn to scale.
    const W = Math.min(a.right - a.left - 40 * a.u, 700 * a.u);
    const doorX = a.cx + W / 2 - 40 * a.u;
    const startX = doorX - (this.walk / 2400) * (W - 80 * a.u);
    const floor = a.cy + 50 * a.u;
    const dh = 150 * a.u;
    ctx.fillStyle = COL_FAINT;
    ctx.fillRect(a.cx - W / 2, floor, W, 2 * dpr);
    // The start mark.
    ctx.fillStyle = COL_DIM;
    ctx.fillRect(startX - dpr, floor - 10 * a.u, 2 * dpr, 20 * a.u);
    // The doors, sliding apart from the middle.
    const o = this.state === 2 ? this.open(this.setOff + this.walk) : this.open(now);
    const gap = o * 26 * a.u;
    ctx.fillStyle = '#3a3a41';
    ctx.fillRect(doorX - 26 * a.u - gap, floor - dh, 26 * a.u, dh);
    ctx.fillRect(doorX + gap, floor - dh, 26 * a.u, dh);
    ctx.fillStyle = o >= 0.999 ? COL_LINE : COL_DIM;
    ctx.fillRect(doorX - 30 * a.u, floor - dh - 6 * a.u, 60 * a.u, 3 * dpr);
    // The walker.
    let wx = startX;
    if (this.state === 1) wx = startX + ((now - this.setOff) / this.walk) * (doorX - startX);
    else if (this.state === 2) wx = doorX - (this.lastOk ? -40 * a.u : 14 * a.u);
    ctx.fillStyle = this.state === 2 && !this.lastOk ? COL_ACCENT : COL_LINE;
    ctx.beginPath();
    ctx.arc(wx, floor - 46 * a.u, 9 * a.u, 0, TAU);
    ctx.fill();
    ctx.fillRect(wx - 6 * a.u, floor - 36 * a.u, 12 * a.u, 36 * a.u);
    ctx.fillStyle = this.state === 2 && !this.lastOk ? COL_ACCENT : COL_MID;
    v.text(this.state === 2 ? this.lastNote : this.round === 0 && this.state === 0 ? 'press to set off; the walk always takes the same time. arrive while the doors are wide open' : '', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.passed * 60 + Math.round(mean(this.margins) * 400),
      primary: { label: 'doors made', value: this.passed, unit: `of ${this.round}` },
      lines: [
        { label: 'through', value: `${this.passed} of ${this.round}` },
        { label: 'typical margin', value: this.margins.length ? pct(median(this.margins) * 2) : '–' },
      ],
      saved: this.round >= 4,
    };
  }
}

// --- Mover (spot motion onset) ---------------------------------------------------------

const MOVER_TRIALS = 15;

class Mover implements Mini {
  private env!: MiniEnv;
  private trial = 0;
  private dots: [number, number][] = [];
  private who = 0;
  private dir = 0;
  /** Creep speed, in shares of the field a second. */
  private readonly speed = new Stair(0.06, 0.006, 0.008, 0.1, 2);
  private levels: number[] = [];
  private onset = 0;
  private state = 0; // 0 waiting / moving, 1 feedback
  private at = 0;
  private rts: number[] = [];
  private wrong = 0;
  private missed = 0;
  private field: Rect = [0, 0, 1, 1];
  private lastOk = true;
  private firstAt = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.firstAt = now;
    this.arm(now);
  }

  private arm(now: number): void {
    this.dots = [];
    for (let tries = 0; this.dots.length < 30 && tries < 3000; tries++) {
      const p: [number, number] = [rnd(0.06, 0.94), rnd(0.08, 0.92)];
      if (this.dots.every((q) => Math.hypot((q[0] - p[0]) * 1.6, q[1] - p[1]) > 0.12)) this.dots.push(p);
    }
    this.who = rint(0, this.dots.length - 1);
    this.dir = rnd(0, TAU);
    this.onset = now + foreperiod(1000, 1500, 5000);
    this.state = 0;
  }

  private posOf(k: number, now: number): [number, number] {
    const [x, y] = this.dots[k]!;
    if (k !== this.who || now < this.onset) return [x, y];
    const d = ((now - this.onset) / 1000) * this.speed.level;
    return [x + (Math.cos(this.dir) * d) / 1.6, y + Math.sin(this.dir) * d];
  }

  press(): void {}

  pointer(px: number, py: number, ts: number): void {
    if (this.state !== 0) return;
    const [fx, fy, fw, fh] = this.field;
    let best = -1;
    let bd = 1e9;
    this.dots.forEach((_, k) => {
      const [x, y] = this.posOf(k, ts);
      const d = Math.hypot(fx + x * fw - px, fy + y * fh - py);
      if (d < bd) [bd, best] = [d, k];
    });
    if (bd > fh * 0.05) return;
    const ok = best === this.who && ts >= this.onset;
    this.lastOk = ok;
    this.levels.push(this.speed.level);
    this.speed.update(ok, -1);
    if (ok) {
      this.rts.push(ts - this.onset);
      this.env.sound(SND_CATCH);
    } else {
      this.wrong++;
      this.env.sound(SND_FALSE);
    }
    this.trial++;
    this.state = 1;
    this.at = ts + (ok ? 700 : 1400);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now - this.onset > 7000) {
      this.missed++;
      this.levels.push(this.speed.level);
      this.speed.update(false, -1);
      this.lastOk = false;
      this.trial++;
      this.state = 1;
      this.at = now + 1400;
      this.env.sound(SND_FALSE);
    }
    if (this.state === 1 && now >= this.at) {
      if (this.trial >= scaled(MOVER_TRIALS)) return true;
      this.arm(now);
    }
    if (now - this.firstAt > 600000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'typical spot', this.rts.length ? ms(median(this.rts)) : '–', 'field', `${Math.min(this.trial + 1, scaled(MOVER_TRIALS))} / ${scaled(MOVER_TRIALS)}`);
    const fh = Math.min(a.bottom - a.top - 30 * a.u, (a.right - a.left) / 1.6);
    const fw = fh * 1.6;
    const fx = a.cx - fw / 2;
    const fy = a.top + 4 * a.u;
    this.field = [fx, fy, fw, fh];
    const t = this.state === 1 ? this.at - 1 : now;
    this.dots.forEach((_, k) => {
      const [x, y] = this.posOf(k, this.state === 1 ? Math.min(t, now) : now);
      ctx.fillStyle = this.state === 1 && k === this.who ? (this.lastOk ? COL_LINE : COL_ACCENT) : '#b8b8c0';
      ctx.beginPath();
      ctx.arc(fx + x * fw, fy + y * fh, (this.state === 1 && k === this.who ? 8 : 5) * a.u, 0, TAU);
      ctx.fill();
    });
    ctx.fillStyle = COL_MID;
    v.text(this.trial === 0 && this.state === 0 ? 'all the dots are still; one will start to creep. click it as soon as you see it move' : `${this.wrong} wrong · ${this.missed} not seen`, a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const th = this.levels.length >= 6 ? median(this.levels.slice(-8)) : 0;
    return {
      score: Math.max(0, this.rts.length * 40 + (th ? Math.round((0.1 - th) * 8000) : 0) - this.wrong * 20),
      primary: { label: 'typical time to spot it', value: median(this.rts), unit: 'ms', lower: true },
      lines: [
        { label: 'typical time to spot', value: this.rts.length ? ms(median(this.rts)) : '–' },
        { label: 'slowest creep caught', value: th ? `${(th * 100).toFixed(1)}% of the field a second` : '–' },
        { label: 'wrong dot', value: String(this.wrong) },
        { label: 'not seen', value: String(this.missed) },
      ],
      saved: this.trial >= 5,
    };
  }
}

// --- Dense -----------------------------------------------------------------------------

const DENSE_TRIALS = 30;

class Dense implements Mini {
  private env!: MiniEnv;
  /** How much denser the denser box is (percent). */
  private readonly diff = new Stair(50, 5, 5, 80, 2);
  private levels: number[] = [];
  private trial = 0;
  private boxes: { w: number; h: number; pts: [number, number][] }[] = [];
  private denser = 0;
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
    this.denser = Math.random() < 0.5 ? 0 : 1;
    const base = rnd(28, 45);
    this.boxes = [0, 1].map((k) => {
      // Sizes differ, so the count alone is no guide.
      const w = rnd(0.55, 1);
      const h = rnd(0.55, 1);
      const density = base * (k === this.denser ? 1 + this.diff.level / 100 : 1);
      const n = Math.max(3, Math.round(density * w * h));
      return { w, h, pts: Array.from({ length: n }, () => [Math.random(), Math.random()] as [number, number]) };
    });
    this.state = 0;
    this.at = now;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (s === 0 || this.state !== 0) return;
    const ok = (s < 0 ? 0 : 1) === this.denser;
    this.lastOk = ok;
    this.levels.push(this.diff.level);
    this.diff.update(ok, -1);
    if (ok) this.right++;
    this.env.sound(ok ? (s < 0 ? SND_TAP_L : SND_TAP_R) : SND_FALSE);
    this.trial++;
    this.state = 1;
    this.at = ts + (ok ? 350 : 900);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 1 && now >= this.at) {
      if (this.trial >= scaled(DENSE_TRIALS)) return true;
      this.make(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'difference', `${this.diff.level}%`, 'pair', `${Math.min(this.trial + 1, scaled(DENSE_TRIALS))} / ${scaled(DENSE_TRIALS)}`);
    const S = Math.min((a.right - a.left) / 2.4, a.bottom - a.top - 70 * a.u);
    this.boxes.forEach((b, k) => {
      const cx = a.cx + (k ? 1 : -1) * S * 0.6;
      const w = b.w * S;
      const h = b.h * S;
      const x0 = cx - w / 2;
      const y0 = a.cy - 10 * a.u - h / 2;
      const show = this.state === 1;
      ctx.strokeStyle = show && k === this.denser ? COL_LINE : COL_DIM;
      ctx.lineWidth = (show && k === this.denser ? 2.5 : 1.5) * dpr;
      ctx.strokeRect(x0, y0, w, h);
      ctx.fillStyle = '#c8c8ce';
      for (const [px, py] of b.pts) {
        ctx.beginPath();
        ctx.arc(x0 + 4 * dpr + px * (w - 8 * dpr), y0 + 4 * dpr + py * (h - 8 * dpr), 2.2 * dpr, 0, TAU);
        ctx.fill();
      }
    });
    ctx.fillStyle = this.state === 1 && !this.lastOk ? COL_ACCENT : COL_MID;
    v.text(this.state === 1 && !this.lastOk ? 'the other was more crowded' : 'which box is more crowded, dots for its size?', a.cx, a.bottom - 34 * a.u, v.fontTiny, 'center');
    const off = Math.min(200 * a.u, (a.right - a.left) / 2 - 30 * a.u);
    ctx.fillStyle = COL_MID;
    v.text(`${handLabel(this.env, -1)}  left`, a.cx - off, a.bottom - 6 * a.u, v.fontTiny, 'center');
    v.text(`right  ${handLabel(this.env, 1)}`, a.cx + off, a.bottom - 6 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const th = this.levels.length >= 10 ? mean(this.levels.slice(-12)) : 0;
    return {
      score: th ? Math.max(0, Math.round((85 - th) * 25 + this.right * 5)) : 0,
      primary: { label: 'smallest difference you see', value: Math.round(th), unit: '%', lower: true },
      lines: [
        { label: 'threshold (last 12 pairs)', value: th ? `${th.toFixed(0)}%` : '–' },
        { label: 'right', value: `${this.right} of ${this.trial}` },
      ],
      saved: this.trial >= 10,
    };
  }
}

// --- Percent ---------------------------------------------------------------------------

const PERCENT_MS = 60000;

class Percent implements Mini {
  private env!: MiniEnv;
  private q = '';
  private opts: string[] = [];
  private answer = 0;
  private boxes: Rect[] = [];
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
    const kind = rint(0, 2);
    let ans = 0;
    let unit = '';
    if (kind === 0) {
      const p = hard ? rint(1, 19) * 5 : [10, 20, 25, 50, 75][rint(0, 4)]!;
      const of = rint(2, 40) * (hard ? 4 : 20);
      ans = (p * of) / 100;
      this.q = `${p}% of ${of}`;
    } else if (kind === 1) {
      const whole = rint(2, 20) * 10;
      const p = hard ? rint(1, 19) * 5 : [10, 20, 25, 50][rint(0, 3)]!;
      const part = (whole * p) / 100;
      ans = p;
      unit = '%';
      this.q = `${part} of ${whole} is what %?`;
    } else {
      const price = rint(2, 30) * 10;
      const p = hard ? rint(1, 9) * 5 : [10, 20, 25, 50][rint(0, 3)]!;
      ans = price - (price * p) / 100;
      this.q = `${price} less ${p}%`;
    }
    const fmt = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)}${unit}`;
    const wrong = new Set<string>();
    const near = [ans * 1.1, ans * 0.9, ans + 5, ans - 5, ans * 2, ans / 2, ans + 10];
    for (const w of shuffle(near)) {
      const s = fmt(Math.round(w * 10) / 10);
      if (s !== fmt(ans) && w > 0) wrong.add(s);
      if (wrong.size >= 3) break;
    }
    for (let k = 1; wrong.size < 3; k++) wrong.add(fmt(ans + k));
    this.answer = rint(0, 3);
    this.opts = [...wrong].slice(0, 3);
    this.opts.splice(this.answer, 0, fmt(ans));
    this.at = now;
  }

  press(): void {}

  private pick(k: number, ts: number): void {
    if (!this.started) {
      this.started = true;
      this.t0 = ts;
      this.make(ts);
      return;
    }
    if (k === this.answer) {
      this.ok++;
      this.rts.push(ts - this.at);
      this.env.sound(SND_CATCH);
    } else {
      this.bad++;
      this.note = `${this.q}: ${this.opts[this.answer]}`;
      this.flash = ts + 1400;
      this.env.sound(SND_FALSE);
    }
    this.make(ts);
  }

  typeKey(code: string, ts: number): boolean {
    const d = Number(digitOf(code));
    if (d >= 1 && d <= 4) {
      this.pick(d - 1, ts);
      return true;
    }
    if (!this.started && (code === 'Space' || code === 'Enter')) {
      this.pick(-1, ts);
      return true;
    }
    return false;
  }

  pointer(x: number, y: number, ts: number): void {
    if (!this.started) return this.pick(-1, ts);
    const k = this.boxes.findIndex((r) => inside(r, x, y));
    if (k >= 0) this.pick(k, ts);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    const len = scaled(PERCENT_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'right', String(this.ok), 'time', `${left} s`);
    ctx.font = `600 ${Math.round(34 * a.u)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COL_LINE;
    ctx.fillText(this.started ? this.q : 'quick percentages', a.cx, a.cy - 60 * a.u);
    if (this.started) {
      const bw = Math.min(110 * a.u, (a.right - a.left) / 4 - 12 * a.u);
      this.boxes = this.opts.map((_, k) => [a.cx + (k - 2) * (bw + 12 * a.u) + 6 * a.u, a.cy, bw, 50 * a.u] as Rect);
      this.boxes.forEach(([x, y, w, h], k) => {
        ctx.strokeStyle = COL_DIM;
        ctx.lineWidth = 1.5 * dpr;
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = COL_LINE;
        v.text(this.opts[k]!, x + w / 2, y + h / 2 + 6 * dpr, v.fontHud, 'center');
        ctx.fillStyle = COL_DIM;
        v.text(String(k + 1), x + 7 * dpr, y + 13 * dpr, v.fontTiny, 'left');
      });
    }
    if (now < this.flash) {
      ctx.fillStyle = COL_ACCENT;
      v.text(this.note, a.cx, a.cy + 90 * a.u, v.fontTiny, 'center');
    }
    ctx.fillStyle = COL_MID;
    if (!this.started) v.text('click (or press Space) to start; answer with 1 to 4 or a click. a minute', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: Math.max(0, this.ok * 30 - this.bad * 30),
      primary: { label: 'right in a minute', value: this.ok, unit: '' },
      lines: [
        { label: 'right', value: String(this.ok) },
        { label: 'wrong', value: String(this.bad) },
        { label: 'typical time a question', value: this.rts.length ? ms(median(this.rts)) : '–' },
      ],
      saved: this.ok + this.bad >= 4,
    };
  }
}

export const BATCH60: MiniDef[] = [
  { id: 'doors', name: 'Doors', skill: 'timing', blurb: 'Sliding doors open and shut. Set off so you arrive while they are open.', how: 'Sliding doors open and shut on a steady cycle, and you stand a set walk away. Press to set off: the walk always takes the same time, so you must leave before the doors open. Arrive while they are wide open to get through. The cycles speed up and the open spell shortens. Fifteen doors.', input: 'both', make: () => new Doors() },
  { id: 'mover', name: 'Mover', skill: 'attention', blurb: 'A field of still dots. One starts to creep. Click it.', how: 'Thirty dots, all still. At some point one of them starts to creep slowly in a straight line. Click it as soon as you notice. Catch it and the next creeps slower; miss it or click the wrong dot and the next is quicker. Fifteen fields.', input: 'pointer', make: () => new Mover() },
  { id: 'dense', name: 'Dense', skill: 'judgement', blurb: 'Two boxes of dots, different sizes. Which is more crowded?', how: 'Two boxes of different sizes, each scattered with dots. Press the side of the more crowded one: more dots for its size, not more dots in all. Get them right and the difference shrinks. Thirty pairs; scored on the smallest difference you can still see.', input: 'keys', minKeys: 2, make: () => new Dense() },
  { id: 'percent', name: 'Percent', skill: 'reasoning', blurb: 'Quick percentages: 15% of 80, or what share 12 is of 48.', how: 'A percentage question with four answers: a share of a number, what percentage one number is of another, or a price less a discount. Pick the answer (1 to 4, or click). Friendly numbers first; after eight right, any multiple of five. A minute; mistakes show the answer.', input: 'pointer', make: () => new Percent() },
];
