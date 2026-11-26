// Eighty-first batch.
//   Shortest - a map of towns and road lengths: what is the shortest trip from A to B?

import { COL_ACCENT, COL_DIM, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALSE } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, header, median, ms, scaled, shuffle, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const TAU = Math.PI * 2;
const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const rint = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
type Rect = [number, number, number, number];
const inside = (r: Rect, x: number, y: number) => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
const digitOf = (code: string) => (code.startsWith('Digit') ? code.slice(5) : code.startsWith('Numpad') ? code.slice(6) : '');

const SHORT_ROUNDS = 12;

/** Shortest distances from a start node over weighted, undirected edges (Dijkstra, small graphs). */
function shortestFrom(n: number, edges: [number, number, number][], s: number): { dist: number[]; prev: number[] } {
  const dist = Array<number>(n).fill(Infinity);
  const prev = Array<number>(n).fill(-1);
  const done = Array<boolean>(n).fill(false);
  dist[s] = 0;
  for (let it = 0; it < n; it++) {
    let u = -1;
    for (let k = 0; k < n; k++) if (!done[k] && (u < 0 || dist[k]! < dist[u]!)) u = k;
    if (u < 0 || dist[u] === Infinity) break;
    done[u] = true;
    for (const [a, b, w] of edges) {
      const v = a === u ? b : b === u ? a : -1;
      if (v >= 0 && dist[u]! + w < dist[v]!) {
        dist[v] = dist[u]! + w;
        prev[v] = u;
      }
    }
  }
  return { dist, prev };
}

