// Frame loop glue: maps real time onto fixed sim ticks and feeds timestamped
// input to the tick it belongs to. Tick k covers real time
// [t0 + k * STEP_MS, t0 + (k + 1) * STEP_MS), and an input is applied before
// the first tick that starts at or after its timestamp. Because that mapping
// only depends on timestamps, a 60 Hz and a 240 Hz display produce the same run.

import { MAX_TICKS_PER_FRAME, STEP_MS } from './config.ts';
import type { Sim } from './sim.ts';

/** Actions 0..5 are lift keys (side * 3 + key index); 6 is the reflex key. */
export const ACT_REFLEX = 6;

const QUEUE_CAP = 256;

export class Runner {
  readonly sim: Sim;
  private readonly qTs = new Float64Array(QUEUE_CAP);
  private readonly qAct = new Uint8Array(QUEUE_CAP);
  private qHead = 0;
  private qLen = 0;
  /** Real time (ms) of sim tick 0. */
  private t0 = 0;
  private synced = false;
  private frozenAt = 0;
  /** Ticks simulated by the last frame() call (for the perf overlay). */
  lastTicks = 0;

  constructor(sim: Sim) {
    this.sim = sim;
  }

  /** Forget timing and queued input, e.g. after a reset. */
  restart(): void {
    this.synced = false;
    this.qLen = 0;
    this.frozenAt = 0;
  }

  /** Stop the clock (pause). Input arriving while frozen should not be pushed. */
  freeze(now: number): void {
    if (this.frozenAt === 0) this.frozenAt = now;
    this.qLen = 0;
  }

  /** Restart the clock so the paused stretch does not count. */
  thaw(now: number): void {
    if (this.frozenAt === 0) return;
    const gap = now - this.frozenAt;
    this.frozenAt = 0;
    if (this.synced) {
      this.t0 += gap;
      this.sim.shiftClock(gap);
    }
  }

  push(action: number, ts: number): void {
    if (this.qLen === QUEUE_CAP) return;
    const i = (this.qHead + this.qLen) % QUEUE_CAP;
    this.qTs[i] = ts;
    this.qAct[i] = action;
    this.qLen++;
  }

  /** Simulate up to `now`. Returns the interpolation factor for rendering. */
  frame(now: number): number {
    const sim = this.sim;
    if (!this.synced) {
      this.t0 = now - sim.tick * STEP_MS;
      this.synced = true;
    }
    let target = Math.floor((now - this.t0) / STEP_MS);
    const behind = target - sim.tick;
    if (behind > MAX_TICKS_PER_FRAME) {
      // Long hitch: drop the excess time rather than fast-forwarding the game.
      const drop = (behind - MAX_TICKS_PER_FRAME) * STEP_MS;
      this.t0 += drop;
      sim.shiftClock(drop);
      target = sim.tick + MAX_TICKS_PER_FRAME;
    }
    let ticks = 0;
    while (sim.tick < target) {
      const tickMs = this.t0 + sim.tick * STEP_MS;
      while (this.qLen > 0 && this.qTs[this.qHead]! <= tickMs) {
        const act = this.qAct[this.qHead]!;
        const ts = this.qTs[this.qHead]!;
        this.qHead = (this.qHead + 1) % QUEUE_CAP;
        this.qLen--;
        if (act === ACT_REFLEX) sim.reflex(ts);
        else sim.tap(act >= 3 ? 1 : 0, act >= 3 ? act - 3 : act, ts);
      }
      sim.step(tickMs);
      ticks++;
    }
    this.lastTicks = ticks;
    const alpha = (now - this.t0) / STEP_MS - sim.tick;
    return alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
  }
}
