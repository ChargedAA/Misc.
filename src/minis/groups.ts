// How the drills of each skill are organised: what each group actually trains, a short
// recommended routine, a benchmark to track over time, and how long the longer drills take.

import type { Skill } from './kit.ts';

export interface DrillGroup {
  name: string;
  desc: string;
  ids: string[];
}

export interface SkillGuide {
  /** What the skill is, in plain words, for the home screen. */
  about: string;
  groups: DrillGroup[];
  /** Three drills that cover the skill, played back to back. */
  routine: string[];
  /** One drill with a fixed setup, to compare yourself against over time. */
  benchmark: string;
}

export const GUIDES: Record<Skill, SkillGuide> = {
  reaction: {
    about: 'Respond to a signal fast, pick the right response, and hold back the wrong one.',
    groups: [
      { name: 'React to a cue', desc: 'One signal, one press, as fast as you can', ids: ['snap', 'lights', 'ears', 'duel', 'alert', 'ruler'] },
      { name: 'Choose a response', desc: 'Several possible answers: pick the right one quickly', ids: ['choice', 'flank', 'aim', 'whack', 'reflex'] },
      { name: 'Hold back', desc: 'Stop, or override, the press you were about to make', ids: ['stop', 'opposite', 'dodge', 'parry', 'goalie', 'volley'] },
      { name: 'Steer clear', desc: 'Move something out of the way in time', ids: ['swerve', 'shield', 'catch', 'flipper'] },
      { name: 'Runs', desc: 'Steer a rolling ball; the window to react is the difficulty', ids: ['lanes', 'hurdles', 'rush'] },
    ],
    routine: ['snap', 'choice', 'stop'],
    benchmark: 'snap',
  },
  speed: {
    about: 'Tap fast, hold a rate, and stay controlled and in order while you do.',
    groups: [
      { name: 'Peak rate', desc: 'How fast you can go, and how long it lasts', ids: ['sprint', 'sets', 'tug', 'pedal'] },
      { name: 'Controlled rate', desc: 'Hit and hold a target rate, no faster, no slower', ids: ['burst', 'ladder', 'pulse', 'steady', 'exact'] },
      { name: 'In order', desc: 'Speed across several keys without slipping', ids: ['roll', 'trill', 'rain'] },
      { name: 'Speed of thought', desc: 'Turn what you see into the right press, fast', ids: ['code'] },
    ],
    routine: ['sprint', 'steady', 'trill'],
    benchmark: 'sprint',
  },
  timing: {
    about: 'Press at exactly the right moment: on a beat, as something arrives, or after a set time.',
    groups: [
      { name: 'Keep a beat', desc: 'Hold a tempo, with and without the click', ids: ['tempo', 'offbeat', 'drift', 'even'] },
      { name: 'Intercept', desc: 'Time a press to something moving, even when it hides', ids: ['cross', 'swing', 'meet', 'hop', 'tower', 'keep', 'bat', 'stamp', 'drive', 'hopper'] },
      { name: 'Reproduce', desc: 'Copy a duration or a rhythm from memory', ids: ['gap', 'second', 'echo', 'morse', 'rope'] },
      { name: 'Hear the timing', desc: 'Notice when a beat is off, by ear', ids: ['late'] },
    ],
    routine: ['tempo', 'cross', 'gap'],
    benchmark: 'tempo',
  },
  coordination: {
    about: 'Use both hands at once: separate jobs, shared rhythms, and exact togetherness.',
    groups: [
      { name: 'Two hands, two jobs', desc: 'Each hand steers its own thing', ids: ['split', 'twin', 'orbit', 'juggle', 'pole'] },
      { name: 'Steer', desc: 'Turn, carve and thread a path with momentum', ids: ['comet', 'slalom', 'row', 'drone'] },
      { name: 'Fine control', desc: 'Move, brake and stop exactly where you mean to', ids: ['dock', 'lander', 'mirror', 'crane', 'etch'] },
      { name: 'Rhythm across hands', desc: 'Patterns and tempos split between the hands', ids: ['sync', 'poly', 'drum', 'strings'] },
      { name: 'Full runs', desc: 'Everything at once, until you fall', ids: ['climb', 'zigzag'] },
    ],
    routine: ['sync', 'split', 'poly'],
    benchmark: 'sync',
  },
  memory: {
    about: 'Hold more in your head, keep it up to date, and remember where things were.',
    groups: [
      { name: 'Span', desc: 'How much you can hold and play back in order', ids: ['digits', 'sequence', 'path', 'order', 'melody', 'route'] },
      { name: 'Places', desc: 'Where things were', ids: ['grid', 'where', 'pairs'] },
      { name: 'Updating', desc: 'Keep what you hold current as new items arrive, or through a distraction', ids: ['back', 'running', 'hold'] },
      { name: 'Recognise and pair', desc: 'Seen it before? What went with it?', ids: ['spot', 'again', 'link', 'sounds'] },
      { name: 'Lists', desc: 'Remember what came and in what order', ids: ['recall', 'queue'] },
      { name: 'Remember to act', desc: 'Keep an intention in mind while busy with something else', ids: ['remind'] },
    ],
    routine: ['digits', 'grid', 'running'],
    benchmark: 'digits',
  },
  attention: {
    about: 'Pick the signal out of the noise, follow it, and stay sharp when little happens.',
    groups: [
      { name: 'Filter', desc: 'Answer the right thing and ignore what pulls you away', ids: ['find', 'shape', 'side', 'switch', 'sort', 'away', 'beeps'] },
      { name: 'Follow', desc: 'Keep track of something as it moves or winds', ids: ['track', 'shells', 'tangle', 'shadow', 'fly'] },
      { name: 'At a glance', desc: 'Take in a lot in one brief look', ids: ['glance', 'count', 'flicker', 'rotate', 'schulte'] },
      { name: 'Monitor', desc: 'Keep several things in view and step in at the right moment', ids: ['gauges', 'tally', 'trail', 'radar'] },
      { name: 'Stay alert', desc: 'Catch the rare target in a long, dull stream', ids: ['stream', 'except', 'clock'] },
    ],
    routine: ['track', 'find', 'except'],
    benchmark: 'track',
  },
  judgement: {
    about: 'Size things up by eye and ear: lengths, amounts, angles, paths, pitch.',
    groups: [
      { name: 'Size and amount', desc: 'Lengths, counts, midpoints and numbers', ids: ['longer', 'more', 'guess', 'middle', 'line', 'angle', 'centroid', 'closer'] },
      { name: 'Angle, shade, motion', desc: 'Including when the surroundings try to fool you', ids: ['tilt', 'shade', 'faster', 'first', 'flow', 'align'] },
      { name: 'In motion', desc: 'Judge gaps, paths and amounts as they change', ids: ['merge', 'pour', 'bank', 'topple', 'hoop'] },
      { name: 'By ear and clock', desc: 'Judge what you hear, and how long things last', ids: ['pitch', 'tune', 'duration'] },
      { name: 'Risk', desc: 'Weigh a bigger reward against the chance of losing it', ids: ['pump'] },
    ],
    routine: ['longer', 'tilt', 'more'],
    benchmark: 'longer',
  },
  reasoning: {
    about: 'Think fast and stay right: numbers, patterns, rules, space and words.',
    groups: [
      { name: 'Quick arithmetic', desc: 'Check, compare and carry sums against the clock', ids: ['sum', 'compare', 'chain'] },
      { name: 'Patterns and rules', desc: 'Find the rule, then apply it', ids: ['series', 'matrix', 'odd', 'pattern'] },
      { name: 'Relations', desc: 'Combine statements to reach a conclusion', ids: ['relate', 'balance'] },
      { name: 'Test and deduce', desc: 'Gather clues, then reason to the answer. No clock', ids: ['probe', 'crack'] },
      { name: 'Plan', desc: 'Weigh deadlines and values to find the best order', ids: ['plan', 'hanoi', 'maze'] },
      { name: 'Puzzles', desc: 'Small puzzles with one right state to reach', ids: ['slide', 'toggle', 'latin', 'target'] },
      { name: 'Space and words', desc: 'Turn things in your head; rearrange letters', ids: ['compass', 'letters'] },
    ],
    routine: ['sum', 'series', 'relate'],
    benchmark: 'matrix',
  },
  dexterity: {
    about: 'The whole keyboard: find any key blind, press chords, type fast, and keep fingers independent.',
    groups: [
      { name: 'Find the key', desc: 'Reach the right key without looking', ids: ['hunt', 'flip', 'dial', 'arrows'] },
      { name: 'Together', desc: 'Several keys at the same instant', ids: ['chords'] },
      { name: 'Typing', desc: 'Words at speed, from sight and from memory', ids: ['type', 'ghost', 'reverse'] },
      { name: 'Finger control', desc: 'Patterns, counts and runs that train each finger', ids: ['fingers', 'sweep', 'taps', 'combo'] },
    ],
    routine: ['hunt', 'chords', 'type'],
    benchmark: 'hunt',
  },
};

