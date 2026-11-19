// Canvas 2D renderer. Everything is drawn in device pixels; nothing here
// allocates per frame (numbers are drawn digit by digit from constant strings,
// dash patterns are constants, paths are batched).

import {
  BALL_R,
  BASE_Y,
  BEAM_HALF,
  BOARD_W,
  COL_ACCENT,
  COL_BG,
  COL_DIM,
  COL_FAINT,
  COL_HOLE,
  COL_LINE,
  COL_MID,
  COL_TICK,
  FONT,
  LANES,
  TRAVEL,
  VIEW_H,
  laneX,
} from './config.ts';
import {
  BURST_ACTIVE,
  BURST_LEADIN,
  BURST_NONE,
  HAZ_BAR,
  HAZ_CAP,
  MARK_CAP,
  PHASE_FALL,
  PHASE_OVER,
  PHASE_READY,
  RING_CAP,
  SECTION_NAMES,
  TRAIL_CAP,
  type Sim,
} from './sim.ts';
import type { TouchLayout } from './touch.ts';

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;
const MULT_LABELS = ['', '×2', '×3', '×4', '×5', '×6'] as const;
const COL_CABLE = '#63636a';
const NO_DASH: number[] = [];
const TAU = Math.PI * 2;
const HALF_PI = Math.PI / 2;
const TICK_LABELS: string[] = [];
const TRAIL_BANDS = 6;
const HEIGHT_ZERO = BASE_Y + 0.5 * TRAVEL;

export const SHAPE_SQUARE = 0;
export const SHAPE_CIRCLE = 1;
export const SHAPE_TRIANGLE = 2;
export const SHAPE_DIAMOND = 3;
export const SHAPE_CROSS = 4;

export const ICON_PAUSE = 0;
export const ICON_CLOSE = 1;

export interface Hints {
  left: string;
  right: string;
  center: string;
  sub: string;
}

export interface PerfStats {
  show: boolean;
  fps: number;
  frameMs: number;
  maxMs: number;
  ticks: number;
}

