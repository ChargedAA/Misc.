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
      { name: 'React to a cue', desc: 'One signal, one press, as fast as you can', ids: ['snap', 'lights', 'ears', 'duel', 'alert', 'ruler', 'edge'] },
      { name: 'Notice a change', desc: 'Catch something that creeps up rather than flashes', ids: ['dawn'] },
      { name: 'Choose a response', desc: 'Several possible answers: pick the right one quickly', ids: ['choice', 'flank', 'whack', 'reflex'] },
      { name: 'Hold back', desc: 'Stop, or override, the press you were about to make', ids: ['stop', 'swap', 'opposite', 'dodge', 'parry', 'goalie', 'volley', 'brake', 'twice'] },
      { name: 'Steer clear', desc: 'Move something out of the way in time', ids: ['swerve', 'shield', 'catch', 'flipper'] },
      { name: 'Runs', desc: 'Steer a rolling ball; the window to react is the difficulty', ids: ['lanes', 'hurdles', 'rush'] },
    ],
    routine: ['snap', 'choice', 'stop'],
    benchmark: 'snap',
  },
  speed: {
    about: 'Tap fast, hold a rate, and stay controlled and in order while you do.',
    groups: [
      { name: 'Peak rate', desc: 'How fast you can go, and how long it lasts', ids: ['sprint', 'sets', 'tug', 'pedal', 'ramp', 'shuttle', 'clicker'] },
      { name: 'Controlled rate', desc: 'Hit and hold a target rate, no faster, no slower', ids: ['burst', 'ladder', 'pulse', 'steady', 'exact'] },
      { name: 'In order', desc: 'Speed across several keys without slipping', ids: ['roll', 'trill', 'rain'] },
      { name: 'Speed of thought', desc: 'Turn what you see into the right press, fast', ids: ['code', 'match', 'parity', 'dots', 'alpha', 'warm', 'vowel'] },
    ],
    routine: ['sprint', 'steady', 'trill'],
    benchmark: 'sprint',
  },
  timing: {
    about: 'Press at exactly the right moment: on a beat, as something arrives, or after a set time.',
    groups: [
      { name: 'Keep a beat', desc: 'Hold a tempo, with and without the click', ids: ['tempo', 'offbeat', 'drift', 'even', 'shuffle', 'pace', 'carry', 'sustain'] },
      { name: 'Intercept', desc: 'Time a press to something moving, even when it hides', ids: ['cross', 'bounce', 'spin', 'pins', 'stack', 'golf', 'doors', 'ripple', 'cyclone', 'swing', 'meet', 'hop', 'tower', 'keep', 'bat', 'stamp', 'drive', 'hopper'] },
      { name: 'Reproduce', desc: 'Copy a duration or a rhythm from memory', ids: ['gap', 'second', 'echo', 'morse', 'rope'] },
      { name: 'Hear the timing', desc: 'Notice when a beat is off, by ear', ids: ['late', 'same'] },
      { name: 'Rhythm games', desc: 'Read a rhythm, or hit notes as they fall, in time', ids: ['sight', 'notes'] },
    ],
    routine: ['tempo', 'cross', 'gap'],
    benchmark: 'tempo',
  },
  coordination: {
    about: 'Use both hands at once: separate jobs, shared rhythms, and exact togetherness.',
    groups: [
      { name: 'Two hands, two jobs', desc: 'Each hand steers its own thing', ids: ['split', 'twin', 'orbit', 'juggle', 'pole', 'pat', 'rally', 'basins', 'runners', 'duo'] },
      { name: 'Vehicles', desc: 'Steer something with its own physics', ids: ['hitch', 'marble', 'ferry'] },
      { name: 'Steer', desc: 'Turn, carve and thread a path with momentum', ids: ['comet', 'slalom', 'row', 'drone', 'kite'] },
      { name: 'Fine control', desc: 'Move, brake and stop exactly where you mean to', ids: ['dock', 'lander', 'mirror', 'crane', 'etch', 'seesaw'] },
      { name: 'Rhythm across hands', desc: 'Patterns and tempos split between the hands', ids: ['sync', 'poly', 'drum', 'strings'] },
      { name: 'Full runs', desc: 'Everything at once, until you fall', ids: ['climb', 'zigzag', 'ship', 'straight'] },
    ],
    routine: ['sync', 'split', 'poly'],
    benchmark: 'sync',
  },
  memory: {
    about: 'Hold more in your head, keep it up to date, and remember where things were.',
    groups: [
      { name: 'Span', desc: 'How much you can hold and play back in order', ids: ['digits', 'sequence', 'path', 'order', 'melody', 'route', 'backward'] },
      { name: 'Places', desc: 'Where things were, even after the view turns', ids: ['grid', 'where', 'pairs', 'twist', 'rooms', 'hide'] },
      { name: 'Updating', desc: 'Keep what you hold current as new items arrive, or through a distraction', ids: ['back', 'running', 'hold', 'recent', 'bus'] },
      { name: 'Recognise and pair', desc: 'Seen it before? What went with it?', ids: ['spot', 'again', 'link', 'sounds', 'legend', 'tray', 'newest', 'source'] },
      { name: 'Lists', desc: 'Remember what came and in what order', ids: ['recall', 'queue', 'tag', 'shop'] },
      { name: 'Remember to act', desc: 'Keep an intention in mind while busy with something else', ids: ['remind', 'oven'] },
    ],
    routine: ['digits', 'grid', 'running'],
    benchmark: 'digits',
  },
  attention: {
    about: 'Pick the signal out of the noise, follow it, and stay sharp when little happens.',
    groups: [
      { name: 'Filter', desc: 'Answer the right thing and ignore what pulls you away', ids: ['find', 'shape', 'side', 'switch', 'sort', 'away', 'beeps', 'ink', 'camo', 'kinds', 'turned', 'wanted'] },
      { name: 'Follow', desc: 'Keep track of something as it moves or winds', ids: ['track', 'shells', 'tangle', 'shadow', 'fly', 'bounces'] },
      { name: 'At a glance', desc: 'Take in a lot in one brief look', ids: ['glance', 'count', 'flicker', 'rotate', 'schulte', 'blink', 'blinks', 'glimpse'] },
      { name: 'Monitor', desc: 'Keep several things in view and step in at the right moment', ids: ['gauges', 'tally', 'trail', 'radar', 'herd', 'mover', 'step', 'plates'] },
      { name: 'Stay alert', desc: 'Catch the rare target in a long, dull stream', ids: ['stream', 'except', 'clock'] },
      { name: 'Keep count', desc: 'Tally what flashes past, then report it', ids: ['deal'] },
      { name: 'Search', desc: 'Find the target on a busy page, or in the dark', ids: ['cancel', 'lantern', 'proof', 'diff', 'pictures'] },
    ],
    routine: ['track', 'find', 'except'],
    benchmark: 'track',
  },
  judgement: {
    about: 'Size things up by eye and ear: lengths, amounts, angles, paths, pitch.',
    groups: [
      { name: 'Size and amount', desc: 'Lengths, counts, midpoints, shares and numbers', ids: ['longer', 'more', 'guess', 'middle', 'line', 'angle', 'centroid', 'closer', 'share', 'curves', 'map', 'area', 'fit', 'dense', 'squeeze', 'arrange'] },
      { name: 'Angle, shade, motion', desc: 'Including when the surroundings try to fool you', ids: ['tilt', 'shade', 'faster', 'first', 'flow', 'align', 'illusion'] },
      { name: 'In motion', desc: 'Judge gaps, paths and amounts as they change', ids: ['merge', 'pour', 'bank', 'topple', 'hoop', 'carom', 'cannon', 'velo', 'race', 'lever', 'landing'] },
      { name: 'Time', desc: 'How long things last', ids: ['duration'] },
      { name: 'Colour', desc: 'See, remember and mix a colour exactly', ids: ['hue', 'mix'] },
      { name: 'Drawing eye', desc: 'Perspective and proportion, as artists judge them', ids: ['vanish', 'figure'] },
      { name: 'Know what you know', desc: 'Confidence that matches how often you are right', ids: ['sure', 'range'] },
      { name: 'Read a dial', desc: 'Clocks and gauges, quickly and exactly', ids: ['hands', 'meter'] },
      { name: 'Eyesight', desc: 'The faintest and finest you can see', ids: ['faint', 'vernier'] },
      { name: 'Risk', desc: 'Weigh chances and rewards: which bet is better?', ids: ['pump', 'jars'] },
    ],
    routine: ['longer', 'tilt', 'more'],
    benchmark: 'longer',
  },
  reasoning: {
    about: 'Think fast and stay right: numbers, patterns, rules, space and words.',
    groups: [
      { name: 'Quick arithmetic', desc: 'Check, compare, carry and estimate sums against the clock', ids: ['sum', 'compare', 'chain', 'ballpark', 'sevens', 'prime', 'fraction', 'rank', 'units', 'ten', 'percent', 'product', 'solve', 'operator', 'average'] },
      { name: 'Data and sets', desc: 'Read a chart; sort things by two rules at once', ids: ['graph', 'venn'] },
      { name: 'Logic', desc: 'True or false, from and, or and not', ids: ['logic'] },
      { name: 'Code', desc: 'Read a program and say what it does', ids: ['script'] },
      { name: 'Everyday sums', desc: 'Times, clocks and change, worked out in your head', ids: ['later', 'till', 'weekday', 'roman', 'binary', 'coins'] },
      { name: 'Words', desc: 'Read fast, find words, chain them', ids: ['rapid', 'relay'] },
      { name: 'Patterns and rules', desc: 'Find the rule, then apply it', ids: ['series', 'matrix', 'odd', 'pattern', 'triad', 'oddword', 'pyramid'] },
      { name: 'Relations', desc: 'Combine statements to reach a conclusion', ids: ['relate', 'balance'] },
      { name: 'Test and deduce', desc: 'Gather clues, then reason to the answer. No clock', ids: ['probe', 'crack'] },
      { name: 'Plan', desc: 'Weigh deadlines and values to find the best order', ids: ['plan', 'hanoi', 'maze', 'shortest'] },
      { name: 'Puzzles', desc: 'Small puzzles with one right state to reach', ids: ['slide', 'toggle', 'latin', 'target', 'pipes'] },
      { name: 'Space and words', desc: 'Turn things in your head; rearrange letters', ids: ['compass', 'letters', 'jumble', 'fold', 'symmetry', 'net', 'view', 'gears', 'dice', 'glass'] },
    ],
    routine: ['sum', 'series', 'relate'],
    benchmark: 'matrix',
  },
  dexterity: {
    about: 'The whole keyboard: find any key blind, press chords, type fast, and keep fingers independent.',
    groups: [
      { name: 'Find the key', desc: 'Reach the right key without looking', ids: ['hunt', 'flip', 'dial', 'arrows'] },
      { name: 'Together', desc: 'Several keys at the same instant', ids: ['chords'] },
      { name: 'Typing', desc: 'Words, code and numbers at speed, from sight and from memory', ids: ['type', 'ghost', 'reverse', 'syntax', 'entry', 'abc', 'caps', 'symbols'] },
      { name: 'Finger control', desc: 'Patterns, counts and runs that train each finger', ids: ['fingers', 'sweep', 'taps', 'combo', 'anchor', 'lefty'] },
    ],
    routine: ['hunt', 'chords', 'type'],
    benchmark: 'hunt',
  },
  ear: {
    about: 'Hear pitch: which is higher, which is in tune, which note, interval or chord.',
    groups: [
      { name: 'Higher or lower', desc: 'Fine differences in pitch and loudness', ids: ['pitch', 'intune', 'tune', 'louder', 'glide', 'sharp', 'accent'] },
      { name: 'Where and how long', desc: 'Which side a sound came from; which lasted longer', ids: ['pan', 'held'] },
      { name: 'Name it', desc: 'Octaves, notes and the distance between them', ids: ['octave', 'note', 'interval', 'retain'] },
      { name: 'Harmony and melody', desc: 'Chords, scales, the shape of a tune, and how many voices', ids: ['chord', 'scale', 'contour', 'voices', 'changed'] },
      { name: 'Rhythm by ear', desc: 'Hear a rhythm or a code and write it down', ids: ['dictate', 'copy', 'brisk', 'missing'] },
      { name: 'Listen closely', desc: 'Pick one faint sound out of many, or count them', ids: ['safe', 'clicks'] },
    ],
    routine: ['pitch', 'interval', 'chord'],
    benchmark: 'intune',
  },
  aim: {
    about: 'The mouse (or a finger): get to a target fast, click it exactly, stay on it as it moves, and aim in 3D.',
    groups: [
      { name: 'Flick', desc: 'Get there and click, fast', ids: ['flick', 'aim', 'pop', 'lead', 'gallery', 'shrink', 'trio', 'reset', 'cadence'] },
      { name: 'Precision', desc: 'Small targets, steady strokes, every click exact', ids: ['micro', 'round', 'wire', 'reflect', 'darts', 'drag', 'still', 'circle'] },
      { name: 'Tracking', desc: 'Stay on something that moves, or clear of it', ids: ['follow', 'swarm', 'balloon', 'slash'] },
      { name: '3D', desc: 'Mouse-look and a crosshair: flick and track', ids: ['sphere', 'strafe'] },
    ],
    routine: ['flick', 'follow', 'sphere'],
    benchmark: 'flick',
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
  round: [5, 'circles'],
  cannon: [15, 'shots'],
  pins: [120, 's'],
  darts: [12, 'darts'],
  graph: [12, 'charts'],
  map: [12, 'maps'],
  deal: [12, 'deals'],
  lantern: [12, 'rooms'],
  area: [30, 'pairs'],
  same: [16, 'pairs'],
  ferry: [10, 'crossings'],
  pan: [30, 'tones'],
  held: [30, 'pairs'],
  abc: [5, 'runs'],
  anchor: [16, 'patterns'],
  legend: [4, 'sets'],
  rooms: [12, 'houses'],
  shrink: [30, 'targets'],
  dawn: [12, 'trials'],
  edge: [24, 'dots'],
  glide: [30, 'tones'],
  tray: [12, 'trays'],
  brisk: [30, 'pairs'],
  golf: [12, 'holes'],
  proof: [15, 'lines'],
  tag: [10, 'lists'],
  brake: [24, 'events'],
  fit: [12, 'pairs'],
  diff: [16, 'pairs'],
  recent: [20, 'questions'],
  drag: [20, 'pieces'],
  still: [15, 'circles'],
  doors: [15, 'doors'],
  mover: [15, 'fields'],
  dense: [30, 'pairs'],
  missing: [16, 'runs'],
  circle: [10, 'circles'],
  basins: [12, 'rounds'],
  blinks: [12, 'bursts'],
  ripple: [20, 'rings'],
  squeeze: [30, 'blocks'],
  twice: [30, 'flashes'],
  illusion: [30, 'pairs'],
  glimpse: [20, 'words'],
  carry: [16, 'runs'],
  bounces: [10, 'runs'],
  velo: [12, 'rounds'],
  reset: [25, 'targets'],
  sharp: [16, 'tones'],
  race: [24, 'races'],
  shop: [8, 'lists'],
  step: [20, 'sets'],
  cyclone: [20, 'tries'],
  lever: [12, 'beams'],
  pictures: [15, 'pairs'],
  source: [10, 'lists'],
  sustain: [16, 'holds'],
  accent: [24, 'runs'],
  landing: [12, 'throws'],
  hide: [12, 'grids'],
  retain: [20, 'trials'],
  cadence: [40, 'targets'],
  bus: [10, 'trips'],
  arrange: [16, 'sets'],
  shortest: [12, 'maps'],
  clicks: [15, 'bursts'],
  entry: [60, 's'],
  rank: [60, 's'],
  curves: [30, 'pairs'],
  till: [12, 'customers'],
  share: [15, 'charts'],
  cancel: [3, 'sheets'],
  later: [12, 'questions'],
  carom: [12, 'shots'],
  prime: [60, 's'],
  fraction: [60, 's'],
  marble: [120, 's'],
  spin: [20, 'shots'],
  turned: [40, 'words'],
  gears: [20, 'trains'],
  pipes: [120, 's'],
  safe: [120, 's'],
  rapid: [10, 'passages'],
  relay: [90, 's'],
  kinds: [60, 's'],
  view: [16, 'plans'],
  pat: [4, 'rounds'],
  copy: [120, 's'],
  net: [16, 'nets'],
  herd: [6, 'rounds'],
  camo: [20, 'fields'],
  mix: [8, 'colours'],
  vanish: [10, 'scenes'],
  pace: [10, 'beats'],
  voices: [30, 'chords'],
  triad: [90, 's'],
  oven: [120, 's'],
  sure: [40, 'pairs'],
  range: [15, 'clouds'],
  figure: [10, 'tasks'],
  shuffle: [8, 'grooves'],
  reflect: [2, 'stars'],
  sevens: [60, 's'],
  hands: [12, 'clocks'],
  meter: [12, 'readings'],
  ballpark: [30, 'sums'],
  jars: [30, 'picks'],
  blink: [24, 'streams'],
  syntax: [60, 's'],
  hitch: [120, 's'],
  wire: [3, 'wires'],
  bounce: [8, 'drops'],
  lead: [30, 'discs'],
  swap: [60, 'arrows'],
  louder: [30, 'pairs'],
  faint: [36, 'patches'],
  vernier: [36, 'pairs'],
  sphere: [45, 's'],
  strafe: [30, 's'],
  follow: [30, 's'],
  flick: [30, 'targets'],
  micro: [30, 'targets'],
  ink: [40, 'words'],
  hue: [12, 'colours'],
  jumble: [90, 's'],
  notes: [60, 's'],
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
  tilt: [30, 'trials'],
  faster: [30, 'trials'],
  shade: [30, 'trials'],
  hunt: [30, 'letters'],
  chords: [24, 'chords'],
  type: [50, 'words'],
  dial: [16, 'numbers'],
  fingers: [5, 'patterns'],
  flip: [30, 'keys'],
  sweep: [9, 'sweeps'],
  ghost: [16, 'words'],
  taps: [14, 'rounds'],
  arrows: [16, 'rounds'],
  reverse: [14, 'words'],
  combo: [14, 'combos'],
  schulte: [3, 'tables'],
  trail: [3, 'boards'],
  maze: [5, 'mazes'],
  hanoi: [3, 'towers'],
  slide: [4, 'puzzles'],
  toggle: [5, 'puzzles'],
  latin: [4, 'puzzles'],
  target: [10, 'targets'],
  gauges: [60, 's'],
  tally: [8, 'rounds'],
  angle: [14, 'trials'],
  duration: [14, 'trials'],
  centroid: [14, 'clouds'],
  align: [10, 'lines'],
  closer: [30, 'trials'],
  topple: [24, 'stacks'],
  recall: [4, 'lists'],
  queue: [14, 'queues'],
  beeps: [12, 'rounds'],
  sounds: [2, 'boards'],
  tune: [10, 'tones'],
  pattern: [12, 'puzzles'],
  ruler: [12, 'catches'],
  bat: [20, 'pitches'],
  fly: [45, 's'],
  radar: [60, 's'],
  stamp: [30, 'boxes'],
  drive: [10, 'shots'],
  hoop: [15, 'shots'],
  morse: [14, 'letters'],
  etch: [4, 'paths'],
  row: [60, 's'],
  crane: [8, 'crates'],
  pedal: [45, 's'],
  intune: [24, 'notes'],
  octave: [16, 'notes'],
  note: [20, 'notes'],
  interval: [20, 'questions'],
  chord: [16, 'chords'],
  contour: [14, 'melodies'],
  scale: [16, 'scales'],
};

