// Thirtieth batch: reading rhythm.
//   Sight - a bar of rhythm in real notation. After a count of four, tap it in time.

import { COL_ACCENT, COL_DIM, COL_LINE, COL_MID } from '../config.ts';
import { SND_BEAT, SND_BEAT_UP, SND_CATCH, SND_FALSE, SND_TAP_L } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, header, mean, median, pct, shown, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const TAU = Math.PI * 2;

// --- Rhythm vocabulary -------------------------------------------------------------

/** One written symbol: a note or rest lasting `d` beats. */
interface Sym {
  d: number;
  rest?: boolean;
  dot?: boolean;
}

/** A figure: symbols covering one or two beats, drawn as a unit (beamed when short). */
type Figure = Sym[];

const N = (d: number, dot = false): Sym => ({ d, dot });
const R = (d: number): Sym => ({ d, rest: true });
const T = 1 / 3;

/** Figures by tier; each tier adds to the ones before. */
const TIERS: Figure[][] = [
  // 1: quarters, halves, quarter rests.
  [[N(1)], [N(1)], [R(1)], [N(2)]],
  // 2: eighths, and the offbeat.
  [[N(0.5), N(0.5)], [N(0.5), R(0.5)], [R(0.5), N(0.5)]],
  // 3: dotted quarter and eighth, the syncopation, half rests.
  [[N(1.5, true), N(0.5)], [N(0.5), N(1), N(0.5)], [R(2)]],
  // 4: sixteenths.
  [[N(0.25), N(0.25), N(0.25), N(0.25)], [N(0.5), N(0.25), N(0.25)], [N(0.25), N(0.25), N(0.5)]],
  // 5: dotted eighths and offbeat sixteenths.
  [[N(0.75, true), N(0.25)], [N(0.25), N(0.75, true)], [N(0.25), N(0.5), N(0.25)], [R(0.25), N(0.25), N(0.25), N(0.25)], [R(0.5), N(0.25), N(0.25)]],
  // 6: triplets.
  [[N(T), N(T), N(T)], [N(T), R(T), N(T)], [R(T), N(T), N(T)]],
];

function length(f: Figure): number {
  return f.reduce((s, x) => s + x.d, 0);
}

/** A placed symbol: its figure index, start in beats from the bar start, and the symbol. */
export interface Placed extends Sym {
  at: number;
  fig: number;
}

/** Build `bars` bars of 4/4 from the figures of tiers up to `tier`, leaning on the newest. */
export function compose(tier: number, bars: number): Placed[] {
  for (let attempt = 0; attempt < 50; attempt++) {
    const out: Placed[] = [];
    let fig = 0;
    for (let b = 0; b < bars; b++) {
      let beat = 0;
      while (beat < 4) {
        const pool: Figure[] = [];
        for (let t = 0; t < tier; t++) for (const f of TIERS[t]!) for (let w = 0; w < (t === tier - 1 ? 3 : 1); w++) pool.push(f);
        // Two-beat figures start on beat 1 or 3, so the bar reads in halves.
        const ok = pool.filter((f) => length(f) <= 4 - beat + 1e-6 && (length(f) <= 1 || beat % 2 === 0));
        const f = ok[Math.floor(Math.random() * ok.length)]!;
        let at = b * 4 + beat;
        for (const s of f) {
          out.push({ ...s, at, fig });
          at += s.d;
        }
        beat += length(f);
        fig++;
      }
    }
    const notes = out.filter((s) => !s.rest).length;
    // Enough to play, and the bar starts with a sound at the easy tiers.
    if (notes >= 3 * bars && (tier > 2 || !out[0]!.rest)) return out;
  }
  return [{ d: 1, at: 0, fig: 0 }, { d: 1, at: 1, fig: 1 }, { d: 1, at: 2, fig: 2 }, { d: 1, at: 3, fig: 3 }];
}

