import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BEAM_HALF, HOVER_MID, LANES, LANE_W, MID_LANE, STEP_MS, SURGE_DIST, TICK_HZ, climbSpeed, laneX } from '../src/config.ts';
import { ACT_REFLEX, Runner } from '../src/loop.ts';
import { Rng } from '../src/rng.ts';
import { play } from '../scripts/bot.ts';
import { BURST_ACTIVE, BURST_LEADIN, BURST_NONE, HAZ_BAR, HAZ_CAP, PHASE_FALL, PHASE_OVER, PHASE_READY, PHASE_RUN, Sim } from '../src/sim.ts';

/** A scripted player: random dashes, the odd chord and reflex press. */
function script(seed: number, seconds: number): { ts: number; act: number }[] {
  const rng = new Rng(seed);
  const events: { ts: number; act: number }[] = [];
  let t = 1003.7;
  while (t < 1000 + seconds * 1000) {
    const r = rng.next();
    if (r < 0.12) {
      events.push({ ts: t, act: 0 }, { ts: t + 3 + rng.next() * 40, act: 3 });
    } else if (r < 0.2) {
      events.push({ ts: t, act: ACT_REFLEX });
    } else {
      events.push({ ts: t, act: rng.next() < 0.5 ? 0 : 3 });
    }
    t += 180 + rng.next() * 900;
  }
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
    lane: sim.lane,
    ballX: sim.ballX,
    charge: sim.charge,
    score: sim.score,
    hazards: sim.hazCount,
    rings: sim.rings,
    surges: sim.surges,
    dashes: sim.dashes,
    taps: sim.tapCount,
    cues: sim.cueCount,
    hits: sim.cueHits,
    falseStarts: sim.falseStarts,
    rts: [...sim.rt.subarray(0, sim.rtCount)],
  };
}

/** Run a fresh sim, tapping as `act` says, until `stop` or the run ends. */
function drive(modeId: number, seed: number, seconds: number, act: (sim: Sim, now: number) => void, stop?: (sim: Sim) => boolean): Sim {
  const sim = new Sim();
  sim.headless = true;
  sim.reset(modeId, seed);
  sim.tap(0, 0, 0);
  for (let i = 1; i < TICK_HZ * seconds; i++) {
    const now = i * STEP_MS;
    if (sim.phase === PHASE_RUN) act(sim, now);
    sim.step(now);
    if (sim.phase !== PHASE_RUN || stop?.(sim)) break;
  }
  return sim;
}

test('gameplay is identical at 60, 144 and 240 fps', () => {
  let taps = 0;
  let dashes = 0;
  let surges = 0;
  let cues = 0;
  for (const [modeId, seed] of [
    [2, 11],
    [3, 4242],
    [5, 99],
    [6, 7],
    [4, 31337],
    [3, 2024],
  ] as const) {
    const a = snapshot(runAt(60, modeId, seed, 30));
    const b = snapshot(runAt(240, modeId, seed, 30));
    const c = snapshot(runAt(144, modeId, seed, 30));
    assert.ok(a.tick > TICK_HZ * 29, 'simulated the whole stretch');
    assert.deepEqual(b, a);
    assert.deepEqual(c, a);
    taps += a.taps;
    dashes += a.dashes;
    surges += a.surges;
    cues += a.cues;
  }
  // The scripted player is blind, so each run is short; together they cover the moves.
  assert.ok(taps > 40 && dashes > 15 && surges > 2, `script played: ${taps} taps, ${dashes} dashes, ${surges} surges, ${cues} cues`);
});

test('nothing moves until the first tap', () => {
  const sim = new Sim();
  sim.reset(2, 5);
  for (let i = 0; i < 500; i++) sim.step(i * STEP_MS);
  assert.equal(sim.phase, PHASE_READY);
  assert.equal(sim.climb, 0);
  assert.equal(sim.lane, MID_LANE);
});

