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
      { name: 'React to a cue', desc: 'One signal, one press, as fast as you can', ids: ['snap', 'lights', 'ears', 'duel', 'alert'] },
      { name: 'Choose a response', desc: 'Several possible answers: pick the right one quickly', ids: ['choice', 'flank', 'aim', 'whack', 'reflex'] },
      { name: 'Hold back', desc: 'Stop a press you have already started', ids: ['stop', 'dodge'] },
      { name: 'Steer clear', desc: 'Move something out of the way in time', ids: ['swerve', 'shield', 'catch'] },
      { name: 'Runs', desc: 'Steer a rolling ball; the window to react is the difficulty', ids: ['lanes', 'hurdles', 'rush'] },
    ],
    routine: ['snap', 'choice', 'stop'],
    benchmark: 'snap',
  },
  speed: {
    about: 'Tap fast, hold a rate, and stay controlled and in order while you do.',
    groups: [
      { name: 'Peak rate', desc: 'How fast you can go, and how long it lasts', ids: ['sprint', 'sets', 'tug'] },
      { name: 'Controlled rate', desc: 'Hit and hold a target rate, no faster, no slower', ids: ['burst', 'ladder', 'pulse', 'steady', 'exact'] },
      { name: 'In order', desc: 'Speed across several keys without slipping', ids: ['roll', 'trill', 'rain'] },
    ],
    routine: ['sprint', 'steady', 'trill'],
    benchmark: 'sprint',
  },
  timing: {
    about: 'Press at exactly the right moment: on a beat, as something arrives, or after a set time.',
    groups: [
      { name: 'Keep a beat', desc: 'Hold a tempo, with and without the click', ids: ['tempo', 'offbeat', 'drift', 'even'] },
      { name: 'Intercept', desc: 'Time a press to something moving, even when it hides', ids: ['cross', 'swing', 'meet', 'hop', 'tower'] },
      { name: 'Reproduce', desc: 'Copy a duration or a rhythm from memory', ids: ['gap', 'second', 'echo'] },
    ],
    routine: ['tempo', 'cross', 'gap'],
    benchmark: 'tempo',
  },
  coordination: {
    about: 'Use both hands at once: separate jobs, shared rhythms, and exact togetherness.',
    groups: [
      { name: 'Two hands, two jobs', desc: 'Each hand steers its own thing', ids: ['split', 'twin', 'orbit', 'juggle', 'pole'] },
      { name: 'Fine control', desc: 'Move, brake and stop exactly where you mean to', ids: ['dock', 'lander'] },
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
      { name: 'Updating', desc: 'Keep what you hold current as new items arrive', ids: ['back', 'running'] },
      { name: 'Recognise and pair', desc: 'Seen it before? What went with it?', ids: ['spot', 'again', 'link'] },
    ],
    routine: ['digits', 'grid', 'running'],
    benchmark: 'digits',
  },
  attention: {
    about: 'Pick the signal out of the noise, follow it, and stay sharp when little happens.',
    groups: [
      { name: 'Filter', desc: 'Answer the right thing and ignore what pulls you away', ids: ['find', 'shape', 'side', 'switch', 'sort'] },
      { name: 'Follow', desc: 'Keep track of something as it moves or winds', ids: ['track', 'shells', 'tangle'] },
      { name: 'At a glance', desc: 'Take in a lot in one brief look', ids: ['glance', 'count', 'flicker', 'rotate'] },
      { name: 'Stay alert', desc: 'Catch the rare target in a long, dull stream', ids: ['stream', 'except', 'clock'] },
    ],
    routine: ['track', 'find', 'except'],
    benchmark: 'track',
  },
  judgement: {
    about: 'Size things up by eye: lengths, amounts, angles, shades and speeds.',
    groups: [
      { name: 'Size and amount', desc: 'Lengths, counts and midpoints', ids: ['longer', 'more', 'guess', 'middle'] },
      { name: 'Angle, shade, speed', desc: 'Including when the surroundings try to fool you', ids: ['tilt', 'shade', 'faster', 'first'] },
      { name: 'In motion', desc: 'Judge gaps and amounts as they change', ids: ['merge', 'pour'] },
    ],
    routine: ['longer', 'tilt', 'more'],
    benchmark: 'longer',
  },
  reasoning: {
    about: 'Think fast and stay right: arithmetic, patterns, rules and relations.',
    groups: [
      { name: 'Quick arithmetic', desc: 'Check and compare sums against the clock', ids: ['sum', 'compare'] },
      { name: 'Patterns and rules', desc: 'Find the rule, then apply it', ids: ['series', 'matrix', 'odd'] },
      { name: 'Relations', desc: 'Combine statements to reach a conclusion', ids: ['relate', 'balance'] },
    ],
    routine: ['sum', 'series', 'relate'],
    benchmark: 'matrix',
  },
};

/** Drills that are not about a minute long. */
export const DURATION: Record<string, string> = {
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
  matrix: '2 to 4 min',
  balance: '2 to 4 min',
  series: '2 min',
  tangle: '2 min',
};

export function durationOf(id: string): string {
  return DURATION[id] ?? 'about 1 min';
}
