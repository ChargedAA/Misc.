// Shared constants. World units are metres; y points up.

export const TICK_HZ = 480;
export const DT = 1 / TICK_HZ;
export const STEP_MS = 1000 / TICK_HZ;
/** Longest stretch of real time one frame is allowed to simulate (ticks). */
export const MAX_TICKS_PER_FRAME = Math.round(TICK_HZ * 0.1);

// --- Geometry -------------------------------------------------------------
export const BOARD_W = 12;
export const VIEW_H = 13.5;
/** Cables hang at x = +-BEAM_HALF; the beam spans between them. */
export const BEAM_HALF = 5.6;
/** The ball moves between lanes; a dash is exactly one lane wide. */
export const LANES = 7;
export const LANE_W = (BEAM_HALF * 2) / LANES;
export const MID_LANE = (LANES - 1) / 2;
/** Height of an end at h = 0, measured from the bottom of the view. */
export const BASE_Y = 1.7;
/** Vertical travel of each end, h in [0, 1]. The beam rests at h = 0.5. */
export const TRAVEL = 3.2;
export const REST_Y = BASE_Y + 0.5 * TRAVEL;
export const BALL_R = 0.26;

export function laneX(lane: number): number {
  return (lane - MID_LANE) * LANE_W;
}

// --- Ball: dashes and surges ------------------------------------------------
/** Sideways dash speed (m/s). One lane takes about 65 ms. */
export const DASH_SPEED = 24;
/** Two opposite-side taps this close together are a chord, i.e. a surge. */
export const CHORD_MS = 60;
/** A surge jerks the beam this far up the board, carrying the ball over anything in between. */
export const SURGE_DIST = 1.9;
export const SURGE_TIME = 0.26;
export const SURGE_RECHARGE = 2.2;
/** One-key mode has only the surge, so it comes back fast. */
export const SURGE_RECHARGE_ONE_KEY = 0.5;
export const HOP_H = 0.55;

// --- Beam ends --------------------------------------------------------------
// Normally a damped spring holds each end at mid height and taps only kick it
// (cosmetic). During a heavy pull the load comes on and each end obeys
//   dv/dt = -SAG * (1 + SAG_K * h) * heavy - END_DRAG * v
// with each tap adding LIFT * modeLift, so holding the target tap rate holds
// the beam level.
export const LIFT = 0.55;
export const SAG = 0.66;
export const SAG_K = 3;
export const END_DRAG = 5;
export const SPRING = 70;
export const SPRING_DRAG = 9;
/** Hover rate at mid height for modeLift = 1 (taps per second). */
export const HOVER_MID = (SAG * (1 + SAG_K * 0.5)) / LIFT;
/** Lift factor when the same key is hit twice in a row on a multi-key side. */
export const REPEAT_LIFT = 0.42;

// --- Events ---------------------------------------------------------------
/** Keydowns faster than this after a cue cannot be reactions. */
export const ANTICIPATION_MS = 100;
export const LURCH = 2.5;
export const BURST_LEAD = 1.0;
export const BURST_GRACE = 0.85;
/** A pull that drags on past this multiple of its hold time is lost. */
export const BURST_MAX_FACTOR = 1.7;
export const RATE_WINDOW = 1.25;

// --- Scoring --------------------------------------------------------------
export const SCORE_PER_M = 10;
export const RING_SCORE = 15;
/** Each pickup adds one to the chain; the multiplier is 1 + chain, up to this. */
export const CHAIN_MAX = 4;
/** Seconds without a pickup before the chain drops a step. */
export const CHAIN_HOLD = 6;

// --- Difficulty ramp ------------------------------------------------------
export function difficulty(t: number): number {
  return 1 - Math.exp(-t / 120);
}
export function climbSpeed(t: number): number {
  return 1.2 + 2.4 * (1 - Math.exp(-t / 110));
}
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// --- Key modes --------------------------------------------------------------
export interface ModeDef {
  id: number;
  /** Keys on the left / right side. Right is 0 in the one-key mode. */
  left: number;
  right: number;
  reflex: boolean;
  /** Lift multiplier in a heavy pull: more keys per side means each tap lifts less. */
  lift: number;
  /** Heavy-pull target (taps per second per side): start, step per pull, cap. */
  burstBase: number;
  burstStep: number;
  burstCap: number;
  /** Climb speed and hazard density multipliers: more keys dodge further, so the board pushes harder. */
  pace: number;
  density: number;
}

const perSide = [
  { lift: 1, burstBase: 4, burstStep: 0.3, burstCap: 7, pace: 1, density: 1 },
  { lift: 1, burstBase: 4, burstStep: 0.3, burstCap: 7, pace: 1, density: 1 },
  { lift: 2 / 3, burstBase: 6, burstStep: 0.45, burstCap: 11, pace: 1.3, density: 1.5 },
  { lift: 1 / 2, burstBase: 8, burstStep: 0.6, burstCap: 14.5, pace: 1.38, density: 1.6 },
];

function mode(id: number, left: number, right: number, reflex: boolean): ModeDef {
  return { id, left, right, reflex, ...perSide[left]! };
}

export const MODES: readonly ModeDef[] = [
  mode(1, 1, 0, false),
  mode(2, 1, 1, false),
  mode(3, 1, 1, true),
  mode(4, 2, 2, false),
  mode(5, 2, 2, true),
  mode(6, 3, 3, false),
];

export function getMode(id: number): ModeDef {
  return MODES[clamp(id | 0, 1, 6) - 1]!;
}

/**
 * Lanes covered by one tap. Keys further from the middle of the keyboard dash
 * further: with Z X | N M, X and N move one lane, Z and M two.
 */
export function dashLanes(m: ModeDef, side: number, keyIdx: number): number {
  return side === 0 ? m.left - keyIdx : keyIdx + 1;
}

/** Slot ids: side * 3 + key index for the six lift keys, 6 for reflex. */
export const SLOT_REFLEX = 6;
export const LEFT_MASK = 0b000111;
export const RIGHT_MASK = 0b111000;

// --- Palette (one accent, used only for the ball and the active cue) -------
export let COL_BG = '#0a0a0b';
export const COL_HOLE = '#000000';
export const COL_FAINT = '#26262b';
export const COL_TICK = '#3a3a41';
export const COL_DIM = '#6c6c74';
export const COL_MID = '#8b8b92';
export const COL_LINE = '#ececee';
export let COL_ACCENT = '#ff5a36';

/** Customize: the accent colour and the background, read live by everything that draws. */
export function setColours(accent: string, bg: string): void {
  COL_ACCENT = accent;
  COL_BG = bg;
}
export const FONT = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