/**
 * The length choices a game offers. Positive values scale the standard round count; a
 * negative value is a time limit in seconds; 0 is endless.
 */
/**
 * Games that can be played until three mistakes: they have rounds, and they say when you get one
 * wrong (the mistake sound), which is what the framework counts. Length value -1.
 */
export const LIVES: ReadonlySet<string> = new Set(['snap', 'stop', 'flank', 'back', 'switch', 'choice', 'shape', 'aim', 'rotate', 'count', 'glance', 'spot', 'stream', 'side', 'where', 'flicker', 'meet', 'longer', 'more', 'middle', 'tilt', 'faster', 'shade', 'series', 'relate', 'matrix', 'balance', 'running', 'exact', 'ears', 'guess', 'shells', 'again', 'link', 'except', 'sync', 'lights', 'first', 'merge', 'pour', 'probe', 'plan', 'crack', 'pitch', 'bank', 'opposite', 'line', 'hold', 'chain', 'flow', 'away', 'late', 'remind', 'parry', 'goalie', 'hunt', 'chords', 'dial', 'fingers', 'flip', 'sweep', 'ghost', 'taps', 'arrows', 'reverse', 'combo', 'schulte', 'trail', 'maze', 'hanoi', 'slide', 'toggle', 'latin', 'target', 'tally', 'closer', 'topple', 'recall', 'queue', 'beeps', 'pattern', 'ruler', 'bat', 'stamp', 'morse', 'crane', 'intune', 'octave', 'note', 'interval', 'chord', 'contour', 'scale', 'ink', 'swap', 'louder', 'faint', 'vernier', 'ballpark', 'jars', 'twist', 'script', 'camo', 'triad', 'fold', 'symmetry', 'turned', 'gears']);

