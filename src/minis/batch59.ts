// Fifty-ninth batch.
//   Dots    - a scatter of dots: how many? Answer at a glance, over and over.
//   Symbols - type strings full of symbols: prices, emails, brackets, percentages.
//   Still   - bring the pointer into a small circle and hold it there, steady.
//   Rally   - two paddles, one per hand: hold to raise, let go to sink. Keep the ball in.

import { COL_ACCENT, COL_DIM, COL_FAINT, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALL, SND_FALSE, SND_TAP_L, SND_TAP_R, SND_TAP_WEAK } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, handLabel, header, median, ms, pct, scaled, sideOf, type Mini, type MiniDef, type MiniEnv, type MiniResult, plural } from './kit.ts';

const TAU = Math.PI * 2;
const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const rint = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]!;
type Rect = [number, number, number, number];
const inside = (r: Rect, x: number, y: number) => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
const digitOf = (code: string) => (code.startsWith('Digit') ? code.slice(5) : code.startsWith('Numpad') ? code.slice(6) : '');

// --- Dots (count at a glance) ----------------------------------------------------------

const DOTS_MS = 30000;

class Dots implements Mini {
  private env!: MiniEnv;
  private n = 0;
  private pts: [number, number][] = [];
  private t0 = 0;
  private at = 0;
  private started = false;
  private ok = 0;
  private bad = 0;
  private rts: number[] = [];
  private flash = 0;
  private boxes: Rect[] = [];
  private firstFrame = 0;

  start(env: MiniEnv): void {
    this.env = env;
  }

  private make(now: number): void {
    const max = this.ok < 8 ? 6 : 9;
    let n = rint(1, max);
    if (n === this.n) n = rint(1, max);
    this.n = n;
    this.pts = [];
    for (let tries = 0; this.pts.length < n && tries < 2000; tries++) {
      const p: [number, number] = [rnd(-1, 1), rnd(-1, 1)];
      if (this.pts.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) > 0.38)) this.pts.push(p);
    }
    this.n = this.pts.length;
    this.at = now;
  }

  press(): void {}

  private answer(k: number, ts: number): void {
    if (!this.started) {
      this.started = true;
      this.t0 = ts;
      this.make(ts);
      return;
    }
    if (k === this.n) {
      this.ok++;
      this.rts.push(ts - this.at);
      this.env.sound(SND_TAP_WEAK);
    } else {
      this.bad++;
      this.flash = ts + 400;
      this.env.sound(SND_FALSE);
    }
    this.make(ts);
  }

  typeKey(code: string, ts: number): boolean {
    const d = Number(digitOf(code));
    if (d >= 1 && d <= 9) {
      this.answer(d, ts);
      return true;
    }
    if (!this.started && (code === 'Space' || code === 'Enter')) {
      this.answer(0, ts);
      return true;
    }
    return false;
  }

  pointer(x: number, y: number, ts: number): void {
    if (!this.started) return this.answer(0, ts);
    const k = this.boxes.findIndex((r) => inside(r, x, y));
    if (k >= 0) this.answer(k + 1, ts);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    const len = scaled(DOTS_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'right', String(this.ok), 'time', `${left} s`);
    const R = Math.min(110 * a.u, (a.bottom - a.top) * 0.28);
    const cy = a.cy - 40 * a.u;
    ctx.strokeStyle = now < this.flash ? COL_ACCENT : COL_FAINT;
    ctx.lineWidth = 1.5 * dpr;
    ctx.strokeRect(a.cx - R - 16 * a.u, cy - R - 16 * a.u, 2 * R + 32 * a.u, 2 * R + 32 * a.u);
    if (this.started) {
      ctx.fillStyle = COL_LINE;
      for (const [x, y] of this.pts) {
        ctx.beginPath();
        ctx.arc(a.cx + x * R, cy + y * R, 9 * a.u, 0, TAU);
        ctx.fill();
      }
    }
    const bw = Math.min(46 * a.u, (a.right - a.left) / 10 - 6 * a.u);
    const by = cy + R + 34 * a.u;
    this.boxes = Array.from({ length: 9 }, (_, k) => [a.cx + (k - 4.5) * (bw + 6 * a.u) + 3 * a.u, by, bw, bw] as Rect);
    this.boxes.forEach(([x, y, w, h], k) => {
      ctx.strokeStyle = COL_DIM;
      ctx.lineWidth = 1.5 * dpr;
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = COL_LINE;
      v.text(String(k + 1), x + w / 2, y + h / 2 + 5 * dpr, v.fontHud, 'center');
    });
    ctx.fillStyle = COL_MID;
    v.text(this.started ? 'how many dots? press the number' : 'press Space or click to start: count the dots, press the number. thirty seconds', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: Math.max(0, this.ok * 20 - this.bad * 30),
      primary: { label: 'counted right in 30 seconds', value: this.ok, unit: '' },
      lines: [
        { label: 'right', value: String(this.ok) },
        { label: 'wrong', value: String(this.bad) },
        { label: 'typical time a count', value: this.rts.length ? ms(median(this.rts)) : '–' },
      ],
      saved: this.ok + this.bad >= 5,
    };
  }
}