/** Drills that are not about a minute long. */
export const DURATION: Record<string, string> = {
  away: '1.5 min',
  late: '2 min',
  remind: '1.5 min',
  pump: '1.5 min',
  alert: '2 min',
  clock: '2 min',
  except: '1.5 min',
  back: '3 min',
  stream: '2 min',
  climb: 'until you fall',
  strings: 'until the strings go slack',
  zigzag: 'until you hit a wall',
  twin: 'until you hit a wall',
  pole: 'until it falls',
  orbit: 'until three hits',
  split: 'until three hits',
  juggle: 'until a ball drops',
  hop: 'until you hit a block',
  lanes: 'until three hits',
  hurdles: 'until three hits',
  rush: 'until three hits',
  whack: 'until three misses',
  dodge: 'until three hits',
  rain: 'until three letters land',
  reflex: 'until three strikes',
  burst: 'until you drop twice',
  ladder: 'until you fall behind',
  tug: 'until you lose a round',
  sprint: '10 s',
  trill: '10 s',
  roll: '12 s',
  steady: '15 s',
  sets: '45 s',
  swerve: 'until three hits',
  catch: 'until three lives are gone',
  sort: 'until three wrong',
  shield: 'until three hits',
  tower: 'until a block misses',
  lander: 'until three crashes',
  route: 'until three wrong turns',
  probe: '3 to 5 min, no clock',
  plan: '3 to 5 min, no clock',
  crack: '3 to 8 min',
  keep: 'until three drops',
  compass: '75 s',
  mirror: '45 s',
  letters: '90 s',
  matrix: '2 to 4 min',
  balance: '2 to 4 min',
  series: '2 min',
  tangle: '2 min',
};