export class View {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  w = 0;
  h = 0;
  dpr = 1;
  /** Device pixels per metre. */
  scale = 1;
  /** Pixel x of the board centre and pixel y of the view's bottom / top edge. */
  ox = 0;
  bottom = 0;
  top = 0;
  left = 0;
  right = 0;
  fontHud = '';
  fontTiny = '';
  fontBig = '';
  fontMono = '';
  fontPad = '';
  private advHud = 0;
  private advTiny = 0;
  private advBig = 0;
  private advMono = 0;
  private readonly dashMark: number[] = [2, 7];
  private readonly dashSlack: number[] = [3, 5];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
    this.resize();
  }

  resize(): void {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const cw = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const ch = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== cw) this.canvas.width = cw;
    if (this.canvas.height !== ch) this.canvas.height = ch;
    this.w = cw;
    this.h = ch;
    this.dpr = dpr;
    this.scale = Math.min(cw / (BOARD_W + 0.6), ch / VIEW_H);
    this.ox = Math.round(cw / 2);
    this.bottom = Math.round((ch + VIEW_H * this.scale) / 2);
    this.top = this.bottom - VIEW_H * this.scale;
    this.left = this.ox - (BOARD_W / 2) * this.scale;
    this.right = this.ox + (BOARD_W / 2) * this.scale;

    const ctx = this.ctx;
    // In-game text is sized to be read at a glance mid-game, a little smaller on small screens.
    const k = Math.max(0.82, Math.min(1, Math.min(cw, ch) / dpr / 720));
    this.fontHud = `500 ${Math.round(18 * k * dpr)}px ${FONT}`;
    this.fontTiny = `500 ${Math.round(14.5 * k * dpr)}px ${FONT}`;
    this.fontBig = `300 ${Math.round(56 * k * dpr)}px ${FONT}`;
    this.fontPad = `500 ${Math.round(14 * k * dpr)}px ${FONT}`;
    this.fontMono = `${Math.round(11 * dpr)}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    this.advHud = this.measureDigits(this.fontHud);
    this.advTiny = this.measureDigits(this.fontTiny);
    this.advBig = this.measureDigits(this.fontBig);
    this.advMono = this.measureDigits(this.fontMono);
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'round';
  }

  private measureDigits(font: string): number {
    const ctx = this.ctx;
    ctx.font = font;
    let w = 0;
    for (const d of DIGITS) w = Math.max(w, ctx.measureText(d).width);
    return Math.ceil(w);
  }

  advance(font: string): number {
    return font === this.fontHud ? this.advHud : font === this.fontBig ? this.advBig : font === this.fontMono ? this.advMono : this.advTiny;
  }

  /**
   * Draw a non-negative number right-aligned at xRight with tabular digits.
   * Returns the x of its left edge. The caller sets fillStyle.
   */
  number(value: number, decimals: number, xRight: number, y: number, font: string): number {
    const ctx = this.ctx;
    const adv = this.advance(font);
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    let scaled = 1;
    for (let i = 0; i < decimals; i++) scaled *= 10;
    let n = Math.round((value < 0 ? 0 : value) * scaled);
    let x = xRight;
    let drawn = 0;
    do {
      if (decimals > 0 && drawn === decimals) {
        x -= adv * 0.45;
        ctx.fillText('.', x + adv * 0.225, y);
      } else if (decimals === 0 && drawn > 0 && drawn % 3 === 0) {
        x -= adv * 0.3;
      }
      const d = n % 10;
      n = (n - d) / 10;
      x -= adv;
      ctx.fillText(DIGITS[d]!, x + adv * 0.5, y);
      drawn++;
    } while (n > 0 || drawn <= decimals);
    return x;
  }

  /** Width number() would use, for left-aligned or centred layouts. */
  numberWidth(value: number, decimals: number, font: string): number {
    const adv = this.advance(font);
    let scaled = 1;
    for (let i = 0; i < decimals; i++) scaled *= 10;
    let n = Math.round((value < 0 ? 0 : value) * scaled);
    let digits = 0;
    do {
      n = Math.floor(n / 10);
      digits++;
    } while (n > 0 || digits <= decimals);
    let w = digits * adv;
    if (decimals > 0) w += adv * 0.45;
    else w += Math.floor((digits - 1) / 3) * adv * 0.3;
    return w;
  }

  text(s: string, x: number, y: number, font: string, align: CanvasTextAlign): void {
    const ctx = this.ctx;
    ctx.font = font;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(s, x, y);
  }

  clear(): void {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.setLineDash(NO_DASH);
    ctx.fillStyle = COL_BG;
    ctx.fillRect(0, 0, this.w, this.h);
  }

  /**
   * One of the trainer shapes, centred on (x, y) with "radius" r. The caller
   * sets fillStyle / strokeStyle / lineWidth; `solid` fills, otherwise outlines.
   */
  shape(kind: number, x: number, y: number, r: number, solid: boolean): void {
    const ctx = this.ctx;
    ctx.beginPath();
    if (kind === SHAPE_CIRCLE) {
      ctx.arc(x, y, r, 0, TAU);
    } else if (kind === SHAPE_SQUARE) {
      const q = r * 0.88;
      ctx.rect(x - q, y - q, q * 2, q * 2);
    } else if (kind === SHAPE_TRIANGLE) {
      ctx.moveTo(x, y - r * 1.08);
      ctx.lineTo(x + r * 1.02, y + r * 0.78);
      ctx.lineTo(x - r * 1.02, y + r * 0.78);
      ctx.closePath();
    } else if (kind === SHAPE_DIAMOND) {
      ctx.moveTo(x, y - r * 1.15);
      ctx.lineTo(x + r * 0.95, y);
      ctx.lineTo(x, y + r * 1.15);
      ctx.lineTo(x - r * 0.95, y);
      ctx.closePath();
    } else {
      // A plus sign, as one outline so it can be filled or stroked like the rest.
      const a = r * 0.36;
      ctx.moveTo(x - a, y - r);
      ctx.lineTo(x + a, y - r);
      ctx.lineTo(x + a, y - a);
      ctx.lineTo(x + r, y - a);
      ctx.lineTo(x + r, y + a);
      ctx.lineTo(x + a, y + a);
      ctx.lineTo(x + a, y + r);
      ctx.lineTo(x - a, y + r);
      ctx.lineTo(x - a, y + a);
      ctx.lineTo(x - r, y + a);
      ctx.lineTo(x - r, y - a);
      ctx.lineTo(x - a, y - a);
      ctx.closePath();
    }
    if (solid) ctx.fill();
    else ctx.stroke();
  }

  /** A chevron pointing left (dir < 0) or right. */
  arrow(x: number, y: number, r: number, dir: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x - dir * r * 0.9, y);
    ctx.lineTo(x + dir * r * 0.9, y);
    ctx.moveTo(x + dir * r * 0.15, y - r * 0.7);
    ctx.lineTo(x + dir * r * 0.9, y);
    ctx.lineTo(x + dir * r * 0.15, y + r * 0.7);
    ctx.stroke();
  }

  /** Touch pads and the corner button. Drawn only once a touch has been seen. */
  drawTouch(touch: TouchLayout, icon: number, held: number, always = false): void {
    if (!touch.active && !always) return;
    const ctx = this.ctx;
    const dpr = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.setLineDash(NO_DASH);
    ctx.lineWidth = dpr;
    const pads = touch.active ? touch.pads : [];
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i]!;
      const on = (held & (1 << p.slot)) !== 0;
      ctx.strokeStyle = on ? COL_LINE : COL_DIM;
      this.roundRect(p.x, p.y, p.w, p.h, 10 * dpr);
      ctx.stroke();
      ctx.fillStyle = on ? COL_LINE : COL_MID;
      this.text(p.label, p.x + p.w / 2, p.y + p.h / 2 + 4 * dpr, this.fontPad, 'center');
    }
    const c = touch.corner;
    ctx.strokeStyle = COL_DIM;
    this.roundRect(c.x, c.y, c.w, c.h, 10 * dpr);
    ctx.stroke();
    ctx.strokeStyle = COL_MID;
    ctx.lineWidth = 1.5 * dpr;
    const cx = c.x + c.w / 2;
    const cy = c.y + c.h / 2;
    const q = c.w * 0.17;
    ctx.beginPath();
    if (icon === ICON_PAUSE) {
      ctx.moveTo(cx - q * 0.7, cy - q);
      ctx.lineTo(cx - q * 0.7, cy + q);
      ctx.moveTo(cx + q * 0.7, cy - q);
      ctx.lineTo(cx + q * 0.7, cy + q);
    } else {
      ctx.moveTo(cx - q, cy - q);
      ctx.lineTo(cx + q, cy + q);
      ctx.moveTo(cx + q, cy - q);
      ctx.lineTo(cx - q, cy + q);
    }
    ctx.stroke();
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arc(x + w - r, y + r, r, -HALF_PI, 0);
    ctx.lineTo(x + w, y + h - r);
    ctx.arc(x + w - r, y + h - r, r, 0, HALF_PI);
    ctx.lineTo(x + r, y + h);
    ctx.arc(x + r, y + h - r, r, HALF_PI, Math.PI);
    ctx.lineTo(x, y + r);
    ctx.arc(x + r, y + r, r, Math.PI, Math.PI + HALF_PI);
    ctx.closePath();
  }

  // --- Climb ------------------------------------------------------------------

  drawGame(sim: Sim, alpha: number, now: number, hints: Hints, touch: TouchLayout): void {
    const ctx = this.ctx;
    const s = this.scale;
    const dpr = this.dpr;
    const ox = this.ox;
    this.clear();

    const shake = sim.shake;
    if (shake > 0.01) {
      ctx.translate(Math.sin(sim.tick * 0.61) * shake * 4 * dpr, Math.cos(sim.tick * 0.83) * shake * 4 * dpr);
    }

    const cam = sim.climbPrev + (sim.climb - sim.climbPrev) * alpha;
    const bottom = this.bottom;
    const top = this.top;
    const left = this.left;
    const right = this.right;

    // Rails and height ticks. One tick per metre climbed.
    ctx.lineWidth = dpr;
    ctx.strokeStyle = COL_TICK;
    ctx.beginPath();
    const first = Math.ceil(cam - HEIGHT_ZERO);
    const lastTick = Math.floor(cam + VIEW_H - HEIGHT_ZERO);
    for (let m = first; m <= lastTick; m++) {
      const y = Math.round(bottom - (m + HEIGHT_ZERO - cam) * s) + 0.5;
      const len = (m % 5 === 0 ? 12 : 5) * dpr;
      ctx.moveTo(left, y);
      ctx.lineTo(left + len, y);
      ctx.moveTo(right, y);
      ctx.lineTo(right - len, y);
    }
    ctx.stroke();
    ctx.strokeStyle = COL_FAINT;
    ctx.beginPath();
    ctx.moveTo(Math.round(left) + 0.5, top);
    ctx.lineTo(Math.round(left) + 0.5, bottom);
    ctx.moveTo(Math.round(right) - 0.5, top);
    ctx.lineTo(Math.round(right) - 0.5, bottom);
    ctx.stroke();
    // Height labels sit in the margin outside the left rail, when there is one.
    if (left > 44 * dpr) {
      ctx.fillStyle = COL_DIM;
      for (let m = Math.ceil(first / 10) * 10; m <= lastTick; m += 10) {
        if (m <= 0) continue;
        const idx = m / 10;
        let label = TICK_LABELS[idx];
        if (label === undefined) label = TICK_LABELS[idx] = String(m);
        this.text(label, left - 9 * dpr, bottom - (m + HEIGHT_ZERO - cam) * s + 3.5 * dpr, this.fontTiny, 'right');
      }
    }

    // Section markers: a dotted line and the name of what comes next.
    if (sim.markCount > 0) {
      ctx.strokeStyle = COL_DIM;
      ctx.setLineDash(this.dashMark);
      ctx.beginPath();
      for (let i = 0; i < sim.markCount; i++) {
        const k = (sim.markStart + i) % MARK_CAP;
        const y = Math.round(bottom - (sim.markY[k]! - cam) * s) + 0.5;
        ctx.moveTo(ox - BEAM_HALF * s, y);
        ctx.lineTo(ox + BEAM_HALF * s, y);
      }
      ctx.stroke();
      ctx.setLineDash(NO_DASH);
      ctx.fillStyle = COL_MID;
      for (let i = 0; i < sim.markCount; i++) {
        const k = (sim.markStart + i) % MARK_CAP;
        this.text(SECTION_NAMES[sim.markType[k]!]!, ox + BEAM_HALF * s - 9 * dpr, bottom - (sim.markY[k]! - cam) * s - 6 * dpr, this.fontTiny, 'right');
      }
    }

    // Slider tracks: where a moving hole can go.
    ctx.strokeStyle = COL_TICK;
    ctx.lineWidth = dpr;
    ctx.beginPath();
    for (let i = 0; i < sim.hazCount; i++) {
      const k = (sim.hazStart + i) % HAZ_CAP;
      if (sim.hazV[k] === 0) continue;
      const y = Math.round(bottom - (sim.hazY[k]! - cam) * s) + 0.5;
      ctx.moveTo(ox + sim.hazMin[k]! * s, y);
      ctx.lineTo(ox + sim.hazMax[k]! * s, y);
    }
    ctx.stroke();

    // Hazards, one batched path. Each is a horizontal capsule.
    ctx.beginPath();
    for (let i = 0; i < sim.hazCount; i++) {
      const k = (sim.hazStart + i) % HAZ_CAP;
      const y = bottom - (sim.hazY[k]! - cam) * s;
      const r = sim.hazR[k]! * s;
      if (sim.hazType[k] === HAZ_BAR) {
        const x0 = ox - BEAM_HALF * s;
        ctx.rect(x0, y - r, BEAM_HALF * 2 * s, r * 2);
        continue;
      }
      const x = ox + sim.hazX[k]! * s;
      const len = sim.hazL[k]! * s;
      if (len === 0) {
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, TAU);
      } else {
        ctx.moveTo(x - len, y - r);
        ctx.lineTo(x + len, y - r);
        ctx.arc(x + len, y, r, -HALF_PI, HALF_PI);
        ctx.lineTo(x - len, y + r);
        ctx.arc(x - len, y, r, HALF_PI, Math.PI + HALF_PI);
      }
    }
    ctx.fillStyle = COL_HOLE;
    ctx.fill();
    ctx.lineWidth = 1.25 * dpr;
    ctx.strokeStyle = COL_MID;
    ctx.stroke();

    // Pickups.
    ctx.strokeStyle = COL_LINE;
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    const rr = 0.2 * s;
    for (let i = 0; i < sim.ringCount; i++) {
      const k = (sim.ringStart + i) % RING_CAP;
      if (sim.ringLive[k] === 0) continue;
      const x = ox + sim.ringX[k]! * s;
      const y = bottom - (sim.ringY[k]! - cam) * s;
      ctx.moveTo(x, y - rr);
      ctx.lineTo(x + rr, y);
      ctx.lineTo(x, y + rr);
      ctx.lineTo(x - rr, y);
      ctx.closePath();
    }
    ctx.stroke();

    // Beam geometry (interpolated).
    const yLw = sim.endY(0, alpha);
    const yRw = sim.endY(1, alpha);
    const xL = ox - BEAM_HALF * s;
    const xR = ox + BEAM_HALF * s;
    const yL = bottom - (yLw - cam) * s;
    const yR = bottom - (yRw - cam) * s;
    let bx = sim.ballXPrev + (sim.ballX - sim.ballXPrev) * alpha;
    let byW = yLw + ((yRw - yLw) * (bx + BEAM_HALF)) / (BEAM_HALF * 2) + BALL_R + sim.hopPrev + (sim.hop - sim.hopPrev) * alpha;
    let ballR = BALL_R;
    const falling = sim.phase === PHASE_FALL || sim.phase === PHASE_OVER;
    if (falling) {
      const t = Math.min(1, sim.fallT / 0.32);
      const e = t * t * (3 - 2 * t);
      bx = sim.fallFromX + (sim.fallToX - sim.fallFromX) * e;
      byW = sim.fallFromY + (sim.fallToY - sim.fallFromY) * e;
      ballR = BALL_R * (1 - e);
    }
    const ballPx = ox + bx * s;
    const ballPy = bottom - (byW - cam) * s;

    // Ball trail, drawn in board space so it scrolls away with the board.
    const tc = sim.trailCount;
    if (tc > 1 && !falling) {
      ctx.strokeStyle = COL_ACCENT;
      ctx.lineWidth = 1.5 * dpr;
      const per = Math.ceil(tc / TRAIL_BANDS);
      // Sample j = 0 is the newest.
      for (let band = 0; band < TRAIL_BANDS; band++) {
        const from = band * per;
        if (from >= tc) break;
        const to = Math.min(tc - 1, from + per);
        ctx.globalAlpha = 0.34 * (1 - band / TRAIL_BANDS);
        ctx.beginPath();
        if (band === 0) ctx.moveTo(ballPx, ballPy);
        for (let j = from; j <= to; j++) {
          const k = (sim.trailHead - 1 - j + TRAIL_CAP * 2) % TRAIL_CAP;
          const x = ox + sim.trailX[k]! * s;
          const y = bottom - (sim.trailY[k]! - cam) * s;
          if (j === from && band !== 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // Cables.
    const cueSide = sim.cueActive ? sim.cueSide : -1;
    // Orange means press; grey means hold still.
    const cueCol = sim.cueNogo ? COL_MID : COL_ACCENT;
    if (sim.cueActive) sim.markCueDrawn(performance.now());
    for (let side = 0; side < 2; side++) {
      const x = side === 0 ? xL : xR;
      const y = side === 0 ? yL : yR;
      if (side === cueSide) {
        // Active cue: the cable turns accent and burns down as the window runs out.
        const left01 = sim.cueDrawnAt > 0 ? 1 - (now - sim.cueDrawnAt) / sim.cueWindow : 1;
        const remain = left01 < 0 ? 0 : left01 > 1 ? 1 : left01;
        const jx = x + Math.sin(now * 0.09) * 1.5 * dpr;
        const yCut = y - (y - top) * remain;
        ctx.strokeStyle = COL_CABLE;
        ctx.lineWidth = dpr;
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, yCut);
        ctx.stroke();
        ctx.strokeStyle = cueCol;
        ctx.lineWidth = 3 * dpr;
        ctx.beginPath();
        ctx.moveTo(jx, yCut);
        ctx.lineTo(jx, y);
        ctx.stroke();
        ctx.fillStyle = cueCol;
        const q = 5 * dpr;
        ctx.fillRect(x - q, y - q, q * 2, q * 2);
      } else {
        const slack = sim.burstState === BURST_ACTIVE && sim.burstOk[side] === 0;
        ctx.strokeStyle = COL_CABLE;
        ctx.lineWidth = dpr;
        ctx.setLineDash(slack ? this.dashSlack : NO_DASH);
        ctx.beginPath();
        ctx.moveTo(Math.round(x) + 0.5, top);
        ctx.lineTo(Math.round(x) + 0.5, y);
        ctx.stroke();
        ctx.setLineDash(NO_DASH);
      }
    }

    // Beam, with a notch under each lane. It thickens with the load in a heavy pull.
    ctx.strokeStyle = COL_DIM;
    ctx.lineWidth = dpr;
    ctx.beginPath();
    for (let lane = 0; lane < LANES; lane++) {
      const lx = laneX(lane);
      const px = Math.round(ox + lx * s) + 0.5;
      const py = yL + ((yR - yL) * (lx + BEAM_HALF)) / (BEAM_HALF * 2);
      ctx.moveTo(px, py + 4 * dpr);
      ctx.lineTo(px, py + 9 * dpr);
    }
    ctx.stroke();
    ctx.strokeStyle = COL_LINE;
    ctx.lineWidth = (2.5 + (sim.heavy - 1) * 3.5) * dpr;
    ctx.beginPath();
    ctx.moveTo(xL, yL);
    ctx.lineTo(xR, yR);
    ctx.stroke();
    ctx.fillStyle = COL_LINE;
    const j = 3 * dpr;
    if (cueSide !== 0) ctx.fillRect(xL - j, yL - j, j * 2, j * 2);
    if (cueSide !== 1) ctx.fillRect(xR - j, yR - j, j * 2, j * 2);

    // Ball. Solid when the surge is ready; a ring that fills back up while it recharges.
    if (ballR > 0.004) {
      const pr = ballR * s;
      ctx.fillStyle = COL_ACCENT;
      if (sim.charge >= 1 || falling) {
        ctx.beginPath();
        ctx.arc(ballPx, ballPy, pr, 0, TAU);
        ctx.fill();
      } else {
        ctx.strokeStyle = COL_ACCENT;
        ctx.lineWidth = 1.75 * dpr;
        ctx.beginPath();
        ctx.arc(ballPx, ballPy, pr - 0.875 * dpr, 0, TAU);
        ctx.stroke();
        if (sim.charge > 0.02) {
          ctx.beginPath();
          ctx.arc(ballPx, ballPy, pr * Math.sqrt(sim.charge) * 0.8, 0, TAU);
          ctx.fill();
        }
      }
    }

    // Reaction time readout, briefly, next to the cable that was caught.
    if (sim.lastRtAge < 480) {
      const side = sim.lastRtSide;
      const x = side === 0 ? xL + 14 * dpr : xR - 14 * dpr;
      const y = (side === 0 ? yL : yR) - 16 * dpr;
      ctx.globalAlpha = sim.lastRtAge < 336 ? 1 : 1 - (sim.lastRtAge - 336) / 144;
      ctx.fillStyle = COL_LINE;
      const w = this.numberWidth(sim.lastRt, 0, this.fontTiny);
      this.number(sim.lastRt, 0, side === 0 ? x + w : x, y, this.fontTiny);
      ctx.globalAlpha = 1;
    }

    // How to play, until the first tap.
    if (sim.phase === PHASE_READY) {
      ctx.fillStyle = COL_MID;
      const hy = Math.max(yL, yR) + 34 * dpr;
      if (hints.left) this.text(hints.left, xL, hy, this.fontHud, 'left');
      if (hints.right) this.text(hints.right, xR, hy, this.fontHud, 'right');
      this.text(hints.center, ox, hy, this.fontHud, 'center');
      if (hints.sub) this.text(hints.sub, ox, hy + 20 * dpr, this.fontTiny, 'center');
    }

    // Letterbox bars when the window is taller than the fixed view.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (top > 0.5) {
      ctx.fillStyle = COL_BG;
      ctx.fillRect(0, 0, this.w, top);
      ctx.fillRect(0, bottom, this.w, this.h - bottom);
    }

    this.drawHud(sim);
    this.drawTouch(touch, ICON_PAUSE, 0);
  }

  private drawHud(sim: Sim): void {
    const ctx = this.ctx;
    const dpr = this.dpr;
    const y = this.top + 30 * dpr;
    const padX = 34 * dpr;

    // Score, top left, with the chain multiplier when there is one.
    ctx.fillStyle = COL_LINE;
    const score = Math.floor(sim.score);
    const sw = this.numberWidth(score, 0, this.fontHud);
    this.number(score, 0, this.left + padX + sw, y, this.fontHud);
    if (sim.chain > 0) {
      ctx.fillStyle = COL_MID;
      this.text(MULT_LABELS[sim.chain]!, this.left + padX + sw + 8 * dpr, y, this.fontTiny, 'left');
    }

    // Height, top right.
    ctx.fillStyle = COL_MID;
    this.text('m', this.right - padX, y, this.fontTiny, 'right');
    ctx.fillStyle = COL_LINE;
    this.number(Math.floor(sim.height), 0, this.right - padX - 12 * dpr, y, this.fontHud);

    // Heavy pull: one thin meter, slower-side rate on the left, target on the right.
    if (sim.burstState !== BURST_NONE) {
      const grow = sim.burstState === BURST_LEADIN ? Math.min(1, sim.burstT / 0.35) : 1;
      const half = (this.right - this.left) * 0.17 * grow;
      const my = Math.round(y - 5 * dpr) + 0.5;
      ctx.lineWidth = 2 * dpr;
      ctx.strokeStyle = COL_DIM;
      ctx.beginPath();
      ctx.moveTo(this.ox - half, my);
      ctx.lineTo(this.ox + half, my);
      ctx.stroke();
      const p = sim.burstNeed > 0 ? Math.min(1, sim.burstProgress / sim.burstNeed) : 0;
      if (p > 0) {
        ctx.strokeStyle = COL_LINE;
        ctx.beginPath();
        ctx.moveTo(this.ox - half, my);
        ctx.lineTo(this.ox - half + half * 2 * p, my);
        ctx.stroke();
      }
      if (grow >= 1) {
        const slow = Math.min(sim.burstRate[0]!, sim.burstRate[1]!);
        ctx.fillStyle = slow >= sim.burstTarget ? COL_LINE : COL_MID;
        this.number(slow, 1, this.ox - half - 10 * dpr, y - 1.5 * dpr, this.fontTiny);
        ctx.fillStyle = COL_MID;
        const tw = this.numberWidth(sim.burstTarget, 1, this.fontTiny);
        this.number(sim.burstTarget, 1, this.ox + half + 10 * dpr + tw, y - 1.5 * dpr, this.fontTiny);
        this.text(sim.oneKey ? 'HEAVY · TAP FAST' : 'HEAVY · TAP BOTH SIDES FAST', this.ox, y + 16 * dpr, this.fontTiny, 'center');
      }
    }
  }

  drawPerf(perf: PerfStats): void {
    if (!perf.show) return;
    const ctx = this.ctx;
    const dpr = this.dpr;
    const f = this.fontMono;
    const adv = this.advance(f);
    const y = 22 * dpr;
    let x = 12 * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = COL_BG;
    ctx.fillRect(0, 0, 330 * dpr, 32 * dpr);
    ctx.fillStyle = COL_MID;
    x += adv * 4;
    this.number(perf.fps, 0, x, y, f);
    this.text('fps', x + adv * 0.6, y, f, 'left');
    x += adv * 9.5;
    this.number(perf.frameMs, 2, x, y, f);
    this.text('ms', x + adv * 0.6, y, f, 'left');
    x += adv * 10.5;
    this.text('max', x - adv * 6.4, y, f, 'left');
    this.number(perf.maxMs, 2, x + adv * 2.4, y, f);
    x += adv * 9.5;
    this.number(perf.ticks, 0, x, y, f);
    this.text('ticks', x + adv * 0.6, y, f, 'left');
  }
}
