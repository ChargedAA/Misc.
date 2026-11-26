// Forty-fifth batch.
//   Changed - a short melody plays twice; one note is different the second time. Which?
//   Cancel  - a block of letters: click every E, as fast as you can.
//   Later   - clock arithmetic: what time will it be?

import { COL_ACCENT, COL_DIM, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALSE, SND_TAP_WEAK } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, header, mean, median, ms, pct, scaled, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const rint = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
type Rect = [number, number, number, number];
const inside = (r: Rect, x: number, y: number) => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const digitOf = (code: string) => (code.startsWith('Digit') ? code.slice(5) : code.startsWith('Numpad') ? code.slice(6) : '');

// --- Changed ---------------------------------------------------------------------------

const MAJOR = [0, 2, 4, 5, 7, 9, 11, 12];

class Changed implements Mini {
  private env!: MiniEnv;
  private len = 4;
  private best = 0;
  private lives = 3;
  private notes: number[] = [];
  private changedAt = 0;
  private second: number[] = [];
  private plan: { t: number; m: number; done: boolean; k: number; rep: number }[] = [];
  private state = 0; // 0 playing, 1 answering, 2 feedback
  private at = 0;
  private playing = -1;
  private boxes: Rect[] = [];
  private chosen = -1;
  private rounds = 0;
  private right = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.make(now + 600);
  }

  private make(at: number): void {
    const root = rint(55, 64);
    this.notes = Array.from({ length: this.len }, () => root + MAJOR[rint(0, MAJOR.length - 1)]!);
    this.changedAt = rint(0, this.len - 1);
    this.second = this.notes.slice();
    // A small step, in the same scale, so the tune still sounds plausible.
    const cur = this.notes[this.changedAt]!;
    const opts = MAJOR.map((d) => root + d).filter((m) => m !== cur && Math.abs(m - cur) <= (this.len > 6 ? 2 : 4));
    this.second[this.changedAt] = opts[rint(0, opts.length - 1)] ?? cur + 2;
    const step = 380;
    this.plan = [];
    for (let rep = 0; rep < 2; rep++) {
      const base = at + rep * (this.len * step + 700);
      (rep ? this.second : this.notes).forEach((m, k) => this.plan.push({ t: base + k * step, m, done: false, k, rep }));
    }
    this.at = at + 2 * this.len * step + 700;
    this.state = 0;
    this.chosen = -1;
  }

  press(): void {}

  private pick(k: number, ts: number): void {
    if (this.state !== 1 || k >= this.len) return;
    this.chosen = k;
    this.rounds++;
    const ok = k === this.changedAt;
    if (ok) {
      this.right++;
      this.best = Math.max(this.best, this.len);
      this.len = Math.min(10, this.len + 1);
      this.env.sound(SND_CATCH);
    } else {
      this.lives--;
      this.env.sound(SND_FALSE);
    }
    this.state = 2;
    this.at = ts + (ok ? 900 : 2000);
  }

  typeKey(code: string, ts: number): boolean {
    const d = Number(digitOf(code));
    if (d >= 1 && d <= 9) {
      this.pick(d - 1, ts);
      return true;
    }
    if (code === 'Digit0' || code === 'Numpad0') {
      this.pick(9, ts);
      return true;
    }
    return false;
  }

  pointer(x: number, y: number, ts: number): void {
    const k = this.boxes.findIndex((r) => inside(r, x, y));
    if (k >= 0) this.pick(k, ts);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    this.playing = -1;
    for (const p of this.plan) {
      if (!p.done && now >= p.t) {
        p.done = true;
        this.env.note?.(hz(p.m), 340, 0);
      }
      if (now >= p.t && now < p.t + 340) this.playing = p.k;
    }
    if (this.state === 0 && now >= this.at) this.state = 1;
    if (this.state === 2 && now >= this.at) {
      if (this.lives <= 0) return true;
      this.make(now + 500);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'notes', String(this.len), 'best', String(this.best), this.lives);
    const bw = Math.min(64 * a.u, (a.right - a.left - 20 * a.u) / this.len - 8 * a.u);
    this.boxes = Array.from({ length: this.len }, (_, k) => [a.cx + (k - this.len / 2) * (bw + 8 * a.u) + 4 * a.u, a.cy - bw / 2, bw, bw] as Rect);
    this.boxes.forEach((r, k) => {
      const show = this.state === 2;
      ctx.fillStyle = k === this.playing ? COL_LINE : '#151518';
      ctx.fillRect(r[0], r[1], r[2], r[3]);
      ctx.strokeStyle = show && k === this.changedAt ? COL_LINE : show && k === this.chosen ? COL_ACCENT : COL_DIM;
      ctx.lineWidth = (show && (k === this.changedAt || k === this.chosen) ? 3 : 1.5) * dpr;
      ctx.strokeRect(r[0], r[1], r[2], r[3]);
      ctx.fillStyle = k === this.playing ? '#0a0a0b' : COL_MID;
      v.text(String((k + 1) % 10), r[0] + r[2] / 2, r[1] + r[3] / 2 + 6 * dpr, v.fontHud, 'center');
    });
    ctx.fillStyle = COL_MID;
    const rep = this.plan.find((p) => !p.done)?.rep ?? 1;
    v.text(this.state === 0 ? (rep === 0 ? 'listen…' : 'and again: one note is different') : this.state === 1 ? 'which note changed? (its number, or tap)' : this.chosen === this.changedAt ? 'right' : `it was note ${this.changedAt + 1}`, a.cx, a.cy + 70 * a.u, v.fontTiny, 'center');
    if (this.env.muted) {
      ctx.fillStyle = COL_ACCENT;
      v.text('needs sound on', a.cx, a.top + 10 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.best * 100 + this.right * 10,
      primary: { label: 'longest tune followed', value: this.best, unit: 'notes' },
      lines: [
        { label: 'longest tune where you caught the change', value: this.best ? `${this.best} notes` : '–' },
        { label: 'right', value: `${this.right} of ${this.rounds}` },
      ],
      saved: this.rounds >= 2,
    };
  }
}

