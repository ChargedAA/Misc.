// Seventy-first batch.
//   Source  - words appear in different colours: later, what colour was this one?
//   Sustain - over a steady beat, hold a key for exactly the number of beats asked.

import { COL_ACCENT, COL_DIM, COL_LINE, COL_MID } from '../config.ts';
import { SND_BEAT, SND_CATCH, SND_FALSE, SND_TAP_WEAK } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, header, mean, median, ms, pct, scaled, shuffle, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const rint = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]!;
type Rect = [number, number, number, number];
const inside = (r: Rect, x: number, y: number) => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
const digitOf = (code: string) => (code.startsWith('Digit') ? code.slice(5) : code.startsWith('Numpad') ? code.slice(6) : '');

// --- Source ----------------------------------------------------------------------------

const SOURCE_ROUNDS = 10;
const INKS = [COL_LINE, '#8a8a92', COL_ACCENT];
const INK_NAMES = ['white', 'grey', 'orange'];
const NOUNS = ['anchor', 'bridge', 'candle', 'dragon', 'engine', 'feather', 'garden', 'harbor', 'island', 'jacket', 'kettle', 'ladder', 'magnet', 'needle', 'orchard', 'pebble', 'rocket', 'saddle', 'tunnel', 'violin', 'walnut', 'zipper', 'basket', 'falcon', 'glacier', 'helmet', 'jungle', 'lantern', 'mirror', 'parrot', 'river', 'statue', 'tiger', 'valley', 'wagon', 'cactus', 'drum', 'quilt'];

