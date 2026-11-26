// Fifty-fifth batch.
//   Dawn  - a dark square starts, very slowly, to brighten. Press the moment you notice.
//   Edge  - keep your eyes on the middle; press when a dot appears out at the edge.
//   Glide - a tone slides up or down in pitch. Which way? The slides get smaller.
//   Tray  - a tray of things, then the same tray with one gone. Which one is missing?

import { COL_ACCENT, COL_DIM, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALSE, SND_TAP_WEAK } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, foreperiod, handLabel, header, median, message, ms, pct, scaled, shuffle, sideOf, Stair, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const TAU = Math.PI * 2;
const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const rint = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
type Rect = [number, number, number, number];
const inside = (r: Rect, x: number, y: number) => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];

// --- Dawn (notice a slow change) -------------------------------------------------------

const DAWN_TRIALS = 12;
/** The square's grey level at rest, and how fast it brightens (levels a second). */
const DAWN_BASE = 40;

class Dawn implements Mini {
  private env!: MiniEnv;
  private trial = 0;
  private onset = 0;
  private rate = 6;
  /** 0 waiting, 1 feedback. */
  private state = 0;
  private at = 0;
  private seen: number[] = [];
  private early = 0;
  private note = '';
  private held = 0;
  private firstAt = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.firstAt = now;
    this.arm(now);
  }

  private arm(now: number): void {
    this.onset = now + foreperiod(1500, 2500, 7000);
    // Some trials creep up slowly, some less slowly.
    this.rate = rnd(3, 9);
    this.state = 0;
  }

  private level(now: number): number {
    return DAWN_BASE + Math.max(0, (now - this.onset) / 1000) * this.rate;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (this.state !== 0) return;
    if (ts < this.onset) {
      this.early++;
      this.note = 'nothing had changed yet';
      this.env.sound(SND_FALSE);
      this.state = 1;
      this.at = ts + 1200;
      return;
    }
    const d = this.level(ts) - DAWN_BASE;
    this.seen.push(d);
    this.note = `you saw it at +${d.toFixed(1)} levels, after ${((ts - this.onset) / 1000).toFixed(1)} s`;
    this.env.sound(SND_CATCH);
    this.trial++;
    this.state = 1;
    this.at = ts + 1500;
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  pointer(_x: number, _y: number, ts: number): void {
    this.press(0, ts);
    this.release(0);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 1 && now >= this.at) {
      if (this.trial >= scaled(DAWN_TRIALS)) return true;
      this.arm(now);
    }
    // Too slow to notice at all: count it as seen very late, and move on.
    if (this.state === 0 && this.level(now) - DAWN_BASE > 60) {
      this.seen.push(60);
      this.trial++;
      this.note = 'it got much brighter without a press';
      this.state = 1;
      this.at = now + 1500;
    }
    if (now - this.firstAt > 600000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'typical change seen', this.seen.length ? `+${median(this.seen).toFixed(1)}` : '–', 'trial', `${Math.min(this.trial + 1, scaled(DAWN_TRIALS))} / ${scaled(DAWN_TRIALS)}`);
    const s = Math.min(220 * a.u, (a.bottom - a.top) * 0.6);
    const g = this.state === 0 ? Math.round(Math.min(255, this.level(now))) : DAWN_BASE;
    ctx.fillStyle = `rgb(${g},${g},${g})`;
    ctx.fillRect(a.cx - s / 2, a.cy - s / 2 - 10 * a.u, s, s);
    ctx.fillStyle = this.state === 1 && this.note.startsWith('nothing') ? COL_ACCENT : COL_MID;
    v.text(this.state === 1 ? this.note : this.trial === 0 ? 'press any key (or tap) the moment the square starts to brighten' : '', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const m = median(this.seen);
    return {
      score: this.seen.length ? Math.max(0, Math.round((40 - m) * 25) - this.early * 30) : 0,
      primary: { label: 'typical change you notice', value: Number(m.toFixed(1)), unit: 'levels', lower: true, decimals: 1 },
      lines: [
        { label: 'typical change seen', value: this.seen.length ? `+${m.toFixed(1)} of 255` : '–' },
        { label: 'pressed too early', value: String(this.early) },
      ],
      saved: this.seen.length >= 4,
    };
  }
}

