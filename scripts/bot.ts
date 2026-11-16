// Headless tuning bot: plays the sim with a simple lookahead controller so the
// difficulty curve can be sanity-checked without a browser.
//   node scripts/bot.ts [runs] [maxSeconds]

import { BALL_G, BEAM_HALF, STEP_MS, TRAVEL, clamp, climbSpeed } from '../src/config.ts';
import { BURST_ACTIVE, BURST_LEADIN, HOLE_CAP, PHASE_OVER, PHASE_RUN, Sim, ZONE_CAP } from '../src/sim.ts';

interface Skill {
  /** Fastest the bot will hit one key (taps per second). */
  keyCps: number;
  reactionMs: number;
  /** Seconds of board the bot plans over. */
  look: number;
}

function play(modeId: number, seed: number, skill: Skill, maxSeconds: number) {
  const sim = new Sim();
  sim.headless = true;
  sim.reset(modeId, seed);
  const lastTap = [-1e9, -1e9];
  const keyIdx = [0, 0];
  let reflexAt = 0;
  let targetX = 0;
  const minGap = 1000 / skill.keyCps;

  const tapSide = (side: number, now: number) => {
    const keys = side === 0 ? sim.mode.left : sim.mode.right;
    if (keys === 0) return;
    keyIdx[side] = (keyIdx[side]! + 1) % keys;
    sim.tap(side, keyIdx[side]!, now);
    lastTap[side] = now;
  };

  sim.tap(0, 0, 0);
  for (let k = 0; sim.phase !== PHASE_OVER && sim.time < maxSeconds; k++) {
    const now = k * STEP_MS;
    if (sim.phase === PHASE_RUN) {
      // Re-plan the target x at 30 Hz.
      if (k % 16 === 0) {
        const speed = climbSpeed(sim.time);
        const reach = speed * skill.look;
        let best = Infinity;
        for (let x = -5.2; x <= 5.2; x += 0.2) {
          let cost = 0.12 * Math.abs(x - sim.ballX);
          for (let i = 0; i < sim.holeCount; i++) {
            const h = (sim.holeStart + i) % HOLE_CAP;
            const dy = sim.hy[h]! - sim.ballY;
            if (dy < -0.8 || dy > reach) continue;
            const clear = Math.abs(x - sim.hx[h]!) - sim.hr[h]!;
            if (clear < 0.75) cost += (0.75 - clear) * 6 * (1.2 - dy / reach);
          }
          for (let i = 0; i < sim.zoneCount; i++) {
            const z = (sim.zoneStart + i) % ZONE_CAP;
            const dy = sim.zy[z]! - sim.ballY;
            if (dy < reach && dy + sim.zh[z]! > 0 && Math.abs(x - sim.zx[z]!) < sim.zw[z]! * 0.4) cost -= 0.4;
          }
          if (cost < best) {
            best = cost;
            targetX = x;
          }
        }
      }

      // PD on ball position -> wanted tilt -> wanted end heights.
      const acc = clamp(5 * (targetX - sim.ballX) - 3.4 * sim.ballV, -5, 5);
      const dyWanted = (-acc / BALL_G) * BEAM_HALF * 2;
      const diff = clamp(dyWanted / TRAVEL, -0.8, 0.8);
      const want = [clamp(0.5 - diff / 2, 0.06, 0.94), clamp(0.5 + diff / 2, 0.06, 0.94)];
      if (sim.fixedRight) want[0] = clamp(0.5 - diff, 0.04, 0.96);

      const bursting = sim.burstState === BURST_LEADIN || sim.burstState === BURST_ACTIVE;
      for (let s = 0; s < 2; s++) {
        if (s === 1 && sim.fixedRight) continue;
        const since = now - lastTap[s]!;
        if (since < minGap / (s === 0 ? sim.mode.left : sim.mode.right)) continue;
        const predicted = sim.h[s]! + sim.v[s]! * 0.09;
        const need = predicted < want[s]!;
        const hold = bursting && since >= 1000 / (sim.burstTarget * 1.12);
        if (need || hold) tapSide(s, now);
      }

      // Reaction cue.
      if (sim.cueActive && sim.cueDrawnAt > 0) {
        if (reflexAt === 0) reflexAt = sim.cueDrawnAt + skill.reactionMs;
        if (now >= reflexAt) {
          if (sim.mode.reflex) sim.reflex(now);
          else tapSide(sim.cueSide, now);
          reflexAt = 0;
        }
      } else {
        reflexAt = 0;
      }
    }
    sim.step(now);
  }
  return sim;
}

const runs = Number(process.argv[2] ?? 12);
const maxSeconds = Number(process.argv[3] ?? 300);
const skills: Record<string, Skill> = {
  sharp: { keyCps: 7.5, reactionMs: 230, look: 2.6 },
  casual: { keyCps: 5.5, reactionMs: 330, look: 1.6 },
  // Never answers a cue: shows how much a missed reaction costs.
  asleep: { keyCps: 7.5, reactionMs: 5000, look: 2.6 },
};

for (const [name, skill] of Object.entries(skills)) {
  console.log(`\n${name}  (keyCps ${skill.keyCps}, reaction ${skill.reactionMs} ms)`);
  for (let mode = 1; mode <= 6; mode++) {
    const times: number[] = [];
    let cues = 0;
    let hits = 0;
    let won = 0;
    let lost = 0;
    let score = 0;
    let zone = 0;
    for (let seed = 1; seed <= runs; seed++) {
      const sim = play(mode, seed * 7919, skill, maxSeconds);
      times.push(sim.time);
      cues += sim.cueCount;
      hits += sim.cueHits;
      won += sim.burstsWon;
      lost += sim.burstsLost;
      score += sim.score;
      zone += sim.zoneTime;
    }
    times.sort((a, b) => a - b);
    const med = times[times.length >> 1]!;
    console.log(
      `  mode ${mode}: median ${med.toFixed(0).padStart(3)}s  min ${times[0]!.toFixed(0).padStart(3)}  max ${times[times.length - 1]!
        .toFixed(0)
        .padStart(3)}  cues ${hits}/${cues}  pulls ${won}/${won + lost}  score ${(score / runs).toFixed(0)}  zone ${(zone / runs).toFixed(1)}s`,
    );
  }
}
