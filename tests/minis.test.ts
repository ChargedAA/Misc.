import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MODES, SLOT_REFLEX } from '../src/config.ts';
import { MINIS } from '../src/minis/index.ts';
import { ms } from '../src/minis/kit.ts';
import { Rng } from '../src/rng.ts';
import type { View } from '../src/render.ts';
import type { TouchLayout } from '../src/touch.ts';

/** A canvas context that accepts every call and property and draws nothing. */
function nullCtx(): CanvasRenderingContext2D {
  const fn = () => undefined;
  return new Proxy({} as Record<string | symbol, unknown>, {
    get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : fn),
    set: (t, k, v) => ((t[k] = v), true),
  }) as unknown as CanvasRenderingContext2D;
}

function fakeView(): View {
  const v = {
    ctx: nullCtx(),
    w: 1280,
    h: 800,
    dpr: 1,
    ox: 640,
    scale: 50,
    fontHud: 'a',
    fontTiny: 'b',
    fontBig: 'c',
    fontMono: 'd',
    fontPad: 'e',
    text: () => {},
    number: () => 0,
    numberWidth: () => 10,
    clear: () => {},
    shape: () => {},
    arrow: () => {},
    drawTouch: () => {},
  };
  return v as unknown as View;
}

const touch = { active: false, pads: [], corner: { x: 0, y: 0, w: 0, h: 0 } } as unknown as TouchLayout;

/** Drive time by hand so games that read performance.now() see the same clock. */
let clock = 0;
const realNow = performance.now.bind(performance);
function useClock(): void {
  performance.now = () => clock;
}
function restoreClock(): void {
  performance.now = realNow;
}

const realRandom = Math.random;

function hash(s: string): number {
  let h = 7;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

function slots(id: number): number[] {
  const m = MODES[id - 1]!;
  const out: number[] = [];
  for (let i = 0; i < m.left; i++) out.push(i);
  for (let i = 0; i < m.right; i++) out.push(3 + i);
  if (m.reflex) out.push(SLOT_REFLEX);
  return out;
}

const TYPED = [...'0123456789'].map((d) => `Digit${d}`).concat([...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((c) => `Key${c}`), ['Enter', 'Backspace']);

test('every mini-game survives random play in every key mode it allows', () => {
  const view = fakeView();
  useClock();
  try {
    for (const def of MINIS) {
      const modes = def.input === 'pointer' || def.input === 'type' ? [2] : MODES.map((m) => m.id).filter((id) => id >= (def.minKeys ?? 1));
      for (const modeId of modes) {
        for (let seed = 0; seed < 3; seed++) {
          clock = 1000;
          // Seed everything (game and fake player) so a failure can be replayed.
          const rng = new Rng(hash(def.id) * 31 + modeId * 7 + seed);
          Math.random = () => rng.next();
          const game = def.make();
          game.start(
            { mode: MODES[modeId - 1]!, labels: ['Z', 'X', 'C', 'B', 'N', 'M', 'SPACE'], sound: () => {}, muted: seed === 2, level: def.levels ? def.levels[(seed * 2 + modeId) % def.levels.length]!.value : undefined },
            clock,
          );
          const ks = slots(modeId);
          let done = false;
          let presses = 0;
          const pending: [number, number][] = [];
          // Up to ten simulated minutes; mash keys and click about.
          for (let f = 0; f < 36000 && !done; f++) {
            clock += 16.7;
            if (Math.random() < 0.06) {
              const k = ks[Math.floor(Math.random() * ks.length)]!;
              game.press(k, clock);
              // Some presses are held for a while, to exercise holds.
              if (Math.random() < 0.3) pending.push([k, clock + Math.random() * 1500]);
              else game.release?.(k, clock + 40);
              presses++;
            }
            for (let p = pending.length - 1; p >= 0; p--) {
              if (pending[p]![1] <= clock) {
                game.release?.(pending[p]![0], clock);
                pending.splice(p, 1);
              }
            }
            if (Math.random() < 0.05) game.pointer?.(Math.random() * 1280, Math.random() * 800, clock);
            // And type: digits, letters, Enter and Backspace, for the games that read the keyboard.
            if (Math.random() < 0.04) game.typeKey?.(TYPED[Math.floor(Math.random() * TYPED.length)]!, clock);
            done = game.frame(clock, view, touch);
          }
          const r = game.result();
          assert.ok(Number.isFinite(r.score) && r.score >= 0, `${def.id}: score ${r.score}`);
          assert.ok(Number.isFinite(r.primary.value), `${def.id}: primary ${r.primary.value}`);
          assert.ok(r.lines.length > 0, `${def.id}: result lines`);
          for (const l of r.lines) assert.ok(l.value !== undefined && !String(l.value).includes('NaN'), `${def.id}: ${l.label} = ${l.value}`);
          assert.ok(done, `${def.id} with ${modeId} keys (seed ${seed}) never ended (presses: ${presses})`);
        }
      }
    }
  } finally {
    restoreClock();
    Math.random = realRandom;
  }
});

test('mini-game ids are unique and every game explains itself', () => {
  const ids = new Set<string>();
  for (const d of MINIS) {
    assert.ok(!ids.has(d.id), `duplicate id ${d.id}`);
    ids.add(d.id);
    assert.ok(d.how.length > 40, `${d.id} needs a how-to`);
    assert.ok(d.blurb.length > 10);
  }
});

test('a game with nothing measured shows dashes, not zeros', () => {
  // The framework drops any session with no input at all (see finishMini); here we check the
  // formatting half of that promise: unmeasured times read as a dash.
  assert.equal(ms(0), '\u2013');
  assert.equal(ms(Number.NaN), '\u2013');
  assert.equal(ms(241.6), '242 ms');
});
