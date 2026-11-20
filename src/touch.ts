// On-screen pads for touch play. Each lift key gets a pad in the bottom corner
// of its side (outer key at the screen edge, like the keyboard), the reflex key
// gets a pad above each cluster, and one corner button stands in for Escape.
// Coordinates are canvas (device) pixels.

import { SLOT_REFLEX, type ModeDef } from './config.ts';

export interface Pad {
  slot: number;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}

export const HIT_NONE = -1;
export const HIT_CORNER = -2;

export class TouchLayout {
  readonly pads: Pad[] = [];
  /** Pause (in a run) or finish (in a trainer). */
  readonly corner = { x: 0, y: 0, w: 0, h: 0 };
  /** True once a touch has been seen; the pads are only drawn then. */
  active = false;
  private width = 0;
  private oneKey = false;

  /** `labels[slot]` is the key label for that slot (7 entries, reflex last). */
  build(mode: ModeDef, labels: readonly string[], w: number, h: number, dpr: number): void {
    this.pads.length = 0;
    this.width = w;
    this.oneKey = mode.right === 0;
    const m = 14 * dpr;
    const bottom = 22 * dpr;
    const gap = 10 * dpr;
    const perSide = Math.max(mode.left, mode.right, 1);
    let s = Math.min(Math.max(Math.min(w, h) * 0.14, 64 * dpr), 104 * dpr);
    const fit = (w / 2 - m - (perSide - 1) * gap - 8 * dpr) / perSide;
    if (s > fit) s = fit;
    const y = h - bottom - s;

    if (this.oneKey) {
      // One key: both corners do the same thing, and so does the rest of the screen.
      this.pads.push({ slot: 0, x: m, y, w: s, h: s, label: labels[0] ?? '' });
      this.pads.push({ slot: 0, x: w - m - s, y, w: s, h: s, label: labels[0] ?? '' });
    } else {
      for (let i = 0; i < mode.left; i++) {
        this.pads.push({ slot: i, x: m + i * (s + gap), y, w: s, h: s, label: labels[i] ?? '' });
      }
      for (let i = 0; i < mode.right; i++) {
        const fromEdge = mode.right - 1 - i;
        this.pads.push({ slot: 3 + i, x: w - m - s - fromEdge * (s + gap), y, w: s, h: s, label: labels[3 + i] ?? '' });
      }
    }
    if (mode.reflex) {
      const rw = perSide * s + (perSide - 1) * gap;
      const rh = s * 0.62;
      const label = labels[SLOT_REFLEX] ?? '';
      this.pads.push({ slot: SLOT_REFLEX, x: m, y: y - gap - rh, w: rw, h: rh, label });
      this.pads.push({ slot: SLOT_REFLEX, x: w - m - rw, y: y - gap - rh, w: rw, h: rh, label });
    }

    const c = 46 * dpr;
    this.corner.x = w - m - c;
    this.corner.y = m;
    this.corner.w = c;
    this.corner.h = c;
  }

  /** Drop the pads but keep the corner button (games played by tapping the board). */
  padsOff(): void {
    this.pads.length = 0;
  }

  /** Slot under a touch: the nearest pad on that half of the screen. */
  hit(px: number, py: number): number {
    const c = this.corner;
    const pad = c.w * 0.3;
    if (px >= c.x - pad && px <= c.x + c.w + pad && py >= c.y - pad && py <= c.y + c.h + pad) return HIT_CORNER;
    if (this.oneKey) return 0;
    const leftHalf = px < this.width / 2;
    let best = HIT_NONE;
    let bestD = Infinity;
    for (const p of this.pads) {
      if (p.x + p.w / 2 < this.width / 2 !== leftHalf) continue;
      const dx = px < p.x ? p.x - px : px > p.x + p.w ? px - (p.x + p.w) : 0;
      const dy = py < p.y ? p.y - py : py > p.y + p.h ? py - (p.y + p.h) : 0;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = p.slot;
      }
    }
    return best;
  }
}