class Source implements Mini {
  private env!: MiniEnv;
  private round = 0;
  private n = 4;
  private words: [string, number][] = [];
  private queue: [string, number][] = [];
  private ask: [string, number] = ['', 0];
  /** 0 showing, 1 asking, 2 feedback. */
  private state = 0;
  private at = 0;
  private boxes: Rect[] = [];
  private chosen = -1;
  private right = 0;
  private total = 0;
  private roundRight = 0;
  private firstAt = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.firstAt = now;
    this.arm(now);
  }

  private arm(now: number): void {
    const ws = shuffle([...NOUNS]);
    this.words = ws.slice(0, this.n).map((w) => [w, rint(0, 2)] as [string, number]);
    // Ask about three of them, and once in a while a word that was never shown (answer: new).
    const asks: [string, number][] = shuffle([...this.words]).slice(0, 3);
    if (Math.random() < 0.4) asks[rint(0, 2)] = [ws[this.n]!, 3];
    this.queue = asks;
    this.roundRight = 0;
    this.state = 0;
    this.at = now + 500;
  }

  private nextAsk(): void {
    this.ask = this.queue.shift()!;
    this.chosen = -1;
    this.state = 1;
  }

  press(): void {}

  private pick(k: number, ts: number): void {
    if (this.state !== 1) return;
    this.chosen = k;
    const ok = k === this.ask[1];
    this.total++;
    if (ok) {
      this.right++;
      this.roundRight++;
    }
    this.env.sound(ok ? SND_TAP_WEAK : SND_FALSE);
    this.state = 2;
    this.at = ts + (ok ? 500 : 1200);
  }

  typeKey(code: string, ts: number): boolean {
    const d = Number(digitOf(code));
    if (d >= 1 && d <= 4) {
      this.pick(d - 1, ts);
      return true;
    }
    return false;
  }

  pointer(x: number, y: number, ts: number): void {
    const k = this.boxes.findIndex((r) => inside(r, x, y));
    if (k >= 0) this.pick(k, ts);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const per = 1100;
    if (this.state === 0 && now >= this.at + this.words.length * per) this.nextAsk();
    if (this.state === 2 && now >= this.at) {
      if (this.queue.length) this.nextAsk();
      else {
        if (this.roundRight === 3) this.n = Math.min(10, this.n + 1);
        else if (this.roundRight <= 1) this.n = Math.max(3, this.n - 1);
        this.round++;
        if (this.round >= scaled(SOURCE_ROUNDS)) return true;
        this.arm(now);
      }
    }
    if (now - this.firstAt > 900000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'right', `${this.right} of ${this.total}`, 'list', `${Math.min(this.round + 1, scaled(SOURCE_ROUNDS))} / ${scaled(SOURCE_ROUNDS)}`);
    ctx.font = `600 ${Math.round(38 * a.u)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (this.state === 0) {
      const i = Math.floor((now - this.at) / per);
      const into = (now - this.at) % per;
      if (i >= 0 && i < this.words.length && into < per * 0.8) {
        const [w, c] = this.words[i]!;
        ctx.fillStyle = INKS[c]!;
        ctx.fillText(w, a.cx, a.cy - 20 * a.u);
      }
      ctx.fillStyle = COL_MID;
      v.text('remember each word and its colour', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    } else {
      ctx.fillStyle = COL_LINE;
      ctx.fillText(this.ask[0], a.cx, a.cy - 70 * a.u);
      const bw = Math.min(110 * a.u, (a.right - a.left) / 4 - 12 * a.u);
      const labels = [...INK_NAMES, 'not shown'];
      this.boxes = labels.map((_, k) => [a.cx + (k - 2) * (bw + 12 * a.u) + 6 * a.u, a.cy, bw, 50 * a.u] as Rect);
      this.boxes.forEach(([x, y, w, h], k) => {
        const show = this.state === 2;
        ctx.strokeStyle = show && k === this.ask[1] ? COL_LINE : show && k === this.chosen ? COL_ACCENT : COL_DIM;
        ctx.lineWidth = (show && (k === this.ask[1] || k === this.chosen) ? 2.5 : 1.5) * dpr;
        ctx.strokeRect(x, y, w, h);
        if (k < 3) {
          ctx.fillStyle = INKS[k]!;
          ctx.fillRect(x + 10 * dpr, y + h / 2 - 6 * dpr, 12 * dpr, 12 * dpr);
        }
        ctx.fillStyle = COL_LINE;
        v.text(labels[k]!, x + w / 2 + (k < 3 ? 8 * dpr : 0), y + h / 2 + 5 * dpr, v.fontTiny, 'center');
        ctx.fillStyle = COL_DIM;
        v.text(String(k + 1), x + 6 * dpr, y + 12 * dpr, v.fontTiny, 'left');
      });
      ctx.fillStyle = COL_MID;
      v.text('what colour was it? (1 to 4, or click)', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.right * 40 + this.n * 20,
      primary: { label: 'answered right', value: this.total ? Math.round((this.right / this.total) * 100) : 0, unit: '%' },
      lines: [
        { label: 'right', value: `${this.right} of ${this.total}` },
        { label: 'longest list reached', value: `${this.n} words` },
      ],
      saved: this.total >= 6,
    };
  }
}

// --- Sustain ---------------------------------------------------------------------------

const SUSTAIN_HOLDS = 16;

class Sustain implements Mini {
  private env!: MiniEnv;
  private ioi = 600;
  private t0 = 0;
  private scheduled = -1;
  private visual = false;
  private holds = 0;
  private beats = 3;
  private downAt = 0;
  private downBeat = 0;
  private holding = false;
  private relErr: number[] = [];
  private onErr: number[] = [];
  private last = '';
  private lastAt = 0;
  private held = 0;
  private firstAt = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.visual = env.muted || !env.soundAt;
    this.firstAt = now;
    this.ioi = rint(520, 700);
    this.t0 = now + 800;
    this.beats = pick([2, 3, 4]);
  }

  private beatOf(t: number): number {
    return Math.round((t - this.t0) / this.ioi);
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (this.holding || ts < this.t0 - 200) return;
    this.holding = true;
    this.downAt = ts;
    this.downBeat = this.beatOf(ts);
    this.onErr.push(Math.abs(ts - (this.t0 + this.downBeat * this.ioi)));
  }

  release(slot: number, ts?: number): void {
    this.held &= ~(1 << slot);
    if (!this.holding || this.held) return;
    this.holding = false;
    const t = ts ?? this.downAt;
    // A brief tap is not a hold: ignore it rather than score it.
    if (t - this.downAt < this.ioi * 0.5) {
      this.onErr.pop();
      this.last = 'that was a tap: hold the key down through the beats';
      this.lastAt = t;
      return;
    }
    const want = this.t0 + (this.downBeat + this.beats) * this.ioi;
    const e = t - want;
    this.relErr.push(Math.abs(e) / this.ioi);
    this.last = `held ${(((t - this.downAt) / this.ioi)).toFixed(2)} beats: ${e < 0 ? 'let go early' : 'let go late'} by ${ms(Math.abs(e))}`;
    this.lastAt = t;
    this.env.sound(Math.abs(e) < this.ioi * 0.06 ? SND_CATCH : SND_TAP_WEAK);
    this.holds++;
    this.beats = pick([2, 3, 4, 5].filter((b) => b !== this.beats));
  }

  pointer(_x: number, _y: number, ts: number): void {
    this.press(0, ts);
  }

  pointerUp(_x: number, _y: number, ts: number): void {
    this.release(0, ts);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.holds >= scaled(SUSTAIN_HOLDS) && now - this.lastAt > 800) return true;
    if (now - this.firstAt > 600000) return true;
    // Schedule the beat a little ahead on the audio clock, so it never wobbles with the frames.
    if (!this.visual) {
      const ahead = this.beatOf(now + 250);
      for (let b = Math.max(this.scheduled + 1, this.beatOf(now)); b <= ahead; b++) {
        const t = this.t0 + b * this.ioi;
        if (t >= now) this.env.soundAt!(SND_BEAT, t - now);
        this.scheduled = b;
      }
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'typical miss', this.relErr.length ? `${Math.round(median(this.relErr) * 100)}% of a beat` : '–', 'hold', `${Math.min(this.holds + 1, scaled(SUSTAIN_HOLDS))} / ${scaled(SUSTAIN_HOLDS)}`);
    const phase = (((now - this.t0) % this.ioi) + this.ioi) % this.ioi;
    const pulse = now >= this.t0 && phase < 90;
    ctx.fillStyle = pulse ? COL_LINE : '#1c1c20';
    ctx.beginPath();
    ctx.arc(a.cx, a.cy - 60 * a.u, (pulse ? 22 : 16) * a.u, 0, Math.PI * 2);
    ctx.fill();
    // Beat marks while holding: one lights per beat held.
    if (this.holding) {
      const held = (now - (this.t0 + this.downBeat * this.ioi)) / this.ioi;
      for (let k = 1; k <= Math.max(this.beats, Math.ceil(held)); k++) {
        ctx.fillStyle = k <= Math.floor(held + 0.02) ? (k > this.beats ? COL_ACCENT : COL_LINE) : COL_DIM;
        ctx.fillRect(a.cx + (k - 1 - (this.beats - 1) / 2) * 26 * a.u - 8 * a.u, a.cy, 16 * a.u, 6 * dpr);
      }
    }
    ctx.fillStyle = COL_LINE;
    v.text(`press on a beat, hold for ${this.beats} beats, let go on the beat`, a.cx, a.cy + 50 * a.u, v.fontHud, 'center');
    ctx.fillStyle = COL_MID;
    if (now - this.lastAt < 1600 && this.last) v.text(this.last, a.cx, a.cy + 84 * a.u, v.fontTiny, 'center');
    else if (this.holds === 0 && !this.holding) v.text(this.visual ? 'sound is off: follow the pulsing light' : 'any key, or hold the mouse button', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const m = median(this.relErr);
    return {
      score: this.relErr.length ? Math.max(0, Math.round((0.4 - m) * 5000)) : 0,
      primary: { label: 'typical release miss', value: Math.round(m * 100), unit: '% of a beat', lower: true },
      lines: [
        { label: 'release off by', value: this.relErr.length ? `${Math.round(m * 100)}% of a beat` : '–' },
        { label: 'press off the beat by', value: this.onErr.length ? ms(median(this.onErr)) : '–' },
        { label: 'within 6% of a beat', value: this.relErr.length ? pct(this.relErr.filter((e) => e < 0.06).length / this.relErr.length) : '–' },
        { label: 'average release miss', value: this.relErr.length ? `${Math.round(mean(this.relErr) * 100)}%` : '–' },
      ],
      saved: this.relErr.length >= 4,
    };
  }
}

export const BATCH71: MiniDef[] = [
  { id: 'source', name: 'Source', skill: 'memory', blurb: 'Words appear in different colours. Later: what colour was this one?', how: 'Words appear one at a time, each in white, grey or orange. Then three are asked about, one by one: pick the colour it was shown in, or “not shown” if it never appeared. All three right and the next list is longer. Ten lists.', input: 'pointer', make: () => new Source() },
  { id: 'sustain', name: 'Sustain', skill: 'timing', blurb: 'Over a steady beat, hold a key for exactly the number of beats asked.', how: 'A steady beat plays. Press any key on a beat, hold it for the number of beats shown (two to five), and let go exactly on the beat. Marks light up as the beats pass while you hold. Scored on how close each release lands to its beat. Sixteen holds. Best with sound.', input: 'both', make: () => new Sustain() },
];