// --- Edge (peripheral reaction) --------------------------------------------------------

const EDGE_TRIALS = 24;

class Edge implements Mini {
  private env!: MiniEnv;
  private trial = 0;
  private due = 0;
  private x = 0;
  private y = 0;
  private far = false;
  private shownAt = 0;
  private state = 0; // 0 waiting, 1 showing, 2 feedback
  private at = 0;
  private near: number[] = [];
  private farRts: number[] = [];
  private early = 0;
  private misses = 0;
  private last = '';
  private held = 0;
  private firstAt = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.firstAt = now;
    this.arm(now);
  }

  private arm(now: number): void {
    this.due = now + foreperiod(800, 1200, 4000);
    this.far = Math.random() < 0.5;
    const ang = rnd(0, TAU);
    const r = this.far ? rnd(0.85, 0.98) : rnd(0.35, 0.5);
    this.x = Math.cos(ang) * r;
    this.y = Math.sin(ang) * r;
    this.state = 0;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (this.state === 2) return;
    if (this.state === 0) {
      this.early++;
      this.last = 'too soon';
      this.env.sound(SND_FALSE);
      this.state = 2;
      this.at = ts + 800;
      return;
    }
    const rt = ts - this.shownAt;
    (this.far ? this.farRts : this.near).push(rt);
    this.last = ms(rt);
    this.env.sound(SND_TAP_WEAK);
    this.trial++;
    this.state = 2;
    this.at = ts + 500;
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
    if (this.state === 1 && now - this.shownAt > 1500) {
      this.misses++;
      this.trial++;
      this.last = 'missed it';
      this.env.sound(SND_FALSE);
      this.state = 2;
      this.at = now + 700;
    }
    if (this.state === 2 && now >= this.at) {
      if (this.trial >= scaled(EDGE_TRIALS)) return true;
      this.arm(now);
    }
    if (now - this.firstAt > 600000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const all = [...this.near, ...this.farRts];
    header(v, touch, 'typical', all.length ? ms(median(all)) : '–', 'trial', `${Math.min(this.trial + 1, scaled(EDGE_TRIALS))} / ${scaled(EDGE_TRIALS)}`);
    const rx = (a.right - a.left) / 2;
    const ry = (a.bottom - a.top) / 2;
    // The fixation cross, always on.
    ctx.fillStyle = COL_LINE;
    ctx.fillRect(a.cx - 10 * a.u, a.cy - dpr, 20 * a.u, 2 * dpr);
    ctx.fillRect(a.cx - dpr, a.cy - 10 * a.u, 2 * dpr, 20 * a.u);
    if (this.state === 1) {
      ctx.fillStyle = COL_LINE;
      ctx.beginPath();
      ctx.arc(a.cx + this.x * rx, a.cy + this.y * ry, 7 * a.u, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = this.state === 2 && (this.last === 'too soon' || this.last === 'missed it') ? COL_ACCENT : COL_MID;
    if (this.state === 2) v.text(this.last, a.cx, a.cy + 34 * a.u, v.fontTiny, 'center');
    if (this.trial === 0 && this.state === 0) {
      ctx.fillStyle = COL_MID;
      v.text('look only at the cross; press any key when a dot appears anywhere', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const all = [...this.near, ...this.farRts];
    const m = median(all);
    return {
      score: all.length ? Math.max(0, Math.round((700 - m) * 3) - (this.early + this.misses) * 20) : 0,
      primary: { label: 'typical reaction', value: m, unit: 'ms', lower: true },
      lines: [
        { label: 'near the middle', value: ms(median(this.near)) },
        { label: 'out at the edge', value: ms(median(this.farRts)) },
        { label: 'too soon', value: String(this.early) },
        { label: 'missed', value: String(this.misses) },
      ],
      saved: all.length >= 6,
    };
  }
}

// --- Glide -----------------------------------------------------------------------------

/** Size of the slide, in cents (hundredths of a semitone). */
const GLIDE = [400, 300, 200, 140, 100, 70, 50, 35, 25, 18, 12, 8];
const GLIDE_TRIALS = 30;

class Glide implements Mini {
  private env!: MiniEnv;
  private readonly stair = new Stair(0, 1, 0, GLIDE.length - 1, 2);
  private i = 0;
  private up = true;
  private state = 0;
  private next = 0;
  private right = 0;
  private levels: number[] = [];
  private last = '';
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.next = now + 800;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (s === 0 || this.state !== 2) return;
    const ok = (s > 0) === this.up;
    if (ok) this.right++;
    this.levels.push(GLIDE[Math.round(this.stair.level)]!);
    this.stair.update(ok, 1);
    this.last = ok ? '' : `it slid ${this.up ? 'up' : 'down'}`;
    this.env.sound(ok ? SND_TAP_WEAK : SND_FALSE);
    this.i++;
    this.state = 3;
    this.next = ts + (ok ? 500 : 1000);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if ((this.state === 0 || this.state === 3) && now >= this.next) {
      if (this.i >= scaled(GLIDE_TRIALS)) return true;
      const c = GLIDE[Math.round(this.stair.level)]!;
      this.up = Math.random() < 0.5;
      const hz = 330 * 2 ** (Math.random() * 1.3);
      this.env.tone?.(hz, 450, 0, 0.12, hz * 2 ** (((this.up ? 1 : -1) * c) / 1200));
      this.state = 1;
      this.next = now + 550;
    }
    if (this.state === 1 && now >= this.next) this.state = 2;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'slide', `${GLIDE[Math.round(this.stair.level)]} cents`, 'tone', `${Math.min(this.i + 1, scaled(GLIDE_TRIALS))} / ${scaled(GLIDE_TRIALS)}`);
    ctx.fillStyle = this.state === 2 ? COL_LINE : this.state === 3 ? COL_ACCENT : COL_MID;
    v.text(this.state === 1 ? 'listen…' : this.state === 2 ? 'did it slide up or down?' : this.last, a.cx, a.cy, v.fontHud, 'center');
    if (this.env.muted) message(v, { ...a, cy: a.cy + 50 * a.u }, '', 'needs sound on', COL_ACCENT);
    const off = Math.min(200 * a.u, (a.right - a.left) / 2 - 30 * a.u);
    ctx.fillStyle = COL_MID;
    v.text(`${handLabel(this.env, -1)}  down`, a.cx - off, a.bottom - 6 * a.u, v.fontTiny, 'center');
    v.text(`up  ${handLabel(this.env, 1)}`, a.cx + off, a.bottom - 6 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const thr = this.levels.length >= 6 ? median(this.levels.slice(-10)) : 0;
    return {
      score: thr ? Math.round(Math.max(0, 420 - thr) * 4) : 0,
      primary: { label: 'smallest slide heard', value: thr, unit: 'cents', lower: true },
      lines: [
        { label: 'right', value: `${this.right} of ${this.i}` },
        { label: 'smallest slide reached', value: this.levels.length ? `${Math.min(...this.levels)} cents` : '–' },
        { label: 'in semitones', value: thr ? (thr / 100).toFixed(2) : '–' },
      ],
      saved: this.i >= 10,
    };
  }
}

// --- Tray ------------------------------------------------------------------------------

const TRAY_ROUNDS = 12;
/** Things on the tray: a shape and a shade. */
const SHADES = [COL_LINE, '#8a8a92', COL_ACCENT];
const NSHAPES = 6;
type Thing = { shape: number; shade: number };

function thing(ctx: CanvasRenderingContext2D, t: Thing, x: number, y: number, r: number): void {
  ctx.fillStyle = SHADES[t.shade]!;
  ctx.beginPath();
  switch (t.shape) {
    case 0:
      ctx.arc(x, y, r, 0, TAU);
      break;
    case 1:
      ctx.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7);
      break;
    case 2:
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y + r * 0.8);
      ctx.lineTo(x - r, y + r * 0.8);
      ctx.closePath();
      break;
    case 3:
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r * 0.75, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r * 0.75, y);
      ctx.closePath();
      break;
    case 4:
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        if (i) ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        else ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      ctx.closePath();
      break;
    default:
      ctx.rect(x - r, y - r * 0.4, 2 * r, r * 0.8);
  }
  ctx.fill();
}

