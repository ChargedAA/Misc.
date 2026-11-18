// The game registry: every game in the suite, grouped by the skill it trains.

import { ATTENTION } from './attention.ts';
import type { InputKind, MiniDef, Skill } from './kit.ts';
import { BATCH4 } from './batch4.ts';
import { BATCH5 } from './batch5.ts';
import { BATCH6 } from './batch6.ts';
import { BATCH7 } from './batch7.ts';
import { BATCH8 } from './batch8.ts';
import { BATCH9 } from './batch9.ts';
import { BATCH10 } from './batch10.ts';
import { BATCH11 } from './batch11.ts';
import { BATCH12 } from './batch12.ts';
import { BATCH13 } from './batch13.ts';
import { BATCH14 } from './batch14.ts';
import { BATCH15 } from './batch15.ts';
import { SKILLS } from './kit.ts';
import { COORDINATION } from './coord.ts';
import { EXTRA } from './extra.ts';
import { MEMORY } from './memory.ts';
import { MORE } from './more.ts';
import { REACTION } from './reaction.ts';
import { SPEED, TIMING } from './tempo.ts';

export interface Entry {
  id: string;
  name: string;
  skill: Skill;
  blurb: string;
  input: InputKind;
  minKeys?: number;
  /** Set for mini-games; the three original games are wired up by hand. */
  def?: MiniDef;
}

const BUILT_IN: Entry[] = [
  { id: 'climb', name: 'Climb', skill: 'coordination', blurb: 'Dash between lanes, surge over holes, catch the cables. Endless.', input: 'keys' },
  { id: 'reflex', name: 'Reflex', skill: 'reaction', blurb: 'Six rule games that change every round. Three strikes.', input: 'keys' },
  { id: 'burst', name: 'Burst', skill: 'speed', blurb: 'Hold a rising tap rate for five seconds.', input: 'keys', minKeys: 1 },
];

export const MINIS: MiniDef[] = [...REACTION, ...SPEED, ...TIMING, ...MEMORY, ...ATTENTION, ...COORDINATION, ...MORE, ...EXTRA, ...BATCH4, ...BATCH5, ...BATCH6, ...BATCH7, ...BATCH8, ...BATCH9, ...BATCH10, ...BATCH11, ...BATCH12, ...BATCH13, ...BATCH14, ...BATCH15];

export const ENTRIES: Entry[] = [
  ...BUILT_IN,
  ...MINIS.map((d) => ({ id: d.id, name: d.name, skill: d.skill, blurb: d.blurb, input: d.input, minKeys: d.minKeys, def: d })),
];

/** Today's set: one mini-game per skill, the same for everyone on a given date. */
export function dailySet(date: Date = new Date()): string[] {
  const key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  let h = 2166136261;
  for (const c of key) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const out: string[] = [];
  for (const { id: sk } of SKILLS) {
    const pool = MINIS.filter((d) => d.skill === sk);
    if (!pool.length) continue;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    out.push(pool[h % pool.length]!.id);
  }
  return out;
}

export function entry(id: string): Entry | undefined {
  return ENTRIES.find((e) => e.id === id);
}
