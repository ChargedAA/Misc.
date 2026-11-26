// Forty-second batch.
//   Safe  - turn a dial and listen: a faint click marks each number of the combination.
//   Rapid - words flash one at a time, faster and faster; then a question about what you read.
//   Relay - a word chain: each word starts with the last letter of the one before.
//   Kinds - words flash: living thing or not? Sort them as fast as you can.

import { COL_ACCENT, COL_DIM, COL_FAINT, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALSE, SND_TAP_L, SND_TAP_R, SND_TAP_WEAK } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, header, mean, median, ms, pct, scaled, sideOf, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';
import { VALID_WORDS } from './words-valid.ts';
import { ENGLISH_5K } from './words.ts';

const TAU = Math.PI * 2;
const rint = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]!;

// --- Safe ------------------------------------------------------------------------------

const SAFE_MS = 120000;

class Safe implements Mini {
  private env!: MiniEnv;
  private combo: number[] = [];
  private step = 0;
  /** The dial position (0..100), and its speed. */
  private pos = 0;
  private vel = 0;
  private lastTick = 0;
  private lastNow = 0;
  private held = 0;
  private opened = 0;
  private wrong = 0;
  private t0 = 0;
  private started = false;
  private openAt = 0;
  private times: number[] = [];
  private safeStart = 0;
  private note = '';
  private noteUntil = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.lastNow = now;
    this.newSafe(now);
  }

  private newSafe(now: number): void {
    const n = Math.min(4, 2 + Math.floor(this.opened / 2));
    this.combo = [];
    while (this.combo.length < n) {
      const c = rint(5, 95);
      if (this.combo.every((x) => Math.abs(x - c) > 10)) this.combo.push(c);
    }
    this.step = 0;
    this.safeStart = now;
  }

  press(slot: number, ts: number): void {
    const was = this.held;
    this.held |= 1 << slot;
    if (!this.started) {
      this.started = true;
      this.t0 = ts;
      this.safeStart = ts;
    }
    const L = (this.held & 0b111) !== 0;
    const R = (this.held & 0b111000) !== 0;
    // Both hands together: try this number (once per chord).
    if (L && R && !((was & 0b111) !== 0 && (was & 0b111000) !== 0)) this.tryNumber(ts);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  private tryNumber(ts: number): void {
    if (ts < this.openAt) return;
    const want = this.combo[this.step]!;
    const at = Math.round(this.pos) % 100;
    if (Math.abs(at - want) <= 1) {
      this.step++;
      this.env.sound(SND_TAP_R);
      this.note = `${this.step} of ${this.combo.length}`;
      this.noteUntil = ts + 900;
      if (this.step >= this.combo.length) {
        this.opened++;
        this.times.push((ts - this.safeStart) / 1000);
        this.env.sound(SND_CATCH);
        this.note = 'open';
        this.noteUntil = ts + 1200;
        this.openAt = ts + 1200;
        this.newSafe(ts + 1200);
      }
    } else {
      this.wrong++;
      this.step = 0;
      this.env.sound(SND_FALSE);
      this.note = 'wrong number: start the combination again';
      this.noteUntil = ts + 1300;
    }
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const len = scaled(SAFE_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.lastNow > 180000) return true;
    const dt = Math.min(0.05, (now - this.lastNow) / 1000);
    this.lastNow = now;
    const L = (this.held & 0b111) !== 0;
    const R = (this.held & 0b111000) !== 0;
    // One hand turns the dial; holding longer turns it faster.
    const want = L && !R ? -1 : R && !L ? 1 : 0;
    this.vel += (want * 22 - this.vel) * Math.min(1, dt * 6);
    this.pos = (this.pos + this.vel * dt + 100) % 100;
    const at = Math.round(this.pos) % 100;
    if (at !== this.lastTick) {
      this.lastTick = at;
      // Every number ticks; the right one clicks a little louder and higher.
      const target = this.combo[this.step];
      if (target !== undefined && at === target) this.env.tone?.(2400, 25, 0, 0.12);
      else if (Math.abs(this.vel) > 0.5) this.env.tone?.(1500, 12, 0, 0.035);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'safes opened', String(this.opened), 'time', `${left} s`);
    const R0 = Math.min(a.bottom - a.top, a.right - a.left) * 0.36;
    const cx = a.cx;
    const cy = a.cy;
    ctx.fillStyle = '#141417';
    ctx.beginPath();
    ctx.arc(cx, cy, R0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = COL_MID;
    ctx.lineWidth = 2 * dpr;
    ctx.stroke();
    for (let k = 0; k < 100; k++) {
      const t = ((k - this.pos) / 100) * TAU - Math.PI / 2;
      const big = k % 10 === 0;
      ctx.strokeStyle = big ? COL_LINE : COL_DIM;
      ctx.lineWidth = (big ? 2 : 1) * dpr;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(t) * R0 * 0.9, cy + Math.sin(t) * R0 * 0.9);
      ctx.lineTo(cx + Math.cos(t) * R0 * (big ? 0.78 : 0.84), cy + Math.sin(t) * R0 * (big ? 0.78 : 0.84));
      ctx.stroke();
      if (big) {
        ctx.fillStyle = COL_MID;
        v.text(String(k), cx + Math.cos(t) * R0 * 0.66, cy + Math.sin(t) * R0 * 0.66 + 5 * dpr, v.fontTiny, 'center');
      }
    }
    // The marker at the top.
    ctx.fillStyle = COL_ACCENT;
    ctx.beginPath();
    ctx.moveTo(cx, cy - R0 - 2 * dpr);
    ctx.lineTo(cx - 8 * dpr, cy - R0 - 16 * dpr);
    ctx.lineTo(cx + 8 * dpr, cy - R0 - 16 * dpr);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = COL_LINE;
    v.text(String(at), cx, cy + 6 * dpr, v.fontHud, 'center');
    // Progress through the combination.
    for (let k = 0; k < this.combo.length; k++) {
      ctx.fillStyle = k < this.step ? COL_LINE : COL_FAINT;
      ctx.fillRect(cx + (k - (this.combo.length - 1) / 2) * 22 * dpr - 7 * dpr, cy + R0 + 18 * dpr, 14 * dpr, 6 * dpr);
    }
    ctx.fillStyle = COL_MID;
    v.text(now < this.noteUntil ? this.note : 'turn with the left or right key; listen for the louder click, then press both keys', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    if (this.env.muted) {
      ctx.fillStyle = COL_ACCENT;
      v.text('needs sound on', a.cx, a.top + 4 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.opened * 100 - this.wrong * 5 > 0 ? this.opened * 100 - this.wrong * 5 : this.opened * 20,
      primary: { label: 'safes opened', value: this.opened, unit: '' },
      lines: [
        { label: 'safes opened', value: String(this.opened) },
        { label: 'wrong numbers tried', value: String(this.wrong) },
        { label: 'typical time a safe', value: this.times.length ? `${median(this.times).toFixed(1)} s` : '–' },
      ],
      saved: this.started && this.opened + this.wrong >= 1,
    };
  }
}

// --- Rapid (speed reading) -------------------------------------------------------------

const RAPID_ROUNDS = 10;
const THINGS = ['cat', 'dog', 'box', 'lamp', 'cup', 'book', 'chair', 'ball', 'key', 'hat', 'bike', 'bell'];
const COLOURS = ['red', 'blue', 'green', 'yellow', 'black', 'white'];
const PLACES = ['under', 'beside', 'behind', 'on'];

class Rapid implements Mini {
  private env!: MiniEnv;
  private round = 0;
  private wpm = 250;
  private words: string[] = [];
  private q = '';
  private truth = true;
  private state = 0; // 0 gap, 1 reading, 2 question, 3 feedback
  private at = 0;
  private next = 0;
  private best = 0;
  private right = 0;
  private held = 0;
  private last = '';

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.next = now + 800;
  }

  private make(): void {
    // Two short facts, then a question about one of them.
    const [a, b, c, d] = [...THINGS].sort(() => Math.random() - 0.5) as [string, string, string, string];
    const [ca, cb] = [...COLOURS].sort(() => Math.random() - 0.5) as [string, string];
    const p1 = pick(PLACES);
    const n = rint(2, 9);
    const s1 = `The ${ca} ${a} is ${p1} the ${b}.`;
    const s2 = `There are ${n} ${c}s next to the ${cb} ${d}.`;
    this.words = `${s1} ${s2}`.split(' ');
    const kind = rint(0, 3);
    this.truth = Math.random() < 0.5;
    if (kind === 0) this.q = `The ${a} is ${this.truth ? ca : COLOURS.find((x) => x !== ca && x !== cb)!}.`;
    else if (kind === 1) this.q = `The ${a} is ${this.truth ? p1 : PLACES.find((x) => x !== p1)!} the ${b}.`;
    else if (kind === 2) this.q = `There are ${this.truth ? n : n + rint(1, 3)} ${c}s.`;
    else this.q = `The ${this.truth ? cb : ca} thing is a ${d}.`;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (this.state !== 2 || s === 0) return;
    const said = s > 0;
    const ok = said === this.truth;
    if (ok) {
      this.right++;
      this.best = Math.max(this.best, this.wpm);
      this.wpm = Math.min(1500, Math.round(this.wpm * 1.18));
    } else {
      this.wpm = Math.max(150, Math.round(this.wpm * 0.85));
    }
    this.last = ok ? 'right' : `it was ${this.truth ? 'true' : 'false'}`;
    this.env.sound(ok ? SND_CATCH : SND_FALSE);
    this.round++;
    this.state = 3;
    this.next = ts + 1000;
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if ((this.state === 0 || this.state === 3) && now >= this.next) {
      if (this.round >= scaled(RAPID_ROUNDS)) return true;
      this.make();
      this.state = 1;
      this.at = now;
    }
    const per = 60000 / this.wpm;
    const k = Math.floor((now - this.at) / per);
    if (this.state === 1 && k >= this.words.length + 1) this.state = 2;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'speed', `${this.wpm} wpm`, 'passage', `${Math.min(this.round + 1, scaled(RAPID_ROUNDS))} / ${scaled(RAPID_ROUNDS)}`);
    ctx.font = `600 ${Math.round(46 * a.u)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (this.state === 1 && k >= 0 && k < this.words.length) {
      ctx.fillStyle = COL_LINE;
      ctx.fillText(this.words[k]!, a.cx, a.cy);
    } else if (this.state === 2) {
      ctx.font = `500 ${Math.round(28 * a.u)}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = COL_LINE;
      ctx.fillText(this.q, a.cx, a.cy);
      ctx.fillStyle = COL_MID;
      v.text('false (left)   ·   true (right)', a.cx, a.cy + 50 * a.u, v.fontTiny, 'center');
    } else if (this.state === 3) {
      ctx.fillStyle = COL_MID;
      v.text(this.last, a.cx, a.cy, v.fontHud, 'center');
    } else {
      ctx.fillStyle = COL_DIM;
      ctx.fillText('·', a.cx, a.cy);
    }
    if (this.round === 0 && this.state <= 1) {
      ctx.fillStyle = COL_MID;
      v.text('words flash one at a time. read them; a question follows', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.best + this.right * 10,
      primary: { label: 'fastest read and understood', value: this.best, unit: 'wpm' },
      lines: [
        { label: 'questions right', value: `${this.right} of ${this.round}` },
        { label: 'fastest speed answered right', value: this.best ? `${this.best} words a minute` : '–' },
      ],
      saved: this.round >= 3,
    };
  }
}

