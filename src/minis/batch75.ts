// Seventy-fifth batch.
//   Plates - plates spin on poles and slow down; click each before it wobbles off.

import { COL_ACCENT, COL_DIM, COL_LINE, COL_MID } from '../config.ts';
import { SND_FALL, SND_TAP_WEAK } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, header, median, plural, scaled, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

// --- Plates ----------------------------------------------------------------------------

const PLATES_MS = 90000;
const PLATE_LIVES = 3;
const MAX_PLATES = 7;

type Plate = { spin: number; decay: number; angle: number; fell: number; on: boolean };

class Plates implements Mini {
  private env!: MiniEnv;
  private plates: Plate[] = [];
  private t0 = 0;
  private started = false;
  private last = 0;
  private falls = 0;
  private spins = 0;
  /** How low each plate was allowed to get before it was spun again. */
  private lows: number[] = [];
  private poles: [number, number][] = [];
  private firstFrame = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.last = now;
    this.plates = Array.from({ length: MAX_PLATES }, (_, k) => ({ spin: 1, decay: rnd(0.08, 0.14), angle: Math.random() * 6, fell: 0, on: k < 3 }));
  }

  press(): void {}

  pointer(x: number, y: number, ts: number): void {
    if (!this.started) {
      this.started = true;
      this.t0 = ts;
      this.last = ts;
      return;
    }
    let best = -1;
    let bd = 1e9;
    this.poles.forEach(([px, py], k) => {
      const d = Math.hypot(px - x, py - y);
      if (d < bd) [bd, best] = [d, k];
    });
    const p = this.plates[best];
    if (!p || !p.on || p.fell || bd > 80) return;
    this.lows.push(p.spin);
    p.spin = 1;
    this.spins++;
    this.env.sound(SND_TAP_WEAK);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    const len = scaled(PLATES_MS);
    if (this.started && (now - this.t0 >= len || this.falls >= PLATE_LIVES)) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.started) {
      const t = (now - this.t0) / 1000;
      // A plate joins every twelve seconds, up to seven.
      const want = Math.min(MAX_PLATES, 3 + Math.floor(t / 12));
      this.plates.forEach((p, k) => {
        if (k < want && !p.on) {
          p.on = true;
          p.spin = 1;
        }
        if (!p.on) return;
        if (p.fell) {
          // A fallen plate is put back up, spinning, after a moment.
          if (now - p.fell > 1500) {
            p.fell = 0;
            p.spin = 1;
          }
          return;
        }
        p.spin -= p.decay * (1 + t / 120) * dt;
        p.angle += p.spin * 14 * dt;
        if (p.spin <= 0) {
          p.fell = now;
          this.falls++;
          this.env.sound(SND_FALL);
        }
      });
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'spins', String(this.spins), 'time', `${left} s`, PLATE_LIVES - this.falls, PLATE_LIVES);
    const on = this.plates.filter((p) => p.on).length;
    const gap = Math.min(110 * a.u, (a.right - a.left) / (on + 0.5));
    const ground = a.bottom - 30 * a.u;
    const poleH = (a.bottom - a.top) * 0.55;
    this.poles = [];
    let i = 0;
    this.plates.forEach((p) => {
      if (!p.on) {
        this.poles.push([-1e9, -1e9]);
        return;
      }
      const x = a.cx + (i - (on - 1) / 2) * gap;
      i++;
      const top = ground - poleH;
      this.poles.push([x, top]);
      ctx.fillStyle = '#3a3a41';
      ctx.fillRect(x - 1.5 * dpr, top, 3 * dpr, poleH);
      if (p.fell) {
        ctx.fillStyle = COL_ACCENT;
        ctx.fillRect(x - 26 * a.u, ground - 6 * a.u, 52 * a.u, 6 * a.u);
        return;
      }
      // Wobble grows as the spin dies; the plate's shade dims toward the danger zone.
      const wob = p.spin < 0.4 ? (0.4 - p.spin) * 0.9 * Math.sin(now / 90 + i) : 0;
      ctx.save();
      ctx.translate(x, top);
      ctx.rotate(wob);
      const w = 30 * a.u * (0.85 + 0.15 * Math.abs(Math.cos(p.angle)));
      ctx.fillStyle = p.spin < 0.25 ? COL_ACCENT : p.spin < 0.5 ? '#b8b8c0' : COL_LINE;
      ctx.beginPath();
      ctx.ellipse(0, -4 * a.u, w, 7 * a.u, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // A small gauge of the spin left.
      ctx.fillStyle = COL_DIM;
      ctx.fillRect(x - 20 * a.u, ground + 8 * a.u, 40 * a.u, 3 * dpr);
      ctx.fillStyle = p.spin < 0.25 ? COL_ACCENT : COL_MID;
      ctx.fillRect(x - 20 * a.u, ground + 8 * a.u, 40 * a.u * Math.max(0, p.spin), 3 * dpr);
    });
    ctx.fillStyle = COL_MID;
    v.text(this.started ? plural(this.falls, 'fall') : 'click a plate to spin it up again before it slows and falls; more plates join. click to start', a.cx, a.top + 14 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const lasted = this.started ? Math.min(scaled(PLATES_MS), this.last - this.t0) : 0;
    return {
      score: Math.max(0, Math.round(lasted / 100) + this.spins * 2 - this.falls * 50),
      primary: { label: 'time kept going', value: Math.round(lasted / 1000), unit: 's' },
      lines: [
        { label: 'kept going', value: `${Math.round(lasted / 1000)} s` },
        { label: 'spins', value: String(this.spins) },
        { label: 'falls', value: String(this.falls) },
        { label: 'typical spin left when topped up', value: this.lows.length ? `${Math.round(median(this.lows) * 100)}%` : '–' },
      ],
      saved: this.started && this.spins >= 3,
    };
  }
}

export const BATCH75: MiniDef[] = [
  { id: 'plates', name: 'Plates', skill: 'attention', blurb: 'Plates spin on poles and slow down. Click each before it wobbles off.', how: 'Plates spin on poles, each slowing at its own rate; the gauge under each shows its spin. Click a plate to spin it up again. Let one run down and it wobbles, turns orange, and falls. A plate joins every twelve seconds, up to seven. Three falls, or ninety seconds.', input: 'pointer', make: () => new Plates() },
];

