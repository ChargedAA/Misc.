// Twenty-fourth batch: Dexterity, a new skill. The whole keyboard, not just two keys:
// finding keys blind, chords, typing, number row, finger independence, and sequences.
//   Hunt    - a letter appears: press it. Your whole keyboard, as fast as you can find it.
//   Chords  - press two or three keys at the same instant.
//   Type    - type common words as they come. Words per minute.
//   Dial    - type numbers on the number row.
//   Fingers - a home-row pattern, typed three times: watch it get faster.
//   Flip    - press the key mirrored across the keyboard from the one shown.
//   Sweep   - run along a keyboard row, there and back.
//   Ghost   - a word flashes and hides: type it.
//   Taps    - press each key the number of times shown: D D D K K.
//   Arrows  - arrow sequences, quick and clean.
//   Reverse - type the word backwards.
//   Combo   - a combo string against a clock: letters, arrows and space.

import { COL_ACCENT, COL_DIM, COL_FAINT, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALSE, SND_TAP_L, SND_TAP_R, SND_TAP_WEAK } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { ENGLISH_5K } from './words.ts';
import { Stair, arena, footer, header, mean, median, ms, pct, progress, scaled, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

function rint(lo: number, hi: number): number {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function pick<T>(a: readonly T[]): T {
  return a[Math.floor(Math.random() * a.length)]!;
}

// --- Keys ---------------------------------------------------------------------------

const ROWS = ['QWERTYUIOP', 'ASDFGHJKL;', 'ZXCVBNM,./'];
const NAMED: Record<string, string> = { ';': 'Semicolon', ',': 'Comma', '.': 'Period', '/': 'Slash', ' ': 'Space' };

/** The KeyboardEvent.code for a character on a US-layout keyboard. */
function codeOf(ch: string): string {
  if (/[A-Z]/.test(ch)) return `Key${ch}`;
  if (/[a-z]/.test(ch)) return `Key${ch.toUpperCase()}`;
  if (/[0-9]/.test(ch)) return `Digit${ch}`;
  return NAMED[ch] ?? ch;
}

const ARROW_CH: Record<string, string> = { ArrowLeft: '←', ArrowUp: '↑', ArrowRight: '→', ArrowDown: '↓' };

/** What to show for a code. */
function charOf(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (ARROW_CH[code]) return ARROW_CH[code]!;
  if (code === 'Space') return '␣';
  const named = Object.entries(NAMED).find(([, c]) => c === code);
  return named ? named[0] : code;
}

/** Which hand types a code, for left/right tick sounds. */
function handOf(code: string): number {
  const ch = charOf(code);
  for (const r of ROWS) {
    const i = r.indexOf(ch);
    if (i >= 0) return i < 5 ? -1 : 1;
  }
  return /[1-5]/.test(ch) ? -1 : 1;
}

/** Draw a small keyboard, lighting some keys. */
function keyboard(v: View, cx: number, top: number, u: number, lit: Record<string, string>): void {
  const ctx = v.ctx;
  const k = Math.min(34 * u, (v.w * 0.8) / 11);
  ROWS.forEach((row, r) => {
    const x0 = cx - (10 * k) / 2 + r * k * 0.3;
    [...row].forEach((ch, i) => {
      const x = x0 + i * k;
      const y = top + r * k;
      const col = lit[ch];
      ctx.strokeStyle = col ?? COL_FAINT;
      ctx.lineWidth = v.dpr;
      ctx.strokeRect(x + 2, y + 2, k - 4, k - 4);
      ctx.fillStyle = col ?? COL_DIM;
      v.text(ch, x + k / 2, y + k / 2 + 5 * v.dpr, v.fontTiny, 'center');
    });
  });
}

/** Words for the typing drills: the 5,000 most common English words (two letters or more). */
export const WORDS: readonly string[] = ENGLISH_5K.filter((w) => w.length >= 2 && w.length <= 12);

// --- A typed sequence, the shared engine -------------------------------------------

interface Prompt {
  /** The keys to press, in order. */
  codes: string[];
  /** What to show. */
  show: string;
  /** A smaller line under it. */
  hint?: string;
  /** Hide the prompt this long after it appears (ms). */
  hideAfter?: number;
  /** Fail the prompt if it is not finished in this long (ms). */
  limit?: number;
}

abstract class KeySeq implements Mini {
  protected env!: MiniEnv;
  protected i = 0;
  protected state = 0; // 0 gap, 1 typing, 2 feedback
  protected at = 0;
  protected p: Prompt = { codes: [], show: '' };
  protected pos = 0;
  protected shownAt = 0;
  protected firstAt = 0;
  protected times: number[] = [];
  protected keyTimes: number[] = [];
  protected errors = 0;
  protected keys = 0;
  protected lastOk = true;
  protected failedText = '';
  protected abstract readonly total: number;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.state = 0;
    this.at = now + 700;
  }

  protected abstract make(i: number): Prompt;

  press(): void {}

  typeKey(code: string, ts: number): boolean {
    if (code === 'Escape') return false;
    if (this.state !== 1) return true;
    const want = this.p.codes[this.pos];
    if (code === want) {
      if (this.pos === 0) this.firstAt = ts;
      this.pos++;
      this.keys++;
      this.keyTimes.push(ts);
      this.env.sound(handOf(code) < 0 ? SND_TAP_L : SND_TAP_R);
      if (this.pos >= this.p.codes.length) this.done(true, ts);
    } else if (!code.startsWith('Shift') && !code.startsWith('Control') && !code.startsWith('Alt') && !code.startsWith('Meta')) {
      this.errors++;
      this.env.sound(SND_FALSE);
      this.onError(ts);
    }
    return true;
  }

  /** A wrong key: by default nothing more happens (fix it and carry on). */
  protected onError(_ts: number): void {}

  protected done(ok: boolean, ts: number): void {
    this.lastOk = ok;
    if (ok) {
      this.times.push(ts - this.shownAt);
      this.env.sound(SND_CATCH);
    }
    this.i++;
    this.state = 2;
    this.at = ts + (ok ? 260 : 900);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.at) {
      this.p = this.make(this.i);
      this.pos = 0;
      this.shownAt = now;
      this.state = 1;
    } else if (this.state === 1 && now - this.shownAt > (this.p.limit ?? 8000 + 900 * this.p.codes.length)) {
      // Nobody is left stuck on a prompt: past its limit (or a generous default) it counts as missed.
      this.failedText = 'out of time';
      this.done(false, now);
    } else if (this.state === 2 && now >= this.at) {
      if (this.i >= this.total) return true;
      this.state = 0;
      this.at = now + 120;
    }
    v.clear();
    const a = arena(v, touch);
    this.drawHeader(v, touch);
    this.drawPrompt(v, a, now);
    footer(v, touch, 0);
    return false;
  }

  protected drawHeader(v: View, touch: TouchLayout): void {
    header(v, touch, 'done', `${Math.min(this.i + (this.state === 1 ? 1 : 0), this.total)} / ${this.total}`, 'errors', String(this.errors));
  }

  protected drawPrompt(v: View, a: ReturnType<typeof arena>, now: number): void {
    const ctx = v.ctx;
    const hidden = this.p.hideAfter !== undefined && now - this.shownAt > this.p.hideAfter;
    if (this.state >= 1) {
      // The prompt, with what you have typed so far lit.
      const chars = this.p.codes.map(charOf);
      const showChars = this.p.show.length === chars.length ? [...this.p.show] : null;
      if (showChars) {
        // Space the letters by the widest one, and shrink the font if the word would not fit.
        let font = v.fontBig;
        ctx.font = font;
        let w = Math.max(...showChars.map((c) => ctx.measureText(c).width)) * 1.12;
        const room = (a.right - a.left) * 0.94;
        if (w * showChars.length > room) {
          const px = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 0);
          const k = room / (w * showChars.length);
          if (px) font = font.replace(/\d+(?:\.\d+)?px/, `${Math.floor(px * k)}px`);
          w *= k;
        }
        const x0 = a.cx - ((chars.length - 1) * w) / 2;
        showChars.forEach((c, k) => {
          const done = k < this.pos;
          if (hidden && !done) {
            ctx.fillStyle = COL_DIM;
            v.text('·', x0 + k * w, a.cy, font, 'center');
            return;
          }
          ctx.fillStyle = this.state === 2 && !this.lastOk ? COL_ACCENT : done ? COL_LINE : k === this.pos ? COL_MID : COL_DIM;
          v.text(c, x0 + k * w, a.cy, font, 'center');
        });
      } else {
        ctx.fillStyle = COL_LINE;
        if (!hidden) v.text(this.p.show, a.cx, a.cy, v.fontBig, 'center');
        ctx.fillStyle = COL_MID;
        v.text(`${this.pos} / ${chars.length}`, a.cx, a.cy + 44 * a.u, v.fontTiny, 'center');
      }
      if (this.p.hint) {
        ctx.fillStyle = COL_MID;
        v.text(this.p.hint, a.cx, a.cy - 70 * a.u, v.fontTiny, 'center');
      }
      if (this.p.limit && this.state === 1) progress(v, a.cx, a.cy + 80 * a.u, 140 * a.u, 1 - (now - this.shownAt) / this.p.limit, COL_MID);
      if (this.state === 2 && !this.lastOk) {
        ctx.fillStyle = COL_ACCENT;
        v.text(this.failedText || 'missed', a.cx, a.cy + 80 * a.u, v.fontTiny, 'center');
      }
    }
  }

  abstract result(): MiniResult;

  protected base(saved: boolean): Pick<MiniResult, 'saved'> {
    return { saved: saved && this.times.length >= 3 };
  }
}