// --- Symbols (typing) ------------------------------------------------------------------

const SYMBOLS_MS = 60000;
const NAMES = ['sam', 'alex', 'jo', 'kim', 'lee', 'max', 'ria', 'tom'];
const HOSTS = ['mail.com', 'web.org', 'site.net', 'post.io'];

/** A short string of the kind that sends fingers to the symbol keys. */
function symbolString(): string {
  const k = rint(0, 9);
  switch (k) {
    case 0:
      return `$${rint(1, 99)}.${String(rint(0, 99)).padStart(2, '0')}`;
    case 1:
      return `${pick(NAMES)}@${pick(HOSTS)}`;
    case 2:
      return `(${pick(['a', 'x', 'n'])}+${rint(1, 9)})*${rint(2, 9)}`;
    case 3:
      return `${rint(5, 95)}%`;
    case 4:
      return `#${pick(['news', 'todo', 'win', 'art', 'fae'])}`;
    case 5:
      return `{"${pick(['id', 'ok', 'n'])}": ${rint(1, 99)}}`;
    case 6:
      return `${pick(['a', 'b', 'x'])} != ${pick(['c', 'y', 'z'])} && ${rint(1, 9)} < ${rint(10, 20)}`;
    case 7:
      return `~/${pick(['docs', 'src', 'img'])}/${pick(['a', 'main', 'note'])}.${pick(['md', 'ts', 'png'])}`;
    case 8:
      return `[${rint(1, 9)}, ${rint(1, 9)}] ^ ${rint(2, 3)}`;
    default:
      return `${pick(['Q', 'R', 'S'])}${rint(1, 4)}: +${rint(1, 30)}% (!)`;
  }
}

class Symbols implements Mini {
  private env!: MiniEnv;
  private text = '';
  private pos = 0;
  private t0 = 0;
  private started = false;
  private chars = 0;
  private symChars = 0;
  private slips = 0;
  private done = 0;
  private bad = 0;
  private firstFrame = 0;

  start(env: MiniEnv): void {
    this.env = env;
    this.text = symbolString();
  }

  press(): void {}

