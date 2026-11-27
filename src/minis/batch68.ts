// Sixty-eighth batch.
//   Shop    - a shopping list, then a shelf of items: pick out the ones that were on it.
//   Step    - lights blink together, except one that is a little out of step. Click it.
//   Cyclone - a light races round a ring: stop it on the marked spot.

import { COL_ACCENT, COL_DIM, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALSE, SND_TAP_WEAK } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, header, mean, median, ms, pct, scaled, shuffle, Stair, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const TAU = Math.PI * 2;
const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const rint = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
type Rect = [number, number, number, number];
const inside = (r: Rect, x: number, y: number) => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];

// --- Shop ------------------------------------------------------------------------------

const SHOP_ROUNDS = 8;
const GROCERIES = ['bread', 'milk', 'eggs', 'butter', 'cheese', 'apples', 'rice', 'pasta', 'onions', 'garlic', 'lemons', 'yogurt', 'honey', 'coffee', 'tea', 'flour', 'sugar', 'salt', 'beans', 'carrots', 'potatoes', 'tomatoes', 'spinach', 'cereal', 'jam', 'soap', 'oats', 'pepper', 'olives', 'grapes', 'peas', 'corn', 'tuna', 'nuts', 'juice', 'bananas', 'celery', 'ginger', 'cream', 'mustard'];