/** Notes, rests, beams, flags, dots and triplet marks: a bar of rhythm on a one-line staff. */
export function drawRhythm(v: View, syms: Placed[], xOf: (t: number) => number, y: number, u: number, col: (s: Placed) => string = () => COL_LINE): void {
  const ctx = v.ctx;
  const dpr = v.dpr;
  const stemH = 34 * u;
  const top = y - stemH;
  // Group the symbols of each figure.
  const figs = new Map<number, Placed[]>();
  for (const s of syms) figs.set(s.fig, [...(figs.get(s.fig) ?? []), s]);
  for (const group of figs.values()) {
    const triplet = group.some((s) => Math.abs(s.d - T) < 1e-6);
    const short = group.filter((s) => !s.rest && s.d < 1 - 1e-6);
    // Beam the short notes of a figure that fits in one beat; a lone one gets a flag.
    const beamed = short.length >= 2 && length(group) <= 1 + 1e-6;
    for (const s of group) {
      const x = xOf(s.at);
      ctx.fillStyle = col(s);
      ctx.strokeStyle = col(s);
      if (s.rest) {
        drawRest(v, x + 4 * u, y, s.d, u);
        continue;
      }
      // Head: filled for a quarter and shorter, open for a half.
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-0.35);
      ctx.beginPath();
      ctx.ellipse(0, 0, 6.6 * u, 4.6 * u, 0, 0, TAU);
      if (s.d >= 2) {
        ctx.lineWidth = 1.8 * dpr;
        ctx.stroke();
      } else ctx.fill();
      ctx.restore();
      // Stem.
      ctx.fillRect(x + 5.6 * u, top, 1.6 * dpr, stemH - 1 * u);
      if (s.dot) {
        ctx.beginPath();
        ctx.arc(x + 12 * u, y - 4 * u, 2.2 * u, 0, TAU);
        ctx.fill();
      }
      // A flag, for a short note on its own.
      if (s.d < 1 - 1e-6 && !beamed) {
        const flags = s.d <= 0.25 + 1e-6 ? 2 : 1;
        ctx.lineWidth = 2.2 * dpr;
        for (let k = 0; k < flags; k++) {
          const fy = top + k * 7 * u;
          ctx.beginPath();
          ctx.moveTo(x + 6.4 * u, fy);
          ctx.quadraticCurveTo(x + 16 * u, fy + 8 * u, x + 13 * u, fy + 18 * u);
          ctx.stroke();
        }
      }
    }
    if (beamed) {
      ctx.fillStyle = COL_LINE;
      const xa = xOf(short[0]!.at) + 5.6 * u;
      const xb = xOf(short[short.length - 1]!.at) + 7.2 * u;
      ctx.fillRect(xa, top, xb - xa, 4 * u);
      // Second beams for sixteenths: joined between neighbours, a stub otherwise.
      for (let i = 0; i < short.length; i++) {
        const s = short[i]!;
        if (s.d > 0.25 + 1e-6) continue;
        const sx = xOf(s.at) + 5.6 * u;
        const nxt = short[i + 1];
        const prv = short[i - 1];
        if (nxt && nxt.d <= 0.25 + 1e-6) ctx.fillRect(sx, top + 7 * u, xOf(nxt.at) + 7.2 * u - sx, 4 * u);
        else if (!(prv && prv.d <= 0.25 + 1e-6)) {
          const toward = nxt ? 1 : -1;
          ctx.fillRect(toward > 0 ? sx : sx - 8 * u + 1.6 * dpr, top + 7 * u, 8 * u, 4 * u);
        }
      }
    }
    if (triplet) {
      const xa = xOf(group[0]!.at);
      const xb = xOf(group[group.length - 1]!.at);
      ctx.fillStyle = COL_MID;
      v.text('3', (xa + xb) / 2 + 6 * u, top - 8 * u, v.fontTiny, 'center');
    }
  }
}

