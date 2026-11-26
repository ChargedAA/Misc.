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
import { BATCH16 } from './batch16.ts';
import { BATCH17 } from './batch17.ts';
import { BATCH18 } from './batch18.ts';
import { BATCH19 } from './batch19.ts';
import { BATCH20 } from './batch20.ts';
import { BATCH21 } from './batch21.ts';
import { BATCH22 } from './batch22.ts';
import { BATCH23 } from './batch23.ts';
import { BATCH24 } from './batch24.ts';
import { BATCH25 } from './batch25.ts';
import { BATCH26 } from './batch26.ts';
import { BATCH27 } from './batch27.ts';
import { BATCH28 } from './batch28.ts';
import { BATCH29 } from './batch29.ts';
import { BATCH30 } from './batch30.ts';
import { BATCH31 } from './batch31.ts';
import { BATCH32 } from './batch32.ts';
import { BATCH33 } from './batch33.ts';
import { BATCH34 } from './batch34.ts';
import { BATCH35 } from './batch35.ts';
import { BATCH36 } from './batch36.ts';
import { BATCH37 } from './batch37.ts';
import { BATCH38 } from './batch38.ts';
import { BATCH39 } from './batch39.ts';
import { BATCH40 } from './batch40.ts';
import { BATCH41 } from './batch41.ts';
import { BATCH42 } from './batch42.ts';
import { BATCH43 } from './batch43.ts';
import { BATCH44 } from './batch44.ts';
import { BATCH45 } from './batch45.ts';
import { BATCH46 } from './batch46.ts';
import { BATCH47 } from './batch47.ts';
import { BATCH48 } from './batch48.ts';
import { BATCH49 } from './batch49.ts';
import { BATCH50 } from './batch50.ts';
import { BATCH51 } from './batch51.ts';
import { BATCH52 } from './batch52.ts';
import { BATCH53 } from './batch53.ts';
import { BATCH54 } from './batch54.ts';
import { BATCH55 } from './batch55.ts';
import { BATCH56 } from './batch56.ts';
import { BATCH57 } from './batch57.ts';
import { BATCH58 } from './batch58.ts';
import { BATCH59 } from './batch59.ts';
import { BATCH60 } from './batch60.ts';
import { BATCH61 } from './batch61.ts';
import { BATCH62 } from './batch62.ts';
import { BATCH63 } from './batch63.ts';
import { BATCH64 } from './batch64.ts';
import { BATCH65 } from './batch65.ts';
import { BATCH66 } from './batch66.ts';
import { BATCH67 } from './batch67.ts';
import { BATCH68 } from './batch68.ts';
import { BATCH69 } from './batch69.ts';
import { BATCH70 } from './batch70.ts';
import { BATCH71 } from './batch71.ts';
import { BATCH72 } from './batch72.ts';
import { BATCH73 } from './batch73.ts';
import { BATCH74 } from './batch74.ts';
import { BATCH75 } from './batch75.ts';
import { BATCH76 } from './batch76.ts';
import { BATCH77 } from './batch77.ts';
import { BATCH78 } from './batch78.ts';
import { SKILLS } from './kit.ts';
import { quick } from './groups.ts';
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

export const MINIS: MiniDef[] = [...REACTION, ...SPEED, ...TIMING, ...MEMORY, ...ATTENTION, ...COORDINATION, ...MORE, ...EXTRA, ...BATCH4, ...BATCH5, ...BATCH6, ...BATCH7, ...BATCH8, ...BATCH9, ...BATCH10, ...BATCH11, ...BATCH12, ...BATCH13, ...BATCH14, ...BATCH15, ...BATCH16, ...BATCH17, ...BATCH18, ...BATCH19, ...BATCH20, ...BATCH21, ...BATCH22, ...BATCH23, ...BATCH24, ...BATCH25, ...BATCH26, ...BATCH27, ...BATCH28, ...BATCH29, ...BATCH30, ...BATCH31, ...BATCH32, ...BATCH33, ...BATCH34, ...BATCH35, ...BATCH36, ...BATCH37, ...BATCH38, ...BATCH39, ...BATCH40, ...BATCH41, ...BATCH42, ...BATCH43, ...BATCH44, ...BATCH45, ...BATCH46, ...BATCH47, ...BATCH48, ...BATCH49, ...BATCH50, ...BATCH51, ...BATCH52, ...BATCH53, ...BATCH54, ...BATCH55, ...BATCH56, ...BATCH57, ...BATCH58, ...BATCH59, ...BATCH60, ...BATCH61, ...BATCH62, ...BATCH63, ...BATCH64, ...BATCH65, ...BATCH66, ...BATCH67, ...BATCH68, ...BATCH69, ...BATCH70, ...BATCH71, ...BATCH72, ...BATCH73, ...BATCH74, ...BATCH75, ...BATCH76, ...BATCH77, ...BATCH78];

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
    const pool = MINIS.filter((d) => d.skill === sk && quick(d.id));
    if (!pool.length) continue;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    out.push(pool[h % pool.length]!.id);
  }
  return out;
}

export function entry(id: string): Entry | undefined {
  return ENTRIES.find((e) => e.id === id);
}
