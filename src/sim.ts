// Fixed-timestep simulation of the Climb mode. No DOM, no allocation inside
// step(): everything lives in preallocated typed arrays so the same code runs
// in the browser and headless under node (tests, tuning bot).
//
// The ball rides the beam in one of LANES lanes. A tap on a side dashes it that
// way; a tap on both sides at once is a surge, which jerks the beam up the board
// and carries the ball over whatever is in between.

import {
  ANTICIPATION_MS,
  BALL_R,
  BEAM_HALF,
  BURST_GRACE,
  BURST_LEAD,
  BURST_MAX_FACTOR,
  CHAIN_HOLD,
  CHAIN_MAX,
  CHORD_MS,
  DASH_SPEED,
  DT,
  END_DRAG,
  HOP_H,
  HOVER_MID,
  LANES,
  LIFT,
  LURCH,
  MID_LANE,
  RATE_WINDOW,
  REPEAT_LIFT,
  REST_Y,
  RING_SCORE,
  SAG,
  SAG_K,
  SCORE_PER_M,
  SPRING,
  SPRING_DRAG,
  SURGE_DIST,
  SURGE_RECHARGE,
  SURGE_RECHARGE_ONE_KEY,
  SURGE_TIME,
  TRAVEL,
  BASE_Y,
  clamp,
  climbSpeed,
  dashLanes,
  difficulty,
  getMode,
  laneX,
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
export const FX_RING = 64;
export const FX_BURST_START = 128;
export const FX_CUE_MISS = 256;
export const FX_SURGE = 512;
export const FX_DUD = 1024;

export const PHASE_READY = 0;
export const PHASE_RUN = 1;
export const PHASE_FALL = 2;
export const PHASE_OVER = 3;

export const BURST_NONE = 0;
export const BURST_LEADIN = 1;
export const BURST_ACTIVE = 2;
export const BURST_OUT = 3;

// Hazard kinds. All are horizontal capsules: centre (x, y), half-length l, radius r.
export const HAZ_HOLE = 0;
export const HAZ_PIT = 1;
export const HAZ_BAR = 2;
export const HAZ_SLIDER = 3;

// Board sections, so a run moves through stretches with different hazards.
export const SEC_HOLES = 0;
export const SEC_PITS = 1;
export const SEC_BARS = 2;
export const SEC_SLIDERS = 3;
export const SEC_MIX = 4;
export const SECTION_NAMES = ['HOLES', 'PITS', 'BARS', 'SLIDERS', 'MIX'] as const;

export const HAZ_CAP = 256;
export const RING_CAP = 64;
export const MARK_CAP = 8;
export const TRAIL_CAP = 64;
const TRAIL_EVERY = 4;
const RT_CAP = 4096;
const GEN_AHEAD = 18;
const SHAKE_K = Math.exp(-9 * DT);
const FALL_TIME = 0.85;
const BURST_OUT_TIME = 0.5;
const CUE_FORGIVE_TICKS = Math.round(0.45 / DT);
const BAR_R = 0.16;
const DASH_STEP = DASH_SPEED * DT;
const BALL_REST = REST_Y + BALL_R;

export class Sim {
  mode: ModeDef = getMode(2);
  oneKey = false;
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

  // Beam ends: [left, right], h normalised to [0, 1], resting at 0.5.
  readonly h = new Float64Array(2);
  readonly hPrev = new Float64Array(2);
  readonly v = new Float64Array(2);
  readonly lastKey = new Int8Array(2);
  heavy = 1;

  // Ball.
  /** Lane the ball is in, or is dashing to. */
  lane = MID_LANE;
  ballX = 0;
  ballXPrev = 0;
  /** World y of the ball when it sits on the level beam. */
  ballY = BALL_REST;
  hop = 0;
  hopPrev = 0;
  /** False while dashing or surging: nothing can swallow the ball then. */
  grounded = true;
  /** Surge charge, 0..1. A surge needs a full charge. */
  charge = 1;
  surgeT = 0;
  /** Seconds the surge stays locked after a lurch (one-key mode). */
  stun = 0;
  private readonly lastTapTs = new Float64Array(2);
  private readonly lastTapDelta = new Int8Array(2);
  private readonly lastTapOpen = new Uint8Array(2);

  // Fall animation.
  fallT = 0;
  fallFromX = 0;
  fallFromY = 0;
  fallToX = 0;
  fallToY = 0;

  // Score.
  score = 0;
  height = 0;
  /** Pickup chain, 0..CHAIN_MAX. The score multiplier is 1 + chain. */
  chain = 0;
  bestChain = 0;
  private chainT = 0;
  rings = 0;
  surges = 0;
  dashes = 0;
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
  private cueEndTick = -1e9;
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
  repeats = 0;
  private heavyFrom = 1;
  private heavyGoal = 1;
  readonly burstLag = new Float64Array(2);
  readonly burstRate = new Float64Array(2);
  readonly burstOk = new Uint8Array(2);
  readonly meters = [new RateMeter(RATE_WINDOW), new RateMeter(RATE_WINDOW)] as const;

  // Board: hazards, pickups and section markers in ring buffers.
  readonly hazX = new Float32Array(HAZ_CAP);
  readonly hazY = new Float32Array(HAZ_CAP);
  readonly hazR = new Float32Array(HAZ_CAP);
  /** Half-length of the capsule: 0 for a round hole. */
  readonly hazL = new Float32Array(HAZ_CAP);
  /** Sideways speed of a slider (m/s), and the x range it sweeps. */
  readonly hazV = new Float32Array(HAZ_CAP);
  readonly hazMin = new Float32Array(HAZ_CAP);
  readonly hazMax = new Float32Array(HAZ_CAP);
  readonly hazType = new Uint8Array(HAZ_CAP);
  hazStart = 0;
  hazCount = 0;
  readonly ringX = new Float32Array(RING_CAP);
  readonly ringY = new Float32Array(RING_CAP);
  readonly ringLive = new Uint8Array(RING_CAP);
  ringStart = 0;
  ringCount = 0;
  readonly markY = new Float32Array(MARK_CAP);
  readonly markType = new Uint8Array(MARK_CAP);
  markStart = 0;
  markCount = 0;

  // Generator state.
  private readonly rngBoard = new Rng();
  private readonly rngEvent = new Rng();
  private genY = 0;
  private prevGap = 4;
  private safeLane = MID_LANE;
  private section = SEC_HOLES;
  private sectionEndY = 0;
  private skipRows = 0;
  private lastBarY = -1e9;
  private burstGenY = 0;
  private clearFrom = Infinity;
  private clearUntil = -Infinity;

  // Ball trail in board space.
  readonly trailX = new Float32Array(TRAIL_CAP);
  readonly trailY = new Float32Array(TRAIL_CAP);
  trailHead = 0;
  trailCount = 0;

  // Tap log (ms since run start, pauses excluded) for the end-of-run stats.
  tapT = new Float64Array(8192);
  tapKey = new Uint8Array(8192);
  tapCount = 0;
  /** Real-time ms of the tap that started the run. */
  startMs = 0;

  constructor() {
    this.reset(2, 1);
  }

  reset(modeId: number, seed: number): void {
    this.mode = getMode(modeId);
    this.oneKey = this.mode.right === 0;
    this.seed = seed >>> 0;
    this.rngBoard.seed(this.seed);
    this.rngEvent.seed((this.seed ^ 0x5bd1e995) >>> 0);

    this.phase = PHASE_READY;
    this.tick = 0;
    this.runTicks = 0;
    this.time = 0;
    this.climb = 0;
    this.climbPrev = 0;
    this.h[0] = this.h[1] = 0.5;
    this.hPrev[0] = this.hPrev[1] = 0.5;
    this.v[0] = this.v[1] = 0;
    this.lastKey[0] = this.lastKey[1] = -1;
    this.heavy = 1;
    this.heavyFrom = 1;
    this.heavyGoal = 1;

    this.lane = MID_LANE;
    this.ballX = 0;
    this.ballXPrev = 0;
    this.ballY = BALL_REST;
    this.hop = 0;
    this.hopPrev = 0;
    this.grounded = true;
    this.charge = 1;
    this.surgeT = 0;
    this.stun = 0;
    this.lastTapTs[0] = this.lastTapTs[1] = -1e9;
    this.lastTapDelta[0] = this.lastTapDelta[1] = 0;
    this.lastTapOpen[0] = this.lastTapOpen[1] = 0;
    this.fallT = 0;

    this.score = 0;
    this.height = 0;
    this.chain = 0;
    this.bestChain = 0;
    this.chainT = 0;
    this.rings = 0;
    this.surges = 0;
    this.dashes = 0;
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
    this.cueEndTick = -1e9;
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
    this.repeats = 0;
    this.burstLag[0] = this.burstLag[1] = 0;
    this.burstRate[0] = this.burstRate[1] = 0;
    this.burstOk[0] = this.burstOk[1] = 1;
    this.meters[0].reset();
    this.meters[1].reset();

    this.hazStart = 0;
    this.hazCount = 0;
    this.ringStart = 0;
    this.ringCount = 0;
    this.markStart = 0;
    this.markCount = 0;

    this.genY = BALL_REST + 8;
    this.prevGap = 4;
    this.safeLane = MID_LANE;
    this.section = SEC_HOLES;
    this.sectionEndY = this.genY + 34 + this.rngBoard.next() * 8;
    this.skipRows = 0;
    this.lastBarY = -1e9;
    this.burstGenY = 30 + this.rngBoard.next() * 6;
    this.clearFrom = Infinity;
    this.clearUntil = -Infinity;

    this.trailHead = 0;
    this.trailCount = 0;
    this.tapCount = 0;
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

  /** Current score multiplier. */
  get mult(): number {
    return 1 + this.chain;
  }

  // --- Input ----------------------------------------------------------------

  /**
   * A lift key. `ts` is the keydown's event.timeStamp (same clock as
   * performance.now). Outside a heavy pull it dashes the ball (or, together
   * with the other side, surges); inside one it lifts that end.
   */
  tap(side: number, keyIdx: number, ts: number): void {
    if (this.phase === PHASE_READY) {
      this.phase = PHASE_RUN;
      this.startMs = ts;
    }
    if (this.phase !== PHASE_RUN) return;
    if (side === 1 && this.oneKey) return;

    if (this.tapCount === this.tapT.length) this.growTapLog();
    this.tapT[this.tapCount] = ts - this.startMs;
    this.tapKey[this.tapCount] = side * 3 + keyIdx;
    this.tapCount++;
    this.meters[side]!.push(this.time);

    // Heavy pull: taps haul the beam instead of moving the ball.
    if (this.burstState === BURST_LEADIN || this.burstState === BURST_ACTIVE) {
      const keys = side === 0 ? this.mode.left : this.mode.right;
      let f = this.mode.lift;
      if (keys > 1 && this.lastKey[side] === keyIdx) {
        f *= REPEAT_LIFT;
        this.repeats++;
      }
      this.lastKey[side] = keyIdx;
      this.v[side]! += LIFT * f;
      if (this.oneKey) this.v[1]! += LIFT * f;
      return;
    }
    this.lastKey[side] = keyIdx;

    // Without a reflex key, a tap on the cued side answers the cue.
    let caught = false;
    if (this.cueActive && !this.mode.reflex && this.cueDrawnAt > 0 && (this.oneKey || side === this.cueSide)) {
      const rt = ts - this.cueDrawnAt;
      if (rt >= ANTICIPATION_MS && rt <= this.cueWindow) {
        this.catchCue(rt);
        caught = true;
      }
    }

    if (this.oneKey) {
      // The one key is the surge, unless it was just spent on a cue.
      if (!caught) this.trySurge();
      return;
    }

    // Both sides at once: take back the other side's dash and surge instead.
    const other = 1 - side;
    if (this.lastTapOpen[other] === 1 && ts - this.lastTapTs[other]! <= CHORD_MS) {
      if (this.lastTapDelta[other] !== 0) {
        this.lane = clamp(this.lane - this.lastTapDelta[other]!, 0, LANES - 1);
        this.dashes--;
      }
      this.lastTapOpen[other] = 0;
      this.trySurge();
      return;
    }

    if (caught) {
      // The tap is used up by the cue, but can still be half of a surge.
      this.lastTapTs[side] = ts;
      this.lastTapDelta[side] = 0;
      this.lastTapOpen[side] = 1;
      return;
    }

    const want = dashLanes(this.mode, side, keyIdx) * (side === 0 ? -1 : 1);
    const to = clamp(this.lane + want, 0, LANES - 1);
    const moved = to - this.lane;
    this.lane = to;
    if (moved !== 0) {
      this.dashes++;
      // The far cable jerks, tipping the beam the way the ball goes.
      this.v[other]! += 0.9;
      this.v[side]! -= 0.35;
    }
    this.lastTapTs[side] = ts;
    this.lastTapDelta[side] = moved;
    this.lastTapOpen[side] = 1;
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
    // A second press right after a cue resolved is a stutter, not a false start.
    if (this.tick - this.cueEndTick < CUE_FORGIVE_TICKS) return;
    this.falseStarts++;
    this.charge = 0;
    this.v[0]! -= 0.5;
    this.v[1]! -= 0.5;
    this.shake = Math.max(this.shake, 0.4);
    this.fx |= FX_FALSE;
  }

  /** Shift the real-time references after a pause so it does not count. */
  shiftClock(ms: number): void {
    this.startMs += ms;
    this.lastTapTs[0]! += ms;
    this.lastTapTs[1]! += ms;
    if (this.cueDrawnAt > 0) this.cueDrawnAt += ms;
  }

  /** Called by the renderer on the frame the active cue is first drawn. */
  markCueDrawn(now: number): void {
    if (this.cueActive && this.cueDrawnAt === 0) this.cueDrawnAt = now;
  }

  private trySurge(): void {
    if (this.charge >= 1 && this.surgeT <= 0 && this.stun <= 0) {
      this.surgeT = SURGE_TIME;
      this.charge = 0;
      this.surges++;
      this.v[0]! += 2.4;
      this.v[1]! += 2.4;
      this.fx |= FX_SURGE;
    } else {
      this.fx |= FX_DUD;
    }
  }

  // --- Step -----------------------------------------------------------------

  /** Advance one tick. `tickMs` is the real time this tick starts at. */
  step(tickMs: number): void {
    this.climbPrev = this.climb;
    this.hPrev[0] = this.h[0]!;
    this.hPrev[1] = this.h[1]!;
    this.ballXPrev = this.ballX;
    this.hopPrev = this.hop;
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
    let climb = this.climb + speed * DT;
    this.lastRtAge++;

    // Surge: a short, sharp jerk up the board with the ball in the air.
    if (this.surgeT > 0) {
      const a = 1 - this.surgeT / SURGE_TIME;
      this.surgeT -= DT;
      const b = this.surgeT > 0 ? 1 - this.surgeT / SURGE_TIME : 1;
      // Ease-out: distance fraction 1 - (1 - u)^2.
      climb += SURGE_DIST * ((1 - a) * (1 - a) - (1 - b) * (1 - b));
      this.hop = Math.sin(Math.PI * b) * HOP_H;
    } else {
      this.hop = 0;
      if (this.stun > 0) this.stun -= DT;
      else if (this.charge < 1) {
        this.charge += DT / (this.oneKey ? SURGE_RECHARGE_ONE_KEY : SURGE_RECHARGE);
        if (this.charge > 1) this.charge = 1;
      }
    }
    this.climb = climb;
    const by = (this.ballY = climb + BALL_REST);

    this.stepBurst(time);
    this.stepCue(time, speed, tickMs);

    // Beam ends: sprung to mid height, or hauled against the load in a pull.
    const heavy = this.heavy;
    for (let s = 0; s < 2; s++) {
      let h = this.h[s]!;
      let v = this.v[s]!;
      if (heavy > 1.0005) {
        v += (-SAG * (1 + SAG_K * h) * heavy - END_DRAG * v) * DT;
      } else {
        const rest = this.cueActive && this.cueSide === s ? 0.36 : 0.5;
        v += (-SPRING * (h - rest) - SPRING_DRAG * v) * DT;
      }
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

    // Ball: chase the lane it was sent to.
    const target = laneX(this.lane);
    let bx = this.ballX;
    const dx = target - bx;
    if (dx > DASH_STEP) bx += DASH_STEP;
    else if (dx < -DASH_STEP) bx -= DASH_STEP;
    else bx = target;
    this.ballX = bx;
    const grounded = (this.grounded = bx === target && this.surgeT <= 0);

    // Pickups extend the chain.
    for (let i = 0; i < this.ringCount; i++) {
      const k = (this.ringStart + i) % RING_CAP;
      if (this.ringLive[k] === 0) continue;
      const ry = by - this.ringY[k]!;
      if (ry > 0.5 || ry < -0.5) continue;
      const rx = bx - this.ringX[k]!;
      if (rx > 0.62 || rx < -0.62) continue;
      this.ringLive[k] = 0;
      this.rings++;
      if (this.chain < CHAIN_MAX) this.chain++;
      if (this.chain > this.bestChain) this.bestChain = this.chain;
      this.chainT = 0;
      this.score += RING_SCORE * (1 + this.chain);
      this.fx |= FX_RING;
    }
    if (this.chain > 0) {
      this.chainT += DT;
      if (this.chainT >= CHAIN_HOLD) {
        this.chainT = 0;
        this.chain--;
      }
    }

    // Height and score.
    if (climb > this.height) {
      this.score += (climb - this.height) * SCORE_PER_M * (1 + this.chain);
      this.height = climb;
    }

    // Hazards: sliders move, and anything under a grounded ball swallows it.
    for (let i = 0; i < this.hazCount; i++) {
      const k = (this.hazStart + i) % HAZ_CAP;
      const vx = this.hazV[k]!;
      if (vx !== 0) {
        let x = this.hazX[k]! + vx * DT;
        if (x > this.hazMax[k]!) {
          x = this.hazMax[k]!;
          this.hazV[k] = -vx;
        } else if (x < this.hazMin[k]!) {
          x = this.hazMin[k]!;
          this.hazV[k] = -vx;
        }
        this.hazX[k] = x;
      }
      if (!grounded) continue;
      const ddy = by - this.hazY[k]!;
      if (ddy > 1 || ddy < -1) continue;
      const len = this.hazL[k]!;
      let ddx = bx - this.hazX[k]!;
      if (ddx > len) ddx -= len;
      else if (ddx < -len) ddx += len;
      else ddx = 0;
      const kill = this.hazR[k]! - 0.04;
      if (ddx * ddx + ddy * ddy < kill * kill) {
        this.phase = PHASE_FALL;
        this.fallT = 0;
        this.fallFromX = bx;
        this.fallFromY = by;
        this.fallToX = clamp(bx, this.hazX[k]! - len, this.hazX[k]! + len);
        this.fallToY = this.hazY[k]!;
        this.cueActive = false;
        this.shake = 1;
        this.fx |= FX_FALL;
        return;
      }
    }

    // Trail.
    if (this.runTicks % TRAIL_EVERY === 0) {
      this.trailX[this.trailHead] = bx;
      this.trailY[this.trailHead] = by + this.hop;
      this.trailHead = (this.trailHead + 1) % TRAIL_CAP;
      if (this.trailCount < TRAIL_CAP) this.trailCount++;
    }

    // Board upkeep.
    this.generate();
    const floor = climb - 1.5;
    while (this.hazCount > 0 && this.hazY[this.hazStart]! < floor) {
      this.hazStart = (this.hazStart + 1) % HAZ_CAP;
      this.hazCount--;
    }
    while (this.ringCount > 0 && this.ringY[this.ringStart]! < floor) {
      this.ringStart = (this.ringStart + 1) % RING_CAP;
      this.ringCount--;
    }
    while (this.markCount > 0 && this.markY[this.markStart]! < floor) {
      this.markStart = (this.markStart + 1) % MARK_CAP;
      this.markCount--;
    }
  }

  // --- Events ---------------------------------------------------------------

  private stepCue(time: number, speed: number, tickMs: number): void {
    if (this.cueActive) {
      if (this.cueDrawnAt === 0) {
        if (this.headless) this.cueDrawnAt = tickMs;
      } else if (tickMs > this.cueDrawnAt + this.cueWindow) {
        this.cueActive = false;
        this.cueEndTick = this.tick;
        this.cueMisses++;
        this.lurch(this.cueSide, 1);
        this.fx |= FX_CUE_MISS;
        this.scheduleCue(time);
      }
      return;
    }
    if (time < this.nextCueAt) return;
    const window = lerp(700, 400, difficulty(time));
    // Keep cues clear of heavy pulls. Where answering one uses up a lift key,
    // also wait until the ball does not need that key in the next moment.
    const needs = (window / 1000 + 0.45) * speed + 1.2;
    if (
      this.burstState !== BURST_NONE ||
      this.nextBurstY - this.ballY < speed * 1.6 ||
      this.surgeT > 0 ||
      (!this.mode.reflex && !this.pathClear(this.oneKey ? needs : 0.5 * speed + 0.8, needs))
    ) {
      this.nextCueAt = time + 0.4;
      return;
    }
    this.cueActive = true;
    this.cueDrawnAt = 0;
    this.cueSide = this.rngEvent.next() < 0.5 ? 0 : 1;
    this.cueWindow = window;
    this.cueCount++;
  }

  /**
   * True when the ball's lane is free for `laneDist` ahead and nothing that
   * needs a surge (a bar, a slider) comes within `surgeDist`.
   */
  private pathClear(laneDist: number, surgeDist: number): boolean {
    const x = laneX(this.lane);
    const by = this.ballY;
    for (let i = 0; i < this.hazCount; i++) {
      const k = (this.hazStart + i) % HAZ_CAP;
      const dy = this.hazY[k]! - by;
      if (dy < -0.8) continue;
      if (this.hazType[k] === HAZ_BAR || this.hazV[k] !== 0) {
        if (dy < surgeDist) return false;
        continue;
      }
      if (dy > laneDist) continue;
      if (Math.abs(this.hazX[k]! - x) - this.hazL[k]! < 0.6) return false;
    }
    return true;
  }

  private scheduleCue(time: number): void {
    const mean = lerp(8.5, 3.4, difficulty(time));
    this.nextCueAt = time + mean * (0.55 + 0.9 * this.rngEvent.next());
  }

  private catchCue(rt: number): void {
    this.cueActive = false;
    this.cueEndTick = this.tick;
    this.cueHits++;
    if (this.rtCount < RT_CAP) this.rt[this.rtCount++] = rt;
    this.lastRt = rt;
    this.lastRtSide = this.cueSide;
    this.lastRtAge = 0;
    this.v[this.cueSide]! += 1.1;
    this.score += (40 + 60 * (1 - rt / this.cueWindow)) * (1 + this.chain);
    this.fx |= FX_CATCH;
    this.scheduleCue(this.time);
  }

  /** The beam slips on one side: the ball slides that way and the surge is lost. */
  private lurch(side: number, lanes: number): void {
    if (this.oneKey) this.stun = 0.9;
    else this.lane = clamp(this.lane + (side === 0 ? -lanes : lanes), 0, LANES - 1);
    this.charge = 0;
    this.chain = 0;
    this.lastTapOpen[0] = this.lastTapOpen[1] = 0;
    this.v[side]! -= LURCH;
    this.shake = 1;
    this.fx |= FX_LURCH;
  }

  private stepBurst(time: number): void {
    const state = this.burstState;
    if (state === BURST_NONE) {
      if (this.ballY >= this.nextBurstY) {
        const m = this.mode;
        this.burstState = BURST_LEADIN;
        this.burstT = 0;
        this.burstTarget = Math.min(m.burstCap, m.burstBase + m.burstStep * this.burstCount);
        this.burstNeed = lerp(3, 4.5, difficulty(time));
        this.burstProgress = 0;
        this.burstLag[0] = this.burstLag[1] = 0;
        this.burstOk[0] = this.burstOk[1] = 1;
        this.heavyFrom = 1;
        this.heavyGoal = Math.max(1.05, (this.burstTarget * m.lift) / HOVER_MID);
        this.nextBurstY = Infinity;
        this.lastTapOpen[0] = this.lastTapOpen[1] = 0;
        this.lastKey[0] = this.lastKey[1] = -1;
        this.fx |= FX_BURST_START;
      }
      return;
    }

    this.burstT += DT;
    const rL = (this.burstRate[0] = this.meters[0].rate(time));
    const rR = (this.burstRate[1] = this.oneKey ? rL : this.meters[1].rate(time));

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
      const okR = rR >= target;
      this.burstOk[0] = okL ? 1 : 0;
      this.burstOk[1] = okR ? 1 : 0;
      this.burstLag[0] = okL ? 0 : this.burstLag[0]! + DT;
      this.burstLag[1] = okR ? 0 : this.burstLag[1]! + DT;
      if (okL && okR) this.burstProgress += DT;

      if (this.burstProgress >= this.burstNeed) {
        this.burstsWon++;
        this.score += 25 * target * this.burstNeed * (1 + this.chain);
        this.fx |= FX_BURST_OK;
        this.endBurst(time);
      } else if (
        this.burstLag[0]! > BURST_GRACE ||
        this.burstLag[1]! > BURST_GRACE ||
        this.burstT > this.burstNeed * BURST_MAX_FACTOR
      ) {
        // The slower side slips.
        const l0 = this.burstLag[0]!;
        const l1 = this.burstLag[1]!;
        const side = l0 > l1 ? 0 : l1 > l0 ? 1 : rL <= rR ? 0 : 1;
        this.burstsLost++;
        this.endBurst(time);
        this.lurch(side, 2);
        this.fx |= FX_BURST_FAIL;
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
    while (this.genY < front) this.genRow();
  }

  private addHazard(type: number, x: number, y: number, r: number, len: number): number {
    if (this.hazCount === HAZ_CAP) {
      this.hazStart = (this.hazStart + 1) % HAZ_CAP;
      this.hazCount--;
    }
    const k = (this.hazStart + this.hazCount) % HAZ_CAP;
    this.hazType[k] = type;
    this.hazX[k] = x;
    this.hazY[k] = y;
    this.hazR[k] = r;
    this.hazL[k] = len;
    this.hazV[k] = 0;
    this.hazMin[k] = x;
    this.hazMax[k] = x;
    this.hazCount++;
    return k;
  }

  private addRing(lane: number, y: number): void {
    if (this.ringCount === RING_CAP) {
      this.ringStart = (this.ringStart + 1) % RING_CAP;
      this.ringCount--;
    }
    const k = (this.ringStart + this.ringCount) % RING_CAP;
    this.ringX[k] = laneX(clamp(lane, 0, LANES - 1));
    this.ringY[k] = y;
    this.ringLive[k] = 1;
    this.ringCount++;
  }

  private genRow(): void {
    const rng = this.rngBoard;
    const y = this.genY;
    // Difficulty at the moment the ball will get there.
    const ahead = Math.max(0, y - this.ballY);
    const tArr = this.time + ahead / climbSpeed(this.time);
    const d = difficulty(tArr);
    const speed = climbSpeed(tArr);
    const one = this.oneKey;

    // A new section: a different mix of hazards, announced by a marker line.
    if (y >= this.sectionEndY) {
      let next = this.section;
      while (next === this.section) {
        const pick = rng.next();
        if (one) next = pick < 0.4 ? SEC_HOLES : pick < 0.75 ? SEC_BARS : SEC_MIX;
        else next = pick < 0.2 ? SEC_HOLES : pick < 0.42 ? SEC_PITS : pick < 0.62 ? SEC_BARS : pick < 0.82 ? SEC_SLIDERS : SEC_MIX;
      }
      this.section = next;
      this.sectionEndY = y + rng.range(30, 46);
      if (this.markCount < MARK_CAP) {
        const k = (this.markStart + this.markCount) % MARK_CAP;
        this.markY[k] = y - this.prevGap * 0.5;
        this.markType[k] = next;
        this.markCount++;
      }
    }

    // Heavy pull: a clear stretch, because both hands are busy hauling.
    if (y >= this.burstGenY && this.nextBurstY === Infinity) {
      const need = lerp(3, 4.5, d);
      this.nextBurstY = y + 0.6;
      this.clearFrom = y - 0.2;
      this.clearUntil = y + 0.6 + (BURST_LEAD + need * BURST_MAX_FACTOR + 0.9) * speed + 1.5;
      const gapT = lerp(26, 16, d) * (0.8 + 0.4 * rng.next());
      this.burstGenY = this.clearUntil + gapT * speed;
      // A short run of pickups for whoever finishes the pull early.
      const step = rng.next() < 0.5 ? 1 : -1;
      const lane0 = clamp(this.safeLane, 1, LANES - 2) - step;
      for (let i = 0; i < 3; i++) this.addRing(this.oneKey ? MID_LANE : lane0 + step * i, this.clearUntil - 4.4 + i * 1.3);
    }
    const clear = y >= this.clearFrom && y <= this.clearUntil;

    let gap = lerp(4.2, 2.4, d) * (0.85 + 0.3 * rng.next());
    if (one) {
      // One key: every hazard is a surge, so leave room to recharge and land.
      const min = (SURGE_RECHARGE_ONE_KEY + 0.4) * speed + SURGE_DIST + 0.9;
      if (gap < min) gap = min;
    }

    if (this.skipRows > 0) {
      this.skipRows--;
    } else if (!clear) {
      if (one) this.rowOneKey(y, d, speed);
      else this.rowLanes(y, d, speed, gap);
    }

    this.prevGap = gap;
    this.genY = y + gap;
  }

  /** One-key mode: the ball stays in the middle lane and surges over everything. */
  private rowOneKey(y: number, d: number, speed: number): void {
    const rng = this.rngBoard;
    const sec = this.section === SEC_MIX ? (rng.next() < 0.5 ? SEC_HOLES : SEC_BARS) : this.section;
    const barGap = (SURGE_RECHARGE_ONE_KEY + 0.5) * speed + SURGE_DIST + 1.2;
    if (sec === SEC_BARS && y - this.lastBarY >= barGap && rng.next() < 0.7) {
      this.addHazard(HAZ_BAR, 0, y, BAR_R, BEAM_HALF + 0.4);
      this.lastBarY = y;
      return;
    }
    if (rng.next() < 0.78) this.addHazard(HAZ_HOLE, 0, y, 0.44 + 0.1 * rng.next() + 0.06 * d, 0);
    else if (rng.next() < 0.6) this.addRing(MID_LANE, y);
    // Holes in the other lanes are scenery here, but they keep the board reading the same.
    const p = lerp(0.12, 0.3, d);
    for (let lane = 0; lane < LANES; lane++) {
      if (lane === MID_LANE || rng.next() >= p) continue;
      this.addHazard(HAZ_HOLE, laneX(lane), y + (rng.next() - 0.5) * 1.2, 0.42 + 0.12 * rng.next(), 0);
    }
  }

  private rowLanes(y: number, d: number, speed: number, gap: number): void {
    const rng = this.rngBoard;
    // The lane that is guaranteed open, and how far it may move since the last row.
    const dtRow = this.prevGap / speed;
    const maxShift = clamp(Math.floor(dtRow / 0.3), 1, 3);
    const shift = Math.floor(rng.next() * (maxShift * 2 + 1)) - maxShift;
    const safe = clamp(this.safeLane + shift, 0, LANES - 1);
    this.safeLane = safe;

    const sec = this.section === SEC_MIX ? Math.floor(rng.next() * 4) : this.section;
    const p = lerp(0.24, 0.6, d);
    const r = 0.44 + 0.08 * d;
    let placed = 0;

    if (sec === SEC_BARS) {
      const barGap = (SURGE_RECHARGE + 0.9) * speed + SURGE_DIST + 2;
      if (y - this.lastBarY >= barGap && rng.next() < 0.5) {
        this.addHazard(HAZ_BAR, 0, y, BAR_R, BEAM_HALF + 0.4);
        this.lastBarY = y;
        // Landing room: the row after a bar stays empty.
        this.skipRows = 1;
        this.addRing(safe, y + gap * 0.5);
        return;
      }
    }

    if (sec === SEC_SLIDERS && rng.next() < 0.75) {
      // One hole sweeping back and forth across a few lanes.
      const span = 2 + Math.floor(rng.next() * 3);
      const from = Math.floor(rng.next() * (LANES - span));
      const k = this.addHazard(HAZ_SLIDER, laneX(from + rng.next() * span), y, r, 0);
      this.hazMin[k] = laneX(from);
      this.hazMax[k] = laneX(from + span);
      this.hazV[k] = lerp(1.5, 3.2, d) * (rng.next() < 0.5 ? -1 : 1);
      for (let lane = 0; lane < LANES; lane++) {
        if (lane === safe || (lane >= from && lane <= from + span) || rng.next() >= p * 0.6) continue;
        this.addHazard(HAZ_HOLE, laneX(lane), y, r, 0);
      }
    } else if (sec === SEC_PITS) {
      // Wide pits covering two or three lanes.
      let lane = 0;
      while (lane < LANES) {
        if (lane !== safe && rng.next() < p) {
          let w = 1;
          const wantW = rng.next() < 0.45 ? 3 : 2;
          while (w < wantW && lane + w < LANES && lane + w !== safe) w++;
          const cx = (laneX(lane) + laneX(lane + w - 1)) / 2;
          this.addHazard(w > 1 ? HAZ_PIT : HAZ_HOLE, cx, y, r, ((w - 1) * (laneX(1) - laneX(0))) / 2);
          placed++;
          lane += w + 1;
        } else {
          lane++;
        }
      }
    } else {
      for (let lane = 0; lane < LANES; lane++) {
        if (lane === safe || rng.next() >= p) continue;
        this.addHazard(HAZ_HOLE, laneX(lane), y + (rng.next() - 0.5) * 0.5, r + 0.08 * rng.next(), 0);
        placed++;
      }
    }
    if (placed === 0 && sec !== SEC_SLIDERS) {
      // Never a blank row: put one hole beside the open lane.
      const lane = safe + (safe < LANES - 1 && (safe === 0 || rng.next() < 0.5) ? 1 : -1);
      this.addHazard(HAZ_HOLE, laneX(lane), y, r, 0);
    }

    // Pickups between rows, at or next to the open lane.
    const roll = rng.next();
    if (roll < 0.5) {
      const lane = safe + Math.floor(rng.next() * 3) - 1;
      this.addRing(lane, y + gap * 0.5);
      if (roll < 0.14) this.addRing(lane + (rng.next() < 0.5 ? 1 : -1), y + gap * 0.72);
    }
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