function drawRest(v: View, x: number, y: number, d: number, u: number): void {
  const ctx = v.ctx;
  const dpr = v.dpr;
  if (d >= 2) {
    // Half rest: a block sitting on the line.
    ctx.fillRect(x - 7 * u, y - 5 * u, 14 * u, 5 * u);
    return;
  }
  ctx.lineWidth = 2.4 * dpr;
  ctx.lineJoin = 'round';
  if (d >= 1) {
    // Quarter rest: the zigzag.
    ctx.beginPath();
    ctx.moveTo(x - 3 * u, y - 15 * u);
    ctx.lineTo(x + 3 * u, y - 8 * u);
    ctx.lineTo(x - 2 * u, y - 2 * u);
    ctx.lineTo(x + 3 * u, y + 5 * u);
    ctx.quadraticCurveTo(x - 5 * u, y + 2 * u, x - 1 * u, y + 12 * u);
    ctx.stroke();
    return;
  }
  // Eighth (one hook) or sixteenth (two): dots with a slanted stem.
  const hooks = d <= 0.26 ? 2 : d < 0.4 ? 1 : 1;
  ctx.beginPath();
  ctx.moveTo(x + 4 * u, y - 10 * u);
  ctx.lineTo(x - 1 * u, y + 8 * u + (hooks - 1) * 5 * u);
  ctx.stroke();
  for (let k = 0; k < hooks; k++) {
    const hy = y - 10 * u + k * 7 * u;
    ctx.beginPath();
    ctx.arc(x - 3 * u - k * 1.5 * u, hy - 1 * u, 2.4 * u, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - 3 * u - k * 1.5 * u, hy + 1 * u);
    ctx.quadraticCurveTo(x, hy + 2 * u, x + 4 * u - k * 2 * u, hy - 0 * u);
    ctx.stroke();
  }
}


// --- Sight ---------------------------------------------------------------------------

const SIGHT_PASS = 0.8;