/** Drills too long for a quick session: kept out of Daily, Random and Endless runs. */
export const LONG = new Set(['probe', 'plan', 'crack', 'matrix', 'balance', 'back', 'alert', 'clock', 'stream', 'series', 'tangle']);

/** Whether a drill suits a quick mixed session. */
export function quick(id: string): boolean {
  return !LONG.has(id);
}

export function durationOf(id: string): string {
  return DURATION[id] ?? 'about 1 min';
}

/** Each game's standard length: a round count, or seconds for timed drills. Short is half, long double. */
export const ROUNDS: Record<string, [number, string]> = {
  again: [40, 'items'],
  aim: [30, 'targets'],
  alert: [120, 's'],
  away: [4, 'blocks'],
  back: [3, 'blocks'],
  balance: [12, 'puzzles'],
  bank: [15, 'bounces'],
  chain: [10, 'chains'],
  choice: [12, 'trials per block'],
  clock: [150, 'ticks'],
  code: [60, 's'],
  compare: [45, 's'],
  compass: [75, 's'],
  count: [24, 'trials'],
  crack: [5, 'codes'],
  cross: [20, 'trials'],
  dock: [60, 's'],
  drift: [40, 's'],
  ears: [30, 'trials'],
  exact: [10, 'rounds'],
  except: [72, 'digits'],
  find: [45, 's'],
  first: [28, 'races'],
  flank: [40, 'trials'],
  flicker: [10, 'pictures'],
  flow: [32, 'trials'],
  gap: [15, 'gaps'],
  glance: [24, 'trials'],
  goalie: [24, 'shots'],
  guess: [12, 'rounds'],
  hold: [8, 'rounds'],
  late: [24, 'runs'],
  letters: [90, 's'],
  lights: [10, 'starts'],
  line: [16, 'numbers'],
  link: [8, 'rounds'],
  longer: [30, 'trials'],
  matrix: [12, 'puzzles'],
  meet: [16, 'trials'],
  merge: [12, 'junctions'],
  middle: [15, 'trials'],
  mirror: [45, 's'],
  more: [30, 'trials'],
  odd: [60, 's'],
  offbeat: [32, 's'],
  opposite: [4, 'blocks'],
  parry: [32, 'attacks'],
  pitch: [30, 'trials'],
  plan: [8, 'puzzles'],
  pour: [10, 'glasses'],
  probe: [6, 'rules'],
  pump: [24, 'balloons'],
  relate: [16, 'puzzles'],
  remind: [60, 'numbers'],
  rotate: [30, 'trials'],
  running: [10, 'rounds'],
  second: [12, 'trials'],
  series: [12, 'puzzles'],
  sets: [4, 'sprints'],
  shadow: [60, 's'],
  shape: [40, 'trials'],
  shells: [12, 'rounds'],
  side: [40, 'trials'],
  snap: [15, 'trials'],
  spot: [36, 'trials'],
  stop: [40, 'trials'],
  stream: [20, 'runs'],
  sum: [60, 's'],
  swing: [20, 'trials'],
  switch: [48, 'trials'],
  sync: [24, 'drops'],
  tempo: [5, 'rounds'],
  where: [15, 'trials'],
};