test('a tap dashes one lane; outer keys dash further; walls stop it', () => {
  const sim = new Sim();
  sim.reset(2, 5);
  sim.tap(0, 0, 0);
  assert.equal(sim.lane, MID_LANE - 1);
  for (let i = 1; i < 60; i++) sim.step(i * STEP_MS);
  assert.equal(sim.ballX, laneX(MID_LANE - 1), 'the ball arrives within 60 ticks');
  assert.ok(sim.grounded);
  for (let i = 0; i < 10; i++) sim.tap(1, 0, 1000 + i * 200);
  assert.equal(sim.lane, LANES - 1, 'cannot dash past the last lane');

  const four = new Sim();
  four.reset(4, 5);
  four.tap(0, 0, 0); // Z, the outer left key
  assert.equal(four.lane, MID_LANE - 2);
  four.tap(1, 0, 500); // N, the inner right key
  assert.equal(four.lane, MID_LANE - 1);
  four.tap(1, 1, 1000); // M, the outer right key
  assert.equal(four.lane, MID_LANE + 1);
});

test('both sides together surge instead of dashing, and the surge has to recharge', () => {
  const sim = new Sim();
  sim.reset(2, 5);
  sim.tap(0, 0, 0);
  sim.tap(1, 0, 20);
  assert.equal(sim.lane, MID_LANE, 'the first dash is taken back');
  assert.equal(sim.surges, 1);
  assert.ok(sim.surgeT > 0);
  assert.equal(sim.charge, 0);
  const before = sim.climb;
  let i = 1;
  for (; i < TICK_HZ; i++) {
    sim.step(i * STEP_MS);
    assert.ok(sim.phase !== PHASE_RUN || sim.surgeT <= 0 || !sim.grounded, 'airborne while surging');
    if (sim.surgeT <= 0) break;
  }
  const plain = climbSpeed(0) * (i / TICK_HZ);
  assert.ok(Math.abs(sim.climb - before - plain - SURGE_DIST) < 0.05, `surged ${(sim.climb - before - plain).toFixed(2)} m`);
  // Straight away again: no charge, so it is a dud.
  sim.tap(0, 0, 2000);
  sim.tap(1, 0, 2010);
  assert.equal(sim.surges, 1);
  assert.equal(sim.lane, MID_LANE);
  // Taps further apart than the chord window are two dashes.
  sim.tap(0, 0, 3000);
  sim.tap(1, 0, 3100);
  assert.equal(sim.surges, 1);
  assert.equal(sim.dashes, 2);
});

test('one key: a hole swallows a ball that waits, and a timed surge clears it', () => {
  let cleared = 0;
  let fell = 0;
  for (let seed = 1; seed <= 8; seed++) {
    const idle = drive(1, seed * 31, 40, () => {});
    assert.equal(idle.phase, PHASE_FALL, 'doing nothing ends in a hole');
    fell++;

    // Surge whenever something in the lane is about to arrive.
    const sim = drive(
      1,
      seed * 31,
      25,
      (s, now) => {
        if (s.charge < 1 || s.surgeT > 0) return;
        if (s.burstState === BURST_LEADIN || s.burstState === BURST_ACTIVE || s.cueActive) return;
        for (let i = 0; i < s.hazCount; i++) {
          const k = (s.hazStart + i) % HAZ_CAP;
          if (Math.abs(s.hazX[k]!) - s.hazL[k]! > 0.5) continue;
          const dy = s.hazY[k]! - s.ballY;
          if (dy > 0.05 && dy < s.hazR[k]! + 0.3) s.tap(0, 0, now);
        }
      },
      (s) => s.surges >= 3,
    );
    if (sim.surges >= 3 && sim.phase === PHASE_RUN) cleared++;
  }
  assert.ok(fell === 8 && cleared >= 6, `cleared ${cleared} of 8`);
});

test('a dashing ball cannot be swallowed, a landed one can', () => {
  // Find a seed whose first row has a hole next to the middle lane, then dash onto it late.
  let checked = 0;
  for (let seed = 1; seed <= 60 && checked < 3; seed++) {
    const probe = new Sim();
    probe.reset(2, seed);
    let target = -1;
    for (let i = 0; i < probe.hazCount; i++) {
      const k = (probe.hazStart + i) % HAZ_CAP;
      if (probe.hazY[k]! > 13 || probe.hazType[k] !== 0) continue;
      const lane = Math.round(probe.hazX[k]! / LANE_W + MID_LANE);
      if (lane === MID_LANE + 1) target = k;
    }
    if (target < 0) continue;
    const sim = new Sim();
    sim.reset(2, seed);
    sim.tap(0, 0, 0);
    sim.tap(1, 0, 400); // back to the middle lane
    let dashed = false;
    for (let i = 1; i < TICK_HZ * 12; i++) {
      const now = 1000 + i * STEP_MS;
      const dy = sim.hazY[target]! - sim.ballY;
      if (!dashed && Math.abs(dy) < 0.05) {
        sim.tap(1, 0, now);
        dashed = true;
      }
      const was = sim.grounded;
      sim.step(now);
      if (dashed && sim.phase === PHASE_RUN) assert.ok(!sim.grounded || was === false || sim.ballX !== laneX(MID_LANE + 1));
      if (sim.phase !== PHASE_RUN) break;
    }
    assert.ok(dashed);
    assert.equal(sim.phase, PHASE_FALL, 'it fell on landing');
    assert.equal(sim.fallFromX, laneX(MID_LANE + 1));
    checked++;
  }
  assert.ok(checked >= 3, `only ${checked} seeds had a hole beside the start`);
});