// --- Hunt ---------------------------------------------------------------------------

class Hunt extends KeySeq {
  protected readonly total = scaled(30);
  private letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  private last = '';

  protected make(i: number): Prompt {
    let c = pick([...this.letters]);
    while (c === this.last) c = pick([...this.letters]);
    this.last = c;
    return { codes: [codeOf(c)], show: c, hint: i < 3 ? 'press this letter' : undefined };
  }

  override drawPrompt(v: View, a: ReturnType<typeof arena>, now: number): void {
    super.drawPrompt(v, a, now);
    // The first few show where the key is; after that you find it yourself.
    if (this.i < 5 && this.state === 1) keyboard(v, a.cx, a.cy + 60 * a.u, a.u, { [this.p.show]: COL_ACCENT });
  }

  result(): MiniResult {
    const m = median(this.times);
    return {
      score: this.times.length ? Math.max(0, Math.round((1400 - m) * 0.8 + this.times.length * 5 - this.errors * 10)) : 0,
      primary: { label: 'median time to find a key', value: m, unit: 'ms', lower: true },
      lines: [
        { label: 'keys found', value: String(this.times.length) },
        { label: 'wrong keys', value: String(this.errors) },
        { label: 'slowest letters', value: this.slowest() },
      ],
      rts: this.times,
      ...this.base(true),
    };
  }

