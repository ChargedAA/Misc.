// Sixty-fifth batch.
//   Glimpse - a word flashes and is masked. Type it. The flashes get shorter.
//   Warm    - a colour: warm or cool? Later the word printed on it tries to mislead.
//   Runners - two runners, one per hand: jump each one over its own hurdles.
//   Carry   - a few clicks set a beat, then silence: press on the beat called for.

import { COL_ACCENT, COL_DIM, COL_FAINT, COL_LINE, COL_MID } from '../config.ts';
import { SND_BEAT, SND_CATCH, SND_FALL, SND_FALSE, SND_TAP_L, SND_TAP_R, SND_TAP_WEAK } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, handLabel, header, mean, median, ms, scaled, sideOf, Stair, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';
import { WORDS } from './batch24.ts';

const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const rint = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]!;

// --- Glimpse ---------------------------------------------------------------------------

const GLIMPSE_TRIALS = 20;
const GPOOL = WORDS.filter((w) => w.length >= 5 && w.length <= 8 && /^[a-z]+$/.test(w));

class Glimpse implements Mini {
  private env!: MiniEnv;
  /** How long the word shows (ms). */
  private readonly show = new Stair(250, 25, 25, 400, 2);
  private levels: number[] = [];
  private trial = 0;
  private word = '';
  private typed = '';
  private shownAt = 0;
  private dur = 250;
  /** 0 ready, 1 flash + mask, 2 typing, 3 feedback. */
  private state = 0;
  private at = 0;
  private right = 0;
  private lastOk = true;
  private firstAt = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.firstAt = now;
    this.at = now + 900;
  }

  private flash(now: number): void {
    this.word = pick(GPOOL);
    this.typed = '';
    this.dur = this.show.level;
    this.shownAt = now + 400;
    this.state = 1;
  }

  press(): void {}

  typeKey(code: string, ts: number, key?: string): boolean {
    if (this.state !== 2) return code.startsWith('Key');
    if (code.startsWith('Key')) {
      if (this.typed.length < 12) this.typed += (key && key.length === 1 ? key : code.slice(3)).toLowerCase();
      return true;
    }
    if (code === 'Backspace') {
      this.typed = this.typed.slice(0, -1);
      return true;
    }
    if ((code === 'Enter' || code === 'NumpadEnter') && this.typed) {
      const ok = this.typed === this.word;
      this.lastOk = ok;
      this.levels.push(this.dur);
      this.show.update(ok, -1);
      if (ok) this.right++;
      this.env.sound(ok ? SND_CATCH : SND_FALSE);
      this.trial++;
      this.state = 3;
      this.at = ts + (ok ? 700 : 1400);
      return true;
    }
    return false;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.at) this.flash(now);
    if (this.state === 1 && now >= this.shownAt + this.dur + 300) this.state = 2;
    if (this.state === 3 && now >= this.at) {
      if (this.trial >= scaled(GLIMPSE_TRIALS)) return true;
      this.state = 0;
      this.at = now + 300;
    }
    if (now - this.firstAt > 600000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'shown for', `${this.show.level} ms`, 'word', `${Math.min(this.trial + 1, scaled(GLIMPSE_TRIALS))} / ${scaled(GLIMPSE_TRIALS)}`);
    const size = Math.round(40 * a.u);
    ctx.font = `500 ${size}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const y = a.cy - 40 * a.u;
    if (this.state === 1) {
      if (now < this.shownAt) {
        ctx.fillStyle = COL_DIM;
        ctx.fillText('+', a.cx, y);
      } else if (now < this.shownAt + this.dur) {
        ctx.fillStyle = COL_LINE;
        ctx.fillText(this.word, a.cx, y);
      } else {
        // A mask of mixed symbols wipes the afterimage.
        ctx.fillStyle = COL_MID;
        ctx.fillText('#%&@$#%&@'.slice(0, this.word.length + 1), a.cx, y);
      }
    } else if (this.state >= 2) {
      ctx.fillStyle = this.state === 3 && !this.lastOk ? COL_ACCENT : COL_LINE;
      ctx.fillText(this.typed || '_', a.cx, y + 70 * a.u);
      if (this.state === 3 && !this.lastOk) {
        ctx.fillStyle = COL_MID;
        v.text(`it was “${this.word}”`, a.cx, y + 120 * a.u, v.fontTiny, 'center');
      }
    }
    ctx.fillStyle = COL_MID;
    v.text(this.state === 2 ? 'type the word, then Enter' : this.trial === 0 && this.state < 2 ? 'a word will flash where the cross is' : '', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const th = this.levels.length >= 8 ? median(this.levels.slice(-10)) : 0;
    return {
      score: th ? Math.max(0, Math.round((420 - th) * 6)) : 0,
      primary: { label: 'shortest flash you can read', value: th, unit: 'ms', lower: true },
      lines: [
        { label: 'threshold (last 10)', value: th ? ms(th) : '–' },
        { label: 'right', value: `${this.right} of ${this.trial}` },
      ],
      saved: this.trial >= 8,
    };
  }
}

// --- Warm ------------------------------------------------------------------------------

const WARM_MS = 30000;
/** Hue ranges, clear of the borders between warm and cool. */
const WARM_HUES: [number, number][] = [[350, 375], [15, 45], [45, 58]];
const COOL_HUES: [number, number][] = [[150, 175], [195, 235], [255, 285]];

class Warm implements Mini {
  private env!: MiniEnv;
  private hue = 0;
  private warm = true;
  private word = '';
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
    this.warm = Math.random() < 0.5;
    const [lo, hi] = pick(this.warm ? WARM_HUES : COOL_HUES);
    this.hue = rnd(lo, hi) % 360;
    // After ten right, a word sits on the colour, half the time the wrong one.
    this.word = this.ok >= 10 ? (Math.random() < 0.5 ? (this.warm ? 'COOL' : 'WARM') : this.warm ? 'WARM' : 'COOL') : '';
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
    if ((s < 0) === this.warm) {
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
    const len = scaled(WARM_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'right', String(this.ok), 'time', `${left} s`);
    const s = Math.min(180 * a.u, (a.bottom - a.top) * 0.5);
    if (this.started) {
      ctx.fillStyle = `hsl(${this.hue}, 70%, 52%)`;
      ctx.fillRect(a.cx - s / 2, a.cy - s / 2 - 10 * a.u, s, s);
      if (this.word) {
        ctx.font = `700 ${Math.round(34 * a.u)}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#0b0b0d';
        ctx.fillText(this.word, a.cx, a.cy - 10 * a.u);
      }
    }
    if (now < this.flash) {
      ctx.strokeStyle = COL_ACCENT;
      ctx.lineWidth = 3 * dpr;
      ctx.strokeRect(a.cx - s / 2 - 8 * a.u, a.cy - s / 2 - 18 * a.u, s + 16 * a.u, s + 16 * a.u);
    }
    const off = Math.min(200 * a.u, (a.right - a.left) / 2 - 30 * a.u);
    ctx.fillStyle = COL_MID;
    v.text(`${handLabel(this.env, -1)}  warm (reds, oranges, yellows)`, a.cx - off, a.bottom - 6 * a.u, v.fontTiny, 'center');
    v.text(`cool (greens, blues, purples)  ${handLabel(this.env, 1)}`, a.cx + off, a.bottom - 6 * a.u, v.fontTiny, 'center');
    if (!this.started) v.text('sort each colour: warm or cool. press either side to start; thirty seconds', a.cx, a.cy, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: Math.max(0, this.ok * 20 - this.bad * 40),
      primary: { label: 'sorted in 30 seconds', value: this.ok, unit: '' },
      lines: [
        { label: 'right', value: String(this.ok) },
        { label: 'wrong', value: String(this.bad) },
        { label: 'typical time a colour', value: this.rts.length ? ms(median(this.rts)) : '–' },
      ],
      saved: this.ok + this.bad >= 5,
    };
  }
}

