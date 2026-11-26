// Seventy-fourth batch.
//   Coins  - make the amount with the fewest coins: how many does it take?
//   Wanted - shapes fall; click every one that matches the wanted shape, nothing else.

import { COL_ACCENT, COL_DIM, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALL, SND_FALSE, SND_TAP_WEAK } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, header, median, ms, pct, scaled, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const TAU = Math.PI * 2;
const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const rint = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
const digitOf = (code: string) => (code.startsWith('Digit') ? code.slice(5) : code.startsWith('Numpad') ? code.slice(6) : '');

// --- Coins -----------------------------------------------------------------------------

const COINS_MS = 60000;
const DENOMS = [50, 25, 10, 5, 1];

class Coins implements Mini {
  private env!: MiniEnv;
  private amount = 0;
  private best = 0;
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
    this.amount = rint(6, this.ok < 6 ? 49 : 99);
    // With these coins, taking the biggest that fits each time is always fewest.
    let left = this.amount;
    const used: number[] = [];
    for (const d of DENOMS) while (left >= d) {
      used.push(d);
      left -= d;
    }
    this.best = used.length;
    this.note = `${this.amount}¢ = ${used.join(' + ')}`;
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
      if (this.typed.length < 2) this.typed += d;
      return true;
    }
    if (code === 'Backspace') {
      this.typed = this.typed.slice(0, -1);
      return true;
    }
    if ((code === 'Enter' || code === 'NumpadEnter' || code === 'Space') && this.typed) {
      if (Number(this.typed) === this.best) {
        this.ok++;
        this.rts.push(ts - this.at);
        this.env.sound(SND_CATCH);
        this.make(ts);
      } else {
        this.bad++;
        this.flash = ts + 1800;
        const shown = this.note;
        this.env.sound(SND_FALSE);
        this.make(ts);
        this.lastNote = shown;
      }
      return true;
    }
    return false;
  }

  private lastNote = '';

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    const len = scaled(COINS_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'right', String(this.ok), 'time', `${left} s`);
    // The coins on offer.
    DENOMS.forEach((d, k) => {
      const x = a.cx + (k - 2) * 60 * a.u;
      const r = (12 + d / 5) * a.u * 0.9;
      ctx.strokeStyle = COL_DIM;
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.arc(x, a.top + 40 * a.u, Math.min(r, 26 * a.u), 0, TAU);
      ctx.stroke();
      ctx.fillStyle = COL_MID;
      v.text(`${d}¢`, x, a.top + 44 * a.u, v.fontTiny, 'center');
    });
    ctx.font = `600 ${Math.round(48 * a.u)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COL_LINE;
    ctx.fillText(this.started ? `${this.amount}¢` : '87¢', a.cx, a.cy - 20 * a.u);
    if (this.started) {
      ctx.font = `600 ${Math.round(30 * a.u)}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = COL_MID;
      ctx.fillText(`${this.typed || '_'} coins`, a.cx, a.cy + 40 * a.u);
    }
    if (now < this.flash) {
      ctx.fillStyle = COL_ACCENT;
      v.text(this.lastNote, a.cx, a.cy + 84 * a.u, v.fontTiny, 'center');
    }
    ctx.fillStyle = COL_MID;
    v.text(this.started ? 'the fewest coins that make it exactly: type how many, then Enter' : 'press Space to start: the fewest coins for each amount. a minute', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
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
        { label: 'typical time an amount', value: this.rts.length ? ms(median(this.rts)) : '–' },
      ],
      saved: this.ok + this.bad >= 3,
    };
  }
}

// --- Wanted ----------------------------------------------------------------------------

const WANTED_MS = 60000;
type Faller = { x: number; y: number; s: number; c: number; r: number; v: number; hit: number };
const SHADES = [COL_LINE, '#8a8a92', COL_ACCENT];

function drawFaller(ctx: CanvasRenderingContext2D, f: Faller, x: number, y: number, R: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((f.r * Math.PI) / 2);
  ctx.fillStyle = SHADES[f.c]!;
  ctx.beginPath();
  if (f.s === 0) ctx.arc(0, 0, R, 0, TAU);
  else if (f.s === 1) ctx.rect(-R * 0.85, -R * 0.85, R * 1.7, R * 1.7);
  else if (f.s === 2) {
    ctx.moveTo(0, -R);
    ctx.lineTo(R, R * 0.8);
    ctx.lineTo(-R, R * 0.8);
    ctx.closePath();
  } else {
    ctx.rect(-R * 0.85, -R * 0.85, R * 0.5, R * 1.7);
    ctx.rect(-R * 0.85, R * 0.35, R * 1.7, R * 0.5);
  }
  ctx.fill();
  ctx.restore();
}