  private slowLog: [string, number][] = [];

  protected override done(ok: boolean, ts: number): void {
    if (ok) this.slowLog.push([this.p.show, ts - this.shownAt]);
    super.done(ok, ts);
  }

  private slowest(): string {
    return [...this.slowLog].sort((x, y) => y[1] - x[1]).slice(0, 4).map(([c, t]) => `${c} ${Math.round(t)}`).join('  ') || '–';
  }
}

// --- Type ---------------------------------------------------------------------------

/**
 * A real typing test, like Monkeytype: lines of words to read ahead, Space moves on, Backspace
 * fixes, mistakes are shown but never block you. The clock starts at your first key. WPM is the
 * standard measure: correct characters (spaces after correct words included) / 5 per minute.
 */
class TypeWords implements Mini {
  private env!: MiniEnv;
  private readonly total = scaled(50);
  private words: string[] = [];
  private typed: string[] = [''];
  private w = 0;
  private startAt = 0;
  private endAt = 0;
  private keys = 0;
  private wrongKeys = 0;
  private done = false;
  private doneAt = 0;
  /** Correct characters at each whole second, for consistency and the WPM-over-time line. */
  private perSecond: number[] = [];
  private lastKeyAt = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.lastKeyAt = now;
    const pool = WORDS.filter((x) => x.length <= 9);
    for (let i = 0; i < this.total; i++) {
      let next = pick(pool);
      while (next === this.words[this.words.length - 1]) next = pick(pool);
      this.words.push(next);
    }
  }

  press(): void {}

  /** Characters typed correctly so far: whole correct words plus their spaces, and the right prefix of the current word. */
  private correctChars(): number {
    let n = 0;
    for (let i = 0; i < this.w; i++) if (this.typed[i] === this.words[i]) n += this.words[i]!.length + 1;
    const cur = this.typed[this.w] ?? '';
    const word = this.words[this.w] ?? '';
    for (let i = 0; i < cur.length && cur[i] === word[i]; i++) n++;
    return n;
  }

  typeKey(code: string, ts: number): boolean {
    if (code === 'Escape') return false;
    if (this.done) return true;
    const letter = /^Key([A-Z])$/.exec(code)?.[1]?.toLowerCase() ?? (code === 'Quote' ? "'" : null);
    if (!letter && code !== 'Space' && code !== 'Backspace') return /^(Shift|Control|Alt|Meta)/.test(code) ? true : false;
    if (!this.startAt) this.startAt = ts;
    this.lastKeyAt = ts;
    const word = this.words[this.w]!;
    const cur = this.typed[this.w]!;
    if (code === 'Backspace') {
      if (cur.length) this.typed[this.w] = cur.slice(0, -1);
      else if (this.w > 0 && this.typed[this.w - 1] !== this.words[this.w - 1]) {
        // Step back into a wrong word to fix it.
        this.w--;
        this.typed.pop();
      }
      return true;
    }
    if (code === 'Space') {
      if (!cur.length) return true;
      this.keys++;
      if (cur !== word) this.wrongKeys++;
      this.w++;
      this.typed.push('');
      this.env.sound(SND_TAP_R);
      if (this.w >= this.words.length) this.finish(ts);
      return true;
    }
    this.keys++;
    const ok = cur.length < word.length && word[cur.length] === letter;
    if (!ok) this.wrongKeys++;
    if (cur.length < word.length + 8) this.typed[this.w] = cur + letter;
    this.env.sound(ok ? SND_TAP_L : SND_TAP_WEAK);
    // The last word needs no Space: it ends the test as soon as it is right.
    if (this.w === this.words.length - 1 && this.typed[this.w] === word) {
      this.w++;
      this.typed.push('');
      this.finish(ts);
    }
    return true;
  }

  private finish(ts: number): void {
    this.done = true;
    this.endAt = ts;
    this.doneAt = ts;
    this.env.sound(SND_CATCH);
  }

  private elapsed(now: number): number {
    if (!this.startAt) return 0;
    return ((this.done ? this.endAt : now) - this.startAt) / 1000;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.done && now - this.doneAt > 900) return true;
    // A test never runs forever: five minutes at the standard length.
    if (!this.done && this.startAt && now - this.startAt > scaled(300000)) this.finish(now);
    // Sample correct characters each second for the consistency line.
    if (this.startAt && !this.done) {
      const sec = Math.floor((now - this.startAt) / 1000);
      while (this.perSecond.length <= sec) this.perSecond.push(this.correctChars());
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const t = this.elapsed(now);
    const wpm = t > 1 ? this.correctChars() / 5 / (t / 60) : 0;
    header(v, touch, 'wpm', this.startAt ? String(Math.round(wpm)) : '–', 'words', `${Math.min(this.w, this.words.length)} / ${this.words.length}`);
    // Lay the words out in lines, monospace, three lines on show with the current one first.
    const size = Math.max(16 * v.dpr, Math.min(30 * a.u, 34 * v.dpr));
    const font = `400 ${Math.round(size)}px ui-monospace, SFMono-Regular, Menlo, Consolas, "Roboto Mono", monospace`;
    ctx.font = font;
    const cw = ctx.measureText('m').width;
    const width = Math.min(a.right - a.left, 900 * a.u);
    const perLine = Math.max(12, Math.floor(width / cw));
    const lines: number[][] = [[]];
    let len = 0;
    this.words.forEach((word, i) => {
      const shown = Math.max(word.length, (this.typed[i] ?? '').length);
      if (len && len + shown > perLine) {
        lines.push([]);
        len = 0;
      }
      lines[lines.length - 1]!.push(i);
      len += shown + 1;
    });
    const curLine = Math.max(0, lines.findIndex((l) => l.includes(Math.min(this.w, this.words.length - 1))));
    const first = Math.max(0, curLine - 1);
    const lh = size * 1.6;
    const x0 = a.cx - (perLine * cw) / 2;
    const y0 = a.cy - lh;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    for (let li = first; li < Math.min(lines.length, first + 3); li++) {
      let x = x0;
      const y = y0 + (li - first) * lh;
      for (const i of lines[li]!) {
        const word = this.words[i]!;
        const typed = this.typed[i] ?? '';
        const past = i < this.w;
        for (let c = 0; c < Math.max(word.length, typed.length); c++) {
          const want = word[c];
          const got = typed[c];
          let col = COL_DIM;
          let ch = want ?? got ?? '';
          if (got !== undefined) {
            if (want === undefined) {
              col = '#b8402a'; // extra letters
              ch = got;
            } else col = got === want ? COL_LINE : COL_ACCENT;
          } else if (past) col = COL_ACCENT; // skipped letters of a finished word
          ctx.fillStyle = col;
          ctx.fillText(ch, x, y);
          // A word finished wrong gets an underline.
          if (past && typed !== word && c === 0) {
            ctx.fillRect(x, y + size * 0.18, Math.max(word.length, typed.length) * cw, Math.max(1, v.dpr));
            ctx.fillStyle = col;
          }
          x += cw;
        }
        // The caret.
        if (i === this.w && !this.done) {
          const cx = x0 + (x - x0) - (Math.max(word.length, typed.length) - typed.length) * cw;
          const blink = !this.startAt || Math.floor((now - this.lastKeyAt) / 530) % 2 === 0;
          if (blink) {
            ctx.fillStyle = COL_ACCENT;
            ctx.fillRect(cx - v.dpr, y - size * 0.85, 2 * v.dpr, size * 1.05);
          }
        }
        x += cw;
      }
    }
    ctx.fillStyle = COL_MID;
    v.text(this.startAt ? `${t.toFixed(0)} s` : 'start typing: Space moves to the next word, Backspace fixes', a.cx, a.bottom - 14 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const t = this.startAt ? ((this.done ? this.endAt : this.lastKeyAt) - this.startAt) / 1000 : 0;
    const correct = this.correctChars();
    const wpm = t > 0 ? correct / 5 / (t / 60) : 0;
    const raw = t > 0 ? this.keys / 5 / (t / 60) : 0;
    const acc = this.keys ? (this.keys - this.wrongKeys) / this.keys : 0;
    const perSec = this.perSecond.slice(1).map((n, i) => (n - this.perSecond[i]!) * 12);
    const m = mean(perSec);
    const sd = perSec.length > 2 ? Math.sqrt(mean(perSec.map((x) => (x - m) ** 2))) : 0;
    const consistency = m > 0 ? Math.max(0, 1 - sd / m) : 0;
    const wordsRight = this.words.slice(0, this.w).filter((w, i) => this.typed[i] === w).length;
    return {
      score: Math.max(0, Math.round(wpm * 8 * acc)),
      primary: { label: 'words per minute', value: Math.round(wpm), unit: 'wpm' },
      lines: [
        { label: 'raw (every key)', value: `${Math.round(raw)} wpm` },
        { label: 'accuracy', value: this.keys ? pct(acc) : '–' },
        { label: 'words right', value: `${wordsRight} of ${this.w}` },
        { label: 'consistency', value: perSec.length > 2 ? pct(consistency) : '–' },
        { label: 'time', value: `${t.toFixed(1)} s` },
      ],
      series: perSec.length >= 3 ? { label: 'speed each second', names: perSec.map((_, i) => String(i + 1)), values: perSec.map((x) => Math.round(x)), unit: 'wpm' } : undefined,
      saved: this.w >= 5 && t > 3,
    };
  }
}

