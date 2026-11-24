// Fourth batch.
//   Poly   - two hands, two tempos at once (2 against 3, and up).
//   Glance - centre shape and a dot out in the corner of your eye, in one blink.
//   Spot   - did anything change between two looks?
//   Ladder - the target rate climbs every second. Hold on as long as you can.
//   Swing  - press as the pendulum passes the bottom. It speeds up, then hides.
//   Stream - letters fly past; press for the X.

import { COL_ACCENT, COL_DIM, COL_FAINT, COL_LINE, COL_MID } from '../config.ts';
import { SND_BEAT, SND_BEAT_UP, SND_CATCH, SND_FALL, SND_FALSE, SND_TAP_L, SND_TAP_R, SND_TAP_WEAK, SND_TONE, SND_UI } from '../audio.ts';
import { SHAPE_CIRCLE, SHAPE_CROSS, SHAPE_DIAMOND, SHAPE_SQUARE, SHAPE_TRIANGLE, type View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import {
  Stair,
  arena,
  footer,
  handLabel,
  header,
  mean,
  median,
  message,
  ms,
  pct,
  progress,
  shuffle,
  shown,
  sideOf,
  slotsOf,
  type Mini,
  type MiniDef,
  type MiniEnv,
  type MiniResult,
  scaled,
} from './kit.ts';

const TAU = Math.PI * 2;
const GREY = '#6c6c74';

// --- Poly -------------------------------------------------------------------------

/** Two-hand ratios, easiest first. */
const POLY2: number[][] = [
  [1, 2], [1, 3], [2, 3], [3, 2], [3, 4], [4, 3], [2, 5], [5, 2], [3, 5], [5, 3],
  [4, 5], [5, 4], [5, 6], [3, 7], [6, 5], [4, 7], [7, 4], [5, 7], [7, 5], [7, 8],
];
/** Three-lane ratios (outer left, middle, outer right), for three keys or more. */
const POLY3: number[][] = [
  [1, 2, 4], [2, 3, 4], [2, 4, 3], [3, 2, 4], [2, 3, 5], [3, 4, 5], [3, 5, 4], [4, 5, 6], [3, 4, 7], [4, 5, 7],
];
/** The pass mark for a round: share of beats on time on your own. */
const POLY_PASS = 0.7;
/** Failed rounds allowed when the level is 0 (standard). */
const POLY_TRIES = 3;
/** Play-through: every stage once, no failing. */
const POLY_THROUGH = 1000;
const LANE_SOUND = [SND_BEAT, SND_BEAT_UP, SND_TONE + 4];

/** The stages for a player with this many lanes: three-way rhythms join after the basics. */
function polyStages(lanes: number): number[][] {
  if (lanes < 3) return POLY2;
  const out = POLY2.slice(0, 6);
  for (let i = 0; i < Math.max(POLY2.length - 6, POLY3.length); i++) {
    if (POLY3[i]) out.push(POLY3[i]!);
    if (POLY2[6 + i]) out.push(POLY2[6 + i]!);
  }
  return out;
}

class Poly implements Mini {
  private env!: MiniEnv;
  private slots: number[] = [];
  private stages: number[][] = POLY2;
  private stage = 0;
  private tries = POLY_TRIES;
  private failed = 0;
  private through = false;
  private ratio: number[] = [1, 2];
  private cycle = 2000;
  private guideLoops = 4;
  private ownLoops = 4;
  private t0 = 0;
  private state = 0; // 0 playing, 1 round summary
  private at = 0;
  private exact = false;
  /** Every expected beat of this round: lane, time from t0, and how it went. */
  private beats: { h: number; t: number; hit: boolean; off: number }[] = [];
  private fired = 0;
  private onTime = 0;
  private judged = 0;
  private offs: number[] = [];
  private cleared = 0;
  private rounds = 0;
  private played: { name: string; score: number }[] = [];
  private summary = '';
  private sub = '';
  private lastPass = false;
  private over = false;
  private held = 0;
  private flash: number[] = [0, 0, 0];

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.exact = !!env.soundAt && !env.muted;
    this.slots = slotsOf(env.mode);
    this.stages = polyStages(this.slots.length >= 3 ? 3 : 2);
    const lv = env.level ?? 0;
    this.through = lv >= POLY_THROUGH;
    this.tries = lv > 0 && !this.through ? lv : POLY_TRIES;
    this.newRound(now + 1200, now);
  }

  /** Which lane a key plays: by hand with two lanes; outer left, middle, outer right with three. */
  private laneOf(slot: number): number {
    if (this.ratio.length === 2) return sideOf(slot) === 0 ? -1 : sideOf(slot) < 0 ? 0 : 1;
    const i = this.slots.indexOf(slot);
    return i <= 0 ? 0 : i >= this.slots.length - 1 ? 2 : 1;
  }

  private laneKeys(h: number): string {
    if (this.ratio.length === 2) return handLabel(this.env, h ? 1 : -1);
    const idx = h === 0 ? [0] : h === 2 ? [this.slots.length - 1] : this.slots.map((_, i) => i).slice(1, -1);
    return idx.map((i) => this.env.labels[this.slots[i]!] ?? '').join(' / ');
  }

  private win(h: number): number {
    return Math.max(60, Math.min(120, (this.cycle / this.ratio[h]!) * 0.22));
  }

  private name(r = this.ratio): string {
    return r.join(':');
  }

  private newRound(at: number, now: number): void {
    this.ratio = this.stages[Math.min(this.stage, this.stages.length - 1)]!;
    // A loop long enough that the busiest lane has at least ~300 ms between taps.
    this.cycle = Math.max(1800, Math.max(...this.ratio) * 320);
    this.guideLoops = this.stage < 6 ? 4 : 3;
    this.ownLoops = 4;
    this.t0 = at;
    this.state = 0;
    this.beats = [];
    this.fired = 0;
    const loops = this.guideLoops + this.ownLoops;
    for (let c = 0; c < loops; c++)
      for (let h = 0; h < this.ratio.length; h++)
        for (let k = 0; k < this.ratio[h]!; k++) this.beats.push({ h, t: c * this.cycle + (k * this.cycle) / this.ratio[h]!, hit: false, off: 0 });
    this.beats.sort((x, y) => x.t - y.t);
    if (this.exact) {
      for (let c = 0; c < loops; c++) {
        if (c < this.guideLoops) {
          for (let h = 0; h < this.ratio.length; h++)
            for (let k = 0; k < this.ratio[h]!; k++) this.env.soundAt!(LANE_SOUND[h]!, at - now + c * this.cycle + (k * this.cycle) / this.ratio[h]!);
        } else this.env.soundAt!(SND_UI, at - now + c * this.cycle);
      }
    }
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (this.state !== 0 || this.over) return;
    if (!this.slots.includes(slot)) return;
    const h = this.laneOf(slot);
    if (h < 0) return;
    // Judged against when the click was heard.
    const t = ts - this.t0 - (this.exact ? (this.env.latency ?? 0) : 0);
    this.flash[h] = ts + 90;
    this.env.sound(h === 0 ? SND_TAP_L : SND_TAP_R);
    // The nearest unjudged beat of this lane within the window takes the tap.
    let best: (typeof this.beats)[number] | null = null;
    for (const b of this.beats) if (b.h === h && !b.hit && Math.abs(b.t - t) <= this.win(h) && (!best || Math.abs(b.t - t) < Math.abs(best.t - t))) best = b;
    if (best) {
      best.hit = true;
      best.off = t - best.t;
    }
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  private finishRound(now: number): void {
    // Only the loops on your own count.
    const own = this.beats.filter((b) => b.t >= this.guideLoops * this.cycle);
    const hits = own.filter((b) => b.hit);
    const score = own.length ? hits.length / own.length : 0;
    this.onTime += hits.length;
    this.judged += own.length;
    this.offs.push(...hits.map((b) => b.off));
    this.played.push({ name: this.name(), score });
    this.rounds++;
    const lane = (h: number) => {
      const mine = own.filter((b) => b.h === h);
      return mine.length ? Math.round((100 * mine.filter((b) => b.hit).length) / mine.length) : 0;
    };
    const names = this.ratio.length === 2 ? ['left', 'right'] : ['left', 'middle', 'right'];
    this.lastPass = score >= POLY_PASS;
    this.summary = `${this.name()}: ${Math.round(score * 100)}% on time`;
    this.sub = this.ratio.map((_, h) => `${names[h]} ${lane(h)}%`).join('   ');
    if (this.lastPass) {
      this.cleared++;
      this.env.sound(SND_CATCH);
    } else {
      this.failed++;
      this.env.sound(SND_FALSE);
    }
    // Passing moves you on; failing repeats the ratio, unless playing through.
    if (this.lastPass || this.through) this.stage++;
    if (this.stage >= this.stages.length || (!this.through && this.failed >= this.tries)) this.over = true;
    this.state = 1;
    this.at = now + 2600;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const t = now - this.t0;
    if (this.state === 0) {
      // Without scheduled audio, fire the guide clicks from frames.
      if (!this.exact)
        while (this.fired < this.beats.length && this.beats[this.fired]!.t <= t) {
          const b = this.beats[this.fired]!;
          if (b.t < this.guideLoops * this.cycle) this.env.sound(LANE_SOUND[b.h]!);
          this.fired++;
        }
      if (t >= (this.guideLoops + this.ownLoops) * this.cycle + 400) this.finishRound(now);
    } else if (now >= this.at) {
      if (this.over) return true;
      this.newRound(now + 900, now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'stage', `${Math.min(this.stage + (this.state === 1 ? 0 : 1), this.stages.length)} / ${this.stages.length}`, 'ratio', this.name(), this.through || this.tries > 6 ? -1 : this.tries - this.failed, this.tries);
    if (this.state === 1) {
      const next = this.over ? '' : this.lastPass || this.through ? `next: ${this.name(this.stages[this.stage]!)}` : `again: ${this.name()}  ·  ${this.tries - this.failed} ${this.tries - this.failed === 1 ? 'try' : 'tries'} left`;
      message(v, a, this.summary, this.sub);
      if (next) {
        ctx.fillStyle = COL_LINE;
        v.text(next, a.cx, a.cy + 64 * a.u, v.fontTiny, 'center');
      }
      footer(v, touch, this.held);
      return false;
    }
    // Draw for when the frame is seen and the click heard, so a beat meets the line as you hear it.
    const td = shown(now) - this.t0 - (this.exact ? (this.env.latency ?? 0) : 0);
    const cyc = Math.floor(Math.max(0, t) / this.cycle);
    const guide = cyc < this.guideLoops;
    // Lanes; beats slide right to left onto the hit line. Each lane shows about one loop ahead.
    const n = this.ratio.length;
    const gap = n === 2 ? 96 : 76;
    const span = Math.min(a.right - a.left, 620 * a.u);
    const x0 = a.cx - span / 2;
    const hitX = x0 + span * 0.12;
    const pxPerMs = (span * 0.85) / this.cycle;
    const loops = this.guideLoops + this.ownLoops;
    for (let h = 0; h < n; h++) {
      const y = a.cy + (h - (n - 1) / 2) * gap * a.u;
      ctx.fillStyle = COL_FAINT;
      ctx.fillRect(x0, y, span, dpr);
      // Loop starts: thin bars, always shown, so you can keep your place on your own.
      for (let c = 0; c <= loops; c++) {
        const x = hitX + (c * this.cycle - td) * pxPerMs;
        if (x < x0 || x > x0 + span) continue;
        ctx.fillStyle = COL_DIM;
        ctx.fillRect(x - dpr / 2, y - 20 * a.u, dpr, 40 * a.u);
      }
      for (const b of this.beats) {
        if (b.h !== h) continue;
        const x = hitX + (b.t - td) * pxPerMs;
        if (x < x0 - 10 || x > x0 + span) continue;
        const ownBeat = b.t >= this.guideLoops * this.cycle;
        // On your own, beats ahead are hidden; you see only how the ones behind went.
        if (ownBeat && b.t > td - 50 && !b.hit) continue;
        ctx.beginPath();
        ctx.arc(x, y, 7 * a.u, 0, TAU);
        if (b.hit) {
          ctx.fillStyle = COL_LINE;
          ctx.fill();
        } else if (b.t < td - this.win(h)) {
          ctx.strokeStyle = COL_ACCENT;
          ctx.lineWidth = 1.5 * dpr;
          ctx.stroke();
        } else {
          ctx.strokeStyle = ownBeat ? COL_DIM : COL_MID;
          ctx.lineWidth = 1.5 * dpr;
          ctx.stroke();
        }
      }
      // The hit line, lit when that lane taps.
      ctx.fillStyle = now < this.flash[h]! ? COL_ACCENT : COL_LINE;
      ctx.fillRect(hitX - dpr, y - 16 * a.u, 2 * dpr, 32 * a.u);
      ctx.fillStyle = COL_MID;
      v.text(`${this.laneKeys(h)}  ·  ${this.ratio[h]} per loop`, x0, y - 26 * a.u, v.fontTiny, 'left');
    }
    ctx.fillStyle = guide ? COL_MID : COL_LINE;
    v.text(
      t < 0
        ? `${this.name()}: get ready`
        : guide
          ? `join in: tap each lane as its beats reach the line  ·  loop ${cyc + 1} of ${this.guideLoops}`
          : `on your own: keep ${n === 2 ? 'both' : 'all three'} going  ·  ${cyc - this.guideLoops + 1} of ${this.ownLoops}`,
      a.cx,
      a.cy + ((n - 1) / 2) * gap * a.u + 60 * a.u,
      v.fontTiny,
      'center',
    );
    if (this.stage === 0 && this.slots.length < 3 && t < 0) {
      ctx.fillStyle = COL_DIM;
      v.text('play with three keys or more for three-way rhythms', a.cx, a.bottom - 14 * dpr, v.fontTiny, 'center');
    }
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const share = this.judged ? this.onTime / this.judged : 0;
    return {
      score: Math.round(this.cleared * 100 + share * 200),
      primary: { label: 'ratios cleared', value: this.cleared, unit: '' },
      series: { label: 'on time by round', names: this.played.map((r) => r.name), values: this.played.map((r) => Math.round(r.score * 100)), unit: '%' },
      lines: [
        { label: 'ratios cleared (70% on time on your own)', value: String(this.cleared) },
        { label: 'beats on time, on your own', value: `${this.onTime} of ${this.judged}  (${pct(share)})` },
        { label: 'typical timing of hits', value: this.offs.length ? `${Math.round(Math.abs(mean(this.offs)))} ms ${mean(this.offs) >= 0 ? 'late' : 'early'}` : '–' },
        { label: 'hardest cleared', value: this.played.filter((r) => r.score >= POLY_PASS).map((r) => r.name).pop() ?? '–' },
      ],
      saved: this.rounds >= 1,
    };
  }
}

// --- Glance (useful field of view) ------------------------------------------------

const GLANCE_TRIALS = 24;

class Glance implements Mini {
  private env!: MiniEnv;
  private centre = SHAPE_CIRCLE;
  private dir = 0;
  private state = 0; // 0 fixate, 1 flash, 2 mask, 3 answer centre, 4 answer place, 5 feedback
  private at = 0;
  private i = 0;
  private bothRight = 0;
  private centreRight = 0;
  private placeRight = 0;
  private gotCentre = false;
  private readonly show = new Stair(400, 30, 16, 600);
  private best = 600;
  private rects: [number, number, number, number, number][] = [];

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.arm(now + 600);
  }

  private arm(now: number): void {
    this.centre = Math.random() < 0.5 ? SHAPE_CIRCLE : SHAPE_SQUARE;
    this.dir = Math.floor(Math.random() * 8);
    this.state = 0;
    this.at = now + 700;
  }

  press(): void {}

  pointer(px: number, py: number, ts: number): void {
    if (this.state !== 3 && this.state !== 4) return;
    for (const [x, y, w, h, val] of this.rects) {
      if (px < x || px > x + w || py < y || py > y + h) continue;
      if (this.state === 3) {
        this.gotCentre = val === this.centre;
        if (this.gotCentre) this.centreRight++;
        this.state = 4;
        this.at = ts + 8000;
        this.env.sound(SND_TAP_WEAK);
      } else {
        const ok = val === this.dir;
        if (ok) this.placeRight++;
        const both = ok && this.gotCentre;
        if (both) {
          this.bothRight++;
          if (this.show.level < this.best) this.best = this.show.level;
        }
        this.show.update(both, -1);
        this.env.sound(both ? SND_CATCH : SND_FALSE);
        this.i++;
        this.state = 5;
        this.at = ts + 700;
      }
      return;
    }
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.at) {
      this.state = 1;
      this.at = now + this.show.level;
    } else if (this.state === 1 && now >= this.at) {
      this.state = 2;
      this.at = now + 250;
    } else if (this.state === 2 && now >= this.at) {
      this.state = 3;
      this.at = now + 8000;
    } else if ((this.state === 3 || this.state === 4) && now >= this.at) {
      // No answer in eight seconds: count it wrong and move on.
      this.show.update(false, -1);
      this.i++;
      this.state = 5;
      this.at = now + 500;
    } else if (this.state === 5 && now >= this.at) {
      if (this.i >= scaled(GLANCE_TRIALS)) return true;
      this.arm(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'both right', `${this.bothRight} / ${this.i}`, 'flash', ms(this.show.level));
    const r = Math.min((a.bottom - a.top) / 2 - 30 * a.u, (a.right - a.left) / 2 - 20 * a.u, 260 * a.u);
    const g = { cx: a.cx, cy: a.cy, r };
    const spot = (d: number): [number, number] => [g.cx + Math.cos((d * TAU) / 8) * r, g.cy + Math.sin((d * TAU) / 8) * r];
    this.rects = [];
    if (this.state === 0) {
      ctx.fillStyle = COL_MID;
      ctx.fillRect(g.cx - 2 * dpr, g.cy - 2 * dpr, 4 * dpr, 4 * dpr);
      ctx.strokeStyle = COL_DIM;
      ctx.lineWidth = dpr;
      for (let d = 0; d < 8; d++) {
        const [x, y] = spot(d);
        ctx.strokeRect(x - 10 * a.u, y - 10 * a.u, 20 * a.u, 20 * a.u);
      }
    } else if (this.state === 1) {
      ctx.fillStyle = COL_LINE;
      v.shape(this.centre, g.cx, g.cy, 16 * a.u, true);
      const [x, y] = spot(this.dir);
      ctx.fillStyle = COL_ACCENT;
      ctx.beginPath();
      ctx.arc(x, y, 9 * a.u, 0, TAU);
      ctx.fill();
    } else if (this.state === 2) {
      // Mask: noise everywhere, so nothing lingers.
      ctx.fillStyle = '#26262b';
      for (let k = 0; k < 90; k++) {
        const ang = (k * 2.39996) % TAU;
        const rad = ((k * 37) % 100) / 100 * r * 1.1;
        ctx.fillRect(g.cx + Math.cos(ang) * rad, g.cy + Math.sin(ang) * rad, 8 * a.u, 3 * a.u);
      }
    } else if (this.state === 3) {
      ctx.fillStyle = COL_MID;
      v.text('which shape was in the middle?', g.cx, g.cy - 60 * a.u, v.fontTiny, 'center');
      [SHAPE_CIRCLE, SHAPE_SQUARE].forEach((sh, k) => {
        const x = g.cx + (k ? 60 : -60) * a.u;
        const s = 36 * a.u;
        this.rects.push([x - s, g.cy - s, s * 2, s * 2, sh]);
        ctx.strokeStyle = COL_DIM;
        ctx.lineWidth = dpr;
        ctx.strokeRect(x - s, g.cy - s, s * 2, s * 2);
        ctx.fillStyle = COL_LINE;
        v.shape(sh, x, g.cy, 16 * a.u, true);
      });
    } else if (this.state === 4) {
      ctx.fillStyle = COL_MID;
      v.text('where was the dot?', g.cx, g.cy, v.fontTiny, 'center');
      for (let d = 0; d < 8; d++) {
        const [x, y] = spot(d);
        const s = 22 * a.u;
        this.rects.push([x - s, y - s, s * 2, s * 2, d]);
        ctx.strokeStyle = COL_MID;
        ctx.lineWidth = dpr;
        ctx.strokeRect(x - s, y - s, s * 2, s * 2);
      }
    } else {
      const [x, y] = spot(this.dir);
      ctx.fillStyle = COL_ACCENT;
      ctx.beginPath();
      ctx.arc(x, y, 9 * a.u, 0, TAU);
      ctx.fill();
      ctx.fillStyle = COL_LINE;
      v.shape(this.centre, g.cx, g.cy, 16 * a.u, true);
    }
    if (this.i === 0 && this.state === 0) message(v, { ...a, cy: g.cy + 40 * a.u }, 'keep your eyes on the centre', 'a shape flashes there, and a dot somewhere around it', COL_MID);
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const n = this.i || 1;
    return {
      score: Math.round(this.bothRight * 40 + Math.max(0, 600 - this.best)),
      primary: { label: 'shortest flash', value: this.best < 600 ? this.best : 0, unit: 'ms', lower: true },
      lines: [
        { label: 'both right', value: `${this.bothRight} of ${this.i}` },
        { label: 'centre right', value: pct(this.centreRight / n) },
        { label: 'place right', value: pct(this.placeRight / n) },
        { label: 'shortest flash with both right', value: this.best < 600 ? ms(this.best) : '–' },
      ],
      saved: this.i >= 6,
    };
  }
}

// --- Spot (change detection) ------------------------------------------------------

const SPOT_TRIALS = 36;
const SPOT_SHAPES = [SHAPE_CIRCLE, SHAPE_SQUARE, SHAPE_TRIANGLE, SHAPE_DIAMOND, SHAPE_CROSS];

interface Glyph {
  shape: number;
  grey: boolean;
  x: number;
  y: number;
}

class Spot implements Mini {
  private env!: MiniEnv;
  private items: Glyph[] = [];
  private changed = -1;
  private state = 0; // 0 first look, 1 blank, 2 second look (answer), 3 feedback
  private at = 0;
  private i = 0;
  private readonly size = new Stair(4, 1, 2, 20);
  private hits = 0;
  private misses = 0;
  private fas = 0;
  private crs = 0;
  private ks: number[] = [];
  private held = 0;
  private feedback = '';

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.arm(now + 600);
  }

  private arm(now: number): void {
    const n = this.size.level;
    const cells = shuffle([...Array(20).keys()]).slice(0, n);
    this.items = cells.map((c) => ({ shape: SPOT_SHAPES[Math.floor(Math.random() * 5)]!, grey: Math.random() < 0.5, x: c % 5, y: Math.floor(c / 5) }));
    this.changed = Math.random() < 0.5 ? Math.floor(Math.random() * n) : -1;
    this.state = 0;
    this.at = now + 700;
  }

  private answer(sayChanged: boolean, ts: number): void {
    const was = this.changed >= 0;
    const ok = sayChanged === was;
    if (was && sayChanged) this.hits++;
    else if (was) this.misses++;
    else if (sayChanged) this.fas++;
    else this.crs++;
    // Cowan's K for this set size: N * (hit rate - false alarm rate).
    const h = this.hits / Math.max(1, this.hits + this.misses);
    const f = this.fas / Math.max(1, this.fas + this.crs);
    this.ks.push(this.size.level * (h - f));
    this.size.update(ok);
    this.feedback = ok ? '' : was ? 'one had changed' : 'nothing changed';
    this.env.sound(ok ? SND_TAP_WEAK : SND_FALSE);
    this.i++;
    this.state = 3;
    this.at = ts + (ok ? 400 : 1200);
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (this.state !== 2) return;
    const side = sideOf(slot);
    if (side === 0) return;
    this.answer(side > 0, ts);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now - this.at > 600) {
      this.state = 1;
      this.at = now + 900;
    } else if (this.state === 1 && now >= this.at) {
      this.state = 2;
      if (this.changed >= 0) {
        const g = this.items[this.changed]!;
        if (Math.random() < 0.5) g.grey = !g.grey;
        else g.shape = SPOT_SHAPES[(SPOT_SHAPES.indexOf(g.shape) + 1 + Math.floor(Math.random() * 4)) % 5]!;
      }
    } else if (this.state === 3 && now >= this.at) {
      if (this.i >= scaled(SPOT_TRIALS)) return true;
      this.arm(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'items', String(this.size.level), 'trial', `${Math.min(this.i + 1, scaled(SPOT_TRIALS))} / ${scaled(SPOT_TRIALS)}`);
    const cell = Math.min((a.right - a.left) / 5, (a.bottom - a.top - 50 * a.u) / 4, 90 * a.u);
    const x0 = a.cx - cell * 2.5;
    const y0 = a.cy - cell * 2;
    ctx.strokeStyle = COL_DIM;
    ctx.lineWidth = dpr;
    ctx.strokeRect(x0 - 8 * dpr, y0 - 8 * dpr, cell * 5 + 16 * dpr, cell * 4 + 16 * dpr);
    if ((this.state === 0 && now >= this.at) || this.state === 2 || this.state === 3) {
      for (const g of this.items) {
        ctx.fillStyle = g.grey ? GREY : COL_LINE;
        v.shape(g.shape, x0 + (g.x + 0.5) * cell, y0 + (g.y + 0.5) * cell, cell * 0.24, true);
      }
    }
    if (this.state === 3 && this.changed >= 0 && this.feedback) {
      const g = this.items[this.changed]!;
      ctx.strokeStyle = COL_ACCENT;
      ctx.lineWidth = 2 * dpr;
      ctx.strokeRect(x0 + g.x * cell + 4 * dpr, y0 + g.y * cell + 4 * dpr, cell - 8 * dpr, cell - 8 * dpr);
    }
    ctx.fillStyle = COL_MID;
    if (this.state === 2) v.text(`same  ${handLabel(this.env, -1)}        changed  ${handLabel(this.env, 1)}`, a.cx, y0 + cell * 4 + 34 * dpr, v.fontTiny, 'center');
    else if (this.state === 3 && this.feedback) v.text(this.feedback, a.cx, y0 + cell * 4 + 34 * dpr, v.fontTiny, 'center');
    else if (this.i === 0) v.text('remember them: one may change', a.cx, y0 + cell * 4 + 34 * dpr, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const k = this.ks.length ? mean(this.ks.slice(-12)) : 0;
    const n = this.i || 1;
    return {
      score: Math.round(Math.max(0, k) * 100 + (this.hits + this.crs) * 10),
      primary: { label: 'capacity (K)', value: Math.max(0, k), unit: 'items', decimals: 1 },
      lines: [
        { label: 'capacity estimate (K)', value: `${Math.max(0, k).toFixed(1)} items` },
        { label: 'correct', value: pct((this.hits + this.crs) / n) },
        { label: 'changes caught', value: `${this.hits} of ${this.hits + this.misses}` },
        { label: 'false alarms', value: `${this.fas} of ${this.fas + this.crs}` },
      ],
      saved: this.i >= 8,
    };
  }
}

// --- Ladder -----------------------------------------------------------------------

class Ladder implements Mini {
  private env!: MiniEnv;
  private t0 = 0;
  private times: number[] = [];
  private base = 3;
  private climb = 0.3;
  private below = 0;
  private lastT = 0;
  private best = 0;
  private over = false;
  private overAt = 0;
  private held = 0;

  start(env: MiniEnv): void {
    this.env = env;
    const keys = env.mode.left + env.mode.right;
    this.base = keys <= 1 ? 3 : keys === 2 ? 4 : 6;
    this.climb = keys <= 2 ? 0.25 : 0.35;
  }

  private target(t: number): number {
    // A step up every second.
    return this.base + Math.floor(t / 1000) * this.climb;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (this.over || slot === 6) return;
    if (!this.t0) this.t0 = ts;
    this.times.push(ts - this.t0);
    this.env.sound(sideOf(slot) > 0 ? SND_TAP_R : SND_TAP_L);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.over && now >= this.overAt) return true;
    const t = this.t0 ? now - this.t0 : 0;
    let rate = 0;
    for (let i = this.times.length - 1; i >= 0 && t - this.times[i]! <= 1000; i--) rate++;
    const target = this.target(t);
    if (this.t0 && !this.over) {
      const dt = Math.min(100, t - this.lastT);
      this.lastT = t;
      if (t > 1500 && rate < target) this.below += dt;
      else {
        this.below = 0;
        if (t > 1500 && target > this.best) this.best = target;
      }
      if (this.below > 900) {
        this.over = true;
        this.overAt = now + 1300;
        this.env.sound(SND_FALL);
      } else if (t > 1500 && Math.floor(t / 1000) !== Math.floor((t - dt) / 1000)) this.env.sound(SND_UI);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'held', this.best ? `${this.best.toFixed(2)} /s` : '–', 'target', `${target.toFixed(2)} /s`);
    // The ladder: rungs for each step, your rate as a marker.
    const top = a.top + 10 * a.u;
    const bottom = a.bottom - 20 * a.u;
    const maxR = Math.max(target + 4, 10);
    const yOf = (r: number) => bottom - (r / maxR) * (bottom - top);
    const w = Math.min(a.right - a.left, 260 * a.u);
    ctx.strokeStyle = COL_DIM;
    ctx.lineWidth = dpr;
    for (let r = this.base; r <= maxR; r += this.climb * 4) {
      const y = Math.round(yOf(r)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(a.cx - w / 2, y);
      ctx.lineTo(a.cx + w / 2, y);
      ctx.stroke();
    }
    ctx.strokeStyle = COL_LINE;
    ctx.lineWidth = 2 * dpr;
    const ty = yOf(target);
    ctx.beginPath();
    ctx.moveTo(a.cx - w / 2, ty);
    ctx.lineTo(a.cx + w / 2, ty);
    ctx.stroke();
    ctx.fillStyle = rate >= target ? COL_ACCENT : COL_MID;
    ctx.beginPath();
    ctx.arc(a.cx, yOf(Math.min(rate, maxR)), 10 * a.u, 0, TAU);
    ctx.fill();
    ctx.fillStyle = COL_MID;
    v.text(`${rate} /s`, a.cx + w / 2 + 12 * dpr, yOf(Math.min(rate, maxR)) + 4 * dpr, v.fontTiny, 'left');
    if (this.below > 0 && !this.over) progress(v, a.cx, ty - 16 * dpr, w / 2, 1 - this.below / 900, COL_ACCENT);
    if (!this.t0) message(v, { ...a, cy: ty - 40 * a.u }, 'tap to start: stay at or above the white line', 'it steps up every second', COL_MID);
    // Above the ladder, not across its rungs.
    if (this.over) message(v, { ...a, cy: a.top + 50 * a.u }, `${this.best.toFixed(2)} per second`, 'highest rung held');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: Math.round(this.best * 100),
      primary: { label: 'highest rung', value: this.best, unit: '/s', decimals: 2 },
      lines: [
        { label: 'highest rate held', value: `${this.best.toFixed(2)} taps/s` },
        { label: 'lasted', value: `${(this.lastT / 1000).toFixed(1)} s` },
        { label: 'taps', value: String(this.times.length) },
      ],
      saved: this.times.length >= 10,
    };
  }
}