class Tray implements Mini {
  private env!: MiniEnv;
  private round = 0;
  private n = 5;
  private things: Thing[] = [];
  private pos: [number, number][] = [];
  private pos2: [number, number][] = [];
  private gone = 0;
  private options: Thing[] = [];
  private answer = 0;
  /** 0 study, 1 gap, 2 answer, 3 feedback. */
  private state = 0;
  private at = 0;
  private boxes: Rect[] = [];
  private chosen = -1;
  private right = 0;
  private best = 0;
  private streak = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.arm(now);
  }

  private spots(n: number): [number, number][] {
    const out: [number, number][] = [];
    for (let tries = 0; out.length < n && tries < 3000; tries++) {
      const x = rnd(0.08, 0.92);
      const y = rnd(0.12, 0.88);
      if (out.every(([px, py]) => Math.hypot((px - x) * 1.6, py - y) > 0.2)) out.push([x, y]);
    }
    while (out.length < n) out.push([rnd(0.08, 0.92), rnd(0.12, 0.88)]);
    return out;
  }

  private arm(now: number): void {
    const all: Thing[] = [];
    for (let s = 0; s < NSHAPES; s++) for (let c = 0; c < SHADES.length; c++) all.push({ shape: s, shade: c });
    this.things = shuffle(all).slice(0, this.n);
    this.pos = this.spots(this.n);
    this.gone = rint(0, this.n - 1);
    this.pos2 = this.spots(this.n - 1);
    // Options: the missing thing, two still on the tray, and one never there.
    const present = this.things.filter((_, k) => k !== this.gone);
    const never = all.filter((t) => !this.things.some((u) => u.shape === t.shape && u.shade === t.shade));
    const opts = [this.things[this.gone]!, ...shuffle([...present]).slice(0, 2), shuffle([...never])[0]!];
    const order = shuffle([0, 1, 2, 3]);
    this.options = order.map((k) => opts[k]!);
    this.answer = order.indexOf(0);
    this.state = 0;
    this.at = now + 2000 + this.n * 450;
    this.chosen = -1;
  }

  press(): void {}

  pointer(x: number, y: number, ts: number): void {
    if (this.state === 0) {
      this.state = 1;
      this.at = ts + 500;
      return;
    }
    if (this.state !== 2) return;
    const k = this.boxes.findIndex((r) => inside(r, x, y));
    if (k < 0) return;
    this.chosen = k;
    const ok = k === this.answer;
    if (ok) {
      this.right++;
      this.best = Math.max(this.best, this.n);
      if (++this.streak % 2 === 0) this.n = Math.min(14, this.n + 1);
    } else {
      this.streak = 0;
      this.n = Math.max(4, this.n - 1);
    }
    this.env.sound(ok ? SND_CATCH : SND_FALSE);
    this.round++;
    this.state = 3;
    this.at = ts + (ok ? 900 : 1700);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.at) {
      this.state = 1;
      this.at = now + 500;
    } else if (this.state === 1 && now >= this.at) this.state = 2;
    else if (this.state === 3 && now >= this.at) {
      if (this.round >= scaled(TRAY_ROUNDS)) return true;
      this.arm(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'right', String(this.right), 'tray', `${Math.min(this.round + 1, scaled(TRAY_ROUNDS))} / ${scaled(TRAY_ROUNDS)}`);
    const th = Math.min(a.bottom - a.top - 120 * a.u, (a.right - a.left) / 1.6);
    const tw = th * 1.6;
    const tx = a.cx - tw / 2;
    const ty = a.top + 6 * a.u;
    ctx.fillStyle = '#141418';
    ctx.fillRect(tx, ty, tw, th);
    ctx.strokeStyle = COL_DIM;
    ctx.lineWidth = 1.5 * dpr;
    ctx.strokeRect(tx, ty, tw, th);
    const r = th * 0.06;
    if (this.state === 0) this.things.forEach((t, k) => thing(ctx, t, tx + this.pos[k]![0] * tw, ty + this.pos[k]![1] * th, r));
    else if (this.state >= 2) this.things.filter((_, k) => k !== this.gone).forEach((t, k) => thing(ctx, t, tx + this.pos2[k]![0] * tw, ty + this.pos2[k]![1] * th, r));
    if (this.state >= 2) {
      const bw = Math.min(70 * a.u, (a.right - a.left) / 5);
      const by = ty + th + 14 * a.u;
      this.boxes = this.options.map((_, k) => [a.cx + (k - 2) * (bw + 12 * a.u) + 6 * a.u, by, bw, bw] as Rect);
      this.boxes.forEach(([x, y, w, h], k) => {
        const show = this.state === 3;
        ctx.strokeStyle = show && k === this.answer ? COL_LINE : show && k === this.chosen ? COL_ACCENT : COL_DIM;
        ctx.lineWidth = (show && (k === this.answer || k === this.chosen) ? 2.5 : 1.5) * dpr;
        ctx.strokeRect(x, y, w, h);
        thing(ctx, this.options[k]!, x + w / 2, y + h / 2, w * 0.28);
      });
    }
    ctx.fillStyle = COL_MID;
    v.text(this.state === 0 ? `remember the ${this.n} things on the tray (click when ready)` : this.state === 2 ? 'one is gone, and the rest moved. which is missing?' : '', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.right * 60 + this.best * 30,
      primary: { label: 'missing things found', value: this.right, unit: `of ${this.round}` },
      lines: [
        { label: 'right', value: `${this.right} of ${this.round}` },
        { label: 'biggest tray solved', value: this.best ? `${this.best} things` : '–' },
        { label: 'accuracy', value: this.round ? pct(this.right / this.round) : '–' },
      ],
      saved: this.round >= 4,
    };
  }
}

