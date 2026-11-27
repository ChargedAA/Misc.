// Fifty-seventh batch.
//   Golf   - a swing meter: press once for power on the mark, once more on the line back.
//   Proof  - a line of words with one misspelled: click it.
//   Tag    - a few things and their prices; then, what did this one cost?
//   Seesaw - tilt a plank to keep a rolling ball inside a zone that wanders.

import { COL_ACCENT, COL_DIM, COL_FAINT, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALL, SND_FALSE, SND_TAP_L, SND_TAP_WEAK } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, header, mean, median, ms, pct, scaled, shuffle, sideOf, type Mini, type MiniDef, type MiniEnv, type MiniResult, plural } from './kit.ts';
import { WORDS } from './batch24.ts';

const TAU = Math.PI * 2;
const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const rint = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]!;
type Rect = [number, number, number, number];
const inside = (r: Rect, x: number, y: number) => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
const digitOf = (code: string) => (code.startsWith('Digit') ? code.slice(5) : code.startsWith('Numpad') ? code.slice(6) : '');

// --- Golf (swing meter) ----------------------------------------------------------------

const GOLF_HOLES = 12;
/** Where the accuracy line sits on the meter (share of full). */
const LINE = 0.1;

class Golf implements Mini {
  private env!: MiniEnv;
  private hole = 0;
  private target = 0.7;
  /** 0 ready, 1 rising, 2 falling, 3 result. */
  private state = 0;
  private swingAt = 0;
  private topAt = 0;
  private power = 0;
  private speed = 0.9;
  private at = 0;
  private powerErr: number[] = [];
  private lineErr: number[] = [];
  private lastP = 0;
  private lastL = 0;
  private held = 0;
  private firstAt = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.firstAt = now;
    this.arm();
  }

  private arm(): void {
    this.target = rnd(0.45, 0.92);
    this.speed = 0.8 + this.hole * 0.06;
    this.state = 0;
  }

  /** The needle's position at a moment, from 0 up to 1 and back. */
  private needle(now: number): number {
    if (this.state === 1) {
      const p = ((now - this.swingAt) / 1000) * this.speed;
      return Math.min(1.05, p);
    }
    if (this.state === 2) return this.power - ((now - this.topAt) / 1000) * this.speed * 1.3;
    return 0;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (this.state === 0) {
      this.state = 1;
      this.swingAt = ts;
      this.env.sound(SND_TAP_WEAK);
    } else if (this.state === 1) {
      this.power = this.needle(ts);
      this.lastP = this.power - this.target;
      this.state = 2;
      this.topAt = ts;
      this.env.sound(SND_TAP_L);
    } else if (this.state === 2) {
      this.finish(this.needle(ts) - LINE, ts);
    }
  }

  private finish(lineOff: number, now: number): void {
    this.lastL = lineOff;
    this.powerErr.push(Math.abs(this.lastP));
    this.lineErr.push(Math.abs(lineOff));
    const good = Math.abs(this.lastP) < 0.04 && Math.abs(lineOff) < 0.03;
    this.env.sound(good ? SND_CATCH : SND_TAP_WEAK);
    this.hole++;
    this.state = 3;
    this.at = now + 1500;
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  pointer(_x: number, _y: number, ts: number): void {
    this.press(0, ts);
    this.release(0);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    // Over the top without a press: power is full and overshoots.
    if (this.state === 1 && this.needle(now) >= 1.05) {
      this.power = 1.05;
      this.lastP = this.power - this.target;
      this.state = 2;
      this.topAt = now;
    }
    // Past the bottom without a press: the line was missed badly.
    if (this.state === 2 && this.needle(now) < -0.12) this.finish(-0.12 - LINE, now);
    if (this.state === 3 && now >= this.at) {
      if (this.hole >= scaled(GOLF_HOLES)) return true;
      this.arm();
    }
    if (now - this.firstAt > 600000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'power off by', this.powerErr.length ? pct(mean(this.powerErr)) : '–', 'hole', `${Math.min(this.hole + 1, scaled(GOLF_HOLES))} / ${scaled(GOLF_HOLES)}`);
    // The meter: a horizontal bar, 0 on the left.
    const W = Math.min(a.right - a.left - 40 * a.u, 620 * a.u);
    const x0 = a.cx - W / 2;
    const y = a.cy - 10 * a.u;
    const h = 30 * a.u;
    const X = (p: number) => x0 + (p / 1.05) * W;
    ctx.fillStyle = '#16161a';
    ctx.fillRect(x0, y - h / 2, W, h);
    // Power filled so far.
    const n = this.needle(now);
    if (this.state === 1) {
      ctx.fillStyle = '#3a3a41';
      ctx.fillRect(x0, y - h / 2, X(Math.max(0, n)) - x0, h);
    } else if (this.state >= 2) {
      ctx.fillStyle = '#2a2a30';
      ctx.fillRect(x0, y - h / 2, X(this.power) - x0, h);
    }
    // The target power and the accuracy line.
    ctx.fillStyle = COL_LINE;
    ctx.fillRect(X(this.target) - 1.5 * dpr, y - h / 2 - 10 * a.u, 3 * dpr, h + 20 * a.u);
    v.text('power', X(this.target), y - h / 2 - 16 * a.u, v.fontTiny, 'center');
    ctx.fillStyle = COL_ACCENT;
    ctx.fillRect(X(LINE) - 1.5 * dpr, y - h / 2 - 10 * a.u, 3 * dpr, h + 20 * a.u);
    v.text('line', X(LINE), y + h / 2 + 24 * a.u, v.fontTiny, 'center');
    if (this.state === 1 || this.state === 2) {
      ctx.fillStyle = COL_LINE;
      ctx.fillRect(X(Math.max(-0.05, n)) - 2 * dpr, y - h / 2 - 4 * a.u, 4 * dpr, h + 8 * a.u);
    }
    // The ball's flight, as a result: long or short, left or right.
    if (this.state === 3) {
      const fx = a.cx + this.lastL * 600 * a.u;
      const fy = a.cy + 90 * a.u - this.lastP * 300 * a.u;
      ctx.strokeStyle = COL_DIM;
      ctx.lineWidth = dpr;
      ctx.beginPath();
      ctx.arc(a.cx, a.cy + 90 * a.u, 14 * a.u, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = COL_LINE;
      ctx.beginPath();
      ctx.arc(fx, Math.max(y + h, fy), 5 * a.u, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = COL_MID;
    const msg = this.state === 0 ? (this.hole === 0 ? 'press to swing; press again on the white power mark; and again as it comes back over the orange line' : 'press to swing') : this.state === 3 ? `power ${this.lastP >= 0 ? '+' : ''}${Math.round(this.lastP * 100)}% · line ${this.lastL >= 0 ? 'late' : 'early'} by ${Math.round(Math.abs(this.lastL) * 100)}` : '';
    v.text(msg, a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const p = mean(this.powerErr);
    const l = mean(this.lineErr);
    return {
      score: this.powerErr.length ? Math.max(0, Math.round((0.3 - p - l) * 3000)) : 0,
      primary: { label: 'average miss, power and line', value: Math.round((p + l) * 100), unit: '%', lower: true },
      lines: [
        { label: 'power off by', value: this.powerErr.length ? pct(p) : '–' },
        { label: 'line off by', value: this.lineErr.length ? pct(l) : '–' },
        { label: 'clean swings', value: String(this.powerErr.filter((e, i) => e < 0.04 && this.lineErr[i]! < 0.03).length) },
      ],
      saved: this.powerErr.length >= 3,
    };
  }
}

// --- Proof (find the typo) -------------------------------------------------------------

const PROOF_ROUNDS = 15;
const WORD_SET = new Set(WORDS);

/** A misspelling of a word that is not itself a word. */
function typo(w: string): string {
  for (let tries = 0; tries < 30; tries++) {
    const i = rint(0, w.length - 2);
    const kind = rint(0, 2);
    let t = w;
    if (kind === 0) t = w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2);
    else if (kind === 1) t = w.slice(0, i) + w[i] + w.slice(i);
    else t = w.slice(0, i) + w.slice(i + 1);
    if (t !== w && !WORD_SET.has(t)) return t;
  }
  return w.slice(0, -1) + (w.endsWith('e') ? 'a' : 'e');
}

class Proof implements Mini {
  private env!: MiniEnv;
  private round = 0;
  private words: string[] = [];
  private bad = 0;
  private fixed = '';
  private boxes: Rect[] = [];
  private state = 0;
  private at = 0;
  private shownAt = 0;
  private chosen = -1;
  private right = 0;
  private rts: number[] = [];

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.arm(now);
  }

  private arm(now: number): void {
    const n = Math.min(14, 6 + this.round);
    const pool = WORDS.filter((w) => w.length >= 4 && w.length <= 9 && /^[a-z]+$/.test(w));
    this.words = Array.from({ length: n }, () => pick(pool));
    this.bad = rint(0, n - 1);
    this.fixed = this.words[this.bad]!;
    this.words[this.bad] = typo(this.fixed);
    this.state = 0;
    this.shownAt = now;
    this.chosen = -1;
  }

  press(): void {}

  pointer(x: number, y: number, ts: number): void {
    if (this.state !== 0) return;
    const k = this.boxes.findIndex((r) => inside(r, x, y));
    if (k < 0) return;
    this.chosen = k;
    const ok = k === this.bad;
    if (ok) {
      this.right++;
      this.rts.push(ts - this.shownAt);
    }
    this.env.sound(ok ? SND_CATCH : SND_FALSE);
    this.round++;
    this.state = 1;
    this.at = ts + (ok ? 800 : 1800);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 1 && now >= this.at) {
      if (this.round >= scaled(PROOF_ROUNDS)) return true;
      this.arm(now);
    }
    if (this.state === 0 && now - this.shownAt > 120000) {
      this.round++;
      this.state = 1;
      this.at = now + 1500;
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'typical find', this.rts.length ? ms(median(this.rts)) : '–', 'line', `${Math.min(this.round + 1, scaled(PROOF_ROUNDS))} / ${scaled(PROOF_ROUNDS)}`);
    const size = Math.round(24 * a.u);
    ctx.font = `500 ${size}px Inter, system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    // Lay the words out in lines that fit.
    const space = size * 0.45;
    const maxW = Math.min(a.right - a.left - 40 * a.u, 720 * a.u);
    const lines: number[][] = [[]];
    let w = 0;
    this.words.forEach((word, k) => {
      const ww = ctx.measureText(word).width;
      if (w + ww > maxW && lines[lines.length - 1]!.length) {
        lines.push([]);
        w = 0;
      }
      lines[lines.length - 1]!.push(k);
      w += ww + space;
    });
    const lh = size * 1.9;
    const top = a.cy - ((lines.length - 1) * lh) / 2 - 20 * a.u;
    this.boxes = new Array(this.words.length);
    lines.forEach((line, li) => {
      const total = line.reduce((s, k) => s + ctx.measureText(this.words[k]!).width, 0) + space * (line.length - 1);
      let x = a.cx - total / 2;
      for (const k of line) {
        const ww = ctx.measureText(this.words[k]!).width;
        const yy = top + li * lh;
        this.boxes[k] = [x - space / 2, yy - lh / 2, ww + space, lh];
        const show = this.state === 1;
        ctx.fillStyle = show && k === this.bad ? COL_LINE : show && k === this.chosen ? COL_ACCENT : show ? COL_DIM : '#d6d6dc';
        ctx.fillText(this.words[k]!, x, yy);
        if (show && k === this.bad) {
          ctx.fillStyle = COL_ACCENT;
          ctx.fillRect(x, yy + size * 0.55, ww, 2 * dpr);
          ctx.fillStyle = COL_MID;
          v.text(this.fixed, x + ww / 2, yy + size * 1.1, v.fontTiny, 'center');
          ctx.font = `500 ${size}px Inter, system-ui, sans-serif`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
        }
        x += ww + space;
      }
    });
    ctx.fillStyle = COL_MID;
    v.text('one word is misspelled: click it', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const m = median(this.rts);
    return {
      score: this.right * 40 + (this.rts.length ? Math.round(Math.max(0, 8000 - m) / 20) : 0),
      primary: { label: 'typos found', value: this.right, unit: `of ${this.round}` },
      lines: [
        { label: 'found', value: `${this.right} of ${this.round}` },
        { label: 'typical time to find', value: this.rts.length ? ms(m) : '–' },
      ],
      saved: this.round >= 4,
    };
  }
}

// --- Tag (prices) ----------------------------------------------------------------------

const TAG_ROUNDS = 10;
const ITEMS = ['pear', 'lamp', 'kettle', 'scarf', 'notebook', 'candle', 'umbrella', 'teapot', 'wallet', 'mug', 'pillow', 'clock', 'basket', 'gloves', 'radio', 'vase', 'stapler', 'sandals'];

class Tag implements Mini {
  private env!: MiniEnv;
  private round = 0;
  private n = 3;
  private items: [string, number][] = [];
  private ask = 0;
  private typed = '';
  /** 0 study, 1 answer, 2 feedback. */
  private state = 0;
  private at = 0;
  private right = 0;
  private offs: number[] = [];
  private best = 0;
  private streak = 0;
  private lastOk = true;
  private firstAt = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.firstAt = now;
    this.arm(now);
  }

  private arm(now: number): void {
    const names = shuffle([...ITEMS]).slice(0, this.n);
    const prices = new Set<number>();
    while (prices.size < this.n) prices.add(rint(2, 99));
    const ps = [...prices];
    this.items = names.map((nm, k) => [nm, ps[k]!]);
    this.ask = rint(0, this.n - 1);
    this.typed = '';
    this.state = 0;
    this.at = now + 1500 + this.n * 1200;
  }

  press(): void {}

  typeKey(code: string, ts: number): boolean {
    if (this.state === 0 && (code === 'Space' || code === 'Enter')) {
      this.at = ts;
      return true;
    }
    if (this.state !== 1) return !!digitOf(code);
    const d = digitOf(code);
    if (d) {
      if (this.typed.length < 3) this.typed += d;
      return true;
    }
    if (code === 'Backspace') {
      this.typed = this.typed.slice(0, -1);
      return true;
    }
    if ((code === 'Enter' || code === 'NumpadEnter') && this.typed) {
      const want = this.items[this.ask]![1];
      const got = Number(this.typed);
      const ok = got === want;
      this.lastOk = ok;
      this.offs.push(Math.abs(got - want));
      if (ok) {
        this.right++;
        this.best = Math.max(this.best, this.n);
        if (++this.streak % 2 === 0) this.n = Math.min(8, this.n + 1);
      } else {
        this.streak = 0;
        this.n = Math.max(2, this.n - 1);
      }
      this.env.sound(ok ? SND_CATCH : SND_FALSE);
      this.round++;
      this.state = 2;
      this.at = ts + (ok ? 900 : 2000);
      return true;
    }
    return false;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.at) this.state = 1;
    if (this.state === 2 && now >= this.at) {
      if (this.round >= scaled(TAG_ROUNDS)) return true;
      this.arm(now);
    }
    if (now - this.firstAt > 900000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'right', String(this.right), 'shop', `${Math.min(this.round + 1, scaled(TAG_ROUNDS))} / ${scaled(TAG_ROUNDS)}`);
    if (this.state === 0) {
      const cols = this.n > 4 ? 2 : 1;
      const rows = Math.ceil(this.n / cols);
      const cw = 240 * a.u;
      const rh = 40 * a.u;
      this.items.forEach(([nm, p], k) => {
        const c = Math.floor(k / rows);
        const r = k % rows;
        const x = a.cx + (c - (cols - 1) / 2) * cw;
        const y = a.cy - ((rows - 1) * rh) / 2 + r * rh - 10 * a.u;
        ctx.fillStyle = COL_MID;
        v.text(nm, x - 10 * a.u, y, v.fontHud, 'right');
        ctx.fillStyle = COL_LINE;
        v.text(`$${p}`, x + 10 * a.u, y, v.fontHud, 'left');
      });
      ctx.fillStyle = COL_FAINT;
      const left = Math.max(0, (this.at - now) / (1500 + this.n * 1200));
      ctx.fillRect(a.cx - 100 * a.u, a.bottom - 30 * a.u, 200 * a.u * left, 3 * dpr);
      ctx.fillStyle = COL_MID;
      v.text('remember the prices (Enter when ready)', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    } else {
      const [nm, p] = this.items[this.ask]!;
      ctx.fillStyle = COL_LINE;
      v.text(`what did the ${nm} cost?`, a.cx, a.cy - 40 * a.u, v.fontHud, 'center');
      ctx.font = `600 ${Math.round(40 * a.u)}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = this.state === 2 && !this.lastOk ? COL_ACCENT : COL_LINE;
      ctx.fillText(`$${this.typed || '_'}`, a.cx, a.cy + 20 * a.u);
      if (this.state === 2 && !this.lastOk) {
        ctx.fillStyle = COL_MID;
        v.text(`it was $${p}`, a.cx, a.cy + 70 * a.u, v.fontTiny, 'center');
      }
      ctx.fillStyle = COL_MID;
      if (this.state === 1) v.text('type the price, then Enter', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.right * 80 + this.best * 40,
      primary: { label: 'prices remembered', value: this.right, unit: `of ${this.round}` },
      lines: [
        { label: 'right', value: `${this.right} of ${this.round}` },
        { label: 'most prices held', value: this.best ? String(this.best) : '–' },
        { label: 'typical miss when wrong', value: this.offs.some((o) => o > 0) ? `$${median(this.offs.filter((o) => o > 0))}` : '–' },
      ],
      saved: this.round >= 3,
    };
  }
}

// --- Seesaw ----------------------------------------------------------------------------

const SEESAW_MS = 60000;

class Seesaw implements Mini {
  private env!: MiniEnv;
  /** Plank angle (radians, + tips right side down) and its turning speed. */
  private ang = 0;
  /** Ball position along the plank (-1..1) and speed. */
  private x = 0;
  private vx = 0;
  private zone = 0;
  private zoneW = 0.4;
  private held = 0;
  private started = false;
  private t0 = 0;
  private last = 0;
  private inZone = 0;
  private falls = 0;
  private resetAt = 0;
  private firstFrame = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.last = now;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (!this.started && sideOf(slot) !== 0) {
      this.started = true;
      this.t0 = ts;
      this.last = ts;
    }
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  private steer(): number {
    let s = 0;
    for (let k = 0; k < 6; k++) if (this.held & (1 << k)) s += sideOf(k);
    return Math.sign(s);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    const len = scaled(SEESAW_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.started && now >= this.resetAt) {
      const t = (now - this.t0) / 1000;
      // The keys tip the plank; it eases back toward level by itself.
      this.ang += this.steer() * 0.9 * dt;
      this.ang *= Math.pow(0.6, dt);
      this.ang = Math.max(-0.35, Math.min(0.35, this.ang));
      this.vx += Math.sin(this.ang) * 2.6 * dt;
      this.vx *= Math.pow(0.85, dt);
      this.x += this.vx * dt;
      // The zone wanders, faster as time goes on.
      this.zone = 0.55 * Math.sin(t * (0.35 + t / 200)) * Math.cos(t * 0.13);
      this.zoneW = Math.max(0.2, 0.4 - t / 300);
      if (Math.abs(this.x - this.zone) <= this.zoneW / 2) this.inZone += dt;
      if (Math.abs(this.x) > 1) {
        this.falls++;
        this.env.sound(SND_FALL);
        this.x = 0;
        this.vx = 0;
        this.ang = 0;
        this.resetAt = now + 1000;
      }
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const elapsed = this.started ? Math.min(len, now - this.t0) / 1000 : 0;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'in the zone', this.started ? pct(this.inZone / Math.max(0.001, elapsed)) : '–', 'time', `${left} s`);
    const L = Math.min((a.right - a.left) / 2 - 20 * a.u, 300 * a.u);
    const px = a.cx;
    const py = a.cy + 40 * a.u;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(this.ang);
    ctx.fillStyle = '#3a3a41';
    ctx.fillRect(-L, -3 * dpr, 2 * L, 6 * dpr);
    // The zone.
    ctx.fillStyle = COL_DIM;
    ctx.fillRect((this.zone - this.zoneW / 2) * L, -9 * dpr, this.zoneW * L, 6 * dpr);
    // The ball.
    const inz = Math.abs(this.x - this.zone) <= this.zoneW / 2;
    ctx.fillStyle = now < this.resetAt ? COL_ACCENT : inz ? COL_LINE : '#a8a8b0';
    ctx.beginPath();
    ctx.arc(this.x * L, -3 * dpr - 12 * a.u, 12 * a.u, 0, TAU);
    ctx.fill();
    ctx.restore();
    // The pivot.
    ctx.fillStyle = '#2a2a30';
    ctx.beginPath();
    ctx.moveTo(px, py + 3 * dpr);
    ctx.lineTo(px + 18 * a.u, py + 34 * a.u);
    ctx.lineTo(px - 18 * a.u, py + 34 * a.u);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = COL_MID;
    v.text(this.started ? plural(this.falls, 'fall') : 'hold left or right to tip the plank; keep the ball over the grey zone. press to start', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const total = Math.max(0.001, scaled(SEESAW_MS) / 1000);
    const share = Math.min(1, this.inZone / total);
    return {
      score: Math.max(0, Math.round(share * 2000) - this.falls * 50),
      primary: { label: 'time in the zone', value: Math.round(share * 100), unit: '%' },
      lines: [
        { label: 'in the zone', value: pct(share) },
        { label: 'falls', value: String(this.falls) },
      ],
      saved: this.started && this.inZone + this.falls > 2,
    };
  }
}

export const BATCH57: MiniDef[] = [
  { id: 'golf', name: 'Golf', skill: 'timing', blurb: 'A swing meter. Press once for power on the mark, once more on the line back.', how: 'Press to start the swing: the needle runs up the meter. Press again as it reaches the white power mark, and once more as it comes back across the orange line. Each hole wants a different power, and the needle gets quicker. Twelve holes; scored on how far off both presses were.', input: 'both', make: () => new Golf() },
  { id: 'proof', name: 'Proof', skill: 'attention', blurb: 'A line of words with one misspelled. Click it.', how: 'A line of common words, one of them misspelled: two letters swapped, one doubled, or one left out. Click the misspelled word; the right spelling is shown after. The lines grow longer. Fifteen lines; scored on how many you find and how fast.', input: 'pointer', make: () => new Proof() },
  { id: 'tag', name: 'Tag', skill: 'memory', blurb: 'A few things and their prices. Then: what did this one cost?', how: 'A short list of things and their prices: remember them (Enter when ready). Then you are asked the price of one; type it and press Enter. Two right and the next list is longer; a miss and it is shorter. Ten lists.', input: 'type', make: () => new Tag() },
  { id: 'seesaw', name: 'Seesaw', skill: 'coordination', blurb: 'Tilt a plank to keep a rolling ball over a zone that wanders.', how: 'A ball on a plank. Hold left or right to tip the plank; it eases back to level by itself, and the ball rolls with the slope and keeps its speed. Keep the ball over the grey zone as it wanders along the plank, faster and narrower as time goes on. Roll off the end and it resets. A minute.', input: 'keys', minKeys: 2, make: () => new Seesaw() },
];