class Wanted implements Mini {
  private env!: MiniEnv;
  private want: Faller = { x: 0, y: 0, s: 2, c: 0, r: 0, v: 0, hit: 0 };
  private items: Faller[] = [];
  private t0 = 0;
  private started = false;
  private last = 0;
  private nextAt = 0;
  private hits = 0;
  private missed = 0;
  private wrong = 0;
  private field: [number, number, number, number] = [0, 0, 1, 1];
  private flash = 0;
  private firstFrame = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.last = now;
    this.newWant();
  }

  private newWant(): void {
    this.want = { x: 0, y: 0, s: rint(0, 3), c: rint(0, 2), r: 0, v: 0, hit: 0 };
    // Only the L shows its turn; fix its turn so it is part of what is wanted.
    if (this.want.s === 3) this.want.r = rint(0, 3);
  }

  private matches(f: Faller): boolean {
    return f.s === this.want.s && f.c === this.want.c && (f.s !== 3 || f.r === this.want.r);
  }

  private spawn(now: number): void {
    const t = (now - this.t0) / 1000;
    let f: Faller;
    if (Math.random() < 0.35) f = { ...this.want, x: 0, y: 0, v: 0, hit: 0 };
    else {
      // Look-alikes: share one or two features with the wanted shape.
      f = { x: 0, y: 0, s: this.want.s, c: this.want.c, r: this.want.r, v: 0, hit: 0 };
      const k = rint(0, this.want.s === 3 ? 2 : 1);
      if (k === 0) f.c = (f.c + rint(1, 2)) % 3;
      else if (k === 1) f.s = (f.s + rint(1, 3)) % 4;
      else f.r = (f.r + rint(1, 3)) % 4;
      if (Math.random() < 0.3) f.s = rint(0, 3);
      if (f.s === 3 && this.want.s !== 3) f.r = rint(0, 3);
    }
    f.x = rnd(0.06, 0.94);
    f.y = -0.05;
    f.v = rnd(0.12, 0.2) * (1 + t / 80);
    this.items.push(f);
    this.nextAt = now + rnd(350, 750) / (1 + t / 90);
  }

  press(): void {}

  pointer(x: number, y: number, ts: number): void {
    if (!this.started) {
      this.started = true;
      this.t0 = ts;
      this.last = ts;
      this.nextAt = ts + 300;
      return;
    }
    const [fx, fy, fw, fh] = this.field;
    const R = fh * 0.04;
    const k = this.items.findIndex((f) => !f.hit && Math.hypot(fx + f.x * fw - x, fy + f.y * fh - y) < R * 1.4);
    if (k < 0) return;
    const f = this.items[k]!;
    f.hit = ts;
    if (this.matches(f)) {
      this.hits++;
      this.env.sound(SND_TAP_WEAK);
    } else {
      this.wrong++;
      this.flash = ts + 300;
      this.env.sound(SND_FALSE);
    }
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    const len = scaled(WANTED_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.started) {
      // A new wanted shape every twenty seconds; the screen clears for it.
      const phase = Math.floor((now - this.t0) / 20000);
      if (phase !== Math.floor((now - dt * 1000 - this.t0) / 20000) && now - this.t0 > 1000) {
        this.newWant();
        this.items = [];
        this.env.sound(SND_CATCH);
      }
      if (now >= this.nextAt) this.spawn(now);
      for (const f of this.items) if (!f.hit) f.y += f.v * dt;
      this.items = this.items.filter((f) => {
        if (f.hit) return now - f.hit < 250;
        if (f.y > 1.05) {
          if (this.matches(f)) {
            this.missed++;
            this.env.sound(SND_FALL);
          }
          return false;
        }
        return true;
      });
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'caught', String(this.hits), 'time', `${left} s`);
    const fx = a.left;
    const fy = a.top + 46 * a.u;
    const fw = a.right - a.left;
    const fh = a.bottom - fy - 30 * a.u;
    this.field = [fx, fy, fw, fh];
    const R = fh * 0.04;
    // The wanted poster.
    ctx.strokeStyle = now < this.flash ? COL_ACCENT : COL_DIM;
    ctx.lineWidth = 1.5 * dpr;
    ctx.strokeRect(a.cx - 60 * a.u, a.top + 2 * a.u, 120 * a.u, 40 * a.u);
    drawFaller(ctx, this.want, a.cx - 30 * a.u, a.top + 22 * a.u, 12 * a.u);
    ctx.fillStyle = COL_MID;
    v.text('wanted', a.cx + 20 * a.u, a.top + 26 * a.u, v.fontTiny, 'center');
    for (const f of this.items) {
      const x = fx + f.x * fw;
      const y = fy + f.y * fh;
      if (f.hit) ctx.globalAlpha = Math.max(0, 1 - (now - f.hit) / 250);
      drawFaller(ctx, f, x, y, R);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = COL_MID;
    v.text(this.started ? `${this.missed} got away · ${this.wrong} wrong` : 'click every falling shape that matches the wanted one exactly, colour and all. click to start', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const all = this.hits + this.missed;
    return {
      score: Math.max(0, this.hits * 15 - this.missed * 5 - this.wrong * 20),
      primary: { label: 'wanted shapes caught', value: this.hits, unit: '' },
      lines: [
        { label: 'caught', value: String(this.hits) },
        { label: 'got away', value: String(this.missed) },
        { label: 'wrong clicks', value: String(this.wrong) },
        { label: 'share caught', value: all ? pct(this.hits / all) : '–' },
      ],
      saved: this.started && all + this.wrong >= 5,
    };
  }
}

export const BATCH74: MiniDef[] = [
  { id: 'coins', name: 'Coins', skill: 'reasoning', blurb: 'Make the amount with the fewest coins. How many does it take?', how: 'An amount in cents, and coins of 50, 25, 10, 5 and 1. What is the fewest coins that make it exactly? Type the number and press Enter. Amounts up to 49¢ at first, then up to 99¢. A minute; a mistake shows the coins.', input: 'type', make: () => new Coins() },
  { id: 'wanted', name: 'Wanted', skill: 'attention', blurb: 'Shapes fall. Click every one that matches the wanted shape, nothing else.', how: 'The wanted shape is posted at the top. Shapes fall down the screen, many of them look-alikes: the right shape in the wrong colour, or the right colour in the wrong shape or turn. Click only exact matches before they fall away. The wanted shape changes every twenty seconds. A minute.', input: 'pointer', make: () => new Wanted() },
];
