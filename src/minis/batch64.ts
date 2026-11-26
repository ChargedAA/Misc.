// Sixty-fourth batch.
//   Twice    - one flash: press. Two flashes in quick succession: hold back.
//   Illusion - two lines dressed to fool the eye: which is really longer?
//   Lefty    - type words that use only one hand's half of the keyboard.
//   Oddword  - four words, three of a kind: which one does not belong?

import { COL_ACCENT, COL_DIM, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALSE, SND_TAP_L, SND_TAP_R, SND_TAP_WEAK } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, foreperiod, handLabel, header, mean, median, ms, pct, scaled, shuffle, sideOf, Stair, type Mini, type MiniDef, type MiniEnv, type MiniResult, plural } from './kit.ts';
import { WORDS } from './batch24.ts';

const TAU = Math.PI * 2;
const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const rint = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]!;
type Rect = [number, number, number, number];
const inside = (r: Rect, x: number, y: number) => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
const digitOf = (code: string) => (code.startsWith('Digit') ? code.slice(5) : code.startsWith('Numpad') ? code.slice(6) : '');

// --- Twice (temporal go / no-go) -------------------------------------------------------

const TWICE_TRIALS = 30;
const FLASH = 60;
/** The second flash of a pair follows this long after the first starts (ms). */
const PAIR_GAP = 140;

