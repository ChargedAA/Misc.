// Fifty-eighth batch.
//   Brake  - the car ahead brakes: press. It signals a turn: don't.
//   Fit    - a short bar and a tall one: how many of the short fit in the tall?
//   Diff   - two strings of characters: how many places differ?
//   Recent - words go by; then, of two you saw, which came more recently?
//   Drag   - drag each piece into its slot and let go, quickly and squarely.

import { COL_ACCENT, COL_DIM, COL_FAINT, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALSE, SND_TAP_L, SND_TAP_R, SND_TAP_WEAK } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, foreperiod, handLabel, header, mean, median, ms, pct, scaled, shuffle, sideOf, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const rint = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
type Rect = [number, number, number, number];
const inside = (r: Rect, x: number, y: number) => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
const digitOf = (code: string) => (code.startsWith('Digit') ? code.slice(5) : code.startsWith('Numpad') ? code.slice(6) : '');

// --- Brake -----------------------------------------------------------------------------

const BRAKE_EVENTS = 24;

class Brake implements Mini {
  private env!: MiniEnv;
  private n = 0;
  private due = 0;
  /** 0 brake lights, -1 or 1 a turn signal on that side. */
  private kind = 0;
  private shownAt = 0;
  private state = 0; // 0 cruising, 1 event on, 2 feedback
  private at = 0;
  private rts: number[] = [];
  private wrong = 0;
  private early = 0;
  private missed = 0;
  private last = '';
  private held = 0;
  private firstAt = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.firstAt = now;
    this.arm(now);
  }

  private arm(now: number): void {
    this.due = now + foreperiod(900, 1400, 4500);
    this.kind = Math.random() < 0.65 ? 0 : Math.random() < 0.5 ? -1 : 1;
    this.state = 0;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (this.state === 2) return;
    if (this.state === 0) {
      this.early++;
      this.last = 'nothing to brake for';
      this.env.sound(SND_FALSE);
      this.state = 2;
      this.at = ts + 800;
      return;
    }
    if (this.kind !== 0) {
      this.wrong++;
      this.last = 'it was only signalling';
      this.env.sound(SND_FALSE);
    } else {
      const rt = ts - this.shownAt;
      this.rts.push(rt);
      this.last = ms(rt);
      this.env.sound(SND_TAP_WEAK);
    }
    this.n++;
    this.state = 2;
    this.at = ts + 700;
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  pointer(_x: number, _y: number, ts: number): void {
    this.press(0, ts);
    this.release(0);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.due) {
      this.state = 1;
      this.shownAt = this.due;
    }
    if (this.state === 1 && now - this.shownAt > (this.kind ? 1600 : 1300)) {
      if (this.kind === 0) {
        this.missed++;
        this.last = 'too late: it braked';
        this.env.sound(SND_FALSE);
      } else this.last = 'right: no brake';
      this.n++;
      this.state = 2;
      this.at = now + 600;
    }
    if (this.state === 2 && now >= this.at) {
      if (this.n >= scaled(BRAKE_EVENTS)) return true;
      this.arm(now);
    }
    if (now - this.firstAt > 600000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'typical brake', this.rts.length ? ms(median(this.rts)) : '–', 'event', `${Math.min(this.n + 1, scaled(BRAKE_EVENTS))} / ${scaled(BRAKE_EVENTS)}`);
    // The road, drawn in perspective, with lane marks streaming toward you.
    const horizon = a.top + 30 * a.u;
    const base = a.bottom - 30 * a.u;
    const hw = Math.min(a.right - a.left, 600 * a.u) / 2;
    ctx.fillStyle = '#121215';
    ctx.beginPath();
    ctx.moveTo(a.cx - 12 * a.u, horizon);
    ctx.lineTo(a.cx + 12 * a.u, horizon);
    ctx.lineTo(a.cx + hw, base);
    ctx.lineTo(a.cx - hw, base);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#3a3a41';
    for (let k = 0; k < 6; k++) {
      const p = ((k / 6 + now / 1400) % 1);
      const t = p * p;
      const y = horizon + (base - horizon) * t;
      ctx.fillRect(a.cx - (1 + 3 * t) * dpr, y, (2 + 6 * t) * dpr, (4 + 20 * t) * dpr);
    }
    // The car ahead.
    const cw = 150 * a.u;
    const ch = 70 * a.u;
    const cx = a.cx;
    const cy = a.cy + 10 * a.u;
    ctx.fillStyle = '#2a2a30';
    ctx.fillRect(cx - cw / 2, cy - ch / 2, cw, ch);
    ctx.fillStyle = '#1c1c20';
    ctx.fillRect(cx - cw * 0.35, cy - ch / 2 - 22 * a.u, cw * 0.7, 24 * a.u);
    const on = this.state === 1;
    const blink = Math.floor((now - this.shownAt) / 250) % 2 === 0;
    for (const s of [-1, 1]) {
      const lx = cx + s * (cw / 2 - 18 * a.u);
      let col = '#4a1a14';
      if (on && this.kind === 0) col = '#ff3b22';
      if (on && this.kind === s && blink) col = '#ffb020';
      ctx.fillStyle = col;
      ctx.fillRect(lx - 14 * a.u, cy - 12 * a.u, 28 * a.u, 14 * a.u);
    }
    if (on && this.kind === 0) {
      ctx.fillStyle = '#ff3b22';
      ctx.fillRect(cx - 18 * a.u, cy - ch / 2 - 30 * a.u, 36 * a.u, 5 * a.u);
    }
    ctx.fillStyle = this.state === 2 && /nothing|signalling|late/.test(this.last) ? COL_ACCENT : COL_MID;
    if (this.state === 2) v.text(this.last, a.cx, a.cy + 80 * a.u, v.fontTiny, 'center');
    if (this.n === 0 && this.state === 0) {
      ctx.fillStyle = COL_MID;
      v.text('press any key the moment the red brake lights come on; ignore the amber turn signals', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const m = median(this.rts);
    return {
      score: this.rts.length ? Math.max(0, Math.round((800 - m) * 3) - (this.wrong + this.early + this.missed) * 30) : 0,
      primary: { label: 'typical braking time', value: m, unit: 'ms', lower: true },
      lines: [
        { label: 'typical brake', value: ms(m) },
        { label: 'braked for a turn signal', value: String(this.wrong) },
        { label: 'too late', value: String(this.missed) },
        { label: 'braked for nothing', value: String(this.early) },
      ],
      saved: this.rts.length >= 4,
    };
  }
}

// --- Fit -------------------------------------------------------------------------------

const FIT_ROUNDS = 12;

class Fit implements Mini {
  private env!: MiniEnv;
  private round = 0;
  private unit = 20;
  private times = 5;
  private typed = '';
  private state = 0;
  private at = 0;
  private errs: number[] = [];
  private firstAt = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.firstAt = now;
    this.arm();
  }

  private arm(): void {
    this.times = Math.round(rnd(3, Math.min(30, 8 + this.round * 2)) * 10) / 10;
    this.unit = rnd(0.025, 0.08);
    // Keep the tall bar within the screen.
    while (this.unit * this.times > 0.9) this.unit *= 0.85;
    this.typed = '';
    this.state = 0;
  }

  press(): void {}

  typeKey(code: string, ts: number): boolean {
    if (this.state !== 0) return !!digitOf(code);
    const d = digitOf(code);
    if (d) {
      if (this.typed.length < 3) this.typed += d;
      return true;
    }
    if (code === 'Backspace') {
      this.typed = this.typed.slice(0, -1);
      return true;
    }
    if ((code === 'Enter' || code === 'NumpadEnter' || code === 'Space') && this.typed) {
      const e = (Math.abs(Number(this.typed) - this.times) / this.times) * 100;
      this.errs.push(e);
      this.env.sound(e < 8 ? SND_CATCH : SND_TAP_WEAK);
      this.round++;
      this.state = 1;
      this.at = ts + 1500;
      return true;
    }
    return false;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 1 && now >= this.at) {
      if (this.round >= scaled(FIT_ROUNDS)) return true;
      this.arm();
    }
    if (now - this.firstAt > 600000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'off by', this.errs.length ? `${mean(this.errs.slice(-3)).toFixed(0)}%` : '–', 'pair', `${Math.min(this.round + 1, scaled(FIT_ROUNDS))} / ${scaled(FIT_ROUNDS)}`);
    const H = a.bottom - a.top - 80 * a.u;
    const base = a.top + 20 * a.u + H;
    const u = this.unit * H;
    const bw = 34 * a.u;
    ctx.fillStyle = COL_LINE;
    ctx.fillRect(a.cx - 120 * a.u, base - u, bw, u);
    ctx.fillStyle = '#8a8a92';
    ctx.fillRect(a.cx + 40 * a.u, base - u * this.times, bw * 1.6, u * this.times);
    if (this.state === 1) {
      // The answer, as the short bar stacked up the tall one.
      ctx.strokeStyle = COL_ACCENT;
      ctx.lineWidth = dpr;
      for (let k = 1; k < this.times; k++) {
        ctx.beginPath();
        ctx.moveTo(a.cx + 40 * a.u, base - u * k);
        ctx.lineTo(a.cx + 40 * a.u + bw * 1.6, base - u * k);
        ctx.stroke();
      }
    }
    ctx.fillStyle = COL_FAINT;
    ctx.fillRect(a.left, base, a.right - a.left, dpr);
    ctx.fillStyle = COL_LINE;
    v.text(this.state === 1 ? `${this.times} · you said ${this.typed}` : `${this.typed || '_'}`, a.cx, a.bottom - 34 * a.u, v.fontHud, 'center');
    ctx.fillStyle = COL_MID;
    if (this.round === 0 && this.state === 0) v.text('how many of the short white bar would stack up to the tall grey one? type it, then Enter', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const m = mean(this.errs);
    return {
      score: this.errs.length ? Math.round(Math.max(0, 40 - m) * 25) : 0,
      primary: { label: 'average miss', value: Math.round(m), unit: '%', lower: true },
      lines: [
        { label: 'average miss', value: this.errs.length ? `${m.toFixed(0)}%` : '–' },
        { label: 'within 10%', value: this.errs.length ? pct(this.errs.filter((e) => e < 10).length / this.errs.length) : '–' },
      ],
      saved: this.errs.length >= 3,
    };
  }
}