// --- Swing ------------------------------------------------------------------------

const SWING_TRIALS = 20;

class Swing implements Mini {
  private env!: MiniEnv;
  private i = 0;
  private t0 = 0;
  private period = 1600;
  private bottomAt = 0;
  private state = 0; // 0 swinging, 1 feedback
  private at = 0;
  private readonly hide = new Stair(0, 0.1, 0, 0.95);
  private errs: number[] = [];
  private last = 0;
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.arm(now + 600);
  }

  private arm(at: number): void {
    this.period = 900 + Math.random() * 1300;
    this.t0 = at;
    // Starts at one end; passes the bottom after a quarter period, then every half period.
    // You answer the second pass (after one full sweep to watch).
    this.bottomAt = at + this.period * 0.75;
    this.state = 0;
  }

  /** Swing angle as a share of the max, 1 at the start end. */
  private angle(now: number): number {
    return Math.cos(((now - this.t0) / this.period) * TAU);
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    this.hit(ts);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  pointer(_x: number, _y: number, ts: number): void {
    this.hit(ts);
  }

  private hit(ts: number): void {
    if (this.state !== 0 || ts < this.t0 + this.period * 0.5) return;
    this.last = ts - this.bottomAt;
    this.errs.push(this.last);
    this.hide.update(Math.abs(this.last) < 40);
    this.env.sound(Math.abs(this.last) < 25 ? SND_CATCH : SND_TAP_WEAK);
    this.state = 1;
    this.at = ts + 900;
    this.i++;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now > this.bottomAt + this.period * 0.3) {
      this.last = 400;
      this.errs.push(400);
      this.hide.update(false);
      this.state = 1;
      this.at = now + 900;
      this.i++;
    }
    if (this.state === 1 && now >= this.at) {
      if (this.i >= scaled(SWING_TRIALS)) return true;
      this.arm(now + 400);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'trial', `${Math.min(this.i + 1, scaled(SWING_TRIALS))} / ${scaled(SWING_TRIALS)}`, 'hidden', pct(this.hide.level / 0.7));
    const len = Math.min(a.bottom - a.top - 40 * a.u, 300 * a.u);
    const px = a.cx;
    const py = a.top + 10 * a.u;
    const maxA = 0.75;
    // The bottom mark.
    ctx.fillStyle = COL_LINE;
    ctx.fillRect(px - dpr, py + len - 4 * a.u, 2 * dpr, 40 * a.u);
    // The arc, with the hidden stretch before the bottom on the second pass.
    ctx.strokeStyle = COL_DIM;
    ctx.lineWidth = dpr;
    ctx.beginPath();
    ctx.arc(px, py, len, Math.PI / 2 - maxA, Math.PI / 2 + maxA);
    ctx.stroke();
    if (this.state === 0 && now >= this.t0) {
      const ang = this.angle(now) * maxA;
      // On the answer pass the bob hides for a stretch before the bottom.
      const phase = (now - this.t0) / this.period;
      const hidden = phase > 0.5 && phase < 0.75 && phase > 0.75 - this.hide.level * 0.25;
      ctx.strokeStyle = COL_DIM;
      ctx.beginPath();
      ctx.moveTo(px, py);
      if (!hidden) {
        const bx = px + Math.sin(ang) * len;
        const by = py + Math.cos(ang) * len;
        ctx.lineTo(bx, by);
        ctx.stroke();
        ctx.fillStyle = COL_ACCENT;
        ctx.beginPath();
        ctx.arc(bx, by, 11 * a.u, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = COL_MID;
      v.text(phase < 0.5 ? 'watch one swing' : 'press as it passes the bottom', a.cx, a.bottom - 6 * dpr, v.fontTiny, 'center');
    } else if (this.state === 1) {
      const e = this.last;
      message(v, { ...a, cy: py + len * 0.5 }, e >= 400 ? 'missed' : `${e > 0 ? '+' : ''}${Math.round(e)} ms`, e >= 400 ? '' : Math.abs(e) < 15 ? 'dead on' : e > 0 ? 'late' : 'early');
    }
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const abs = this.errs.map(Math.abs);
    const m = mean(abs);
    return {
      score: this.i ? Math.round(Math.max(0, 200 - m) * 5 + this.hide.level * 500) : 0,
      primary: { label: 'average error', value: m, unit: 'ms', lower: true },
      lines: [
        { label: 'average error', value: ms(m) },
        { label: 'within 25 ms', value: pct(abs.filter((x) => x < 25).length / (abs.length || 1)) },
        { label: 'swing hidden', value: pct(this.hide.level / 0.7) },
      ],
      saved: this.i >= 5,
    };
  }
}

// --- Stream (RSVP) ----------------------------------------------------------------

const STREAM_RUNS = 20;
const LETTERS = 'ABCDEFGHJKLMNPRSTUVWYZ';

class Stream implements Mini {
  private env!: MiniEnv;
  private seq: string[] = [];
  private targetAt = -1;
  private start0 = 0;
  private run = 0;
  private state = 0; // 0 streaming, 1 feedback
  private at = 0;
  private pressed = false;
  private pressedOk = false;
  private readonly rate = new Stair(220, 15, 30, 300);
  private hits = 0;
  private misses = 0;
  private fas = 0;
  private crs = 0;
  private fastest = 300;
  private rts: number[] = [];
  private feedback = '';
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.arm(now + 700);
  }

  private arm(at: number): void {
    const n = 14 + Math.floor(Math.random() * 8);
    this.seq = [];
    for (let i = 0; i < n; i++) this.seq.push(LETTERS[Math.floor(Math.random() * LETTERS.length)]!);
    // Three runs in four have an X somewhere after the first few letters.
    this.targetAt = Math.random() < 0.75 ? 4 + Math.floor(Math.random() * (n - 6)) : -1;
    if (this.targetAt >= 0) this.seq[this.targetAt] = 'X';
    this.start0 = at;
    this.state = 0;
    this.pressed = false;
    this.pressedOk = false;
  }

  private item(now: number): number {
    return Math.floor((now - this.start0) / this.rate.level);
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    this.hit(ts);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  pointer(_x: number, _y: number, ts: number): void {
    this.hit(ts);
  }

  private hit(ts: number): void {
    if (this.state !== 0 || this.pressed || ts < this.start0) return;
    this.pressed = true;
    const k = this.item(ts);
    // A hit if the X was on screen within the last 800 ms.
    const since = ts - (this.start0 + this.targetAt * this.rate.level);
    this.pressedOk = this.targetAt >= 0 && k >= this.targetAt && since <= 800;
    if (this.pressedOk) this.rts.push(since);
    this.env.sound(this.pressedOk ? SND_CATCH : SND_FALSE);
  }

  private finish(now: number): void {
    const had = this.targetAt >= 0;
    let ok: boolean;
    if (had && this.pressedOk) {
      this.hits++;
      ok = true;
      if (this.rate.level < this.fastest) this.fastest = this.rate.level;
    } else if (had) {
      this.misses++;
      ok = false;
      this.feedback = this.pressed ? 'too early' : 'missed the X';
    } else if (this.pressed) {
      this.fas++;
      ok = false;
      this.feedback = 'there was no X';
    } else {
      this.crs++;
      ok = true;
    }
    if (ok) this.feedback = had ? 'got it' : 'right: no X';
    this.rate.update(ok, -1);
    this.run++;
    this.state = 1;
    this.at = now + 900;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.start0) {
      const k = this.item(now);
      if (k >= this.seq.length + 3) this.finish(now);
    }
    if (this.state === 1 && now >= this.at) {
      if (this.run >= scaled(STREAM_RUNS)) return true;
      this.arm(now + 300);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'run', `${Math.min(this.run + 1, scaled(STREAM_RUNS))} / ${scaled(STREAM_RUNS)}`, 'per letter', ms(this.rate.level));
    if (this.state === 0 && now >= this.start0) {
      const k = this.item(now);
      const within = (now - this.start0) % this.rate.level;
      if (k < this.seq.length && within < this.rate.level * 0.8) {
        ctx.fillStyle = COL_LINE;
        v.text(this.seq[k]!, a.cx, a.cy + 16 * dpr, v.fontBig, 'center');
      }
    } else if (this.state === 1) message(v, a, this.feedback, '', this.feedback.startsWith('got') || this.feedback.startsWith('right') ? COL_LINE : COL_MID);
    else {
      ctx.fillStyle = COL_DIM;
      ctx.fillRect(a.cx - 2 * dpr, a.cy - 2 * dpr, 4 * dpr, 4 * dpr);
    }
    if (this.run < 2) {
      ctx.fillStyle = COL_MID;
      v.text('press any key when you see an X (some runs have none)', a.cx, a.bottom - 6 * dpr, v.fontTiny, 'center');
    }
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const n = this.run || 1;
    return {
      score: Math.round((this.hits + this.crs) * 40 + Math.max(0, 300 - this.fastest) * 2),
      primary: { label: 'fastest stream', value: this.fastest < 300 ? this.fastest : 0, unit: 'ms', lower: true },
      lines: [
        { label: 'correct runs', value: pct((this.hits + this.crs) / n) },
        { label: 'X caught', value: `${this.hits} of ${this.hits + this.misses}` },
        { label: 'false alarms', value: `${this.fas} of ${this.fas + this.crs}` },
        { label: 'fastest stream with the X caught', value: this.fastest < 300 ? `${this.fastest} ms per letter` : '–' },
        { label: 'reaction to the X (median)', value: this.rts.length ? `${Math.round(median(this.rts))} ms` : '–' },
      ],
      rts: this.rts,
      saved: this.run >= 5,
    };
  }
}

