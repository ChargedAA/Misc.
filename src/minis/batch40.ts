// Fortieth batch.
//   Dictate - hear a bar of rhythm, then pick its notation from four.

import { COL_ACCENT, COL_DIM, COL_LINE, COL_MID } from '../config.ts';
import { SND_BEAT, SND_BEAT_UP, SND_CATCH, SND_FALSE, SND_TONE } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, header, median, ms, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';
import { compose, drawRhythm, type Placed } from './batch30.ts';

type Rect = [number, number, number, number];
const inside = (r: Rect, x: number, y: number) => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
const rint = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));

/** Where the notes sound, which is all a listener can tell apart. */
const onsetKey = (b: Placed[]) =>
  b
    .filter((s) => !s.rest)
    .map((s) => Math.round(s.at * 12))
    .join(',');

class Dictate implements Mini {
  private env!: MiniEnv;
  private level = 1;
  private best = 0;
  private lives = 3;
  private passes = 0;
  private opts: Placed[][] = [];
  private answer = 0;
  private bpm = 80;
  private state = 0; // 0 playing, 1 answering, 2 feedback
  private at = 0;
  private playEnd = 0;
  private chosen = -1;
  private boxes: Rect[] = [];
  private right = 0;
  private rounds = 0;
  private rts: number[] = [];
  private exact = false;
  private fired: { t: number; id: number; done: boolean }[] = [];

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.exact = !!env.soundAt && !env.muted;
    this.make(now + 700, now);
  }

  private tier(): number {
    return Math.min(6, Math.ceil(this.level / 2));
  }

  private make(at: number, now: number): void {
    const t = this.tier();
    const good = compose(t, 1);
    const seen = new Set([onsetKey(good)]);
    const bad: Placed[][] = [];
    // Wrong bars that sound different but look alike: most share the same opening.
    let guard = 0;
    while (bad.length < 3 && guard++ < 400) {
      const b = compose(t, 1);
      const k = onsetKey(b);
      if (seen.has(k)) continue;
      seen.add(k);
      bad.push(b);
    }
    this.answer = rint(0, 3);
    this.opts = [...bad];
    this.opts.splice(this.answer, 0, good);
    this.bpm = Math.min(120, 72 + this.level * 3);
    this.chosen = -1;
    this.state = 0;
    this.at = at;
    this.schedule(at, now);
  }

  /** A count of four, then the bar twice, all on the audio clock when it can be. */
  private schedule(at: number, now: number): void {
    const beat = 60000 / this.bpm;
    const good = this.opts[this.answer]!;
    this.fired = [];
    const add = (t: number, id: number) => {
      if (this.exact) this.env.soundAt!(id, at - now + t);
      else this.fired.push({ t: at + t, id, done: false });
    };
    for (let k = 0; k < 4; k++) add(k * beat, k === 0 ? SND_BEAT_UP : SND_BEAT);
    for (let rep = 0; rep < 2; rep++) {
      const base = (4 + rep * 5) * beat;
      for (let k = 0; k < 4; k++) add(base + k * beat, SND_BEAT);
      for (const s of good) if (!s.rest) add(base + s.at * beat, SND_TONE + 4);
    }
    this.playEnd = at + 13 * beat;
  }

  press(): void {}

  private pick(k: number, ts: number): void {
    if (this.state === 2 || k >= this.opts.length) return;
    this.chosen = k;
    this.rounds++;
    const ok = k === this.answer;
    if (ok) {
      this.right++;
      this.passes++;
      this.rts.push(ts - this.playEnd);
      this.best = Math.max(this.best, this.level);
      if (this.passes % 2 === 0) this.level++;
      this.env.sound(SND_CATCH);
    } else {
      this.lives--;
      this.env.sound(SND_FALSE);
    }
    this.state = 2;
    this.at = ts + (ok ? 900 : 2200);
  }

  typeKey(code: string, ts: number, _key?: string): boolean {
    const d = code.startsWith('Digit') ? Number(code.slice(5)) : code.startsWith('Numpad') ? Number(code.slice(6)) : NaN;
    if (d >= 1 && d <= 4) {
      this.pick(d - 1, ts);
      return true;
    }
    if (code === 'KeyR' && this.state === 1) {
      this.state = 0;
      this.schedule(ts + 300, ts);
      return true;
    }
    return false;
  }

  pointer(x: number, y: number, ts: number): void {
    const k = this.boxes.findIndex((r) => inside(r, x, y));
    if (k >= 0) this.pick(k, ts);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    for (const f of this.fired) {
      if (!f.done && now >= f.t) {
        f.done = true;
        this.env.sound(f.id);
      }
    }
    if (this.state === 0 && now >= this.playEnd) this.state = 1;
    if (this.state === 2 && now >= this.at) {
      if (this.lives <= 0) return true;
      this.make(now + 500, now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'level', String(this.level), 'right', String(this.right), this.lives);
    // Four bars in a two-by-two grid, numbered.
    const cw = (a.right - a.left) / 2 - 20 * a.u;
    const chh = (a.bottom - a.top - 40 * a.u) / 2;
    this.boxes = [0, 1, 2, 3].map((k) => [a.left + (k % 2) * (cw + 40 * a.u), a.top + 10 * a.u + Math.floor(k / 2) * chh, cw, chh - 10 * a.u] as Rect);
    this.opts.forEach((b, k) => {
      const [x, y, w, h] = this.boxes[k]!;
      const show = this.state === 2;
      ctx.strokeStyle = show && k === this.answer ? COL_LINE : show && k === this.chosen ? COL_ACCENT : '#26262b';
      ctx.lineWidth = (show && (k === this.answer || k === this.chosen) ? 2.5 : 1.5) * dpr;
      ctx.strokeRect(x, y, w, h);
      const sy = y + h * 0.62;
      const x0 = x + 30 * a.u;
      const x1 = x + w - 16 * a.u;
      ctx.fillStyle = COL_MID;
      ctx.fillRect(x0 - 10 * a.u, sy, x1 - x0 + 20 * a.u, dpr);
      ctx.fillRect(x0 - 10 * a.u, sy - 14 * a.u, dpr, 28 * a.u);
      ctx.fillRect(x1 + 10 * a.u, sy - 14 * a.u, 2 * dpr, 28 * a.u);
      const beatW = (x1 - x0) / 4.2;
      const su = Math.max(0.65, Math.min(1.2, beatW / (70 * dpr))) * dpr;
      drawRhythm(v, b, (t) => x0 + (t + 0.1) * beatW, sy, su);
      ctx.fillStyle = COL_DIM;
      v.text(String(k + 1), x + 12 * a.u, y + 18 * a.u, v.fontTiny, 'left');
    });
    ctx.fillStyle = COL_MID;
    v.text(this.state === 0 ? 'listen: the bar plays twice after a count of four' : this.state === 1 ? 'which bar did you hear? (1 to 4, or tap; R plays it again)' : this.chosen === this.answer ? 'right' : `it was ${this.answer + 1}`, a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    if (this.env.muted) {
      ctx.fillStyle = COL_ACCENT;
      v.text('needs sound on', a.cx, a.top, v.fontTiny, 'center');
    }
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.best * 100 + this.right * 10,
      primary: { label: 'level', value: this.best, unit: '' },
      lines: [
        { label: 'highest level heard right', value: String(this.best) },
        { label: 'right', value: `${this.right} of ${this.rounds}` },
        { label: 'typical time to choose', value: this.rts.length ? ms(median(this.rts)) : '–' },
      ],
      saved: this.rounds >= 1,
    };
  }
}

export const BATCH40: MiniDef[] = [
  { id: 'dictate', name: 'Dictate', skill: 'ear', blurb: 'Hear a bar of rhythm, then pick its notation from four.', how: 'After a count of four, a bar of rhythm plays twice over a click. Four bars of notation are shown: pick the one you heard (1 to 4, or tap); R plays it again. The mirror image of Sight. It starts with quarters and halves and moves on to eighths, dotted notes, syncopation, sixteenths and triplets. Three wrong ends it. Needs sound on.', input: 'pointer', make: () => new Dictate() },
];