// --- Diff ------------------------------------------------------------------------------

const DIFF_ROUNDS = 16;
const CHARS = 'ABCDEFGHJKLMNPRSTUVWXYZ23456789';
/** Look-alike swaps, which make the differences harder to see. */
const ALIKE: Record<string, string> = { O: '0', '0': 'O', S: '5', '5': 'S', B: '8', '8': 'B', Z: '2', '2': 'Z', M: 'N', N: 'M', E: 'F', F: 'E', V: 'U', U: 'V', P: 'R', R: 'P' };

class Diff implements Mini {
  private env!: MiniEnv;
  private round = 0;
  private a = '';
  private b = '';
  private count = 0;
  private state = 0;
  private at = 0;
  private shownAt = 0;
  private boxes: Rect[] = [];
  private right = 0;
  private rts: number[] = [];
  private lastOk = true;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.arm(now);
  }

  private arm(now: number): void {
    const len = Math.min(18, 8 + this.round);
    this.a = Array.from({ length: len }, () => CHARS[rint(0, CHARS.length - 1)]!).join('');
    this.count = rint(0, 3);
    const where = shuffle(Array.from({ length: len }, (_, k) => k)).slice(0, this.count);
    const b = [...this.a];
    for (const k of where) {
      const c = b[k]!;
      let r = ALIKE[c] && Math.random() < 0.6 ? ALIKE[c]! : CHARS[rint(0, CHARS.length - 1)]!;
      while (r === c) r = CHARS[rint(0, CHARS.length - 1)]!;
      b[k] = r;
    }
    this.b = b.join('');
    this.state = 0;
    this.shownAt = now;
  }

  press(): void {}

  private pick(k: number, ts: number): void {
    if (this.state !== 0) return;
    const ok = k === this.count;
    this.lastOk = ok;
    if (ok) {
      this.right++;
      this.rts.push(ts - this.shownAt);
    }
    this.env.sound(ok ? SND_CATCH : SND_FALSE);
    this.round++;
    this.state = 1;
    this.at = ts + (ok ? 700 : 1800);
  }

  typeKey(code: string, ts: number): boolean {
    const d = digitOf(code);
    if (d !== '' && Number(d) <= 3) {
      this.pick(Number(d), ts);
      return true;
    }
    return false;
  }

  pointer(x: number, y: number, ts: number): void {
    const k = this.boxes.findIndex((r) => inside(r, x, y));
    if (k >= 0) this.pick(k, ts);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 1 && now >= this.at) {
      if (this.round >= scaled(DIFF_ROUNDS)) return true;
      this.arm(now);
    }
    if (this.state === 0 && now - this.shownAt > 120000) this.pick(-1, now);
    v.clear();
    const ar = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'right', String(this.right), 'pair', `${Math.min(this.round + 1, scaled(DIFF_ROUNDS))} / ${scaled(DIFF_ROUNDS)}`);
    const size = Math.min(32 * ar.u, (ar.right - ar.left) / (this.a.length + 2) / 0.62);
    ctx.font = `500 ${Math.round(size)}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cw = size * 0.66;
    const x0 = ar.cx - (this.a.length * cw) / 2 + cw / 2;
    [this.a, this.b].forEach((s, row) => {
      for (let k = 0; k < s.length; k++) {
        const differs = this.a[k] !== this.b[k];
        ctx.fillStyle = this.state === 1 && differs ? COL_ACCENT : COL_LINE;
        ctx.fillText(s[k]!, x0 + k * cw, ar.cy - 70 * ar.u + row * size * 1.4);
      }
    });
    const bw = 64 * ar.u;
    this.boxes = [0, 1, 2, 3].map((k) => [ar.cx + (k - 2) * (bw + 12 * ar.u) + 6 * ar.u, ar.cy + 20 * ar.u, bw, bw * 0.8] as Rect);
    this.boxes.forEach(([x, y, w, h], k) => {
      const show = this.state === 1;
      ctx.strokeStyle = show && k === this.count ? COL_LINE : COL_DIM;
      ctx.lineWidth = (show && k === this.count ? 2.5 : 1.5) * dpr;
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = COL_LINE;
      v.text(String(k), x + w / 2, y + h / 2 + 6 * dpr, v.fontHud, 'center');
    });
    ctx.fillStyle = this.state === 1 && !this.lastOk ? COL_ACCENT : COL_MID;
    v.text(this.state === 1 && !this.lastOk ? `${this.count} differ` : 'how many places differ? 0 to 3 (keys or click)', ar.cx, ar.bottom - 4 * ar.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.right * 50 + (this.rts.length ? Math.round(Math.max(0, 8000 - median(this.rts)) / 20) : 0),
      primary: { label: 'pairs counted right', value: this.right, unit: `of ${this.round}` },
      lines: [
        { label: 'right', value: `${this.right} of ${this.round}` },
        { label: 'typical time when right', value: this.rts.length ? ms(median(this.rts)) : '–' },
      ],
      saved: this.round >= 4,
    };
  }
}

// --- Recent (which came more recently) -------------------------------------------------

const RECENT_TESTS = 20;
const NOUNS = ['anchor', 'bridge', 'cactus', 'drum', 'engine', 'feather', 'garden', 'harbor', 'island', 'jacket', 'kite', 'ladder', 'magnet', 'needle', 'orchard', 'pebble', 'quilt', 'rocket', 'saddle', 'tunnel', 'violin', 'walnut', 'yacht', 'zipper', 'basket', 'candle', 'dragon', 'falcon', 'glacier', 'helmet', 'igloo', 'jungle', 'kettle', 'lantern', 'mirror', 'nest', 'oyster', 'parrot', 'river', 'statue', 'tiger', 'umbrella', 'valley', 'wagon'];

class Recent implements Mini {
  private env!: MiniEnv;
  private seen: string[] = [];
  private pool: string[] = [];
  private tests = 0;
  private until = 5;
  private word = '';
  private wordAt = 0;
  /** 0 stream, 1 test, 2 feedback. */
  private state = 0;
  private pair: [string, string] = ['', ''];
  private answer = 0;
  private lags: [number, number] = [0, 0];
  private right = 0;
  private hardRight = 0;
  private hard = 0;
  private at = 0;
  private lastOk = true;
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.pool = shuffle([...NOUNS]);
    this.at = now + 600;
  }

  private nextWord(now: number): void {
    if (!this.pool.length) this.pool = shuffle(NOUNS.filter((w) => !this.seen.slice(-12).includes(w)));
    this.word = this.pool.pop()!;
    this.seen.push(this.word);
    this.wordAt = now;
    this.until--;
  }

  private makeTest(): void {
    const n = this.seen.length;
    // Two lags into the past; the closer the lags, the harder.
    const l1 = rint(1, Math.min(n - 1, 6));
    let l2 = rint(1, Math.min(n, 12));
    while (l2 === l1) l2 = rint(1, Math.min(n, 12));
    const w1 = this.seen[n - l1]!;
    const w2 = this.seen[n - l2]!;
    if (w1 === w2) return this.makeTest();
    this.answer = Math.random() < 0.5 ? 0 : 1;
    this.pair = this.answer === 0 ? [w1, w2] : [w2, w1];
    this.lags = [l1, l2];
    this.state = 1;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (s === 0 || this.state !== 1) return;
    const ok = (s < 0 ? 0 : 1) === this.answer;
    const isHard = Math.abs(this.lags[0] - this.lags[1]) <= 2;
    if (isHard) this.hard++;
    if (ok) {
      this.right++;
      if (isHard) this.hardRight++;
    }
    this.lastOk = ok;
    this.env.sound(ok ? (s < 0 ? SND_TAP_L : SND_TAP_R) : SND_FALSE);
    this.tests++;
    this.state = 2;
    this.at = ts + (ok ? 600 : 1200);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.at) {
      if (this.until <= 0 && this.seen.length >= 4) {
        this.makeTest();
      } else {
        this.nextWord(now);
        this.at = now + 1100;
      }
    }
    if (this.state === 2 && now >= this.at) {
      if (this.tests >= scaled(RECENT_TESTS)) return true;
      this.until = rint(3, 6);
      this.state = 0;
      this.at = now + 400;
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'right', `${this.right} of ${this.tests}`, 'test', `${Math.min(this.tests + 1, scaled(RECENT_TESTS))} / ${scaled(RECENT_TESTS)}`);
    ctx.font = `600 ${Math.round(36 * a.u)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (this.state === 0) {
      if (this.word && now - this.wordAt < 850) {
        ctx.fillStyle = COL_LINE;
        ctx.fillText(this.word, a.cx, a.cy - 10 * a.u);
      }
    } else {
      const off = Math.min(170 * a.u, (a.right - a.left) / 4);
      this.pair.forEach((w, k) => {
        const show = this.state === 2;
        ctx.fillStyle = show && k === this.answer ? COL_LINE : show ? COL_DIM : COL_LINE;
        ctx.fillText(w, a.cx + (k ? 1 : -1) * off, a.cy - 10 * a.u);
      });
      ctx.fillStyle = this.state === 2 && !this.lastOk ? COL_ACCENT : COL_MID;
      v.text(this.state === 1 ? 'which did you see more recently?' : this.lastOk ? 'right' : `“${this.pair[this.answer]}” was more recent`, a.cx, a.cy + 50 * a.u, v.fontTiny, 'center');
      ctx.fillStyle = COL_MID;
      v.text(`${handLabel(this.env, -1)}  left`, a.cx - off, a.bottom - 6 * a.u, v.fontTiny, 'center');
      v.text(`right  ${handLabel(this.env, 1)}`, a.cx + off, a.bottom - 6 * a.u, v.fontTiny, 'center');
    }
    if (this.tests === 0 && this.state === 0) {
      ctx.fillStyle = COL_MID;
      v.text('words go by one at a time; now and then you will be asked which of two came later', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.right * 50 + this.hardRight * 30,
      primary: { label: 'answered right', value: this.tests ? Math.round((this.right / this.tests) * 100) : 0, unit: '%' },
      lines: [
        { label: 'right', value: `${this.right} of ${this.tests}` },
        { label: 'close calls right', value: this.hard ? `${this.hardRight} of ${this.hard}` : '–' },
      ],
      saved: this.tests >= 5,
    };
  }
}

