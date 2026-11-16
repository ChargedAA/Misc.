// Fixed-timestep simulation. No DOM, no allocation inside step(): everything
// lives in preallocated typed arrays so the same code runs in the browser and
// headless under node (tests, tuning bot).

import {
  ANTICIPATION_MS,
  BALL_BOUNCE,
  BALL_DRAG,
  BALL_G,
  BALL_LIMIT,
  BALL_R,
  BASE_Y,
  BEAM_HALF,
  BURST_GRACE,
  BURST_LEAD,
  CUE_SLIP,
  DT,
  END_DRAG,
  FALSE_START_JOLT,
  HOVER_MID,
  LIFT,
  LURCH,
  RATE_WINDOW,
  REPEAT_LIFT,
  SAG,
  SAG_K,
  SCORE_PER_M,
  TRAVEL,
  ZONE_MULT,
  clamp,
  climbSpeed,
  difficulty,
  getMode,
  lerp,
  type ModeDef,
} from './config.ts';
import { RateMeter } from './rate.ts';
import { Rng } from './rng.ts';

// One-shot effect flags, set by the sim and consumed by the shell (audio).
export const FX_CATCH = 1;
export const FX_LURCH = 2;
export const FX_FALSE = 4;
export const FX_FALL = 8;
export const FX_BURST_OK = 16;
export const FX_BURST_FAIL = 32;
export const FX_ZONE = 64;
export const FX_BURST_START = 128;
export const FX_CUE_MISS = 256;

export const PHASE_READY = 0;
export const PHASE_RUN = 1;
export const PHASE_FALL = 2;
export const PHASE_OVER = 3;

export const BURST_NONE = 0;
export const BURST_LEADIN = 1;
export const BURST_ACTIVE = 2;
export const BURST_OUT = 3;

export const HOLE_CAP = 256;
export const ZONE_CAP = 16;
export const TRAIL_CAP = 64;
const TRAIL_EVERY = 4;
const RT_CAP = 4096;
const GEN_AHEAD = 18;
const BEAM_LEN = BEAM_HALF * 2;
const BALL_DRAG_K = Math.exp(-BALL_DRAG * DT);
const SHAKE_K = Math.exp(-9 * DT);
const FALL_TIME = 0.85;
const BURST_OUT_TIME = 0.5;
const LANE_LIM = BALL_LIMIT - 0.9;
const HOLE_X_LIM = BEAM_HALF - 0.25;
/** Key id used in the tap log: side * 3 + key index. */
export const KEY_SLOTS = 6;

export class Sim {
  mode: ModeDef = getMode(2);
  seed = 1;
  /** When true the cue counts as drawn the tick it starts (tests, bot). */
  headless = false;

  phase = PHASE_READY;
  tick = 0;
  /** Ticks since the first tap; run time is runTicks * DT. */
  runTicks = 0;
  time = 0;

  // Camera / climb (world y of the bottom of the view).
  climb = 0;
  climbPrev = 0;

  // Beam ends: [left, right], h normalised to [0, 1].
  readonly h = new Float64Array(2);
  readonly hPrev = new Float64Array(2);
  readonly v = new Float64Array(2);
  readonly lastKey = new Int8Array(2);
  fixedRight = false;
  heavy = 1;

  // Ball.
  ballX = 0;
  ballXPrev = 0;
  ballV = 0;
  ballY = 0;

  // Fall animation.
  fallT = 0;
  fallFromX = 0;
  fallFromY = 0;
  fallToX = 0;
  fallToY = 0;

  // Score.
  score = 0;
  height = 0;
  mult = 1;
  zoneTime = 0;
  shake = 0;
  fx = 0;

  // Reaction cue.
  cueActive = false;
  cueSide = 0;
  /** performance.now() at the frame the cue was first drawn; 0 until then. */
  cueDrawnAt = 0;
  cueWindow = 0;
  nextCueAt = 0;
  cueCount = 0;
  cueHits = 0;
  cueMisses = 0;
  falseStarts = 0;
  lastRt = 0;
  lastRtSide = 0;
  /** Ticks since the last successful reaction (for the brief ms readout). */
  lastRtAge = 1e9;
  readonly rt = new Float32Array(RT_CAP);
  rtCount = 0;

