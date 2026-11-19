// Fifth batch.
//   Side   - the shade says which hand; where it appears pulls the other way (Simon task).
//   Tug    - tug of war against a rate that keeps rising.
//   Second - hold a key for exactly the time shown, without a clock.
//   Digits - remember a number and type it back (sometimes backwards).
//   Alert  - a counter starts at random; stop it fast. Two minutes. Lapses count.
//   Zigzag - hold to rise, let go to fall, through a corridor that narrows.

import { ANTICIPATION_MS, COL_ACCENT, COL_DIM, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALL, SND_FALSE, SND_TAP_L, SND_TAP_R, SND_TAP_WEAK, SND_TONE, SND_UI } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import {
  Stair,
  arena,
  clamp,
  footer,
  foreperiod,
  handLabel,
  header,
  mean,
  median,
  message,
  ms,
  pct,
  sideOf,
  type Mini,
  type MiniDef,
  type MiniEnv,
  type MiniResult,
  gameNow,
} from './kit.ts';

const TAU = Math.PI * 2;
const GREY = '#6c6c74';
const STRIKES = 3;

// --- Side (Simon task) ------------------------------------------------------------

const SIDE_TRIALS = 40;

class Side implements Mini {
  private env!: MiniEnv;
  private i = 0;
  private state = 0;
  private at = 0;
  private grey = false;
  private pos = -1;
  private drawnAt = 0;
  private readonly win = new Stair(1200, 60, 380, 1500);
  private same: number[] = [];
  private cross: number[] = [];
  private errors = 0;
  private slow = 0;
  private score = 0;
  private feedback = '';
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.arm(now + 600);
  }

  private arm(now: number): void {
    this.state = 0;
    this.at = now + 300 + Math.random() * 400;
    this.grey = Math.random() < 0.5;
    this.pos = Math.random() < 0.5 ? -1 : 1;
    this.drawnAt = 0;
  }

  private end(now: number, ok: boolean, rt: number, text: string): void {
    this.i++;
    this.state = 2;
    this.feedback = text;
    this.at = now + (ok ? 140 : 800);
    this.win.update(ok, -1);
    if (ok) {
      const want = this.grey ? 1 : -1;
      (want === this.pos ? this.same : this.cross).push(rt);
      this.score += 10 + (want !== this.pos ? 5 : 0) + Math.max(0, Math.round((this.win.level - rt) / 40));
      this.env.sound(SND_TAP_WEAK);
    } else this.env.sound(SND_FALSE);
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (this.state !== 1 || this.drawnAt === 0) return;
    const side = sideOf(slot);
    if (side === 0) return;
    const rt = ts - this.drawnAt;
    if (rt < ANTICIPATION_MS) return;
    const want = this.grey ? 1 : -1;
    if (side === want) this.end(ts, true, rt, '');
    else {
      this.errors++;
      this.end(ts, false, 0, this.grey ? 'grey: right hand' : 'white: left hand');
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
      if (this.i >= SIDE_TRIALS) return true;
      this.arm(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'score', String(this.score), 'trial', `${Math.min(this.i + 1, SIDE_TRIALS)} / ${SIDE_TRIALS}`);
    const off = Math.min(220 * a.u, (a.right - a.left) / 2 - 40 * a.u);
    ctx.fillStyle = COL_DIM;
    ctx.fillRect(a.cx - 2 * dpr, a.cy - 2 * dpr, 4 * dpr, 4 * dpr);
    if (this.state === 1) {
      ctx.fillStyle = this.grey ? GREY : COL_LINE;
      ctx.beginPath();
      ctx.arc(a.cx + this.pos * off, a.cy, 34 * a.u, 0, TAU);
      ctx.fill();
      if (this.drawnAt === 0) this.drawnAt = gameNow();
    } else if (this.state === 2 && this.feedback) message(v, a, this.feedback, '', COL_MID);
    ctx.fillStyle = COL_MID;
    v.text(`white  ${handLabel(this.env, -1)}`, a.cx - off, a.bottom - 20 * dpr, v.fontTiny, 'center');
    v.text(`grey  ${handLabel(this.env, 1)}`, a.cx + off, a.bottom - 20 * dpr, v.fontTiny, 'center');
    if (this.i < 3) v.text('the shade decides the hand, not the side it appears on', a.cx, a.bottom - 40 * dpr, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const cost = this.same.length && this.cross.length ? median(this.cross) - median(this.same) : 0;
    const done = this.i || 1;
    return {
      score: this.score,
      primary: { label: 'side pull', value: cost, unit: 'ms', lower: true, zeroOk: true },
      lines: [
        { label: 'appears on the answer side', value: ms(median(this.same)) },
        { label: 'appears on the other side', value: ms(median(this.cross)) },
        { label: 'cost of the wrong side', value: ms(cost) },
        { label: 'correct', value: pct((done - this.errors - this.slow) / done) },
      ],
      rts: [...this.same, ...this.cross],
      saved: this.i >= 10,
    };
  }
}

// --- Tug --------------------------------------------------------------------------

class Tug implements Mini {
  private env!: MiniEnv;
  private t0 = 0;
  private last = 0;
  private times: number[] = [];
  /** Rope position: -1 you lose, +1 you win the round. */
  private rope = 0;
  private round = 0;
  private wins = 0;
  private base = 4;
  private state = 0; // 0 ready, 1 pulling, 2 between
  private at = 0;
  private bestRate = 0;
  private held = 0;
  private result0 = '';

  start(env: MiniEnv, now: number): void {
    this.env = env;
    const keys = env.mode.left + env.mode.right;
    this.base = keys <= 1 ? 3.5 : keys === 2 ? 5 : 7;
    this.last = now;
  }

  /** The opponent's rate: rises through a round and with each round won. */
  private them(t: number): number {
    return this.base + this.round * 0.9 + (t / 1000) * 0.25 + Math.sin(t / 700) * 0.6;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (slot === 6) return;
    if (this.state === 0) {
      this.state = 1;
      this.t0 = ts;
      this.rope = 0;
      this.times = [];
    }
    if (this.state !== 1) return;
    this.times.push(ts);
    this.env.sound(sideOf(slot) > 0 ? SND_TAP_R : SND_TAP_L);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    let rate = 0;
    for (let i = this.times.length - 1; i >= 0 && now - this.times[i]! <= 1000; i--) rate++;
    if (this.state === 1) {
      const t = now - this.t0;
      const them = this.them(t);
      if (t > 1200 && rate > this.bestRate) this.bestRate = rate;
      this.rope = clamp(this.rope + (rate - them) * 0.045 * dt, -1, 1);
      if (Math.abs(this.rope) >= 1) {
        const won = this.rope > 0;
        if (won) this.wins++;
        this.result0 = won ? 'pulled over' : 'pulled under';
        this.env.sound(won ? SND_CATCH : SND_FALL);
        this.round++;
        this.state = 2;
        this.at = now + 1500;
        if (!won) this.round = 99;
      }
    } else if (this.state === 2 && now >= this.at) {
      if (this.round >= 99) return true;
      this.state = 0;
      this.rope = 0;
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'rounds won', String(this.wins), 'them', this.state === 1 ? `${this.them(now - this.t0).toFixed(1)} /s` : '–');
    const half = Math.min((a.right - a.left) / 2 - 20 * a.u, 280 * a.u);
    const y = a.cy;
    // The rope, the centre mark, and the two win lines.
    ctx.fillStyle = COL_DIM;
    ctx.fillRect(a.cx - half, y, half * 2, dpr);
    ctx.fillRect(a.cx - half, y - 30 * a.u, dpr, 60 * a.u);
    ctx.fillRect(a.cx + half, y - 30 * a.u, dpr, 60 * a.u);
    ctx.fillStyle = COL_MID;
    ctx.fillRect(a.cx - dpr / 2, y - 12 * a.u, dpr, 24 * a.u);
    const kx = a.cx + this.rope * half;
    ctx.fillStyle = COL_ACCENT;
    ctx.fillRect(kx - 4 * a.u, y - 18 * a.u, 8 * a.u, 36 * a.u);
    ctx.fillStyle = COL_MID;
    v.text('you', a.cx + half, y + 50 * a.u, v.fontTiny, 'right');
    v.text('them', a.cx - half, y + 50 * a.u, v.fontTiny, 'left');
    ctx.fillStyle = COL_LINE;
    v.text(`${rate} /s`, a.cx, y - 50 * a.u, v.fontHud, 'center');
    if (this.state === 0) message(v, { ...a, cy: y + 90 * a.u }, this.round ? `round ${this.round + 1}: they pull harder` : 'tap to start pulling', 'out-tap them to drag the marker to your side', COL_MID);
    if (this.state === 2) message(v, { ...a, cy: y + 90 * a.u }, this.result0);
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.wins * 200 + this.bestRate * 10,
      primary: { label: 'rounds won', value: this.wins, unit: '' },
      lines: [
        { label: 'rounds won', value: String(this.wins) },
        { label: 'best rate', value: `${this.bestRate} /s` },
      ],
      saved: this.round > 0,
    };
  }
}