export const BATCH4: MiniDef[] = [
  {
    id: 'poly',
    name: 'Poly',
    skill: 'coordination',
    blurb: 'Two tempos at once, 2 against 3 and up to 7 against 8. Three-way with three keys.',
    how: 'Each lane has its own beat inside the same loop: the left plays one count (say 2 per loop), the right another (say 3). Beats slide onto a line; tap each lane as its beats arrive. First you hear every lane, each with its own click; then you keep it going on your own, with only a soft tick at each loop start. Land 70% on time to move to the next ratio; a miss repeats it and costs a try. With three keys or more, three-way rhythms like 2:4:3 join in: outer left key, middle keys, outer right key. Choose how many tries you get, or play through every ratio.',
    input: 'keys',
    minKeys: 2,
    levels: [
      { label: 'Standard', desc: 'Three failed rounds end it', value: 0 },
      { label: 'Strict', desc: 'One failed round ends it', value: 1 },
      { label: 'Relaxed', desc: 'Six failed rounds end it', value: 6 },
      { label: 'Play through', desc: 'Every ratio once, no failing', value: 1000 },
    ],
    custom: { unit: 'tries', min: 1, max: 20, def: 3 },
    make: () => new Poly(),
  },
  {
    id: 'glance',
    name: 'Glance',
    skill: 'attention',
    blurb: 'A shape in the middle, a dot out wide. One blink to see both.',
    how: 'Keep your eyes on the centre. A shape flashes there while a dot flashes somewhere around it, then noise covers them. Tap which shape it was, then where the dot was. The flash gets shorter as you get both right.',
    input: 'pointer',
    make: () => new Glance(),
  },
  {
    id: 'spot',
    name: 'Spot',
    skill: 'memory',
    blurb: 'Look, look away, look again. Did anything change?',
    how: 'A set of shapes appears for a moment, disappears, then comes back. Sometimes one has changed shape or shade. Right hand if something changed, left hand if all the same. The set grows as you get it right; the result is how many items you can hold in mind at once.',
    input: 'keys',
    minKeys: 2,
    make: () => new Spot(),
  },
  {
    id: 'ladder',
    name: 'Ladder',
    skill: 'speed',
    blurb: 'The target rate steps up every second. Hang on.',
    how: 'Keep your tap rate at or above the white line. It steps up every second. Drop below it for almost a second and you fall. How high can you climb?',
    input: 'keys',
    make: () => new Ladder(),
  },
  {
    id: 'swing',
    name: 'Swing',
    skill: 'timing',
    blurb: 'Press as the pendulum passes the bottom. It speeds up, then hides.',
    how: 'Watch one swing, then press as the pendulum passes the bottom mark on the way back. It moves fastest at the bottom, so this is harder than it looks. Get it right and the end of the swing starts to hide.',
    input: 'both',
    make: () => new Swing(),
  },
  {
    id: 'stream',
    name: 'Stream',
    skill: 'attention',
    blurb: 'Letters fly past. Press for the X.',
    how: 'Letters flash one after another in the middle. Press any key (or tap) when you see an X. Some runs have no X: then do not press. The stream speeds up as you get them right.',
    input: 'both',
    make: () => new Stream(),
  },
];