// --- Dial ---------------------------------------------------------------------------

class Dial extends KeySeq {
  protected readonly total = scaled(16);

  protected make(i: number): Prompt {
    const n = 4 + Math.min(4, Math.floor(i / 4));
    let s = '';
    for (let k = 0; k < n; k++) s += String(rint(0, 9));
    return { codes: [...s].map(codeOf), show: s, hint: i === 0 ? 'type it on the number row' : undefined };
  }

  result(): MiniResult {
    const perDigit = this.times.length ? mean(this.times.map((t, k) => t / (4 + Math.min(4, Math.floor(k / 4))))) : 0;
    return {
      score: this.times.length ? Math.max(0, Math.round((900 - perDigit) * 1.2 - this.errors * 10)) : 0,
      primary: { label: 'time per digit', value: perDigit, unit: 'ms', lower: true },
      lines: [
        { label: 'numbers typed', value: String(this.times.length) },
        { label: 'wrong keys', value: String(this.errors) },
      ],
      ...this.base(true),
    };
  }
}

// --- Fingers ------------------------------------------------------------------------

class Fingers extends KeySeq {
  protected readonly total = scaled(5) * 3;
  private pattern = '';
  private reps: number[][] = [];

  protected make(i: number): Prompt {
    const rep = i % 3;
    if (rep === 0) {
      const home = 'ASDFJKL;';
      let s = '';
      for (let k = 0; k < 6; k++) {
        let c = pick([...home]);
        while (c === s[s.length - 1]) c = pick([...home]);
        s += c;
      }
      this.pattern = s;
      this.reps.push([]);
    }
    return { codes: [...this.pattern].map(codeOf), show: this.pattern, hint: `the same pattern, ${['first', 'second', 'third'][rep]} time` };
  }