// --- Second (duration production) -------------------------------------------------

const SECOND_TRIALS = 12;

class Second implements Mini {
  private env!: MiniEnv;
  private i = 0;
  private target = 1000;
  private downAt = 0;
  private state = 0; // 0 ready, 1 holding, 2 feedback
  private at = 0;
  private errs: number[] = [];
  private last = 0;
  private holding = -1;

  start(env: MiniEnv): void {
    this.env = env;
    this.next();
  }

  private next(): void {
    this.target = [500, 750, 1000, 1500, 2000, 2500, 3000][Math.floor(Math.random() * 7)]!;
    this.state = 0;
  }

  press(slot: number, ts: number): void {
    if (this.state !== 0) return;
    this.state = 1;
    this.downAt = ts;
    this.holding = slot;
    this.env.sound(SND_TAP_WEAK);
  }

  release(slot: number, ts: number): void {
    if (this.state !== 1 || slot !== this.holding) return;
    const held = ts - this.downAt;
    this.last = (held - this.target) / this.target;
    this.errs.push(this.last);
    this.env.sound(Math.abs(this.last) < 0.04 ? SND_CATCH : SND_TAP_WEAK);
    this.i++;
    this.state = 2;
    this.at = ts + 1300;
  }

  pointer(): void {}

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 2 && now >= this.at) {
      if (this.i >= SECOND_TRIALS) return true;
      this.next();
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'hold', `${(this.target / 1000).toFixed(2)} s`, 'trial', `${Math.min(this.i + 1, SECOND_TRIALS)} / ${SECOND_TRIALS}`);
    const r = 60 * a.u;
    ctx.beginPath();
    ctx.arc(a.cx, a.cy - 20 * a.u, r, 0, TAU);
    if (this.state === 1) {
      ctx.fillStyle = COL_LINE;
      ctx.fill();
    } else {
      ctx.strokeStyle = this.state === 2 ? COL_MID : COL_DIM;
      ctx.lineWidth = dpr;
      ctx.stroke();
    }
    ctx.fillStyle = this.state === 1 ? '#0a0a0b' : COL_LINE;
    v.text(`${(this.target / 1000).toFixed(2)}`, a.cx, a.cy - 12 * a.u, v.fontHud, 'center');
    if (this.state === 0) message(v, { ...a, cy: a.cy + 80 * a.u }, `hold any key for exactly ${(this.target / 1000).toFixed(2)} seconds`, 'no clock: count it in your head', COL_MID);
    else if (this.state === 2) {
      const e = this.last;
      message(v, { ...a, cy: a.cy + 80 * a.u }, `${e > 0 ? '+' : ''}${(e * 100).toFixed(1)}%`, `you held ${((this.target * (1 + e)) / 1000).toFixed(3)} s`);
    }
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const abs = this.errs.map(Math.abs);
    const m = mean(abs);
    const signed = mean(this.errs);
    return {
      score: this.i ? Math.round(Math.max(0, 0.3 - m) * 4000) : 0,
      primary: { label: 'average error', value: Math.round(m * 1000) / 10, unit: '%', lower: true, decimals: 1 },
      lines: [
        { label: 'average error', value: `${(m * 100).toFixed(1)}%` },
        { label: 'within 3%', value: pct(abs.filter((x) => x < 0.03).length / (abs.length || 1)) },
        { label: 'tendency', value: `${signed >= 0 ? 'long' : 'short'} by ${(Math.abs(signed) * 100).toFixed(1)}%` },
      ],
      saved: this.i >= 4,
    };
  }
}

