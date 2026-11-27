// Sixty-seventh batch.
//   Sharp  - a pulsing tone starts to drift up or down. Which way? As soon as you can tell.
//   Binary - a binary number: type its value.
//   Race   - one ball rolls steadily, one speeds up from rest. Both vanish: which wins?

import { COL_ACCENT, COL_DIM, COL_FAINT, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALSE, SND_TAP_L, SND_TAP_R } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, foreperiod, handLabel, header, mean, median, message, ms, pct, scaled, sideOf, Stair, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const TAU = Math.PI * 2;
const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const rint = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
const digitOf = (code: string) => (code.startsWith('Digit') ? code.slice(5) : code.startsWith('Numpad') ? code.slice(6) : '');

// --- Sharp (notice a pitch drift) ------------------------------------------------------

const SHARP_TRIALS = 16;
const PULSE = 300;
const PULSE_GAP = 400;

class Sharp implements Mini {
  private env!: MiniEnv;
  private trial = 0;
  private hz = 440;
  private up = true;
  /** Drift rate (cents a second) and when it starts. */
  private rate = 50;
  private onset = 0;
  private nextPulse = 0;
  /** 0 gap, 1 playing, 2 feedback. */
  private state = 0;
  private at = 0;
  private cents: number[] = [];
  private wrong = 0;
  private early = 0;
  private missed = 0;
  private last = '';
  private held = 0;
  private firstAt = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.firstAt = now;
    this.at = now + 800;
  }

  private arm(now: number): void {
    this.hz = 330 * 2 ** (Math.random() * 1.2);
    this.up = Math.random() < 0.5;
    this.rate = rnd(25, 70);
    this.onset = now + foreperiod(1500, 2000, 6000);
    this.nextPulse = now;
    this.state = 1;
  }

  /** The drift so far (cents) at a moment. */
  private drift(t: number): number {
    return Math.max(0, (t - this.onset) / 1000) * this.rate;
  }

  private pitch(t: number): number {
    return this.hz * 2 ** (((this.up ? 1 : -1) * this.drift(t)) / 1200);
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (s === 0 || this.state !== 1) return;
    if (ts < this.onset) {
      this.early++;
      this.last = 'it had not moved yet';
      this.env.sound(SND_FALSE);
    } else if ((s > 0) === this.up) {
      const c = this.drift(ts);
      this.cents.push(c);
      this.last = `${this.up ? 'up' : 'down'}, caught at ${Math.round(c)} cents`;
      this.env.sound(SND_CATCH);
    } else {
      this.wrong++;
      this.last = `it was drifting ${this.up ? 'up' : 'down'}`;
      this.env.sound(SND_FALSE);
    }
    this.trial++;
    this.state = 2;
    this.at = ts + 1300;
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.at) this.arm(now);
    if (this.state === 1) {
      // Pulses, each gliding from where the last ended, so no click marks the start of the drift.
      if (now >= this.nextPulse) {
        const a = this.pitch(now);
        const b = this.pitch(now + PULSE);
        this.env.tone?.(a, PULSE, 0, 0.11, b !== a ? b : undefined);
        this.nextPulse = now + PULSE_GAP;
      }
      if (this.drift(now) > 200) {
        this.missed++;
        this.trial++;
        this.last = `it drifted ${this.up ? 'up' : 'down'} two semitones unnoticed`;
        this.state = 2;
        this.at = now + 1300;
      }
    }
    if (this.state === 2 && now >= this.at) {
      if (this.trial >= scaled(SHARP_TRIALS)) return true;
      this.state = 0;
      this.at = now + 700;
    }
    if (now - this.firstAt > 600000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'typical catch', this.cents.length ? `${Math.round(median(this.cents))} cents` : '–', 'tone', `${Math.min(this.trial + 1, scaled(SHARP_TRIALS))} / ${scaled(SHARP_TRIALS)}`);
    ctx.fillStyle = this.state === 2 && /not|was|unnoticed/.test(this.last) ? COL_ACCENT : COL_LINE;
    v.text(this.state === 1 ? 'listen…' : this.state === 2 ? this.last : '', a.cx, a.cy, v.fontHud, 'center');
    if (this.env.muted) message(v, { ...a, cy: a.cy + 50 * a.u }, '', 'needs sound on', COL_ACCENT);
    const off = Math.min(200 * a.u, (a.right - a.left) / 2 - 30 * a.u);
    ctx.fillStyle = COL_MID;
    v.text(`${handLabel(this.env, -1)}  drifting down`, a.cx - off, a.bottom - 6 * a.u, v.fontTiny, 'center');
    v.text(`drifting up  ${handLabel(this.env, 1)}`, a.cx + off, a.bottom - 6 * a.u, v.fontTiny, 'center');
    if (this.trial === 0 && this.state < 2) v.text('a steady pulsing tone will start to drift: press the way it goes, as soon as you can tell', a.cx, a.bottom - 30 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const m = median(this.cents);
    return {
      score: this.cents.length ? Math.max(0, Math.round((200 - m) * 10 + this.cents.length * 20) - (this.wrong + this.early) * 40) : 0,
      primary: { label: 'typical drift when caught', value: Math.round(m), unit: 'cents', lower: true },
      lines: [
        { label: 'typical drift when caught', value: this.cents.length ? `${Math.round(m)} cents` : '–' },
        { label: 'wrong way', value: String(this.wrong) },
        { label: 'too early', value: String(this.early) },
        { label: 'not noticed', value: String(this.missed) },
      ],
      saved: this.trial >= 5,
    };
  }
}