  protected override done(ok: boolean, ts: number): void {
    if (ok) this.reps[this.reps.length - 1]!.push(ts - this.firstAt);
    super.done(ok, ts);
  }

  result(): MiniResult {
    const first = mean(this.reps.map((r) => r[0] ?? 0).filter((x) => x > 0));
    const third = mean(this.reps.map((r) => r[2] ?? 0).filter((x) => x > 0));
    return {
      score: this.times.length ? Math.max(0, Math.round((2400 - (third || first)) * 0.4 - this.errors * 8)) : 0,
      primary: { label: 'third run of a pattern', value: third || first, unit: 'ms', lower: true },
      series: { label: 'time for the pattern, by run', names: ['1st', '2nd', '3rd'], values: [0, 1, 2].map((k) => Math.round(mean(this.reps.map((r) => r[k] ?? 0).filter((x) => x > 0)))), unit: 'ms', lower: true },
      lines: [
        { label: 'first run vs third', value: first && third ? `${Math.round(first)} → ${Math.round(third)} ms` : '–' },
        { label: 'wrong keys', value: String(this.errors) },
      ],
      ...this.base(true),
    };
  }
}

// --- Flip ---------------------------------------------------------------------------

class Flip extends KeySeq {
  protected readonly total = scaled(30);

  protected make(i: number): Prompt {
    const r = rint(0, 2);
    const col = rint(0, 9);
    const shown = ROWS[r]![col]!;
    const mirror = ROWS[r]![9 - col]!;
    return { codes: [codeOf(mirror)], show: shown, hint: i < 3 ? `press the key in the same place on the other hand (${shown} → ${mirror})` : 'its mirror' };
  }

  override drawPrompt(v: View, a: ReturnType<typeof arena>, now: number): void {
    // Shown as a single letter; the answer is a different key, so do not light the typed one.
    const ctx = v.ctx;
    if (this.state >= 1) {
      ctx.fillStyle = this.state === 2 && !this.lastOk ? COL_ACCENT : COL_LINE;
      v.text(this.p.show, a.cx, a.cy, v.fontBig, 'center');
      ctx.fillStyle = COL_MID;
      if (this.p.hint) v.text(this.p.hint, a.cx, a.cy - 70 * a.u, v.fontTiny, 'center');
    }
    if (this.i < 4 && this.state === 1) keyboard(v, a.cx, a.cy + 60 * a.u, a.u, { [this.p.show]: COL_MID, [charOf(this.p.codes[0]!)]: COL_ACCENT });
    void now;
  }

  result(): MiniResult {
    const m = median(this.times);
    return {
      score: this.times.length ? Math.max(0, Math.round((1600 - m) * 0.6 + this.times.length * 4 - this.errors * 12)) : 0,
      primary: { label: 'median time to the mirror key', value: m, unit: 'ms', lower: true },
      lines: [
        { label: 'right', value: String(this.times.length) },
        { label: 'wrong keys', value: String(this.errors) },
      ],
      rts: this.times,
      ...this.base(true),
    };
  }
}

// --- Sweep --------------------------------------------------------------------------

class Sweep extends KeySeq {
  protected readonly total = scaled(9);

  protected make(i: number): Prompt {
    const row = ROWS[i % 3]!;
    const there = [...row];
    const s = [...there, ...[...there].reverse().slice(1)].join('');
    return { codes: [...s].map(codeOf), show: s, hint: `${['top', 'home', 'bottom'][i % 3]} row, along and back` };
  }

