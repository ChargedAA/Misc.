// Headless tuning bot: plays Climb with a simple lookahead controller so the
// difficulty curve can be sanity-checked without a browser.
//   node scripts/bot.ts [runs] [maxSeconds]

import { LANES, LANE_W, MID_LANE, STEP_MS, climbSpeed, laneX } from '../src/config.ts';
import { BURST_ACTIVE, BURST_LEADIN, HAZ_BAR, HAZ_CAP, PHASE_OVER, PHASE_RUN, RING_CAP, Sim } from '../src/sim.ts';

export interface Skill {
  /** Fastest the bot will hit one key (taps per second). */
  keyCps: number;
  reactionMs: number;
  /** Seconds of board the bot plans over. */
  look: number;
  /** How often it re-plans (ticks). Slower planning is a slower player. */
  think: number;
}

export function play(modeId: number, seed: number, skill: Skill, maxSeconds: number): Sim {
  const sim = new Sim();
  sim.headless = true;
  sim.reset(modeId, seed);
  const lastTap = [-1e9, -1e9];
  const keyIdx = [0, 0];
  const cost = new Float64Array(LANES);
  let reflexAt = 0;
  let answered = -1;
  let wantLane = MID_LANE;
  let wantSurge = false;
  const minGap = 1000 / skill.keyCps;

  const tapKey = (side: number, key: number, now: number) => {
    sim.tap(side, key, now);
    lastTap[side] = now;
  };
  const tapNext = (side: number, now: number) => {
    const keys = side === 0 ? sim.mode.left : sim.mode.right;
    if (keys === 0) return;
    keyIdx[side] = (keyIdx[side]! + 1) % keys;
    tapKey(side, keyIdx[side]!, now);
  };

  sim.tap(0, 0, 0);
  for (let k = 1; sim.phase !== PHASE_OVER && sim.time < maxSeconds; k++) {
    const now = k * STEP_MS;
    if (sim.phase === PHASE_RUN) {
      const speed = climbSpeed(sim.time);
      const bursting = sim.burstState === BURST_LEADIN || sim.burstState === BURST_ACTIVE;

      if (bursting) {
        for (let s = 0; s < 2; s++) {
          if (s === 1 && sim.oneKey) continue;
          if (now - lastTap[s]! >= 1000 / (sim.burstTarget * 1.12)) tapNext(s, now);
        }
      } else {
        if (k % skill.think === 0) {
          // Score each lane by what is coming down it.
          const reach = speed * skill.look;
          cost.fill(0);
          wantSurge = false;
          for (let i = 0; i < sim.hazCount; i++) {
            const h = (sim.hazStart + i) % HAZ_CAP;
            const dy = sim.hazY[h]! - sim.ballY;
            if (dy < -0.7 || dy > reach) continue;
            const t = Math.max(0, dy) / speed;
            const bar = sim.hazType[h] === HAZ_BAR;
            if (bar) {
              if (dy > 0.1 && dy < 0.55 + speed * 0.12) wantSurge = true;
              continue;
            }
            const moving = sim.hazV[h] !== 0;
            for (let lane = 0; lane < LANES; lane++) {
              const x = laneX(lane);
              let covers: boolean;
              if (moving) covers = x >= sim.hazMin[h]! - 0.6 && x <= sim.hazMax[h]! + 0.6 && t > 0.5;
              else covers = Math.abs(x - sim.hazX[h]!) - sim.hazL[h]! < 0.62;
              if (moving && t <= 0.5) covers = Math.abs(x - (sim.hazX[h]! + sim.hazV[h]! * t)) < 1.1;
              if (covers) cost[lane]! += (moving && t > 0.5 ? 2 : 12) / (0.25 + t);
            }
          }
          for (let i = 0; i < sim.ringCount; i++) {
            const r = (sim.ringStart + i) % RING_CAP;
            if (sim.ringLive[r] === 0) continue;
            const dy = sim.ringY[r]! - sim.ballY;
            if (dy < 0 || dy > reach) continue;
            const lane = Math.round(sim.ringX[r]! / LANE_W + MID_LANE);
            cost[lane]! -= 1.2 / (0.4 + dy / speed);
          }
          let best = Infinity;
          for (let lane = 0; lane < LANES; lane++) {
            const c = cost[lane]! + 0.35 * Math.abs(lane - sim.lane);
            if (c < best) {
              best = c;
              wantLane = lane;
            }
          }
          if (sim.oneKey) {
            wantLane = MID_LANE;
            for (let i = 0; i < sim.hazCount; i++) {
              const h = (sim.hazStart + i) % HAZ_CAP;
              const dy = sim.hazY[h]! - sim.ballY;
              if (Math.abs(sim.hazX[h]!) - sim.hazL[h]! > 0.5) continue;
              if (dy > 0.1 && dy < sim.hazR[h]! + 0.25 + speed * 0.1) wantSurge = true;
            }
          } else if (cost[sim.lane]! > 30 && wantLane === sim.lane) {
            // Boxed in: nothing better to dash to.
            wantSurge = true;
          }
        }

        if (wantSurge && sim.charge >= 1 && sim.surgeT <= 0) {
          if (sim.oneKey) tapKey(0, 0, now);
          else {
            tapKey(0, sim.mode.left - 1, now);
            tapKey(1, 0, now + 4);
          }
          wantSurge = false;
        } else if (!sim.oneKey && wantLane !== sim.lane) {
          const side = wantLane < sim.lane ? 0 : 1;
          const keys = side === 0 ? sim.mode.left : sim.mode.right;
          if (now - lastTap[side]! >= minGap / keys) {
            // Pick the longest dash that fits and does not land on something.
            const dist = Math.abs(wantLane - sim.lane);
            let size = Math.min(dist, keys);
            const dir = side === 0 ? -1 : 1;
            while (size > 0 && cost[sim.lane + dir * size]! > 20 && cost[sim.lane]! <= 20) size--;
            if (size > 0) tapKey(side, side === 0 ? keys - size : size - 1, now);
          }
        }
      }

      // Reaction cue.
      if (sim.cueActive && sim.cueDrawnAt > 0 && answered !== sim.cueCount) {
        if (reflexAt === 0) reflexAt = sim.cueDrawnAt + skill.reactionMs;
        if (now >= reflexAt) {
          if (sim.mode.reflex) sim.reflex(now);
          else tapKey(sim.oneKey ? 0 : sim.cueSide, 0, now);
          answered = sim.cueCount;
          reflexAt = 0;
        }
      } else if (!sim.cueActive) {
        reflexAt = 0;
      }
    }
    sim.step(now);
  }
  return sim;
}