// --- Drag ------------------------------------------------------------------------------

const DRAG_PIECES = 20;

class Drag implements Mini {
  private env!: MiniEnv;
  private n = 0;
  private piece: [number, number] = [0.2, 0.5];
  private slot: [number, number] = [0.8, 0.5];
  private size = 0.08;
  private grab: [number, number] | null = null;
  private pos: [number, number] = [0, 0];
  private shownAt = 0;
  private times: number[] = [];
  private offs: number[] = [];
  private drops = 0;
  private field: Rect = [0, 0, 1, 1];
  private flash = 0;
  private firstAt = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.firstAt = now;
    this.arm(now);
  }

  private arm(now: number): void {
    this.size = Math.max(0.04, 0.1 - this.n * 0.003);
    for (let tries = 0; tries < 50; tries++) {
      this.piece = [rnd(0.1, 0.9), rnd(0.15, 0.85)];
      this.slot = [rnd(0.1, 0.9), rnd(0.15, 0.85)];
      if (Math.hypot((this.piece[0] - this.slot[0]) * 1.6, this.piece[1] - this.slot[1]) > 0.5) break;
    }
    this.grab = null;
    this.shownAt = now;
  }

  private toField(x: number, y: number): [number, number] {
    const [fx, fy, fw, fh] = this.field;
    return [(x - fx) / fw, (y - fy) / fh];
  }

  press(): void {}

  pointer(x: number, y: number): void {
    const [px, py] = this.toField(x, y);
    const [, , fw, fh] = this.field;
    const s = this.size * fh;
    if (Math.abs((px - this.piece[0]) * fw) <= s / 2 + 6 && Math.abs((py - this.piece[1]) * fh) <= s / 2 + 6) {
      this.grab = [px - this.piece[0], py - this.piece[1]];
      this.pos = [...this.piece];
    }
  }

  pointerMove(x: number, y: number): void {
    if (!this.grab) return;
    const [px, py] = this.toField(x, y);
    this.pos = [px - this.grab[0], py - this.grab[1]];
  }

  pointerUp(x: number, y: number, ts: number): void {
    if (!this.grab) return;
    this.pointerMove(x, y);
    this.grab = null;
    const [, , fw, fh] = this.field;
    const off = Math.hypot((this.pos[0] - this.slot[0]) * fw, (this.pos[1] - this.slot[1]) * fh) / (this.size * fh);
    if (off <= 0.5) {
      this.times.push(ts - this.shownAt);
      this.offs.push(off);
      this.env.sound(SND_CATCH);
      this.n++;
      if (this.n < scaled(DRAG_PIECES)) this.arm(ts);
    } else {
      // Dropped short: the piece stays where it fell, to be picked up again.
      this.drops++;
      this.piece = [...this.pos];
      this.flash = ts + 250;
      this.env.sound(SND_FALSE);
    }
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.n >= scaled(DRAG_PIECES)) return true;
    if (now - this.firstAt > 600000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'typical drag', this.times.length ? ms(median(this.times)) : '–', 'piece', `${Math.min(this.n + 1, scaled(DRAG_PIECES))} / ${scaled(DRAG_PIECES)}`);
    const fh = a.bottom - a.top - 30 * a.u;
    const fw = a.right - a.left;
    const fx = a.left;
    const fy = a.top + 4 * a.u;
    this.field = [fx, fy, fw, fh];
    const s = this.size * fh;
    // The slot.
    ctx.strokeStyle = COL_DIM;
    ctx.lineWidth = 2 * dpr;
    ctx.setLineDash?.([5 * dpr, 4 * dpr]);
    ctx.strokeRect(fx + this.slot[0] * fw - s / 2, fy + this.slot[1] * fh - s / 2, s, s);
    ctx.setLineDash?.([]);
    // The piece, where it is held or resting.
    const p = this.grab ? this.pos : this.piece;
    ctx.fillStyle = now < this.flash ? COL_ACCENT : COL_LINE;
    ctx.fillRect(fx + p[0] * fw - s / 2, fy + p[1] * fh - s / 2, s, s);
    ctx.fillStyle = COL_MID;
    v.text(this.n === 0 && !this.grab ? 'press on the white piece, drag it into the dashed slot, and let go' : `${this.drops} dropped short`, a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const m = median(this.times);
    return {
      score: this.times.length ? Math.max(0, Math.round(this.times.length * Math.max(0, 3000 - m) / 30) - this.drops * 20) : 0,
      primary: { label: 'typical drag', value: m, unit: 'ms', lower: true },
      lines: [
        { label: 'typical drag', value: this.times.length ? ms(m) : '–' },
        { label: 'typical placement', value: this.offs.length ? `${Math.round(median(this.offs) * 100)}% of a piece off` : '–' },
        { label: 'dropped short', value: String(this.drops) },
      ],
      saved: this.times.length >= 4,
    };
  }
}

