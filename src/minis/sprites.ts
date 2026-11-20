// Chunky low-poly sprites: a few flat polygons each, a light face and a shaded face, in the game's
// own greys and accent. Still minimal, but solid things instead of single lines.
//
// Every sprite is drawn in local units with its origin at a natural anchor (feet, centre, hull
// middle) and scaled by `k` (pixels per unit). `face` mirrors it left/right.

import { COL_ACCENT, COL_DIM, COL_LINE, COL_MID } from '../config.ts';

type Ctx = CanvasRenderingContext2D;

/** Shaded tones: a lit face and a shadow face for each base grey. */
export const TONE = {
  light: [COL_LINE, '#a3a3ab'] as const,
  mid: [COL_MID, '#5d5d65'] as const,
  dark: ['#4a4a52', '#33333a'] as const,
};
export type Tone = readonly [string, string];

/** Fill a polygon given as flat [x, y, x, y, ...] local coordinates. */
export function poly(ctx: Ctx, pts: readonly number[], x: number, y: number, k: number, face: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < pts.length; i += 2) {
    const px = x + pts[i]! * k * face;
    const py = y + pts[i + 1]! * k;
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

/** A regular polygon (a low-poly circle). */
export function ngon(ctx: Ctx, cx: number, cy: number, r: number, n: number, color: string, rot = 0): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

/** A low-poly ball: an octagon with a lit cap. */
export function ball(ctx: Ctx, cx: number, cy: number, r: number, tone: Tone = TONE.light): void {
  ngon(ctx, cx, cy, r, 8, tone[1], Math.PI / 8);
  ngon(ctx, cx - r * 0.18, cy - r * 0.18, r * 0.72, 8, tone[0], Math.PI / 8);
}

/** A little star burst (muzzle flash, impact). */
export function burst(ctx: Ctx, cx: number, cy: number, r: number, color = COL_ACCENT): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const rr = i % 2 ? r * 0.45 : r;
    const px = cx + Math.cos(a) * rr;
    const py = cy + Math.sin(a) * rr;
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

/**
 * A gunslinger, feet at (x, y), about 11 units tall, facing `face`.
 * pose: 'ready' (hand by the holster), 'fire' (arm out, pistol, flash), 'down' (keeled over).
 */
export function gunslinger(ctx: Ctx, x: number, y: number, k: number, face: number, pose: 'ready' | 'fire' | 'down', tone: Tone): void {
  ctx.save();
  if (pose === 'down') {
    // Tipped over backwards, pivoting on the heels.
    ctx.translate(x, y);
    ctx.rotate(-face * 1.25);
    ctx.translate(-x, -y);
  }
  const [lit, shade] = tone;
  // Legs and boots.
  poly(ctx, [-1.3, 0, -0.3, 0, -0.2, -4.2, -1.1, -4.2], x, y, k, face, shade);
  poly(ctx, [0.3, 0, 1.4, 0, 1.1, -4.2, 0.2, -4.2], x, y, k, face, shade);
  poly(ctx, [-1.5, 0, -0.2, 0, -0.2, -0.6, -1.5, -0.6], x, y, k, face, lit);
  poly(ctx, [0.3, 0, 1.7, 0, 1.7, -0.6, 0.3, -0.6], x, y, k, face, lit);
  // Coat: lit front, shaded back.
  poly(ctx, [-1.5, -3.6, 0, -3.6, 0, -7.6, -1.3, -7.6], x, y, k, face, shade);
  poly(ctx, [0, -3.6, 1.5, -3.6, 1.3, -7.6, 0, -7.6], x, y, k, face, lit);
  // Belt and holster.
  poly(ctx, [-1.5, -4.3, 1.5, -4.3, 1.5, -4.8, -1.5, -4.8], x, y, k, face, COL_DIM);
  poly(ctx, [1.3, -4.7, 2.1, -4.7, 2.0, -3.1, 1.4, -3.1], x, y, k, face, shade);
  // Head.
  ngon(ctx, x + 0.1 * k * face, y - 8.5 * k, 0.95 * k, 6, lit, Math.PI / 6);
  // Hat: brim and crown.
  poly(ctx, [-2.1, -9.2, 2.1, -9.2, 1.7, -9.7, -1.7, -9.7], x, y, k, face, shade);
  poly(ctx, [-1.0, -9.6, 1.0, -9.6, 0.8, -10.9, -0.8, -10.9], x, y, k, face, shade);
  if (pose === 'fire') {
    // Arm straight out, pistol, flash.
    poly(ctx, [1.0, -7.3, 4.4, -7.0, 4.4, -6.3, 1.0, -6.5], x, y, k, face, lit);
    poly(ctx, [4.1, -7.5, 5.7, -7.5, 5.7, -6.9, 4.8, -6.9, 4.7, -6.0, 4.1, -6.0], x, y, k, face, COL_DIM);
    burst(ctx, x + 6.3 * k * face, y - 7.2 * k, 0.9 * k);
  } else {
    // Arm down, hand hovering at the holster.
    poly(ctx, [1.0, -7.4, 1.8, -7.2, 2.1, -4.9, 1.4, -4.9], x, y, k, face, lit);
    poly(ctx, [1.5, -4.0, 2.0, -4.0, 2.0, -3.2, 1.5, -3.2], x, y, k, face, COL_DIM);
  }
  ctx.restore();
}

/** A goalkeeper, feet at (x, y), arms out; `lean` from -1 (dived left) to 1 (dived right). */
export function keeper(ctx: Ctx, x: number, y: number, k: number, lean: number, tone: Tone = TONE.light): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(lean * 1.1);
  ctx.translate(-x, -y);
  const [lit, shade] = tone;
  poly(ctx, [-1.4, 0, -0.4, 0, -0.3, -3.8, -1.2, -3.8], x, y, k, 1, shade);
  poly(ctx, [0.4, 0, 1.4, 0, 1.2, -3.8, 0.3, -3.8], x, y, k, 1, shade);
  poly(ctx, [-1.6, -3.5, 1.6, -3.5, 1.4, -7.2, -1.4, -7.2], x, y, k, 1, lit);
  poly(ctx, [0, -3.5, 1.6, -3.5, 1.4, -7.2, 0, -7.2], x, y, k, 1, shade);
  // Arms up and out, gloves in the accent.
  poly(ctx, [-1.3, -7.0, -1.1, -6.2, -3.6, -8.6, -3.9, -9.2], x, y, k, 1, lit);
  poly(ctx, [1.3, -7.0, 1.1, -6.2, 3.6, -8.6, 3.9, -9.2], x, y, k, 1, lit);
  ngon(ctx, x - 4.1 * k, y - 9.5 * k, 0.6 * k, 6, COL_ACCENT);
  ngon(ctx, x + 4.1 * k, y - 9.5 * k, 0.6 * k, 6, COL_ACCENT);
  ngon(ctx, x, y - 8.2 * k, 0.95 * k, 6, lit, Math.PI / 6);
  ctx.restore();
}