  // Heavy pull (CPS burst).
  burstState = BURST_NONE;
  burstT = 0;
  burstTarget = 0;
  burstNeed = 0;
  burstProgress = 0;
  burstCount = 0;
  burstsWon = 0;
  burstsLost = 0;
  nextBurstY = Infinity;
  private heavyFrom = 1;
  private heavyGoal = 1;
  readonly burstLag = new Float64Array(2);
  readonly burstRate = new Float64Array(2);
  readonly burstOk = new Uint8Array(2);
  readonly meters = [new RateMeter(RATE_WINDOW), new RateMeter(RATE_WINDOW)] as const;

  // Board: holes and target zones in ring buffers.
  readonly hx = new Float32Array(HOLE_CAP);
  readonly hy = new Float32Array(HOLE_CAP);
  readonly hr = new Float32Array(HOLE_CAP);
  holeStart = 0;
  holeCount = 0;
  readonly zx = new Float32Array(ZONE_CAP); // centre x
  readonly zy = new Float32Array(ZONE_CAP); // bottom y
  readonly zw = new Float32Array(ZONE_CAP);
  readonly zh = new Float32Array(ZONE_CAP);
  zoneStart = 0;
  zoneCount = 0;
  /** Ring index of the zone the ball is in, or -1. */
  zoneIn = -1;

  // Generator state.
  private readonly rngBoard = new Rng();
  private readonly rngEvent = new Rng();
  private laneY0 = 0;
  private laneX0 = 0;
  private laneY1 = 0;
  private laneX1 = 0;
  private laneY2 = 0;
  private laneX2 = 0;
  private nextZoneY = 0;
  private burstGenY = 0;
  private sparseFromY = Infinity;
  private sparseUntilY = -Infinity;

  // Ball trail in board space.
  readonly trailX = new Float32Array(TRAIL_CAP);
  readonly trailY = new Float32Array(TRAIL_CAP);
  trailHead = 0;
  trailCount = 0;

  // Tap log (ms since run start, pauses excluded) for the end-of-run stats.
  tapT = new Float64Array(8192);
  tapKey = new Uint8Array(8192);
  tapCount = 0;
  repeats = 0;
  /** Real-time ms of the tick that started the run. */
  startMs = 0;

  constructor() {
    this.reset(2, 1);
  }

  reset(modeId: number, seed: number): void {
    this.mode = getMode(modeId);
    this.seed = seed >>> 0;
    this.rngBoard.seed(this.seed);
    this.rngEvent.seed((this.seed ^ 0x5bd1e995) >>> 0);

    this.phase = PHASE_READY;
    this.tick = 0;
    this.runTicks = 0;
    this.time = 0;
    this.climb = 0;
    this.climbPrev = 0;
    this.fixedRight = this.mode.right === 0;
    this.h[0] = this.h[1] = 0.5;
    this.hPrev[0] = this.hPrev[1] = 0.5;
    this.v[0] = this.v[1] = 0;
    this.lastKey[0] = this.lastKey[1] = -1;
    this.heavy = 1;
    this.heavyFrom = 1;
    this.heavyGoal = 1;

    this.ballX = 0;
    this.ballXPrev = 0;
    this.ballV = 0;
    this.ballY = BASE_Y + 0.5 * TRAVEL + BALL_R;
    this.fallT = 0;

    this.score = 0;
    this.height = 0;
    this.mult = 1;
    this.zoneTime = 0;
    this.shake = 0;
    this.fx = 0;

    this.cueActive = false;
    this.cueSide = 0;
    this.cueDrawnAt = 0;
    this.cueWindow = 0;
    this.nextCueAt = 7 + this.rngEvent.next() * 3;
    this.cueCount = 0;
    this.cueHits = 0;
    this.cueMisses = 0;
    this.falseStarts = 0;
    this.lastRt = 0;
    this.lastRtAge = 1e9;
    this.rtCount = 0;

    this.burstState = BURST_NONE;
    this.burstT = 0;
    this.burstTarget = 0;
    this.burstNeed = 0;
    this.burstProgress = 0;
    this.burstCount = 0;
    this.burstsWon = 0;
    this.burstsLost = 0;
    this.nextBurstY = Infinity;
    this.burstLag[0] = this.burstLag[1] = 0;
    this.burstRate[0] = this.burstRate[1] = 0;
    this.burstOk[0] = this.burstOk[1] = 1;
    this.meters[0].reset();
    this.meters[1].reset();

    this.holeStart = 0;
    this.holeCount = 0;
    this.zoneStart = 0;
    this.zoneCount = 0;
    this.zoneIn = -1;

    this.laneY0 = BASE_Y + 0.5 * TRAVEL;
    this.laneX0 = 0;
    this.laneY1 = 11;
    this.laneX1 = this.rngBoard.range(-1.5, 1.5);
    this.laneY2 = this.laneY1 + 3.6;
    this.laneX2 = clamp(this.laneX1 + this.rngBoard.range(-2.5, 2.5), -LANE_LIM, LANE_LIM);
    this.nextZoneY = 17 + this.rngBoard.next() * 6;
    this.burstGenY = 26 + this.rngBoard.next() * 6;
    this.sparseFromY = Infinity;
    this.sparseUntilY = -Infinity;

    this.trailHead = 0;
    this.trailCount = 0;
    this.tapCount = 0;
    this.repeats = 0;
    this.startMs = 0;

    this.generate();
  }

