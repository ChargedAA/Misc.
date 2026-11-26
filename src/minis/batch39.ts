// Thirty-ninth batch.
//   Net - a flat cube net and four cubes: which cube does it fold into?

import { COL_ACCENT, COL_DIM, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALSE } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, header, median, ms, scaled, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const TAU = Math.PI * 2;
const rint = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
type Rect = [number, number, number, number];
const inside = (r: Rect, x: number, y: number) => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];

// --- Net (cube nets) -------------------------------------------------------------------

/** Faces of a cube: up, down, front, back, left, right. */
type Face = 'U' | 'D' | 'F' | 'B' | 'L' | 'R';
const FACES: Face[] = ['U', 'D', 'F', 'B', 'L', 'R'];
/** An orientation: which original face now sits in each position. */
type Orient = Record<Face, Face>;

/** Turn the cube a quarter about the up-down axis (front goes to the right). */
function turnY(o: Orient): Orient {
  return { U: o.U, D: o.D, F: o.L, R: o.F, B: o.R, L: o.B };
}
/** Tip the cube a quarter forward (top comes to the front). */
function turnX(o: Orient): Orient {
  return { F: o.U, D: o.F, B: o.D, U: o.B, L: o.L, R: o.R };
}

/** All 24 orientations of a cube. */
function orientations(): Orient[] {
  const seen = new Map<string, Orient>();
  const start: Orient = { U: 'U', D: 'D', F: 'F', B: 'B', L: 'L', R: 'R' };
  const queue = [start];
  while (queue.length) {
    const o = queue.pop()!;
    const k = FACES.map((f) => o[f]).join('');
    if (seen.has(k)) continue;
    seen.set(k, o);
    queue.push(turnY(o), turnX(o));
  }
  return [...seen.values()];
}
const ORIENTS = orientations();

/** Symbols that look the same from every direction, so only position matters. */
const SYMBOLS = ['circle', 'square', 'cross', 'dot', 'ring', 'grid', 'diamond'];

/** Net layouts: grid cells (col, row) for each face. The classic cross, and a few others. */
const NETS: Record<Face, [number, number]>[] = [
  { U: [1, 0], L: [0, 1], F: [1, 1], R: [2, 1], B: [3, 1], D: [1, 2] },
  { U: [0, 0], L: [0, 1], F: [1, 1], R: [2, 1], B: [3, 1], D: [3, 2] },
  { U: [1, 0], L: [0, 1], F: [1, 1], R: [2, 1], B: [3, 1], D: [2, 2] },
  { U: [2, 0], L: [0, 1], F: [1, 1], R: [2, 1], B: [3, 1], D: [1, 2] },
];

const NET_TRIALS = 16;

