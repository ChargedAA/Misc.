// Eighty-fourth batch.
//   Counterpart - a key lights up: press its mirror image under the other hand.
//   Keypad      - a square lights up on a three-by-three grid: press its key, QWE / ASD / ZXC.

import { COL_ACCENT, COL_DIM, COL_LINE, COL_MID } from '../config.ts';
import { SND_FALSE, SND_TAP_WEAK } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, header, median, ms, pct, scaled, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const rint = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));

// --- Counterpart -----------------------------------------------------------------------

const COUNTER_MS = 60000;
const ROWS = ['QWERTYUIOP', 'ASDFGHJKL;', 'ZXCVBNM,./'];
const codeOf = (ch: string) => (ch === ';' ? 'Semicolon' : ch === ',' ? 'Comma' : ch === '.' ? 'Period' : ch === '/' ? 'Slash' : `Key${ch}`);

class Counterpart implements Mini {
  private env!: MiniEnv;
  private row = 0;
  private col = 0;
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
    const pr = this.row;
    const pc = this.col;
    while (this.row === pr && this.col === pc) {
      this.row = rint(0, 2);
      this.col = rint(0, 9);
    }
    this.at = now;
  }

  press(): void {}

  typeKey(code: string, ts: number): boolean {
    const all = ROWS.flatMap((r) => [...r].map(codeOf));
    if (!all.includes(code)) {
      if (!this.started && (code === 'Space' || code === 'Enter')) {
        this.started = true;
        this.t0 = ts;
        this.make(ts);
        return true;
      }
      return false;
    }
    if (!this.started) return true;
    // The mirror image: same row, same distance from the middle, other hand.
    const want = codeOf(ROWS[this.row]![9 - this.col]!);
    if (code === want) {
      this.ok++;
      this.rts.push(ts - this.at);
      this.env.sound(SND_TAP_WEAK);
    } else {
      this.bad++;
      this.note = `${ROWS[this.row]![this.col]} ↔ ${ROWS[this.row]![9 - this.col]}`;
      this.flash = ts + 1000;
      this.env.sound(SND_FALSE);
    }
    this.make(ts);
    return true;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    const len = scaled(COUNTER_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'right', String(this.ok), 'time', `${left} s`);
    // A keyboard of thirty keys, with a gap between the hands.
    const s = Math.min(48 * a.u, (a.right - a.left - 40 * a.u) / 11.5);
    const x0 = a.cx - (s * 10.5) / 2;
    const y0 = a.cy - s * 1.8;
    ROWS.forEach((r, ri) => {
      [...r].forEach((ch, ci) => {
        const x = x0 + ci * s + (ci >= 5 ? s * 0.5 : 0) + ri * s * 0.25;
        const y = y0 + ri * s * 1.1;
        const lit = this.started && ri === this.row && ci === this.col;
        ctx.fillStyle = lit ? COL_LINE : '#16161a';
        ctx.fillRect(x + 2 * dpr, y + 2 * dpr, s - 4 * dpr, s - 4 * dpr);
        ctx.fillStyle = lit ? '#111114' : COL_DIM;
        v.text(ch, x + s / 2, y + s / 2 + 5 * dpr, v.fontTiny, 'center');
      });
    });
    ctx.fillStyle = COL_DIM;
    ctx.fillRect(a.cx + s * 0.25 - dpr, y0 - 8 * a.u, 2 * dpr, s * 3.5);
    if (now < this.flash) {
      ctx.fillStyle = COL_ACCENT;
      v.text(this.note, a.cx, y0 + s * 4, v.fontHud, 'center');
    }
    ctx.fillStyle = COL_MID;
    v.text(this.started ? 'press the lit key’s mirror image: same row, same place, other hand' : 'press Space to start: for each lit key, press its mirror image under the other hand. a minute', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: Math.max(0, this.ok * 25 - this.bad * 25),
      primary: { label: 'right in a minute', value: this.ok, unit: '' },
      lines: [
        { label: 'right', value: String(this.ok) },
        { label: 'wrong', value: String(this.bad) },
        { label: 'typical time a key', value: this.rts.length ? ms(median(this.rts)) : '–' },
      ],
      saved: this.ok + this.bad >= 5,
    };
  }
}