  // --- Queries used by the renderer -----------------------------------------

  /** World y of a beam end, interpolated between the last two ticks. */
  endY(side: number, alpha: number): number {
    const c = this.climbPrev + (this.climb - this.climbPrev) * alpha;
    const h = this.hPrev[side]! + (this.h[side]! - this.hPrev[side]!) * alpha;
    return c + BASE_Y + h * TRAVEL;
  }

  centerY(): number {
    return this.climb + BASE_Y + (this.h[0]! + this.h[1]!) * 0.5 * TRAVEL;
  }

  // --- Input ----------------------------------------------------------------

  /**
   * A lift tap. `ts` is the keydown's event.timeStamp (same clock as
   * performance.now). Returns 0 if ignored, 1 for a full lift, 2 for a weak
   * (repeated-key) lift.
   */
  tap(side: number, keyIdx: number, ts: number): number {
    if (this.phase === PHASE_READY) {
      this.phase = PHASE_RUN;
      this.startMs = ts;
    }
    if (this.phase !== PHASE_RUN) return 0;
    if (side === 1 && this.fixedRight) return 0;

    const keys = side === 0 ? this.mode.left : this.mode.right;
    let f = this.mode.lift;
    let kind = 1;
    if (keys > 1 && this.lastKey[side] === keyIdx) {
      f *= REPEAT_LIFT;
      kind = 2;
      this.repeats++;
    }
    this.lastKey[side] = keyIdx;
    this.v[side]! += LIFT * f;
    this.meters[side]!.push(this.time);

    if (this.tapCount === this.tapT.length) this.growTapLog();
    this.tapT[this.tapCount] = ts - this.startMs;
    this.tapKey[this.tapCount] = side * 3 + keyIdx;
    this.tapCount++;

    // In modes without a reflex key, any key on the cued side answers the cue.
    if (this.cueActive && !this.mode.reflex && side === this.cueSide && this.cueDrawnAt > 0) {
      const rt = ts - this.cueDrawnAt;
      if (rt >= ANTICIPATION_MS && rt <= this.cueWindow) this.catchCue(rt);
    }
    return kind;
  }

  /** The reflex key. Pressing it with no cue showing is a false start. */
  reflex(ts: number): void {
    if (this.phase !== PHASE_RUN || !this.mode.reflex) return;
    if (this.cueActive && this.cueDrawnAt > 0) {
      const rt = ts - this.cueDrawnAt;
      if (rt >= ANTICIPATION_MS && rt <= this.cueWindow) {
        this.catchCue(rt);
        return;
      }
      if (rt > this.cueWindow) return; // too late; the miss is handled in step()
    }
    this.falseStarts++;
    this.v[0]! -= FALSE_START_JOLT;
    if (!this.fixedRight) this.v[1]! -= FALSE_START_JOLT;
    this.shake = Math.max(this.shake, 0.4);
    this.fx |= FX_FALSE;
  }