class Shortest implements Mini {
  private env!: MiniEnv;
  private round = 0;
  private pts: [number, number][] = [];
  private edges: [number, number, number][] = [];
  private from = 0;
  private to = 1;
  private best = 0;
  private route: number[] = [];
  private opts: number[] = [];
  private answer = 0;
  private boxes: Rect[] = [];
  private state = 0;
  private at = 0;
  private shownAt = 0;
  private chosen = -1;
  private right = 0;
  private rts: number[] = [];
  private firstAt = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.firstAt = now;
    this.arm(now);
  }

  private arm(now: number): void {
    const n = this.round < 4 ? 5 : this.round < 8 ? 6 : 7;
    for (let tries = 0; tries < 200; tries++) {
      // Towns spread across the map, roads between near neighbours.
      this.pts = [];
      for (let t = 0; this.pts.length < n && t < 500; t++) {
        const p: [number, number] = [rnd(0.08, 0.92), rnd(0.1, 0.9)];
        if (this.pts.every((q) => Math.hypot((q[0] - p[0]) * 1.6, q[1] - p[1]) > 0.28)) this.pts.push(p);
      }
      if (this.pts.length < n) continue;
      const cand: [number, number, number][] = [];
      for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) cand.push([a, b, Math.hypot((this.pts[a]![0] - this.pts[b]![0]) * 1.6, this.pts[a]![1] - this.pts[b]![1])]);
      cand.sort((x, y) => x[2] - y[2]);
      this.edges = cand.slice(0, n + rint(1, 3)).map(([a, b]) => [a, b, rint(2, 9)] as [number, number, number]);
      // Pick the two towns furthest apart by hops, and insist the map is connected.
      this.from = 0;
      const d0 = shortestFrom(n, this.edges, 0).dist;
      if (d0.some((d) => d === Infinity)) continue;
      this.from = rint(0, n - 1);
      const { dist, prev } = shortestFrom(n, this.edges, this.from);
      let far = this.from;
      for (let k = 0; k < n; k++) if (dist[k]! > dist[far]!) far = k;
      this.to = far;
      this.best = dist[far]!;
      this.route = [];
      for (let v = far; v >= 0; v = prev[v]!) this.route.unshift(v);
      if (this.route.length >= 3) break;
    }
    // Wrong answers: a longer route found by banning one road of the best, plus near numbers.
    const wrong = new Set<number>();
    for (let k = 0; k + 1 < this.route.length; k++) {
      const a = this.route[k]!;
      const b = this.route[k + 1]!;
      const alt = shortestFrom(this.pts.length, this.edges.filter(([x, y]) => !((x === a && y === b) || (x === b && y === a))), this.from).dist[this.to]!;
      if (alt !== Infinity && alt !== this.best) wrong.add(alt);
    }
    for (const w of shuffle([this.best + 1, this.best + 2, this.best - 1, this.best + 3])) if (w > 0 && w !== this.best) wrong.add(w);
    this.opts = shuffle([...wrong]).slice(0, 3);
    this.answer = rint(0, 3);
    this.opts.splice(this.answer, 0, this.best);
    this.state = 0;
    this.shownAt = now;
    this.chosen = -1;
  }

  press(): void {}

  private pick(k: number, ts: number): void {
    if (this.state !== 0) return;
    this.chosen = k;
    const ok = k === this.answer;
    if (ok) {
      this.right++;
      this.rts.push(ts - this.shownAt);
    }
    this.env.sound(ok ? SND_CATCH : SND_FALSE);
    this.round++;
    this.state = 1;
    this.at = ts + (ok ? 1000 : 2200);
  }

  typeKey(code: string, ts: number): boolean {
    const d = Number(digitOf(code));
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

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 1 && now >= this.at) {
      if (this.round >= scaled(SHORT_ROUNDS)) return true;
      this.arm(now);
    }
    if (this.state === 0 && now - this.shownAt > 120000) this.pick(-1, now);
    if (now - this.firstAt > 900000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'right', `${this.right} of ${this.round}`, 'map', `${Math.min(this.round + 1, scaled(SHORT_ROUNDS))} / ${scaled(SHORT_ROUNDS)}`);
    const mh = a.bottom - a.top - 110 * a.u;
    const mw = Math.min(a.right - a.left, mh * 1.6);
    const mx = a.cx - mw / 2;
    const my = a.top + 10 * a.u;
    const P = (k: number): [number, number] => [mx + this.pts[k]![0] * mw, my + this.pts[k]![1] * mh];
    const onRoute = (a1: number, b1: number) => this.route.some((r, i) => i + 1 < this.route.length && ((r === a1 && this.route[i + 1] === b1) || (r === b1 && this.route[i + 1] === a1)));
    for (const [ea, eb, w] of this.edges) {
      const [x1, y1] = P(ea);
      const [x2, y2] = P(eb);
      const lit = this.state === 1 && onRoute(ea, eb);
      ctx.strokeStyle = lit ? COL_LINE : COL_DIM;
      ctx.lineWidth = (lit ? 3 : 1.5) * dpr;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      // The road's length, on a dark patch at its middle.
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      ctx.fillStyle = '#0b0b0d';
      ctx.fillRect(cx - 10 * a.u, cy - 9 * a.u, 20 * a.u, 18 * a.u);
      ctx.fillStyle = lit ? COL_LINE : COL_MID;
      v.text(String(w), cx, cy + 5 * dpr, v.fontTiny, 'center');
    }
    this.pts.forEach((_, k) => {
      const [x, y] = P(k);
      const end = k === this.from || k === this.to;
      ctx.fillStyle = end ? COL_ACCENT : COL_LINE;
      ctx.beginPath();
      ctx.arc(x, y, (end ? 9 : 6) * a.u, 0, TAU);
      ctx.fill();
      if (end) {
        ctx.fillStyle = COL_LINE;
        v.text(k === this.from ? 'A' : 'B', x, y - 14 * a.u, v.fontHud, 'center');
      }
    });
    const bw = Math.min(80 * a.u, (a.right - a.left) / 4 - 12 * a.u);
    const by = my + mh + 16 * a.u;
    this.boxes = this.opts.map((_, k) => [a.cx + (k - 2) * (bw + 12 * a.u) + 6 * a.u, by, bw, 44 * a.u] as Rect);
    this.boxes.forEach(([x, y, w, h], k) => {
      const show = this.state === 1;
      ctx.strokeStyle = show && k === this.answer ? COL_LINE : show && k === this.chosen ? COL_ACCENT : COL_DIM;
      ctx.lineWidth = (show && (k === this.answer || k === this.chosen) ? 2.5 : 1.5) * dpr;
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = COL_LINE;
      v.text(String(this.opts[k]), x + w / 2, y + h / 2 + 6 * dpr, v.fontHud, 'center');
      ctx.fillStyle = COL_DIM;
      v.text(String(k + 1), x + 7 * dpr, y + 13 * dpr, v.fontTiny, 'left');
    });
    ctx.fillStyle = COL_MID;
    v.text(this.state === 1 ? 'the shortest route is lit' : 'the shortest trip from A to B, adding road lengths? (1 to 4, or click)', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.right * 80 + (this.rts.length ? Math.round(Math.max(0, 30000 - median(this.rts)) / 100) : 0),
      primary: { label: 'routes found', value: this.right, unit: `of ${this.round}` },
      lines: [
        { label: 'right', value: `${this.right} of ${this.round}` },
        { label: 'typical time when right', value: this.rts.length ? ms(median(this.rts)) : '–' },
      ],
      saved: this.round >= 3,
    };
  }
}

export const BATCH81: MiniDef[] = [
  { id: 'shortest', name: 'Shortest', skill: 'reasoning', blurb: 'A map of towns and road lengths. What is the shortest trip from A to B?', how: 'Towns joined by roads, each road marked with its length. Find the shortest trip from A to B, adding up the roads you take, and pick its total (1 to 4, or click). The most direct-looking way is not always shortest. The maps grow from five towns to seven. Twelve maps; the best route is lit after each.', input: 'pointer', make: () => new Shortest() },
];