/** A rowing boat seen from above, centred at (x, y), bow pointing up; oars at angles (radians). */
export function rowboat(ctx: Ctx, x: number, y: number, k: number, heading: number, oarL: number, oarR: number, tone: Tone = TONE.light): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(heading);
  const [lit, shade] = tone;
  // Oars first, under the hull.
  for (const [side, ang] of [
    [-1, oarL],
    [1, oarR],
  ] as const) {
    ctx.save();
    ctx.translate(side * 1.2 * k, 0.2 * k);
    ctx.rotate(side * ang);
    poly(ctx, [0, -0.15, side * 4.2, -0.15, side * 4.2, 0.15, 0, 0.15], 0, 0, k, 1, COL_MID);
    poly(ctx, [side * 3.6, -0.45, side * 5.0, -0.35, side * 5.0, 0.35, side * 3.6, 0.45], 0, 0, k, 1, COL_MID);
    ctx.restore();
  }
  // Hull: pointed bow, square stern; lit port side, shaded starboard.
  poly(ctx, [0, -4.2, -1.4, -2.2, -1.5, 2.6, 0, 2.8], 0, 0, k, 1, lit);
  poly(ctx, [0, -4.2, 1.4, -2.2, 1.5, 2.6, 0, 2.8], 0, 0, k, 1, shade);
  // Thwart and rower.
  poly(ctx, [-1.3, 0.1, 1.3, 0.1, 1.3, 0.5, -1.3, 0.5], 0, 0, k, 1, COL_DIM);
  ngon(ctx, 0, 0.9 * k, 0.6 * k, 6, COL_ACCENT);
  ctx.restore();
}