  /** Shift the real-time references after a pause so it does not count. */
  shiftClock(ms: number): void {
    this.startMs += ms;
    if (this.cueDrawnAt > 0) this.cueDrawnAt += ms;
  }

  /** Called by the renderer on the frame the active cue is first drawn. */
  markCueDrawn(now: number): void {
    if (this.cueActive && this.cueDrawnAt === 0) this.cueDrawnAt = now;
  }

  // --- Step -----------------------------------------------------------------

  /** Advance one tick. `tickMs` is the real time this tick starts at. */
  step(tickMs: number): void {
    this.climbPrev = this.climb;
    this.hPrev[0] = this.h[0]!;
    this.hPrev[1] = this.h[1]!;
    this.ballXPrev = this.ballX;
    this.tick++;
    this.shake *= SHAKE_K;

    if (this.phase === PHASE_FALL) {
      this.fallT += DT;
      if (this.fallT >= FALL_TIME) this.phase = PHASE_OVER;
      return;
    }
    if (this.phase !== PHASE_RUN) return;

    this.runTicks++;
    const time = (this.time = this.runTicks * DT);
    const speed = climbSpeed(time);
    this.climb += speed * DT;
    this.lastRtAge++;

    this.stepBurst(time);
    this.stepCue(time, speed, tickMs);

    // Beam ends.
    const heavy = this.heavy;
    for (let s = 0; s < 2; s++) {
      if (s === 1 && this.fixedRight) continue;
      let h = this.h[s]!;
      let v = this.v[s]!;
      let g = SAG * (1 + SAG_K * h) * heavy;
      if (this.cueActive && this.cueSide === s) g *= CUE_SLIP;
      v += (-g - END_DRAG * v) * DT;
      h += v * DT;
      if (h < 0) {
        h = 0;
        if (v < 0) v = 0;
      } else if (h > 1) {
        h = 1;
        if (v > 0) v = 0;
      }
      this.h[s] = h;
      this.v[s] = v;
    }

    // Ball rolling on the beam.
    const yL = this.h[0]! * TRAVEL;
    const yR = this.h[1]! * TRAVEL;
    const dy = yR - yL;
    const sin = dy / Math.sqrt(dy * dy + BEAM_LEN * BEAM_LEN);
    let bv = (this.ballV - BALL_G * sin * DT) * BALL_DRAG_K;
    let bx = this.ballX + bv * DT;
    if (bx > BALL_LIMIT) {
      bx = BALL_LIMIT;
      if (bv > 0) bv = -bv * BALL_BOUNCE;
    } else if (bx < -BALL_LIMIT) {
      bx = -BALL_LIMIT;
      if (bv < 0) bv = -bv * BALL_BOUNCE;
    }
    this.ballV = bv;
    this.ballX = bx;
    const by = (this.ballY = this.climb + BASE_Y + yL + (dy * (bx + BEAM_HALF)) / BEAM_LEN + BALL_R);

    // Target zones.
    let zoneIn = -1;
    for (let i = 0; i < this.zoneCount; i++) {
      const k = (this.zoneStart + i) % ZONE_CAP;
      const dx = bx - this.zx[k]!;
      const hw = this.zw[k]! * 0.5;
      if (dx > -hw && dx < hw && by >= this.zy[k]! && by <= this.zy[k]! + this.zh[k]!) {
        zoneIn = k;
        break;
      }
    }
    if (zoneIn >= 0) {
      if (this.zoneIn < 0) this.fx |= FX_ZONE;
      this.zoneTime += DT;
      this.mult = ZONE_MULT;
    } else {
      this.mult = 1;
    }
    this.zoneIn = zoneIn;

    // Height and score: only new height counts.
    const gained = this.climb + (yL + yR) * 0.5 - 0.5 * TRAVEL;
    if (gained > this.height) {
      this.score += (gained - this.height) * SCORE_PER_M * this.mult;
      this.height = gained;
    }

    // Hazard holes.
    for (let i = 0; i < this.holeCount; i++) {
      const k = (this.holeStart + i) % HOLE_CAP;
      const ddy = by - this.hy[k]!;
      if (ddy > 1 || ddy < -1) continue;
      const ddx = bx - this.hx[k]!;
      const kill = this.hr[k]! - 0.04;
      if (ddx * ddx + ddy * ddy < kill * kill) {
        this.phase = PHASE_FALL;
        this.fallT = 0;
        this.fallFromX = bx;
        this.fallFromY = by;
        this.fallToX = this.hx[k]!;
        this.fallToY = this.hy[k]!;
        this.cueActive = false;
        this.shake = 1;
        this.fx |= FX_FALL;
        return;
      }
    }

    // Trail.
    if (this.runTicks % TRAIL_EVERY === 0) {
      this.trailX[this.trailHead] = bx;
      this.trailY[this.trailHead] = by;
      this.trailHead = (this.trailHead + 1) % TRAIL_CAP;
      if (this.trailCount < TRAIL_CAP) this.trailCount++;
    }

    // Board upkeep.
    this.generate();
    const floor = this.climb - 1.5;
    while (this.holeCount > 0 && this.hy[this.holeStart]! < floor) {
      this.holeStart = (this.holeStart + 1) % HOLE_CAP;
      this.holeCount--;
    }
    while (this.zoneCount > 0 && this.zy[this.zoneStart]! + this.zh[this.zoneStart]! < floor) {
      if (this.zoneIn === this.zoneStart) this.zoneIn = -1;
      this.zoneStart = (this.zoneStart + 1) % ZONE_CAP;
      this.zoneCount--;
    }
  }

