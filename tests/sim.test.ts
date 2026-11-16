import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HOVER_MID, STEP_MS, TICK_HZ } from '../src/config.ts';
import { ACT_REFLEX, Runner } from '../src/loop.ts';
import { Rng } from '../src/rng.ts';
import { BURST_NONE, HOLE_CAP, PHASE_READY, PHASE_RUN, Sim, ZONE_CAP } from '../src/sim.ts';

/** A scripted player: jittered taps near the hover rate, plus the odd reflex press. */
function script(seed: number, seconds: number): { ts: number; act: number }[] {
  const rng = new Rng(seed);
  const events: { ts: number; act: number }[] = [];
  for (const act of [0, 3]) {
    let t = 1003.7 + rng.next() * 50;
    while (t < 1000 + seconds * 1000) {
      events.push({ ts: t, act });
      t += (1000 / HOVER_MID) * (0.75 + rng.next() * 0.5);
    }
  }
  for (let t = 1500; t < 1000 + seconds * 1000; t += 2100 + rng.next() * 900) events.push({ ts: t, act: ACT_REFLEX });
  return events.sort((a, b) => a.ts - b.ts);
}

function runAt(fps: number, modeId: number, seed: number, seconds: number): Sim {
  const sim = new Sim();
  sim.headless = true;
  sim.reset(modeId, seed);
  const runner = new Runner(sim);
  const events = script(seed, seconds);
  let next = 0;
  const frames = Math.round(seconds * fps);
  for (let k = 0; k <= frames; k++) {
    const now = 1000 + (k * 1000) / fps;
    while (next < events.length && events[next]!.ts <= now) {
      runner.push(events[next]!.act, events[next]!.ts);
      next++;
    }
    runner.frame(now);
  }
  return sim;
}

function snapshot(sim: Sim) {
  return {
    tick: sim.tick,
    phase: sim.phase,
    time: sim.time,
    climb: sim.climb,
    h: [...sim.h],
    v: [...sim.v],
    ballX: sim.ballX,
    ballV: sim.ballV,
    score: sim.score,
    height: sim.height,
    holes: sim.holeCount,
    taps: sim.tapCount,
    cues: sim.cueCount,
    hits: sim.cueHits,
    falseStarts: sim.falseStarts,
    rts: [...sim.rt.subarray(0, sim.rtCount)],
  };
}

test('gameplay is identical at 60, 144 and 240 fps', () => {
  for (const [modeId, seed] of [
    [2, 11],
    [3, 4242],
    [5, 99],
  ] as const) {
    const a = snapshot(runAt(60, modeId, seed, 30));
    const b = snapshot(runAt(240, modeId, seed, 30));
    const c = snapshot(runAt(144, modeId, seed, 30));
    assert.ok(a.tick > TICK_HZ * 29, 'simulated the whole stretch');
    assert.ok(a.taps > 20, 'the script actually played');
    assert.deepEqual(b, a);
    assert.deepEqual(c, a);
  }
});

test('nothing moves until the first tap', () => {
  const sim = new Sim();
  sim.reset(2, 5);
  for (let i = 0; i < 500; i++) sim.step(i * STEP_MS);
  assert.equal(sim.phase, PHASE_READY);
  assert.equal(sim.climb, 0);
  assert.equal(sim.h[0], 0.5);
});

test('ends sag without taps and hover near the middle at the hover rate', () => {
  const sag = new Sim();
  sag.reset(2, 5);
  sag.tap(0, 0, 0);
  for (let i = 0; i < TICK_HZ * 4 && sag.phase === PHASE_RUN; i++) sag.step(i * STEP_MS);
  assert.ok(sag.h[1]! < 0.05, `right end sagged to ${sag.h[1]}`);

  const hover = new Sim();
  hover.reset(2, 5);
  const every = Math.round(TICK_HZ / HOVER_MID);
  let lo = 1;
  let hi = 0;
  for (let i = 0; i < TICK_HZ * 5; i++) {
    if (i % every === 0) {
      hover.tap(0, 0, i * STEP_MS);
      hover.tap(1, 0, i * STEP_MS);
    }
    hover.step(i * STEP_MS);
    if (hover.phase !== PHASE_RUN) break;
    lo = Math.min(lo, hover.h[0]!);
    hi = Math.max(hi, hover.h[0]!);
  }
  assert.ok(lo > 0.3 && hi < 0.7, `hover stayed in ${lo.toFixed(2)}..${hi.toFixed(2)}`);
});

test('mode 1 keeps the right end fixed', () => {
  const sim = new Sim();
  sim.reset(1, 5);
  sim.tap(0, 0, 0);
  for (let i = 0; i < TICK_HZ * 2; i++) sim.step(i * STEP_MS);
  assert.equal(sim.h[1], 0.5);
  assert.ok(sim.h[0]! < 0.4);
});

test('repeating the same key lifts less than alternating', () => {
  const alt = new Sim();
  alt.reset(4, 5);
  alt.tap(0, 0, 0);
  const v0 = alt.v[0]!;
  assert.equal(alt.tap(0, 1, 1), 1);
  const full = alt.v[0]! - v0;
  assert.equal(alt.tap(0, 1, 2), 2);
  const weak = alt.v[0]! - v0 - full;
  assert.ok(weak < full * 0.5 && weak > 0);
  assert.equal(alt.repeats, 1);
});