  typeKey(code: string, ts: number, key?: string): boolean {
    if (!key || key.length !== 1) return false;
    if (!this.started) {
      this.started = true;
      this.t0 = ts;
    }
    if (ts - this.t0 >= scaled(SYMBOLS_MS)) return true;
    const want = this.text[this.pos]!;
    if (key === want) {
      this.pos++;
      this.chars++;
      if (!/[a-z0-9 ]/i.test(key)) this.symChars++;
      if (this.pos >= this.text.length) {
        this.done++;
        this.env.sound(SND_TAP_WEAK);
        this.text = symbolString();
        this.pos = 0;
      }
    } else {
      this.slips++;
      this.bad = ts + 200;
      this.env.sound(SND_FALSE);
    }
    return code !== 'Escape';
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    const len = scaled(SYMBOLS_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'done', String(this.done), 'time', `${left} s`);
    const size = Math.min(40 * a.u, (a.right - a.left) / (this.text.length + 2) / 0.62);
    ctx.font = `500 ${Math.round(size)}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cw = size * 0.62;
    const x0 = a.cx - (this.text.length * cw) / 2 + cw / 2;
    // One character at a time, so the coding font never joins != or && into one sign.
    [...this.text].forEach((c, i) => {
      const x = x0 + i * cw;
      if (c === ' ') {
        if (i === this.pos) {
          ctx.fillStyle = now < this.bad ? COL_ACCENT : COL_DIM;
          ctx.fillRect(x - cw * 0.3, a.cy - 10 * a.u + size * 0.55, cw * 0.6, 2 * v.dpr);
        }
        return;
      }
      ctx.fillStyle = i < this.pos ? COL_DIM : i === this.pos ? (now < this.bad ? COL_ACCENT : COL_LINE) : COL_MID;
      ctx.fillText(c, x, a.cy - 10 * a.u);
      if (i === this.pos) ctx.fillRect(x - cw * 0.35, a.cy - 10 * a.u + size * 0.55, cw * 0.7, 2 * v.dpr);
    });
    ctx.fillStyle = COL_MID;
    v.text(this.started ? plural(this.slips, 'slip') : 'type each line exactly, symbols and spaces included; the clock starts on the first key', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const mins = Math.max(1, scaled(SYMBOLS_MS)) / 60000;
    const cpm = Math.round(this.chars / mins);
    return {
      score: Math.max(0, cpm * 2 + this.symChars * 2 - this.slips * 10),
      primary: { label: 'characters a minute', value: cpm, unit: 'cpm' },
      lines: [
        { label: 'characters a minute', value: String(cpm) },
        { label: 'symbols typed', value: String(this.symChars) },
        { label: 'slips', value: String(this.slips) },
        { label: 'accuracy', value: this.chars + this.slips ? pct(this.chars / (this.chars + this.slips)) : '–' },
      ],
      saved: this.chars >= 10,
    };
  }
}

// --- Still (hold the pointer steady) ---------------------------------------------------

const STILL_TARGETS = 15;
const HOLD_MS = 1500;

class Still implements Mini {
  private env!: MiniEnv;
  private n = 0;
  private x = 0.5;
  private y = 0.5;
  private r = 0.05;
  private px = -1;
  private py = -1;
  private enteredAt = 0;
  private shownAt = 0;
  private started = false;
  private breaks = 0;
  private times: number[] = [];
  private field: Rect = [0, 0, 1, 1];
  private flash = 0;
  private firstAt = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.firstAt = now;
  }

  private arm(now: number): void {
    this.x = rnd(0.12, 0.88);
    this.y = rnd(0.15, 0.85);
    this.r = Math.max(0.012, 0.05 - this.n * 0.0027);
    this.enteredAt = 0;
    this.shownAt = now;
  }

  private isIn(): boolean {
    const [fx, fy, fw, fh] = this.field;
    return Math.hypot(this.px - (fx + this.x * fw), this.py - (fy + this.y * fh)) <= this.r * fh;
  }

  press(): void {}

  pointerMove(x: number, y: number, ts: number): void {
    this.px = x;
    this.py = y;
    if (!this.started) return;
    const now = this.isIn();
    if (now && !this.enteredAt) this.enteredAt = ts;
    else if (!now && this.enteredAt) {
      this.breaks++;
      this.enteredAt = 0;
      this.flash = ts + 200;
      this.env.sound(SND_TAP_WEAK);
    }
  }

  pointer(x: number, y: number, ts: number): void {
    if (!this.started) {
      this.started = true;
      this.arm(ts);
    }
    this.pointerMove(x, y, ts);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.started && this.enteredAt && now - this.enteredAt >= HOLD_MS) {
      this.times.push(now - this.shownAt);
      this.env.sound(SND_CATCH);
      this.n++;
      if (this.n >= scaled(STILL_TARGETS)) return true;
      this.arm(now);
    }
    if (now - this.firstAt > 600000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'typical target', this.times.length ? ms(median(this.times)) : '–', 'target', `${Math.min(this.n + 1, scaled(STILL_TARGETS))} / ${scaled(STILL_TARGETS)}`);
    const fx = a.left;
    const fy = a.top + 6 * a.u;
    const fw = a.right - a.left;
    const fh = a.bottom - a.top - 36 * a.u;
    this.field = [fx, fy, fw, fh];
    if (this.started) {
      const tx = fx + this.x * fw;
      const ty = fy + this.y * fh;
      const R = this.r * fh;
      const held = this.enteredAt ? Math.min(1, (now - this.enteredAt) / HOLD_MS) : 0;
      ctx.strokeStyle = now < this.flash ? COL_ACCENT : COL_LINE;
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.arc(tx, ty, R, 0, TAU);
      ctx.stroke();
      if (held > 0) {
        ctx.strokeStyle = COL_LINE;
        ctx.lineWidth = 4 * dpr;
        ctx.beginPath();
        ctx.arc(tx, ty, R + 8 * dpr, -Math.PI / 2, -Math.PI / 2 + held * TAU);
        ctx.stroke();
      }
    }
    if (this.px >= 0) {
      ctx.fillStyle = COL_ACCENT;
      ctx.beginPath();
      ctx.arc(this.px, this.py, 2.5 * dpr, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = COL_MID;
    v.text(this.started ? `${plural(this.breaks, 'slip')} out` : 'click to start: move into each circle and hold the pointer inside until the ring fills', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const m = median(this.times);
    return {
      score: this.times.length ? Math.max(0, Math.round(this.times.length * Math.max(0, 5000 - m) / 40) - this.breaks * 10) : 0,
      primary: { label: 'typical time a target', value: m, unit: 'ms', lower: true },
      lines: [
        { label: 'typical time a target', value: this.times.length ? ms(m) : '–' },
        { label: 'slipped out', value: String(this.breaks) },
        { label: 'targets held', value: String(this.times.length) },
      ],
      saved: this.times.length >= 3,
    };
  }
}

// --- Rally (two paddles, two hands) ----------------------------------------------------

const RALLY_MS = 90000;
const RALLY_LIVES = 5;

class Rally implements Mini {
  private env!: MiniEnv;
  /** Paddle heights (0 bottom, 1 top) and speeds, left and right. */
  private pad = [0.5, 0.5];
  private pv = [0, 0];
  private bx = 0.5;
  private by = 0.5;
  private vx = 0.35;
  private vy = 0.2;
  private held = 0;
  private started = false;
  private t0 = 0;
  private last = 0;
  private hits = 0;
  private best = 0;
  private run = 0;
  private lost = 0;
  private serveAt = 0;
  private firstFrame = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.last = now;
  }

  private serve(now: number): void {
    this.bx = 0.5;
    this.by = rnd(0.3, 0.7);
    const sp = 0.35 + this.hits * 0.006;
    this.vx = (Math.random() < 0.5 ? -1 : 1) * sp;
    this.vy = rnd(-0.3, 0.3);
    this.serveAt = now + 700;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (!this.started && sideOf(slot) !== 0) {
      this.started = true;
      this.t0 = ts;
      this.last = ts;
      this.serve(ts);
    }
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  private side(s: number): boolean {
    for (let k = 0; k < 6; k++) if (this.held & (1 << k) && sideOf(k) === s) return true;
    return false;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    const len = scaled(RALLY_MS);
    if (this.started && (now - this.t0 >= len || this.lost >= RALLY_LIVES)) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const PH = 0.22;
    if (this.started) {
      // Held, a paddle rises; let go, it sinks.
      for (let s = 0; s < 2; s++) {
        this.pv[s]! += (this.side(s ? 1 : -1) ? 3.2 : -2.6) * dt;
        this.pv[s]! *= Math.pow(0.02, dt);
        this.pad[s] = Math.max(PH / 2, Math.min(1 - PH / 2, this.pad[s]! + this.pv[s]! * dt));
        if (this.pad[s] === PH / 2 || this.pad[s] === 1 - PH / 2) this.pv[s] = 0;
      }
      if (now >= this.serveAt) {
        this.bx += this.vx * dt;
        this.by += this.vy * dt;
        if (this.by < 0.03 || this.by > 0.97) {
          this.vy = -this.vy;
          this.by = Math.max(0.03, Math.min(0.97, this.by));
        }
        const s = this.bx < 0.05 ? 0 : this.bx > 0.95 ? 1 : -1;
        if (s >= 0) {
          if (Math.abs(this.by - this.pad[s]!) <= PH / 2 + 0.02) {
            this.hits++;
            this.run++;
            this.best = Math.max(this.best, this.run);
            this.vx = -this.vx * 1.02;
            this.vy += (this.by - this.pad[s]!) * 1.5;
            this.vy = Math.max(-0.7, Math.min(0.7, this.vy));
            this.bx = s ? 0.95 : 0.05;
            this.env.sound(s ? SND_TAP_R : SND_TAP_L);
          } else if (this.bx < -0.02 || this.bx > 1.02) {
            this.lost++;
            this.run = 0;
            this.env.sound(SND_FALL);
            this.serve(now);
          }
        }
      }
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'returns', String(this.hits), 'time', `${left} s`, RALLY_LIVES - this.lost, RALLY_LIVES);
    const W = Math.min(a.right - a.left, 760 * a.u);
    const H = Math.min(a.bottom - a.top - 40 * a.u, W * 0.55);
    const x0 = a.cx - W / 2;
    const y0 = a.top + 10 * a.u;
    ctx.strokeStyle = COL_FAINT;
    ctx.lineWidth = 1.5 * dpr;
    ctx.strokeRect(x0, y0, W, H);
    ctx.setLineDash?.([4 * dpr, 6 * dpr]);
    ctx.beginPath();
    ctx.moveTo(a.cx, y0);
    ctx.lineTo(a.cx, y0 + H);
    ctx.stroke();
    ctx.setLineDash?.([]);
    for (let s = 0; s < 2; s++) {
      const px = s ? x0 + W * 0.95 : x0 + W * 0.05 - 8 * a.u;
      const py = y0 + (1 - this.pad[s]!) * H;
      ctx.fillStyle = this.side(s ? 1 : -1) ? COL_LINE : '#a8a8b0';
      ctx.fillRect(px, py - (PH / 2) * H, 8 * a.u, PH * H);
    }
    if (this.started) {
      ctx.fillStyle = now < this.serveAt ? COL_DIM : COL_ACCENT;
      ctx.beginPath();
      ctx.arc(x0 + this.bx * W, y0 + (1 - this.by) * H, 7 * a.u, 0, TAU);
      ctx.fill();
    }
    const off = Math.min(220 * a.u, W / 2 - 20 * a.u);
    ctx.fillStyle = COL_MID;
    v.text(`${handLabel(this.env, -1)}  hold to raise`, a.cx - off, a.bottom - 6 * a.u, v.fontTiny, 'center');
    v.text(`hold to raise  ${handLabel(this.env, 1)}`, a.cx + off, a.bottom - 6 * a.u, v.fontTiny, 'center');
    if (!this.started) v.text('each hand runs one paddle: hold its key to raise it, let go to let it sink. press to start', a.cx, a.bottom - 30 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.hits * 20 + this.best * 10,
      primary: { label: 'returns', value: this.hits, unit: '' },
      lines: [
        { label: 'returns', value: String(this.hits) },
        { label: 'longest rally', value: String(this.best) },
        { label: 'balls lost', value: String(this.lost) },
      ],
      saved: this.started && this.hits + this.lost >= 2,
    };
  }
}

export const BATCH59: MiniDef[] = [
  { id: 'dots', name: 'Dots', skill: 'speed', blurb: 'A scatter of dots. How many? Answer at a glance, over and over.', how: 'A scatter of dots: press how many there are (1 to 9, or click the number), and the next appears at once. Up to six at first, then up to nine, where you can no longer see the number at a glance and must count. Thirty seconds; mistakes count against you.', input: 'pointer', make: () => new Dots() },
  { id: 'symbols', name: 'Symbols', skill: 'dexterity', blurb: 'Type strings full of symbols: prices, emails, brackets, percentages.', how: 'Short strings that send your fingers to the symbol keys: prices like $12.50, emails, brackets, percentages, hashtags, paths and bits of code. Type each exactly, spaces included. A wrong key is refused and counted. A minute.', input: 'type', make: () => new Symbols() },
  { id: 'still', name: 'Still', skill: 'aim', blurb: 'Bring the pointer into a small circle and hold it there, steady.', how: 'A circle appears: move the pointer into it and keep it inside until the ring around it fills, a second and a half. Slip out and the hold starts again. The circles shrink as you go, so the last ones need a very steady hand. Fifteen circles; no clicking after the first.', input: 'pointer', make: () => new Still() },
  { id: 'rally', name: 'Rally', skill: 'coordination', blurb: 'Two paddles, one per hand: hold to raise, let go to sink. Keep the ball in.', how: 'A paddle on each side, one for each hand. Hold the hand’s key to raise its paddle; let go and it sinks. Meet the ball on both sides to keep it in play: where it hits the paddle sets its angle. It speeds up with every return. Five balls, or ninety seconds.', input: 'keys', minKeys: 2, make: () => new Rally() },
];