  // --- Events ---------------------------------------------------------------

  private stepCue(time: number, speed: number, tickMs: number): void {
    if (this.cueActive) {
      if (this.cueDrawnAt === 0) {
        if (this.headless) this.cueDrawnAt = tickMs;
      } else if (tickMs > this.cueDrawnAt + this.cueWindow) {
        this.cueActive = false;
        this.cueMisses++;
        this.lurch(this.cueSide);
        this.fx |= FX_CUE_MISS;
        this.scheduleCue(time);
      }
      return;
    }
    if (time < this.nextCueAt) return;
    // Keep reaction cues clear of heavy pulls.
    if (this.burstState !== BURST_NONE || this.nextBurstY - this.centerY() < speed * 1.6) {
      this.nextCueAt = time + 1.2;
      return;
    }
    this.cueActive = true;
    this.cueDrawnAt = 0;
    this.cueSide = this.fixedRight ? 0 : this.rngEvent.next() < 0.5 ? 0 : 1;
    this.cueWindow = lerp(700, 400, difficulty(time));
    this.cueCount++;
  }

  private scheduleCue(time: number): void {
    const mean = lerp(8.5, 3.2, difficulty(time));
    this.nextCueAt = time + mean * (0.55 + 0.9 * this.rngEvent.next());
  }

  private catchCue(rt: number): void {
    this.cueActive = false;
    this.cueHits++;
    if (this.rtCount < RT_CAP) this.rt[this.rtCount++] = rt;
    this.lastRt = rt;
    this.lastRtSide = this.cueSide;
    this.lastRtAge = 0;
    this.v[this.cueSide]! += 0.22;
    this.score += 40 + 60 * (1 - rt / this.cueWindow);
    this.fx |= FX_CATCH;
    this.scheduleCue(this.time);
  }

  private lurch(side: number): void {
    if (side === 1 && this.fixedRight) side = 0;
    this.v[side]! -= LURCH;
    this.shake = 1;
    this.fx |= FX_LURCH;
  }