// --- Digits -----------------------------------------------------------------------

class Digits implements Mini {
  private env!: MiniEnv;
  private len = 3;
  private number = '';
  private typed = '';
  private backwards = false;
  private round = 0;
  private state = 0; // 0 showing, 1 typing, 2 feedback
  private at = 0;
  private strikes = 0;
  private best = 0;
  private bestBack = 0;
  private ok = true;
  private keys: [number, number, number, number, string][] = [];

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.next(now + 500);
  }

  private next(at: number): void {
    this.round++;
    this.backwards = this.round > 3 && this.round % 3 === 0;
    let s = '';
    for (let i = 0; i < this.len; i++) {
      let d = String(Math.floor(Math.random() * 10));
      if (s.endsWith(d)) d = String((Number(d) + 1 + Math.floor(Math.random() * 9)) % 10);
      s += d;
    }
    this.number = s;
    this.typed = '';
    this.state = 0;
    this.at = at;
  }

  private type(d: string, ts: number): void {
    if (this.state !== 1) return;
    if (d === '<') {
      this.typed = this.typed.slice(0, -1);
      return;
    }
    this.typed += d;
    this.env.sound(SND_TONE + (Number(d) % 7));
    if (this.typed.length === this.number.length) {
      const want = this.backwards ? [...this.number].reverse().join('') : this.number;
      this.ok = this.typed === want;
      if (this.ok) {
        if (this.backwards) this.bestBack = Math.max(this.bestBack, this.len);
        else this.best = Math.max(this.best, this.len);
        this.len++;
        this.env.sound(SND_CATCH);
      } else {
        this.strikes++;
        this.env.sound(SND_FALSE);
      }
      this.state = 2;
      this.at = ts + 1500;
    }
  }

  press(): void {}

  /** Digit keys on a keyboard work too (they are not lift keys). */
  typeKey(code: string, ts: number): boolean {
    const m = /^(?:Digit|Numpad)(\d)$/.exec(code);
    if (m) {
      this.type(m[1]!, ts);
      return true;
    }
    if (code === 'Backspace') {
      this.type('<', ts);
      return true;
    }
    return false;
  }

  pointer(x: number, y: number, ts: number): void {
    for (const [kx, ky, w, h, d] of this.keys) if (x >= kx && x <= kx + w && y >= ky && y <= ky + h) this.type(d, ts);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const showFor = 600 + this.len * 450;
    if (this.state === 0 && now - this.at > showFor) this.state = 1;
    if (this.state === 2 && now >= this.at) {
      if (this.strikes >= STRIKES) return true;
      this.next(now + 300);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'digits', String(this.len), 'best', String(this.best), STRIKES - this.strikes);
    const ty = a.top + 60 * a.u;
    if (this.state === 0 && now >= this.at) {
      ctx.fillStyle = COL_LINE;
      v.text(this.number.split('').join(' '), a.cx, ty, v.fontBig, 'center');
      progress2(v, a.cx, ty + 24 * a.u, 120 * a.u, 1 - (now - this.at) / showFor);
    } else if (this.state >= 1) {
      ctx.fillStyle = this.state === 2 ? (this.ok ? COL_LINE : COL_MID) : COL_LINE;
      const shown = this.typed.padEnd(this.number.length, '_');
      v.text(shown.split('').join(' '), a.cx, ty, v.fontBig, 'center');
      if (this.state === 2 && !this.ok) {
        ctx.fillStyle = COL_MID;
        const want = this.backwards ? [...this.number].reverse().join('') : this.number;
        v.text(`it was ${want}`, a.cx, ty + 30 * a.u, v.fontTiny, 'center');
      }
    }
    ctx.fillStyle = this.backwards ? COL_ACCENT : COL_MID;
    v.text(this.backwards ? 'type it BACKWARDS' : this.state === 0 ? 'remember it' : 'type it', a.cx, ty - 46 * a.u, v.fontTiny, 'center');
    // Keypad.
    const kw = Math.min(70 * a.u, (a.right - a.left) / 3.6);
    const kh = kw * 0.62;
    const gap = 8 * a.u;
    const x0 = a.cx - (kw * 3 + gap * 2) / 2;
    const y0 = Math.max(ty + 60 * a.u, a.bottom - (kh * 4 + gap * 3));
    const labels = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '<', '0', ''];
    this.keys = [];
    labels.forEach((d, k) => {
      if (!d) return;
      const x = x0 + (k % 3) * (kw + gap);
      const y = y0 + Math.floor(k / 3) * (kh + gap);
      this.keys.push([x, y, kw, kh, d]);
      ctx.strokeStyle = COL_DIM;
      ctx.lineWidth = dpr;
      ctx.strokeRect(x + 0.5, y + 0.5, kw - 1, kh - 1);
      ctx.fillStyle = this.state === 1 ? COL_LINE : COL_DIM;
      v.text(d === '<' ? 'del' : d, x + kw / 2, y + kh / 2 + 5 * dpr, v.fontHud, 'center');
    });
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.best * 100 + this.bestBack * 120,
      primary: { label: 'span', value: this.best, unit: 'digits' },
      lines: [
        { label: 'longest number forwards', value: String(this.best) },
        { label: 'longest backwards', value: this.bestBack ? String(this.bestBack) : '–' },
      ],
      saved: this.round >= 2,
    };
  }
}