class Shop implements Mini {
  private env!: MiniEnv;
  private round = 0;
  private n = 4;
  private list: string[] = [];
  private shelf: string[] = [];
  private picked = new Set<number>();
  /** 0 reading the list, 1 picking, 2 feedback. */
  private state = 0;
  private at = 0;
  private boxes: Rect[] = [];
  private hits = 0;
  private falses = 0;
  private perfect = 0;
  private best = 0;
  private firstAt = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.firstAt = now;
    this.arm(now);
  }

  private arm(now: number): void {
    const all = shuffle([...GROCERIES]);
    this.list = all.slice(0, this.n);
    this.shelf = shuffle([...this.list, ...all.slice(this.n, this.n * 2)]);
    this.picked = new Set();
    this.state = 0;
    this.at = now + 1200 + this.n * 900;
  }

  press(): void {}

  typeKey(code: string, ts: number): boolean {
    if (this.state === 0 && (code === 'Space' || code === 'Enter')) {
      this.at = ts;
      return true;
    }
    return false;
  }

  pointer(x: number, y: number, ts: number): void {
    if (this.state === 0) return;
    if (this.state !== 1) return;
    const k = this.boxes.findIndex((r) => inside(r, x, y));
    if (k < 0) return;
    if (this.picked.has(k)) this.picked.delete(k);
    else this.picked.add(k);
    this.env.sound(SND_TAP_WEAK);
    if (this.picked.size === this.n) {
      let h = 0;
      for (const p of this.picked) if (this.list.includes(this.shelf[p]!)) h++;
      this.hits += h;
      this.falses += this.n - h;
      const ok = h === this.n;
      if (ok) {
        this.perfect++;
        this.best = Math.max(this.best, this.n);
        this.n = Math.min(10, this.n + 1);
      } else if (h < this.n - 1) this.n = Math.max(3, this.n - 1);
      this.env.sound(ok ? SND_CATCH : SND_FALSE);
      this.round++;
      this.state = 2;
      this.at = ts + 2000;
    }
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.at) this.state = 1;
    if (this.state === 2 && now >= this.at) {
      if (this.round >= scaled(SHOP_ROUNDS)) return true;
      this.arm(now);
    }
    if (now - this.firstAt > 900000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'items remembered', String(this.hits), 'list', `${Math.min(this.round + 1, scaled(SHOP_ROUNDS))} / ${scaled(SHOP_ROUNDS)}`);
    if (this.state === 0) {
      const rh = Math.min(34 * a.u, (a.bottom - a.top - 60 * a.u) / this.n);
      const top = a.cy - ((this.n - 1) * rh) / 2 - 10 * a.u;
      ctx.fillStyle = COL_LINE;
      this.list.forEach((w, k) => v.text(w, a.cx, top + k * rh, v.fontHud, 'center'));
      ctx.fillStyle = COL_MID;
      v.text(`the shopping list: remember all ${this.n} (Space when ready)`, a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    } else {
      const cols = 4;
      const rows = Math.ceil(this.shelf.length / cols);
      const bw = Math.min(150 * a.u, (a.right - a.left) / cols - 10 * a.u);
      const bh = Math.min(48 * a.u, (a.bottom - a.top - 50 * a.u) / rows - 8 * a.u);
      const x0 = a.cx - (cols * (bw + 10 * a.u)) / 2 + 5 * a.u;
      const y0 = a.cy - (rows * (bh + 8 * a.u)) / 2 - 10 * a.u;
      this.boxes = this.shelf.map((_, k) => [x0 + (k % cols) * (bw + 10 * a.u), y0 + Math.floor(k / cols) * (bh + 8 * a.u), bw, bh] as Rect);
      this.boxes.forEach(([x, y, w, h], k) => {
        const on = this.picked.has(k);
        const listed = this.list.includes(this.shelf[k]!);
        const show = this.state === 2;
        ctx.fillStyle = on ? '#2a2a30' : '#141418';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = show ? (listed ? COL_LINE : on ? COL_ACCENT : COL_DIM) : on ? COL_LINE : COL_DIM;
        ctx.lineWidth = (on || (show && listed) ? 2.5 : 1.5) * dpr;
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = show && !listed ? COL_DIM : COL_LINE;
        v.text(this.shelf[k]!, x + w / 2, y + h / 2 + 5 * dpr, v.fontTiny, 'center');
      });
      ctx.fillStyle = COL_MID;
      v.text(this.state === 1 ? `click the ${this.n} that were on the list (${this.picked.size} picked)` : '', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const tot = this.hits + this.falses;
    return {
      score: Math.max(0, this.hits * 25 - this.falses * 15 + this.best * 30),
      primary: { label: 'longest list remembered whole', value: this.best, unit: 'items' },
      lines: [
        { label: 'items remembered', value: tot ? `${this.hits} of ${tot}` : '–' },
        { label: 'lists remembered whole', value: String(this.perfect) },
        { label: 'accuracy', value: tot ? pct(this.hits / tot) : '–' },
      ],
      saved: this.round >= 2,
    };
  }
}

// --- Step (one light out of phase) -----------------------------------------------------

const STEP_TRIALS = 20;
const LIGHTS = 8;
const BLINK_HZ = 1.4;

class Step implements Mini {
  private env!: MiniEnv;
  /** How far out of step the odd light is (ms). */
  private readonly lag = new Stair(200, 15, 15, 300, 2);
  private levels: number[] = [];
  private trial = 0;
  private odd = 0;
  private t0 = 0;
  private state = 0; // 0 showing, 1 feedback
  private at = 0;
  private chosen = -1;
  private right = 0;
  private rts: number[] = [];
  private spots: [number, number][] = [];
  private hitR = 30;
  private lastOk = true;
  private firstAt = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.firstAt = now;
    this.arm(now);
  }

  private arm(now: number): void {
    this.odd = rint(0, LIGHTS - 1);
    this.t0 = now + rnd(0, 300);
    this.state = 0;
    this.chosen = -1;
  }

  private lit(k: number, now: number): boolean {
    const shift = k === this.odd ? this.lag.level : 0;
    const p = (((now - this.t0 - shift) / 1000) * BLINK_HZ) % 1;
    return p >= 0 && p < 0.45;
  }

  press(): void {}

  pointer(x: number, y: number, ts: number): void {
    if (this.state !== 0) return;
    const k = this.spots.findIndex(([sx, sy]) => Math.hypot(sx - x, sy - y) < this.hitR);
    if (k < 0) return;
    this.chosen = k;
    const ok = k === this.odd;
    this.lastOk = ok;
    this.levels.push(this.lag.level);
    this.lag.update(ok, -1);
    if (ok) {
      this.right++;
      this.rts.push(ts - this.t0);
    }
    this.env.sound(ok ? SND_CATCH : SND_FALSE);
    this.trial++;
    this.state = 1;
    this.at = ts + (ok ? 700 : 1400);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 1 && now >= this.at) {
      if (this.trial >= scaled(STEP_TRIALS)) return true;
      this.arm(now);
    }
    if (this.state === 0 && now - this.t0 > 15000) {
      this.levels.push(this.lag.level);
      this.lag.update(false, -1);
      this.lastOk = false;
      this.trial++;
      this.state = 1;
      this.at = now + 1400;
    }
    if (now - this.firstAt > 600000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'out of step by', `${this.lag.level} ms`, 'set', `${Math.min(this.trial + 1, scaled(STEP_TRIALS))} / ${scaled(STEP_TRIALS)}`);
    const R = Math.min((a.bottom - a.top) / 2 - 50 * a.u, 170 * a.u);
    const r = 22 * a.u;
    this.hitR = r * 1.5;
    this.spots = [];
    for (let k = 0; k < LIGHTS; k++) {
      const ang = -Math.PI / 2 + (k / LIGHTS) * TAU;
      const x = a.cx + Math.cos(ang) * R;
      const y = a.cy - 10 * a.u + Math.sin(ang) * R;
      this.spots.push([x, y]);
      const on = this.state === 0 && this.lit(k, now);
      ctx.fillStyle = on ? COL_LINE : '#1c1c20';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
      if (this.state === 1 && (k === this.odd || k === this.chosen)) {
        ctx.strokeStyle = k === this.odd ? COL_LINE : COL_ACCENT;
        ctx.lineWidth = 2.5 * dpr;
        ctx.beginPath();
        ctx.arc(x, y, r + 7 * dpr, 0, TAU);
        ctx.stroke();
      }
    }
    ctx.fillStyle = this.state === 1 && !this.lastOk ? COL_ACCENT : COL_MID;
    v.text(this.state === 1 && !this.lastOk ? 'the ringed light was the odd one' : 'all but one blink exactly together: click the one out of step', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const th = this.levels.length >= 8 ? median(this.levels.slice(-10)) : 0;
    return {
      score: th ? Math.max(0, Math.round((310 - th) * 8 + this.right * 5)) : 0,
      primary: { label: 'smallest lag you spot', value: th, unit: 'ms', lower: true },
      lines: [
        { label: 'threshold (last 10)', value: th ? ms(th) : '–' },
        { label: 'right', value: `${this.right} of ${this.trial}` },
        { label: 'typical time when right', value: this.rts.length ? ms(median(this.rts)) : '–' },
      ],
      saved: this.trial >= 6,
    };
  }
}