  private stepBurst(time: number): void {
    const state = this.burstState;
    if (state === BURST_NONE) {
      if (this.centerY() >= this.nextBurstY) {
        const m = this.mode;
        this.burstState = BURST_LEADIN;
        this.burstT = 0;
        this.burstTarget = Math.min(m.burstCap, m.burstBase + m.burstStep * this.burstCount);
        this.burstNeed = lerp(3, 4.5, difficulty(time));
        this.burstProgress = 0;
        this.burstLag[0] = this.burstLag[1] = 0;
        this.burstOk[0] = this.burstOk[1] = 1;
        this.heavyFrom = 1;
        this.heavyGoal = Math.max(1, (this.burstTarget * m.lift) / HOVER_MID);
        this.nextBurstY = Infinity;
        this.fx |= FX_BURST_START;
      }
      return;
    }

    this.burstT += DT;
    const rL = (this.burstRate[0] = this.meters[0].rate(time));
    const rR = (this.burstRate[1] = this.fixedRight ? 0 : this.meters[1].rate(time));

    if (state === BURST_LEADIN) {
      this.heavy = lerp(this.heavyFrom, this.heavyGoal, Math.min(1, this.burstT / BURST_LEAD));
      if (this.burstT >= BURST_LEAD) {
        this.burstState = BURST_ACTIVE;
        this.burstT = 0;
      }
      return;
    }

    if (state === BURST_ACTIVE) {
      const target = this.burstTarget;
      const okL = rL >= target;
      const okR = this.fixedRight || rR >= target;
      this.burstOk[0] = okL ? 1 : 0;
      this.burstOk[1] = okR ? 1 : 0;
      this.burstLag[0] = okL ? 0 : this.burstLag[0]! + DT;
      this.burstLag[1] = okR ? 0 : this.burstLag[1]! + DT;
      if (okL && okR) this.burstProgress += DT;

      if (this.burstProgress >= this.burstNeed) {
        this.burstsWon++;
        this.score += 25 * target * this.burstNeed;
        this.fx |= FX_BURST_OK;
        this.endBurst(time);
      } else if (
        this.burstLag[0]! > BURST_GRACE ||
        this.burstLag[1]! > BURST_GRACE ||
        this.burstT > this.burstNeed * 2.5
      ) {
        // The slower side slips.
        const side = this.fixedRight ? 0 : this.burstLag[0]! > this.burstLag[1]! ? 0 : this.burstLag[1]! > this.burstLag[0]! ? 1 : rL <= rR ? 0 : 1;
        this.burstsLost++;
        this.lurch(side);
        this.fx |= FX_BURST_FAIL;
        this.endBurst(time);
      }
      return;
    }

    // BURST_OUT: the load eases back off.
    this.heavy = lerp(this.heavyFrom, 1, Math.min(1, this.burstT / BURST_OUT_TIME));
    if (this.burstT >= BURST_OUT_TIME) {
      this.burstState = BURST_NONE;
      this.heavy = 1;
    }
  }

  private endBurst(time: number): void {
    this.burstState = BURST_OUT;
    this.burstT = 0;
    this.burstCount++;
    this.heavyFrom = this.heavy;
    this.burstOk[0] = this.burstOk[1] = 1;
    if (this.nextCueAt < time + 1.8) this.nextCueAt = time + 1.8;
  }

  // --- Board generation -----------------------------------------------------

  private generate(): void {
    const front = this.climb + GEN_AHEAD;
    while (this.laneY1 < front) this.genRow();
  }

  /** x of the guaranteed-clear lane at height y, near the current row. */
  private laneAt(y: number): number {
    if (y <= this.laneY1) {
      const t = (y - this.laneY0) / (this.laneY1 - this.laneY0);
      return this.laneX0 + (this.laneX1 - this.laneX0) * clamp(t, 0, 1);
    }
    const t = (y - this.laneY1) / (this.laneY2 - this.laneY1);
    return this.laneX1 + (this.laneX2 - this.laneX1) * clamp(t, 0, 1);
  }