  result(): MiniResult {
    const perKey = this.times.length ? mean(this.times) / 19 : 0;
    return {
      score: this.times.length ? Math.max(0, Math.round((500 - perKey) * 2 - this.errors * 6)) : 0,
      primary: { label: 'time per key', value: perKey, unit: 'ms', lower: true },
      lines: [
        { label: 'sweeps', value: String(this.times.length) },
        { label: 'wrong keys', value: String(this.errors) },
      ],
      ...this.base(true),
    };
  }
}

// --- Ghost --------------------------------------------------------------------------

class Ghost extends KeySeq {
  protected readonly total = scaled(16);
  private readonly expo = new Stair(900, 100, 40, 1500, 2);
  private levels: number[] = [];
  private right = 0;

  protected make(_i: number): Prompt {
    const w = pick(WORDS.filter((x) => x.length >= 5)).toUpperCase();
    return { codes: [...w].map(codeOf), show: w, hideAfter: this.expo.level, hint: 'it hides: type it from memory' };
  }

  protected override onError(ts: number): void {
    // One wrong letter and the word is lost.
    this.failedText = `it was ${this.p.show}`;
    this.levels.push(this.expo.level);
    this.expo.update(false, -1);
    this.done(false, ts);
  }

  protected override done(ok: boolean, ts: number): void {
    if (ok) {
      this.right++;
      this.levels.push(this.expo.level);
      this.expo.update(true, -1);
    }
    super.done(ok, ts);
  }

  result(): MiniResult {
    const th = mean(this.levels.slice(-8));
    return {
      score: this.levels.length >= 4 ? Math.max(0, Math.round((1600 - th) * 0.5 + this.right * 20)) : 0,
      primary: { label: 'shortest look you can type from', value: Math.round(th), unit: 'ms', lower: true },
      lines: [
        { label: 'words right', value: `${this.right} of ${this.i}` },
      ],
      saved: this.levels.length >= 4,
    };
  }
}

// --- Taps ---------------------------------------------------------------------------

class Taps extends KeySeq {
  protected readonly total = scaled(14);

  protected make(i: number): Prompt {
    const groups = 2 + Math.min(2, Math.floor(i / 5));
    const home = [...'ASDFGHJKL'];
    let codes: string[] = [];
    let show = '';
    let last = '';
    for (let g = 0; g < groups; g++) {
      let c = pick(home);
      while (c === last) c = pick(home);
      last = c;
      const n = rint(1, 4);
      codes = codes.concat(Array<string>(n).fill(codeOf(c)));
      show += `${c}×${n}  `;
    }
    return { codes, show: show.trim(), hint: 'press each key that many times, in order' };
  }

  result(): MiniResult {
    return {
      score: this.times.length ? Math.max(0, Math.round(this.times.length * 40 - this.errors * 15)) : 0,
      primary: { label: 'clean runs', value: this.times.length, unit: '' },
      lines: [
        { label: 'median time per run', value: ms(median(this.times)) },
        { label: 'wrong keys', value: String(this.errors) },
      ],
      ...this.base(true),
    };
  }
}

// --- Arrows -------------------------------------------------------------------------

class Arrows extends KeySeq {
  protected readonly total = scaled(16);

  protected make(i: number): Prompt {
    const n = 4 + Math.min(4, Math.floor(i / 3));
    const all = Object.keys(ARROW_CH);
    const codes: string[] = [];
    for (let k = 0; k < n; k++) codes.push(pick(all));
    return { codes, show: codes.map((c) => ARROW_CH[c]).join(''), hint: i === 0 ? 'the arrow keys, in order' : undefined };
  }

  result(): MiniResult {
    const perKey = this.times.length ? mean(this.times.map((t, k) => t / (4 + Math.min(4, Math.floor(k / 3))))) : 0;
    return {
      score: this.times.length ? Math.max(0, Math.round((800 - perKey) * 1.4 - this.errors * 8)) : 0,
      primary: { label: 'time per arrow', value: perKey, unit: 'ms', lower: true },
      lines: [
        { label: 'sequences', value: String(this.times.length) },
        { label: 'wrong keys', value: String(this.errors) },
      ],
      ...this.base(true),
    };
  }
}

// --- Reverse ------------------------------------------------------------------------

class Reverse extends KeySeq {
  protected readonly total = scaled(14);

  protected make(i: number): Prompt {
    const w = pick(WORDS.filter((x) => x.length >= 4 && x.length <= 4 + Math.floor(i / 4))).toUpperCase();
    const back = [...w].reverse().join('');
    return { codes: [...back].map(codeOf), show: w, hint: 'type it backwards' };
  }

  override drawPrompt(v: View, a: ReturnType<typeof arena>, now: number): void {
    const ctx = v.ctx;
    if (this.state >= 1) {
      ctx.fillStyle = this.state === 2 && !this.lastOk ? COL_ACCENT : COL_LINE;
      v.text(this.p.show, a.cx, a.cy, v.fontBig, 'center');
      ctx.fillStyle = COL_MID;
      v.text('type it backwards', a.cx, a.cy - 70 * a.u, v.fontTiny, 'center');
      ctx.fillStyle = COL_ACCENT;
      v.text(this.p.codes.slice(0, this.pos).map(charOf).join(''), a.cx, a.cy + 60 * a.u, v.fontHud, 'center');
    }
    void now;
  }

