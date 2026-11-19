// Coordination games.
//   Strings - notes fall onto your strings: pluck taps, chords, streams and holds on time.
//   Split   - each hand steers its own dot through its own lane of falling blocks.

import { COL_ACCENT, COL_DIM, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALL, SND_FALSE, SND_LURCH, SND_RING, SND_TONE } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import {
  arena,
  clamp,
  footer,
  handLabel,
  header,
  message,
  pct,
  progress,
  sideOf,
  slotsOf,
  type Mini,
  type MiniDef,
  type MiniEnv,
  type MiniResult,
} from './kit.ts';

// --- Strings ----------------------------------------------------------------------

const PERFECT = 45;
const GOOD = 100;
const LATE = 130;

interface Note {
  lane: number;
  t: number;
  /** End time for a hold; equal to t for a tap. */
  end: number;
  /** Notes sharing a chord id are drawn joined. -1 for none. */
  chord: number;
  /** 0 waiting, 1 holding, 2 done */
  state: number;
}

const PHRASES = ['single', 'stream', 'roll', 'chord', 'hold', 'jack', 'single', 'stream', 'chord', 'rest'] as const;
type Phrase = (typeof PHRASES)[number];

class Strings implements Mini {
  private env!: MiniEnv;
  private slots: number[] = [];
  private lanes = 1;
  private t0 = 0;
  private notes: Note[] = [];
  private genT = 0;
  private chordId = 0;
  private lastPhrase: Phrase = 'rest';
  private phraseName = '';
  private phraseAt = -1e9;
  private health = 1;
  private score = 0;
  private combo = 0;
  private bestCombo = 0;
  private perfect = 0;
  private good = 0;
  private miss = 0;
  private stray = 0;
  private holdsDone = 0;
  private holdsBroken = 0;
  private offsets: number[] = [];
  private over = false;
  private overAt = 0;
  private g = 0;
  private held = 0;
  /** Per-lane vibration start time and strength. */
  private vibAt = new Float64Array(8);
  private vibAmp = new Float64Array(8);
  private judge = '';
  private judgeAt = 0;
  private judgeLane = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.slots = slotsOf(env.mode);
    this.lanes = this.slots.length;
    this.t0 = now + 1800;
    this.genT = 600;
  }

  /** Time for a note to fall from the top to the hit line. Shrinks as the run goes on. */
  private travel(g: number): number {
    return Math.max(850, 1650 - g / 160);
  }

  /** Base interval between notes, in ms. */
  private interval(t: number): number {
    const base = 470 - Math.min(300, t / 600) - (this.lanes >= 4 ? 30 : 0);
    return Math.max(125, base);
  }

  private add(lane: number, t: number, end = t, chord = -1): void {
    this.notes.push({ lane, t, end, chord, state: 0 });
  }

  private randLane(not = -1): number {
    if (this.lanes === 1) return 0;
    let l = Math.floor(Math.random() * this.lanes);
    if (l === not) l = (l + 1 + Math.floor(Math.random() * (this.lanes - 1))) % this.lanes;
    return l;
  }

  /** Lanes of each hand (the reflex lane counts as either). */
  private handLanes(side: number): number[] {
    const out: number[] = [];
    this.slots.forEach((s, i) => {
      const sd = sideOf(s);
      if (sd === side || sd === 0) out.push(i);
    });
    return out.length ? out : [0];
  }

  private generate(upTo: number): void {
    while (this.genT < upTo) {
      let p: Phrase;
      do p = PHRASES[Math.floor(Math.random() * PHRASES.length)]!;
      while (p === this.lastPhrase || (this.lanes === 1 && (p === 'chord' || p === 'roll')) || (this.genT < 3000 && p !== 'single'));
      this.lastPhrase = p;
      const iv = this.interval(this.genT) * (0.9 + Math.random() * 0.2);
      let t = this.genT;
      const len = 3500 + Math.random() * 2500;
      const stop = t + len;
      let prev = -1;
      // Mark the phrase so its name can show as it arrives.
      this.notes.push({ lane: -1, t, end: t, chord: PHRASES.indexOf(p), state: 2 });
      switch (p) {
        case 'single':
          while (t < stop) {
            prev = this.randLane(prev);
            this.add(prev, t);
            t += iv * (Math.random() < 0.3 ? 2 : 1);
          }
          break;
        case 'stream': {
          // Hand to hand: the core of fast alternation.
          const L = this.handLanes(-1);
          const R = this.handLanes(1);
          let side = 0;
          while (t < stop) {
            const pool = this.lanes === 1 ? [0] : side ? R : L;
            this.add(pool[Math.floor(Math.random() * pool.length)]!, t);
            side ^= 1;
            t += iv * 0.62;
          }
          break;
        }
        case 'roll': {
          let i = 0;
          const up = Math.random() < 0.5;
          while (t < stop) {
            const k = i % (this.lanes * 2 - 2 || 1);
            const lane = k < this.lanes ? k : this.lanes * 2 - 2 - k;
            this.add(up ? lane : this.lanes - 1 - lane, t);
            i++;
            t += iv * 0.55;
          }
          break;
        }
        case 'chord':
          while (t < stop) {
            const L = this.handLanes(-1);
            const R = this.handLanes(1);
            const a = L[Math.floor(Math.random() * L.length)]!;
            let b = R[Math.floor(Math.random() * R.length)]!;
            if (b === a) b = this.randLane(a);
            const id = this.chordId++;
            this.add(a, t, t, id);
            this.add(b, t, t, id);
            t += iv * 1.6;
          }
          break;
        case 'hold': {
          // One hand holds a string while the other keeps playing.
          const side = Math.random() < 0.5 ? -1 : 1;
          const hl = this.handLanes(side);
          const ol = this.lanes === 1 ? [] : this.handLanes(-side).filter((l) => !hl.includes(l) || this.lanes === 2);
          while (t < stop) {
            const lane = hl[Math.floor(Math.random() * hl.length)]!;
            const dur = 900 + Math.random() * 900;
            this.add(lane, t, t + dur);
            if (ol.length) for (let k = t + iv; k < t + dur - 80; k += iv * 0.9) this.add(ol[Math.floor(Math.random() * ol.length)]!, k);
            t += dur + iv * 1.2;
          }
          break;
        }
        case 'jack': {
          // The same string again and again: raw single-finger speed.
          while (t < stop) {
            const lane = this.randLane(prev);
            prev = lane;
            for (let k = 0; k < 4; k++) {
              this.add(lane, t);
              t += iv * 0.7;
            }
            t += iv;
          }
          break;
        }
        case 'rest':
          t = this.genT + 1200;
          break;
      }
      this.genT = Math.max(t, stop) + iv;
    }
    this.notes.sort((a, b) => a.t - b.t);
  }

  private hitFx(lane: number, good: boolean): void {
    this.vibAt[lane] = this.g;
    this.vibAmp[lane] = good ? 1 : 0.5;
    this.env.sound(SND_TONE + (lane % 7));
  }

  private say(text: string, lane: number): void {
    this.judge = text;
    this.judgeAt = this.g;
    this.judgeLane = lane;
  }

  private credit(dt: number, lane: number): void {
    const a = Math.abs(dt);
    this.offsets.push(dt);
    this.combo++;
    if (this.combo > this.bestCombo) this.bestCombo = this.combo;
    const mult = 1 + Math.min(this.combo, 100) / 50;
    if (a <= PERFECT) {
      this.perfect++;
      this.score += Math.round(300 * mult);
      this.health = Math.min(1, this.health + 0.025);
      this.say('perfect', lane);
    } else {
      this.good++;
      this.score += Math.round(100 * mult);
      this.health = Math.min(1, this.health + 0.01);
      this.say(dt < 0 ? 'early' : 'late', lane);
    }
    this.hitFx(lane, a <= PERFECT);
  }

  private lose(amount: number, lane: number, text: string): void {
    this.combo = 0;
    this.health -= amount;
    this.say(text, lane);
    this.env.sound(SND_FALSE);
    if (this.health <= 0 && !this.over) {
      this.over = true;
      this.overAt = this.g + 1400;
      this.env.sound(SND_FALL);
    }
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (this.over) return;
    const lane = this.slots.indexOf(slot);
    if (lane < 0) return;
    const g = ts - this.t0;
    let best: Note | null = null;
    for (const n of this.notes) {
      if (n.lane !== lane || n.state !== 0) continue;
      if (n.t - g > LATE) break;
      if (Math.abs(n.t - g) <= LATE) {
        best = n;
        break;
      }
    }
    if (!best) {
      this.stray++;
      this.health -= 0.02;
      this.vibAt[lane] = this.g;
      this.vibAmp[lane] = 0.25;
      return;
    }
    const dt = g - best.t;
    if (Math.abs(dt) > GOOD) {
      best.state = 2;
      this.miss++;
      this.lose(0.08, lane, dt < 0 ? 'too early' : 'too late');
      return;
    }
    best.state = best.end > best.t ? 1 : 2;
    this.credit(dt, lane);
  }

  release(slot: number, ts: number): void {
    this.held &= ~(1 << slot);
    const lane = this.slots.indexOf(slot);
    if (lane < 0) return;
    const g = ts - this.t0;
    for (const n of this.notes) {
      if (n.lane === lane && n.state === 1) {
        n.state = 2;
        if (g >= n.end - 140) {
          this.holdsDone++;
          this.score += 200;
          this.env.sound(SND_RING + 2);
        } else {
          this.holdsBroken++;
          this.lose(0.08, lane, 'let go early');
        }
      }
    }
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const g = (this.g = now - this.t0);
    if (this.over && g >= this.overAt) return true;
    const travel = this.travel(Math.max(0, g));
    if (!this.over) {
      this.generate(g + travel + 800);
      for (const n of this.notes) {
        if (n.t > g) break;
        if (n.lane < 0) {
          if (n.state === 2 && n.end <= g && n.chord >= 0) {
            this.phraseName = PHRASES[n.chord]!;
            this.phraseAt = g;
            n.chord = -1;
          }
          continue;
        }
        if (n.state === 0 && g - n.t > LATE) {
          n.state = 2;
          this.miss++;
          this.lose(n.end > n.t ? 0.12 : 0.1, n.lane, 'miss');
        } else if (n.state === 1 && g >= n.end) {
          // Held to the end: done, whenever the key comes up.
          n.state = 2;
          this.holdsDone++;
          this.score += 200;
          this.env.sound(SND_RING + 2);
        }
      }
      // Drop notes long gone.
      if (this.notes.length > 400) this.notes = this.notes.filter((n) => n.end > g - 1000 || n.state !== 2);
    }

    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'score', String(this.score), 'combo', String(this.combo));
    const span = Math.min(a.right - a.left, this.lanes * 120 * a.u);
    const x0 = a.cx - span / 2;
    const laneW = span / this.lanes;
    const top = a.top;
    const hitY = a.bottom - 40 * a.u;
    const pxPerMs = (hitY - top) / travel;
    // Tension: a thin line above the strings.
    progress(v, a.cx, top - 12 * dpr, span / 2, this.health, this.health < 0.3 ? COL_ACCENT : COL_MID);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0 - laneW, top, span + laneW * 2, hitY - top + 40 * dpr);
    ctx.clip();
    const xOf = (l: number) => Math.round(x0 + laneW * (l + 0.5)) + 0.5;
    // Strings, vibrating after a pluck. They sag as tension drops.
    const sag = (1 - clamp(this.health, 0, 1)) * 22 * dpr;
    for (let l = 0; l < this.lanes; l++) {
      const x = xOf(l);
      const age = g - this.vibAt[l]!;
      const amp = age < 400 ? this.vibAmp[l]! * 5 * dpr * (1 - age / 400) : 0;
      ctx.strokeStyle = (this.held & (1 << this.slots[l]!)) !== 0 ? COL_MID : COL_DIM;
      ctx.lineWidth = dpr;
      ctx.beginPath();
      for (let k = 0; k <= 24; k++) {
        const y = top + ((hitY - top) * k) / 24;
        const u = k / 24;
        const off = Math.sin(Math.PI * u) * (amp * Math.sin(age * 0.09) + sag * (l % 2 ? 1 : -1) * 0.3);
        if (k) ctx.lineTo(x + off, y);
        else ctx.moveTo(x + off, y);
      }
      ctx.stroke();
      ctx.fillStyle = COL_MID;
      v.text(this.env.labels[this.slots[l]!] ?? '', x, hitY + 30 * dpr, v.fontTiny, 'center');
    }
    // Hit line.
    ctx.fillStyle = COL_LINE;
    ctx.fillRect(x0, Math.round(hitY), span, dpr);
    // Notes.
    const r = Math.min(laneW * 0.22, 13 * a.u);
    const chordY = new Map<number, number[]>();
    for (const n of this.notes) {
      if (n.lane < 0) continue;
      const y = hitY - (n.t - g) * pxPerMs;
      if (y < top - 40 * dpr) break;
      const yEnd = hitY - (n.end - g) * pxPerMs;
      if (n.state === 2 && yEnd > hitY + 4 * dpr) continue;
      if (n.state === 2 && n.end === n.t) continue;
      const x = xOf(n.lane);
      if (n.end > n.t) {
        // A hold: a bar from start to end, filled while you hold it.
        const y0 = Math.max(top, yEnd);
        const y1 = n.state === 1 ? hitY : y;
        ctx.fillStyle = n.state === 1 ? COL_LINE : COL_MID;
        ctx.fillRect(x - r * 0.45, y0, r * 0.9, Math.max(0, y1 - y0));
        if (n.state === 0) {
          ctx.fillStyle = COL_LINE;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.fillStyle = COL_LINE;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (n.chord >= 0 && n.state === 0) {
        const list = chordY.get(n.chord) ?? [];
        list.push(x, y);
        chordY.set(n.chord, list);
      }
    }
    ctx.strokeStyle = COL_MID;
    ctx.lineWidth = 2 * dpr;
    for (const pts of chordY.values()) {
      if (pts.length < 4) continue;
      ctx.beginPath();
      ctx.moveTo(pts[0]!, pts[1]!);
      for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i]!, pts[i + 1]!);
      ctx.stroke();
    }
    ctx.restore();
    // Judgement, briefly, over the lane.
    if (g - this.judgeAt < 380) {
      ctx.fillStyle = this.judge === 'perfect' ? COL_LINE : COL_MID;
      v.text(this.judge, xOf(this.judgeLane), hitY - 26 * dpr, v.fontTiny, 'center');
    }
    if (g - this.phraseAt < 1600 && this.phraseName && this.phraseName !== 'single') {
      ctx.fillStyle = COL_MID;
      v.text(this.phraseName, x0 + span + 14 * dpr, top + 14 * dpr, v.fontTiny, 'left');
    }
    if (g < 0) message(v, { ...a, cy: (top + hitY) / 2 }, 'pluck each string as a note reaches the line', 'hold the long ones; chords together', COL_MID);
    if (this.over) message(v, { ...a, cy: (top + hitY) / 2 }, 'slack', `best combo ${this.bestCombo}`);
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const hits = this.perfect + this.good;
    const total = hits + this.miss;
    const meanOff = this.offsets.length ? this.offsets.reduce((s, x) => s + x, 0) / this.offsets.length : 0;
    return {
      score: this.score,
      primary: { label: 'survived', value: Math.max(0, this.g / 1000), unit: 's', decimals: 1 },
      lines: [
        { label: 'accuracy', value: total ? pct(hits / total) : '–' },
        { label: 'perfect / good / miss', value: `${this.perfect} / ${this.good} / ${this.miss}` },
        { label: 'best combo', value: String(this.bestCombo) },
        { label: 'holds kept', value: `${this.holdsDone} of ${this.holdsDone + this.holdsBroken}` },
        { label: 'stray presses', value: String(this.stray) },
        { label: 'you tend to be', value: `${Math.abs(Math.round(meanOff))} ms ${meanOff >= 0 ? 'late' : 'early'}` },
      ],
      saved: total >= 10,
    };
  }
}