// --- Runners ---------------------------------------------------------------------------

const RUNNERS_MS = 90000;
const RUNNER_LIVES = 5;
const JUMP_MS = 520;

class Runners implements Mini {
  private env!: MiniEnv;
  /** Per lane: hurdle positions (0..1 across, the runner at 0.15), speed, last jump start. */
  private hurdles: number[][] = [[], []];
  private speed = [0.32, 0.4];
  private jumpAt = [-1e9, -1e9];
  private nextAt = [0, 0];
  private held = 0;
  private started = false;
  private t0 = 0;
  private last = 0;
  private cleared = 0;
  private lost = 0;
  private hitAt = [-1e9, -1e9];
  private firstFrame = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.last = now;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (s === 0) return;
    if (!this.started) {
      this.started = true;
      this.t0 = ts;
      this.last = ts;
      this.nextAt = [ts + 600, ts + 1100];
      return;
    }
    const k = s < 0 ? 0 : 1;
    if (ts - this.jumpAt[k]! > JUMP_MS) {
      this.jumpAt[k] = ts;
      this.env.sound(k ? SND_TAP_R : SND_TAP_L);
    }
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  private air(k: number, now: number): number {
    const t = (now - this.jumpAt[k]!) / JUMP_MS;
    return t >= 0 && t <= 1 ? Math.sin(t * Math.PI) : 0;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    const len = scaled(RUNNERS_MS);
    if (this.started && (now - this.t0 >= len || this.lost >= RUNNER_LIVES)) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.started) {
      const t = (now - this.t0) / 1000;
      for (let k = 0; k < 2; k++) {
        this.speed[k] = (k ? 0.38 : 0.3) * (1 + t / 120);
        if (now >= this.nextAt[k]!) {
          this.hurdles[k]!.push(1.05);
          this.nextAt[k] = now + rnd(900, 2200) / (1 + t / 150);
        }
        const before = this.hurdles[k]!.map((x) => x);
        this.hurdles[k] = this.hurdles[k]!.map((x) => x - this.speed[k]! * dt);
        // A hurdle crossing the runner's spot: clear if in the air, else a stumble.
        this.hurdles[k] = this.hurdles[k]!.filter((x, i) => {
          const was = before[i]!;
          if (was > 0.15 && x <= 0.15) {
            if (this.air(k, now) > 0.35) {
              this.cleared++;
            } else {
              this.lost++;
              this.hitAt[k] = now;
              this.env.sound(SND_FALL);
              return false;
            }
          }
          return x > -0.05;
        });
      }
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'cleared', String(this.cleared), 'time', `${left} s`, RUNNER_LIVES - this.lost, RUNNER_LIVES);
    const W = Math.min(a.right - a.left, 760 * a.u);
    const x0 = a.cx - W / 2;
    const laneH = (a.bottom - a.top - 50 * a.u) / 2;
    for (let k = 0; k < 2; k++) {
      const ground = a.top + 10 * a.u + (k + 1) * laneH - 10 * a.u;
      ctx.fillStyle = COL_FAINT;
      ctx.fillRect(x0, ground, W, 2 * dpr);
      ctx.fillStyle = '#8a8a92';
      for (const x of this.hurdles[k]!) ctx.fillRect(x0 + x * W - 3 * a.u, ground - 26 * a.u, 6 * a.u, 26 * a.u);
      const rx = x0 + 0.15 * W;
      const ry = ground - 14 * a.u - this.air(k, now) * 60 * a.u;
      ctx.fillStyle = now - this.hitAt[k]! < 400 ? COL_ACCENT : COL_LINE;
      ctx.fillRect(rx - 8 * a.u, ry - 14 * a.u, 16 * a.u, 28 * a.u);
      ctx.fillStyle = COL_MID;
      v.text(k ? `right hand ${handLabel(this.env, 1)}` : `left hand ${handLabel(this.env, -1)}`, x0, ground - laneH + 30 * a.u, v.fontTiny, 'left');
    }
    ctx.fillStyle = COL_MID;
    if (!this.started) v.text('each hand jumps its own runner over its own hurdles. press either side to start', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: Math.max(0, this.cleared * 15 - this.lost * 20),
      primary: { label: 'hurdles cleared', value: this.cleared, unit: '' },
      lines: [
        { label: 'cleared', value: String(this.cleared) },
        { label: 'stumbles', value: String(this.lost) },
      ],
      saved: this.started && this.cleared + this.lost >= 3,
    };
  }
}

