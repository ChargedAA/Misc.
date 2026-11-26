// Seventy-eighth batch.
//   Cadence - targets appear on the beat; click each one as its ring closes.
//   Bus     - people get on and off at each stop: how many are on the bus now?

import { COL_ACCENT, COL_DIM, COL_FAINT, COL_LINE, COL_MID } from '../config.ts';
import { SND_BEAT, SND_CATCH, SND_FALSE, SND_TAP_WEAK } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, header, mean, median, ms, pct, scaled, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const TAU = Math.PI * 2;
const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const rint = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
type Rect = [number, number, number, number];
const digitOf = (code: string) => (code.startsWith('Digit') ? code.slice(5) : code.startsWith('Numpad') ? code.slice(6) : '');

// --- Cadence ---------------------------------------------------------------------------

const CADENCE_NOTES = 40;
/** How long before its beat a target appears (ms): its ring shrinks to the target over this time. */
const LEAD = 900;

type Note = { x: number; y: number; at: number; done: number; err: number };

class Cadence implements Mini {
  private env!: MiniEnv;
  private notes: Note[] = [];
  private ioi = 600;
  private started = false;
  private scheduled = 0;
  private visual = false;
  private errs: number[] = [];
  private misses = 0;
  private field: Rect = [0, 0, 1, 1];
  private firstAt = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.visual = env.muted || !env.soundAt;
    this.firstAt = now;
  }

  private build(now: number): void {
    // Forty notes on a steady beat, some on the half beat later, wandering around the screen.
    let t = now + 1500;
    let x = 0.5;
    let y = 0.5;
    for (let k = 0; k < scaled(CADENCE_NOTES); k++) {
      const step = k > 12 && Math.random() < 0.25 ? 0.5 : 1;
      t += this.ioi * step;
      const ang = rnd(0, TAU);
      const d = rnd(0.15, 0.3);
      x = Math.min(0.9, Math.max(0.1, x + Math.cos(ang) * d));
      y = Math.min(0.85, Math.max(0.15, y + Math.sin(ang) * d));
      this.notes.push({ x, y, at: t, done: 0, err: 0 });
    }
  }

  press(): void {}

  pointer(px: number, py: number, ts: number): void {
    if (!this.started) {
      this.started = true;
      this.ioi = rint(520, 640);
      this.build(ts);
      return;
    }
    const [fx, fy, fw, fh] = this.field;
    const R = fh * 0.05;
    // The earliest live note under the click.
    const n = this.notes.find((o) => !o.done && ts > o.at - LEAD && Math.hypot(fx + o.x * fw - px, fy + o.y * fh - py) <= R * 1.3);
    if (!n) return;
    n.done = ts;
    n.err = ts - n.at;
    if (Math.abs(n.err) > 250) {
      this.misses++;
      this.env.sound(SND_FALSE);
    } else {
      this.errs.push(Math.abs(n.err));
      this.env.sound(SND_TAP_WEAK);
    }
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.started && now - this.firstAt > 120000) return true;
    if (this.started) {
      // Each note's beat is scheduled ahead on the audio clock.
      while (this.scheduled < this.notes.length && this.notes[this.scheduled]!.at - now < 300) {
        const n = this.notes[this.scheduled]!;
        if (!this.visual && n.at >= now) this.env.soundAt!(SND_BEAT, n.at - now);
        this.scheduled++;
      }
      for (const n of this.notes) {
        if (!n.done && now > n.at + 250) {
          n.done = now;
          n.err = 9999;
          this.misses++;
        }
      }
      if (this.notes.length && this.notes.every((n) => n.done) && now > this.notes[this.notes.length - 1]!.done + 600) return true;
    }
    if (now - this.firstAt > 600000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'typical timing', this.errs.length ? ms(median(this.errs)) : '–', 'hits', `${this.errs.length} / ${this.notes.length || scaled(CADENCE_NOTES)}`);
    const fx = a.left;
    const fy = a.top + 4 * a.u;
    const fw = a.right - a.left;
    const fh = a.bottom - a.top - 30 * a.u;
    this.field = [fx, fy, fw, fh];
    const R = fh * 0.05;
    // Draw later notes first, so the next one sits on top.
    for (let k = this.notes.length - 1; k >= 0; k--) {
      const n = this.notes[k]!;
      const x = fx + n.x * fw;
      const y = fy + n.y * fh;
      if (n.done) {
        const age = now - n.done;
        if (age > 300) continue;
        ctx.globalAlpha = 1 - age / 300;
        ctx.strokeStyle = n.err === 9999 || Math.abs(n.err) > 250 ? COL_ACCENT : COL_LINE;
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        ctx.arc(x, y, R * (1 + age / 300), 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
        continue;
      }
      const lead = n.at - now;
      if (lead > LEAD) continue;
      ctx.fillStyle = COL_LINE;
      ctx.beginPath();
      ctx.arc(x, y, R, 0, TAU);
      ctx.fill();
      // The closing ring meets the target on the beat.
      ctx.strokeStyle = COL_MID;
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.arc(x, y, R * (1 + Math.max(0, lead / LEAD) * 2), 0, TAU);
      ctx.stroke();
    }
    ctx.fillStyle = COL_MID;
    v.text(this.started ? `${this.misses} missed` : 'click to start: click each target as its ring closes on it, in time with the beat', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const m = median(this.errs);
    const n = this.errs.length + this.misses;
    return {
      score: this.errs.length ? Math.max(0, Math.round(this.errs.length * Math.max(0, 260 - m) / 4) - this.misses * 10) : 0,
      primary: { label: 'targets hit in time', value: this.errs.length, unit: `of ${n}` },
      lines: [
        { label: 'hit', value: `${this.errs.length} of ${n}` },
        { label: 'typical timing', value: this.errs.length ? ms(m) : '–' },
        { label: 'average timing', value: this.errs.length ? ms(mean(this.errs)) : '–' },
      ],
      saved: n >= 10,
    };
  }
}