test('every static row leaves a lane open', () => {
  for (const modeId of [2, 4, 6]) {
    for (let seed = 1; seed <= 12; seed++) {
      const sim = new Sim();
      sim.reset(modeId, seed * 977);
      const g = sim as unknown as { climb: number; time: number; generate(): void };
      const rows = new Map<number, Uint8Array>();
      for (let step = 0; step < 60; step++) {
        g.climb = step * 8;
        g.time = step * 4;
        g.generate();
        for (let i = 0; i < sim.hazCount; i++) {
          const k = (sim.hazStart + i) % HAZ_CAP;
          if (sim.hazType[k] === HAZ_BAR || sim.hazV[k] !== 0) continue;
          // Holes in a row are jittered by at most a quarter of a metre.
          let key = -1;
          for (const y of rows.keys()) if (Math.abs(y - sim.hazY[k]!) < 0.6) key = y;
          if (key < 0) {
            key = sim.hazY[k]!;
            rows.set(key, new Uint8Array(LANES));
          }
          for (let lane = 0; lane < LANES; lane++) {
            if (Math.abs(laneX(lane) - sim.hazX[k]!) - sim.hazL[k]! < 0.7) rows.get(key)![lane] = 1;
          }
        }
      }
      assert.ok(rows.size > 40, 'generated plenty of rows');
      for (const [y, lanes] of rows) {
        assert.ok(lanes.includes(0), `keys ${modeId} seed ${seed}: row at ${y.toFixed(1)} m has no open lane`);
      }
    }
  }
  assert.ok(BEAM_HALF > 0);
});

test('reaction cue without a reflex key: the tap is used up, logged in ms, and can still be half a surge', () => {
  let caught = 0;
  let chorded = 0;
  for (let seed = 1; seed <= 30; seed++) {
    for (const chord of [false, true]) {
      const sim = new Sim();
      sim.headless = true;
      sim.reset(2, seed * 77);
      sim.tap(0, 0, 0);
      sim.tap(1, 0, 300);
      for (let i = 1; i < TICK_HZ * 30; i++) {
        const now = 1000 + i * STEP_MS;
        // A chord needs a full surge charge (a lost heavy pull empties it).
        if (sim.cueActive && !sim.cueNogo && sim.cueDrawnAt > 0 && now - sim.cueDrawnAt >= 250 && (!chord || sim.charge >= 1)) {
          const lane = sim.lane;
          const other = 1 - sim.cueSide;
          sim.tap(sim.cueSide, 0, now);
          assert.equal(sim.rt[sim.rtCount - 1]! >= 250, true);
          assert.ok(sim.rt[sim.rtCount - 1]! >= 250 && sim.rt[sim.rtCount - 1]! <= sim.cueWindow, `rt ${sim.rt[sim.rtCount - 1]}`);
          assert.equal(sim.lane, lane, 'the catching tap does not dash');
          if (chord) {
            sim.tap(other, 0, now + 10);
            assert.equal(sim.surges, 1, 'cue tap plus the other side is still a surge');
            assert.equal(sim.lane, lane);
            chorded++;
          } else caught++;
          break;
        }
        sim.step(now);
        if (sim.phase !== PHASE_RUN) break;
      }
    }
  }
  assert.ok(caught >= 4 && chorded >= 4, `cues reached: ${caught} plain, ${chorded} chorded`);
});