class Sight implements Mini {
  private env!: MiniEnv;
  private level = 1;
  private best = 0;
  private passes = 0;
  private strikes = 0;
  private bars = 1;
  private bpm = 72;
  private syms: Placed[] = [];
  /** Onset times (beats from the bar start) and how each went. */
  private onsets: { at: number; hit: boolean; off: number }[] = [];
  private extras: number[] = [];
  private t0 = 0;
  private state = 0; // 0 count-in and playing, 1 feedback
  private at = 0;
  private exact = false;
  private lastClick = -99;
  private acc = 0;
  private accs: number[] = [];
  private offs: number[] = [];
  private held = 0;
  private flash = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.exact = !!env.soundAt && !env.muted;
    this.make(now + 900, now);
  }

  private tier(): number {
    return Math.min(TIERS.length, Math.ceil(this.level / 2));
  }

  private beatMs(): number {
    return 60000 / this.bpm;
  }

  private make(at: number, now: number): void {
    this.bars = 1;
    // Faster within a tier, eased back when a new figure arrives.
    this.bpm = Math.min(150, 66 + (this.level % 2 === 0 ? 14 : 0) + Math.floor(this.level / 2) * 6);
    this.syms = compose(this.tier(), this.bars);
    this.onsets = this.syms.filter((s) => !s.rest).map((s) => ({ at: s.at, hit: false, off: 0 }));
    this.extras = [];
    this.t0 = at;
    this.state = 0;
    this.lastClick = -99;
    // Four clicks to count in, then a soft click on every beat, on the audio clock.
    if (this.exact) for (let k = 0; k < 4 + this.bars * 4; k++) this.env.soundAt!(k === 0 || (k >= 4 && (k - 4) % 4 === 0) ? SND_BEAT_UP : SND_BEAT, at - now + k * this.beatMs());
  }

  /** Beats since the bar started, as heard (negative during the count-in). */
  private beatAt(ts: number): number {
    return (ts - (this.exact ? (this.env.latency ?? 0) : 0) - this.t0) / this.beatMs() - 4;
  }

  /** The timing window: generous, but less than half the gap to the nearest neighbour. */
  private win(i: number): number {
    const o = this.onsets;
    const gapPrev = i > 0 ? o[i]!.at - o[i - 1]!.at : 1;
    const gapNext = i < o.length - 1 ? o[i + 1]!.at - o[i]!.at : 1;
    return Math.min(0.45 * Math.min(gapPrev, gapNext) * this.beatMs(), 130);
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    this.tap(ts);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  pointer(_x: number, _y: number, ts: number): void {
    this.tap(ts);
  }

  private tap(ts: number): void {
    if (this.state !== 0) return;
    const b = this.beatAt(ts);
    if (b < -0.5) return; // during the count-in: ignored
    this.env.sound(SND_TAP_L);
    this.flash = ts + 90;
    let best = -1;
    for (let i = 0; i < this.onsets.length; i++) {
      const o = this.onsets[i]!;
      const off = (b - o.at) * this.beatMs();
      if (!o.hit && Math.abs(off) <= this.win(i) && (best < 0 || Math.abs(off) < Math.abs((b - this.onsets[best]!.at) * this.beatMs()))) best = i;
    }
    if (best >= 0) {
      const o = this.onsets[best]!;
      o.hit = true;
      o.off = (b - o.at) * this.beatMs();
      this.offs.push(o.off);
    } else this.extras.push(b);
  }

  private judge(now: number): void {
    const hits = this.onsets.filter((o) => o.hit).length;
    this.acc = Math.max(0, (hits - this.extras.length * 0.5) / this.onsets.length);
    this.accs.push(this.acc);
    if (this.acc >= SIGHT_PASS) {
      this.best = Math.max(this.best, this.level);
      this.passes++;
      // Two clean bars a level.
      if (this.passes % 2 === 0) this.level++;
      this.env.sound(SND_CATCH);
    } else {
      this.strikes++;
      this.env.sound(SND_FALSE);
    }
    this.state = 1;
    this.at = now + 1800;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const beat = this.beatMs();
    if (this.state === 0) {
      const k = Math.floor((now - this.t0) / beat);
      if (!this.exact && now >= this.t0 && k !== this.lastClick && k < 4 + this.bars * 4) {
        this.lastClick = k;
        this.env.sound(k === 0 || (k >= 4 && (k - 4) % 4 === 0) ? SND_BEAT_UP : SND_BEAT);
      }
      if (this.beatAt(now) > this.bars * 4 + 0.5) this.judge(now);
    } else if (now >= this.at) {
      if (this.strikes >= 3) return true;
      this.make(now + 400, now);
    }

    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const u = a.u;
    header(v, touch, 'level', String(this.level), 'tempo', `${this.bpm} bpm`, 3 - this.strikes);

    // The staff: one line, proportional spacing, so where a note sits is when it sounds.
    const total = this.bars * 4;
    const W = Math.min(a.right - a.left - 60 * u, (this.bars === 1 ? 620 : 1000) * u);
    const xs = a.cx - W / 2 + 24 * u;
    const xe = a.cx + W / 2;
    const y = a.cy;
    const beatW = (xe - xs - 20 * u) / (total + 0.3);
    const xOf = (t: number) => xs + (t + 0.2) * beatW;
    // Symbols scale with the room a beat has.
    const su = Math.max(0.8, Math.min(1.7, beatW / (70 * dpr))) * dpr;
    ctx.fillStyle = COL_MID;
    ctx.fillRect(xs, y, xe - xs, dpr);
    // Bar lines sit just before each bar's first beat, clear of its first note.
    for (let b = 0; b <= this.bars; b++) {
      const bx = b === this.bars ? xe : b === 0 ? xs : xOf(b * 4 - 0.13);
      ctx.fillStyle = COL_LINE;
      ctx.fillRect(bx - dpr / 2, y - 18 * su, b === this.bars ? 3 * dpr : dpr, 36 * su);
    }
    // 4/4
    ctx.fillStyle = COL_LINE;
    v.text('4', xs - 14 * su, y - 4 * su, v.fontHud, 'center');
    v.text('4', xs - 14 * su, y + 20 * su, v.fontHud, 'center');
    // Beat ticks under the line.
    for (let t = 0; t < total; t++) {
      ctx.fillStyle = COL_DIM;
      ctx.fillRect(xOf(t) - dpr / 2, y + 44 * su, dpr, 6 * su);
    }

    drawRhythm(v, this.syms, xOf, y, su, (sym) => {
      if (this.state !== 1 || sym.rest) return COL_LINE;
      const o = this.onsets.find((x) => Math.abs(x.at - sym.at) < 1e-6);
      return o && !o.hit ? COL_ACCENT : COL_LINE;
    });

    // After the bar: how each note went, a tick early (left) or late (right) of it.
    if (this.state === 1) {
      for (const o of this.onsets) {
        const x = xOf(o.at);
        if (o.hit) {
          ctx.fillStyle = Math.abs(o.off) < 40 ? COL_LINE : COL_MID;
          ctx.fillRect(x + Math.max(-1, Math.min(1, o.off / 130)) * 14 * su - dpr, y + 24 * su, 2 * dpr, 12 * su);
        } else {
          ctx.strokeStyle = COL_ACCENT;
          ctx.lineWidth = 2 * dpr;
          ctx.beginPath();
          ctx.arc(x, y + 30 * su, 5 * su, 0, TAU);
          ctx.stroke();
        }
      }
      for (const b of this.extras) {
        if (b < 0 || b > total) continue;
        ctx.fillStyle = COL_ACCENT;
        v.text('×', xOf(b), y + 36 * su, v.fontTiny, 'center');
      }
    }

    // The playhead glides across, reaching each note as its beat is heard.
    if (this.state === 0) {
      const heard = (shown(now) - (this.exact ? (this.env.latency ?? 0) : 0) - this.t0) / beat - 4;
      if (heard > -1.5 && heard < total + 0.3) {
        const px = heard < 0 ? xs + (heard / 1.5 + 1) * (xOf(0) - xs) : xOf(heard);
        ctx.fillStyle = heard < 0 ? COL_DIM : now < this.flash ? COL_ACCENT : COL_LINE;
        ctx.fillRect(px - dpr, y - 64 * su, 2 * dpr, 100 * su);
      }
    }

    ctx.fillStyle = COL_MID;
    const cnt = this.beatAt(now);
    const status =
      this.state === 1
        ? `${pct(this.acc)}  ·  ${this.acc >= SIGHT_PASS ? (this.passes % 2 === 0 ? 'next level' : 'once more at this level') : 'again'}`
        : cnt < 0
          ? `${Math.max(1, Math.min(4, Math.floor(cnt + 5)))}`
          : 'play';
    ctx.fillStyle = this.state === 1 ? COL_LINE : cnt < 0 ? COL_LINE : COL_MID;
    if (this.state === 0 && cnt < 0) {
      // The count-in, big: 1 2 3 4, each on its beat.
      ctx.font = `600 ${Math.round(64 * su)}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(status, a.cx, y - 96 * su);
    } else v.text(status, a.cx, y - 110 * su, v.fontHud, 'center');
    if (this.level === 1 && this.state === 0 && this.accs.length === 0) {
      ctx.fillStyle = COL_MID;
      v.text('read the rhythm; after the count of four, tap each note on any key', a.cx, y + 90 * u, v.fontTiny, 'center');
    }
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const m = this.offs.length ? mean(this.offs) : 0;
    return {
      score: this.best * 100 + Math.round(mean(this.accs) * 100),
      primary: { label: 'level', value: this.best, unit: '' },
      series: { label: 'accuracy by bar', names: this.accs.map((_, i) => String(i + 1)), values: this.accs.map((x) => Math.round(x * 100)), unit: '%' },
      lines: [
        { label: 'highest level cleared', value: String(this.best) },
        { label: 'average accuracy', value: pct(mean(this.accs)) },
        { label: 'bars played', value: String(this.accs.length) },
        { label: 'timing of hits', value: this.offs.length ? `${Math.round(Math.abs(m))} ms ${m >= 0 ? 'late' : 'early'} on average  ·  spread ${Math.round(median(this.offs.map((o) => Math.abs(o - m))))} ms` : '–' },
      ],
      saved: this.accs.length >= 1,
    };
  }
}

export const BATCH30: MiniDef[] = [
  {
    id: 'sight',
    name: 'Sight',
    skill: 'timing',
    blurb: 'Sight-read a bar of rhythm in real notation, and tap it in time.',
    how: 'A bar of rhythm appears on a one-line staff: quarters, halves and rests at first, then eighths, dotted notes, syncopation, sixteenths and triplets. Four clicks count you in; then tap each note on any key (or tap the screen) while a line glides across the bar. Rests are silent. Get 80% of the notes on time, without extra taps, twice to move up a level; the tempo climbs as you go. Three missed bars end it.',
    input: 'both',
    make: () => new Sight(),
  },
];