// --- Bus -------------------------------------------------------------------------------

const BUS_ROUNDS = 10;

class Bus implements Mini {
  private env!: MiniEnv;
  private round = 0;
  private stops: [number, number][] = [];
  private start0 = 0;
  private total = 0;
  private typed = '';
  /** 0 riding (stops shown in turn), 1 answering, 2 feedback. */
  private state = 0;
  private at = 0;
  private per = 1600;
  private right = 0;
  private offs: number[] = [];
  private nStops = 3;
  private best = 0;
  private lastOk = true;
  private firstAt = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.firstAt = now;
    this.arm(now);
  }

  private arm(now: number): void {
    this.start0 = rint(3, 12);
    let on = this.start0;
    this.stops = [];
    for (let k = 0; k < this.nStops; k++) {
      const off = rint(0, Math.min(on, 6));
      const up = rint(0, 7);
      this.stops.push([up, off]);
      on = on - off + up;
    }
    this.total = on;
    this.typed = '';
    this.per = Math.max(900, 1700 - this.round * 60);
    this.state = 0;
    this.at = now + 1400;
  }

  press(): void {}

  typeKey(code: string, ts: number): boolean {
    if (this.state !== 1) return !!digitOf(code);
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
      const ok = got === this.total;
      this.lastOk = ok;
      this.offs.push(Math.abs(got - this.total));
      if (ok) {
        this.right++;
        this.best = Math.max(this.best, this.nStops);
        this.nStops = Math.min(10, this.nStops + 1);
      } else this.nStops = Math.max(2, this.nStops - 1);
      this.env.sound(ok ? SND_CATCH : SND_FALSE);
      this.round++;
      this.state = 2;
      this.at = ts + 1500;
      return true;
    }
    return false;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.at + this.stops.length * this.per) this.state = 1;
    if (this.state === 2 && now >= this.at) {
      if (this.round >= scaled(BUS_ROUNDS)) return true;
      this.arm(now);
    }
    if (now - this.firstAt > 900000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'right', String(this.right), 'trip', `${Math.min(this.round + 1, scaled(BUS_ROUNDS))} / ${scaled(BUS_ROUNDS)}`);
    // The bus.
    const bw = 220 * a.u;
    const bh = 80 * a.u;
    const bx = a.cx - bw / 2;
    const by = a.cy - 70 * a.u;
    ctx.strokeStyle = COL_DIM;
    ctx.lineWidth = 2 * dpr;
    ctx.strokeRect(bx, by, bw, bh);
    for (let k = 0; k < 5; k++) {
      ctx.strokeStyle = COL_FAINT;
      ctx.strokeRect(bx + 14 * a.u + k * 40 * a.u, by + 12 * a.u, 30 * a.u, 26 * a.u);
    }
    ctx.font = `600 ${Math.round(30 * a.u)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (this.state === 0) {
      const i = Math.floor((now - this.at) / this.per);
      if (now < this.at) {
        ctx.fillStyle = COL_LINE;
        ctx.fillText(`${this.start0} on board`, a.cx, a.cy + 50 * a.u);
      } else if (i < this.stops.length) {
        const [up, off] = this.stops[i]!;
        ctx.fillStyle = COL_MID;
        v.text(`stop ${i + 1}`, a.cx, a.cy + 24 * a.u, v.fontTiny, 'center');
        ctx.font = `600 ${Math.round(30 * a.u)}px Inter, system-ui, sans-serif`;
        ctx.fillStyle = COL_ACCENT;
        ctx.fillText(`${off} off`, a.cx - 70 * a.u, a.cy + 60 * a.u);
        ctx.fillStyle = COL_LINE;
        ctx.fillText(`${up} on`, a.cx + 70 * a.u, a.cy + 60 * a.u);
      }
    } else {
      ctx.fillStyle = this.state === 2 && !this.lastOk ? COL_ACCENT : COL_LINE;
      ctx.fillText(`${this.typed || '_'} on board`, a.cx, a.cy + 50 * a.u);
      if (this.state === 2 && !this.lastOk) {
        ctx.fillStyle = COL_MID;
        v.text(`there were ${this.total}`, a.cx, a.cy + 90 * a.u, v.fontTiny, 'center');
      }
    }
    ctx.fillStyle = COL_MID;
    v.text(this.state === 1 ? 'how many are on the bus now? type it, then Enter' : this.round === 0 && this.state === 0 ? 'keep a running count as people get off and on' : '', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.right * 60 + this.best * 30,
      primary: { label: 'most stops counted right', value: this.best, unit: 'stops' },
      lines: [
        { label: 'right', value: `${this.right} of ${this.round}` },
        { label: 'accuracy', value: this.round ? pct(this.right / this.round) : '–' },
        { label: 'typical miss when wrong', value: this.offs.some((o) => o > 0) ? String(median(this.offs.filter((o) => o > 0))) : '–' },
      ],
      saved: this.round >= 3,
    };
  }
}

export const BATCH78: MiniDef[] = [
  { id: 'cadence', name: 'Cadence', skill: 'aim', blurb: 'Targets appear on the beat. Click each one as its ring closes.', how: 'Targets appear around the screen, each with a ring closing in on it. Click the target just as its ring meets it: that moment falls on the beat you hear. Later some fall on the half beat. Forty targets; scored on how many you hit in time, and how close.', input: 'pointer', make: () => new Cadence() },
  { id: 'bus', name: 'Bus', skill: 'memory', blurb: 'People get on and off at each stop. How many are on the bus now?', how: 'A bus starts with some people on board. At each stop, some get off and some get on. Keep a running count; at the end, type how many are on board and press Enter. Get it right and the next trip has another stop. Ten trips. Needs a keyboard.', input: 'type', make: () => new Bus() },
];