/** The length value for "until three mistakes". */
export const LIVES_LEN = -1;

export function lengthsFor(id: string): { value: number; label: string }[] {
  const r = ROUNDS[id];
  if (!r) return [];
  const timedGame = r[1] === 's';
  return [
    ...(LIVES.has(id) ? [{ value: LIVES_LEN, label: '3 lives' }] : []),
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
  if (value === LIVES_LEN) return 'until 3 mistakes';
  if (value < 0) return 'as many as fit';
  const n = Math.max(2, Math.round(r[0] * value));
  return r[1] === 's' ? `${n} s` : `${n} ${r[1]}`;
}

/** Turn a length value into the game's scale and, for timed round games, a time limit (ms). */
export function lengthPlan(id: string, value: number): { scale: number; limitMs: number } {
  const r = ROUNDS[id];
  if (!r || value === 1) return { scale: 1, limitMs: 0 };
  if (value > 0) return { scale: value, limitMs: 0 };
  if (value === 0 || value === LIVES_LEN) return { scale: 200, limitMs: 0 };
  // Timed: a timed drill just runs for that long; a round game plays rounds until the clock ends it.
  return r[1] === 's' ? { scale: -value / r[0], limitMs: 0 } : { scale: 200, limitMs: -value * 1000 };
}

/** Games that cannot be played without sound. */
export const NEEDS_SOUND: ReadonlySet<string> = new Set(['retain', 'same', 'pan', 'held', 'glide', 'brisk', 'missing', 'sharp', 'accent', 'pitch', 'tune', 'intune', 'octave', 'note', 'interval', 'chord', 'contour', 'scale', 'louder', 'voices', 'pace', 'shuffle', 'dictate', 'copy', 'pat', 'safe', 'changed', 'clicks', 'ears', 'late', 'beeps', 'sounds', 'melody', 'offbeat', 'echo', 'tempo']);
