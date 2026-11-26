// Fifty-third batch: speed and finger control.
//   Ramp    - a beat that keeps speeding up: keep pressing with it until you fall behind.
//   Abc     - type the alphabet, a to z, as fast as you can.
//   Shuttle - sweep the mouse from bar to bar and back, as many times as you can.
//   Anchor  - hold one key down while the fingers beside it tap a pattern.

import { COL_ACCENT, COL_DIM, COL_LINE, COL_MID } from '../config.ts';
import { SND_BEAT, SND_CATCH, SND_FALL, SND_FALSE, SND_TAP_WEAK } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, header, median, ms, scaled, type Mini, type MiniDef, type MiniEnv, type MiniResult, plural } from './kit.ts';

const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]!;

// --- Ramp ------------------------------------------------------------------------------

/** Beats a second at the start, and how much faster each second. */
const RAMP_START = 3;
const RAMP_GAIN = 0.12;
/** Fall this many beats behind and the run ends. */
const RAMP_SLACK = 4;

class Ramp implements Mini {
  private env!: MiniEnv;
  private started = false;
  private t0 = 0;
  /** Beats so far, by the clock, and presses that counted toward them. */
  private beats = 0;
  private presses = 0;
  private nextBeat = 0;
  private over = false;
  private overAt = 0;
  private peak = 0;
  private held = 0;
  private flash = 0;
  private firstFrame = 0;

  start(env: MiniEnv): void {
    this.env = env;
  }

