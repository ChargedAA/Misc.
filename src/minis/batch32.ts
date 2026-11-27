// Thirty-second batch.
//   Ink    - Stroop: a colour word in a different ink. Name the ink, not the word.
//   Notes  - notes fall down your lanes to a beat; hit each as it lands.
//   Jumble - an anagram: type the word.
//   Pop    - targets appear and shrink away; click them before they vanish.
//   Hue    - a colour shows, then hides. Find it on the colour wheel.

import { COL_ACCENT, COL_DIM, COL_FAINT, COL_LINE, COL_MID } from '../config.ts';
import { SND_BEAT, SND_CATCH, SND_FALSE, SND_MISS, SND_TAP_WEAK, SND_TONE } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, header, mean, median, message, ms, pct, scaled, shown, slotsOf, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';
import { ENGLISH_5K } from './words.ts';
import { VALID_WORDS } from './words-valid.ts';

const TAU = Math.PI * 2;
const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]!;
type Rect = [number, number, number, number];
const inside = (r: Rect, x: number, y: number) => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];

// --- Ink (Stroop) --------------------------------------------------------------------

/** Four inks that stay apart for red-green colour blindness too: brightness and blue-yellow carry them. */
const INKS = [
  { name: 'WHITE', col: '#f2f2f2', key: 'KeyW', n: 'W' },
  { name: 'YELLOW', col: '#f0e442', key: 'KeyY', n: 'Y' },
  { name: 'BLUE', col: '#3d8bff', key: 'KeyB', n: 'B' },
  { name: 'PINK', col: '#e07fc0', key: 'KeyP', n: 'P' },
];
const INK_TRIALS = 40;

