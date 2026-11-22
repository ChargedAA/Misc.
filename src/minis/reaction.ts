// Reaction games.
//   Snap  - simple reaction time: one signal, one press, nothing else.
//   Stop  - stop-signal task: press the arrow's side, unless it is struck out.
//   Flank - flanker task: answer the middle arrow, ignore its neighbours.

import { ANTICIPATION_MS, COL_ACCENT, COL_DIM, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALSE, SND_TAP_WEAK } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import {
  Stair,
  arena,
  bigNumber,
  footer,
  foreperiod,
  handLabel,
  header,
  mean,
  median,
  message,
  ms,
  pct,
  shuffle,
  sideOf,
  type Mini,
  type MiniDef,
  type MiniEnv,
  type MiniResult,
  gameNow,
  scaled,
} from './kit.ts';

const TAU = Math.PI * 2;

function sd(a: readonly number[]): number {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1));
}

// --- Snap -----------------------------------------------------------------------

const SNAP_TRIALS = 15;

class Snap implements Mini {
  private env!: MiniEnv;
  private state = 0; // 0 waiting, 1 signal, 2 feedback
  private goAt = 0;
  private drawnAt = 0;
  private until = 0;
  private rts: number[] = [];
  private early = 0;
  private last = 0;
  private lastEarly = false;
  private held = 0;
  private pos = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.arm(now + 600);
  }

  private arm(now: number): void {
    this.state = 0;
    this.drawnAt = 0;
    this.goAt = now + foreperiod(900, 1300, 4200);
    this.pos = Math.floor(Math.random() * 3) - 1;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    this.respond(ts);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  pointer(_x: number, _y: number, ts: number): void {
    this.respond(ts);
  }

  private respond(ts: number): void {
    if (this.state === 2) return;
    if (this.state === 0 || this.drawnAt === 0 || ts - this.drawnAt < ANTICIPATION_MS) {
      this.early++;
      this.lastEarly = true;
      this.env.sound(SND_FALSE);
      this.state = 2;
      this.until = ts + 800;
      return;
    }
    this.last = ts - this.drawnAt;
    this.lastEarly = false;
    this.rts.push(this.last);
    this.env.sound(SND_CATCH);
    this.state = 2;
    this.until = ts + 650;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.goAt) this.state = 1;
    if (this.state === 2 && now >= this.until) {
      if (this.rts.length >= scaled(SNAP_TRIALS) || this.early >= 25) return true;
      this.arm(now);
    }
    if (this.state === 1 && this.drawnAt > 0 && now - this.drawnAt > 2000) {
      // Missed entirely: count it as a slow one and move on.
      this.rts.push(2000);
      this.last = 2000;
      this.lastEarly = false;
      this.state = 2;
      this.until = now + 600;
    }

    v.clear();
    const a = arena(v, touch);
    const dpr = v.dpr;
    const ctx = v.ctx;
    header(v, touch, 'trial', `${Math.min(this.rts.length + 1, scaled(SNAP_TRIALS))} / ${scaled(SNAP_TRIALS)}`, 'median', this.rts.length ? ms(median(this.rts)) : '–');

    // The signal: a solid accent disc at one of three spots. Nothing moves before it.
    const r = 46 * a.u;
    const x = a.cx + this.pos * 150 * a.u;
    const y = a.cy - 30 * a.u;
    if (this.state === 1) {
      ctx.fillStyle = COL_ACCENT;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
      if (this.drawnAt === 0) this.drawnAt = gameNow();
    } else {
      // Resting: three faint outlines so the eyes have somewhere to wait.
      ctx.strokeStyle = COL_DIM;
      ctx.lineWidth = dpr;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.arc(a.cx + i * 150 * a.u, y, r, 0, TAU);
        ctx.stroke();
      }
    }
    if (this.state === 2) {
      if (this.lastEarly) message(v, { ...a, cy: y + r + 50 * a.u }, 'too early', 'wait for the disc', COL_MID);
      else bigNumber(v, a.cx, y + r + 70 * a.u, String(Math.round(this.last)), 'ms');
    } else if (this.rts.length === 0 && this.early === 0) {
      message(v, { ...a, cy: y + r + 50 * a.u }, 'press any key the moment a disc fills', '', COL_MID);
    }

    // Every result so far on a 150 to 450 ms strip.
    const sy = a.bottom - 30 * a.u;
    const half = Math.min(260 * a.u, (a.right - a.left) / 2);
    ctx.fillStyle = COL_DIM;
    ctx.fillRect(a.cx - half, sy, half * 2, dpr);
    for (const rt of this.rts) {
      const px = a.cx - half + ((Math.min(450, Math.max(150, rt)) - 150) / 300) * half * 2;
      ctx.fillStyle = rt === this.last ? COL_LINE : COL_MID;
      ctx.fillRect(px - dpr, sy - 8 * dpr, 2 * dpr, 8 * dpr);
    }
    ctx.fillStyle = COL_DIM;
    v.text('150', a.cx - half, sy + 16 * dpr, v.fontTiny, 'left');
    v.text('450 ms', a.cx + half, sy + 16 * dpr, v.fontTiny, 'right');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const rts = this.rts.filter((x) => x < 2000);
    const med = median(rts);
    return {
      score: rts.length ? Math.round(100000 / med) : 0,
      primary: { label: 'median', value: med, unit: 'ms', lower: true },
      lines: [
        { label: 'average', value: ms(mean(rts)) },
        { label: 'best', value: rts.length ? ms(Math.min(...rts)) : '–' },
        { label: 'spread (sd)', value: ms(sd(rts)) },
        { label: 'too early', value: String(this.early) },
      ],
      rts,
      saved: rts.length >= 5,
    };
  }
}