  private genRow(): void {
    const rng = this.rngBoard;
    const y = this.laneY1;
    // Difficulty at the moment the beam will get there.
    const ahead = Math.max(0, y - this.centerY());
    const tArr = this.time + ahead / climbSpeed(this.time);
    const d = difficulty(tArr);
    const speed = climbSpeed(tArr);

    // Heavy-pull section: thinner hazards while both hands are busy.
    if (y >= this.burstGenY && this.nextBurstY === Infinity) {
      const need = lerp(3, 4.5, d);
      this.nextBurstY = y;
      this.sparseFromY = y - 1;
      this.sparseUntilY = y + (BURST_LEAD + need * 1.5 + 0.5) * speed;
      const gapT = lerp(26, 15, d) * (0.8 + 0.4 * rng.next());
      this.burstGenY = this.sparseUntilY + gapT * speed;
    }
    const sparse = y >= this.sparseFromY && y <= this.sparseUntilY;

    // Target zone.
    if (y >= this.nextZoneY && this.zoneCount < ZONE_CAP) {
      const w = rng.range(1.8, 2.6);
      const zh = rng.range(3.5, 6);
      const lim = BEAM_HALF - w * 0.5 - 0.35;
      const k = (this.zoneStart + this.zoneCount) % ZONE_CAP;
      this.zx[k] = rng.range(-lim, lim);
      this.zy[k] = y;
      this.zw[k] = w;
      this.zh[k] = zh;
      this.zoneCount++;
      this.nextZoneY = y + zh + rng.range(11, 22);
    }

    // Holes for this row.
    const gapPrev = this.laneY1 - this.laneY0;
    const gapNext = this.laneY2 - this.laneY1;
    const jitter = 0.6 * Math.min(gapPrev, gapNext, 3.6);
    const laneHalf = sparse ? 1.7 : lerp(1.35, 0.82, d);
    let n = 1;
    if (rng.next() < 0.3 + 0.6 * d) n++;
    if (rng.next() < 0.75 * d) n++;
    if (rng.next() < 0.4 * d) n++;
    if (sparse) n = rng.next() < 0.35 ? 2 : 1;

    for (let i = 0; i < n; i++) {
      for (let attempt = 0; attempt < 10; attempt++) {
        const r = 0.42 + 0.1 * rng.next() + 0.08 * d;
        const yj = y + (rng.next() - 0.5) * jitter;
        const lane = this.laneAt(yj);
        let x: number;
        if (rng.next() < 0.5) {
          // Hug the lane so the corridor has walls.
          const off = laneHalf + r + rng.next() * 1.3;
          x = rng.next() < 0.5 ? lane - off : lane + off;
        } else {
          x = rng.range(-HOLE_X_LIM, HOLE_X_LIM);
        }
        if (x < -HOLE_X_LIM || x > HOLE_X_LIM) continue;
        const dl = x - lane;
        if (dl < laneHalf + r && dl > -(laneHalf + r)) continue;
        if (this.holeBlocked(x, yj, r)) continue;
        if (this.holeCount === HOLE_CAP) {
          this.holeStart = (this.holeStart + 1) % HOLE_CAP;
          this.holeCount--;
        }
        const k = (this.holeStart + this.holeCount) % HOLE_CAP;
        this.hx[k] = x;
        this.hy[k] = yj;
        this.hr[k] = r;
        this.holeCount++;
        break;
      }
    }

    // Advance the lane: how far it may move depends on how long the ball has.
    this.laneY0 = this.laneY1;
    this.laneX0 = this.laneX1;
    this.laneY1 = this.laneY2;
    this.laneX1 = this.laneX2;
    const gap = lerp(3.6, 2.0, d) * (0.8 + 0.4 * rng.next());
    const maxShift = clamp((1.4 * gap) / speed, 0.5, 4);
    this.laneY2 = this.laneY1 + gap;
    this.laneX2 = clamp(this.laneX1 + (rng.next() * 2 - 1) * maxShift, -LANE_LIM, LANE_LIM);
  }

  private holeBlocked(x: number, y: number, r: number): boolean {
    // Other recent holes.
    const from = Math.max(0, this.holeCount - 14);
    for (let i = from; i < this.holeCount; i++) {
      const k = (this.holeStart + i) % HOLE_CAP;
      const dx = x - this.hx[k]!;
      const dy = y - this.hy[k]!;
      const min = r + this.hr[k]! + 0.3;
      if (dx * dx + dy * dy < min * min) return true;
    }
    // Zones are hazard-free.
    for (let i = 0; i < this.zoneCount; i++) {
      const k = (this.zoneStart + i) % ZONE_CAP;
      const hw = this.zw[k]! * 0.5 + r + 0.12;
      const dx = x - this.zx[k]!;
      if (dx > -hw && dx < hw && y > this.zy[k]! - r - 0.12 && y < this.zy[k]! + this.zh[k]! + r + 0.12) {
        return true;
      }
    }
    return false;
  }

  private growTapLog(): void {
    const t = new Float64Array(this.tapT.length * 2);
    t.set(this.tapT);
    this.tapT = t;
    const k = new Uint8Array(this.tapKey.length * 2);
    k.set(this.tapKey);
    this.tapKey = k;
  }
}
