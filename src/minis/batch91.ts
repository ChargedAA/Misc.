// Ninety-first batch.
//   Either - a light, a tone, or both at once: press the moment either comes. Which is fastest for you?

import { COL_ACCENT, COL_LINE, COL_MID } from '../config.ts';
import { SND_FALSE } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, foreperiod, header, median, ms, scaled, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const TAU = Math.PI * 2;

const EITHER_TRIALS = 30;

class Either implements Mini {
  private env!: MiniEnv;
  private trial = 0;
  private due = 0;
  /** 0 light, 1 tone, 2 both. */
  private kind = 0;
  private fired = false;
  private state = 0; // 0 waiting, 1 signal on, 2 feedback
  private at = 0;
  private rts: number[][] = [[], [], []];
  private early = 0;
  private last = '';
  private held = 0;
  private firstAt = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.firstAt = now;
    this.arm(now);
  }

  private arm(now: number): void {
    this.due = now + foreperiod(900, 1300, 4000);
    // With sound off, every signal is a light.
    this.kind = this.env.muted ? 0 : this.trial % 3 === 0 ? 2 : Math.random() < 0.5 ? 0 : 1;
    this.fired = false;
    this.state = 0;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (this.state === 2) return;
    if (this.state === 0) {
      this.early++;
      this.last = 'too soon';
      this.env.sound(SND_FALSE);
      this.state = 2;
      this.at = ts + 800;
      return;
    }
    // A tone alone reaches the ear a little after it starts: measure from when it was heard.
    const rt = ts - this.due - (this.kind === 1 ? (this.env.latency ?? 0) : 0);
    this.rts[this.kind]!.push(rt);
    this.last = ms(rt);
    this.trial++;
    this.state = 2;
    this.at = ts + 600;
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  pointer(_x: number, _y: number, ts: number): void {
    this.press(0, ts);
    this.release(0);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.due) {
      // The tone starts on the same frame the light would; its output delay is allowed for below.
      if (this.kind > 0 && !this.fired) this.env.tone?.(1000, 120, 0, 0.14);
      this.fired = true;
      this.state = 1;
    }
    if (this.state === 1 && now - this.due > 1500) {
      this.trial++;
      this.last = 'missed it';
      this.state = 2;
      this.at = now + 600;
    }
    if (this.state === 2 && now >= this.at) {
      if (this.trial >= scaled(EITHER_TRIALS)) return true;
      this.arm(now);
    }
    if (now - this.firstAt > 600000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const all = this.rts.flat();
    header(v, touch, 'typical', all.length ? ms(median(all)) : '–', 'signal', `${Math.min(this.trial + 1, scaled(EITHER_TRIALS))} / ${scaled(EITHER_TRIALS)}`);
    const lit = this.state === 1 && this.kind !== 1;
    ctx.fillStyle = lit ? COL_LINE : '#18181c';
    ctx.beginPath();
    ctx.arc(a.cx, a.cy - 20 * a.u, 46 * a.u, 0, TAU);
    ctx.fill();
    ctx.fillStyle = this.state === 2 && /soon|missed/.test(this.last) ? COL_ACCENT : COL_MID;
    if (this.state === 2) v.text(this.last, a.cx, a.cy + 54 * a.u, v.fontTiny, 'center');
    if (this.trial === 0 && this.state === 0) {
      ctx.fillStyle = COL_MID;
      v.text(this.env.muted ? 'sound is off: press when the light comes on' : 'press any key the moment the light comes on or the tone sounds, whichever comes', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const all = this.rts.flat();
    const [l, t, b] = this.rts.map((r) => (r.length ? median(r) : 0));
    return {
      score: all.length ? Math.max(0, Math.round((600 - median(all)) * 3) - this.early * 30) : 0,
      primary: { label: 'typical reaction', value: median(all), unit: 'ms', lower: true },
      lines: [
        { label: 'to the light', value: l ? ms(l) : '–' },
        { label: 'to the tone', value: t ? ms(t) : '–' },
        { label: 'to both at once', value: b ? ms(b) : '–' },
        { label: 'too soon', value: String(this.early) },
      ],
      saved: all.length >= 6,
    };
  }
}

export const BATCH91: MiniDef[] = [
  { id: 'either', name: 'Either', skill: 'reaction', blurb: 'A light, a tone, or both at once. Press the moment either comes. Which is fastest for you?', how: 'Sometimes the light comes on, sometimes a tone sounds, sometimes both together. Press any key (or tap) the instant either reaches you. Most people are quickest when both come at once. Thirty signals; your times to each are shown apart. With sound off, only the light is used.', input: 'both', make: () => new Either() },
];