// --- Stop ------------------------------------------------------------------------

const STOP_TRIALS = 40;
const STOP_LIMIT = 1000;

class Stop implements Mini {
  private env!: MiniEnv;
  private plan: boolean[] = [];
  private i = 0;
  private state = 0; // 0 fixation, 1 arrow, 2 feedback
  private next = 0;
  private dir = 1;
  private stop = false;
  private signalled = false;
  private drawnAt = 0;
  private feedback = '';
  private good = true;
  private readonly ssd = new Stair(250, 50, 50, 1400, 1);
  private goRts: number[] = [];
  private goErrors = 0;
  private goMisses = 0;
  private stopOk = 0;
  private stopN = 0;
  private ssds: number[] = [];
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    // A quarter stop trials, never in the first four.
    const rest: boolean[] = [];
    for (let k = 0; k < scaled(STOP_TRIALS) - 4; k++) rest.push(k < scaled(STOP_TRIALS) / 4);
    this.plan = [false, false, false, false, ...shuffle(rest)];
    this.fix(now + 400);
  }

  private fix(now: number): void {
    this.state = 0;
    this.next = now + 500 + Math.random() * 400;
    this.drawnAt = 0;
    this.signalled = false;
    this.dir = Math.random() < 0.5 ? -1 : 1;
    this.stop = this.plan[this.i]!;
  }

  private end(now: number, text: string, good: boolean): void {
    this.feedback = text;
    this.good = good;
    this.state = 2;
    this.next = now + (good ? 380 : 900);
    this.i++;
    this.env.sound(good ? SND_TAP_WEAK : SND_FALSE);
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (this.state !== 1 || this.drawnAt === 0) return;
    const rt = ts - this.drawnAt;
    if (rt < ANTICIPATION_MS) return;
    if (this.stop) {
      this.stopN++;
      this.ssds.push(this.ssd.level);
      this.ssd.update(false);
      this.end(ts, 'should have stopped', false);
      return;
    }
    const oneKey = this.env.mode.right === 0;
    const side = sideOf(slot);
    if (!oneKey && side !== this.dir) {
      this.goErrors++;
      this.end(ts, side === 0 ? 'use the arrow keys of each hand' : 'other side', false);
      return;
    }
    this.goRts.push(rt);
    this.end(ts, '', true);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.next) {
      this.state = 1;
      this.next = 0;
    }
    if (this.state === 1 && this.drawnAt > 0) {
      const t = now - this.drawnAt;
      if (this.stop && !this.signalled && t >= this.ssd.level) this.signalled = true;
      if (t > STOP_LIMIT) {
        if (this.stop) {
          this.stopN++;
          this.stopOk++;
          this.ssds.push(this.ssd.level);
          this.ssd.update(true);
          this.end(now, 'stopped', true);
          this.env.sound(SND_CATCH);
        } else {
          this.goMisses++;
          this.end(now, 'too slow', false);
        }
      }
    }
    if (this.state === 2 && now >= this.next) {
      if (this.i >= scaled(STOP_TRIALS)) return true;
      this.fix(now);
    }

    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'trial', `${Math.min(this.i + 1, scaled(STOP_TRIALS))} / ${scaled(STOP_TRIALS)}`, 'stop delay', ms(this.ssd.level));
    const r = 54 * a.u;
    if (this.state === 0) {
      ctx.fillStyle = COL_MID;
      ctx.fillRect(a.cx - 2 * dpr, a.cy - 2 * dpr, 4 * dpr, 4 * dpr);
    } else if (this.state === 1) {
      ctx.strokeStyle = this.signalled ? COL_MID : COL_LINE;
      ctx.lineWidth = 4 * dpr;
      v.arrow(a.cx, a.cy, r, this.dir);
      if (this.signalled) {
        // The stop signal: the arrow greys out and a bar strikes through it.
        ctx.strokeStyle = COL_ACCENT;
        ctx.lineWidth = 5 * dpr;
        ctx.beginPath();
        ctx.moveTo(a.cx - r * 1.3, a.cy + r * 0.9);
        ctx.lineTo(a.cx + r * 1.3, a.cy - r * 0.9);
        ctx.stroke();
      }
      if (this.drawnAt === 0) this.drawnAt = gameNow();
    } else if (this.feedback) {
      message(v, a, this.feedback, '', this.good ? COL_LINE : COL_MID);
    }
    if (this.i < 3) {
      const oneKey = this.env.mode.right === 0;
      const how = oneKey ? 'press when an arrow appears' : `arrow left: ${handLabel(this.env, -1)}   arrow right: ${handLabel(this.env, 1)}`;
      ctx.fillStyle = COL_MID;
      v.text(how, a.cx, a.bottom - 34 * dpr, v.fontTiny, 'center');
      v.text('if it gets struck out, do not press', a.cx, a.bottom - 16 * dpr, v.fontTiny, 'center');
    }
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const goMed = median(this.goRts);
    const meanSsd = mean(this.ssds);
    // Integration-lite estimate: median go time minus the average stop delay.
    const ssrt = this.goRts.length && this.ssds.length ? Math.max(0, goMed - meanSsd) : 0;
    const stopRate = this.stopN ? this.stopOk / this.stopN : 0;
    return {
      score: ssrt > 0 ? Math.round(Math.max(0, 1000 - ssrt) * (0.5 + stopRate / 2)) : 0,
      primary: { label: 'stop time (SSRT)', value: ssrt, unit: 'ms', lower: true },
      lines: [
        { label: 'go median', value: ms(goMed) },
        { label: 'stops held', value: `${this.stopOk} of ${this.stopN} (${pct(stopRate)})` },
        { label: 'average stop delay', value: ms(meanSsd) },
        { label: 'wrong side / too slow', value: `${this.goErrors} / ${this.goMisses}` },
      ],
      rts: this.goRts,
      saved: this.i >= 12,
    };
  }
}