/**
 * The length choices a game offers. Positive values scale the standard round count; a
 * negative value is a time limit in seconds; 0 is endless.
 */
export function lengthsFor(id: string): { value: number; label: string }[] {
  const r = ROUNDS[id];
  if (!r) return [];
  const timedGame = r[1] === 's';
  return [
    { value: 0.5, label: 'Short' },
    { value: 1, label: 'Standard' },
    { value: 2, label: 'Long' },
    ...(timedGame ? [] : [{ value: -60, label: '1 min' }, { value: -180, label: '3 min' }]),
    { value: 0, label: 'Endless' },
  ];
}

/** What a length value means for a game: "15 trials", "60 s", "1 min, as many as you can", "until you stop". */
export function roundsLabel(id: string, value: number): string {
  const r = ROUNDS[id];
  if (!r) return '';
  if (value === 0) return 'until you stop';
  if (value < 0) return 'as many as fit';
  const n = Math.max(2, Math.round(r[0] * value));
  return r[1] === 's' ? `${n} s` : `${n} ${r[1]}`;
}

/** Turn a length value into the game's scale and, for timed round games, a time limit (ms). */
export function lengthPlan(id: string, value: number): { scale: number; limitMs: number } {
  const r = ROUNDS[id];
  if (!r || value === 1) return { scale: 1, limitMs: 0 };
  if (value > 0) return { scale: value, limitMs: 0 };
  if (value === 0) return { scale: 200, limitMs: 0 };
  // Timed: a timed drill just runs for that long; a round game plays rounds until the clock ends it.
  return r[1] === 's' ? { scale: -value / r[0], limitMs: 0 } : { scale: 200, limitMs: -value * 1000 };
}
