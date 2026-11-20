// Twenty-second batch: two more games where you control something and the hidden skill is reaction.
//   Parry  (reaction) - a fencer attacks left or right. Block the real attacks; do not bite on feints.
//   Goalie (reaction) - penalties. Dive the way the ball goes, or hold still when it comes down the middle.

import { ANTICIPATION_MS, COL_ACCENT, COL_DIM, COL_FAINT, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALSE, SND_LURCH, SND_TAP_L, SND_TAP_R } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { TONE, ball, keeper } from './sprites.ts';
import { Stair, arena, footer, foreperiod, handLabel, header, mean, median, ms, pct, sideOf, type Mini, type MiniDef, type MiniEnv, type MiniResult, scaled } from './kit.ts';

const TAU = Math.PI * 2;

function ease(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);
}

// --- Parry -------------------------------------------------------------------------

const PARRY_ATTACKS = 32;
const FEINT_SHARE = 0.3;

class Parry implements Mini {
  private env!: MiniEnv;
  /** How long a real attack takes to land (ms). */
  private readonly travel = new Stair(700, 40, 260, 900, 2);
  private levels: number[] = [];
  private n = 0;
  private state = 0; // 0 guard, 1 attack, 2 outcome
  private at = 0;
  private side = 1;
  private feint = false;
  /** A feint turns back at this share of the way. */
  private turn = 0.5;
  private t0 = 0;
  private dur = 700;
  private outcome = '';
  private outcomeOk = true;
  private blockedAt = 0;
  private rts: number[] = [];
  private parried = 0;
  private hit = 0;
  private bit = 0;
  private resisted = 0;
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.guard(now + 600);
  }

  private guard(now: number): void {
    this.state = 0;
    this.at = now + foreperiod(700, 1000, 2200);
  }

  private attack(now: number): void {
    this.side = Math.random() < 0.5 ? -1 : 1;
    this.feint = this.n >= 3 && Math.random() < FEINT_SHARE;
    this.turn = 0.35 + Math.random() * 0.25;
    this.dur = this.travel.level;
    this.t0 = now;
    this.state = 1;
  }

  /** Share of the way the blade has gone (0 at the opponent, 1 at you). */
  private reach(now: number): number {
    const t = (now - this.t0) / this.dur;
    if (!this.feint) return ease(t);
    // A feint goes out like a real attack, then draws back.
    const out = t / this.turn;
    return out <= 1 ? ease(t) : Math.max(0, ease(this.turn) - (t - this.turn) * 2.2);
  }

  private finish(ok: boolean, text: string, now: number): void {
    this.outcome = text;
    this.outcomeOk = ok;
    this.state = 2;
    this.at = now + 650;
    this.n++;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (s === 0) return;
    if (this.state === 0) {
      // Lunging at nothing: the guard drops, counted like biting.
      this.bit++;
      this.env.sound(SND_FALSE);
      this.finish(false, 'too early', ts);
      return;
    }
    if (this.state !== 1) return;
    const rt = ts - this.t0;
    if (rt < ANTICIPATION_MS) return;
    if (this.feint) {
      this.bit++;
      this.env.sound(SND_FALSE);
      this.finish(false, 'you bit on the feint', ts);
      return;
    }
    if (s === this.side) {
      this.parried++;
      this.rts.push(rt);
      this.levels.push(this.dur);
      this.travel.update(true, -1);
      this.blockedAt = this.reach(ts);
      this.env.sound(s < 0 ? SND_TAP_L : SND_TAP_R);
      this.finish(true, `parried  ·  ${Math.round(rt)} ms`, ts);
    } else {
      this.hit++;
      this.levels.push(this.dur);
      this.travel.update(false, -1);
      this.env.sound(SND_LURCH);
      this.finish(false, 'wrong side', ts);
    }
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.at) this.attack(now);
    else if (this.state === 1) {
      const t = now - this.t0;
      if (!this.feint && t >= this.dur) {
        this.hit++;
        this.levels.push(this.dur);
        this.travel.update(false, -1);
        this.env.sound(SND_LURCH);
        this.finish(false, 'touché: too slow', now);
      } else if (this.feint && this.reach(now) <= 0 && t > this.dur * this.turn) {
        this.resisted++;
        this.env.sound(SND_CATCH);
        this.finish(true, 'feint: well held', now);
      }
    } else if (this.state === 2 && now >= this.at) {
      if (this.n >= scaled(PARRY_ATTACKS)) return true;
      this.guard(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'attack lands in', `${this.travel.level} ms`, 'attack', `${Math.min(this.n + 1, scaled(PARRY_ATTACKS))} / ${scaled(PARRY_ATTACKS)}`);
    const dpr = v.dpr;
    const top = a.top + 40 * a.u;
    const bot = a.bottom - 40 * a.u;
    const w = Math.min(200 * a.u, (a.right - a.left) / 2 - 40 * a.u);
    // The opponent: a head and shoulders at the top. You: a guard line at the bottom.
    ctx.strokeStyle = COL_MID;
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    ctx.arc(a.cx, top, 14 * a.u, 0, TAU);
    ctx.moveTo(a.cx - 40 * a.u, top + 34 * a.u);
    ctx.lineTo(a.cx + 40 * a.u, top + 34 * a.u);
    ctx.stroke();
    ctx.fillStyle = COL_FAINT;
    ctx.fillRect(a.cx - w - 30 * a.u, bot, (w + 30 * a.u) * 2, dpr);
    // Targets: left and right of your guard.
    for (const s of [-1, 1]) {
      ctx.strokeStyle = this.state === 1 && s === this.side ? COL_LINE : COL_DIM;
      ctx.lineWidth = dpr;
      ctx.beginPath();
      ctx.arc(a.cx + s * w, bot, 12 * a.u, Math.PI, TAU);
      ctx.stroke();
    }
    // The blade: from the opponent's shoulder toward the target on its side.
    let r = 0;
    if (this.state === 1) r = this.reach(now);
    else if (this.state === 2 && this.outcomeOk && !this.feint) r = this.blockedAt;
    else if (this.state === 2 && !this.outcomeOk && this.outcome !== 'too early') r = this.feint ? this.reach(now) : 1;
    if (this.state >= 1 && r > 0) {
      const x0 = a.cx + this.side * 40 * a.u;
      const y0 = top + 34 * a.u;
      const x1 = a.cx + this.side * w;
      const y1 = bot - 12 * a.u;
      const tipX = x0 + (x1 - x0) * r;
      const tipY = y0 + (y1 - y0) * r;
      const ang = Math.atan2(y1 - y0, x1 - x0);
      // Arm from the shoulder to the hilt, then the blade to the tip.
      const hilt = Math.max(0, Math.hypot(tipX - x0, tipY - y0) - 110 * a.u);
      const hx = x0 + Math.cos(ang) * hilt;
      const hy = y0 + Math.sin(ang) * hilt;
      ctx.strokeStyle = COL_MID;
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      const g = 9 * a.u;
      ctx.strokeStyle = this.state === 2 && !this.outcomeOk ? COL_ACCENT : COL_LINE;
      ctx.beginPath();
      ctx.moveTo(hx - Math.sin(ang) * g, hy + Math.cos(ang) * g);
      ctx.lineTo(hx + Math.sin(ang) * g, hy - Math.cos(ang) * g);
      ctx.stroke();
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();
    }
    if (this.state === 2) {
      ctx.fillStyle = this.outcomeOk ? COL_MID : COL_ACCENT;
      v.text(this.outcome, a.cx, a.cy + 10 * a.u, v.fontTiny, 'center');
      if (this.state === 2 && this.outcomeOk && !this.feint) {
        // A spark where the parry met the blade.
        ctx.strokeStyle = COL_LINE;
        ctx.lineWidth = dpr;
        const x = a.cx + this.side * (40 * a.u + (w - 40 * a.u) * this.blockedAt);
        const y = top + 34 * a.u + (bot - 12 * a.u - top - 34 * a.u) * this.blockedAt;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const t = (k / 6) * TAU;
          ctx.moveTo(x + Math.cos(t) * 5 * a.u, y + Math.sin(t) * 5 * a.u);
          ctx.lineTo(x + Math.cos(t) * 12 * a.u, y + Math.sin(t) * 12 * a.u);
        }
        ctx.stroke();
      }
    } else if (this.n === 0 && this.state === 0) {
      ctx.fillStyle = COL_MID;
      v.text('parry with the hand on the side of the attack. some are feints: hold', a.cx, a.cy + 10 * a.u, v.fontTiny, 'center');
    }
    ctx.fillStyle = COL_MID;
    v.text(handLabel(this.env, -1), a.cx - w, bot + 30 * a.u, v.fontTiny, 'center');
    v.text(handLabel(this.env, 1), a.cx + w, bot + 30 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const feints = this.resisted + this.bit;
    const fastest = mean(this.levels.slice(-10));
    return {
      score: this.parried >= 4 ? Math.max(0, Math.round(this.parried * 20 + this.resisted * 20 + (900 - fastest) * 0.8 - this.bit * 15)) : 0,
      primary: { label: 'fastest attack you parry', value: Math.round(fastest), unit: 'ms', lower: true },
      lines: [
        { label: 'parried', value: `${this.parried} of ${this.parried + this.hit}` },
        { label: 'feints held', value: feints ? `${this.resisted} of ${feints}  ·  ${pct(this.resisted / feints)}` : '–' },
        { label: 'median parry time', value: ms(median(this.rts)) },
      ],
      rts: this.rts,
      saved: this.parried >= 4,
    };
  }
}