/** A lunar lander, centred on its body at (x, y); `flame` 0..1 for each of the two engines. */
export function lander(ctx: Ctx, x: number, y: number, k: number, flameL: number, flameR: number, tilt = 0, tone: Tone = TONE.light): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  const [lit, shade] = tone;
  // Flames under each nozzle.
  for (const [side, f] of [
    [-1, flameL],
    [1, flameR],
  ] as const) {
    if (f > 0.02) poly(ctx, [side * 0.6 - 0.35, 1.6, side * 0.6 + 0.35, 1.6, side * 0.6, 1.6 + 2.4 * f], 0, 0, k, 1, COL_ACCENT);
  }
  // Legs.
  poly(ctx, [-1.3, 0.6, -1.0, 0.9, -2.3, 2.4, -2.6, 2.3], 0, 0, k, 1, shade);
  poly(ctx, [1.3, 0.6, 1.0, 0.9, 2.3, 2.4, 2.6, 2.3], 0, 0, k, 1, shade);
  poly(ctx, [-3.0, 2.3, -1.9, 2.3, -1.9, 2.6, -3.0, 2.6], 0, 0, k, 1, lit);
  poly(ctx, [1.9, 2.3, 3.0, 2.3, 3.0, 2.6, 1.9, 2.6], 0, 0, k, 1, lit);
  // Descent stage (box) and nozzles.
  poly(ctx, [-1.6, -0.2, 1.6, -0.2, 1.6, 1.2, -1.6, 1.2], 0, 0, k, 1, shade);
  poly(ctx, [-1.0, 1.2, -0.2, 1.2, -0.3, 1.7, -0.9, 1.7], 0, 0, k, 1, COL_DIM);
  poly(ctx, [0.2, 1.2, 1.0, 1.2, 0.9, 1.7, 0.3, 1.7], 0, 0, k, 1, COL_DIM);
  // Ascent stage (cabin), faceted.
  poly(ctx, [-1.3, -0.2, -1.5, -1.4, -0.7, -2.4, 0, -2.4, 0, -0.2], 0, 0, k, 1, lit);
  poly(ctx, [0, -2.4, 0.7, -2.4, 1.5, -1.4, 1.3, -0.2, 0, -0.2], 0, 0, k, 1, shade);
  poly(ctx, [-0.6, -1.7, 0.1, -1.7, 0.1, -1.1, -0.7, -1.1], 0, 0, k, 1, COL_DIM);
  ctx.restore();
}

/** A small spaceship, nose along `heading` (radians, 0 = up), with a flame when thrusting. */
export function ship(ctx: Ctx, x: number, y: number, k: number, heading: number, thrust: boolean, tone: Tone = TONE.light): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(heading);
  const [lit, shade] = tone;
  if (thrust) poly(ctx, [-0.5, 1.4, 0.5, 1.4, 0, 3.0], 0, 0, k, 1, COL_ACCENT);
  poly(ctx, [0, -2.2, -1.5, 1.6, 0, 1.0], 0, 0, k, 1, lit);
  poly(ctx, [0, -2.2, 1.5, 1.6, 0, 1.0], 0, 0, k, 1, shade);
  ctx.restore();
}

/** A car seen from above, bow up, centred at (x, y); `steer` -1..1 tilts the nose. */
export function car(ctx: Ctx, x: number, y: number, k: number, steer = 0, tone: Tone = TONE.light): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(steer * 0.25);
  const [lit, shade] = tone;
  // Wheels.
  for (const [wx, wy] of [
    [-1.25, -1.5],
    [1.25, -1.5],
    [-1.25, 1.6],
    [1.25, 1.6],
  ] as const)
    poly(ctx, [wx - 0.35, wy - 0.6, wx + 0.35, wy - 0.6, wx + 0.35, wy + 0.6, wx - 0.35, wy + 0.6], 0, 0, k, 1, COL_DIM);
  // Body: lit left, shaded right; tapered nose.
  poly(ctx, [0, -2.8, -0.8, -2.6, -1.1, -1.6, -1.1, 2.5, 0, 2.7], 0, 0, k, 1, lit);
  poly(ctx, [0, -2.8, 0.8, -2.6, 1.1, -1.6, 1.1, 2.5, 0, 2.7], 0, 0, k, 1, shade);
  // Windscreen and roof.
  poly(ctx, [-0.8, -1.0, 0.8, -1.0, 0.6, -0.2, -0.6, -0.2], 0, 0, k, 1, COL_DIM);
  poly(ctx, [-0.7, 0.1, 0.7, 0.1, 0.7, 1.3, -0.7, 1.3], 0, 0, k, 1, shade);
  ctx.restore();
}

/** A crate, top-left corner at (x, y), w by h pixels: planks and a cross brace. */
export function crate(ctx: Ctx, x: number, y: number, w: number, h: number, edge = COL_ACCENT): void {
  ctx.fillStyle = '#3a2a24';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = edge;
  const t = Math.max(1, Math.min(w, h) * 0.14);
  ctx.fillRect(x, y, w, t);
  ctx.fillRect(x, y + h - t, w, t);
  ctx.fillRect(x, y, t, h);
  ctx.fillRect(x + w - t, y, t, h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + t, y + t, w - 2 * t, h - 2 * t);
  ctx.clip();
  ctx.strokeStyle = edge;
  ctx.lineWidth = t * 0.8;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y + h);
  ctx.stroke();
  ctx.restore();
}