// --- Cancel (letter cancellation) ------------------------------------------------------

const CANCEL_ROUNDS = 3;
const FILLER = 'ACDFHKMNORSTUVXZ';

class Cancel implements Mini {
  private env!: MiniEnv;
  private round = 0;
  private grid: string[] = [];
  private found = new Set<number>();
  private wrongs = new Set<number>();
  private cols = 20;
  private rows = 10;
  private t0 = 0;
  private started = false;
  private cells: Rect[] = [];
  private times: number[] = [];
  private totalTargets = 0;
  private hits = 0;
  private falseClicks = 0;
  private roundEnd = 0;
  private firstFrame = 0;

  start(env: MiniEnv): void {
    this.env = env;
    this.build();
  }

  private build(): void {
    // Targets: E, with lookalikes (F, B, P, R) mixed in as the rounds go on.
    const look = this.round >= 1 ? 'FBPR' : '';
    const pool = FILLER + look + look;
    this.grid = Array.from({ length: this.cols * this.rows }, () => (Math.random() < 0.12 ? 'E' : pool[rint(0, pool.length - 1)]!));
    this.found = new Set();
    this.wrongs = new Set();
    this.totalTargets += this.grid.filter((c) => c === 'E').length;
  }

  press(): void {}

  pointer(x: number, y: number, ts: number): void {
    if (!this.started) {
      this.started = true;
      this.t0 = ts;
    }
    if (ts < this.roundEnd) return;
    const k = this.cells.findIndex((r) => inside(r, x, y));
    if (k < 0 || this.found.has(k) || this.wrongs.has(k)) return;
    if (this.grid[k] === 'E') {
      this.found.add(k);
      this.hits++;
      this.env.sound(SND_TAP_WEAK);
      if (this.found.size === this.grid.filter((c) => c === 'E').length) {
        this.times.push((ts - this.t0) / 1000);
        this.round++;
        this.env.sound(SND_CATCH);
        this.roundEnd = ts + 800;
      }
    } else {
      this.wrongs.add(k);
      this.falseClicks++;
      this.env.sound(SND_FALSE);
    }
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    if (this.roundEnd && now >= this.roundEnd) {
      this.roundEnd = 0;
      if (this.round >= scaled(CANCEL_ROUNDS)) return true;
      this.build();
      this.t0 = now;
    }
    if (now - this.firstFrame > 300000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const left = this.grid.filter((c, k) => c === 'E' && !this.found.has(k)).length;
    header(v, touch, 'Es left', String(left), 'sheet', `${Math.min(this.round + 1, scaled(CANCEL_ROUNDS))} / ${scaled(CANCEL_ROUNDS)}`);
    const cw = (a.right - a.left) / this.cols;
    const ch = Math.min(cw * 1.25, (a.bottom - a.top - 30 * a.u) / this.rows);
    const y0 = a.top + 6 * a.u;
    ctx.font = `600 ${Math.round(Math.min(cw, ch) * 0.62)}px ui-monospace, 'JetBrains Mono', Menlo, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    this.cells = [];
    this.grid.forEach((c, k) => {
      const x = a.left + (k % this.cols) * cw;
      const y = y0 + Math.floor(k / this.cols) * ch;
      this.cells.push([x, y, cw, ch]);
      ctx.fillStyle = this.found.has(k) ? COL_DIM : this.wrongs.has(k) ? COL_ACCENT : COL_LINE;
      ctx.fillText(c, x + cw / 2, y + ch / 2);
      if (this.found.has(k)) {
        ctx.strokeStyle = COL_ACCENT;
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        ctx.moveTo(x + cw * 0.2, y + ch * 0.75);
        ctx.lineTo(x + cw * 0.8, y + ch * 0.25);
        ctx.stroke();
      }
    });
    ctx.fillStyle = COL_MID;
    v.text(this.started ? `${this.started ? ((now - this.t0) / 1000).toFixed(1) : '0.0'} s  ·  click every E` : 'click every letter E, as fast as you can. the clock starts with your first click', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const t = this.times.length ? mean(this.times) : 0;
    return {
      score: this.times.length ? Math.round(Math.max(0, 90 - t) * 20 - this.falseClicks * 20) : 0,
      primary: { label: 'time a sheet', value: t, unit: 's', lower: true, decimals: 1 },
      lines: [
        { label: 'sheets cleared', value: String(this.times.length) },
        { label: 'time a sheet', value: this.times.length ? this.times.map((x) => `${x.toFixed(1)} s`).join('  ·  ') : '–' },
        { label: 'wrong letters clicked', value: String(this.falseClicks) },
        { label: 'Es found', value: `${this.hits} of ${this.totalTargets}` },
      ],
      saved: this.times.length >= 1,
    };
  }
}

// --- Later (clock arithmetic) ----------------------------------------------------------

const LATER_ROUNDS = 12;

class Later implements Mini {
  private env!: MiniEnv;
  private round = 0;
  private start0 = 0;
  private add = 0;
  private back = false;
  private truth = 0;
  private typed = '';
  private state = 0;
  private at = 0;
  private right = 0;
  private rts: number[] = [];
  private errs: number[] = [];

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.arm(now);
  }

  private arm(now: number): void {
    // Start time and a duration in hours and minutes; later ones go back in time or cross midnight.
    this.start0 = rint(0, 23) * 60 + rint(0, 11) * 5 + (this.round >= 6 ? rint(0, 4) : 0);
    this.add = rint(0, 9) * 60 + (this.round < 4 ? rint(1, 11) * 5 : rint(1, 59));
    this.back = this.round >= 8 && Math.random() < 0.4;
    this.truth = (((this.start0 + (this.back ? -this.add : this.add)) % 1440) + 1440) % 1440;
    this.typed = '';
    this.state = 0;
    this.at = now;
  }

  press(): void {}

  typeKey(code: string, ts: number): boolean {
    const d = digitOf(code);
    if (this.state !== 0) return !!d;
    if (d) {
      if (this.typed.length < 4) this.typed += d;
      if (this.typed.length === 4) this.check(ts);
      return true;
    }
    if (code === 'Backspace') {
      this.typed = this.typed.slice(0, -1);
      return true;
    }
    if ((code === 'Enter' || code === 'NumpadEnter') && this.typed.length >= 3) {
      this.check(ts);
      return true;
    }
    return false;
  }

  private check(ts: number): void {
    const t = this.typed.padStart(4, '0');
    const said = (Number(t.slice(0, 2)) % 24) * 60 + Number(t.slice(2));
    let e = Math.abs(said - this.truth);
    e = Math.min(e, 1440 - e);
    this.errs.push(e);
    if (e === 0) {
      this.right++;
      this.rts.push(ts - this.at);
    }
    this.env.sound(e === 0 ? SND_CATCH : SND_FALSE);
    this.round++;
    this.state = 1;
    this.at = ts + (e === 0 ? 800 : 1800);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 1 && now >= this.at) {
      if (this.round >= scaled(LATER_ROUNDS)) return true;
      this.arm(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const dur = `${Math.floor(this.add / 60) ? `${Math.floor(this.add / 60)} h ` : ''}${this.add % 60} min`;
    header(v, touch, 'right', String(this.right), 'question', `${Math.min(this.round + 1, scaled(LATER_ROUNDS))} / ${scaled(LATER_ROUNDS)}`);
    ctx.font = `600 ${Math.round(40 * a.u)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COL_LINE;
    ctx.fillText(`It is ${hhmm(this.start0)}.`, a.cx, a.cy - 70 * a.u);
    ctx.font = `500 ${Math.round(28 * a.u)}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = COL_MID;
    ctx.fillText(this.back ? `What time was it ${dur} ago?` : `What time will it be in ${dur}?`, a.cx, a.cy - 20 * a.u);
    const t = this.typed.padEnd(4, '_');
    ctx.font = `600 ${Math.round(46 * a.u)}px ui-monospace, 'JetBrains Mono', Menlo, monospace`;
    ctx.fillStyle = this.state === 1 ? (this.errs[this.errs.length - 1] === 0 ? COL_LINE : COL_ACCENT) : COL_LINE;
    ctx.fillText(`${t.slice(0, 2)}:${t.slice(2)}`, a.cx, a.cy + 50 * a.u);
    if (this.state === 1 && this.errs[this.errs.length - 1] !== 0) {
      ctx.fillStyle = COL_MID;
      v.text(`it is ${hhmm(this.truth)}`, a.cx, a.cy + 95 * a.u, v.fontTiny, 'center');
    }
    if (this.round === 0 && this.state === 0) {
      ctx.fillStyle = COL_MID;
      v.text('type the time as four digits on the 24-hour clock (0930, 1745)', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.right * 80 + (this.rts.length ? Math.round(Math.max(0, 15000 - median(this.rts)) / 50) : 0),
      primary: { label: 'right', value: this.right, unit: `of ${this.round}` },
      lines: [
        { label: 'exactly right', value: `${this.right} of ${this.round}  (${pct(this.right / Math.max(1, this.round))})` },
        { label: 'typical time when right', value: this.rts.length ? ms(median(this.rts)) : '–' },
        { label: 'average miss when wrong', value: this.errs.filter((e) => e > 0).length ? `${Math.round(mean(this.errs.filter((e) => e > 0)))} min` : '–' },
      ],
      saved: this.round >= 3,
    };
  }
}

export const BATCH45: MiniDef[] = [
  { id: 'changed', name: 'Changed', skill: 'ear', blurb: 'A melody plays twice; one note is different the second time. Which?', how: 'A short tune plays, then again with one note changed. Press the number of the note that changed (or tap it). Each catch adds a note to the next tune, and long tunes change by smaller steps. Three wrong ends it. Needs sound on.', input: 'pointer', make: () => new Changed() },
  { id: 'cancel', name: 'Cancel', skill: 'attention', blurb: 'A block of letters: click every E, as fast as you can.', how: 'A sheet of random letters. Click every letter E; each one gets crossed out. Wrong letters count against you. From the second sheet, lookalikes (F, B, P, R) join in. Three sheets, timed from your first click. A classic test of focused visual search.', input: 'pointer', make: () => new Cancel() },
  { id: 'later', name: 'Later', skill: 'reasoning', blurb: 'Clock arithmetic: what time will it be?', how: 'A time and a span: what time will it be after it (or was it before, later on)? Type the answer as four digits on the 24-hour clock, like 0930 or 1745. Spans cross the hour, then midnight, and the minutes get less round. Twelve questions. Needs a keyboard.', input: 'type', make: () => new Later() },
];