test('a missed cue slides the ball one lane toward the slipping cable', () => {
  let checked = 0;
  for (let seed = 1; seed <= 30 && checked < 5; seed++) {
    const sim = new Sim();
    sim.headless = true;
    sim.reset(3, seed * 77);
    sim.tap(0, 0, 0);
    sim.tap(1, 0, 300);
    for (let i = 1; i < TICK_HZ * 30; i++) {
      const now = 1000 + i * STEP_MS;
      const active = sim.cueActive;
      const lane = sim.lane;
      const side = sim.cueSide;
      sim.step(now);
      if (sim.phase !== PHASE_RUN) break;
      if (active && !sim.cueActive) {
        assert.equal(sim.cueMisses, 1);
        assert.equal(sim.lane, lane + (side === 0 ? -1 : 1));
        assert.equal(sim.charge, 0);
        checked++;
        break;
      }
    }
  }
  assert.ok(checked >= 5, `only ${checked} seeds reached a cue`);

  const fs = new Sim();
  fs.reset(3, 78);
  fs.tap(0, 0, 0);
  fs.step(0);
  fs.reflex(500);
  assert.equal(fs.falseStarts, 1, 'reflex with no cue showing is a false start');
  assert.equal(fs.charge, 0);
});

test('a heavy pull is held by tapping above target, lost by slacking, and never moves the ball', () => {
  const attempt = (seed: number, factor: number) => {
    const last = [-1e9, -1e9];
    let laneAtStart = -1;
    let moved = false;
    const sim = drive(
      2,
      seed,
      90,
      (s, now) => {
        if (s.burstState === BURST_NONE) {
          // Stay alive: sit in whichever lane is free.
          let danger = false;
          for (let i = 0; i < s.hazCount; i++) {
            const k = (s.hazStart + i) % HAZ_CAP;
            const dy = s.hazY[k]! - s.ballY;
            if (dy > -0.7 && dy < 2.2 && Math.abs(laneX(s.lane) - s.hazX[k]!) - s.hazL[k]! < 0.7) danger = true;
          }
          if (danger && now - Math.max(last[0]!, last[1]!) > 160) {
            const side = s.lane > MID_LANE ? 0 : 1;
            s.tap(side, 0, now);
            last[side] = now;
          }
          return;
        }
        if (laneAtStart < 0) laneAtStart = s.lane;
        if (s.burstState === BURST_LEADIN || s.burstState === BURST_ACTIVE) {
          for (let side = 0; side < 2; side++) {
            if (now - last[side]! >= 1000 / (s.burstTarget * factor)) {
              s.tap(side, 0, now);
              last[side] = now;
            }
          }
          if (s.lane !== laneAtStart) moved = true;
        }
      },
      (s) => s.burstsWon + s.burstsLost > 0,
    );
    return { sim, moved };
  };
  let won = 0;
  let lost = 0;
  for (let seed = 1; seed <= 24; seed++) {
    const strong = attempt(seed * 9, 1.2);
    if (strong.sim.burstsWon + strong.sim.burstsLost > 0) {
      assert.equal(strong.sim.burstsWon, 1, 'tapping above target holds the pull');
      assert.ok(!strong.moved, 'taps in a pull do not dash');
      won++;
    }
    const weak = attempt(seed * 9, 0.7);
    if (weak.sim.burstsWon + weak.sim.burstsLost > 0) {
      assert.equal(weak.sim.burstsLost, 1, 'tapping below target slips');
      lost++;
    }
  }
  assert.ok(won >= 3 && lost >= 3, `pulls reached: ${won} strong, ${lost} weak`);
  assert.ok(HOVER_MID > 0 && PHASE_OVER > 0);
});

test('pickups build the chain, which multiplies the score', () => {
  const sim = new Sim();
  sim.reset(2, 3);
  sim.tap(0, 0, 0);
  sim.tap(1, 0, 400);
  // Drop three pickups straight ahead of the ball.
  const g = sim as unknown as { addRing(lane: number, y: number): void };
  g.addRing(MID_LANE, sim.ballY + 0.8);
  g.addRing(MID_LANE, sim.ballY + 1.6);
  g.addRing(MID_LANE, sim.ballY + 2.4);
  const rings = sim.rings;
  for (let i = 1; i < TICK_HZ * 3 && sim.phase === PHASE_RUN; i++) sim.step(1000 + i * STEP_MS);
  assert.equal(sim.rings - rings, 3);
  assert.equal(sim.chain, 3);
  assert.equal(sim.mult, 4);
  assert.equal(sim.bestChain, 3);
});

