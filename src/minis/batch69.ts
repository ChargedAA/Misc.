// Sixty-ninth batch.
//   Slash - things are tossed up: drag across them to cut them, but never the bombs.
//   Dice  - opposite faces of a die add to seven: what do the faces underneath add to?

import { COL_ACCENT, COL_DIM, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALL, SND_FALSE, SND_TAP_WEAK } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, header, median, ms, pct, scaled, shuffle, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const TAU = Math.PI * 2;
const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const rint = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
type Rect = [number, number, number, number];
const inside = (r: Rect, x: number, y: number) => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
const digitOf = (code: string) => (code.startsWith('Digit') ? code.slice(5) : code.startsWith('Numpad') ? code.slice(6) : '');

// --- Slash -----------------------------------------------------------------------------

const SLASH_MS = 60000;
const GRAV = 1.1;

type Toss = { x: number; y: number; vx: number; vy: number; bomb: boolean; cut: number };

/** Distance from point p to the segment a-b. */
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

class Slash implements Mini {
  private env!: MiniEnv;
  private items: Toss[] = [];
  private trail: [number, number, number][] = [];
  private down = false;
  private t0 = 0;
  private started = false;
  private last = 0;
  private nextAt = 0;
  private cuts = 0;
  private dropped = 0;
  private bombs = 0;
  private field: Rect = [0, 0, 1, 1];
  private flash = 0;
  private firstFrame = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.last = now;
  }

  private toss(now: number): void {
    const t = (now - this.t0) / 1000;
    const n = Math.random() < Math.min(0.6, t / 60) ? rint(2, 3) : 1;
    for (let k = 0; k < n; k++) {
      const x = rnd(0.15, 0.85);
      this.items.push({ x, y: 1.05, vx: (0.5 - x) * rnd(0.3, 0.7), vy: -rnd(1.15, 1.45), bomb: Math.random() < Math.min(0.25, 0.08 + t / 300), cut: 0 });
    }
    this.nextAt = now + rnd(700, 1400) / (1 + t / 90);
  }

  press(): void {}


  pointer(x: number, y: number, ts: number): void {
    if (!this.started) {
      this.started = true;
      this.t0 = ts;
      this.last = ts;
      this.nextAt = ts + 300;
    }
    this.down = true;
    this.trail = [[x, y, ts]];
  }

  pointerMove(x: number, y: number, ts: number): void {
    if (!this.down) return;
    const p = this.trail[this.trail.length - 1];
    this.trail.push([x, y, ts]);
    if (!p) return;
    const [fx, fy, fw, fh] = this.field;
    const R = fh * 0.045;
    for (const it of this.items) {
      if (it.cut) continue;
      if (segDist(fx + it.x * fw, fy + it.y * fh, p[0], p[1], x, y) <= R) {
        it.cut = ts;
        if (it.bomb) {
          this.bombs++;
          this.flash = ts + 300;
          this.env.sound(SND_FALSE);
        } else {
          this.cuts++;
          this.env.sound(SND_TAP_WEAK);
        }
      }
    }
  }

  pointerUp(): void {
    this.down = false;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    const len = scaled(SLASH_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.started) {
      if (now >= this.nextAt) this.toss(now);
      for (const it of this.items) {
        it.vy += GRAV * dt;
        it.x += it.vx * dt;
        it.y += it.vy * dt;
      }
      this.items = this.items.filter((it) => {
        if (it.cut) return now - it.cut < 300;
        if (it.y > 1.1 && it.vy > 0) {
          if (!it.bomb) {
            this.dropped++;
            this.env.sound(SND_FALL);
          }
          return false;
        }
        return true;
      });
    }
    this.trail = this.trail.filter((p) => now - p[2] < 180);
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'cut', String(this.cuts), 'time', `${left} s`);
    const fx = a.left;
    const fy = a.top + 4 * a.u;
    const fw = a.right - a.left;
    const fh = a.bottom - a.top - 30 * a.u;
    this.field = [fx, fy, fw, fh];
    const R = fh * 0.045;
    for (const it of this.items) {
      const x = fx + it.x * fw;
      const y = fy + it.y * fh;
      if (it.cut) {
        const k = (now - it.cut) / 300;
        ctx.globalAlpha = Math.max(0, 1 - k);
        ctx.fillStyle = it.bomb ? COL_ACCENT : COL_LINE;
        ctx.beginPath();
        ctx.arc(x - k * 20 * a.u, y + k * 10 * a.u, R * 0.7, 0, TAU);
        ctx.arc(x + k * 20 * a.u, y + k * 10 * a.u, R * 0.7, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
        continue;
      }
      if (it.bomb) {
        ctx.fillStyle = '#1c1c20';
        ctx.beginPath();
        ctx.arc(x, y, R, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = COL_ACCENT;
        ctx.lineWidth = 3 * dpr;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x - R * 0.45, y - R * 0.45);
        ctx.lineTo(x + R * 0.45, y + R * 0.45);
        ctx.moveTo(x + R * 0.45, y - R * 0.45);
        ctx.lineTo(x - R * 0.45, y + R * 0.45);
        ctx.stroke();
      } else {
        ctx.fillStyle = COL_LINE;
        ctx.beginPath();
        ctx.arc(x, y, R, 0, TAU);
        ctx.fill();
      }
    }
    if (this.trail.length > 1) {
      ctx.strokeStyle = now < this.flash ? COL_ACCENT : COL_LINE;
      ctx.lineWidth = 3 * dpr;
      ctx.lineCap = 'round';
      ctx.beginPath();
      this.trail.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
      ctx.lineCap = 'butt';
    }
    ctx.fillStyle = COL_MID;
    v.text(this.started ? `${this.dropped} dropped · ${this.bombs} bombs cut` : 'hold the button and drag across the white balls to cut them; never the bombs. click to start', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const all = this.cuts + this.dropped;
    return {
      score: Math.max(0, this.cuts * 10 - this.dropped * 5 - this.bombs * 50),
      primary: { label: 'cut', value: this.cuts, unit: '' },
      lines: [
        { label: 'cut', value: String(this.cuts) },
        { label: 'dropped', value: String(this.dropped) },
        { label: 'bombs cut', value: String(this.bombs) },
        { label: 'share cut', value: all ? pct(this.cuts / all) : '–' },
      ],
      saved: this.started && all >= 5,
    };
  }
}