class Ink implements Mini {
  private env!: MiniEnv;
  private i = 0;
  private word = 0;
  private ink = 0;
  private at = 0;
  private state = 0; // 0 waiting, 1 showing, 2 feedback
  private next = 0;
  private same: number[] = [];
  private diff: number[] = [];
  private errs = 0;
  private slow = 0;
  private last: 'ok' | 'wrong' | 'slow' = 'ok';
  private rts: number[] = [];
  private buttons: Rect[] = [];

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.next = now + 700;
  }

  press(): void {}

  private answer(k: number, ts: number): void {
    if (this.state !== 1) return;
    const rt = ts - this.at;
    if (k === this.ink) {
      (this.word === this.ink ? this.same : this.diff).push(rt);
      this.rts.push(rt);
      this.last = 'ok';
      this.env.sound(SND_TAP_WEAK);
    } else {
      this.errs++;
      this.last = 'wrong';
      this.env.sound(SND_FALSE);
    }
    this.i++;
    this.state = 2;
    this.next = ts + (this.last === 'ok' ? 250 : 700);
  }

  typeKey(code: string, ts: number): boolean {
    const k = INKS.findIndex((c) => c.key === code);
    const d = code.startsWith('Digit') ? Number(code.slice(5)) - 1 : -1;
    const a = k >= 0 ? k : d >= 0 && d < 4 ? d : -1;
    if (a < 0) return false;
    this.answer(a, ts);
    return true;
  }

  pointer(x: number, y: number, ts: number): void {
    const k = this.buttons.findIndex((r) => inside(r, x, y));
    if (k >= 0) this.answer(k, ts);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state !== 1 && now >= this.next) {
      if (this.i >= scaled(INK_TRIALS)) return true;
      // Two in three trials clash: the word names another colour.
      this.ink = Math.floor(Math.random() * 4);
      this.word = Math.random() < 0.34 ? this.ink : (this.ink + 1 + Math.floor(Math.random() * 3)) % 4;
      this.state = 1;
      this.at = now;
    }
    if (this.state === 1 && now - this.at > 2500) {
      this.slow++;
      this.i++;
      this.last = 'slow';
      this.state = 2;
      this.next = now + 600;
      this.env.sound(SND_FALSE);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'typical', this.rts.length ? ms(median(this.rts.slice(-8))) : '–', 'word', `${Math.min(this.i + 1, scaled(INK_TRIALS))} / ${scaled(INK_TRIALS)}`);
    if (this.state === 1) {
      ctx.fillStyle = INKS[this.ink]!.col;
      ctx.font = `700 ${Math.round(64 * a.u)}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(INKS[this.word]!.name, a.cx, a.cy - 40 * a.u);
    } else if (this.state === 2 && this.last !== 'ok') {
      ctx.fillStyle = COL_MID;
      v.text(this.last === 'slow' ? 'too slow' : `the ink was ${INKS[this.ink]!.name.toLowerCase()}`, a.cx, a.cy - 40 * a.u, v.fontTiny, 'center');
    }
    // Answer buttons: the ink colours, with their keys.
    const bw = Math.min(110 * a.u, (a.right - a.left - 30 * a.u) / 4);
    const bh = 46 * a.u;
    const y = a.bottom - bh - 20 * a.u;
    this.buttons = INKS.map((_, k) => [a.cx + (k - 2) * (bw + 10 * a.u) + 5 * a.u, y, bw, bh] as Rect);
    INKS.forEach((c, k) => {
      const [x, yy, w, h] = this.buttons[k]!;
      ctx.fillStyle = c.col;
      ctx.fillRect(x, yy, w, h);
      ctx.fillStyle = '#0a0a0b';
      v.text(`${c.n}  ·  ${k + 1}`, x + w / 2, yy + h / 2 + 5 * dpr, v.fontTiny, 'center');
    });
    if (this.i < 2) {
      ctx.fillStyle = COL_MID;
      v.text('name the colour of the ink, not the word', a.cx, a.cy + 30 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const all = this.rts;
    const effect = this.same.length >= 3 && this.diff.length >= 3 ? median(this.diff) - median(this.same) : NaN;
    const med = median(all);
    return {
      score: all.length ? Math.round(Math.max(0, 1500 - med) * (all.length / Math.max(1, this.i))) : 0,
      primary: { label: 'typical answer', value: med, unit: 'ms', lower: true },
      lines: [
        { label: 'when word and ink clash', value: this.diff.length ? ms(median(this.diff)) : '–' },
        { label: 'when they match', value: this.same.length ? ms(median(this.same)) : '–' },
        { label: 'the Stroop effect (the cost of the clash)', value: Number.isFinite(effect) ? `${Math.round(effect)} ms` : '–' },
        { label: 'mistakes', value: `${this.errs} wrong, ${this.slow} too slow` },
      ],
      rts: all,
      saved: this.i >= 8,
    };
  }
}

// --- Notes (falling-note rhythm) -------------------------------------------------------

interface Note {
  lane: number;
  t: number;
  judged: boolean;
  grade: number; // 0 miss, 1 ok, 2 good, 3 perfect
}

const NOTES_MS = 60000;

class Notes implements Mini {
  private env!: MiniEnv;
  private slots: number[] = [];
  private lanes = 2;
  private notes: Note[] = [];
  private t0 = 0;
  private bpm = 100;
  private exact = false;
  private combo = 0;
  private bestCombo = 0;
  private grades = [0, 0, 0, 0];
  private stray = 0;
  private offs: number[] = [];
  private flash: number[] = [];
  private judgeText = '';
  private judgeAt = 0;
  private held = 0;
  private end = 0;
  private lastBeat = -1;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.exact = !!env.soundAt && !env.muted;
    this.slots = slotsOf(env.mode);
    this.lanes = this.slots.length;
    this.flash = this.slots.map(() => 0);
    this.t0 = now + 2000;
    this.compose(now);
  }

  /** A chart that builds: the tempo climbs, eighths then sixteenths, chords now and then. */
  private compose(now: number): void {
    const len = scaled(NOTES_MS);
    let t = 0;
    let beat = 0;
    let prevLane = -1;
    while (t < len) {
      const p = t / len;
      this.bpm = 96 + p * 64;
      const b = 60000 / this.bpm;
      // Each beat: one to four onsets, more as it goes.
      const subdiv = p < 0.25 ? [0] : p < 0.55 ? (Math.random() < 0.6 ? [0, 0.5] : [0]) : Math.random() < 0.3 ? [0, 0.25, 0.5, 0.75] : Math.random() < 0.7 ? [0, 0.5] : [0, 0.75];
      for (const s of subdiv) {
        let lane = Math.floor(Math.random() * this.lanes);
        if (lane === prevLane && this.lanes > 1 && Math.random() < 0.7) lane = (lane + 1) % this.lanes;
        prevLane = lane;
        this.notes.push({ lane, t: t + s * b, judged: false, grade: 0 });
        if (this.lanes >= 3 && p > 0.4 && s === 0 && Math.random() < 0.15) this.notes.push({ lane: (lane + 1 + Math.floor(Math.random() * (this.lanes - 1))) % this.lanes, t: t + s * b, judged: false, grade: 0 });
      }
      if (this.exact) this.env.soundAt!(SND_BEAT, this.t0 - now + t);
      t += b;
      beat++;
    }
    this.end = t;
    void beat;
  }

  private travel(): number {
    return Math.max(700, 1300 - (this.bpm - 96) * 7);
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const lane = this.slots.indexOf(slot);
    if (lane < 0) return;
    this.flash[lane] = ts + 90;
    const t = ts - this.t0 - (this.exact ? (this.env.latency ?? 0) : 0);
    let best: Note | null = null;
    for (const n of this.notes) {
      if (n.lane !== lane || n.judged) continue;
      if (Math.abs(n.t - t) <= 130 && (!best || Math.abs(n.t - t) < Math.abs(best.t - t))) best = n;
      if (n.t > t + 130) break;
    }
    if (!best) {
      this.stray++;
      this.env.sound(SND_TAP_WEAK);
      return;
    }
    const off = t - best.t;
    best.judged = true;
    best.grade = Math.abs(off) <= 40 ? 3 : Math.abs(off) <= 80 ? 2 : 1;
    this.grades[best.grade]!++;
    this.offs.push(off);
    this.combo++;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.judgeText = best.grade === 3 ? 'perfect' : best.grade === 2 ? `good  ${off > 0 ? 'late' : 'early'}` : `${off > 0 ? 'late' : 'early'}`;
    this.judgeAt = ts;
    this.env.sound(SND_TONE + Math.min(6, Math.round((lane / Math.max(1, this.lanes - 1)) * 6)));
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const t = now - this.t0;
    if (!this.exact) {
      const b = 60000 / this.bpm;
      const k = Math.floor(t / b);
      if (t >= 0 && k !== this.lastBeat) {
        this.lastBeat = k;
        this.env.sound(SND_BEAT);
      }
    }
    // Notes that went past unplayed are misses.
    for (const n of this.notes) {
      if (n.judged) continue;
      if (n.t > t - 130) break;
      n.judged = true;
      n.grade = 0;
      this.grades[0]!++;
      this.combo = 0;
      this.judgeText = 'miss';
      this.judgeAt = now;
      this.env.sound(SND_MISS);
    }
    if (t > this.end + 600) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const judged = this.notes.filter((n) => n.judged);
    const acc = judged.length ? judged.reduce((s, n) => s + n.grade, 0) / (3 * judged.length) : 0;
    header(v, touch, 'accuracy', judged.length ? pct(acc) : '–', 'combo', String(this.combo));
    const laneW = Math.min(90 * a.u, (a.right - a.left) / this.lanes);
    const x0 = a.cx - (laneW * this.lanes) / 2;
    const hitY = a.bottom - 50 * a.u;
    const top = a.top;
    const td = shown(now) - this.t0 - (this.exact ? (this.env.latency ?? 0) : 0);
    const pxPerMs = (hitY - top) / this.travel();
    for (let l = 0; l < this.lanes; l++) {
      const x = x0 + l * laneW;
      ctx.fillStyle = now < this.flash[l]! ? '#1d1d22' : '#121215';
      ctx.fillRect(x + dpr, top, laneW - 2 * dpr, hitY - top + 30 * a.u);
      ctx.fillStyle = COL_MID;
      v.text(this.env.labels[this.slots[l]!] ?? '', x + laneW / 2, hitY + 30 * a.u, v.fontTiny, 'center');
    }
    // Beat lines scrolling down, so the pulse can be seen as well as heard.
    const b = 60000 / this.bpm;
    for (let k = Math.floor(td / b); k < Math.floor(td / b) + 12; k++) {
      const y = hitY - (k * b - td) * pxPerMs;
      if (y < top) break;
      ctx.fillStyle = COL_FAINT;
      ctx.fillRect(x0, y, laneW * this.lanes, dpr);
    }
    ctx.fillStyle = COL_LINE;
    ctx.fillRect(x0, hitY - dpr, laneW * this.lanes, 2 * dpr);
    for (const n of this.notes) {
      const y = hitY - (n.t - td) * pxPerMs;
      if (y < top - 20) break;
      if (y > hitY + 30 * a.u) continue;
      if (n.judged && n.grade > 0) continue;
      const x = x0 + n.lane * laneW;
      ctx.fillStyle = n.judged ? COL_DIM : COL_ACCENT;
      ctx.fillRect(x + 6 * dpr, y - 7 * a.u, laneW - 12 * dpr, 14 * a.u);
    }
    if (now - this.judgeAt < 500 && this.judgeText) {
      ctx.fillStyle = this.judgeText === 'miss' ? COL_ACCENT : this.judgeText === 'perfect' ? COL_LINE : COL_MID;
      v.text(this.judgeText, a.cx, a.cy, v.fontHud, 'center');
    }
    if (t < 0) message(v, { ...a, cy: a.cy - 60 * a.u }, 'hit each note as it reaches the line', 'one key per lane', COL_MID);
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const judged = this.notes.filter((n) => n.judged);
    const acc = judged.length ? judged.reduce((s, n) => s + n.grade, 0) / (3 * judged.length) : 0;
    const m = this.offs.length ? mean(this.offs) : 0;
    return {
      score: Math.round(acc * 1000 + this.bestCombo * 2),
      primary: { label: 'accuracy', value: Math.round(acc * 100), unit: '%' },
      lines: [
        { label: 'perfect · good · ok · miss', value: `${this.grades[3]} · ${this.grades[2]} · ${this.grades[1]} · ${this.grades[0]}` },
        { label: 'best combo', value: String(this.bestCombo) },
        { label: 'timing', value: this.offs.length ? `${Math.round(Math.abs(m))} ms ${m >= 0 ? 'late' : 'early'} on average, spread ${Math.round(median(this.offs.map((o) => Math.abs(o - m))))} ms` : '–' },
        { label: 'stray presses', value: String(this.stray) },
      ],
      saved: judged.length >= 10,
    };
  }
}

// --- Jumble --------------------------------------------------------------------------

const JUMBLE_MS = 90000;

function sorted(w: string): string {
  return [...w].sort().join('');
}

class Jumble implements Mini {
  private env!: MiniEnv;
  private t0 = 0;
  private word = '';
  private shown = '';
  private typed = '';
  private solved = 0;
  private skipped = 0;
  private level = 4;
  private times: number[] = [];
  private at = 0;
  private flash = 0;
  private bad = 0;
  private reveal = '';
  private revealAt = 0;
  private started = false;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.t0 = now;
    this.next(now);
  }

  private next(now: number): void {
    const pool = ENGLISH_5K.filter((w) => w.length === this.level && /^[a-z]+$/.test(w));
    for (let k = 0; k < 50; k++) {
      const w = pick(pool);
      const letters = [...w];
      for (let i = letters.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [letters[i], letters[j]] = [letters[j]!, letters[i]!];
      }
      const s = letters.join('');
      // Not the word itself, nor another word.
      if (s !== w && !VALID_WORDS.has(s)) {
        this.word = w;
        this.shown = s;
        break;
      }
    }
    this.typed = '';
    this.at = now;
  }

  press(): void {}

  typeKey(code: string, ts: number): boolean {
    if (!this.started) {
      this.started = true;
      this.t0 = ts;
      this.at = ts;
    }
    if (code.startsWith('Key') && code.length === 4) {
      const c = code.slice(3).toLowerCase();
      // Only letters on offer, as many times as they appear.
      const left = [...this.shown];
      for (const t of this.typed) left.splice(left.indexOf(t), 1);
      if (!left.includes(c)) {
        this.bad = ts + 200;
        return true;
      }
      this.typed += c;
      if (this.typed.length === this.shown.length) {
        // Any real word from these letters counts.
        if (this.typed === this.word || (VALID_WORDS.has(this.typed) && sorted(this.typed) === sorted(this.word))) {
          this.solved++;
          this.times.push(ts - this.at);
          this.flash = ts + 250;
          this.env.sound(SND_CATCH);
          if (this.solved % 3 === 0) this.level = Math.min(7, this.level + 1);
          this.next(ts);
        } else {
          this.bad = ts + 300;
          this.typed = '';
          this.env.sound(SND_TAP_WEAK);
        }
      }
      return true;
    }
    if (code === 'Backspace') {
      this.typed = this.typed.slice(0, -1);
      return true;
    }
    if (code === 'Space' || code === 'Enter') {
      this.skipped++;
      this.reveal = this.word;
      this.revealAt = ts + 1200;
      this.env.sound(SND_FALSE);
      this.next(ts);
      return true;
    }
    return false;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const len = scaled(JUMBLE_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.t0 > 120000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'words', String(this.solved), 'time', `${left} s`);
    const n = this.shown.length;
    const tw = Math.min(64 * a.u, (a.right - a.left - 20 * a.u) / n - 8 * a.u);
    const x0 = a.cx - (n * (tw + 8 * a.u) - 8 * a.u) / 2;
    const used = [...this.typed];
    // The jumble: letters grey out as you use them.
    [...this.shown].forEach((c, i) => {
      const k = used.indexOf(c);
      const gone = k >= 0;
      if (gone) used.splice(k, 1);
      const x = x0 + i * (tw + 8 * a.u);
      ctx.strokeStyle = gone ? COL_FAINT : COL_MID;
      ctx.lineWidth = 1.5 * dpr;
      ctx.strokeRect(x, a.cy - 70 * a.u, tw, tw);
      ctx.fillStyle = gone ? COL_DIM : COL_LINE;
      v.text(c.toUpperCase(), x + tw / 2, a.cy - 70 * a.u + tw / 2 + 8 * dpr, v.fontHud, 'center');
    });
    // Your answer.
    for (let i = 0; i < n; i++) {
      const x = x0 + i * (tw + 8 * a.u);
      ctx.fillStyle = now < this.bad ? COL_ACCENT : now < this.flash ? COL_LINE : COL_DIM;
      ctx.fillRect(x, a.cy + 40 * a.u, tw, 2 * dpr);
      if (this.typed[i]) {
        ctx.fillStyle = COL_LINE;
        v.text(this.typed[i]!.toUpperCase(), x + tw / 2, a.cy + 30 * a.u, v.fontHud, 'center');
      }
    }
    ctx.fillStyle = COL_MID;
    if (now < this.revealAt) v.text(`it was ${this.reveal.toUpperCase()}`, a.cx, a.cy + 90 * a.u, v.fontTiny, 'center');
    else v.text(this.started ? 'type the word  ·  backspace fixes  ·  space skips' : 'type the word to start the clock  ·  space skips', a.cx, a.cy + 90 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: Math.max(0, this.solved * 100 - this.skipped * 20),
      primary: { label: 'words', value: this.solved, unit: '' },
      lines: [
        { label: 'words solved', value: String(this.solved) },
        { label: 'skipped', value: String(this.skipped) },
        { label: 'typical time a word', value: this.times.length ? ms(median(this.times)) : '–' },
        { label: 'longest words reached', value: `${this.level} letters` },
      ],
      saved: this.solved + this.skipped >= 2,
    };
  }
}

// --- Pop -------------------------------------------------------------------------------

interface Bubble {
  x: number;
  y: number;
  r: number;
  born: number;
  life: number;
}

class Pop implements Mini {
  private env!: MiniEnv;
  private bubbles: Bubble[] = [];
  private nextAt = 0;
  private t0 = 0;
  private started = false;
  private popped = 0;
  private lost = 0;
  private misses = 0;
  private over = false;
  private overAt = 0;
  private sizes: number[] = [];
  private lastPop: [number, number, number] = [0, 0, 0];

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.t0 = now;
  }

  press(): void {}

  pointer(x: number, y: number, ts: number): void {
    if (this.over) return;
    if (!this.started) {
      this.started = true;
      this.t0 = ts;
      this.nextAt = ts + 300;
      return;
    }
    // The topmost (newest) bubble under the click.
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i]!;
      const r = b.r * Math.max(0, 1 - (ts - b.born) / b.life);
      if (Math.hypot(x - b.x, y - b.y) <= r) {
        this.bubbles.splice(i, 1);
        this.popped++;
        this.sizes.push(r / b.r);
        this.lastPop = [b.x, b.y, ts + 200];
        this.env.sound(SND_CATCH);
        return;
      }
    }
    this.misses++;
    this.env.sound(SND_TAP_WEAK);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const a = arena(v, touch);
    if (this.over && now >= this.overAt) return true;
    if (!this.started && now - this.t0 > 120000) return true;
    if (this.started && !this.over) {
      const t = (now - this.t0) / 1000;
      if (now >= this.nextAt) {
        // Faster, smaller, shorter-lived as it goes.
        const r = Math.max(12, 34 - t * 0.35) * a.u;
        const life = Math.max(900, 2200 - t * 22);
        this.bubbles.push({ x: rnd(a.left + r, a.right - r), y: rnd(a.top + r, a.bottom - r), r, born: now, life });
        this.nextAt = now + Math.max(260, 850 - t * 11);
      }
      for (let i = this.bubbles.length - 1; i >= 0; i--) {
        if (now - this.bubbles[i]!.born >= this.bubbles[i]!.life) {
          this.bubbles.splice(i, 1);
          this.lost++;
          this.env.sound(SND_FALSE);
          if (this.lost >= 3) {
            this.over = true;
            this.overAt = now + 1000;
          }
        }
      }
    }
    v.clear();
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'popped', String(this.popped), 'missed clicks', String(this.misses), 3 - this.lost);
    ctx.strokeStyle = COL_FAINT;
    ctx.lineWidth = dpr;
    ctx.strokeRect(a.left, a.top, a.right - a.left, a.bottom - a.top);
    for (const b of this.bubbles) {
      const k = Math.max(0, 1 - (now - b.born) / b.life);
      ctx.strokeStyle = COL_DIM;
      ctx.lineWidth = dpr;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = COL_ACCENT;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * k, 0, TAU);
      ctx.fill();
    }
    if (now < this.lastPop[2]) {
      const k = 1 - (this.lastPop[2] - now) / 200;
      ctx.strokeStyle = COL_LINE;
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.arc(this.lastPop[0], this.lastPop[1], (12 + k * 18) * a.u, 0, TAU);
      ctx.stroke();
    }
    if (!this.started) message(v, a, 'click to start', 'pop each disc before it shrinks away. three lost and it is over', COL_MID);
    if (this.over) message(v, a, `${this.popped} popped`, '');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const acc = this.popped / Math.max(1, this.popped + this.misses);
    return {
      score: Math.round(this.popped * 10 * (0.5 + acc / 2)),
      primary: { label: 'popped', value: this.popped, unit: '' },
      lines: [
        { label: 'popped', value: String(this.popped) },
        { label: 'accuracy', value: `${pct(acc)}  (${this.misses} missed clicks)` },
        { label: 'size left when popped, typically', value: this.sizes.length ? pct(median(this.sizes)) : '–' },
      ],
      saved: this.popped >= 3,
    };
  }
}

// --- Hue -------------------------------------------------------------------------------

const HUE_ROUNDS = 12;

class Hue implements Mini {
  private env!: MiniEnv;
  private i = 0;
  private hue = 0;
  private state = 0; // 0 showing, 1 wheel, 2 feedback
  private at = 0;
  private pickHue = 0;
  private errs: number[] = [];
  private signed: number[] = [];
  private wheel: { cx: number; cy: number; r0: number; r1: number } = { cx: 0, cy: 0, r0: 0, r1: 0 };

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.arm(now + 500);
  }

  private arm(at: number): void {
    this.hue = Math.random() * 360;
    this.state = 0;
    this.at = at;
  }

  press(): void {}

  pointer(x: number, y: number, ts: number): void {
    if (this.state !== 1) return;
    const w = this.wheel;
    const d = Math.hypot(x - w.cx, y - w.cy);
    if (d < w.r0 * 0.7 || d > w.r1 * 1.25) return;
    this.pickHue = ((Math.atan2(y - w.cy, x - w.cx) * 180) / Math.PI + 450) % 360;
    let e = this.pickHue - this.hue;
    e = ((e + 540) % 360) - 180;
    this.errs.push(Math.abs(e));
    this.signed.push(e);
    this.env.sound(Math.abs(e) < 8 ? SND_CATCH : SND_TAP_WEAK);
    this.i++;
    this.state = 2;
    this.at = ts + 1400;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.at + 1200) this.state = 1;
    if (this.state === 2 && now >= this.at) {
      if (this.i >= scaled(HUE_ROUNDS)) return true;
      this.arm(now + 400);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'off by', this.errs.length ? `${Math.round(mean(this.errs.slice(-5)))}°` : '–', 'colour', `${Math.min(this.i + 1, scaled(HUE_ROUNDS))} / ${scaled(HUE_ROUNDS)}`);
    const R = Math.min((a.bottom - a.top) / 2 - 10 * a.u, 150 * a.u);
    this.wheel = { cx: a.cx, cy: a.cy, r0: R * 0.72, r1: R };
    if (this.state === 0 && now >= this.at) {
      ctx.fillStyle = `hsl(${this.hue}, 80%, 55%)`;
      ctx.beginPath();
      ctx.arc(a.cx, a.cy, R * 0.6, 0, TAU);
      ctx.fill();
      ctx.fillStyle = COL_MID;
      v.text('remember this colour', a.cx, a.cy + R + 20 * a.u, v.fontTiny, 'center');
    } else if (this.state >= 1) {
      // The wheel, in 72 flat slices.
      for (let k = 0; k < 72; k++) {
        const h0 = (k * 5 - 90) * (Math.PI / 180);
        const h1 = ((k + 1) * 5 - 90) * (Math.PI / 180) + 0.01;
        ctx.fillStyle = `hsl(${k * 5 + 2.5}, 80%, 55%)`;
        ctx.beginPath();
        ctx.arc(a.cx, a.cy, R, h0, h1);
        ctx.arc(a.cx, a.cy, R * 0.72, h1, h0, true);
        ctx.closePath();
        ctx.fill();
      }
      const mark = (h: number, col: string) => {
        const ang = ((h - 90) * Math.PI) / 180;
        ctx.strokeStyle = col;
        ctx.lineWidth = 3 * dpr;
        ctx.beginPath();
        ctx.moveTo(a.cx + Math.cos(ang) * R * 0.66, a.cy + Math.sin(ang) * R * 0.66);
        ctx.lineTo(a.cx + Math.cos(ang) * R * 1.06, a.cy + Math.sin(ang) * R * 1.06);
        ctx.stroke();
      };
      if (this.state === 2) {
        mark(this.hue, COL_LINE);
        mark(this.pickHue, '#0a0a0b');
        const e = this.errs[this.errs.length - 1]!;
        ctx.fillStyle = `hsl(${this.hue}, 80%, 55%)`;
        ctx.beginPath();
        ctx.arc(a.cx - R * 0.22, a.cy, R * 0.2, 0, TAU);
        ctx.fill();
        ctx.fillStyle = `hsl(${this.pickHue}, 80%, 55%)`;
        ctx.beginPath();
        ctx.arc(a.cx + R * 0.22, a.cy, R * 0.2, 0, TAU);
        ctx.fill();
        ctx.fillStyle = COL_MID;
        v.text(`${Math.round(e)}° off  ·  it, then yours`, a.cx, a.cy + R + 20 * a.u, v.fontTiny, 'center');
      } else {
        ctx.fillStyle = COL_MID;
        v.text('click where that colour is on the wheel', a.cx, a.cy + R + 20 * a.u, v.fontTiny, 'center');
      }
    }
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const m = mean(this.errs);
    const bias = mean(this.signed);
    return {
      score: this.errs.length ? Math.round(Math.max(0, 60 - m) * 20) : 0,
      primary: { label: 'average error', value: m, unit: '°', lower: true },
      lines: [
        { label: 'average error', value: `${m.toFixed(1)}°` },
        { label: 'closest', value: this.errs.length ? `${Math.min(...this.errs).toFixed(1)}°` : '–' },
        { label: 'tendency', value: this.signed.length >= 4 ? `${Math.abs(bias).toFixed(1)}° ${bias >= 0 ? 'clockwise' : 'anticlockwise'} of the true colour` : '–' },
      ],
      saved: this.i >= 4,
    };
  }
}

export const BATCH32: MiniDef[] = [
  { id: 'ink', name: 'Ink', skill: 'attention', blurb: 'A colour word in another colour of ink. Name the ink, not the word.', how: 'A colour word appears, written in a coloured ink: BLUE in yellow ink, say. Answer the ink, not the word: W white, Y yellow, B blue, P pink (or 1 to 4, or tap the colour). The four inks stay distinct with red-green colour blindness. Reading is automatic, so the word gets in the way. Forty words; the results show how much the clash slows you.', input: 'pointer', make: () => new Ink() },
  { id: 'notes', name: 'Notes', skill: 'timing', blurb: 'Notes fall down your lanes to a beat. Hit each as it lands.', how: 'One lane per key. Notes fall to a line in time with the beat; press the lane’s key as each one reaches it. Perfect within 40 ms, good within 80. The tempo climbs from 96 to 160 beats a minute and the patterns fill in: eighths, then sixteenths, and chords with three keys or more. A minute long.', input: 'keys', minKeys: 2, make: () => new Notes() },
  { id: 'jumble', name: 'Jumble', skill: 'reasoning', blurb: 'An anagram. Type the word.', how: 'The letters of a common word, shuffled. Type the word; any real word that uses exactly those letters counts. Backspace fixes, Space skips (and shows the answer). Four letters at first, up to seven. Ninety seconds, starting with your first key.', input: 'type', make: () => new Jumble() },
  { id: 'pop', name: 'Pop', skill: 'aim', blurb: 'Discs appear and shrink away. Click them before they vanish.', how: 'Discs appear anywhere and shrink to nothing. Click each before it is gone. They come faster, smaller and shorter-lived as you go; three that vanish end it. Clicks that miss count against your accuracy.', input: 'pointer', make: () => new Pop() },
  { id: 'hue', name: 'Hue', skill: 'judgement', blurb: 'A colour shows, then hides. Find it on the colour wheel. Needs full colour vision.', how: 'A colour shows for a moment. Then a colour wheel appears: click where that colour was. Scored in degrees round the wheel between your pick and the colour. Twelve colours; the results show whether you lean one way.', input: 'pointer', make: () => new Hue() },
];