  result(): MiniResult {
    return {
      score: this.times.length ? Math.max(0, Math.round(this.times.length * 50 - this.errors * 12 - median(this.times) / 50)) : 0,
      primary: { label: 'median time per word', value: median(this.times), unit: 'ms', lower: true },
      lines: [
        { label: 'words', value: String(this.times.length) },
        { label: 'wrong keys', value: String(this.errors) },
      ],
      ...this.base(true),
    };
  }
}

// --- Combo --------------------------------------------------------------------------

class Combo extends KeySeq {
  protected readonly total = scaled(14);
  private lens: number[] = [];

  protected make(i: number): Prompt {
    const n = 3 + Math.min(5, Math.floor(i / 2));
    const pool = ['KeyJ', 'KeyK', 'KeyL', 'KeyF', 'KeyD', 'Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
    const codes: string[] = [];
    for (let k = 0; k < n; k++) {
      let c = pick(pool);
      while (c === codes[codes.length - 1]) c = pick(pool);
      codes.push(c);
    }
    return { codes, show: codes.map(charOf).join(''), limit: 700 + n * 450 };
  }

  protected override onError(ts: number): void {
    this.failedText = 'dropped the combo';
    this.done(false, ts);
  }

  protected override done(ok: boolean, ts: number): void {
    if (ok) this.lens.push(this.p.codes.length);
    super.done(ok, ts);
  }

  result(): MiniResult {
    return {
      score: this.lens.reduce((x, y) => x + y, 0) * 12,
      primary: { label: 'longest combo landed', value: this.lens.length ? Math.max(...this.lens) : 0, unit: 'keys' },
      lines: [
        { label: 'combos landed', value: `${this.lens.length} of ${this.i}` },
        { label: 'median time', value: ms(median(this.times)) },
      ],
      saved: this.i >= 3,
    };
  }
}

// --- Chords -------------------------------------------------------------------------

const CHORD_WINDOW = 120;

class Chords implements Mini {
  private env!: MiniEnv;
  private i = 0;
  private readonly total = scaled(24);
  private state = 0; // 0 gap, 1 waiting, 2 feedback
  private at = 0;
  private want: string[] = [];
  private got = new Map<string, number>();
  private shownAt = 0;
  private spreads: number[] = [];
  private rts: number[] = [];
  private right = 0;
  private lastOk = true;
  private note = '';

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.at = now + 700;
  }

  press(): void {}

  private make(): void {
    const n = this.i < 8 ? 2 : this.i < 16 ? rint(2, 3) : 3;
    const left = [...'QWERASDFZXCV'];
    const right = [...'UIOPJKL;M,./'];
    const keys = new Set<string>();
    // At least one key from each hand.
    keys.add(pick(left));
    keys.add(pick(right));
    while (keys.size < n) keys.add(pick([...left, ...right]));
    this.want = [...keys].map(codeOf);
    this.got.clear();
    this.shownAt = performance.now();
    this.state = 1;
  }

  typeKey(code: string, ts: number): boolean {
    if (code === 'Escape') return false;
    if (this.state !== 1) return true;
    if (!this.want.includes(code)) {
      this.finish(false, ts, `${charOf(code)} is not in the chord`);
      return true;
    }
    if (!this.got.has(code)) this.got.set(code, ts);
    const times = [...this.got.values()];
    if (Math.max(...times) - Math.min(...times) > CHORD_WINDOW) {
      this.finish(false, ts, 'not together');
      return true;
    }
    if (this.got.size === this.want.length) {
      const spread = Math.max(...times) - Math.min(...times);
      this.spreads.push(spread);
      this.rts.push(Math.max(...times) - this.shownAt);
      this.finish(true, ts, `${Math.round(spread)} ms apart`);
    }
    return true;
  }

  private finish(ok: boolean, ts: number, note: string): void {
    this.lastOk = ok;
    this.note = note;
    if (ok) this.right++;
    this.env.sound(ok ? SND_CATCH : SND_FALSE);
    this.i++;
    this.state = 2;
    this.at = ts + (ok ? 500 : 900);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.at) this.make();
    else if (this.state === 1 && now - this.shownAt > 4000) this.finish(false, now, 'too slow');
    else if (this.state === 2 && now >= this.at) {
      if (this.i >= this.total) return true;
      this.state = 0;
      this.at = now + 300;
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'chords', `${Math.min(this.i + 1, this.total)} / ${this.total}`, 'right', String(this.right));
    if (this.state >= 1) {
      const lit: Record<string, string> = {};
      for (const c of this.want) lit[charOf(c)] = this.got.has(c) ? COL_LINE : COL_ACCENT;
      ctx.fillStyle = this.state === 2 && !this.lastOk ? COL_ACCENT : COL_LINE;
      v.text(this.want.map(charOf).join(' + '), a.cx, a.cy - 40 * a.u, v.fontBig, 'center');
      keyboard(v, a.cx, a.cy + 10 * a.u, a.u, lit);
      if (this.state === 2) {
        ctx.fillStyle = this.lastOk ? COL_MID : COL_ACCENT;
        v.text(this.note, a.cx, a.cy - 100 * a.u, v.fontTiny, 'center');
      } else if (this.i === 0) {
        ctx.fillStyle = COL_MID;
        v.text('press all of them at the same instant', a.cx, a.cy - 100 * a.u, v.fontTiny, 'center');
      }
    }
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.right * 30 + Math.max(0, Math.round(80 - median(this.spreads))) * 3,
      primary: { label: 'keys apart in a chord', value: median(this.spreads), unit: 'ms', lower: true, zeroOk: true },
      lines: [
        { label: 'chords landed', value: `${this.right} of ${this.i}` },
        { label: 'median time to land one', value: ms(median(this.rts)) },
      ],
      rts: this.rts, saved: this.i >= 4 && this.right >= 2,
    };
  }
}