// --- Alert (psychomotor vigilance) ------------------------------------------------

const ALERT_MS = 120000;

class Alert implements Mini {
  private env!: MiniEnv;
  private t0 = 0;
  private state = 0; // 0 waiting, 1 counting, 2 showing result
  private at = 0;
  private drawnAt = 0;
  private rts: number[] = [];
  private falses = 0;
  private last = 0;
  private lastFalse = false;
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.t0 = now;
    this.arm(now);
  }

  private arm(now: number): void {
    this.state = 0;
    this.at = now + foreperiod(2000, 2500, 9000);
    this.drawnAt = 0;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    this.respond(ts);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  pointer(_x: number, _y: number, ts: number): void {
    this.respond(ts);
  }

  private respond(ts: number): void {
    if (this.state === 1 && this.drawnAt > 0) {
      this.last = ts - this.drawnAt;
      if (this.last < ANTICIPATION_MS) return;
      this.rts.push(this.last);
      this.lastFalse = false;
      this.env.sound(this.last < 500 ? SND_TAP_WEAK : SND_UI);
      this.state = 2;
      this.at = ts + 900;
    } else if (this.state === 0) {
      this.falses++;
      this.lastFalse = true;
      this.env.sound(SND_FALSE);
      this.state = 2;
      this.at = ts + 900;
    }
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const left = ALERT_MS - (now - this.t0);
    if (this.state === 0 && now >= this.at) this.state = 1;
    if (this.state === 1 && this.drawnAt > 0 && now - this.drawnAt > 10000) {
      this.rts.push(10000);
      this.last = 10000;
      this.state = 2;
      this.at = now + 900;
    }
    if (this.state === 2 && now >= this.at) {
      if (left <= 0) return true;
      this.arm(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const lapses = this.rts.filter((r) => r >= 500).length;
    header(v, touch, 'lapses', String(lapses), 'left', `${Math.max(0, Math.ceil(left / 1000))} s`);
    ctx.strokeStyle = COL_DIM;
    ctx.lineWidth = dpr;
    ctx.strokeRect(a.cx - 90 * a.u, a.cy - 40 * a.u, 180 * a.u, 80 * a.u);
    if (this.state === 1) {
      if (this.drawnAt === 0) this.drawnAt = gameNow();
      ctx.fillStyle = COL_ACCENT;
      v.text(String(Math.floor(now - this.drawnAt)).padStart(3, '0'), a.cx, a.cy + 16 * dpr, v.fontBig, 'center');
    } else if (this.state === 2) {
      ctx.fillStyle = this.lastFalse ? COL_MID : COL_LINE;
      v.text(this.lastFalse ? 'early' : String(Math.round(this.last)), a.cx, a.cy + 16 * dpr, v.fontBig, 'center');
    }
    if (this.rts.length + this.falses === 0) message(v, { ...a, cy: a.cy + 80 * a.u }, 'when the counter starts, stop it with any key or a tap', 'two minutes; stay with it', COL_MID);
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const ok = this.rts.filter((r) => r < 10000);
    const med = median(ok);
    const lapses = this.rts.filter((r) => r >= 500).length;
    const fastest = [...ok].sort((x, y) => x - y).slice(0, Math.max(1, Math.round(ok.length / 10)));
    return {
      score: ok.length ? Math.max(0, Math.round(Math.max(0, 600 - med) * 3 - lapses * 50 - this.falses * 30 + ok.length * 10)) : 0,
      primary: { label: 'median', value: med, unit: 'ms', lower: true },
      lines: [
        { label: 'median', value: ms(med) },
        { label: 'lapses (500 ms or slower)', value: String(lapses) },
        { label: 'fastest tenth, average', value: ms(mean(fastest)) },
        { label: 'early presses', value: String(this.falses) },
        { label: 'trials', value: String(this.rts.length) },
      ],
      rts: ok,
      saved: this.rts.length >= 6,
    };
  }
}

// --- Zigzag -----------------------------------------------------------------------

class Zigzag implements Mini {
  private env!: MiniEnv;
  private y = 0.5;
  private up = false;
  private x = 0; // distance travelled, in screen widths
  private speed = 0.32;
  private last = 0;
  private started = false;
  private over = false;
  private overAt = 0;
  /** Corridor centre and half-width, sampled every 0.02 screen widths. */
  private cy: number[] = [];
  private hw: number[] = [];
  private trail: number[] = [];
  private flips = 0;
  private holdCount = 0;
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.last = now;
    // A straight, wide start, then the corridor generator takes over.
    for (let i = 0; i < 60; i++) this.push(0.5, 0.3);
    this.extend();
  }

  private push(c: number, w: number): void {
    this.cy.push(c);
    this.hw.push(w);
  }

  /** Extend the corridor: straight diagonals that flip, narrowing with distance. */
  private extend(): void {
    const n = this.cy.length;
    let c = this.cy[n - 1]!;
    let dir = n > 1 && this.cy[n - 1]! < this.cy[n - 2]! ? -1 : 1;
    const w = Math.max(0.085, 0.3 - this.x * 0.006);
    for (let i = 0; i < 100; i++) {
      if (Math.random() < 0.06 + this.x * 0.002 || c + dir * 0.02 > 0.85 - w || c + dir * 0.02 < 0.15 + w) dir = -dir;
      c = clamp(c + dir * 0.02, 0.12 + w, 0.88 - w);
      this.push(c, w);
    }
  }

  private sample(at: number): [number, number] {
    const i = clamp(Math.floor(at / 0.02), 0, this.cy.length - 1);
    return [this.cy[i]!, this.hw[i]!];
  }

  press(slot: number): void {
    this.held |= 1 << slot;
    if (this.over) return;
    this.started = true;
    if (!this.up) {
      this.up = true;
      this.flips++;
      this.env.sound(SND_TAP_R);
    }
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
    if (this.held === 0 && this.up) {
      this.up = false;
      this.flips++;
      this.env.sound(SND_TAP_L);
    }
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.over && now >= this.overAt) return true;
    if (this.started && !this.over) {
      this.speed = 0.32 + this.x * 0.004;
      this.x += this.speed * dt;
      // Diagonal motion: the same speed up or down, 45 degrees on screen.
      this.y += (this.up ? -1 : 1) * this.speed * dt * 1.0;
      if (this.up) this.holdCount += dt;
      if ((this.cy.length - 1) * 0.02 < this.x + 2) this.extend();
      const [c, w] = this.sample(this.x + 0.25);
      if (this.y < c - w || this.y > c + w) {
        this.over = true;
        this.overAt = now + 1300;
        this.env.sound(SND_FALL);
      }
      this.trail.push(this.y);
      if (this.trail.length > 120) this.trail.shift();
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'distance', `${(this.x * 10).toFixed(0)}`, 'speed', `${(this.speed / 0.32).toFixed(2)}×`);
    const W = a.right - a.left;
    const H = a.bottom - a.top;
    const scale = Math.min(W, H);
    const x0 = a.left;
    const y0 = a.top + (H - scale) / 2;
    const toX = (d: number) => x0 + (d - this.x + 0.25) * scale;
    const toY = (yy: number) => y0 + yy * scale;
    ctx.save();
    ctx.beginPath();
    ctx.rect(a.left, a.top, W, H);
    ctx.clip();
    // Corridor walls.
    ctx.strokeStyle = COL_LINE;
    ctx.lineWidth = 1.5 * dpr;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      let first = true;
      for (let d = this.x - 0.3; d < this.x + W / scale; d += 0.02) {
        const [c, w] = this.sample(d);
        const px = toX(d);
        const py = toY(c + side * w);
        if (first) {
          ctx.moveTo(px, py);
          first = false;
        } else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    // Trail and the dart.
    ctx.strokeStyle = COL_ACCENT;
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    this.trail.forEach((ty, i) => {
      const d = this.x - (this.trail.length - 1 - i) * this.speed * 0.0167;
      const px = toX(d);
      if (i) ctx.lineTo(px, toY(ty));
      else ctx.moveTo(px, toY(ty));
    });
    ctx.stroke();
    ctx.globalAlpha = 1;
    const px = toX(this.x);
    const py = toY(this.y);
    // The dart points the way it is going: up-right or down-right.
    const s = 10 * a.u;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(this.up ? -Math.PI / 4 : Math.PI / 4);
    ctx.fillStyle = COL_ACCENT;
    ctx.beginPath();
    ctx.moveTo(s, 0);
    ctx.lineTo(-s * 0.7, s * 0.6);
    ctx.lineTo(-s * 0.7, -s * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
    if (!this.started) message(v, { ...a, cy: a.bottom - 30 * a.u }, 'hold any key to rise, let go to fall', 'stay inside the walls', COL_MID);
    if (this.over) message(v, a, `${(this.x * 10).toFixed(0)}`, 'distance');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const dist = Math.round(this.x * 10);
    return {
      score: dist * 10,
      primary: { label: 'distance', value: dist, unit: '' },
      lines: [
        { label: 'distance', value: String(dist) },
        { label: 'direction changes', value: String(this.flips) },
        { label: 'top speed', value: `${(this.speed / 0.32).toFixed(2)}×` },
      ],
      saved: this.started && this.x > 0.5,
    };
  }
}

function progress2(v: View, cx: number, y: number, half: number, p: number): void {
  const ctx = v.ctx;
  ctx.lineWidth = 2 * v.dpr;
  ctx.strokeStyle = COL_DIM;
  ctx.beginPath();
  ctx.moveTo(cx - half, y);
  ctx.lineTo(cx + half, y);
  ctx.stroke();
  if (p > 0) {
    ctx.strokeStyle = COL_MID;
    ctx.beginPath();
    ctx.moveTo(cx - half, y);
    ctx.lineTo(cx - half + half * 2 * clamp(p, 0, 1), y);
    ctx.stroke();
  }
}

export const BATCH5: MiniDef[] = [
  {
    id: 'side',
    name: 'Side',
    skill: 'attention',
    blurb: 'Shade picks the hand. Where it appears pulls the other way.',
    how: 'A disc appears left or right. White: answer with your left hand. Grey: right hand. Ignore which side it shows up on; when side and shade disagree you will feel the pull. That pull is measured.',
    input: 'keys',
    minKeys: 2,
    make: () => new Side(),
  },
  {
    id: 'tug',
    name: 'Tug',
    skill: 'speed',
    blurb: 'Tug of war against a rate that never gets tired.',
    how: 'Out-tap your opponent to drag the marker to your side. Their rate rises during a round and jumps after each round you win. Lose one and it is over.',
    input: 'keys',
    make: () => new Tug(),
  },
  {
    id: 'second',
    name: 'Second',
    skill: 'timing',
    blurb: 'Hold a key for exactly the time shown. No clock.',
    how: 'A duration appears, from half a second to three. Press any key and hold it for exactly that long, then let go. Scored as a percentage off. Twelve tries.',
    input: 'keys',
    make: () => new Second(),
  },
  {
    id: 'digits',
    name: 'Digits',
    skill: 'memory',
    blurb: 'Remember a number. Type it back, sometimes backwards.',
    how: 'A number shows for a moment. Type it back on the keypad (or the number keys). Every third round, type it backwards. One digit longer each time; three mistakes end it.',
    input: 'pointer',
    make: () => new Digits(),
  },
  {
    id: 'alert',
    name: 'Alert',
    skill: 'reaction',
    blurb: 'Two minutes of waiting. Stop the counter the moment it starts.',
    how: 'A counter starts at random moments. Stop it with any key or a tap as fast as you can. Two minutes long on purpose: it measures how well you stay sharp, counting every slow response (500 ms or more) as a lapse.',
    input: 'both',
    make: () => new Alert(),
  },
  {
    id: 'zigzag',
    name: 'Zigzag',
    skill: 'coordination',
    blurb: 'Hold to rise, let go to fall. The corridor narrows.',
    how: 'Your dart moves diagonally: hold any key to go up, release to go down. Stay between the walls as the corridor zigzags, narrows and speeds up.',
    input: 'keys',
    make: () => new Zigzag(),
  },
];