/** A baseball bat from its knob at (x, y), `len` pixels long, at angle `ang` (radians). */
export function bat(ctx: Ctx, x: number, y: number, len: number, ang: number, tone: Tone = TONE.light): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  const k = len / 10;
  const [lit, shade] = tone;
  // Knob, handle, then the barrel swelling out; lit top half, shaded bottom.
  poly(ctx, [-0.3, -0.35, 0.2, -0.35, 0.2, 0.35, -0.3, 0.35], 0, 0, k, 1, COL_DIM);
  poly(ctx, [0.2, -0.2, 4.5, -0.25, 10, -0.65, 10, 0, 0.2, 0], 0, 0, k, 1, lit);
  poly(ctx, [0.2, 0, 10, 0, 10, 0.65, 4.5, 0.25, 0.2, 0.2], 0, 0, k, 1, shade);
  ctx.restore();
}

/** A jumper, feet at (x, y): crouched (0), or tucked in the air (1). */
export function jumper(ctx: Ctx, x: number, y: number, k: number, air: number, tone: Tone = TONE.light): void {
  const [lit, shade] = tone;
  const tuck = air > 0.5;
  // Legs: bent when crouched or tucked.
  if (tuck) {
    poly(ctx, [-1.0, -1.2, 0, -1.2, 0, -2.6, -1.2, -2.4], x, y, k, 1, shade);
    poly(ctx, [0, -1.2, 1.0, -1.2, 1.2, -2.4, 0, -2.6], x, y, k, 1, shade);
  } else {
    poly(ctx, [-1.1, 0, -0.3, 0, -0.1, -2.6, -0.9, -2.6], x, y, k, 1, shade);
    poly(ctx, [0.3, 0, 1.1, 0, 0.9, -2.6, 0.1, -2.6], x, y, k, 1, shade);
  }
  poly(ctx, [-1.2, -2.4, 1.2, -2.4, 1.0, -5.4, -1.0, -5.4], x, y, k, 1, lit);
  poly(ctx, [0, -2.4, 1.2, -2.4, 1.0, -5.4, 0, -5.4], x, y, k, 1, shade);
  ngon(ctx, x, y - 6.3 * k, 0.85 * k, 6, lit, Math.PI / 6);
  // Arms out to the rope handles.
  poly(ctx, [-1.0, -5.0, -1.0, -4.4, -2.6, -3.6, -2.6, -4.2], x, y, k, 1, lit);
  poly(ctx, [1.0, -5.0, 1.0, -4.4, 2.6, -3.6, 2.6, -4.2], x, y, k, 1, lit);
}

/**
 * A standing person, feet at (x, y), about 9 units tall, facing `face`. `arm` is the angle of the
 * front arm from hanging down (0) through forward (PI / 2) to straight up (PI). Returns the hand.
 */
export function person(ctx: Ctx, x: number, y: number, k: number, face: number, arm: number, tone: Tone = TONE.light): [number, number] {
  const [lit, shade] = tone;
  poly(ctx, [-1.1, 0, -0.3, 0, -0.2, -3.6, -1.0, -3.6], x, y, k, face, shade);
  poly(ctx, [0.3, 0, 1.1, 0, 1.0, -3.6, 0.2, -3.6], x, y, k, face, shade);
  poly(ctx, [-1.2, -3.3, 0, -3.3, 0, -6.6, -1.0, -6.6], x, y, k, face, shade);
  poly(ctx, [0, -3.3, 1.2, -3.3, 1.0, -6.6, 0, -6.6], x, y, k, face, lit);
  ngon(ctx, x + 0.15 * k * face, y - 7.5 * k, 0.85 * k, 6, lit, Math.PI / 6);
  // Front arm from the shoulder.
  const sx = x + 0.8 * k * face;
  const sy = y - 6.3 * k;
  const len = 3.0 * k;
  const hx = sx + Math.sin(arm) * len * face;
  const hy = sy + Math.cos(arm) * len;
  const nx = (Math.cos(arm) * 0.35 * k) * face;
  const ny = -Math.sin(arm) * 0.35 * k;
  ctx.fillStyle = lit;
  ctx.beginPath();
  ctx.moveTo(sx - nx, sy - ny);
  ctx.lineTo(sx + nx, sy + ny);
  ctx.lineTo(hx + nx, hy + ny);
  ctx.lineTo(hx - nx, hy - ny);
  ctx.closePath();
  ctx.fill();
  return [hx, hy];
}