// --- Keypad ----------------------------------------------------------------------------

const KEYPAD_MS = 30000;
const PAD = ['KeyQ', 'KeyW', 'KeyE', 'KeyA', 'KeyS', 'KeyD', 'KeyZ', 'KeyX', 'KeyC'];

class Keypad implements Mini {
  private env!: MiniEnv;
  private lit = 0;
  private t0 = 0;
  private at = 0;
  private started = false;
  private ok = 0;
  private bad = 0;
  private rts: number[] = [];
  private flash = 0;
  private firstFrame = 0;

  start(env: MiniEnv): void {
    this.env = env;
  }

  private make(now: number): void {
    let k = rint(0, 8);
    while (k === this.lit) k = rint(0, 8);
    this.lit = k;
    this.at = now;
  }

  press(): void {}

  typeKey(code: string, ts: number): boolean {
    const k = PAD.indexOf(code);
    if (k < 0) {
      if (!this.started && (code === 'Space' || code === 'Enter')) {
        this.started = true;
        this.t0 = ts;
        this.make(ts);
        return true;
      }
      return false;
    }
    if (!this.started) {
      this.started = true;
      this.t0 = ts;
      this.make(ts);
      return true;
    }
    if (k === this.lit) {
      this.ok++;
      this.rts.push(ts - this.at);
      this.env.sound(SND_TAP_WEAK);
    } else {
      this.bad++;
      this.flash = ts + 300;
      this.env.sound(SND_FALSE);
    }
    this.make(ts);
    return true;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    const len = scaled(KEYPAD_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'right', String(this.ok), 'time', `${left} s`);
    const S = Math.min(a.right - a.left, a.bottom - a.top - 60 * a.u) * 0.8;
    const s = S / 3;
    const x0 = a.cx - S / 2;
    const y0 = a.cy - S / 2 - 10 * a.u;
    for (let k = 0; k < 9; k++) {
      const x = x0 + (k % 3) * s;
      const y = y0 + Math.floor(k / 3) * s;
      const on = this.started && k === this.lit;
      ctx.fillStyle = on ? (now < this.flash ? COL_ACCENT : COL_LINE) : '#16161a';
      ctx.fillRect(x + 4 * dpr, y + 4 * dpr, s - 8 * dpr, s - 8 * dpr);
      // The key letters show faintly at first, and fade as you score.
      ctx.globalAlpha = Math.max(0, 1 - this.ok / 20);
      ctx.fillStyle = on ? '#111114' : COL_DIM;
      v.text(PAD[k]!.slice(3), x + s / 2, y + s / 2 + 5 * dpr, v.fontHud, 'center');
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = COL_MID;
    v.text(this.started ? 'press the lit square’s key: Q W E / A S D / Z X C' : 'press any of Q W E A S D Z X C to start: hit the lit square’s key, fast. thirty seconds', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const n = this.ok + this.bad;
    return {
      score: Math.max(0, this.ok * 15 - this.bad * 20),
      primary: { label: 'right in 30 seconds', value: this.ok, unit: '' },
      lines: [
        { label: 'right', value: String(this.ok) },
        { label: 'accuracy', value: n ? pct(this.ok / n) : '–' },
        { label: 'typical time a square', value: this.rts.length ? ms(median(this.rts)) : '–' },
      ],
      saved: n >= 5,
    };
  }
}

export const BATCH84: MiniDef[] = [
  { id: 'counterpart', name: 'Counterpart', skill: 'dexterity', blurb: 'A key lights up: press its mirror image under the other hand.', how: 'A key lights up on the keyboard drawn on screen. Press its mirror image: the key in the same row, the same distance from the middle, under the other hand (Q and P, D and K, Z and /). Thirty keys in play. A minute; mistakes show the pair. Needs a keyboard.', input: 'type', make: () => new Counterpart() },
  { id: 'keypad', name: 'Keypad', skill: 'speed', blurb: 'A square lights on a three-by-three grid. Press its key: QWE / ASD / ZXC.', how: 'A grid of nine squares maps onto Q W E, A S D and Z X C. One lights up: press its key, and the next lights at once. The letters fade from the squares as you score, so you work from the layout alone. Thirty seconds. Needs a keyboard.', input: 'type', make: () => new Keypad() },
];