  private rate(at: number): number {
    return RAMP_START + RAMP_GAIN * ((at - this.t0) / 1000);
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (this.over) return;
    if (!this.started) {
      this.started = true;
      this.t0 = ts;
      this.nextBeat = ts + 600;
      return;
    }
    // A press can run at most one beat ahead; extra presses do not bank.
    if (this.presses < this.beats + 1) this.presses++;
    this.flash = ts + 60;
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  pointer(_x: number, _y: number, ts: number): void {
    this.press(0, ts);
    this.release(0);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    if (this.over && now >= this.overAt) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    if (this.started && !this.over) {
      while (now >= this.nextBeat) {
        this.beats++;
        this.env.sound(SND_BEAT);
        this.nextBeat += 1000 / this.rate(this.nextBeat);
        if (this.beats - this.presses < 2) this.peak = Math.max(this.peak, this.rate(now));
      }
      if (this.beats - this.presses >= RAMP_SLACK || now - this.t0 > 180000) {
        this.over = true;
        this.overAt = now + 1500;
        this.env.sound(SND_FALL);
      }
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const rate = this.started ? this.rate(this.over ? this.overAt - 1500 : now) : RAMP_START;
    header(v, touch, 'beat', `${rate.toFixed(1)} a second`, 'best kept', this.peak ? `${this.peak.toFixed(1)}/s` : '–');
    // The beat pulses; a row of marks shows how far behind you are.
    const into = this.started && !this.over ? 1 - Math.min(1, (this.nextBeat - now) * this.rate(now) / 1000) : 0;
    const r = (40 + 14 * Math.pow(into, 6)) * a.u;
    ctx.strokeStyle = COL_DIM;
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.arc(a.cx, a.cy - 20 * a.u, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = now < this.flash ? COL_LINE : '#1c1c20';
    ctx.beginPath();
    ctx.arc(a.cx, a.cy - 20 * a.u, 30 * a.u, 0, Math.PI * 2);
    ctx.fill();
    const behind = Math.max(0, this.beats - this.presses);
    for (let k = 0; k < RAMP_SLACK; k++) {
      ctx.fillStyle = k < behind ? COL_ACCENT : COL_DIM;
      ctx.fillRect(a.cx + (k - RAMP_SLACK / 2) * 24 * a.u + 4 * a.u, a.cy + 50 * a.u, 16 * a.u, 6 * a.u);
    }
    ctx.fillStyle = COL_MID;
    v.text(this.over ? `fell behind at ${rate.toFixed(1)} beats a second` : this.started ? 'one press a beat, any key; the marks fill as you fall behind' : 'press any key on each beat; it keeps getting faster. press to start', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: Math.round(this.peak * 100),
      primary: { label: 'fastest beat kept up with', value: Number(this.peak.toFixed(1)), unit: 'a second', decimals: 1 },
      lines: [
        { label: 'fastest beat kept', value: this.peak ? `${this.peak.toFixed(1)} a second` : '–' },
        { label: 'beats played', value: String(this.presses) },
      ],
      saved: this.presses >= 10,
    };
  }
}

// --- Abc -------------------------------------------------------------------------------

const ABC_RUNS = 5;
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';

class Abc implements Mini {
  private env!: MiniEnv;
  private run = 0;
  private pos = 0;
  private runAt = 0;
  private times: number[] = [];
  private slips = 0;
  private runSlips = 0;
  private state = 0;
  private at = 0;
  private bad = 0;
  private firstAt = 0;
  /** Later runs go backwards, z to a. */
  private back = false;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.firstAt = now;
  }

  private letters(): string {
    return this.back ? [...ALPHABET].reverse().join('') : ALPHABET;
  }

  press(): void {}

  typeKey(code: string, ts: number, key?: string): boolean {
    if (!code.startsWith('Key')) return false;
    if (this.state === 1) return true;
    const ch = (key && key.length === 1 ? key : code.slice(3)).toLowerCase();
    if (ch === this.letters()[this.pos]) {
      if (this.pos === 0) {
        this.runAt = ts;
        this.runSlips = 0;
      }
      this.pos++;
      if (this.pos >= 26) {
        this.times.push(ts - this.runAt);
        this.env.sound(SND_CATCH);
        this.run++;
        this.state = 1;
        this.at = ts + 1200;
      }
    } else if (this.pos > 0) {
      this.slips++;
      this.runSlips++;
      this.bad = ts + 150;
      this.env.sound(SND_FALSE);
    }
    return true;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 1 && now >= this.at) {
      if (this.run >= scaled(ABC_RUNS)) return true;
      this.pos = 0;
      this.back = this.run >= Math.ceil(scaled(ABC_RUNS) * 0.6);
      this.state = 0;
    }
    if (now - this.firstAt > 600000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const live = this.state === 0 && this.pos > 0 ? now - this.runAt : this.times.length && this.state === 1 ? this.times[this.times.length - 1]! : 0;
    header(v, touch, 'time', live ? `${(live / 1000).toFixed(2)} s` : '–', 'run', `${Math.min(this.run + 1, scaled(ABC_RUNS))} / ${scaled(ABC_RUNS)}`);
    const s = Math.min(34 * a.u, (a.right - a.left) / 14);
    ctx.font = `600 ${Math.round(s * 0.8)}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const L = this.letters();
    for (let k = 0; k < 26; k++) {
      const row = Math.floor(k / 13);
      const x = a.cx + ((k % 13) - 6) * s;
      const y = a.cy - 30 * a.u + row * s * 1.5;
      ctx.fillStyle = k < this.pos ? COL_DIM : k === this.pos ? (now < this.bad ? COL_ACCENT : COL_LINE) : COL_MID;
      ctx.fillText(L[k]!, x, y);
      if (k === this.pos && this.state === 0) {
        ctx.fillStyle = COL_LINE;
        ctx.fillRect(x - s * 0.3, y + s * 0.55, s * 0.6, 2 * v.dpr);
      }
    }
    ctx.fillStyle = COL_MID;
    const msg = this.state === 1 ? `${(this.times[this.times.length - 1]! / 1000).toFixed(2)} s, ${this.runSlips} slips` : this.pos === 0 ? (this.back ? 'now backwards, z to a: the clock starts on the first letter' : 'type the alphabet in order: the clock starts on the a') : '';
    v.text(msg, a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const best = this.times.length ? Math.min(...this.times) : NaN;
    return {
      score: this.times.length ? Math.max(0, Math.round((Math.max(0, 15000 - best) / 10) * Math.min(1, this.times.length / 2)) - this.slips * 5) : 0,
      primary: { label: 'fastest alphabet', value: this.times.length ? best / 1000 : 0, unit: 's', lower: true, decimals: 2 },
      lines: [
        { label: 'fastest', value: this.times.length ? `${(best / 1000).toFixed(2)} s` : '–' },
        { label: 'typical', value: this.times.length ? `${(median(this.times) / 1000).toFixed(2)} s` : '–' },
        { label: 'slips', value: String(this.slips) },
      ],
      saved: this.times.length >= 1,
    };
  }
}

// --- Shuttle (mouse speed) -------------------------------------------------------------

const SHUTTLE_MS = 20000;

class Shuttle implements Mini {
  private env!: MiniEnv;
  private side = -1;
  private laps = 0;
  private t0 = 0;
  private started = false;
  private bars: [number, number] = [0, 0];
  private px = 0;
  private py = 0;
  private gaps: number[] = [];
  private lastAt = 0;
  private flash = 0;
  private firstFrame = 0;

  start(env: MiniEnv): void {
    this.env = env;
  }

  press(): void {}

  pointerMove(x: number, y: number, ts: number): void {
    this.px = x;
    this.py = y;
    if (!this.started) return;
    if (ts - this.t0 >= scaled(SHUTTLE_MS)) return;
    const [l, r] = this.bars;
    const reached = this.side < 0 ? x <= l : x >= r;
    if (reached) {
      this.laps++;
      this.gaps.push(ts - this.lastAt);
      this.lastAt = ts;
      this.side = -this.side;
      this.flash = ts + 100;
      this.env.sound(SND_TAP_WEAK);
    }
  }

  pointer(x: number, y: number, ts: number): void {
    if (!this.started) {
      this.started = true;
      this.t0 = ts;
      this.lastAt = ts;
      // Start toward whichever bar is further away.
      this.side = x > (this.bars[0] + this.bars[1]) / 2 ? -1 : 1;
      return;
    }
    this.pointerMove(x, y, ts);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    const len = scaled(SHUTTLE_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const left = this.started ? Math.max(0, (len - (now - this.t0)) / 1000) : len / 1000;
    header(v, touch, 'sweeps', String(this.laps), 'time', `${left.toFixed(1)} s`);
    const W = Math.min(a.right - a.left - 40 * a.u, 900 * a.u);
    const l = a.cx - W / 2;
    const r = a.cx + W / 2;
    this.bars = [l, r];
    for (const s of [-1, 1]) {
      const x = s < 0 ? l : r;
      const target = this.started && this.side === s;
      ctx.fillStyle = target ? COL_LINE : COL_DIM;
      ctx.fillRect(x - (s < 0 ? 14 * a.u : 0), a.top + 20 * a.u, 14 * a.u, a.bottom - a.top - 60 * a.u);
    }
    ctx.fillStyle = now < this.flash ? COL_LINE : COL_ACCENT;
    ctx.beginPath();
    ctx.arc(this.px, this.py, 5 * dpr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COL_MID;
    v.text(this.started ? 'touch the bright bar, then the other, and back' : 'click to start: sweep the mouse to the bright bar and back, as many times as you can', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.laps * 15,
      primary: { label: 'sweeps in 20 seconds', value: this.laps, unit: '' },
      lines: [
        { label: 'sweeps', value: String(this.laps) },
        { label: 'typical sweep', value: this.gaps.length ? ms(median(this.gaps)) : '–' },
      ],
      saved: this.laps >= 4,
    };
  }
}

// --- Anchor (finger independence) ------------------------------------------------------

const ANCHOR_ROUNDS = 16;
/** Home-row hands: the anchor key and the keys its neighbours tap. */
const HANDS: { anchor: string; taps: string[] }[] = [
  { anchor: 'F', taps: ['A', 'S', 'D'] },
  { anchor: 'J', taps: ['K', 'L', ';'] },
  { anchor: 'D', taps: ['A', 'S', 'F'] },
  { anchor: 'K', taps: ['J', 'L', ';'] },
];
const codeOf = (k: string) => (k === ';' ? 'Semicolon' : `Key${k}`);

class Anchor implements Mini {
  private env!: MiniEnv;
  private round = 0;
  private hand = HANDS[0]!;
  private seq: string[] = [];
  private pos = 0;
  private down = false;
  private state = 0; // 0 waiting for the anchor, 1 tapping, 2 done
  private at = 0;
  private startAt = 0;
  private times: number[] = [];
  private slips = 0;
  private lifts = 0;
  private bad = 0;
  private note = '';
  private firstAt = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.firstAt = now;
    this.arm();
  }

  private arm(): void {
    this.hand = HANDS[this.round % HANDS.length]!;
    const n = Math.min(10, 5 + Math.floor(this.round / 3));
    this.seq = [];
    for (let i = 0; i < n; i++) {
      let k = pick(this.hand.taps);
      while (this.seq.length && k === this.seq[this.seq.length - 1] && Math.random() < 0.7) k = pick(this.hand.taps);
      this.seq.push(k);
    }
    this.pos = 0;
    this.state = this.down ? 1 : 0;
    this.note = '';
  }

  press(): void {}

  typeKey(code: string, ts: number): boolean {
    if (this.state === 2) return true;
    if (code === codeOf(this.hand.anchor)) {
      this.down = true;
      if (this.state === 0) this.state = 1;
      return true;
    }
    if (this.state !== 1) return code.startsWith('Key') || code === 'Semicolon';
    if (code === codeOf(this.seq[this.pos]!)) {
      if (this.pos === 0) this.startAt = ts;
      this.pos++;
      this.env.sound(SND_TAP_WEAK);
      if (this.pos >= this.seq.length) {
        this.times.push(ts - this.startAt);
        this.env.sound(SND_CATCH);
        this.round++;
        this.state = 2;
        this.at = ts + 700;
      }
      return true;
    }
    if (code.startsWith('Key') || code === 'Semicolon') {
      this.slips++;
      this.bad = ts + 200;
      this.env.sound(SND_FALSE);
      return true;
    }
    return false;
  }

  typeKeyUp(code: string, ts: number): void {
    if (code !== codeOf(this.hand.anchor)) return;
    this.down = false;
    if (this.state === 1) {
      // Lifting the anchor mid-pattern starts the pattern over.
      this.lifts++;
      this.pos = 0;
      this.state = 0;
      this.note = `${this.hand.anchor} came up: hold it down and start again`;
      this.bad = ts + 400;
      this.env.sound(SND_FALSE);
    }
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 2 && now >= this.at) {
      if (this.round >= scaled(ANCHOR_ROUNDS)) return true;
      // The next pattern may use another anchor: it must be pressed afresh.
      const prev = this.hand.anchor;
      this.arm();
      if (this.hand.anchor !== prev) {
        this.down = false;
        this.state = 0;
      }
    }
    if (now - this.firstAt > 600000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'typical pattern', this.times.length ? ms(median(this.times)) : '–', 'pattern', `${Math.min(this.round + 1, scaled(ANCHOR_ROUNDS))} / ${scaled(ANCHOR_ROUNDS)}`);
    // The anchor key, and the pattern to tap.
    const s = 54 * a.u;
    ctx.strokeStyle = this.down ? COL_LINE : COL_ACCENT;
    ctx.lineWidth = 2.5 * dpr;
    ctx.strokeRect(a.cx - s / 2, a.cy - 110 * a.u, s, s);
    ctx.fillStyle = this.down ? COL_LINE : '#00000000';
    if (this.down) ctx.fillRect(a.cx - s / 2 + 5 * dpr, a.cy - 110 * a.u + 5 * dpr, s - 10 * dpr, s - 10 * dpr);
    ctx.font = `600 ${Math.round(24 * a.u)}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = this.down ? '#111114' : COL_LINE;
    ctx.fillText(this.hand.anchor, a.cx, a.cy - 110 * a.u + s / 2);
    ctx.fillStyle = COL_MID;
    v.text(this.down ? 'held' : `hold ${this.hand.anchor} down`, a.cx, a.cy - 40 * a.u, v.fontTiny, 'center');
    const gap = Math.min(40 * a.u, (a.right - a.left) / (this.seq.length + 1));
    ctx.font = `600 ${Math.round(26 * a.u)}px "JetBrains Mono", ui-monospace, monospace`;
    this.seq.forEach((k, i) => {
      const x = a.cx + (i - (this.seq.length - 1) / 2) * gap;
      ctx.fillStyle = i < this.pos ? COL_DIM : i === this.pos ? (now < this.bad ? COL_ACCENT : COL_LINE) : COL_MID;
      ctx.fillText(k, x, a.cy + 20 * a.u);
    });
    ctx.fillStyle = now < this.bad && this.note ? COL_ACCENT : COL_MID;
    v.text(this.note && now < this.bad + 1500 ? this.note : this.round === 0 ? 'keep the boxed key held the whole time; tap the letters with the fingers beside it' : `${plural(this.slips, 'wrong key')} · ${plural(this.lifts, 'lift')}`, a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const m = median(this.times);
    return {
      score: this.times.length ? Math.max(0, Math.round(this.times.length * Math.max(0, 4000 - m) / 20) - this.slips * 5 - this.lifts * 20) : 0,
      primary: { label: 'typical pattern time', value: m, unit: 'ms', lower: true },
      lines: [
        { label: 'patterns', value: String(this.times.length) },
        { label: 'typical pattern', value: this.times.length ? ms(m) : '–' },
        { label: 'wrong keys', value: String(this.slips) },
        { label: 'anchor lifted', value: String(this.lifts) },
      ],
      saved: this.times.length >= 3,
    };
  }
}

export const BATCH53: MiniDef[] = [
  { id: 'ramp', name: 'Ramp', skill: 'speed', blurb: 'A beat that keeps speeding up. Keep pressing with it until you fall behind.', how: 'A beat starts at three a second and gets faster every second. Press once a beat, any key (or tap); alternating hands helps. Pressing ahead does not bank beats. Fall four beats behind and the run ends. Scored on the fastest beat you kept up with.', input: 'both', make: () => new Ramp() },
  { id: 'abc', name: 'Abc', skill: 'dexterity', blurb: 'Type the alphabet, a to z, as fast as you can.', how: 'Type the alphabet in order; the clock starts on the a and stops on the z. A wrong letter is refused and counted. Five runs; the last two go backwards, z to a. Scored on your fastest run. Needs a keyboard.', input: 'type', make: () => new Abc() },
  { id: 'shuttle', name: 'Shuttle', skill: 'speed', blurb: 'Sweep the mouse from bar to bar and back, as many times as you can.', how: 'Two bars at the sides of the screen. Move the mouse to touch the bright one, then the other, back and forth, as many times as you can in twenty seconds. No clicking needed after the first. A test of raw arm and wrist speed.', input: 'pointer', make: () => new Shuttle() },
  { id: 'anchor', name: 'Anchor', skill: 'dexterity', blurb: 'Hold one key down while the fingers beside it tap a pattern.', how: 'A key on the home row (F, J, D or K) is boxed: hold it down, and keep it down, while the fingers beside it type the letters shown. Lift it and the pattern starts again. The patterns grow longer and the anchor moves between hands. Sixteen patterns. Needs a keyboard.', input: 'type', make: () => new Anchor() },
];
