// Forty-first batch.
//   View - blocks seen from above, and a camera on one side: which picture does it take?
//   Pat  - tap a beat with one hand while the mouse keeps a marker company round a ring.
//   Copy - Morse by ear, the Koch way: two letters at full speed, one more each time you are sure of them.

import { COL_ACCENT, COL_DIM, COL_FAINT, COL_LINE, COL_MID } from '../config.ts';
import { SND_BEAT, SND_BEAT_UP, SND_CATCH, SND_FALSE, SND_TAP_L } from '../audio.ts';
import type { View as Screen } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, header, mean, median, ms, pct, scaled, shown, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const TAU = Math.PI * 2;
const rint = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
type Rect = [number, number, number, number];
const inside = (r: Rect, x: number, y: number) => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];

// --- View (orthographic projection) ----------------------------------------------------

type Side = 'S' | 'N' | 'E' | 'W';
const VIEW_TRIALS = 16;

class ViewDrill implements Mini {
  private env!: MiniEnv;
  private n = 3;
  /** Stack heights, row by row from the north edge. */
  private h: number[] = [];
  private side: Side = 'S';
  private opts: number[][] = [];
  private answer = 0;
  private state = 0;
  private at = 0;
  private next = 0;
  private chosen = -1;
  private boxes: Rect[] = [];
  private i = 0;
  private right = 0;
  private lives = 3;
  private rts: number[] = [];

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.next = now + 500;
  }

  /** What a camera on a side sees: for each column left to right as it looks, the tallest stack. */
  private elevation(side: Side): number[] {
    const n = this.n;
    const at = (r: number, c: number) => this.h[r * n + c]!;
    const out: number[] = [];
    for (let k = 0; k < n; k++) {
      let m = 0;
      for (let d = 0; d < n; d++) {
        // Looking north from the south edge, left is west; and so on round.
        const v = side === 'S' ? at(d, k) : side === 'N' ? at(d, n - 1 - k) : side === 'E' ? at(n - 1 - k, d) : at(k, d);
        m = Math.max(m, v);
      }
      out.push(m);
    }
    return out;
  }

  private make(): void {
    this.n = this.i >= 8 ? 4 : 3;
    for (let tries = 0; tries < 100; tries++) {
      this.h = Array.from({ length: this.n * this.n }, () => (Math.random() < 0.25 ? 0 : rint(1, this.i >= 4 ? 4 : 3)));
      this.side = (['S', 'N', 'E', 'W'] as const)[rint(0, 3)];
      const good = this.elevation(this.side);
      const key = (e: number[]) => e.join();
      const seen = new Set([key(good)]);
      const bad: number[][] = [];
      // Wrong pictures: the views from the other sides, then near misses.
      for (const s of ['S', 'N', 'E', 'W'] as const) {
        const e = this.elevation(s);
        if (!seen.has(key(e))) {
          seen.add(key(e));
          bad.push(e);
        }
      }
      let guard = 0;
      while (bad.length < 3 && guard++ < 50) {
        const e = good.slice();
        const k = rint(0, this.n - 1);
        e[k] = Math.max(0, Math.min(4, e[k]! + (Math.random() < 0.5 ? -1 : 1)));
        if (!seen.has(key(e))) {
          seen.add(key(e));
          bad.push(e);
        }
      }
      if (bad.length >= 3) {
        this.answer = rint(0, 3);
        this.opts = bad.slice(0, 3);
        this.opts.splice(this.answer, 0, good);
        this.chosen = -1;
        return;
      }
    }
  }

  press(): void {}

  private pick(k: number, ts: number): void {
    if (this.state !== 1) return;
    this.chosen = k;
    const ok = k === this.answer;
    if (ok) {
      this.right++;
      this.rts.push(ts - this.at);
      this.env.sound(SND_CATCH);
    } else {
      this.lives--;
      this.env.sound(SND_FALSE);
    }
    this.i++;
    this.state = 2;
    this.next = ts + (ok ? 800 : 1800);
  }

  typeKey(code: string, ts: number): boolean {
    const d = code.startsWith('Digit') ? Number(code.slice(5)) : code.startsWith('Numpad') ? Number(code.slice(6)) : NaN;
    if (d >= 1 && d <= 4) {
      this.pick(d - 1, ts);
      return true;
    }
    return false;
  }

  pointer(x: number, y: number, ts: number): void {
    const k = this.boxes.findIndex((r) => inside(r, x, y));
    if (k >= 0) this.pick(k, ts);
  }

  frame(now: number, v: Screen, touch: TouchLayout): boolean {
    if (this.state !== 1 && now >= this.next) {
      if (this.lives <= 0 || this.i >= scaled(VIEW_TRIALS)) return true;
      this.make();
      this.state = 1;
      this.at = now;
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'right', String(this.right), 'plan', `${Math.min(this.i + 1, scaled(VIEW_TRIALS))} / ${scaled(VIEW_TRIALS)}`, this.lives);
    // The plan: stacks seen from above, taller ones lighter, with their heights.
    const n = this.n;
    const cs = Math.min(58 * a.u, (a.bottom - a.top) * 0.4 / n);
    const px = a.cx - (n * cs) / 2;
    const py = a.top + 30 * a.u;
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) {
        const hh = this.h[r * n + c]!;
        const x = px + c * cs;
        const y = py + r * cs;
        ctx.fillStyle = hh === 0 ? '#101013' : ['#101013', '#2c2c33', '#4a4a52', '#7a7a82', '#b4b4ba'][hh]!;
        ctx.fillRect(x + dpr, y + dpr, cs - 2 * dpr, cs - 2 * dpr);
        if (hh) {
          ctx.fillStyle = hh >= 3 ? '#0a0a0b' : COL_LINE;
          v.text(String(hh), x + cs / 2, y + cs / 2 + 5 * dpr, v.fontTiny, 'center');
        }
      }
    ctx.strokeStyle = COL_DIM;
    ctx.lineWidth = dpr;
    ctx.strokeRect(px, py, n * cs, n * cs);
    // The camera, on its side, looking in.
    const cam: Record<Side, [number, number, number]> = {
      S: [a.cx, py + n * cs + 22 * a.u, -Math.PI / 2],
      N: [a.cx, py - 22 * a.u, Math.PI / 2],
      E: [px + n * cs + 22 * a.u, py + (n * cs) / 2, Math.PI],
      W: [px - 22 * a.u, py + (n * cs) / 2, 0],
    };
    const [cx, cy, ang] = cam[this.side];
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    // A camera body with an arrow pointing the way it looks.
    ctx.fillStyle = COL_ACCENT;
    ctx.fillRect(-14 * a.u, -7 * a.u, 12 * a.u, 14 * a.u);
    ctx.beginPath();
    ctx.moveTo(12 * a.u, 0);
    ctx.lineTo(1 * a.u, -8 * a.u);
    ctx.lineTo(1 * a.u, 8 * a.u);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // Four pictures: columns of blocks, as the camera would see them.
    const bw = Math.min(150 * a.u, (a.right - a.left) / 4 - 14 * a.u);
    const by = py + n * cs + 56 * a.u;
    const bh = Math.min(a.bottom - by - 20 * a.u, bw * 0.9);
    this.boxes = this.opts.map((_, k) => [a.cx + (k - 2) * (bw + 14 * a.u) + 7 * a.u, by, bw, bh] as Rect);
    this.opts.forEach((e, k) => {
      const [x, y, w, hgt] = this.boxes[k]!;
      const show = this.state === 2;
      ctx.strokeStyle = show && k === this.answer ? COL_LINE : show && k === this.chosen ? COL_ACCENT : COL_FAINT;
      ctx.lineWidth = (show && (k === this.answer || k === this.chosen) ? 2.5 : 1.5) * dpr;
      ctx.strokeRect(x, y, w, hgt);
      const unit = Math.min((w - 16 * a.u) / n, (hgt - 26 * a.u) / 4);
      const x0 = x + (w - unit * n) / 2;
      const base = y + hgt - 18 * a.u;
      ctx.fillStyle = COL_MID;
      ctx.fillRect(x + 6 * a.u, base, w - 12 * a.u, dpr);
      e.forEach((col, c) => {
        for (let q = 0; q < col; q++) {
          ctx.fillStyle = '#c8c8cc';
          ctx.fillRect(x0 + c * unit + dpr, base - (q + 1) * unit + dpr, unit - 2 * dpr, unit - 2 * dpr);
        }
      });
      ctx.fillStyle = COL_DIM;
      v.text(String(k + 1), x + 10 * a.u, y + 16 * a.u, v.fontTiny, 'left');
    });
    if (this.i < 2) {
      ctx.fillStyle = COL_MID;
      v.text('the numbers are stack heights. which picture does the orange camera take? (1 to 4)', a.cx, a.top + 8 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.right * 100,
      primary: { label: 'views right', value: this.right, unit: '' },
      lines: [
        { label: 'right', value: `${this.right} of ${this.i}` },
        { label: 'typical time a view', value: this.rts.length ? ms(median(this.rts)) : '–' },
      ],
      saved: this.i >= 3,
    };
  }
}