if (process.argv[1]?.endsWith('bot.ts')) {
  const runs = Number(process.argv[2] ?? 12);
  const maxSeconds = Number(process.argv[3] ?? 300);
  const skills: Record<string, Skill> = {
    sharp: { keyCps: 7.5, reactionMs: 230, look: 2.4, think: 16 },
    casual: { keyCps: 5, reactionMs: 340, look: 1.5, think: 96 },
    // Never answers a cue: shows how much a missed reaction costs.
    asleep: { keyCps: 7.5, reactionMs: 5000, look: 2.4, think: 16 },
  };

  for (const [name, skill] of Object.entries(skills)) {
    console.log(`\n${name}  (keyCps ${skill.keyCps}, reaction ${skill.reactionMs} ms, plans every ${(skill.think * STEP_MS).toFixed(0)} ms)`);
    for (let mode = 1; mode <= 6; mode++) {
      const times: number[] = [];
      let cues = 0;
      let hits = 0;
      let won = 0;
      let lost = 0;
      let score = 0;
      let rings = 0;
      let surges = 0;
      for (let seed = 1; seed <= runs; seed++) {
        const sim = play(mode, seed * 7919, skill, maxSeconds);
        times.push(sim.time);
        cues += sim.cueCount;
        hits += sim.cueHits;
        won += sim.burstsWon;
        lost += sim.burstsLost;
        score += sim.score;
        rings += sim.rings;
        surges += sim.surges;
      }
      times.sort((a, b) => a - b);
      const med = times[times.length >> 1]!;
      console.log(
        `  ${mode} key${mode > 1 ? 's' : ' '}: median ${med.toFixed(0).padStart(3)}s  min ${times[0]!.toFixed(0).padStart(3)}  max ${times[times.length - 1]!
          .toFixed(0)
          .padStart(3)}  cues ${hits}/${cues}  pulls ${won}/${won + lost}  score ${(score / runs).toFixed(0)}  rings ${(rings / runs).toFixed(0)}  surges ${(surges / runs).toFixed(0)}`,
      );
    }
  }
}