// --- Flank ------------------------------------------------------------------------

const FLANK_TRIALS = 40;

class Flank implements Mini {
  private env!: MiniEnv;
  private i = 0;
  private state = 0;
  private next = 0;
  private dir = 1;
  private congruent = true;
  private drawnAt = 0;
  private readonly win = new Stair(1300, 70, 250, 1600);
  private con: number[] = [];
  private inc: number[] = [];
  private errors = 0;
  private slow = 0;
  private streak = 0;
  private best = 0;
  private score = 0;
  private feedback = '';
  private held = 0;
  private oneKey = false;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.oneKey = env.mode.right === 0;
    this.arm(now + 500);
  }

  private arm(now: number): void {
    this.state = 0;
    this.next = now + 350 + Math.random() * 350;
    this.drawnAt = 0;
    this.dir = Math.random() < 0.5 ? -1 : 1;
    this.congruent = Math.random() < 0.5;
  }

  private end(now: number, ok: boolean, rt: number, text: string): void {
    this.i++;
    this.state = 2;
    this.feedback = text;
    this.next = now + (ok ? 160 : 700);
    this.win.update(ok, -1);
    if (ok) {
      this.streak++;
      if (this.streak > this.best) this.best = this.streak;
      if (rt > 0) (this.congruent ? this.con : this.inc).push(rt);
      this.score += 10 + Math.min(20, this.streak) + (rt > 0 ? Math.max(0, Math.round((this.win.level - rt) / 20)) : 0);
      this.env.sound(SND_TAP_WEAK);
    } else {
      this.streak = 0;
      this.env.sound(SND_FALSE);
    }
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (this.state !== 1 || this.drawnAt === 0) return;
    const rt = ts - this.drawnAt;
    if (rt < ANTICIPATION_MS) return;
    if (this.oneKey) {
      // One key: press only when the middle arrow points right.
      if (this.dir > 0) this.end(ts, true, rt, '');
      else {
        this.errors++;
        this.end(ts, false, 0, 'it pointed left: hold');
      }
      return;
    }
    const side = sideOf(slot);
    if (side === this.dir) this.end(ts, true, rt, '');
    else {
      this.errors++;
      this.end(ts, false, 0, 'the middle one');
    }
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.next) this.state = 1;
    if (this.state === 1 && this.drawnAt > 0 && now - this.drawnAt > this.win.level) {
      if (this.oneKey && this.dir < 0) this.end(now, true, 0, '');
      else {
        this.slow++;
        this.end(now, false, 0, 'too slow');
      }
    }
    if (this.state === 2 && now >= this.next) {
      if (this.i >= scaled(FLANK_TRIALS)) return true;
      this.arm(now);
    }

    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'score', String(this.score), 'window', ms(this.win.level));
    if (this.state === 1) {
      const gap = Math.min(80 * a.u, (a.right - a.left) / 5.5);
      const r = gap * 0.36;
      for (let k = -2; k <= 2; k++) {
        const d = k === 0 || this.congruent ? this.dir : -this.dir;
        ctx.strokeStyle = k === 0 ? COL_LINE : COL_MID;
        ctx.lineWidth = (k === 0 ? 3.5 : 2.5) * dpr;
        v.arrow(a.cx + k * gap, a.cy, r, d);
      }
      if (this.drawnAt === 0) this.drawnAt = gameNow();
    } else if (this.state === 2 && this.feedback) {
      message(v, a, this.feedback, '', COL_MID);
    } else {
      ctx.fillStyle = COL_DIM;
      ctx.fillRect(a.cx - 2 * dpr, a.cy - 2 * dpr, 4 * dpr, 4 * dpr);
    }
    if (this.streak >= 5) {
      ctx.fillStyle = COL_MID;
      v.text(`streak ${this.streak}`, a.cx, a.cy - 70 * a.u, v.fontTiny, 'center');
    }
    if (this.i < 3) {
      ctx.fillStyle = COL_MID;
      const how = this.oneKey
        ? 'press only when the MIDDLE arrow points right'
        : `answer the MIDDLE arrow: left ${handLabel(this.env, -1)}, right ${handLabel(this.env, 1)}`;
      v.text(how, a.cx, a.bottom - 16 * dpr, v.fontTiny, 'center');
    }
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const cm = median(this.con);
    const im = median(this.inc);
    const all = [...this.con, ...this.inc];
    const done = this.i || 1;
    return {
      score: this.score,
      primary: { label: 'median', value: median(all), unit: 'ms', lower: true },
      lines: [
        { label: 'score', value: String(this.score) },
        { label: 'neighbours agree', value: ms(cm) },
        { label: 'neighbours disagree', value: ms(im) },
        { label: 'distraction cost', value: this.con.length && this.inc.length ? ms(im - cm) : '–' },
        { label: 'correct', value: pct((done - this.errors - this.slow) / done) },
        { label: 'best streak', value: String(this.best) },
      ],
      rts: all,
      saved: this.i >= 10,
    };
  }
}

export const REACTION: MiniDef[] = [
  {
    id: 'snap',
    name: 'Snap',
    skill: 'reaction',
    blurb: 'Pure reaction time. One disc, one press.',
    how: 'Wait. When a disc fills orange, press any key (or tap) as fast as you can. Fifteen trials. Pressing before it appears counts as too early.',
    input: 'both',
    make: () => new Snap(),
  },
  {
    id: 'stop',
    name: 'Stop',
    skill: 'reaction',
    blurb: 'Press fast, unless it gets struck out.',
    how: 'Press the side the arrow points to. Sometimes an orange bar strikes it out a moment later: then do not press. The delay adapts so stopping stays hard. Measures how fast you can cancel a press.',
    input: 'keys',
    make: () => new Stop(),
  },
  {
    id: 'flank',
    name: 'Flank',
    skill: 'reaction',
    blurb: 'Answer the middle arrow. Ignore the crowd.',
    how: 'Five arrows appear. Press the side the MIDDLE one points to; the others sometimes disagree. The time window tightens as you get them right.',
    input: 'keys',
    make: () => new Flank(),
  },
];