// --- Carry (continue the beat in silence) ----------------------------------------------

const CARRY_TRIALS = 16;
const CLICKS = 4;

class Carry implements Mini {
  private env!: MiniEnv;
  private trial = 0;
  private ioi = 600;
  private target = 8;
  private t0 = 0;
  /** 0 gap, 1 running, 2 feedback. */
  private state = 0;
  private at = 0;
  private visual = false;
  private errs: number[] = [];
  private signed: number[] = [];
  private last = 0;
  private held = 0;
  private firstAt = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.visual = env.muted || !env.soundAt;
    this.firstAt = now;
    this.at = now + 800;
  }

  private play(now: number): void {
    this.ioi = rint(450, 800);
    this.target = pick([6, 7, 8, 10]);
    this.t0 = now + 300;
    if (!this.visual) for (let k = 0; k < CLICKS; k++) this.env.soundAt!(SND_BEAT, 300 + k * this.ioi);
    this.state = 1;
  }

  private due(): number {
    return this.t0 + (this.target - 1) * this.ioi;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (this.state !== 1 || ts < this.t0 + (CLICKS - 0.5) * this.ioi) return;
    this.finish(ts - this.due(), ts);
  }

  private finish(err: number, now: number): void {
    this.last = err;
    this.errs.push(Math.abs(err) / this.ioi);
    this.signed.push(err / this.ioi);
    this.env.sound(Math.abs(err) < this.ioi * 0.06 ? SND_CATCH : SND_TAP_WEAK);
    this.trial++;
    this.state = 2;
    this.at = now + 1400;
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  pointer(_x: number, _y: number, ts: number): void {
    this.press(0, ts);
    this.release(0);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.at) this.play(now);
    if (this.state === 1 && now > this.due() + this.ioi * 1.5) this.finish(this.ioi * 1.5, now);
    if (this.state === 2 && now >= this.at) {
      if (this.trial >= scaled(CARRY_TRIALS)) return true;
      this.state = 0;
      this.at = now + 600;
    }
    if (now - this.firstAt > 600000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'typical miss', this.errs.length ? `${Math.round(median(this.errs) * 100)}% of a beat` : '–', 'run', `${Math.min(this.trial + 1, scaled(CARRY_TRIALS))} / ${scaled(CARRY_TRIALS)}`);
    const n = this.target;
    const gap = Math.min(46 * a.u, (a.right - a.left) / (n + 1));
    for (let k = 0; k < n; k++) {
      const x = a.cx + (k - (n - 1) / 2) * gap;
      const t = this.t0 + k * this.ioi;
      const heard = k < CLICKS;
      const lit = this.state === 1 && heard && now >= t && now < t + 120;
      ctx.fillStyle = k === n - 1 ? COL_ACCENT : lit ? COL_LINE : heard ? COL_MID : COL_DIM;
      ctx.beginPath();
      ctx.arc(x, a.cy - 20 * a.u, (lit ? 10 : k === n - 1 ? 8 : 5) * a.u, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = COL_LINE;
    v.text(this.state === 2 ? (this.last >= this.ioi * 1.5 ? 'no press' : `${this.last < 0 ? 'early' : 'late'} by ${ms(Math.abs(this.last))}`) : `${CLICKS} clicks, then keep counting: press on beat ${n}`, a.cx, a.cy + 40 * a.u, v.fontHud, 'center');
    ctx.fillStyle = COL_MID;
    if (this.trial === 0 && this.state !== 2) v.text(this.visual ? 'sound is off: the first beats flash instead' : 'press any key (or tap) on the orange beat, in silence', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const m = median(this.errs);
    const bias = mean(this.signed);
    return {
      score: this.errs.length ? Math.max(0, Math.round((0.4 - m) * 5000)) : 0,
      primary: { label: 'typical miss', value: Math.round(m * 100), unit: '% of a beat', lower: true },
      lines: [
        { label: 'typical miss', value: this.errs.length ? `${Math.round(m * 100)}% of a beat` : '–' },
        { label: 'tendency', value: this.signed.length ? (Math.abs(bias) < 0.03 ? 'on the beat' : `${bias < 0 ? 'rushes' : 'drags'} by ${Math.round(Math.abs(bias) * 100)}%`) : '–' },
      ],
      saved: this.errs.length >= 4,
    };
  }
}

export const BATCH65: MiniDef[] = [
  { id: 'glimpse', name: 'Glimpse', skill: 'attention', blurb: 'A word flashes and is masked. Type it. The flashes get shorter.', how: 'A word flashes for a moment, then a row of symbols covers it. Type the word and press Enter. Get it right and the next flash is shorter; miss and it lengthens. Twenty words; scored on the shortest flash you can still read. Needs a keyboard.', input: 'type', make: () => new Glimpse() },
  { id: 'warm', name: 'Warm', skill: 'speed', blurb: 'A colour: warm or cool? Later the word printed on it tries to mislead.', how: 'A colour appears: press left for warm (reds, oranges, yellows), right for cool (greens, blues, purples). After ten right, the word WARM or COOL is printed on the colour, and half the time it lies: go by the colour. Thirty seconds.', input: 'keys', minKeys: 2, make: () => new Warm() },
  { id: 'runners', name: 'Runners', skill: 'coordination', blurb: 'Two runners, one per hand. Jump each over its own hurdles.', how: 'Two lanes, two runners. The left hand jumps the top runner, the right hand the bottom one. Hurdles come at each at their own pace, so the hands must work apart. Both lanes speed up. Five stumbles, or ninety seconds.', input: 'keys', minKeys: 2, make: () => new Runners() },
  { id: 'carry', name: 'Carry', skill: 'timing', blurb: 'A few clicks set a beat, then silence. Press on the beat called for.', how: 'Four clicks set a beat, then they stop. Keep counting in your head and press on the beat shown in orange: the sixth, seventh, eighth or tenth. Scored as a share of a beat, with whether you tend to rush or drag. Sixteen runs.', input: 'both', make: () => new Carry() },
];