test('reaction cue: caught inside the window, logged in ms, false start penalised', () => {
  let checked = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const sim = new Sim();
    sim.headless = true;
    sim.reset(3, seed * 77);
    const every = Math.round(TICK_HZ / HOVER_MID);
    let caught = false;
    for (let i = 0; i < TICK_HZ * 40 && !caught; i++) {
      const now = i * STEP_MS;
      if (i % every === 0) {
        sim.tap(0, 0, now);
        sim.tap(1, 0, now);
      }
      if (sim.cueActive && sim.cueDrawnAt > 0 && now - sim.cueDrawnAt >= 250) {
        sim.reflex(now);
        caught = true;
      }
      sim.step(now);
      if (sim.phase !== PHASE_RUN) break;
    }
    if (!caught) continue; // fell into a hole before the first cue
    checked++;
    assert.equal(sim.cueHits, 1);
    assert.ok(sim.rt[0]! >= 250 && sim.rt[0]! < 255, `rt ${sim.rt[0]}`);
    assert.equal(sim.falseStarts, 0);
    // A stutter press right after the catch is forgiven.
    sim.reflex(sim.cueDrawnAt + 300);
    assert.equal(sim.falseStarts, 0);
  }
  assert.ok(checked >= 3, `only ${checked} seeds reached a cue`);

  const fs = new Sim();
  fs.reset(3, 78);
  fs.tap(0, 0, 0);
  fs.step(0);
  const v = fs.v[0]!;
  fs.reflex(5);
  assert.equal(fs.falseStarts, 1);
  assert.ok(fs.v[0]! < v);
});

test('a missed cue lurches the cued end', () => {
  let checked = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const sim = new Sim();
    sim.headless = true;
    sim.reset(3, seed * 77);
    const every = Math.round(TICK_HZ / HOVER_MID);
    for (let i = 0; i < TICK_HZ * 40; i++) {
      const now = i * STEP_MS;
      if (i % every === 0) {
        sim.tap(0, 0, now);
        sim.tap(1, 0, now);
      }
      const side = sim.cueSide;
      const before = sim.v[side]!;
      const wasActive = sim.cueActive;
      sim.step(now);
      if (sim.phase !== PHASE_RUN) break;
      if (wasActive && !sim.cueActive) {
        assert.equal(sim.cueMisses, 1);
        assert.ok(sim.v[side]! < before - 1.5, 'the missed side drops hard');
        checked++;
        break;
      }
    }
  }
  assert.ok(checked >= 3, `only ${checked} seeds reached a cue`);
});

test('holes never sit inside a target zone', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const sim = new Sim();
    sim.reset(2, seed * 131);
    const every = Math.round(TICK_HZ / HOVER_MID);
    for (let i = 0; i < TICK_HZ * 25; i++) {
      if (i % every === 0) {
        sim.tap(0, 0, i * STEP_MS);
        sim.tap(1, 0, i * STEP_MS);
      }
      sim.step(i * STEP_MS);
      if (sim.phase !== PHASE_RUN) break;
    }
    for (let i = 0; i < sim.holeCount; i++) {
      const h = (sim.holeStart + i) % HOLE_CAP;
      for (let j = 0; j < sim.zoneCount; j++) {
        const z = (sim.zoneStart + j) % ZONE_CAP;
        const inX = Math.abs(sim.hx[h]! - sim.zx[z]!) < sim.zw[z]! / 2 + sim.hr[h]!;
        const inY = sim.hy[h]! > sim.zy[z]! - sim.hr[h]! && sim.hy[h]! < sim.zy[z]! + sim.zh[z]! + sim.hr[h]!;
        assert.ok(!(inX && inY), `seed ${seed}: hole overlaps a zone`);
      }
    }
  }
});

test('a heavy pull is cleared by holding the target and lost by slacking', () => {
  const attempt = (seed: number, factor: number) => {
    const sim = new Sim();
    sim.headless = true;
    sim.reset(2, seed);
    const last = [-1e9, -1e9];
    for (let i = 0; i < TICK_HZ * 60; i++) {
      const now = i * STEP_MS;
      const rate = sim.burstState !== BURST_NONE ? sim.burstTarget * factor : HOVER_MID;
      for (let s = 0; s < 2; s++) {
        if (now - last[s]! >= 1000 / rate) {
          sim.tap(s, 0, now);
          last[s] = now;
        }
      }
      sim.step(now);
      if (sim.phase !== PHASE_RUN || sim.burstsWon + sim.burstsLost > 0) break;
    }
    return sim;
  };
  let won = 0;
  let lost = 0;
  for (let seed = 1; seed <= 16; seed++) {
    const strong = attempt(seed * 9, 1.2);
    if (strong.burstsWon + strong.burstsLost > 0) {
      assert.equal(strong.burstsWon, 1, 'tapping above target holds the pull');
      won++;
    }
    const weak = attempt(seed * 9, 0.7);
    if (weak.burstsWon + weak.burstsLost > 0) {
      assert.equal(weak.burstsLost, 1, 'tapping below target slips');
      lost++;
    }
  }
  assert.ok(won >= 3 && lost >= 3, `pulls reached: ${won} strong, ${lost} weak`);
});
