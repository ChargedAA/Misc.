// Fifty-sixth batch.
//   Parity - odd or even? Number after number, as fast as you can.
//   Trio   - three targets on a grid: hit one and it jumps to an empty square.
//   Caps   - type words exactly as shown, capitals and all.
//   Brisk  - two runs of clicks: was the second faster or slower?

import { COL_ACCENT, COL_DIM, COL_LINE, COL_MID } from '../config.ts';
import { SND_BEAT, SND_FALSE, SND_TAP_L, SND_TAP_R, SND_TAP_WEAK } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, handLabel, header, median, ms, pct, scaled, sideOf, Stair, type Mini, type MiniDef, type MiniEnv, type MiniResult, plural } from './kit.ts';
import { WORDS } from './batch24.ts';

const TAU = Math.PI * 2;
const rint = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]!;

// --- Parity ----------------------------------------------------------------------------

const PARITY_MS = 30000;

class Parity implements Mini {
  private env!: MiniEnv;
  private n = 0;
  private t0 = 0;
  private at = 0;
  private started = false;
  private ok = 0;
  private bad = 0;
  private rts: number[] = [];
  private flash = 0;
  private held = 0;
  private firstFrame = 0;

  start(env: MiniEnv): void {
    this.env = env;
  }

  private make(now: number): void {
    // Bigger numbers as you go: only the last digit matters, but the eye has to find it.
    const max = this.ok < 10 ? 9 : this.ok < 25 ? 99 : 9999;
    let n = rint(1, max);
    if (n === this.n) n = rint(1, max);
    this.n = n;
    this.at = now;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (s === 0) return;
    if (!this.started) {
      this.started = true;
      this.t0 = ts;
      this.make(ts);
      return;
    }
    const even = this.n % 2 === 0;
    if ((s > 0) === even) {
      this.ok++;
      this.rts.push(ts - this.at);
      this.env.sound(s < 0 ? SND_TAP_L : SND_TAP_R);
    } else {
      this.bad++;
      this.flash = ts + 400;
      this.env.sound(SND_FALSE);
    }
    this.make(ts);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    const len = scaled(PARITY_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'right', String(this.ok), 'time', `${left} s`);
    ctx.font = `600 ${Math.round(64 * a.u)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = now < this.flash ? COL_ACCENT : COL_LINE;
    ctx.fillText(this.started ? String(this.n) : 'odd or even?', a.cx, a.cy - 10 * a.u);
    const off = Math.min(200 * a.u, (a.right - a.left) / 2 - 30 * a.u);
    ctx.fillStyle = COL_MID;
    v.text(`${handLabel(this.env, -1)}  odd`, a.cx - off, a.bottom - 6 * a.u, v.fontTiny, 'center');
    v.text(`even  ${handLabel(this.env, 1)}`, a.cx + off, a.bottom - 6 * a.u, v.fontTiny, 'center');
    if (!this.started) v.text('press either side to start; thirty seconds', a.cx, a.bottom - 30 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: Math.max(0, this.ok * 20 - this.bad * 40),
      primary: { label: 'right in 30 seconds', value: this.ok, unit: '' },
      lines: [
        { label: 'right', value: String(this.ok) },
        { label: 'wrong', value: String(this.bad) },
        { label: 'typical time a number', value: this.rts.length ? ms(median(this.rts)) : '–' },
      ],
      saved: this.ok + this.bad >= 5,
    };
  }
}

// --- Trio ------------------------------------------------------------------------------

const TRIO_MS = 30000;
const TRIO_N = 4;

class Trio implements Mini {
  private env!: MiniEnv;
  private lit: number[] = [];
  private t0 = 0;
  private started = false;
  private hits = 0;
  private misses = 0;
  private lastAt = 0;
  private gaps: number[] = [];
  private cells: [number, number, number][] = [];
  private pop: [number, number] | null = null;
  private firstFrame = 0;

  start(env: MiniEnv): void {
    this.env = env;
    while (this.lit.length < 3) {
      const k = rint(0, TRIO_N * TRIO_N - 1);
      if (!this.lit.includes(k)) this.lit.push(k);
    }
  }

  press(): void {}

  pointer(x: number, y: number, ts: number): void {
    if (!this.started) {
      this.started = true;
      this.t0 = ts;
      this.lastAt = ts;
      return;
    }
    if (ts - this.t0 >= scaled(TRIO_MS)) return;
    const k = this.lit.findIndex((c) => {
      const [cx, cy, r] = this.cells[c]!;
      return Math.hypot(x - cx, y - cy) <= r;
    });
    if (k < 0) {
      this.misses++;
      this.env.sound(SND_FALSE);
      return;
    }
    this.hits++;
    this.gaps.push(ts - this.lastAt);
    this.lastAt = ts;
    this.pop = [this.lit[k]!, ts];
    // Jump to a square that is empty, and not where it just was.
    let n = rint(0, TRIO_N * TRIO_N - 1);
    while (this.lit.includes(n)) n = rint(0, TRIO_N * TRIO_N - 1);
    this.lit[k] = n;
    this.env.sound(SND_TAP_WEAK);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    const len = scaled(TRIO_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'hits', String(this.hits), 'time', `${left} s`);
    const G = Math.min(a.right - a.left, a.bottom - a.top - 40 * a.u);
    const s = G / TRIO_N;
    const x0 = a.cx - G / 2;
    const y0 = a.cy - G / 2 - 10 * a.u;
    this.cells = [];
    for (let k = 0; k < TRIO_N * TRIO_N; k++) {
      const cx = x0 + ((k % TRIO_N) + 0.5) * s;
      const cy = y0 + (Math.floor(k / TRIO_N) + 0.5) * s;
      this.cells.push([cx, cy, s * 0.3]);
      ctx.fillStyle = '#121215';
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.3, 0, TAU);
      ctx.fill();
    }
    if (this.started) {
      for (const c of this.lit) {
        const [cx, cy, r] = this.cells[c]!;
        ctx.fillStyle = COL_LINE;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, TAU);
        ctx.fill();
      }
      if (this.pop && now - this.pop[1] < 200) {
        const [cx, cy, r] = this.cells[this.pop[0]]!;
        ctx.strokeStyle = COL_ACCENT;
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        ctx.arc(cx, cy, r * (1 + (now - this.pop[1]) / 400), 0, TAU);
        ctx.stroke();
      }
    }
    ctx.fillStyle = COL_MID;
    v.text(this.started ? plural(this.misses, 'missed click') : 'click to start: hit the white targets; each jumps to an empty square. thirty seconds', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const shots = this.hits + this.misses;
    return {
      score: Math.max(0, this.hits * 10 - this.misses * 10),
      primary: { label: 'hits in 30 seconds', value: this.hits, unit: '' },
      lines: [
        { label: 'hits', value: String(this.hits) },
        { label: 'accuracy', value: shots ? pct(this.hits / shots) : '–' },
        { label: 'typical time a hit', value: this.gaps.length ? ms(median(this.gaps)) : '–' },
      ],
      saved: this.hits >= 5,
    };
  }
}

// --- Caps ------------------------------------------------------------------------------

const CAPS_MS = 60000;

/** A word written one of the ways that make you reach for Shift. */
function capsWord(): string {
  const w = pick(WORDS.filter((x) => x.length >= 3 && x.length <= 8 && /^[a-z]+$/.test(x)));
  const style = rint(0, 4);
  if (style === 0) return w[0]!.toUpperCase() + w.slice(1);
  if (style === 1) return w.toUpperCase();
  if (style === 2) {
    const v = pick(WORDS.filter((x) => x.length >= 3 && x.length <= 6 && /^[a-z]+$/.test(x)));
    return w[0]!.toUpperCase() + w.slice(1) + v[0]!.toUpperCase() + v.slice(1);
  }
  if (style === 3) return w.slice(0, -1) + w.slice(-1).toUpperCase();
  return [...w].map((c, i) => (i % 2 ? c.toUpperCase() : c)).join('');
}

class Caps implements Mini {
  private env!: MiniEnv;
  private word = '';
  private pos = 0;
  private t0 = 0;
  private started = false;
  private chars = 0;
  private words = 0;
  private slips = 0;
  private caseSlips = 0;
  private bad = 0;
  private firstFrame = 0;

  start(env: MiniEnv): void {
    this.env = env;
    this.word = capsWord();
  }

  press(): void {}

  typeKey(code: string, ts: number, key?: string): boolean {
    if (!key || key.length !== 1 || !/[a-zA-Z]/.test(key)) return code.startsWith('Key');
    if (!this.started) {
      this.started = true;
      this.t0 = ts;
    }
    if (ts - this.t0 >= scaled(CAPS_MS)) return true;
    const want = this.word[this.pos]!;
    if (key === want) {
      this.pos++;
      this.chars++;
      if (this.pos >= this.word.length) {
        this.words++;
        this.env.sound(SND_TAP_WEAK);
        this.word = capsWord();
        this.pos = 0;
      }
    } else {
      this.slips++;
      if (key.toLowerCase() === want.toLowerCase()) this.caseSlips++;
      this.bad = ts + 200;
      this.env.sound(SND_FALSE);
    }
    return true;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    const len = scaled(CAPS_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'words', String(this.words), 'time', `${left} s`);
    const size = Math.min(44 * a.u, (a.right - a.left) / (this.word.length + 2) / 0.62);
    ctx.font = `500 ${Math.round(size)}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    const cw = size * 0.6;
    const x0 = a.cx - (this.word.length * cw) / 2;
    [...this.word].forEach((c, i) => {
      ctx.fillStyle = i < this.pos ? COL_DIM : i === this.pos ? (now < this.bad ? COL_ACCENT : COL_LINE) : COL_MID;
      ctx.fillText(c, x0 + i * cw + cw / 2, a.cy - 10 * a.u);
      if (i === this.pos) ctx.fillRect(x0 + i * cw + cw * 0.1, a.cy - 10 * a.u + size * 0.55, cw * 0.8, 2 * v.dpr);
    });
    ctx.fillStyle = COL_MID;
    v.text(this.started ? `${this.caseSlips} wrong case · ${this.slips - this.caseSlips} wrong letter` : 'type each word exactly as shown, capitals included; the clock starts on the first key', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const mins = Math.max(1, scaled(CAPS_MS)) / 60000;
    const cpm = Math.round(this.chars / mins);
    return {
      score: Math.max(0, cpm * 2 - this.slips * 10),
      primary: { label: 'characters a minute', value: cpm, unit: 'cpm' },
      lines: [
        { label: 'words', value: String(this.words) },
        { label: 'characters a minute', value: String(cpm) },
        { label: 'wrong case', value: String(this.caseSlips) },
        { label: 'wrong letter', value: String(this.slips - this.caseSlips) },
      ],
      saved: this.chars >= 10,
    };
  }
}

// --- Brisk (tempo by ear) --------------------------------------------------------------

const BRISK_TRIALS = 30;
/** How much faster or slower the second run is, in percent. */
const BRISK = [20, 15, 11, 8, 6, 4.5, 3.5, 2.5, 2, 1.5, 1];
const CLICKS = 5;

class Brisk implements Mini {
  private env!: MiniEnv;
  private readonly stair = new Stair(0, 1, 0, BRISK.length - 1, 2);
  private i = 0;
  private faster = true;
  private state = 0;
  private next = 0;
  private t0 = 0;
  private times: number[] = [];
  private right = 0;
  private levels: number[] = [];
  private last = '';
  private visual = false;
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.visual = env.muted || !env.soundAt;
    this.next = now + 800;
  }