export const BATCH58: MiniDef[] = [
  { id: 'brake', name: 'Brake', skill: 'reaction', blurb: 'The car ahead brakes: press. It signals a turn: don’t.', how: 'You are following a car. When its red brake lights come on, press any key (or tap) as fast as you can. When an amber turn signal blinks instead, do nothing. Pressing for nothing, or for a signal, counts against you. Twenty-four events.', input: 'both', make: () => new Brake() },
  { id: 'fit', name: 'Fit', skill: 'judgement', blurb: 'A short bar and a tall one. How many of the short fit in the tall?', how: 'A short white bar and a tall grey one. How many white bars, stacked, would reach the top of the grey? Type it and press Enter; the answer is drawn after. The ratios grow as you go. Twelve pairs; scored as a percentage off. Needs a keyboard.', input: 'type', make: () => new Fit() },
  { id: 'diff', name: 'Diff', skill: 'attention', blurb: 'Two strings of characters. How many places differ?', how: 'Two rows of letters and digits, one above the other. Count the places where they differ, from none to three, and press that number (or click it). Look-alikes such as O and 0, or S and 5, are used to trick you, and the rows grow longer. Sixteen pairs.', input: 'pointer', make: () => new Diff() },
  { id: 'recent', name: 'Recent', skill: 'memory', blurb: 'Words go by. Then, of two you saw, which came more recently?', how: 'Words appear one at a time. Every few words, two of the ones you have seen are shown side by side: press the side of the one that came later. When both were recent the call is harder. Twenty questions.', input: 'keys', minKeys: 2, make: () => new Recent() },
  { id: 'drag', name: 'Drag', skill: 'aim', blurb: 'Drag each piece into its slot and let go, quickly and squarely.', how: 'Press on the white piece, drag it to the dashed slot, and let go. It counts once its middle lands within half a piece of the slot; drop it short and you pick it up again where it fell. The pieces shrink as you go. Twenty pieces; scored on your typical time.', input: 'pointer', make: () => new Drag() },
];
