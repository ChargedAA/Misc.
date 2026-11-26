// Sixty-sixth batch.
//   Bounces - one bright ball among grey ones: count how often it hits the walls.
//   Velo    - watch a dot's speed, then set your own dot to the same speed from memory.
//   Roman   - Roman numerals: type the number.
//   Reset   - click the middle, then the target that appears; back to the middle each time.

import { COL_ACCENT, COL_DIM, COL_FAINT, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALSE, SND_TAP_WEAK } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, handLabel, header, mean, median, ms, pct, scaled, sideOf, type Mini, type MiniDef, type MiniEnv, type MiniResult, plural } from './kit.ts';

const TAU = Math.PI * 2;
const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const rint = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
type Rect = [number, number, number, number];
const digitOf = (code: string) => (code.startsWith('Digit') ? code.slice(5) : code.startsWith('Numpad') ? code.slice(6) : '');

// --- Bounces ---------------------------------------------------------------------------

const BOUNCE_ROUNDS = 10;

type Ball = { x: number; y: number; vx: number; vy: number };

class Bounces implements Mini {
  private env!: MiniEnv;
  private round = 0;
  private balls: Ball[] = [];
  private hits = 0;
  private startAt = 0;
  private dur = 8000;
  private last = 0;
  private typed = '';
  /** 0 ready, 1 running, 2 answer, 3 feedback. */
  private state = 0;
  private at = 0;
  private right = 0;
  private offs: number[] = [];
  private lastOk = true;
  private firstAt = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.firstAt = now;
    this.at = now + 800;
  }

  private arm(now: number): void {
    const n = Math.min(6, 2 + Math.floor(this.round / 2));
    const sp = 0.35 + this.round * 0.03;
    this.balls = Array.from({ length: n }, () => {
      const a = rnd(0, TAU);
      return { x: rnd(0.2, 0.8), y: rnd(0.2, 0.8), vx: Math.cos(a) * sp * rnd(0.7, 1.2), vy: Math.sin(a) * sp * rnd(0.7, 1.2) };
    });
    this.hits = 0;
    this.dur = rnd(6000, 10000);
    this.startAt = now;
    this.last = now;
    this.typed = '';
    this.state = 1;
  }

  press(): void {}

  typeKey(code: string, ts: number): boolean {
    if (this.state !== 2) return !!digitOf(code);
    const d = digitOf(code);
    if (d) {
      if (this.typed.length < 2) this.typed += d;
      return true;
    }
    if (code === 'Backspace') {
      this.typed = this.typed.slice(0, -1);
      return true;
    }
    if ((code === 'Enter' || code === 'NumpadEnter' || code === 'Space') && this.typed) {
      const got = Number(this.typed);
      const ok = got === this.hits;
      this.lastOk = ok;
      this.offs.push(Math.abs(got - this.hits));
      if (ok) this.right++;
      this.env.sound(ok ? SND_CATCH : SND_FALSE);
      this.round++;
      this.state = 3;
      this.at = ts + 1500;
      return true;
    }
    return false;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.at) this.arm(now);
    if (this.state === 1) {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      const r = 0.03;
      this.balls.forEach((b, k) => {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        let hit = false;
        if (b.x < r || b.x > 1 - r) {
          b.vx = -b.vx;
          b.x = Math.max(r, Math.min(1 - r, b.x));
          hit = true;
        }
        if (b.y < r || b.y > 1 - r) {
          b.vy = -b.vy;
          b.y = Math.max(r, Math.min(1 - r, b.y));
          hit = true;
        }
        if (hit && k === 0) this.hits++;
      });
      if (now - this.startAt >= this.dur) this.state = 2;
    }
    if (this.state === 3 && now >= this.at) {
      if (this.round >= scaled(BOUNCE_ROUNDS)) return true;
      this.state = 0;
      this.at = now + 400;
    }
    if (now - this.firstAt > 600000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'right', String(this.right), 'run', `${Math.min(this.round + 1, scaled(BOUNCE_ROUNDS))} / ${scaled(BOUNCE_ROUNDS)}`);
    const S = Math.min(a.bottom - a.top - 70 * a.u, a.right - a.left);
    const x0 = a.cx - S / 2;
    const y0 = a.top + 6 * a.u;
    ctx.strokeStyle = COL_DIM;
    ctx.lineWidth = 2 * dpr;
    ctx.strokeRect(x0, y0, S, S);
    if (this.state === 1) {
      this.balls.forEach((b, k) => {
        ctx.fillStyle = k === 0 ? COL_LINE : '#5a5a62';
        ctx.beginPath();
        ctx.arc(x0 + b.x * S, y0 + b.y * S, 0.03 * S, 0, TAU);
        ctx.fill();
      });
    } else if (this.state >= 2) {
      ctx.font = `600 ${Math.round(40 * a.u)}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = this.state === 3 && !this.lastOk ? COL_ACCENT : COL_LINE;
      ctx.fillText(this.typed || '_', a.cx, y0 + S / 2);
      if (this.state === 3 && !this.lastOk) {
        ctx.fillStyle = COL_MID;
        v.text(`it hit the walls ${this.hits} times`, a.cx, y0 + S / 2 + 46 * a.u, v.fontTiny, 'center');
      }
    }
    ctx.fillStyle = COL_MID;
    v.text(this.state === 2 ? 'how many times did the white ball hit a wall? type it, then Enter' : this.round === 0 && this.state < 2 ? 'count how often the white ball hits the walls; ignore the grey ones' : '', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.offs.length ? this.right * 100 + Math.round(Math.max(0, 10 - mean(this.offs)) * 10) : 0,
      primary: { label: 'counted right', value: this.right, unit: `of ${this.round}` },
      lines: [
        { label: 'right', value: `${this.right} of ${this.round}` },
        { label: 'typical miss when wrong', value: this.offs.some((o) => o > 0) ? String(median(this.offs.filter((o) => o > 0))) : '–' },
      ],
      saved: this.round >= 3,
    };
  }
}

// --- Velo (speed from memory) ----------------------------------------------------------

const VELO_ROUNDS = 12;
const WATCH_MS = 3000;
const SET_MS = 6000;

class Velo implements Mini {
  private env!: MiniEnv;
  private round = 0;
  private ref = 0.3;
  private mine = 0.3;
  private refX = 0;
  private myX = 0;
  /** 0 watching, 1 setting, 2 result. */
  private state = 0;
  private at = 0;
  private last = 0;
  private errs: number[] = [];
  private lastErr = 0;
  private held = 0;
  private firstAt = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.firstAt = now;
    this.arm(now);
  }

  private arm(now: number): void {
    this.ref = rnd(0.15, 0.6);
    // Your dot starts well off: either half or double, roughly.
    this.mine = this.ref * (Math.random() < 0.5 ? rnd(0.4, 0.7) : rnd(1.4, 2));
    this.refX = 0;
    this.myX = 0;
    this.state = 0;
    this.at = now + WATCH_MS;
    this.last = now;
  }

  press(slot: number): void {
    this.held |= 1 << slot;
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
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.state === 0) {
      this.refX = (this.refX + this.ref * dt) % 1;
      if (now >= this.at) {
        this.state = 1;
        this.at = now + SET_MS;
      }
    } else if (this.state === 1) {
      this.mine = Math.max(0.03, Math.min(1.2, this.mine * Math.pow(1.6, this.steer() * dt)));
      this.myX = (this.myX + this.mine * dt) % 1;
      if (now >= this.at) {
        this.lastErr = (this.mine - this.ref) / this.ref;
        this.errs.push(Math.abs(this.lastErr));
        this.env.sound(Math.abs(this.lastErr) < 0.08 ? SND_CATCH : SND_TAP_WEAK);
        this.round++;
        this.state = 2;
        this.at = now + 1800;
      }
    } else if (now >= this.at) {
      if (this.round >= scaled(VELO_ROUNDS)) return true;
      this.arm(now);
    }
    if (this.state === 2) {
      this.refX = (this.refX + this.ref * dt) % 1;
      this.myX = (this.myX + this.mine * dt) % 1;
    }
    if (now - this.firstAt > 600000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'off by', this.errs.length ? pct(mean(this.errs.slice(-3))) : '–', 'round', `${Math.min(this.round + 1, scaled(VELO_ROUNDS))} / ${scaled(VELO_ROUNDS)}`);
    const W = Math.min(a.right - a.left - 40 * a.u, 640 * a.u);
    const x0 = a.cx - W / 2;
    const rows: [number, string, boolean][] = [[a.cy - 50 * a.u, 'the speed to match', this.state !== 1], [a.cy + 30 * a.u, 'yours', this.state >= 1]];
    rows.forEach(([y, label, on], k) => {
      ctx.fillStyle = COL_FAINT;
      ctx.fillRect(x0, y, W, 2 * dpr);
      ctx.fillStyle = COL_MID;
      v.text(label, x0, y - 16 * a.u, v.fontTiny, 'left');
      if (on) {
        ctx.fillStyle = k ? COL_LINE : '#a8a8b0';
        ctx.beginPath();
        ctx.arc(x0 + (k ? this.myX : this.refX) * W, y, 9 * a.u, 0, TAU);
        ctx.fill();
      }
    });
    if (this.state === 1) {
      ctx.fillStyle = COL_ACCENT;
      ctx.fillRect(x0, a.bottom - 40 * a.u, W * ((this.at - now) / SET_MS), 3 * dpr);
    }
    ctx.fillStyle = COL_MID;
    const msg = this.state === 0 ? 'watch its speed' : this.state === 1 ? 'hold left for slower, right for faster: match it from memory' : `${this.lastErr >= 0 ? 'faster' : 'slower'} by ${pct(Math.abs(this.lastErr))}`;
    v.text(msg, a.cx, a.bottom - 6 * a.u, v.fontTiny, 'center');
    if (this.state === 1) {
      const off = Math.min(200 * a.u, (a.right - a.left) / 2 - 30 * a.u);
      v.text(handLabel(this.env, -1), a.cx - off, a.bottom - 6 * a.u, v.fontTiny, 'center');
      v.text(handLabel(this.env, 1), a.cx + off, a.bottom - 6 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const m = mean(this.errs);
    return {
      score: this.errs.length ? Math.max(0, Math.round((0.5 - m) * 4000)) : 0,
      primary: { label: 'average miss', value: Math.round(m * 100), unit: '%', lower: true },
      lines: [
        { label: 'average miss', value: this.errs.length ? pct(m) : '–' },
        { label: 'within 8%', value: this.errs.length ? pct(this.errs.filter((e) => e < 0.08).length / this.errs.length) : '–' },
      ],
      saved: this.errs.length >= 3,
    };
  }
}

// --- Roman -----------------------------------------------------------------------------

const ROMAN_MS = 60000;

function roman(n: number): string {
  const table: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let s = '';
  for (const [v, r] of table) while (n >= v) {
    s += r;
    n -= v;
  }
  return s;
}

class Roman implements Mini {
  private env!: MiniEnv;
  private n = 0;
  private typed = '';
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
    const max = this.ok < 5 ? 40 : this.ok < 12 ? 400 : 3999;
    this.n = rint(2, max);
    this.typed = '';
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
      if (this.typed.length < 4) this.typed += d;
      return true;
    }
    if (code === 'Backspace') {
      this.typed = this.typed.slice(0, -1);
      return true;
    }
    if ((code === 'Enter' || code === 'NumpadEnter' || code === 'Space') && this.typed) {
      if (Number(this.typed) === this.n) {
        this.ok++;
        this.rts.push(ts - this.at);
        this.env.sound(SND_CATCH);
      } else {
        this.bad++;
        this.note = `${roman(this.n)} = ${this.n}`;
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
    const len = scaled(ROMAN_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'right', String(this.ok), 'time', `${left} s`);
    ctx.font = `500 ${Math.round(48 * a.u)}px Georgia, "Times New Roman", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COL_LINE;
    ctx.fillText(this.started ? roman(this.n) : 'XLII = ?', a.cx, a.cy - 50 * a.u);
    if (this.started) {
      ctx.font = `600 ${Math.round(34 * a.u)}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = COL_MID;
      ctx.fillText(this.typed || '_', a.cx, a.cy + 20 * a.u);
    }
    if (now < this.flash) {
      ctx.fillStyle = COL_ACCENT;
      v.text(this.note, a.cx, a.cy + 70 * a.u, v.fontTiny, 'center');
    }
    ctx.fillStyle = COL_MID;
    v.text(this.started ? 'type the number, then Enter' : 'press Space to start: turn Roman numerals into numbers. a minute', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: Math.max(0, this.ok * 40 - this.bad * 30),
      primary: { label: 'right in a minute', value: this.ok, unit: '' },
      lines: [
        { label: 'right', value: String(this.ok) },
        { label: 'wrong', value: String(this.bad) },
        { label: 'typical time a numeral', value: this.rts.length ? ms(median(this.rts)) : '–' },
      ],
      saved: this.ok + this.bad >= 3,
    };
  }
}

// --- Reset (centre-out pointing) -------------------------------------------------------

const RESET_TRIALS = 25;

class Reset implements Mini {
  private env!: MiniEnv;
  private n = 0;
  /** 0 waiting at the middle, 1 target out. */
  private state = 0;
  private tx = 0;
  private ty = 0;
  private tr = 0.04;
  private goAt = 0;
  private times: number[] = [];
  private misses = 0;
  private field: Rect = [0, 0, 1, 1];
  private flash = 0;
  private firstAt = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.firstAt = now;
  }

  press(): void {}

  pointer(x: number, y: number, ts: number): void {
    const [fx, fy, fw, fh] = this.field;
    const cx = fx + fw / 2;
    const cy = fy + fh / 2;
    if (this.state === 0) {
      if (Math.hypot(x - cx, y - cy) > fh * 0.04) return;
      const ang = rnd(0, TAU);
      const d = rnd(0.2, 0.45);
      this.tx = 0.5 + (Math.cos(ang) * d * fh) / fw;
      this.ty = 0.5 + Math.sin(ang) * d;
      this.tr = rnd(0.015, 0.045);
      this.goAt = ts;
      this.state = 1;
      return;
    }
    const px = fx + this.tx * fw;
    const py = fy + this.ty * fh;
    if (Math.hypot(x - px, y - py) <= this.tr * fh) {
      this.times.push(ts - this.goAt);
      this.n++;
      this.state = 0;
      this.env.sound(SND_TAP_WEAK);
    } else {
      this.misses++;
      this.flash = ts + 200;
      this.env.sound(SND_FALSE);
    }
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.n >= scaled(RESET_TRIALS)) return true;
    if (now - this.firstAt > 600000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'typical', this.times.length ? ms(median(this.times)) : '–', 'target', `${Math.min(this.n + 1, scaled(RESET_TRIALS))} / ${scaled(RESET_TRIALS)}`);
    const fh = a.bottom - a.top - 30 * a.u;
    const fw = a.right - a.left;
    const fx = a.left;
    const fy = a.top + 4 * a.u;
    this.field = [fx, fy, fw, fh];
    const cx = fx + fw / 2;
    const cy = fy + fh / 2;
    ctx.strokeStyle = this.state === 0 ? COL_LINE : COL_DIM;
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.arc(cx, cy, fh * 0.04, 0, TAU);
    ctx.stroke();
    if (this.state === 1) {
      ctx.fillStyle = now < this.flash ? COL_ACCENT : COL_LINE;
      ctx.beginPath();
      ctx.arc(fx + this.tx * fw, fy + this.ty * fh, this.tr * fh, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = COL_MID;
    v.text(this.n === 0 && this.state === 0 ? 'click the ring in the middle, then the target that appears; back to the middle each time' : plural(this.misses, 'miss', 'misses'), a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const m = median(this.times);
    const shots = this.times.length + this.misses;
    return {
      score: this.times.length ? Math.max(0, Math.round(this.times.length * Math.max(0, 1500 - m) / 15) - this.misses * 15) : 0,
      primary: { label: 'typical time to target', value: m, unit: 'ms', lower: true },
      lines: [
        { label: 'typical time to target', value: this.times.length ? ms(m) : '–' },
        { label: 'accuracy', value: shots ? pct(this.times.length / shots) : '–' },
      ],
      saved: this.times.length >= 5,
    };
  }
}

export const BATCH66: MiniDef[] = [
  { id: 'bounces', name: 'Bounces', skill: 'attention', blurb: 'One bright ball among grey ones. Count how often it hits the walls.', how: 'Balls bounce around a box. Follow the white one and count every time it hits a wall; ignore the grey ones. When they stop, type the count and press Enter. More balls, and faster, as you go. Ten runs.', input: 'type', make: () => new Bounces() },
  { id: 'velo', name: 'Velo', skill: 'judgement', blurb: 'Watch a dot’s speed, then set your own to the same speed from memory.', how: 'A grey dot runs along a track for three seconds; note its speed. Then it vanishes and your dot appears, too slow or too fast: hold left to slow it, right to speed it up, until it matches. After six seconds it locks in. Twelve rounds; scored as a percentage off.', input: 'keys', minKeys: 2, make: () => new Velo() },
  { id: 'roman', name: 'Roman', skill: 'reasoning', blurb: 'Roman numerals: type the number.', how: 'A Roman numeral appears: type its value and press Enter. Small ones first (up to XL), then up to CD, then any year up to MMMCMXCIX. A minute; a mistake shows the answer.', input: 'type', make: () => new Roman() },
  { id: 'reset', name: 'Reset', skill: 'aim', blurb: 'Click the middle, then the target that appears. Back to the middle each time.', how: 'Click the ring in the middle: a target appears somewhere around it, at a random distance and size. Click it, then come back to the middle for the next. Each move starts from the same place, so it measures pure pointing. Twenty-five targets.', input: 'pointer', make: () => new Reset() },
];
