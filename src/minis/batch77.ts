// Seventy-seventh batch.
//   Vowel  - a letter: vowel or consonant? Letter after letter, as fast as you can.
//   Retain - a note, then a run of others to distract you: was the last note the first one again?

import { COL_ACCENT, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALSE, SND_TAP_L, SND_TAP_R } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, handLabel, header, median, message, ms, pct, scaled, sideOf, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const rint = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]!;

// --- Vowel -----------------------------------------------------------------------------

const VOWEL_MS = 30000;
const VOWELS = 'AEIOU';
const CONSONANTS = 'BCDFGHJKLMNPQRSTVWXZ';

class Vowel implements Mini {
  private env!: MiniEnv;
  private ch = '';
  private lower = false;
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
    const prev = this.ch;
    while (this.ch === prev) this.ch = Math.random() < 0.45 ? pick([...VOWELS]) : pick([...CONSONANTS]);
    // Mixed case after ten right, so the shape alone does not give it away.
    this.lower = this.ok >= 10 && Math.random() < 0.5;
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
    if ((s < 0) === VOWELS.includes(this.ch)) {
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
    const len = scaled(VOWEL_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'right', String(this.ok), 'time', `${left} s`);
    ctx.font = `600 ${Math.round(80 * a.u)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = now < this.flash ? COL_ACCENT : COL_LINE;
    if (this.started) ctx.fillText(this.lower ? this.ch.toLowerCase() : this.ch, a.cx, a.cy - 10 * a.u);
    else {
      ctx.font = `600 ${Math.round(34 * a.u)}px Inter, system-ui, sans-serif`;
      ctx.fillText('vowel or consonant?', a.cx, a.cy - 10 * a.u);
    }
    const off = Math.min(200 * a.u, (a.right - a.left) / 2 - 30 * a.u);
    ctx.fillStyle = COL_MID;
    v.text(`${handLabel(this.env, -1)}  vowel (a e i o u)`, a.cx - off, a.bottom - 6 * a.u, v.fontTiny, 'center');
    v.text(`consonant  ${handLabel(this.env, 1)}`, a.cx + off, a.bottom - 6 * a.u, v.fontTiny, 'center');
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
        { label: 'typical time a letter', value: this.rts.length ? ms(median(this.rts)) : '–' },
      ],
      saved: this.ok + this.bad >= 5,
    };
  }
}

// --- Retain (pitch memory through distraction) -----------------------------------------

const RETAIN_TRIALS = 20;

class Retain implements Mini {
  private env!: MiniEnv;
  private trial = 0;
  private hz = 440;
  private probe = 440;
  private same = true;
  private distract = 3;
  private times: number[] = [];
  private freqs: number[] = [];
  private t0 = 0;
  private played = 0;
  /** 0 pause, 1 playing, 2 answer, 3 feedback. */
  private state = 0;
  private at = 0;
  private right = 0;
  private streak = 0;
  private best = 0;
  private lastOk = true;
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.at = now + 800;
  }

  private play(now: number): void {
    this.hz = 300 * 2 ** (rint(0, 18) / 12);
    this.same = Math.random() < 0.5;
    // A different probe is a semitone or two off, up or down.
    this.probe = this.same ? this.hz : this.hz * 2 ** ((Math.random() < 0.5 ? -1 : 1) * rint(1, 2) / 12);
    this.freqs = [this.hz];
    for (let k = 0; k < this.distract; k++) this.freqs.push(300 * 2 ** (rint(0, 20) / 12));
    this.freqs.push(this.probe);
    this.times = this.freqs.map((_, k) => (k === 0 ? 0 : k === this.freqs.length - 1 ? 700 + this.distract * 330 + 500 : 700 + (k - 1) * 330));
    this.t0 = now + 150;
    this.played = 0;
    this.state = 1;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (s === 0 || this.state !== 2) return;
    const ok = (s < 0) === this.same;
    this.lastOk = ok;
    if (ok) {
      this.right++;
      this.best = Math.max(this.best, this.distract);
      if (++this.streak % 2 === 0) this.distract = Math.min(9, this.distract + 1);
    } else {
      this.streak = 0;
      this.distract = Math.max(1, this.distract - 1);
    }
    this.env.sound(ok ? SND_CATCH : SND_FALSE);
    this.trial++;
    this.state = 3;
    this.at = ts + (ok ? 700 : 1300);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.at) this.play(now);
    if (this.state === 1) {
      while (this.played < this.freqs.length && now >= this.t0 + this.times[this.played]!) {
        const first = this.played === 0 || this.played === this.freqs.length - 1;
        if (this.env.note) this.env.note(this.freqs[this.played]!, first ? 500 : 260);
        else this.env.tone?.(this.freqs[this.played]!, first ? 500 : 260);
        this.played++;
      }
      if (this.played >= this.freqs.length && now > this.t0 + this.times[this.times.length - 1]! + 500) this.state = 2;
    }
    if (this.state === 3 && now >= this.at) {
      if (this.trial >= scaled(RETAIN_TRIALS)) return true;
      this.state = 0;
      this.at = now + rnd(400, 700);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'notes between', String(this.distract), 'trial', `${Math.min(this.trial + 1, scaled(RETAIN_TRIALS))} / ${scaled(RETAIN_TRIALS)}`);
    // A row of dots: the first and last notes stand out; the ones between are small.
    const n = this.freqs.length || this.distract + 2;
    for (let k = 0; k < n; k++) {
      const x = a.cx + (k - (n - 1) / 2) * 34 * a.u;
      const key = k === 0 || k === n - 1;
      const on = this.state === 1 && k < this.played;
      ctx.fillStyle = on ? (key ? COL_LINE : COL_MID) : '#2a2a30';
      ctx.beginPath();
      ctx.arc(x, a.cy - 30 * a.u, (key ? 10 : 5) * a.u, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = this.state === 2 ? COL_LINE : this.state === 3 && !this.lastOk ? COL_ACCENT : COL_MID;
    v.text(this.state === 1 ? 'remember the first note; ignore the ones between' : this.state === 2 ? 'was the last note the same as the first?' : this.state === 3 ? (this.lastOk ? 'right' : this.same ? 'they were the same' : 'it was different') : '', a.cx, a.cy + 30 * a.u, v.fontHud, 'center');
    if (this.env.muted) message(v, { ...a, cy: a.cy + 80 * a.u }, '', 'needs sound on', COL_ACCENT);
    const off = Math.min(200 * a.u, (a.right - a.left) / 2 - 30 * a.u);
    ctx.fillStyle = COL_MID;
    v.text(`${handLabel(this.env, -1)}  same`, a.cx - off, a.bottom - 6 * a.u, v.fontTiny, 'center');
    v.text(`different  ${handLabel(this.env, 1)}`, a.cx + off, a.bottom - 6 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.right * 50 + this.best * 40,
      primary: { label: 'most notes held through', value: this.best, unit: 'notes' },
      lines: [
        { label: 'right', value: `${this.right} of ${this.trial}` },
        { label: 'accuracy', value: this.trial ? pct(this.right / this.trial) : '–' },
        { label: 'most notes between, still right', value: this.best ? String(this.best) : '–' },
      ],
      saved: this.trial >= 6,
    };
  }
}

export const BATCH77: MiniDef[] = [
  { id: 'vowel', name: 'Vowel', skill: 'speed', blurb: 'A letter: vowel or consonant? Letter after letter, as fast as you can.', how: 'A letter appears: left if it is a vowel (A, E, I, O, U), right if a consonant. The next follows at once. After ten right, capitals and small letters mix. Thirty seconds; mistakes count against you double.', input: 'keys', minKeys: 2, make: () => new Vowel() },
  { id: 'retain', name: 'Retain', skill: 'ear', blurb: 'A note, then others to distract you. Was the last note the first one again?', how: 'A note plays; hold it in mind. A run of other notes follows, then one more. Left if that last note was the same as the first, right if it was different (a semitone or two away). Two right and more notes come between; a miss and fewer. Twenty trials. Needs sound on.', input: 'keys', minKeys: 2, make: () => new Retain() },
];