// --- Goalie ------------------------------------------------------------------------

const GOALIE_SHOTS = 24;

class Goalie implements Mini {
  private env!: MiniEnv;
  /** Ball flight time from the spot to the line (ms). */
  private readonly flight = new Stair(900, 50, 330, 1100, 2);
  private levels: number[] = [];
  private n = 0;
  private state = 0; // 0 run-up, 1 ball in flight, 2 outcome
  private at = 0;
  private runFrom = 0;
  private dir = 0; // -1 left, 0 middle, 1 right
  private high = false;
  private t0 = 0;
  private dur = 900;
  /** Where the keeper went: -1, 0, 1, and when. */
  private dive = 0;
  private diveAt = 0;
  private saved = 0;
  private conceded = 0;
  private middleHeld = 0;
  private middleAll = 0;
  private rts: number[] = [];
  private outcome = '';
  private outcomeOk = true;
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.runUp(now + 500);
  }

  private runUp(now: number): void {
    this.state = 0;
    this.runFrom = now;
    this.at = now + foreperiod(900, 1300, 2200);
    this.dive = 0;
    this.diveAt = 0;
  }

  private kick(now: number): void {
    // A middle shot one time in five, so diving is not free.
    const r = Math.random();
    this.dir = r < 0.2 ? 0 : r < 0.6 ? -1 : 1;
    this.high = Math.random() < 0.5;
    this.dur = this.flight.level;
    this.t0 = now;
    this.state = 1;
  }

  private finish(ok: boolean, text: string, now: number): void {
    this.outcomeOk = ok;
    this.outcome = text;
    this.state = 2;
    this.at = now + 900;
    this.n++;
    this.levels.push(this.dur);
    this.flight.update(ok, -1);
    this.env.sound(ok ? SND_CATCH : SND_LURCH);
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (s === 0 || this.dive !== 0) return;
    if (this.state === 0) {
      // Guessing before the kick: you go, and the ball goes where it likes.
      this.dive = s;
      this.diveAt = ts;
      this.env.sound(SND_FALSE);
      return;
    }
    if (this.state !== 1) return;
    if (ts - this.t0 < ANTICIPATION_MS) return;
    this.dive = s;
    this.diveAt = ts;
    this.env.sound(s < 0 ? SND_TAP_L : SND_TAP_R);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.at) this.kick(now);
    else if (this.state === 1 && now - this.t0 >= this.dur) {
      const early = this.dive !== 0 && this.diveAt < this.t0;
      if (this.dir === 0) {
        this.middleAll++;
        if (this.dive === 0) {
          this.middleHeld++;
          this.saved++;
          this.finish(true, 'held your ground: saved', now);
        } else {
          this.conceded++;
          this.finish(false, 'it went down the middle', now);
        }
      } else if (this.dive === this.dir && !early) {
        // A dive in the last tenth of the flight is too late to reach a high corner.
        const rt = this.diveAt - this.t0;
        const late = this.high && rt > this.dur * 0.9;
        if (late) {
          this.conceded++;
          this.finish(false, `right way, too late  ·  ${Math.round(rt)} ms`, now);
        } else {
          this.saved++;
          this.rts.push(rt);
          this.finish(true, `saved  ·  ${Math.round(rt)} ms`, now);
        }
      } else {
        this.conceded++;
        this.finish(false, early ? 'you went before the kick' : this.dive === 0 ? 'too slow' : 'wrong way', now);
      }
    } else if (this.state === 2 && now >= this.at) {
      if (this.n >= scaled(GOALIE_SHOTS)) return true;
      this.runUp(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'saved', `${this.saved} / ${this.n}`, 'ball takes', `${this.flight.level} ms`);
    // The goal from behind the kicker: posts, bar, line.
    const gw = Math.min(300 * a.u, (a.right - a.left) / 2 - 20 * a.u);
    const gh = gw * 0.42;
    const gy = Math.max(a.top + 20 * a.u + gh, a.cy - 20 * a.u); // goal line
    ctx.strokeStyle = COL_LINE;
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.moveTo(a.cx - gw, gy);
    ctx.lineTo(a.cx - gw, gy - gh);
    ctx.lineTo(a.cx + gw, gy - gh);
    ctx.lineTo(a.cx + gw, gy);
    ctx.stroke();
    ctx.fillStyle = COL_FAINT;
    ctx.fillRect(a.cx - gw * 1.4, gy, gw * 2.8, dpr);
    // The net: a faint grid inside the frame.
    ctx.fillStyle = COL_FAINT;
    for (let i = 1; i < 12; i++) ctx.fillRect(a.cx - gw + (i * gw * 2) / 12, gy - gh, dpr, gh);
    for (let i = 1; i < 5; i++) ctx.fillRect(a.cx - gw, gy - gh + (i * gh) / 5, gw * 2, dpr);
    // The keeper: slides across and tips over with the dive.
    const since = this.dive !== 0 ? Math.max(0, now - this.diveAt) : 0;
    const go = this.dive !== 0 ? ease(since / 260) : 0;
    const kx = a.cx + this.dive * go * gw * 0.62;
    keeper(ctx, kx, gy, gh * 0.085, this.dive * go * 0.85, TONE.light);
    // The spot and the ball.
    const spotY = Math.min(a.bottom - 40 * a.u, gy + gh * 2.2);
    ctx.fillStyle = COL_DIM;
    ctx.fillRect(a.cx - 2 * dpr, spotY + 10 * a.u, 4 * dpr, 2 * dpr);
    let bx = a.cx;
    let by = spotY;
    let br = 9 * a.u;
    if (this.state >= 1) {
      const t = Math.min(1, (now - this.t0) / this.dur);
      const tx = a.cx + this.dir * gw * 0.72;
      const ty = this.high ? gy - gh * 0.78 : gy - gh * 0.18;
      bx = a.cx + (tx - a.cx) * t;
      by = spotY + (ty - spotY) * t;
      br = 9 * a.u * (1 - 0.5 * t);
    }
    ball(ctx, bx, by, br, this.state === 2 && !this.outcomeOk ? [COL_ACCENT, '#b8402a'] : TONE.light);
    // The kicker's run-up: a dot closing in on the ball.
    if (this.state === 0) {
      const p = Math.min(1, (now - this.runFrom) / Math.max(1, this.at - this.runFrom));
      ctx.fillStyle = COL_MID;
      ctx.beginPath();
      ctx.arc(a.cx - 60 * a.u * (1 - p) - 14 * a.u, spotY + 40 * a.u * (1 - p) + 6 * a.u, 6 * a.u, 0, TAU);
      ctx.fill();
    }
    if (this.state === 2) {
      ctx.fillStyle = this.outcomeOk ? COL_MID : COL_ACCENT;
      v.text(this.outcome, a.cx, gy + 40 * a.u, v.fontTiny, 'center');
    } else if (this.n === 0) {
      ctx.fillStyle = COL_MID;
      v.text('dive the way the ball goes. down the middle: stay put', a.cx, gy + 40 * a.u, v.fontTiny, 'center');
    }
    ctx.fillStyle = COL_MID;
    v.text(`${handLabel(this.env, -1)}  dive left`, a.cx - gw, a.bottom - 6 * a.u, v.fontTiny, 'center');
    v.text(`dive right  ${handLabel(this.env, 1)}`, a.cx + gw, a.bottom - 6 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const fastest = mean(this.levels.slice(-10));
    return {
      score: this.saved >= 4 ? Math.max(0, Math.round(this.saved * 25 + (1100 - fastest) * 0.6)) : 0,
      primary: { label: 'fastest shot you save', value: Math.round(fastest), unit: 'ms', lower: true },
      lines: [
        { label: 'saved', value: `${this.saved} of ${this.n}` },
        { label: 'held for the middle', value: this.middleAll ? `${this.middleHeld} of ${this.middleAll}` : '–' },
        { label: 'median dive time', value: ms(median(this.rts)) },
      ],
      rts: this.rts,
      saved: this.saved >= 4,
    };
  }
}

export const BATCH22: MiniDef[] = [
  {
    id: 'parry',
    name: 'Parry',
    skill: 'reaction',
    blurb: 'A fencer attacks left or right. Parry the real ones; hold on the feints.',
    how: 'The blade comes at your left or right: parry with that hand before it lands. About a third of the attacks are feints that draw back halfway: do nothing and you win the point, move and you bit. Parry well and the attacks get faster.',
    input: 'keys',
    minKeys: 2,
    make: () => new Parry(),
  },
  {
    id: 'goalie',
    name: 'Goalie',
    skill: 'reaction',
    blurb: 'Penalties. Dive the way the ball goes, or stay put when it comes down the middle.',
    how: 'The kicker runs up and shoots. Dive left or right with that hand as soon as you see where the ball is going. One shot in five goes down the middle: stay put for those. Going before the kick is a guess, and guesses lose. Save them and the shots get harder.',
    input: 'keys',
    minKeys: 2,
    make: () => new Goalie(),
  },
];