class Twice implements Mini {
  private env!: MiniEnv;
  private trial = 0;
  private due = 0;
  private double = false;
  private state = 0; // 0 waiting, 1 flashing / deciding, 2 feedback
  private at = 0;
  private rts: number[] = [];
  private falseGo = 0;
  private early = 0;
  private missed = 0;
  private held_ok = 0;
  private last = '';
  private held = 0;
  private firstAt = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.firstAt = now;
    this.arm(now);
  }

  private arm(now: number): void {
    this.due = now + foreperiod(700, 1000, 3500);
    this.double = Math.random() < 0.35;
    this.state = 0;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (this.state === 2) return;
    if (this.state === 0 || ts < this.due) {
      this.early++;
      this.last = 'too soon';
      this.env.sound(SND_FALSE);
      this.state = 2;
      this.at = ts + 800;
      return;
    }
    if (this.double) {
      this.falseGo++;
      this.last = 'that was two flashes';
      this.env.sound(SND_FALSE);
    } else {
      const rt = ts - this.due;
      this.rts.push(rt);
      this.last = ms(rt);
      this.env.sound(SND_TAP_WEAK);
    }
    this.trial++;
    this.state = 2;
    this.at = ts + 700;
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  pointer(_x: number, _y: number, ts: number): void {
    this.press(0, ts);
    this.release(0);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.due) this.state = 1;
    if (this.state === 1 && now - this.due > 1100) {
      if (this.double) {
        this.held_ok++;
        this.last = 'right: held back';
      } else {
        this.missed++;
        this.last = 'missed it';
        this.env.sound(SND_FALSE);
      }
      this.trial++;
      this.state = 2;
      this.at = now + 600;
    }
    if (this.state === 2 && now >= this.at) {
      if (this.trial >= scaled(TWICE_TRIALS)) return true;
      this.arm(now);
    }
    if (now - this.firstAt > 600000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'typical', this.rts.length ? ms(median(this.rts)) : '–', 'trial', `${Math.min(this.trial + 1, scaled(TWICE_TRIALS))} / ${scaled(TWICE_TRIALS)}`);
    const t = now - this.due;
    const on = this.state === 1 && ((t >= 0 && t < FLASH) || (this.double && t >= PAIR_GAP && t < PAIR_GAP + FLASH));
    ctx.fillStyle = on ? COL_LINE : '#18181c';
    ctx.beginPath();
    ctx.arc(a.cx, a.cy - 20 * a.u, 50 * a.u, 0, TAU);
    ctx.fill();
    ctx.fillStyle = this.state === 2 && /soon|two|missed/.test(this.last) ? COL_ACCENT : COL_MID;
    if (this.state === 2) v.text(this.last, a.cx, a.cy + 60 * a.u, v.fontTiny, 'center');
    if (this.trial === 0 && this.state === 0) {
      ctx.fillStyle = COL_MID;
      v.text('one flash: press any key, fast. two quick flashes: do nothing', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const m = median(this.rts);
    const doubles = this.falseGo + this.held_ok;
    return {
      score: this.rts.length ? Math.max(0, Math.round((700 - m) * 3) - (this.falseGo + this.early + this.missed) * 30) : 0,
      primary: { label: 'typical reaction', value: m, unit: 'ms', lower: true },
      lines: [
        { label: 'typical reaction', value: ms(m) },
        { label: 'held back on two flashes', value: doubles ? pct(this.held_ok / doubles) : '–' },
        { label: 'too soon', value: String(this.early) },
        { label: 'missed', value: String(this.missed) },
      ],
      saved: this.rts.length >= 5,
    };
  }
}

// --- Illusion --------------------------------------------------------------------------

const ILLUSION_TRIALS = 30;

class Illusion implements Mini {
  private env!: MiniEnv;
  /** How much longer the longer line really is (percent). */
  private readonly diff = new Stair(20, 2, 1, 40, 2);
  private levels: number[] = [];
  private trial = 0;
  /** 0 arrows (Müller-Lyer), 1 upright and level (vertical-horizontal), 2 rails (Ponzo). */
  private kind = 0;
  private longer = 0;
  private len = [0.5, 0.5];
  /** Which line gets the lengthening dress (0 or 1), against or with the truth. */
  private dressed = 0;
  private state = 0;
  private at = 0;
  private right = 0;
  private fooled = 0;
  private fooledOf = 0;
  private lastOk = true;
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.make(now);
  }

  private make(now: number): void {
    this.kind = rint(0, 2);
    this.longer = Math.random() < 0.5 ? 0 : 1;
    const base = rnd(0.32, 0.42);
    this.len = [base, base];
    this.len[this.longer] = base * (1 + this.diff.level / 100);
    this.dressed = Math.random() < 0.5 ? 0 : 1;
    this.state = 0;
    this.at = now;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (s === 0 || this.state !== 0) return;
    const said = s < 0 ? 0 : 1;
    const ok = said === this.longer;
    this.lastOk = ok;
    // The dress pushes toward the dressed line: count how often that wins when it is wrong.
    if (this.dressed !== this.longer) {
      this.fooledOf++;
      if (said === this.dressed) this.fooled++;
    }
    this.levels.push(this.diff.level);
    this.diff.update(ok, -1);
    if (ok) this.right++;
    this.env.sound(ok ? (s < 0 ? SND_TAP_L : SND_TAP_R) : SND_FALSE);
    this.trial++;
    this.state = 1;
    this.at = ts + (ok ? 400 : 1100);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 1 && now >= this.at) {
      if (this.trial >= scaled(ILLUSION_TRIALS)) return true;
      this.make(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'difference', `${this.diff.level}%`, 'pair', `${Math.min(this.trial + 1, scaled(ILLUSION_TRIALS))} / ${scaled(ILLUSION_TRIALS)}`);
    const S = Math.min(a.right - a.left, (a.bottom - a.top) * 1.3);
    const show = this.state === 1;
    const col = (k: number) => (show && k === this.longer ? COL_LINE : show ? COL_DIM : '#d6d6dc');
    ctx.lineWidth = 3 * dpr;
    ctx.lineCap = 'round';
    const line = (x0: number, y0: number, x1: number, y1: number) => {
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    };
    if (this.kind === 0) {
      // Two lines side by side; fins pointing out make a line look longer.
      for (let k = 0; k < 2; k++) {
        const L = this.len[k]! * S;
        const cx = a.cx + (k ? 1 : -1) * S * 0.27;
        const y = a.cy - 10 * a.u;
        ctx.strokeStyle = col(k);
        line(cx - L / 2, y, cx + L / 2, y);
        const out = k === this.dressed ? 1 : -1;
        const f = 16 * a.u;
        for (const e of [-1, 1]) {
          const ex = cx + (e * L) / 2;
          line(ex, y, ex + e * out * f, y - f);
          line(ex, y, ex + e * out * f, y + f);
        }
      }
    } else if (this.kind === 1) {
      // An inverted T: the upright line looks longer than the level one of the same length.
      const up = this.dressed;
      const Lh = this.len[up === 0 ? 1 : 0]! * S;
      const Lv = this.len[up]! * S;
      const base = a.cy + Lv / 2 - 10 * a.u;
      // Line 0 is drawn on the left of the pair of labels: map the upright to its index.
      ctx.strokeStyle = col(up === 0 ? 1 : 0);
      line(a.cx - Lh / 2, base, a.cx + Lh / 2, base);
      ctx.strokeStyle = col(up);
      line(a.cx, base, a.cx, base - Lv);
    } else {
      // Two converging rails; the line nearer where they meet looks longer.
      const top = a.top + 20 * a.u;
      const bot = a.bottom - 50 * a.u;
      ctx.strokeStyle = COL_DIM;
      ctx.lineWidth = 2 * dpr;
      line(a.cx - 12 * a.u, top, a.cx - S * 0.4, bot);
      line(a.cx + 12 * a.u, top, a.cx + S * 0.4, bot);
      ctx.lineWidth = 3 * dpr;
      for (let k = 0; k < 2; k++) {
        const near = k === this.dressed;
        const y = near ? top + (bot - top) * 0.32 : top + (bot - top) * 0.8;
        const L = this.len[k]! * S * 0.7;
        ctx.strokeStyle = col(k);
        line(a.cx - L / 2, y, a.cx + L / 2, y);
      }
    }
    ctx.lineCap = 'butt';
    ctx.fillStyle = this.state === 1 && !this.lastOk ? COL_ACCENT : COL_MID;
    const names = this.kind === 0 ? ['left', 'right'] : this.kind === 1 ? (this.dressed === 0 ? ['upright', 'level'] : ['level', 'upright']) : this.dressed === 0 ? ['upper', 'lower'] : ['lower', 'upper'];
    v.text(this.state === 1 && !this.lastOk ? `the ${names[this.longer]} line was longer` : 'which line is really longer? ignore what is around it', a.cx, a.bottom - 34 * a.u, v.fontTiny, 'center');
    const off = Math.min(200 * a.u, (a.right - a.left) / 2 - 30 * a.u);
    ctx.fillStyle = COL_MID;
    v.text(`${handLabel(this.env, -1)}  ${names[0]}`, a.cx - off, a.bottom - 6 * a.u, v.fontTiny, 'center');
    v.text(`${names[1]}  ${handLabel(this.env, 1)}`, a.cx + off, a.bottom - 6 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const th = this.levels.length >= 10 ? mean(this.levels.slice(-12)) : 0;
    return {
      score: th ? Math.max(0, Math.round((42 - th) * 50 + this.right * 5)) : 0,
      primary: { label: 'smallest difference seen through the illusion', value: Math.round(th), unit: '%', lower: true },
      lines: [
        { label: 'threshold (last 12)', value: th ? `${th.toFixed(0)}%` : '–' },
        { label: 'right', value: `${this.right} of ${this.trial}` },
        { label: 'fooled when the dress lied', value: this.fooledOf ? pct(this.fooled / this.fooledOf) : '–' },
      ],
      saved: this.trial >= 10,
    };
  }
}

// --- Lefty (one-hand words) ------------------------------------------------------------

const LEFTY_MS = 60000;
const LEFT_KEYS = new Set('qwertasdfgzxcvb');
const RIGHT_KEYS = new Set('yuiophjklnm');
const LEFT_WORDS = WORDS.filter((w) => w.length >= 3 && [...w].every((c) => LEFT_KEYS.has(c)));
const RIGHT_WORDS = WORDS.filter((w) => w.length >= 3 && [...w].every((c) => RIGHT_KEYS.has(c)));

class Lefty implements Mini {
  private env!: MiniEnv;
  private word = '';
  private side = -1;
  private pos = 0;
  private t0 = 0;
  private started = false;
  private chars = 0;
  private words = 0;
  private slips = 0;
  private bad = 0;
  private firstFrame = 0;

  start(env: MiniEnv): void {
    this.env = env;
    this.next();
  }

  private next(): void {
    // Mostly left-hand words; every fourth from the right hand's smaller set.
    this.side = this.words % 4 === 3 ? 1 : -1;
    this.word = pick(this.side < 0 ? LEFT_WORDS : RIGHT_WORDS);
    this.pos = 0;
  }

  press(): void {}

  typeKey(code: string, ts: number, key?: string): boolean {
    if (!code.startsWith('Key')) return false;
    if (!this.started) {
      this.started = true;
      this.t0 = ts;
    }
    if (ts - this.t0 >= scaled(LEFTY_MS)) return true;
    const ch = (key && key.length === 1 ? key : code.slice(3)).toLowerCase();
    if (ch === this.word[this.pos]) {
      this.pos++;
      this.chars++;
      if (this.pos >= this.word.length) {
        this.words++;
        this.env.sound(SND_TAP_WEAK);
        this.next();
      }
    } else {
      this.slips++;
      this.bad = ts + 200;
      this.env.sound(SND_FALSE);
    }
    return true;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    const len = scaled(LEFTY_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'words', String(this.words), 'time', `${left} s`);
    const size = Math.min(48 * a.u, (a.right - a.left) / (this.word.length + 2) / 0.62);
    ctx.font = `500 ${Math.round(size)}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cw = size * 0.62;
    const x0 = a.cx - (this.word.length * cw) / 2 + cw / 2;
    [...this.word].forEach((c, i) => {
      ctx.fillStyle = i < this.pos ? COL_DIM : i === this.pos ? (now < this.bad ? COL_ACCENT : COL_LINE) : COL_MID;
      ctx.fillText(c, x0 + i * cw, a.cy - 10 * a.u);
      if (i === this.pos) ctx.fillRect(x0 + i * cw - cw * 0.35, a.cy - 10 * a.u + size * 0.55, cw * 0.7, 2 * v.dpr);
    });
    ctx.fillStyle = COL_MID;
    v.text(this.side < 0 ? 'left hand only' : 'right hand only', a.cx, a.cy - 60 * a.u, v.fontTiny, 'center');
    v.text(this.started ? plural(this.slips, 'slip') : 'every word uses only one hand’s side of the keyboard; the clock starts on the first key', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const mins = Math.max(1, scaled(LEFTY_MS)) / 60000;
    const wpm = Math.round(this.chars / 5 / mins);
    return {
      score: Math.max(0, this.chars * 3 - this.slips * 10),
      primary: { label: 'words a minute', value: wpm, unit: 'wpm' },
      lines: [
        { label: 'words typed', value: String(this.words) },
        { label: 'words a minute (5 letters)', value: String(wpm) },
        { label: 'slips', value: String(this.slips) },
        { label: 'accuracy', value: this.chars + this.slips ? pct(this.chars / (this.chars + this.slips)) : '–' },
      ],
      saved: this.chars >= 10,
    };
  }
}

// --- Oddword ---------------------------------------------------------------------------

const ODD_MS = 60000;
const CATS: Record<string, string[]> = {
  fruit: ['apple', 'pear', 'plum', 'mango', 'grape', 'peach', 'lemon', 'cherry', 'banana', 'melon', 'kiwi', 'apricot'],
  animal: ['horse', 'tiger', 'rabbit', 'otter', 'zebra', 'camel', 'beaver', 'badger', 'donkey', 'monkey', 'wolf', 'moose'],
  colour: ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'violet', 'teal', 'maroon', 'beige', 'crimson', 'indigo'],
  tool: ['hammer', 'wrench', 'saw', 'drill', 'chisel', 'pliers', 'spanner', 'trowel', 'axe', 'shovel', 'rake', 'file'],
  body: ['elbow', 'ankle', 'wrist', 'knee', 'shoulder', 'thumb', 'chin', 'heel', 'spine', 'lung', 'liver', 'cheek'],
  weather: ['rain', 'snow', 'fog', 'hail', 'sleet', 'storm', 'drizzle', 'thunder', 'frost', 'breeze', 'gale', 'mist'],
  music: ['violin', 'flute', 'drum', 'cello', 'trumpet', 'harp', 'piano', 'oboe', 'banjo', 'tuba', 'guitar', 'viola'],
  furniture: ['chair', 'table', 'sofa', 'desk', 'shelf', 'stool', 'bench', 'dresser', 'wardrobe', 'cabinet', 'bed', 'couch'],
  sport: ['tennis', 'soccer', 'rugby', 'golf', 'hockey', 'cricket', 'boxing', 'rowing', 'skiing', 'judo', 'archery', 'cycling'],
  kitchen: ['spoon', 'ladle', 'whisk', 'kettle', 'skillet', 'grater', 'colander', 'spatula', 'teapot', 'toaster', 'blender', 'tongs'],
};
/** Pairs of categories close enough to make the odd one tricky. */
const NEAR: [string, string][] = [['fruit', 'colour'], ['music', 'furniture'], ['tool', 'kitchen'], ['animal', 'body'], ['sport', 'weather']];

class Oddword implements Mini {
  private env!: MiniEnv;
  private words: string[] = [];
  private odd = 0;
  private group = '';
  private oddCat = '';
  private boxes: Rect[] = [];
  private t0 = 0;
  private at = 0;
  private started = false;
  private ok = 0;
  private bad = 0;
  private rts: number[] = [];
  private flash = 0;
  private note = '';
  private firstFrame = 0;

  start(env: MiniEnv): void {
    this.env = env;
  }

  private make(now: number): void {
    const keys = Object.keys(CATS);
    let main: string;
    let other: string;
    if (this.ok >= 6 && Math.random() < 0.6) [main, other] = shuffle([...pick(NEAR)]) as [string, string];
    else {
      main = pick(keys);
      other = pick(keys.filter((k) => k !== main));
    }
    // Leave out words that would belong to both, such as orange (fruit and colour) or violin twice.
    const inMain = new Set(CATS[main]);
    const three = shuffle(CATS[main]!.filter((w) => !CATS[other]!.includes(w))).slice(0, 3);
    const one = pick(CATS[other]!.filter((w) => !inMain.has(w)));
    this.odd = rint(0, 3);
    this.words = [...three];
    this.words.splice(this.odd, 0, one);
    this.group = main;
    this.oddCat = other;
    this.at = now;
  }

  press(): void {}

  private pick(k: number, ts: number): void {
    if (!this.started) {
      this.started = true;
      this.t0 = ts;
      this.make(ts);
      return;
    }
    if (k === this.odd) {
      this.ok++;
      this.rts.push(ts - this.at);
      this.env.sound(SND_CATCH);
    } else {
      this.bad++;
      this.note = `${this.words[this.odd]} (${this.oddCat}) among ${this.group}`;
      this.flash = ts + 1500;
      this.env.sound(SND_FALSE);
    }
    this.make(ts);
  }

  typeKey(code: string, ts: number): boolean {
    const d = Number(digitOf(code));
    if (d >= 1 && d <= 4) {
      this.pick(d - 1, ts);
      return true;
    }
    if (!this.started && (code === 'Space' || code === 'Enter')) {
      this.pick(-1, ts);
      return true;
    }
    return false;
  }

  pointer(x: number, y: number, ts: number): void {
    if (!this.started) return this.pick(-1, ts);
    const k = this.boxes.findIndex((r) => inside(r, x, y));
    if (k >= 0) this.pick(k, ts);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    const len = scaled(ODD_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'right', String(this.ok), 'time', `${left} s`);
    if (this.started) {
      const bw = Math.min(150 * a.u, (a.right - a.left) / 4 - 12 * a.u);
      this.boxes = this.words.map((_, k) => [a.cx + (k - 2) * (bw + 12 * a.u) + 6 * a.u, a.cy - 40 * a.u, bw, 60 * a.u] as Rect);
      this.boxes.forEach(([x, y, w, h], k) => {
        ctx.strokeStyle = COL_DIM;
        ctx.lineWidth = 1.5 * dpr;
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = COL_LINE;
        v.text(this.words[k]!, x + w / 2, y + h / 2 + 6 * dpr, v.fontHud, 'center');
        ctx.fillStyle = COL_DIM;
        v.text(String(k + 1), x + 7 * dpr, y + 13 * dpr, v.fontTiny, 'left');
      });
    } else {
      ctx.fillStyle = COL_LINE;
      v.text('which word does not belong?', a.cx, a.cy - 10 * a.u, v.fontHud, 'center');
    }
    if (now < this.flash) {
      ctx.fillStyle = COL_ACCENT;
      v.text(this.note, a.cx, a.cy + 60 * a.u, v.fontTiny, 'center');
    }
    ctx.fillStyle = COL_MID;
    v.text(this.started ? 'three belong together: pick the odd one, 1 to 4 or a click' : 'click (or press Space) to start; a minute', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: Math.max(0, this.ok * 25 - this.bad * 30),
      primary: { label: 'right in a minute', value: this.ok, unit: '' },
      lines: [
        { label: 'right', value: String(this.ok) },
        { label: 'wrong', value: String(this.bad) },
        { label: 'typical time a set', value: this.rts.length ? ms(median(this.rts)) : '–' },
      ],
      saved: this.ok + this.bad >= 4,
    };
  }
}

export const BATCH64: MiniDef[] = [
  { id: 'twice', name: 'Twice', skill: 'reaction', blurb: 'One flash: press. Two flashes in quick succession: hold back.', how: 'A light flashes. If it flashes once, press any key (or tap) as fast as you can. If a second flash follows a split second later, do nothing. You cannot wait long to see which it is, so speed and restraint pull against each other. Thirty flashes.', input: 'both', make: () => new Twice() },
  { id: 'illusion', name: 'Illusion', skill: 'judgement', blurb: 'Two lines dressed to fool the eye. Which is really longer?', how: 'Two lines set up as classic illusions: arrow fins, an upright against a level line, or rails that converge. The dressing makes one line look longer; sometimes it is, sometimes not. Press the side of the line that really is longer. The true difference shrinks as you get them right. Thirty pairs.', input: 'keys', minKeys: 2, make: () => new Illusion() },
  { id: 'lefty', name: 'Lefty', skill: 'dexterity', blurb: 'Type words that use only one hand’s half of the keyboard.', how: 'Words made only from the keys under the left hand (like “great” or “water”), with a right-hand word now and then (like “union”). Type each exactly; the one hand does all the work, which shows up any weak fingers. A minute. Needs a keyboard.', input: 'type', make: () => new Lefty() },
  { id: 'oddword', name: 'Oddword', skill: 'reasoning', blurb: 'Four words, three of a kind. Which one does not belong?', how: 'Four words: three from one group (fruit, tools, weather, instruments…) and one from another. Pick the odd one (1 to 4, or click). After six right the groups come in tricky pairs, like fruit and colours. A minute; a mistake shows the answer.', input: 'pointer', make: () => new Oddword() },
];
