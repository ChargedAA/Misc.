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
/** Height of an end at h = 0, measured from the bottom of the view. */
export const BASE_Y = 2.5;
/** Vertical travel of each end, h in [0, 1]. */
export const TRAVEL = 3.2;
export const BALL_R = 0.26;
export const BALL_LIMIT = BEAM_HALF - BALL_R - 0.06;

// --- Beam ends ("taps are lift") -------------------------------------------
// Each end obeys  dv/dt = -SAG * (1 + SAG_K * h) * heavy - END_DRAG * v
// and a tap adds LIFT * modeLift to v. The hover tap rate therefore rises with
// height, so tap rate maps to height: 1.2 /s at the bottom, 3 /s in the
// middle, 4.8 /s at the top for a one-key side.
export const LIFT = 0.55;
export const SAG = 0.66;
export const SAG_K = 3;
export const END_DRAG = 5;
/** Hover rate at mid height for modeLift = 1 (taps per second). */
export const HOVER_MID = (SAG * (1 + SAG_K * 0.5)) / LIFT;
/** Impulse factor when the same key is hit twice in a row on a multi-key side. */
export const REPEAT_LIFT = 0.42;

// --- Ball -----------------------------------------------------------------
/** Effective gravity along the beam (already includes the 5/7 rolling factor). */
export const BALL_G = 22;
export const BALL_DRAG = 0.55;
export const BALL_BOUNCE = 0.25;

// --- Events ---------------------------------------------------------------
/** Keydowns faster than this after a cue cannot be reactions. */
export const ANTICIPATION_MS = 100;
export const LURCH = 2.1;
export const FALSE_START_JOLT = 0.55;
export const CUE_SLIP = 1.6;
export const BURST_LEAD = 1.0;
export const BURST_GRACE = 0.85;
export const RATE_WINDOW = 1.25;

// --- Scoring --------------------------------------------------------------
export const SCORE_PER_M = 10;
export const ZONE_MULT = 3;

// --- Difficulty ramp ------------------------------------------------------
export function difficulty(t: number): number {
  return 1 - Math.exp(-t / 120);
}
export function climbSpeed(t: number): number {
  return 1.1 + 2.7 * (1 - Math.exp(-t / 110));
}
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// --- Modes ----------------------------------------------------------------
export interface ModeDef {
  id: number;
  /** Lift keys on the left / right side. 0 means that end is fixed. */
  left: number;
  right: number;
  reflex: boolean;
  /** Lift multiplier: more keys per side means each tap lifts less. */
  lift: number;
  /** Heavy-pull target (taps per second per side): start, step per pull, cap. */
  burstBase: number;
  burstStep: number;
  burstCap: number;
}

const perSide = [
  { lift: 1, burstBase: 4, burstStep: 0.3, burstCap: 7 },
  { lift: 1, burstBase: 4, burstStep: 0.3, burstCap: 7 },
  { lift: 2 / 3, burstBase: 6, burstStep: 0.45, burstCap: 11 },
  { lift: 1 / 2, burstBase: 8, burstStep: 0.6, burstCap: 14.5 },
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

// --- Palette (one accent, used only for the ball and the active cue) -------
export const COL_BG = '#0a0a0b';
export const COL_HOLE = '#000000';
export const COL_FAINT = '#1b1b1e';
export const COL_DIM = '#3a3a40';
export const COL_MID = '#8b8b92';
export const COL_LINE = '#ececee';
export const COL_ACCENT = '#ff5a36';
export const FONT = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