// --- Cyclone ---------------------------------------------------------------------------

const CYCLONE_TRIES = 20;
const LEDS = 30;

class Cyclone implements Mini {
  private env!: MiniEnv;
  private tries = 0;
  private target = 0;
  /** Laps a second, and where the light started. */
  private speed = 0.5;
  private phase = 0;
  private startAt = 0;
  private stopped = -1;
  private state = 0; // 0 running, 1 result
  private at = 0;
  private offs: number[] = [];
  private exact = 0;
  private held = 0;
  private firstAt = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.firstAt = now;
    this.arm(now);
  }

  private arm(now: number): void {
    this.target = rint(0, LEDS - 1);
    this.speed = 0.45 + this.tries * 0.035;
    this.phase = Math.random();
    this.startAt = now;
    this.stopped = -1;
    this.state = 0;
  }

  private led(now: number): number {
    const p = this.phase + ((now - this.startAt) / 1000) * this.speed;
    return Math.floor((p % 1) * LEDS);
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (this.state !== 0 || ts - this.startAt < 400) return;
    const at = this.led(ts);
    let d = at - this.target;
    if (d > LEDS / 2) d -= LEDS;
    if (d < -LEDS / 2) d += LEDS;
    this.stopped = at;
    this.offs.push(Math.abs(d));
    if (d === 0) this.exact++;
    this.env.sound(d === 0 ? SND_CATCH : Math.abs(d) <= 1 ? SND_TAP_WEAK : SND_FALSE);
    this.tries++;
    this.state = 1;
    this.at = ts + 1000;
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
      if (this.tries >= scaled(CYCLONE_TRIES)) return true;
      this.arm(now);
    }
    if (now - this.firstAt > 600000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'dead on', String(this.exact), 'try', `${Math.min(this.tries + 1, scaled(CYCLONE_TRIES))} / ${scaled(CYCLONE_TRIES)}`);
    const R = Math.min((a.bottom - a.top) / 2 - 40 * a.u, 190 * a.u);
    const cur = this.state === 0 ? this.led(now) : this.stopped;
    for (let k = 0; k < LEDS; k++) {
      const ang = -Math.PI / 2 + (k / LEDS) * TAU;
      const x = a.cx + Math.cos(ang) * R;
      const y = a.cy - 10 * a.u + Math.sin(ang) * R;
      const isT = k === this.target;
      ctx.fillStyle = k === cur ? (this.state === 1 ? (cur === this.target ? COL_LINE : COL_ACCENT) : COL_LINE) : isT ? '#3a3a41' : '#2a2a30';
      ctx.beginPath();
      ctx.arc(x, y, (isT ? 11 : 8) * a.u, 0, TAU);
      ctx.fill();
      if (isT) {
        ctx.strokeStyle = COL_ACCENT;
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        ctx.arc(x, y, 15 * a.u, 0, TAU);
        ctx.stroke();
      }
    }
    ctx.fillStyle = COL_MID;
    v.text(this.tries === 0 && this.state === 0 ? 'press any key (or tap) to stop the light on the ringed spot' : this.state === 1 ? (this.offs[this.offs.length - 1] === 0 ? 'dead on' : `${this.offs[this.offs.length - 1]} off`) : '', a.cx, a.cy - 10 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const m = mean(this.offs);
    return {
      score: this.offs.length ? Math.max(0, this.exact * 100 + Math.round((3 - m) * 100)) : 0,
      primary: { label: 'stopped dead on', value: this.exact, unit: `of ${this.offs.length}` },
      lines: [
        { label: 'dead on', value: `${this.exact} of ${this.offs.length}` },
        { label: 'average miss', value: this.offs.length ? `${m.toFixed(1)} lights` : '–' },
      ],
      saved: this.offs.length >= 4,
    };
  }
}

export const BATCH68: MiniDef[] = [
  { id: 'shop', name: 'Shop', skill: 'memory', blurb: 'A shopping list, then a shelf of items. Pick out the ones that were on it.', how: 'A shopping list appears: remember it (Space when ready). Then a shelf shows those items mixed with as many others. Click the ones that were on your list; once you have picked as many as the list had, it is marked. A whole list right and the next is longer. Eight lists.', input: 'pointer', make: () => new Shop() },
  { id: 'step', name: 'Step', skill: 'attention', blurb: 'Lights blink together, except one a little out of step. Click it.', how: 'Eight lights in a ring blink on and off together, all but one, which runs slightly behind. Click the odd one. Get it right and the next is closer in step; miss and it lags more. Twenty sets; scored on the smallest lag you can spot.', input: 'pointer', make: () => new Step() },
  { id: 'cyclone', name: 'Cyclone', skill: 'timing', blurb: 'A light races round a ring. Stop it on the marked spot.', how: 'A light runs round a ring of thirty. Press any key (or tap) to stop it on the ringed spot. It goes faster with every try, so you have to press well before it gets there. Twenty tries; scored on how many you stop dead on.', input: 'both', make: () => new Cyclone() },
];