// --- Relay (word chain) ----------------------------------------------------------------

const RELAY_MS = 90000;
const RELAY_TURN = 8000;

class Relay implements Mini {
  private env!: MiniEnv;
  private word = '';
  private typed = '';
  private used = new Set<string>();
  private chain = 0;
  private longest = 0;
  private t0 = 0;
  private turnAt = 0;
  private started = false;
  private note = '';
  private noteUntil = 0;
  private times: number[] = [];
  private firstFrame = 0;
  private lens: number[] = [];

  start(env: MiniEnv): void {
    this.env = env;
    this.word = pick(ENGLISH_5K.filter((w) => w.length >= 4 && w.length <= 6 && /^[a-z]+$/.test(w) && !/[xzq]$/.test(w)));
    this.used.add(this.word);
  }

  press(): void {}

  typeKey(code: string, ts: number): boolean {
    if (!this.started && /^Key[A-Z]$/.test(code)) {
      this.started = true;
      this.t0 = ts;
      this.turnAt = ts;
    }
    if (/^Key[A-Z]$/.test(code)) {
      if (this.typed.length < 14) this.typed += code.slice(3).toLowerCase();
      return true;
    }
    if (code === 'Backspace') {
      this.typed = this.typed.slice(0, -1);
      return true;
    }
    if ((code === 'Enter' || code === 'Space') && this.typed) {
      const w = this.typed;
      const need = this.word[this.word.length - 1]!;
      let why = '';
      if (w[0] !== need) why = `it has to start with ${need.toUpperCase()}`;
      else if (w.length < 3) why = 'three letters or more';
      else if (!VALID_WORDS.has(w)) why = 'not in the word list';
      else if (this.used.has(w)) why = 'already used';
      if (why) {
        this.note = why;
        this.noteUntil = ts + 1100;
        this.env.sound(SND_FALSE);
      } else {
        this.chain++;
        this.longest = Math.max(this.longest, this.chain);
        this.times.push(ts - this.turnAt);
        this.lens.push(w.length);
        this.used.add(w);
        this.word = w;
        this.turnAt = ts;
        this.env.sound(SND_TAP_WEAK);
      }
      this.typed = '';
      return true;
    }
    return false;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    const len = scaled(RELAY_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    // Each word has its own short clock; letting it run out breaks the chain.
    if (this.started && now - this.turnAt > RELAY_TURN) {
      this.chain = 0;
      this.note = 'too slow: the chain starts again';
      this.noteUntil = now + 1400;
      this.word = pick(ENGLISH_5K.filter((w) => w.length >= 4 && w.length <= 6 && /^[a-z]+$/.test(w) && !/[xzq]$/.test(w)));
      this.turnAt = now;
      this.typed = '';
      this.env.sound(SND_FALSE);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'chain', String(this.chain), 'time', `${left} s`);
    ctx.font = `600 ${Math.round(40 * a.u)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COL_MID;
    const head = this.word.slice(0, -1).toUpperCase();
    const tail = this.word.slice(-1).toUpperCase();
    const wHead = ctx.measureText(head).width;
    const wAll = ctx.measureText(head + tail).width;
    ctx.textAlign = 'left';
    ctx.fillText(head, a.cx - wAll / 2, a.cy - 50 * a.u);
    ctx.fillStyle = COL_ACCENT;
    ctx.fillText(tail, a.cx - wAll / 2 + wHead, a.cy - 50 * a.u);
    ctx.textAlign = 'center';
    ctx.fillStyle = COL_LINE;
    ctx.fillText(this.typed ? this.typed.toUpperCase() : `${tail}_`, a.cx, a.cy + 30 * a.u);
    if (this.started) {
      const p = Math.min(1, (now - this.turnAt) / RELAY_TURN);
      ctx.fillStyle = COL_DIM;
      ctx.fillRect(a.cx - 120 * a.u, a.cy + 70 * a.u, 240 * a.u, 2 * dpr);
      ctx.fillStyle = p > 0.75 ? COL_ACCENT : COL_LINE;
      ctx.fillRect(a.cx - 120 * a.u, a.cy + 70 * a.u, 240 * a.u * (1 - p), 2 * dpr);
    }
    ctx.fillStyle = COL_MID;
    v.text(now < this.noteUntil ? this.note : this.started ? 'a word starting with the orange letter, then Enter' : 'type a word that starts with the orange letter, then Enter. a chain of words, each from the last', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const words = this.times.length;
    return {
      score: words * 50 + this.longest * 20,
      primary: { label: 'words chained', value: words, unit: '' },
      lines: [
        { label: 'words', value: String(words) },
        { label: 'longest chain', value: String(this.longest) },
        { label: 'typical time a word', value: this.times.length ? ms(median(this.times)) : '–' },
        { label: 'average word length', value: this.lens.length ? `${mean(this.lens).toFixed(1)} letters` : '–' },
      ],
      saved: this.started && words + 1 >= 2,
    };
  }
}

// --- Kinds (semantic sorting) ----------------------------------------------------------

const LIVING = ['horse', 'tiger', 'oak', 'rose', 'shark', 'eagle', 'ant', 'moss', 'whale', 'fern', 'frog', 'owl', 'mushroom', 'cactus', 'snail', 'tulip', 'lion', 'salmon', 'bee', 'pine', 'goat', 'crab', 'bamboo', 'ivy', 'mouse', 'daisy', 'wolf', 'octopus', 'maple', 'parrot'];
const OBJECTS = ['chair', 'spoon', 'brick', 'cloud', 'river', 'stone', 'ladder', 'piano', 'candle', 'kettle', 'mirror', 'rocket', 'sand', 'glass', 'wheel', 'coin', 'flame', 'clock', 'rope', 'shovel', 'iceberg', 'wire', 'paper', 'helmet', 'button', 'magnet', 'tunnel', 'statue', 'lantern', 'anchor'];
const KINDS_MS = 60000;

class Kinds implements Mini {
  private env!: MiniEnv;
  private word = '';
  private living = true;
  private at = 0;
  private t0 = 0;
  private started = false;
  private right = 0;
  private wrong = 0;
  private rts: number[] = [];
  private flash = 0;
  private flashOk = true;
  private held = 0;
  private firstFrame = 0;
  private lastWord = '';

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.newWord(now);
  }

  private newWord(now: number): void {
    for (;;) {
      this.living = Math.random() < 0.5;
      this.word = pick(this.living ? LIVING : OBJECTS);
      if (this.word !== this.lastWord) break;
    }
    this.lastWord = this.word;
    this.at = now;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (s === 0) return;
    if (!this.started) {
      this.started = true;
      this.t0 = ts;
      this.newWord(ts);
      return;
    }
    const ok = (s > 0) === this.living;
    if (ok) {
      this.right++;
      this.rts.push(ts - this.at);
      this.env.sound(s < 0 ? SND_TAP_L : SND_TAP_R);
    } else {
      this.wrong++;
      this.env.sound(SND_FALSE);
    }
    this.flash = ts + 200;
    this.flashOk = ok;
    this.newWord(ts);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    const len = scaled(KINDS_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'sorted', String(this.right), 'time', `${left} s`);
    ctx.font = `600 ${Math.round(48 * a.u)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = now < this.flash && !this.flashOk ? COL_ACCENT : COL_LINE;
    ctx.fillText(this.started ? this.word : 'living or not?', a.cx, a.cy - 20 * a.u);
    ctx.fillStyle = COL_MID;
    v.text('not living (left)', a.cx - 150 * a.u, a.cy + 50 * a.u, v.fontTiny, 'center');
    v.text('living (right)', a.cx + 150 * a.u, a.cy + 50 * a.u, v.fontTiny, 'center');
    if (!this.started) v.text('press either side to start; a minute of words', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const med = median(this.rts);
    return {
      score: Math.max(0, this.right * 10 - this.wrong * 20),
      primary: { label: 'words sorted right', value: this.right, unit: '' },
      lines: [
        { label: 'right', value: String(this.right) },
        { label: 'wrong', value: String(this.wrong) },
        { label: 'typical time a word', value: this.rts.length ? ms(med) : '–' },
        { label: 'accuracy', value: pct(this.right / Math.max(1, this.right + this.wrong)) },
      ],
      rts: this.rts,
      saved: this.right + this.wrong >= 5,
    };
  }
}

export const BATCH42: MiniDef[] = [
  { id: 'safe', name: 'Safe', skill: 'ear', blurb: 'Turn a dial and listen: a louder click marks each number of the combination.', how: 'Hold the left or right key to turn a safe’s dial; holding longer turns it faster. Every number ticks quietly, but the next number of the combination clicks louder and higher. When you hear it, press both keys together. A wrong number restarts the combination. Combinations get longer. Two minutes. Headphones help.', input: 'keys', minKeys: 2, make: () => new Safe() },
  { id: 'rapid', name: 'Rapid', skill: 'reasoning', blurb: 'Words flash one at a time, faster each time. Then a question about them.', how: 'Two short sentences flash one word at a time in the middle of the screen. Then a statement about them appears: is it true (right key) or false (left)? Each right answer speeds the words up; a wrong one slows them down. Scored on the fastest speed, in words a minute, at which you still understood.', input: 'keys', minKeys: 2, make: () => new Rapid() },
  { id: 'relay', name: 'Relay', skill: 'reasoning', blurb: 'A word chain: each word starts with the last letter of the one before.', how: 'A word appears with its last letter in orange. Type a word that starts with that letter and press Enter; then the next must start with your word’s last letter, and so on. No repeats; three letters or more. Each word has eight seconds, or the chain breaks. Ninety seconds.', input: 'type', make: () => new Relay() },
  { id: 'kinds', name: 'Kinds', skill: 'attention', blurb: 'Words flash: living thing or not? Sort them as fast as you can.', how: 'A word appears. If it names something living (an animal, a plant, a fungus), press right; if not, left. The next word comes straight away. A minute; scored on how many you sort right, with mistakes counting against you.', input: 'keys', minKeys: 2, make: () => new Kinds() },
];

