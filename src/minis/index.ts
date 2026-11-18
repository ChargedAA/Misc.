// The game registry: every game in the suite, grouped by the skill it trains.

import type { InputKind, MiniDef, Skill } from './kit.ts';
import { MEMORY } from './memory.ts';
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

export const MINIS: MiniDef[] = [...REACTION, ...SPEED, ...TIMING, ...MEMORY];

export const ENTRIES: Entry[] = [
  ...BUILT_IN,
  ...MINIS.map((d) => ({ id: d.id, name: d.name, skill: d.skill, blurb: d.blurb, input: d.input, minKeys: d.minKeys, def: d })),
];

export function entry(id: string): Entry | undefined {
  return ENTRIES.find((e) => e.id === id);
}