test('grey cues: holding still is rewarded, pressing is a false start', () => {
  const grey = (sim: Sim, now: number) => {
    sim.cueActive = true;
    sim.cueNogo = true;
    sim.cueSide = 1;
    sim.cueDrawnAt = now - 150;
    sim.cueWindow = 500;
  };
  const a = new Sim();
  a.headless = true;
  a.reset(2, 3);
  a.tap(0, 0, 0);
  a.step(1);
  grey(a, 1000);
  a.tap(0, 0, 1000);
  assert.equal(a.falseStarts, 1, 'any lift tap during grey is a false start');
  assert.ok(!a.cueActive);
  assert.equal(a.chain, 0);

  const b = new Sim();
  b.headless = true;
  b.reset(3, 3);
  b.tap(0, 0, 0);
  b.step(1);
  grey(b, 1000);
  b.tap(0, 0, 1000);
  assert.equal(b.falseStarts, 0, 'with a reflex key, dashing during grey is fine');
  b.reflex(1010);
  assert.equal(b.falseStarts, 1, 'but the reflex key is not');

  const c = new Sim();
  c.headless = true;
  c.reset(2, 3);
  c.tap(0, 0, 0);
  c.step(1);
  grey(c, 1000);
  for (let i = 0; i < 400 && c.cueActive; i++) c.step(1000 + i * STEP_MS);
  assert.equal(c.nogoHeld, 1, 'waiting it out counts as held');
  assert.equal(c.cueMisses, 0);

  // Over real runs, about a quarter of cues are grey, and a player who holds still keeps them.
  let go = 0;
  let nogo = 0;
  let heldAll = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const sim = play(2, seed * 7919, { keyCps: 7.5, reactionMs: 230, look: 2.4, think: 16 }, 120);
    go += sim.cueCount;
    nogo += sim.nogoCount;
    heldAll += sim.nogoHeld;
  }
  const share = nogo / (go + nogo);
  assert.ok(share > 0.12 && share < 0.38, `grey share ${share.toFixed(2)}`);
  assert.ok(heldAll >= nogo - 1, `held ${heldAll} of ${nogo}`);
});

test('cues only fire after a quiet moment, and the first heavy pull comes early', () => {
  const taps: number[] = [];
  const origTap = Sim.prototype.tap;
  const origStep = Sim.prototype.step;
  let violations = 0;
  let starts = 0;
  Sim.prototype.tap = function (this: Sim, side: number, key: number, ts: number) {
    if (this.phase === PHASE_RUN && this.burstState === BURST_NONE) taps.push(this.time);
    origTap.call(this, side, key, ts);
  };
  Sim.prototype.step = function (this: Sim, tickMs: number) {
    const before = this.cueCount + this.nogoCount;
    origStep.call(this, tickMs);
    if (this.cueCount + this.nogoCount > before) {
      starts++;
      const last = taps.length ? taps[taps.length - 1]! : -1e9;
      if (this.time - last < 0.6 - 1e-9) violations++;
    }
  };
  const firsts: number[] = [];
  try {
    for (let seed = 1; seed <= 6; seed++) {
      taps.length = 0;
      let first = -1;
      const sim = new Sim();
      const stepWatch = Sim.prototype.step;
      Sim.prototype.step = function (this: Sim, tickMs: number) {
        stepWatch.call(this, tickMs);
        if (first < 0 && this.burstState !== BURST_NONE) first = this.time;
      };
      play(2, seed * 31, { keyCps: 7.5, reactionMs: 230, look: 2.4, think: 16 }, 40);
      Sim.prototype.step = stepWatch;
      void sim;
      if (first > 0) firsts.push(first);
    }
  } finally {
    Sim.prototype.tap = origTap;
    Sim.prototype.step = origStep;
  }
  assert.ok(starts > 5, `cues started: ${starts}`);
  assert.equal(violations, 0, 'a cue started less than 0.6 s after a tap');
  assert.ok(firsts.length >= 4, `runs that reached a pull: ${firsts.length}`);
  for (const t of firsts) assert.ok(t < 14, `first pull at ${t.toFixed(1)} s`);
});