// --- Split ------------------------------------------------------------------------

interface Block {
  side: number;
  lane: number;
  y: number;
  pickup: boolean;
  done: boolean;
}

class Split implements Mini {
  private env!: MiniEnv;
  /** Lane (0 or 1) of the left and right dot. */
  private pos = [0, 1];
  private blocks: Block[] = [];
  private t0 = 0;
  private last = 0;
  private speed = 0.32; // screen heights per second
  private nextSpawn = [0.6, 1.1];
  private lives = 3;
  private hitFlash = 0;
  private picks = 0;
  private dodged = 0;
  private over = false;
  private overAt = 0;
  private time = 0;
  private held = 0;
  private dotX = [0, 1];

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.t0 = now + 1200;
    this.last = now;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (this.over || ts < this.t0) return;
    const side = sideOf(slot);
    if (side === 0) return;
    const h = side < 0 ? 0 : 1;
    const keys = side < 0 ? this.env.mode.left : this.env.mode.right;
    if (keys >= 2) {
      // Two keys on a hand pick the lane directly: inner key for the inner lane.
      const idx = side < 0 ? slot : slot - 3;
      const inner = side < 0 ? idx === keys - 1 : idx === 0;
      this.pos[h] = side < 0 ? (inner ? 1 : 0) : inner ? 0 : 1;
    } else this.pos[h] = 1 - this.pos[h]!;
    this.env.sound(SND_TONE + (h * 3 + this.pos[h]!));
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.over && now >= this.overAt) return true;
    if (!this.over && now >= this.t0) {
      this.time += dt;
      this.speed = 0.32 + this.time * 0.006;
      for (let s = 0; s < 2; s++) {
        this.nextSpawn[s]! -= dt;
        if (this.nextSpawn[s]! <= 0) {
          const gap = Math.max(0.36, 1.25 - this.time * 0.012) * (0.7 + Math.random() * 0.6);
          this.nextSpawn[s] = gap;
          const pickup = Math.random() < 0.18;
          this.blocks.push({ side: s, lane: Math.random() < 0.5 ? 0 : 1, y: -0.05, pickup, done: false });
        }
      }
      for (const b of this.blocks) {
        b.y += this.speed * dt;
        if (!b.done && b.y >= 0.86 && b.y <= 0.92) {
          if (this.pos[b.side] === b.lane) {
            b.done = true;
            if (b.pickup) {
              this.picks++;
              this.env.sound(SND_CATCH);
            } else {
              this.lives--;
              this.hitFlash = now + 300;
              this.env.sound(SND_LURCH);
              if (this.lives <= 0) {
                this.over = true;
                this.overAt = now + 1300;
                this.env.sound(SND_FALL);
              }
            }
          }
        }
        if (!b.done && b.y > 0.92) {
          b.done = true;
          if (!b.pickup) this.dodged++;
        }
      }
      this.blocks = this.blocks.filter((b) => b.y < 1.1);
    }

    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'time', `${this.time.toFixed(1)} s`, 'pickups', String(this.picks), this.lives);
    const H = a.bottom - a.top;
    const colW = Math.min((a.right - a.left) / 2 - 20 * a.u, 200 * a.u);
    const laneW = colW / 2;
    const gap = 40 * a.u;
    const colX = [a.cx - gap / 2 - colW, a.cx + gap / 2];
    ctx.strokeStyle = COL_DIM;
    ctx.lineWidth = dpr;
    for (let s = 0; s < 2; s++) {
      for (let k = 0; k <= 2; k++) {
        const x = Math.round(colX[s]! + k * laneW) + 0.5;
        ctx.beginPath();
        ctx.moveTo(x, a.top);
        ctx.lineTo(x, a.bottom);
        ctx.stroke();
      }
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(colX[0]! - 4 * dpr, a.top, colW * 2 + gap + 8 * dpr, H);
    ctx.clip();
    for (const b of this.blocks) {
      if (b.done && b.pickup) continue;
      const x = colX[b.side]! + b.lane * laneW;
      const y = a.top + b.y * H;
      if (b.pickup) {
        ctx.strokeStyle = COL_LINE;
        ctx.lineWidth = 1.5 * dpr;
        const q = laneW * 0.16;
        ctx.beginPath();
        ctx.moveTo(x + laneW / 2, y - q);
        ctx.lineTo(x + laneW / 2 + q, y);
        ctx.lineTo(x + laneW / 2, y + q);
        ctx.lineTo(x + laneW / 2 - q, y);
        ctx.closePath();
        ctx.stroke();
      } else {
        ctx.fillStyle = COL_LINE;
        ctx.fillRect(x + laneW * 0.14, y - laneW * 0.12, laneW * 0.72, laneW * 0.24);
      }
    }
    ctx.restore();
    // The two dots, easing toward their lanes.
    for (let s = 0; s < 2; s++) {
      this.dotX[s]! += (this.pos[s]! - this.dotX[s]!) * Math.min(1, dt * 30);
      const x = colX[s]! + (this.dotX[s]! + 0.5) * laneW;
      const y = a.top + 0.89 * H;
      ctx.fillStyle = now < this.hitFlash ? COL_MID : COL_ACCENT;
      ctx.beginPath();
      ctx.arc(x, y, laneW * 0.16, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = COL_MID;
    v.text(handLabel(this.env, -1), colX[0]! + colW / 2, a.bottom + 18 * dpr, v.fontTiny, 'center');
    v.text(handLabel(this.env, 1), colX[1]! + colW / 2, a.bottom + 18 * dpr, v.fontTiny, 'center');
    if (now < this.t0) message(v, a, 'each hand moves its own dot', 'dodge the bars, catch the diamonds', COL_MID);
    if (this.over) message(v, a, `${this.time.toFixed(1)} s`, `${this.dodged} dodged`);
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: Math.round(this.time * 10) + this.picks * 25,
      primary: { label: 'survived', value: this.time, unit: 's', decimals: 1 },
      lines: [
        { label: 'survived', value: `${this.time.toFixed(1)} s` },
        { label: 'bars dodged', value: String(this.dodged) },
        { label: 'diamonds caught', value: String(this.picks) },
      ],
      saved: this.time > 3,
    };
  }
}

export const COORDINATION: MiniDef[] = [
  {
    id: 'strings',
    name: 'Strings',
    skill: 'coordination',
    blurb: 'Pluck notes on time: streams, chords, holds. Endless.',
    how: 'Each of your keys has a vertical line (a string), labelled with the key underneath. Notes slide down the strings: press a string\'s key as its note reaches the line at the bottom. Joined notes are chords: press those keys together. Long notes are holds: keep the key down until the note ends. Misses slacken the strings; when they go slack the run is over.',
    input: 'keys',
    make: () => new Strings(),
  },
  {
    id: 'split',
    name: 'Split',
    skill: 'coordination',
    blurb: 'Each hand steers its own dot. Dodge on both sides at once.',
    how: 'Your left hand moves the left dot, your right hand the right one, each between two lanes. Bars fall on both sides independently: dodge them, and catch the diamonds. With two keys on a hand, each key picks a lane. Three hits and it is over.',
    input: 'keys',
    minKeys: 2,
    make: () => new Split(),
  },
];