export const BATCH24: MiniDef[] = [
  { id: 'hunt', name: 'Hunt', skill: 'dexterity', blurb: 'A letter appears: press it. The whole keyboard, as fast as you can find it.', how: 'A letter appears in the middle. Press that key on your keyboard as fast as you can. The first few show where it is; after that you find it yourself. A wrong key counts as an error; keep going until you hit the right one. Needs a keyboard.', input: 'type', make: () => new Hunt() },
  { id: 'chords', name: 'Chords', skill: 'dexterity', blurb: 'Press two or three keys at exactly the same instant.', how: 'A chord of two keys (later three) appears, lit on a keyboard. Press them all at the same instant: within 120 ms of each other. A key outside the chord, or keys too far apart, loses it. Scored on how close together your keys land. Needs a keyboard.', input: 'type', make: () => new Chords() },
  { id: 'type', name: 'Type', skill: 'dexterity', blurb: 'A typing test: lines of common words. Words per minute.', how: 'Lines of common words, as in a typing test. Type them with Space between words; Backspace fixes, and you can step back into a word you got wrong. Mistakes show in colour but never stop you. The clock starts at your first key. Scored in words per minute: correct characters, spaces included, divided by five, per minute. Needs a keyboard.', input: 'type', make: () => new TypeWords() },
  { id: 'dial', name: 'Dial', skill: 'dexterity', blurb: 'Type numbers on the number row.', how: 'A number appears: type it on the number row above the letters. They grow from four digits to eight. Scored on time per digit. Needs a keyboard.', input: 'type', make: () => new Dial() },
  { id: 'fingers', name: 'Fingers', skill: 'dexterity', blurb: 'A home-row pattern, typed three times. Watch it get faster.', how: 'A pattern of six home-row keys (A S D F J K L ;) appears. Type it, then type the same pattern twice more. Your fingers learn it as you go; the results show how much faster the third run is than the first. Needs a keyboard.', input: 'type', make: () => new Fingers() },
  { id: 'flip', name: 'Flip', skill: 'dexterity', blurb: 'Press the key mirrored across the keyboard from the one shown.', how: 'A letter appears. Press the key in the mirror position on the other hand: F gives J, Q gives P, A gives ;, V gives M. The first few show both on a keyboard. Needs a keyboard.', input: 'type', make: () => new Flip() },
  { id: 'sweep', name: 'Sweep', skill: 'dexterity', blurb: 'Run along a keyboard row and back.', how: 'Type every key of a row from left to right and back again: Q W E R T Y U I O P O I U ... Then the home row, then the bottom row. Scored on time per key. Needs a keyboard.', input: 'type', make: () => new Sweep() },
  { id: 'ghost', name: 'Ghost', skill: 'dexterity', blurb: 'A word flashes and hides. Type it.', how: 'A word appears for a moment, then hides. Type it from memory. One wrong letter loses the word. Get them right and the flash gets shorter; the score is the shortest look you can still type from. Needs a keyboard.', input: 'type', make: () => new Ghost() },
  { id: 'taps', name: 'Taps', skill: 'dexterity', blurb: 'Press each key the number of times shown: D×3 K×2.', how: 'A run like D×3 K×2 appears: press D three times, then K twice. Runs get longer. Counting presses on the fly is the point. Needs a keyboard.', input: 'type', make: () => new Taps() },
  { id: 'arrows', name: 'Arrows', skill: 'dexterity', blurb: 'Arrow-key sequences, quick and clean.', how: 'A sequence of arrows appears. Press them in order on the arrow keys. Sequences grow from four to eight. Scored on time per arrow. Needs a keyboard.', input: 'type', make: () => new Arrows() },
  { id: 'reverse', name: 'Reverse', skill: 'dexterity', blurb: 'Type the word backwards.', how: 'A word appears. Type it backwards, last letter first. Words get longer as you go. Needs a keyboard.', input: 'type', make: () => new Reverse() },
  { id: 'combo', name: 'Combo', skill: 'dexterity', blurb: 'Land a combo of letters, arrows and Space before the clock runs out.', how: 'A combo appears: letters (J K L F D), arrows and Space (shown as ␣). Press it in order before the bar runs out. One wrong key drops the combo. Combos get longer. Needs a keyboard.', input: 'type', make: () => new Combo() },
];