class Net implements Mini {
  private env!: MiniEnv;
  private i = 0;
  private sym: Record<Face, string> = { U: '', D: '', F: '', B: '', L: '', R: '' };
  private net = NETS[0]!;
  /** Each option: the symbols on its top, front and right faces. */
  private opts: [string, string, string][] = [];
  private answer = 0;
  private state = 0;
  private at = 0;
  private next = 0;
  private boxes: Rect[] = [];
  private chosen = -1;
  private right = 0;
  private lives = 3;
  private rts: number[] = [];
  private level = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.next = now + 500;
  }

  private make(): void {
    const pool = [...SYMBOLS].sort(() => Math.random() - 0.5);
    FACES.forEach((f, k) => (this.sym[f] = pool[k]!));
    this.net = NETS[Math.min(NETS.length - 1, Math.floor(this.level / 3) === 0 ? 0 : rint(0, NETS.length - 1))]!;
    const view = (o: Orient): [string, string, string] => [this.sym[o.U], this.sym[o.F], this.sym[o.R]];
    const good = view(ORIENTS[rint(0, ORIENTS.length - 1)]!);
    // Wrong cubes: two opposite faces seen together (impossible), or the right three in mirror order.
    const opposite: [Face, Face][] = [['U', 'D'], ['F', 'B'], ['L', 'R']];
    const bad: [string, string, string][] = [];
    const key = (v: [string, string, string]) => v.join();
    const valid = new Set(ORIENTS.map((o) => key(view(o))));
    let guard = 0;
    while (bad.length < 3 && guard++ < 500) {
      let v: [string, string, string];
      if (Math.random() < 0.5) {
        const [p, q] = opposite[rint(0, 2)]!;
        const third = FACES.filter((f) => f !== p && f !== q)[rint(0, 3)]!;
        const trio = [this.sym[p], this.sym[q], this.sym[third]].sort(() => Math.random() - 0.5);
        v = [trio[0]!, trio[1]!, trio[2]!];
      } else {
        const g = view(ORIENTS[rint(0, ORIENTS.length - 1)]!);
        v = [g[0], g[2], g[1]];
      }
      if (!valid.has(key(v)) && !bad.some((b) => key(b) === key(v))) bad.push(v);
    }
    this.answer = rint(0, 3);
    this.opts = [...bad];
    this.opts.splice(this.answer, 0, good);
    this.opts = this.opts.slice(0, 4);
    this.chosen = -1;
  }

  press(): void {}

  private pick(k: number, ts: number): void {
    if (this.state !== 1) return;
    this.chosen = k;
    const ok = k === this.answer;
    if (ok) {
      this.right++;
      this.level++;
      this.rts.push(ts - this.at);
      this.env.sound(SND_CATCH);
    } else {
      this.lives--;
      this.env.sound(SND_FALSE);
    }
    this.i++;
    this.state = 2;
    this.next = ts + (ok ? 800 : 1800);
  }

  typeKey(code: string, ts: number): boolean {
    const d = code.startsWith('Digit') ? Number(code.slice(5)) : code.startsWith('Numpad') ? Number(code.slice(6)) : NaN;
    if (d >= 1 && d <= 4) {
      this.pick(d - 1, ts);
      return true;
    }
    return false;
  }

  pointer(x: number, y: number, ts: number): void {
    const k = this.boxes.findIndex((r) => inside(r, x, y));
    if (k >= 0) this.pick(k, ts);
  }

  private symbol(ctx: CanvasRenderingContext2D, name: string, s: number, dpr: number): void {
    ctx.fillStyle = COL_LINE;
    ctx.strokeStyle = COL_LINE;
    ctx.lineWidth = 2.5 * dpr;
    ctx.beginPath();
    if (name === 'circle') {
      ctx.arc(0, 0, s, 0, TAU);
      ctx.fill();
    } else if (name === 'square') {
      ctx.fillRect(-s * 0.85, -s * 0.85, s * 1.7, s * 1.7);
    } else if (name === 'cross') {
      ctx.fillRect(-s, -s * 0.28, 2 * s, s * 0.56);
      ctx.fillRect(-s * 0.28, -s, s * 0.56, 2 * s);
    } else if (name === 'dot') {
      ctx.arc(0, 0, s * 0.35, 0, TAU);
      ctx.fill();
    } else if (name === 'ring') {
      ctx.arc(0, 0, s * 0.85, 0, TAU);
      ctx.stroke();
    } else if (name === 'grid') {
      for (const [gx, gy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) ctx.fillRect(gx! * s * 0.55 - s * 0.38, gy! * s * 0.55 - s * 0.38, s * 0.76, s * 0.76);
    } else {
      ctx.moveTo(0, -s);
      ctx.lineTo(s * 0.8, 0);
      ctx.lineTo(0, s);
      ctx.lineTo(-s * 0.8, 0);
      ctx.closePath();
      ctx.fill();
    }
  }

  /** A cube from above and to the front-right: top, front (left face) and right faces. */
  private cube(ctx: CanvasRenderingContext2D, cx: number, cy: number, e: number, v: [string, string, string], dpr: number, edge: string): void {
    const c = Math.cos(Math.PI / 6) * e;
    const h = e / 2;
    const faces: { pts: [number, number][]; sym: string; m: [number, number, number, number, number, number]; shade: string }[] = [
      { pts: [[cx, cy - e], [cx + c, cy - h], [cx, cy], [cx - c, cy - h]], sym: v[0], m: [c, h, -c, h, cx, cy - e], shade: '#2c2c33' },
      { pts: [[cx - c, cy - h], [cx, cy], [cx, cy + e], [cx - c, cy + h]], sym: v[1], m: [c, h, 0, e, cx - c, cy - h], shade: '#1f1f24' },
      { pts: [[cx, cy], [cx + c, cy - h], [cx + c, cy + h], [cx, cy + e]], sym: v[2], m: [c, -h, 0, e, cx, cy], shade: '#17171b' },
    ];
    for (const f of faces) {
      ctx.fillStyle = f.shade;
      ctx.strokeStyle = edge;
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      f.pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // The symbol drawn in the face's own plane: a unit square mapped onto the face.
      ctx.save();
      ctx.transform(f.m[0] / 2, f.m[1] / 2, f.m[2] / 2, f.m[3] / 2, f.m[4], f.m[5]);
      ctx.translate(1, 1);
      this.symbol(ctx, f.sym, 0.62, dpr / (e / 2));
      ctx.restore();
    }
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state !== 1 && now >= this.next) {
      if (this.lives <= 0 || this.i >= scaled(NET_TRIALS)) return true;
      this.make();
      this.state = 1;
      this.at = now;
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'right', String(this.right), 'net', `${Math.min(this.i + 1, scaled(NET_TRIALS))} / ${scaled(NET_TRIALS)}`, this.lives);
    // The net, flat.
    const cs = Math.min(52 * a.u, (a.bottom - a.top) * 0.16);
    const nx = a.cx - 2 * cs;
    const ny = a.top + 6 * a.u;
    for (const f of FACES) {
      const [col, row] = this.net[f];
      const x = nx + col * cs;
      const y = ny + row * cs;
      ctx.fillStyle = '#1f1f24';
      ctx.fillRect(x, y, cs, cs);
      ctx.strokeStyle = COL_MID;
      ctx.lineWidth = 1.5 * dpr;
      ctx.strokeRect(x, y, cs, cs);
      ctx.save();
      ctx.translate(x + cs / 2, y + cs / 2);
      this.symbol(ctx, this.sym[f], cs * 0.3, dpr);
      ctx.restore();
    }
    // Four cubes to choose from.
    const e = Math.min(48 * a.u, (a.right - a.left) / 10);
    const cy = ny + 3 * cs + 30 * a.u + e;
    this.boxes = this.opts.map((_, k) => [a.cx + (k - 2) * e * 2.4 + e * 0.2, cy - e * 1.1, e * 2, e * 2.3] as Rect);
    this.opts.forEach((o, k) => {
      const [x, y, w, h] = this.boxes[k]!;
      const edge = this.state === 2 && k === this.answer ? COL_LINE : this.state === 2 && k === this.chosen ? COL_ACCENT : COL_DIM;
      this.cube(ctx, x + w / 2, y + e * 1.05, e, o, dpr, edge);
      ctx.fillStyle = COL_MID;
      v.text(String(k + 1), x + w / 2, y + h + 14 * dpr, v.fontTiny, 'center');
    });
    if (this.i < 2 && this.state === 1) {
      ctx.fillStyle = COL_MID;
      v.text('which cube can this net fold into? (1 to 4, or tap)', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.right * 100,
      primary: { label: 'nets folded right', value: this.right, unit: '' },
      lines: [
        { label: 'right', value: `${this.right} of ${this.i}` },
        { label: 'typical time a net', value: this.rts.length ? ms(median(this.rts)) : '–' },
      ],
      saved: this.i >= 3,
    };
  }
}

export const BATCH39: MiniDef[] = [
  { id: 'net', name: 'Net', skill: 'reasoning', blurb: 'A flat cube net and four cubes. Which cube does it fold into?', how: 'A flat net of six squares, each with a symbol. Fold it up in your head: which of the four cubes could it make? Watch for faces that end up opposite each other (they can never be seen together) and for cubes that are a mirror image of the right one. Later nets come in other shapes. Three wrong ends it.', input: 'pointer', make: () => new Net() },
];
