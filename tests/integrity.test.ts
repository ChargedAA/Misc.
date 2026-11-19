import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Integrity, type Env } from '../src/integrity.ts';

const ev = (isTrusted = true) => ({ isTrusted }) as Event;

function setup(over: Partial<Env> = {}) {
  let wall = 1_000_000;
  const env: Env = { webdriver: false, patched: [], wall: () => wall, ...over };
  const g = new Integrity(() => env);
  g.reset(0);
  return { g, tick: (ms: number) => (wall += ms) };
}

/** A person tapping: gaps and holds that wander by tens of milliseconds. */
function humanTaps(g: Integrity, n: number): number {
  let t = 0;
  for (let i = 0; i < n; i++) {
    t += 110 + ((i * 37) % 60);
    const key = i % 2 ? 'KeyM' : 'KeyZ';
    g.note(ev(), t, key);
    g.noteUp(key, t + 40 + ((i * 13) % 35));
  }
  return t;
}

test('a person at a normal browser passes', () => {
  const { g, tick } = setup();
  const end = humanTaps(g, 60);
  tick(end);
  assert.deepEqual(g.verdict([240, 260, 231, 255, 270, 249], end), { ok: true, flags: [] });
});

test('scripted events, automation and patched timers are each flagged', () => {
  const a = setup();
  a.g.note(ev(false), 10);
  assert.match(a.g.verdict().flags.join(), /script, not a keyboard/);
  assert.match(setup({ webdriver: true }).g.verdict().flags.join(), /automation/);
  assert.match(setup({ patched: ['performance.now'] }).g.verdict().flags.join(), /replaced the page's performance\.now/);
});

test('a sped-up game clock is caught', () => {
  const { g, tick } = setup();
  tick(5000); // the wall clock moved 5 s while the page's clock says 10 s
  assert.match(g.verdict([], 10000).flags.join(), /ran at 200% of real time/);
  const ok = setup();
  ok.tick(10050);
  assert.equal(ok.g.verdict([], 10000).ok, true);
});

test('auto-clicker patterns: even gaps, fixed holds, impossible rates', () => {
  const even = setup();
  for (let i = 0; i < 40; i++) even.g.note(ev(), i * 100);
  assert.match(even.g.verdict().flags.join(), /spaced more evenly/);

  const holds = setup();
  let t = 0;
  for (let i = 0; i < 40; i++) {
    t += 100 + ((i * 41) % 70);
    holds.g.note(ev(), t, 'KeyZ');
    holds.g.noteUp('KeyZ', t + 30);
  }
  assert.match(holds.g.verdict().flags.join(), /held for the same length/);

  const fast = setup();
  t = 0;
  for (let i = 0; i < 60; i++) {
    t += 20 + (i % 7) * 3;
    fast.g.note(ev(), t);
  }
  assert.match(fast.g.verdict().flags.join(), /more presses a second/);
});

test('reactions under 100 ms again and again are flagged', () => {
  const { g } = setup();
  assert.match(g.verdict([60, 70, 80, 75, 65, 250]).flags.join(), /under 100 ms/);
});