// --- Binary ----------------------------------------------------------------------------

const BINARY_MS = 60000;

class Binary implements Mini {
  private env!: MiniEnv;
  private n = 0;
  private bits = 4;
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
    this.bits = this.ok < 5 ? 4 : this.ok < 12 ? 6 : 8;
    this.n = rint(1, 2 ** this.bits - 1);
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
      if (this.typed.length < 3) this.typed += d;
      return true;
    }
    if (code === 'Backspace') {
      this.typed = this.typed.slice(0, -1);
      return true;
    }
    if ((code === 'Enter' || code === 'NumpadEnter' || code === 'Space') && this.typed) {
      if (Number(this.typed) === this.n) {
        this.ok++;
        this.rts.push(ts - this.at);
        this.env.sound(SND_CATCH);
      } else {
        this.bad++;
        this.note = `${this.n.toString(2).padStart(this.bits, '0')} = ${this.n}`;
        this.flash = ts + 1500;
        this.env.sound(SND_FALSE);
      }
      this.make(ts);
      return true;
    }
    return false;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    const len = scaled(BINARY_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'right', String(this.ok), 'time', `${left} s`);
    const s = this.started ? this.n.toString(2).padStart(this.bits, '0') : '1010';
    ctx.font = `500 ${Math.round(46 * a.u)}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cw = 46 * a.u * 0.75;
    [...s].forEach((c, i) => {
      const x = a.cx + (i - (s.length - 1) / 2) * cw;
      ctx.fillStyle = c === '1' ? COL_LINE : COL_DIM;
      ctx.fillText(c, x, a.cy - 50 * a.u);
      ctx.fillStyle = COL_MID;
      v.text(String(2 ** (s.length - 1 - i)), x, a.cy - 14 * a.u, v.fontTiny, 'center');
      ctx.font = `500 ${Math.round(46 * a.u)}px "JetBrains Mono", ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
    });
    if (this.started) {
      ctx.font = `600 ${Math.round(34 * a.u)}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = COL_MID;
      ctx.fillText(this.typed || '_', a.cx, a.cy + 40 * a.u);
    }
    if (now < this.flash) {
      ctx.fillStyle = COL_ACCENT;
      v.text(this.note, a.cx, a.cy + 84 * a.u, v.fontTiny, 'center');
    }
    ctx.fillStyle = COL_MID;
    v.text(this.started ? 'type its value, then Enter' : 'press Space to start: turn binary into ordinary numbers. a minute', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
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
        { label: 'typical time a number', value: this.rts.length ? ms(median(this.rts)) : '–' },
      ],
      saved: this.ok + this.bad >= 3,
    };
  }
}

// --- Race (steady against speeding up) -------------------------------------------------

const RACE_TRIALS = 24;

class Race implements Mini {
  private env!: MiniEnv;
  /** How far apart the finishing times are, in percent. */
  private readonly diff = new Stair(30, 3, 3, 50, 2);
  private levels: number[] = [];
  private trial = 0;
  /** Lane 0 steady (speed v), lane 1 from rest (acceleration acc); which lane each is on. */
  private v = 0.3;
  private acc = 0.2;
  private steadyLane = 0;
  private winner = 0;
  private startAt = 0;
  private hideAt = 0;
  private state = 0; // 0 gap, 1 racing (visible, then hidden), 2 feedback
  private at = 0;
  private right = 0;
  private lastOk = true;
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.at = now + 700;
  }

  private arm(now: number): void {
    this.v = rnd(0.22, 0.4);
    const tA = 1 / this.v;
    const d = this.diff.level / 100;
    const accelWins = Math.random() < 0.5;
    const tB = tA * (accelWins ? 1 - d / 2 : 1 + d / 2);
    this.acc = 2 / (tB * tB);
    this.steadyLane = Math.random() < 0.5 ? 0 : 1;
    const steadyWins = tA < tB;
    this.winner = steadyWins ? this.steadyLane : 1 - this.steadyLane;
    this.startAt = now;
    // Visible for the first stretch only, while the steady ball usually still leads.
    this.hideAt = now + Math.min(tA, tB) * 1000 * rnd(0.3, 0.45);
    this.state = 1;
  }

  private pos(lane: number, t: number): number {
    const s = (t - this.startAt) / 1000;
    return lane === this.steadyLane ? this.v * s : 0.5 * this.acc * s * s;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (s === 0 || this.state !== 1 || ts < this.hideAt) return;
    const said = s < 0 ? 0 : 1;
    const ok = said === this.winner;
    this.lastOk = ok;
    this.levels.push(this.diff.level);
    this.diff.update(ok, -1);
    if (ok) this.right++;
    this.env.sound(ok ? (s < 0 ? SND_TAP_L : SND_TAP_R) : SND_FALSE);
    this.trial++;
    this.state = 2;
    this.at = ts + (ok ? 900 : 1600);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.at) this.arm(now);
    if (this.state === 1 && now - this.startAt > 12000) {
      this.trial++;
      this.lastOk = false;
      this.state = 2;
      this.at = now + 1200;
    }
    if (this.state === 2 && now >= this.at) {
      if (this.trial >= scaled(RACE_TRIALS)) return true;
      this.state = 0;
      this.at = now + 400;
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'difference', `${this.diff.level}%`, 'race', `${Math.min(this.trial + 1, scaled(RACE_TRIALS))} / ${scaled(RACE_TRIALS)}`);
    const W = Math.min(a.right - a.left - 40 * a.u, 680 * a.u);
    const x0 = a.cx - W / 2;
    for (let lane = 0; lane < 2; lane++) {
      const y = a.cy - 40 * a.u + lane * 80 * a.u;
      ctx.fillStyle = COL_FAINT;
      ctx.fillRect(x0, y + 12 * a.u, W, 2 * dpr);
      ctx.fillStyle = COL_MID;
      v.text(lane === this.steadyLane ? 'steady' : 'speeding up', x0, y - 16 * a.u, v.fontTiny, 'left');
      const visible = this.state === 1 && now < this.hideAt;
      const t = this.state === 2 ? this.startAt + 1e9 : now;
      if (visible || this.state === 2) {
        const p = Math.min(1, this.pos(lane, t));
        ctx.fillStyle = this.state === 2 ? (lane === this.winner ? COL_LINE : COL_DIM) : COL_LINE;
        ctx.beginPath();
        ctx.arc(x0 + p * W, y, 9 * a.u, 0, TAU);
        ctx.fill();
      }
    }
    // The finish line, and the curtain that hides the rest of the race.
    ctx.fillStyle = COL_ACCENT;
    ctx.fillRect(x0 + W - dpr, a.cy - 60 * a.u, 2 * dpr, 140 * a.u);
    if (this.state === 1 && now >= this.hideAt) {
      ctx.fillStyle = COL_LINE;
      v.text('which reaches the finish first?', a.cx, a.cy + 100 * a.u, v.fontHud, 'center');
    }
    if (this.state === 2) {
      ctx.fillStyle = this.lastOk ? COL_MID : COL_ACCENT;
      v.text(this.lastOk ? 'right' : `the ${this.winner === this.steadyLane ? 'steady' : 'speeding'} ball won`, a.cx, a.cy + 100 * a.u, v.fontTiny, 'center');
    }
    const off = Math.min(200 * a.u, (a.right - a.left) / 2 - 30 * a.u);
    ctx.fillStyle = COL_MID;
    v.text(`${handLabel(this.env, -1)}  top`, a.cx - off, a.bottom - 6 * a.u, v.fontTiny, 'center');
    v.text(`bottom  ${handLabel(this.env, 1)}`, a.cx + off, a.bottom - 6 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const th = this.levels.length >= 8 ? mean(this.levels.slice(-10)) : 0;
    return {
      score: th ? Math.max(0, Math.round((52 - th) * 40 + this.right * 5)) : 0,
      primary: { label: 'closest finish called right', value: Math.round(th), unit: '%', lower: true },
      lines: [
        { label: 'threshold (last 10)', value: th ? `${th.toFixed(0)}%` : '–' },
        { label: 'right', value: `${this.right} of ${this.trial}` },
        { label: 'accuracy', value: this.trial ? pct(this.right / this.trial) : '–' },
      ],
      saved: this.trial >= 8,
    };
  }
}

export const BATCH67: MiniDef[] = [
  { id: 'sharp', name: 'Sharp', skill: 'ear', blurb: 'A pulsing tone starts to drift up or down. Which way? As soon as you can tell.', how: 'A tone pulses steadily, then at some point starts to drift slowly up or down in pitch. Press the way it is going, as soon as you can tell: right for up, left for down. Pressing before it moves, or the wrong way, counts against you. Sixteen tones; scored on how far it had drifted when you caught it.', input: 'keys', minKeys: 2, make: () => new Sharp() },
  { id: 'binary', name: 'Binary', skill: 'reasoning', blurb: 'A binary number. Type its value.', how: 'A number in binary, with the place values written under each digit. Type its value and press Enter. Four bits first, then six, then eight. A minute; a mistake shows the answer.', input: 'type', make: () => new Binary() },
  { id: 'race', name: 'Race', skill: 'judgement', blurb: 'One ball rolls steadily, one speeds up from rest. Both vanish: which wins?', how: 'Two balls set off together: one at a steady speed, one from rest but speeding up. Watch the start, then they vanish. Which reaches the finish line first? Left for the top ball, right for the bottom. Get them right and the races get closer. Twenty-four races.', input: 'keys', minKeys: 2, make: () => new Race() },
];