  private play(now: number): void {
    const d = BRISK[Math.round(this.stair.level)]!;
    this.faster = Math.random() < 0.5;
    const ioi = rint(420, 560);
    const ioi2 = ioi * (this.faster ? 1 - d / 100 : 1 + d / 100);
    this.times = [];
    for (let k = 0; k < CLICKS; k++) this.times.push(k * ioi);
    const gapStart = (CLICKS - 1) * ioi + 1100;
    for (let k = 0; k < CLICKS; k++) this.times.push(gapStart + k * ioi2);
    this.t0 = now + 150;
    if (!this.visual) for (const t of this.times) this.env.soundAt!(SND_BEAT, 150 + t);
    this.state = 1;
    this.next = this.t0 + this.times[this.times.length - 1]! + 200;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (s === 0 || this.state !== 2) return;
    const ok = (s > 0) === this.faster;
    if (ok) this.right++;
    this.levels.push(BRISK[Math.round(this.stair.level)]!);
    this.stair.update(ok, 1);
    this.last = ok ? '' : `the second was ${this.faster ? 'faster' : 'slower'}`;
    this.env.sound(ok ? SND_TAP_WEAK : SND_FALSE);
    this.i++;
    this.state = 3;
    this.next = ts + (ok ? 600 : 1100);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if ((this.state === 0 || this.state === 3) && now >= this.next) {
      if (this.i >= scaled(BRISK_TRIALS)) return true;
      this.play(now);
    }
    if (this.state === 1 && now >= this.next) this.state = 2;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'difference', `${BRISK[Math.round(this.stair.level)]}%`, 'pair', `${Math.min(this.i + 1, scaled(BRISK_TRIALS))} / ${scaled(BRISK_TRIALS)}`);
    if (this.state === 1) {
      // Dots count the clicks off; with sound off they flash on the beat instead.
      const played = this.times.filter((t) => now >= this.t0 + t).length;
      for (let k = 0; k < this.times.length; k++) {
        const row = k < CLICKS ? 0 : 1;
        const x = a.cx + ((k % CLICKS) - (CLICKS - 1) / 2) * 30 * a.u;
        const y = a.cy - 30 * a.u + row * 40 * a.u;
        const t = this.t0 + this.times[k]!;
        const flash = this.visual && now >= t && now < t + 90;
        ctx.fillStyle = flash ? COL_LINE : k < played && !this.visual ? COL_MID : COL_DIM;
        ctx.beginPath();
        ctx.arc(x, y, flash ? 9 * a.u : 5 * a.u, 0, TAU);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = this.state === 2 ? COL_LINE : COL_ACCENT;
      v.text(this.state === 2 ? 'was the second run faster or slower?' : this.last, a.cx, a.cy, v.fontHud, 'center');
    }
    const off = Math.min(200 * a.u, (a.right - a.left) / 2 - 30 * a.u);
    ctx.fillStyle = COL_MID;
    v.text(`${handLabel(this.env, -1)}  slower`, a.cx - off, a.bottom - 6 * a.u, v.fontTiny, 'center');
    v.text(`faster  ${handLabel(this.env, 1)}`, a.cx + off, a.bottom - 6 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const thr = this.levels.length >= 6 ? median(this.levels.slice(-10)) : 0;
    return {
      score: thr ? Math.round(Math.max(0, 21 - thr) * 60) : 0,
      primary: { label: 'smallest tempo change heard', value: thr, unit: '%', lower: true, decimals: 1 },
      lines: [
        { label: 'right', value: `${this.right} of ${this.i}` },
        { label: 'smallest step reached', value: this.levels.length ? `${Math.min(...this.levels)}%` : '–' },
        ...(this.visual ? [{ label: 'note', value: 'played with sound off, by eye' }] : []),
      ],
      saved: this.i >= 10,
    };
  }
}

export const BATCH56: MiniDef[] = [
  { id: 'parity', name: 'Parity', skill: 'speed', blurb: 'Odd or even? Number after number, as fast as you can.', how: 'A number appears: left if it is odd, right if even. Then the next, straight away. The numbers grow from one digit to four, so you have to find the last digit fast. Thirty seconds; mistakes count against you double.', input: 'keys', minKeys: 2, make: () => new Parity() },
  { id: 'trio', name: 'Trio', skill: 'aim', blurb: 'Three targets on a grid. Hit one and it jumps to an empty square.', how: 'A four-by-four grid with three white targets. Click any of them: it jumps to an empty square, so there are always three. Hit as many as you can in thirty seconds; a click that misses costs as much as a hit earns.', input: 'pointer', make: () => new Trio() },
  { id: 'caps', name: 'Caps', skill: 'dexterity', blurb: 'Type words exactly as shown, capitals and all.', how: 'Words written with capitals in awkward places: a capital first letter, all capitals, two words run together, a capital last letter, or every other letter. Type each exactly, using Shift. A wrong letter or the wrong case is refused and counted. A minute. Needs a keyboard.', input: 'type', make: () => new Caps() },
  { id: 'brisk', name: 'Brisk', skill: 'ear', blurb: 'Two runs of clicks. Was the second faster or slower?', how: 'Five clicks at a steady pace, a pause, then five more. Right if the second run was faster, left if slower. Get them right and the difference shrinks. Thirty pairs; scored on the smallest change in tempo you can hear. Best with sound; with it off the clicks flash.', input: 'keys', minKeys: 2, make: () => new Brisk() },
];