export const BATCH55: MiniDef[] = [
  { id: 'dawn', name: 'Dawn', skill: 'reaction', blurb: 'A dark square starts, very slowly, to brighten. Press the moment you notice.', how: 'A dim square. At some point it starts to brighten, very slowly, so there is no sudden flash to catch. Press any key (or tap) as soon as you see it change. Pressing before it starts counts against you. Twelve trials; scored on how small a change you notice.', input: 'both', make: () => new Dawn() },
  { id: 'edge', name: 'Edge', skill: 'reaction', blurb: 'Keep your eyes on the middle. Press when a dot appears out at the edge.', how: 'Look only at the cross in the middle. A dot appears somewhere: sometimes close, sometimes out at the edge of the screen. Press any key the moment you see it, without moving your eyes. Your times near the middle and out at the edge are shown apart. Twenty-four dots.', input: 'both', make: () => new Edge() },
  { id: 'glide', name: 'Glide', skill: 'ear', blurb: 'A tone slides up or down in pitch. Which way? The slides get smaller.', how: 'A short tone slides smoothly in pitch, up or down. Press right for up, left for down. Get them right and the slides shrink; miss and they grow. Thirty tones; scored on the smallest slide you can hear. Needs sound on.', input: 'keys', minKeys: 2, make: () => new Glide() },
  { id: 'tray', name: 'Tray', skill: 'memory', blurb: 'A tray of things, then the same tray with one gone. Which one is missing?', how: 'A tray of shapes in different shades: remember them (click when ready). Then the tray comes back with everything moved and one thing gone. Click the missing one among four choices; the others include things still there, and one that never was. Two right and the tray grows. Twelve trays.', input: 'pointer', make: () => new Tray() },
];