// --- Dice ------------------------------------------------------------------------------

const DICE_MS = 60000;
const PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

class Dice implements Mini {
  private env!: MiniEnv;
  private tops: number[] = [];
  private opts: number[] = [];
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
    const n = this.ok < 6 ? 2 : this.ok < 14 ? 3 : 4;
    this.tops = Array.from({ length: n }, () => rint(1, 6));
    const sum = this.tops.reduce((s, t) => s + (7 - t), 0);
    // Wrong answers include the top sum, the classic slip.
    const top = this.tops.reduce((s, t) => s + t, 0);
    const wrong = new Set<number>();
    for (const w of shuffle([top, sum + 1, sum - 1, sum + 2, sum - 2, 7 * n - sum + 1])) {
      if (w !== sum && w > 0) wrong.add(w);
      if (wrong.size >= 3) break;
    }
    this.opts = [...wrong].slice(0, 3);
    this.answer = rint(0, 3);
    this.opts.splice(this.answer, 0, sum);
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
      this.note = `underneath: ${this.tops.map((t) => 7 - t).join(' + ')} = ${this.opts[this.answer]}`;
      this.flash = ts + 1600;
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
    const len = scaled(DICE_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'right', String(this.ok), 'time', `${left} s`);
    const s = 70 * a.u;
    const tops = this.started ? this.tops : [3, 5];
    tops.forEach((t, k) => {
      const x = a.cx + (k - (tops.length - 1) / 2) * (s + 24 * a.u);
      const y = a.cy - 70 * a.u;
      ctx.fillStyle = '#e4e4e8';
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
      ctx.fillStyle = '#111114';
      for (const [px, py] of PIPS[t]!) {
        ctx.beginPath();
        ctx.arc(x + px * s * 0.27, y + py * s * 0.27, s * 0.08, 0, TAU);
        ctx.fill();
      }
    });
    ctx.fillStyle = COL_LINE;
    v.text('the faces underneath add up to?', a.cx, a.cy + 6 * a.u, v.fontHud, 'center');
    if (this.started) {
      const bw = Math.min(90 * a.u, (a.right - a.left) / 4 - 12 * a.u);
      this.boxes = this.opts.map((_, k) => [a.cx + (k - 2) * (bw + 12 * a.u) + 6 * a.u, a.cy + 30 * a.u, bw, 46 * a.u] as Rect);
      this.boxes.forEach(([x, y, w, h], k) => {
        ctx.strokeStyle = COL_DIM;
        ctx.lineWidth = 1.5 * dpr;
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = COL_LINE;
        v.text(String(this.opts[k]), x + w / 2, y + h / 2 + 6 * dpr, v.fontHud, 'center');
        ctx.fillStyle = COL_DIM;
        v.text(String(k + 1), x + 7 * dpr, y + 13 * dpr, v.fontTiny, 'left');
      });
    }
    if (now < this.flash) {
      ctx.fillStyle = COL_ACCENT;
      v.text(this.note, a.cx, a.cy + 100 * a.u, v.fontTiny, 'center');
    }
    ctx.fillStyle = COL_MID;
    v.text(this.started ? 'opposite faces of a die always add to seven' : 'click (or press Space) to start; answer with 1 to 4 or a click. a minute', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
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
        { label: 'typical time a throw', value: this.rts.length ? ms(median(this.rts)) : '–' },
      ],
      saved: this.ok + this.bad >= 4,
    };
  }
}

export const BATCH69: MiniDef[] = [
  { id: 'slash', name: 'Slash', skill: 'aim', blurb: 'Things are tossed up. Drag across them to cut them, but never the bombs.', how: 'White balls are tossed up from below and fall back down. Hold the mouse button (or a finger) and drag across them to cut them before they fall away. Ringed bombs with a cross fly among them: cutting one costs a lot. More at once, and more bombs, as time goes on. A minute.', input: 'pointer', make: () => new Slash() },
  { id: 'dice', name: 'Dice', skill: 'reasoning', blurb: 'Opposite faces of a die add to seven. What do the faces underneath add to?', how: 'Two dice show their top faces. Each face underneath is seven minus the one on top. Pick what the hidden bottoms add up to (1 to 4, or click). Three dice after six right, four after fourteen. A minute; a mistake shows the working.', input: 'pointer', make: () => new Dice() },
];