// --- Pat (rhythm in one hand, a smooth path in the other) --------------------------------

const PAT_ROUNDS = 4;

class Pat implements Mini {
  private env!: MiniEnv;
  private round = 0;
  private bpm = 90;
  /** Beats per lap of the ring, and its direction. */
  private perLap = 2;
  private dir = 1;
  private t0 = 0;
  private exact = false;
  private state = 0;
  private at = 0;
  private fired = 0;
  private taps: number[] = [];
  private px = -1;
  private py = -1;
  private on = 0;
  private all = 0;
  private last = 0;
  private timing: number[] = [];
  private tracking: number[] = [];
  private held = 0;
  private flash = 0;
  private cx = 0;
  private cy = 0;
  private R = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.exact = !!env.soundAt && !env.muted;
    this.arm(now + 1200, now);
  }

  private beat(): number {
    return 60000 / this.bpm;
  }

  private arm(at: number, now: number): void {
    this.bpm = 84 + this.round * 8;
    this.perLap = [2, 3, 2, 5][this.round % 4]!;
    this.dir = this.round % 2 ? -1 : 1;
    this.t0 = at;
    this.taps = [];
    this.on = 0;
    this.all = 0;
    this.fired = 0;
    this.state = 0;
    this.last = at;
    // Clicks for the first four bars only, then the beat is yours.
    if (this.exact) for (let k = 0; k < 16; k++) this.env.soundAt!(k % 4 === 0 ? SND_BEAT_UP : SND_BEAT, at - now + k * this.beat());
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (this.state !== 0) return;
    this.taps.push(ts - this.t0 - (this.exact ? (this.env.latency ?? 0) : 0));
    this.flash = ts + 80;
    this.env.sound(SND_TAP_L);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  pointerMove(x: number, y: number): void {
    this.px = x;
    this.py = y;
  }

  pointer(x: number, y: number): void {
    this.px = x;
    this.py = y;
  }

  private marker(t: number): [number, number] {
    const laps = t / (this.beat() * this.perLap);
    const ang = -Math.PI / 2 + this.dir * laps * TAU;
    return [this.cx + Math.cos(ang) * this.R, this.cy + Math.sin(ang) * this.R];
  }

  frame(now: number, v: Screen, touch: TouchLayout): boolean {
    const a = arena(v, touch);
    this.cx = a.cx;
    this.cy = a.cy;
    this.R = Math.min(a.bottom - a.top, a.right - a.left) * 0.34;
    const b = this.beat();
    const total = 32 * b;
    if (this.state === 0) {
      const t = now - this.t0;
      if (!this.exact) {
        while (this.fired < 16 && this.fired * b <= t) {
          this.env.sound(this.fired % 4 === 0 ? SND_BEAT_UP : SND_BEAT);
          this.fired++;
        }
      }
      if (t >= 0) {
        const dt = Math.min(50, now - this.last);
        this.all += dt;
        const [mx, my] = this.marker(t);
        if (this.px >= 0 && Math.hypot(this.px - mx, this.py - my) < 28 * a.u) this.on += dt;
      }
      this.last = now;
      if (t >= total) {
        // The silent bars count: taps near each beat, and time on the marker.
        const own = this.taps.filter((x) => x >= 16 * b - b / 2);
        const errs: number[] = [];
        for (let k = 16; k < 32; k++) {
          const near = own.reduce((best, x) => (Math.abs(x - k * b) < Math.abs(best - k * b) ? x : best), Infinity);
          errs.push(Math.min(b / 2, Math.abs(near - k * b)));
        }
        const timing = Math.max(0, 1 - mean(errs) / (b / 4));
        const track = this.all ? this.on / this.all : 0;
        this.timing.push(timing);
        this.tracking.push(track);
        this.env.sound(timing * track > 0.5 ? SND_CATCH : SND_FALSE);
        this.round++;
        this.state = 1;
        this.at = now + 2200;
      }
    } else if (now >= this.at) {
      if (this.round >= scaled(PAT_ROUNDS)) return true;
      this.arm(now + 900, now);
    }
    v.clear();
    const ctx = v.ctx;
    const dpr = v.dpr;
    const score = this.timing.length ? mean(this.timing.map((t, k) => t * this.tracking[k]!)) : 0;
    header(v, touch, 'both together', this.timing.length ? pct(score) : '–', 'round', `${Math.min(this.round + 1, scaled(PAT_ROUNDS))} / ${scaled(PAT_ROUNDS)}`);
    ctx.strokeStyle = COL_FAINT;
    ctx.lineWidth = 12 * dpr;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, this.R, 0, TAU);
    ctx.stroke();
    if (this.state === 0) {
      const t = shown(now) - this.t0;
      const [mx, my] = this.marker(Math.max(0, t));
      const close = this.px >= 0 && Math.hypot(this.px - mx, this.py - my) < 28 * a.u;
      ctx.strokeStyle = close ? COL_LINE : COL_MID;
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.arc(mx, my, 28 * a.u, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = now < this.flash ? COL_ACCENT : COL_LINE;
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, 10 * a.u, 0, TAU);
      ctx.fill();
      ctx.fillStyle = COL_MID;
      const bar = Math.floor(Math.max(0, t) / (4 * b)) + 1;
      v.text(t < 0 ? 'get ready' : bar <= 4 ? `tap any key on every click, and keep the pointer in the circle  ·  bar ${bar} of 8` : `the clicks have stopped: keep both going  ·  bar ${bar} of 8`, a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    } else {
      ctx.fillStyle = COL_LINE;
      v.text(`beat ${pct(this.timing[this.timing.length - 1]!)}  ·  on the circle ${pct(this.tracking[this.tracking.length - 1]!)}`, a.cx, a.cy, v.fontHud, 'center');
      ctx.fillStyle = COL_MID;
      v.text(this.round < scaled(PAT_ROUNDS) ? `next: ${[2, 3, 2, 5][this.round % 4]} beats a lap, ${this.round % 2 ? 'clockwise' : 'anticlockwise'}` : '', a.cx, a.cy + 30 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const both = this.timing.map((t, k) => t * this.tracking[k]!);
    return {
      score: Math.round(mean(both) * 1000),
      primary: { label: 'both hands together', value: Math.round(mean(both) * 100), unit: '%' },
      lines: [
        { label: 'beat kept (silent bars)', value: this.timing.length ? pct(mean(this.timing)) : '–' },
        { label: 'pointer on the circle', value: this.tracking.length ? pct(mean(this.tracking)) : '–' },
      ],
      saved: this.round >= 1,
    };
  }
}

// --- Copy (Morse by ear, Koch method) --------------------------------------------------

const KOCH = 'KMRSUAPTLOWINJEFYVGQZHBCDX';
const MORSE: Record<string, string> = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--',
  N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
};
/** One dit at 20 words a minute. */
const DIT = 60;
const COPY_MS = 120000;

class Copy implements Mini {
  private env!: MiniEnv;
  private known = 2;
  private letter = 'K';
  private state = 0; // 0 gap, 1 sounding, 2 waiting for the answer, 3 feedback
  private at = 0;
  private plan: { t: number; ms: number; done: boolean }[] = [];
  private next = 0;
  private t0 = 0;
  private started = false;
  private recent: boolean[] = [];
  private right = 0;
  private all = 0;
  private last = '';
  private rts: number[] = [];
  private firstFrame = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.next = now + 800;
  }

  private send(now: number): void {
    // New letters come up more often.
    const pool = KOCH.slice(0, this.known);
    this.letter = Math.random() < 0.35 ? pool[pool.length - 1]! : pool[rint(0, pool.length - 1)]!;
    this.plan = [];
    let t = now;
    for (const s of MORSE[this.letter]!) {
      const len = s === '.' ? DIT : DIT * 3;
      this.plan.push({ t, ms: len, done: false });
      t += len + DIT;
    }
    this.at = t;
    this.state = 1;
  }

  press(): void {}

  typeKey(code: string, ts: number, key?: string): boolean {
    if (!/^Key[A-Z]$/.test(code)) return false;
    if (!this.started) {
      this.started = true;
      this.t0 = ts;
    }
    if (this.state !== 1 && this.state !== 2) return true;
    const c = code.slice(3);
    const ok = c === this.letter;
    this.all++;
    if (ok) {
      this.right++;
      this.rts.push(ts - this.at);
    }
    this.recent.push(ok);
    if (this.recent.length > 20) this.recent.shift();
    // Ninety per cent over the last twenty: time for a new letter.
    if (this.recent.length >= 20 && this.recent.filter(Boolean).length >= 18 && this.known < KOCH.length) {
      this.known++;
      this.recent = [];
      this.last = `new letter: ${KOCH[this.known - 1]}  ${MORSE[KOCH[this.known - 1]!]!.replace(/\./g, '·').replace(/-/g, '–')}`;
    } else this.last = ok ? '' : `that was ${this.letter}  ${MORSE[this.letter]!.replace(/\./g, '·').replace(/-/g, '–')}`;
    this.env.sound(ok ? SND_CATCH : SND_FALSE);
    this.state = 3;
    this.next = ts + (ok ? 450 : 1300);
    void key;
    return true;
  }

  frame(now: number, v: Screen, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    const len = scaled(COPY_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.firstFrame > 180000) return true;
    if ((this.state === 0 || this.state === 3) && now >= this.next) this.send(now);
    for (const p of this.plan) {
      if (!p.done && now >= p.t) {
        p.done = true;
        this.env.tone?.(650, p.ms, 0, 0.16);
      }
    }
    if (this.state === 1 && now >= this.at) this.state = 2;
    // Too slow: it moves on.
    if (this.state === 2 && now - this.at > 3000) {
      this.all++;
      this.recent.push(false);
      if (this.recent.length > 20) this.recent.shift();
      this.last = `that was ${this.letter}  ${MORSE[this.letter]!.replace(/\./g, '·').replace(/-/g, '–')}`;
      this.state = 3;
      this.next = now + 1200;
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'letters known', String(this.known), 'time', `${left} s`);
    // The letters learned so far, the newest bright.
    const known = KOCH.slice(0, this.known);
    ctx.font = `600 ${Math.round(22 * a.u)}px ui-monospace, 'JetBrains Mono', Menlo, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    [...known].forEach((c, k) => {
      ctx.fillStyle = k === known.length - 1 ? COL_LINE : COL_DIM;
      ctx.fillText(c, a.cx + (k - (known.length - 1) / 2) * 24 * a.u, a.top + 20 * a.u);
    });
    ctx.fillStyle = this.state === 1 ? COL_ACCENT : COL_DIM;
    ctx.beginPath();
    ctx.arc(a.cx, a.cy - 10 * a.u, 14 * a.u, 0, TAU);
    ctx.fill();
    ctx.fillStyle = COL_MID;
    v.text(this.last || (this.started ? 'type the letter you hear' : 'listen, and type the letter you hear: K and M to begin. the clock starts at your first key'), a.cx, a.cy + 40 * a.u, v.fontTiny, 'center');
    const acc = this.recent.length ? this.recent.filter(Boolean).length / this.recent.length : 0;
    v.text(this.recent.length ? `last ${this.recent.length}: ${pct(acc)}  (90% over 20 adds a letter)` : '', a.cx, a.bottom - 6 * a.u, v.fontTiny, 'center');
    if (this.env.muted) {
      ctx.fillStyle = COL_ACCENT;
      v.text('needs sound on', a.cx, a.cy - 50 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.known * 100 + this.right,
      primary: { label: 'letters learned', value: this.known, unit: '' },
      lines: [
        { label: 'letters you copy reliably', value: `${this.known}: ${KOCH.slice(0, this.known)}` },
        { label: 'right', value: `${this.right} of ${this.all}` },
        { label: 'typical time to answer', value: this.rts.length ? ms(median(this.rts)) : '–' },
      ],
      saved: this.all >= 10,
    };
  }
}

export const BATCH41: MiniDef[] = [
  { id: 'view', name: 'View', skill: 'reasoning', blurb: 'Blocks seen from above, a camera on one side. Which picture does it take?', how: 'A plan of stacked blocks seen from above: each number is a stack’s height. An orange camera on one side looks across them. Which of the four pictures does it take? Tall stacks at the front hide shorter ones behind. Larger plans later. Three wrong ends it.', input: 'pointer', make: () => new ViewDrill() },
  { id: 'pat', name: 'Pat', skill: 'coordination', blurb: 'Tap a beat with one hand; keep the pointer on a circling marker with the other.', how: 'A marker circles a ring. Keep the pointer on it with the mouse, and at the same time tap any key on every beat. The clicks play for four bars and then stop: keep both going for four more. The beats per lap change (2, 3, then 5) and the direction flips, so the hands cannot fall into one rhythm. Scored on the silent bars.', input: 'both', make: () => new Pat() },
  { id: 'copy', name: 'Copy', skill: 'ear', blurb: 'Learn Morse by ear: two letters at full speed, one more each time you are sure.', how: 'Morse letters sound at 20 words a minute, the speed radio operators work at. Type each letter you hear. You start with just K and M; once you get 90% of the last twenty right, a new letter joins. This is the Koch method, the way operators really learn. Two minutes; scored on how many letters you have learned.', input: 'type', make: () => new Copy() },
];
