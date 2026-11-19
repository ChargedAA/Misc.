// Application shell: screens, keyboard and touch input, the rAF loop and persistence.

import './style.css';
import {
  SND_BURST_OK,
  SND_CATCH,
  SND_FALL,
  SND_FALSE,
  SND_LURCH,
  SND_RING,
  SND_SURGE,
  SND_TAP_L,
  SND_TAP_R,
  SND_TAP_WEAK,
  SND_UI,
  Sfx,
} from './audio.ts';
import { COL_MID, SLOT_REFLEX, getMode } from './config.ts';
import { ACT_REFLEX, Runner } from './loop.ts';
import { OUT_CORRECT, OUT_EARLY, OUT_LATE, OUT_START, OUT_WRONG, ReflexSession } from './reflex.ts';
import { View, type Hints, type PerfStats } from './render.ts';
import {
  BURST_ACTIVE,
  BURST_LEADIN,
  FX_BURST_OK,
  FX_CATCH,
  FX_DUD,
  FX_FALL,
  FX_FALSE,
  FX_LURCH,
  FX_RING,
  FX_SURGE,
  PHASE_OVER,
  PHASE_READY,
  PHASE_RUN,
  Sim,
} from './sim.ts';
import { cpsStats, histogram, rtStats } from './stats.ts';
import {
  RESERVED,
  addRecord,
  bindingsFor,
  clearHistory,
  defaultBindings,
  keyLabel,
  loadHistory,
  loadSettings,
  saveSettings,
  type GameId,
  type RunRecord,
} from './storage.ts';
import { HIT_CORNER, TouchLayout } from './touch.ts';
import { CpsTrainer } from './trainers.ts';
import { MINIS, dailySet, entry } from './minis/index.ts';
import { SKILLS } from './minis/kit.ts';
import { GUIDES, durationOf, lengthPlan, lengthsFor, quick } from './minis/groups.ts';
import { SoundCheck } from './minis/soundcheck.ts';
import { clamp, clockShift, keysFor, picksKeys, setClockShift, setLengthScale, type Mini, type MiniDef } from './minis/kit.ts';
import { Ui, handKeys, readyHtml, keysLine, streak, cpsResultsHtml, dailySummaryHtml, formatPrimary, miniResultsHtml, type DailyRow, keysHtml, pauseHtml, miniPauseHtml, reflexResultsHtml, resultsHtml } from './ui.ts';
import { GROUPS, columnsHtml, customMenu, dailyMenu, gameMenu, gameStatsMenu, groupMenu, randomMenu, settingsMenu, skillMenu, startMenu, statsMenu, type Menu, type MenuCtx } from './menus.ts';

type Screen =
  | 'menu'
  | 'play'
  | 'pause'
  | 'results'
  | 'reflex'
  | 'reflexResults'
  | 'burst'
  | 'burstResults'
  | 'mini'
  | 'miniResults'
  | 'miniPause'
  | 'ready'
  | 'keys';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const view = new View(canvas);
const sfx = new Sfx();
const sim = new Sim();
const runner = new Runner(sim);
const reflex = new ReflexSession();
const cpsTrainer = new CpsTrainer();
const touch = new TouchLayout();
const ui = new Ui(document.getElementById('ui')!, onAction);

const settings = loadSettings();
sfx.muted = settings.muted;
sfx.volume = settings.volume ?? 0.8;
let history = loadHistory();

let screen: Screen = 'menu';
/** Game whose key-count pop-out is open on the title screen. */
/** The menu stack: the last entry is on screen. Kinds: start, group, skill, game, stats, gamestats, settings. */
interface NavEntry {
  kind: string;
  arg: string;
  page: number;
  /** The item chosen in this column when a deeper one is open. */
  sel?: string;
}
let nav: NavEntry[] = [{ kind: 'start', arg: '', page: 0 }];
let lastGame: GameId = 'climb';
/** The mini-game in progress, if any. */
let mini: Mini | null = null;
/** The daily set in progress: game ids, which one we are on, and results so far. */
let dailyQueue: string[] | null = null;
let dailyIdx = 0;
let dailyRows: DailyRow[] = [];
/** An endless run's scope ('all', or a group id): games keep coming until you end it. */
let endlessScope: string | null = null;
/** 'Daily set', or e.g. 'Memory set' for three random games of one skill. */
let queueLabel = 'Daily set';
let miniDef: MiniDef | null = null;
/** Presses, taps and typed keys in the current mini-game. */
let miniInputs = 0;
/** A practice run: played and shown, never saved. */
let practicing = false;
/** Key count of the session in progress. */
let activeKeys = settings.keys.climb ?? 2;
/** Key count shown on the rebinding screen. */
let bindKeys = settings.keys.climb ?? 2;
/** Key-count filter on a game's stats page (0 = all). */
let gsFilter = 0;
let listening = '';
/** Ignore menu keys until this time, so mashing through an ending does not skip the results. */
let inputLockUntil = 0;

/** code -> slot: 0..5 lift (side * 3 + key), 6 reflex. */
const keymap = new Map<string, number>();
/** Label of each slot, indexed by slot. */
const slotLabels: string[] = ['', '', '', '', '', '', ''];
/** Labels of the lift keys in play, left hand first (for the stats tables). */
let liftLabels: string[] = [];
const hints: Hints = { left: '', right: '', center: '', sub: '' };
const lastKey = new Int8Array(2);
/** Slot + 1 held by each active pointer, by pointerId. */
const pointerSlot = new Int8Array(64);

const perf: PerfStats = { show: false, fps: 0, frameMs: 0, maxMs: 0, ticks: 0 };
let looping = false;
let rafId = 0;
// Frame timing lives in a typed array: doubles kept in module-level `let`s are
// re-boxed on every write, which would be the only garbage the loop makes.
const clock = new Float64Array(5);
const LAST = 0;
const SUM = 1;
const MAX = 2;
const COUNT = 3;
const SAMPLED_AT = 4;

// --- Keys -------------------------------------------------------------------------

function applyKeys(count: number, game = ''): void {
  activeKeys = count;
  const mode = getMode(count);
  const b = game ? bindingsFor(settings, game, count) : settings.bindings[count]!;
  keymap.clear();
  slotLabels.fill('');
  liftLabels = [];
  b.left.forEach((code, i) => {
    keymap.set(code, i);
    slotLabels[i] = keyLabel(code);
    liftLabels.push(slotLabels[i]!);
  });
  b.right.forEach((code, i) => {
    keymap.set(code, 3 + i);
    slotLabels[3 + i] = keyLabel(code);
    liftLabels.push(slotLabels[3 + i]!);
  });
  if (b.reflex) {
    keymap.set(b.reflex, SLOT_REFLEX);
    slotLabels[SLOT_REFLEX] = keyLabel(b.reflex);
  }
  touch.build(mode, slotLabels, view.w, view.h, view.dpr);
  refreshHints();
}

/** The how-to lines under the beam before a run starts. */
function refreshHints(): void {
  const mode = getMode(activeKeys);
  const b = settings.bindings[activeKeys]!;
  const left = b.left.map(keyLabel).join('  ');
  const right = b.right.map(keyLabel).join('  ');
  const pads = touch.active;
  if (mode.right === 0) {
    hints.left = hints.right = '';
    hints.center = pads ? 'tap: surge over holes' : `${left}  surge over holes`;
    hints.sub = 'orange cable: press once \u00b7 grey: hold still';
  } else {
    hints.left = pads ? 'dash left' : `${left}  dash left`;
    hints.right = pads ? 'dash right' : `dash right  ${right}`;
    hints.center = 'both sides: surge';
    hints.sub = (mode.reflex && b.reflex ? `orange cable: ${keyLabel(b.reflex)}` : 'orange cable: tap that side') + ' \u00b7 grey: hold still';
  }
}

function best(kind: RunRecord['kind'], keys: number, field: 'score' | 'target'): RunRecord | null {
  let top: RunRecord | null = null;
  for (const r of history) {
    if (r.kind === kind && r.mode === keys && (top === null || (r[field] ?? 0) > (top[field] ?? 0))) top = r;
  }
  return top;
}

function bestFor(game: GameId, keys: number): RunRecord | null {
  if (game === 'climb') return best('run', keys, 'score');
  if (game === 'reflex') return best('rt', keys, 'score');
  if (game === 'burst') return best('cps', keys, 'target');
  const e = entry(game);
  const anyKeys = e ? !picksKeys(game, e.input) : false;
  let top: RunRecord | null = null;
  for (const r of history) {
    if (r.kind === 'mini' && r.game === game && (anyKeys || r.mode === keys) && (top === null || (r.score ?? 0) > (top.score ?? 0))) top = r;
  }
  return top;
}

// --- Loop -------------------------------------------------------------------------

function startLoop(): void {
  if (looping) return;
  looping = true;
  clock[LAST] = 0;
  rafId = requestAnimationFrame(frame);
}

function stopLoop(): void {
  looping = false;
  cancelAnimationFrame(rafId);
}

function frame(now: number): void {
  if (!looping) return;
  rafId = requestAnimationFrame(frame);

  if (clock[LAST]! > 0) {
    const d = now - clock[LAST]!;
    clock[SUM]! += d;
    clock[COUNT]!++;
    if (d > clock[MAX]!) clock[MAX] = d;
    if (now - clock[SAMPLED_AT]! >= 250) {
      perf.frameMs = clock[SUM]! / clock[COUNT]!;
      perf.fps = 1000 / perf.frameMs;
      perf.maxMs = clock[MAX]!;
      clock[SUM] = 0;
      clock[COUNT] = 0;
      clock[MAX] = 0;
      clock[SAMPLED_AT] = now;
    }
  }
  clock[LAST] = now;

  if (screen === 'play') {
    runner.frame(now);
    perf.ticks = runner.lastTicks;
    const fx = sim.fx;
    if (fx !== 0) {
      sim.fx = 0;
      playFx(fx);
    }
    view.drawGame(sim, runner.alpha, now, hints, touch);
    view.drawPerf(perf);
    if (sim.phase === PHASE_OVER) finishRun();
  } else if (screen === 'reflex') {
    const done = reflex.update(now);
    reflex.draw(now, view, touch);
    view.drawPerf(perf);
    if (done) finishReflex();
  } else if (screen === 'burst') {
    const done = cpsTrainer.frame(now, view, touch);
    view.drawPerf(perf);
    if (done) finishBurst();
  } else if (screen === 'mini' && mini) {
    const done = mini.frame(now - clockShift(), view, touch);
    // Timed and endless play: a countdown, or a reminder of how to stop, at the top.
    if (miniLimit || lengthValue === 0) {
      const left = miniLimit - (now - clockShift() - miniStartAt);
      view.ctx.fillStyle = COL_MID;
      view.text(miniLimit ? `${Math.floor(Math.max(0, left) / 60000)}:${String(Math.ceil(Math.max(0, left) / 1000) % 60).padStart(2, '0')} left` : 'endless · esc to finish', view.ox, 22 * view.dpr, view.fontTiny, 'center');
      if (miniLimit && left <= 0) {
        finishMini();
        return;
      }
    }
    view.drawPerf(perf);
    if (done) finishMini();
  }
}

function playFx(fx: number): void {
  if (fx & FX_FALL) sfx.play(SND_FALL);
  else if (fx & FX_LURCH) sfx.play(SND_LURCH);
  if (fx & FX_SURGE) sfx.play(SND_SURGE);
  if (fx & FX_DUD) sfx.play(SND_TAP_WEAK);
  if (fx & FX_CATCH) sfx.play(SND_CATCH);
  if (fx & FX_FALSE) sfx.play(SND_FALSE);
  if (fx & FX_BURST_OK) sfx.play(SND_BURST_OK);
  if (fx & FX_RING) sfx.play(SND_RING + Math.max(0, sim.chain - 1));
}

// --- Screens ----------------------------------------------------------------------

function sameDay(a: number, b: number): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

/** Per game: the difficulty last played, and the custom difficulty. Kept in this browser. */
function loadMap(key: string): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}
function saveMap(key: string, m: Record<string, number>): void {
  try {
    localStorage.setItem(key, JSON.stringify(m));
  } catch {
    // Private mode: not remembered.
  }
}
const levels = loadMap('tension.levels');
const customLevels = loadMap('tension.custom');
/** Difficulty for the game being started (0 = progressing). */
let currentLevel = 0;

function menuCtx(): MenuCtx {
  const bests: Record<string, number> = {};
  for (const r of history) {
    const id = r.kind === 'run' ? 'climb' : r.kind === 'rt' ? 'reflex' : r.kind === 'cps' ? 'burst' : (r.game ?? '');
    const v = r.kind === 'cps' ? (r.target ?? 0) : (r.score ?? 0);
    if (v > (bests[id] ?? 0)) bests[id] = v;
  }
  const now = Date.now();
  let dailyDone: number | null = null;
  const today: Record<string, RunRecord> = {};
  for (const r of history) {
    if (r.kind !== 'mini' || !sameDay(r.at, now)) continue;
    if (r.game === 'daily') dailyDone = Math.max(dailyDone ?? 0, r.score ?? 0);
    else if (r.game) today[r.game] = r;
  }
  return { settings, history, bests, daily: dailySet(), dailyDone, today, streak: streak(history), perf: perf.show, levels, custom: customLevels, bestFor: (id, k) => bestFor(id as GameId, k) };
}

function buildMenu(n: NavEntry): Menu {
  const c = menuCtx();
  switch (n.kind) {
    case 'group':
      return groupMenu(c, n.arg);
    case 'skill':
      return skillMenu(c, n.arg);
    case 'game':
      return gameMenu(c, n.arg);
    case 'stats':
      return statsMenu(c, n.page);
    case 'gamestats':
      return gameStatsMenu(c, n.arg, gsFilter);
    case 'settings':
      return settingsMenu(c, soundCheckNote);
    case 'daily':
      return dailyMenu(c);
    case 'random':
      return randomMenu();
    case 'endless':
      return randomMenu();
    case 'gamekeys': {
      const [id, lv] = n.arg.split(':');
      return gameMenu(c, id!, Number(lv) || 0);
    }
    case 'custom':
      return customMenu(c, n.arg);
    default:
      return startMenu(c);
  }
}

/** Draw the menu on top of the stack. `dir` picks the slide: 1 forward, -1 back, 0 none. */
function showMenu(dir = 0): void {
  stopLoop();
  screen = 'menu';
  listening = '';
  ui.show(columnsHtml(nav.map((n) => ({ menu: buildMenu(n), sel: n.sel })), dir));
}

function go(target: string): void {
  const i = target.indexOf(':');
  const kind = i < 0 ? target : target.slice(0, i);
  const arg = i < 0 ? '' : target.slice(i + 1);
  if (kind === 'gamestats') gsFilter = 0;
  nav[nav.length - 1]!.sel = target;
  nav.push({ kind, arg, page: 0 });
  showMenu(1);
}

function back(): void {
  if (nav.length > 1) nav.pop();
  nav[nav.length - 1]!.sel = undefined;
  showMenu(-1);
}

/** Close the columns deeper than `level`. */
function truncate(level: number): void {
  nav.length = Math.max(1, Math.min(nav.length, level + 1));
  nav[nav.length - 1]!.sel = undefined;
}

function startDaily(): void {
  endlessScope = null;
  dailyQueue = dailySet();
  queueLabel = 'Daily set';
  dailyIdx = 0;
  dailyRows = [];
  showReady();
}

function nextDaily(): void {
  if (!dailyQueue) return;
  dailyIdx++;
  if (dailyIdx < dailyQueue.length) {
    showReady();
    return;
  }
  const total = dailyRows.reduce((s, r) => s + (r.saved ? r.score : 0), 0);
  let bestTotal = 0;
  // A day counts only if at least one stage was played properly.
  if (queueLabel === 'Daily set' && dailyRows.some((r) => r.saved)) {
    for (const r of history) if (r.kind === 'mini' && r.game === 'daily') bestTotal = Math.max(bestTotal, r.score ?? 0);
    history = addRecord({ kind: 'mini', game: 'daily', at: Date.now(), mode: 0, time: 0, score: total, value: total, vlabel: 'day total', unit: '' });
  }
  dailyQueue = null;
  screen = 'miniResults';
  inputLockUntil = performance.now() + 750;
  ui.show(dailySummaryHtml(dailyRows, total, Math.max(bestTotal, total), queueLabel));
}

/**
 * Random games back to back, like the daily set. `spec` is "scope:count": scope is
 * 'all', a group, a skill, or 'each' (one from every skill).
 */
function startQuick(spec: string): void {
  const [scope = 'all', countText = '3'] = spec.split(':');
  const count = Math.max(1, Number(countText) || 3);
  const shuffled = <T,>(list: T[]): T[] => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j]!, list[i]!];
    }
    return list;
  };
  endlessScope = scope === 'endless' ? (countText || 'all') : null;
  const group = GROUPS.find((g) => g.id === (endlessScope ?? scope));
  const skill = SKILLS.find((k) => k.id === scope);
  let queue: string[];
  // Sets use the mini-games only: Climb, Reflex and Burst have their own result screens.
  if (scope === 'each') queue = shuffled(SKILLS.map((k) => shuffled(MINIS.filter((e) => e.skill === k.id && quick(e.id)))[0]!.id));
  else if (endlessScope) queue = [pickNext([])];
  else {
    const pool = MINIS.filter((e) => quick(e.id) && (scope === 'all' || (group ? group.skills.includes(e.skill) : e.skill === scope))).map((e) => e.id);
    queue = shuffled(pool).slice(0, count);
  }
  if (!queue.length) return;
  dailyQueue = queue;
  queueLabel = endlessScope ? 'Endless run' : `${group ? group.name : skill ? skill.name : scope === 'each' ? 'Mixed' : 'Random'} set`;
  dailyIdx = 0;
  dailyRows = [];
  showReady();
}

/** The next game of an endless run: random, within its scope, and none of the last eight. */
function pickNext(recent: readonly string[]): string {
  const group = GROUPS.find((g) => g.id === endlessScope);
  const pool = MINIS.filter((e) => quick(e.id) && (!group || group.skills.includes(e.skill))).map((e) => e.id);
  const fresh = pool.filter((id) => !recent.slice(-8).includes(id));
  const from = fresh.length ? fresh : pool;
  return from[Math.floor(Math.random() * from.length)]!;
}

/** Before each drill of a set: what it is and how to play, so the clock never runs while you read. */
function showReady(): void {
  if (!dailyQueue) return;
  const id = dailyQueue[dailyIdx]!;
  const e = entry(id);
  if (!e) return;
  stopLoop();
  screen = 'ready';
  inputLockUntil = performance.now() + 250;
  const keys = keysFor(id, e.input, settings.keys[id]);
  ui.show(
    readyHtml({
      label: queueLabel,
      index: dailyIdx + 1,
      total: endlessScope ? 0 : dailyQueue.length,
      name: e.name,
      skill: SKILLS.find((k) => k.id === e.skill)?.name ?? '',
      blurb: e.blurb,
      how: e.def ? e.def.how : '',
      controls: e.input === 'pointer' ? 'Click or tap' : e.input === 'type' ? 'A full keyboard' : `${keysLine(keys, bindingsFor(settings, id, keys))}${e.input === 'both' ? ' &nbsp; or tap' : ''}`,
      length: durationOf(id),
      hands: e.input === 'pointer' || e.input === 'type' ? undefined : handKeys(keys, bindingsFor(settings, id, keys)),
    }),
  );
}

/** Skip the drill on the ready screen: it counts as incomplete. */
function skipDrill(): void {
  if (!dailyQueue) return;
  const id = dailyQueue[dailyIdx]!;
  const e = entry(id);
  dailyRows.push({ id, name: e?.name ?? id, skill: e?.skill ?? '', score: 0, primary: '', best: false, saved: false, skipped: true });
  if (endlessScope && dailyIdx + 1 >= dailyQueue.length) dailyQueue.push(pickNext(dailyQueue));
  nextDaily();
}

/** End an endless run (or any set) early and show what it came to. */
function endRun(): void {
  if (!dailyQueue) return;
  const total = dailyRows.reduce((sum, r) => sum + (r.saved ? r.score : 0), 0);
  const label = queueLabel;
  dailyQueue = null;
  endlessScope = null;
  screen = 'miniResults';
  inputLockUntil = performance.now() + 750;
  ui.show(dailySummaryHtml(dailyRows, total, total, label));
}

function startGame(game: GameId): void {
  lastGame = game;
  // Sets (daily, random) play games with levels at their progressing difficulty.
  if (dailyQueue) currentLevel = 0;
  const e = entry(game);
  applyKeys(e ? keysFor(game, e.input, settings.keys[game]) : (settings.keys[game] ?? 2), game);
  pointerSlot.fill(0);
  ui.hide();
  if (e?.def) {
    // Pointer games take taps anywhere, so they show no pads.
    if (e.input !== 'keys') touch.padsOff();
    miniDef = e.def;
    miniInputs = 0;
    setClockShift(0);
    // Sets always play the standard length, so a day's set stays comparable with the last.
    lengthValue = dailyQueue ? 1 : (settings.lengths?.[game] ?? 1);
    const plan = lengthPlan(game, lengthValue);
    setLengthScale(plan.scale);
    miniLimit = plan.limitMs;
    mini = e.def.make();
    miniStartAt = performance.now();
    mini.start({ mode: getMode(activeKeys), labels: slotLabels, sound: (id) => sfx.play(id), soundAt: (id, d) => sfx.play(id, d), latency: settings.muted ? 0 : sfx.latencyMs() + (settings.audioOffset ?? 0), tone: (hz, d, pan) => sfx.tone(hz, d, pan), muted: settings.muted, level: e.def.levels ? currentLevel : undefined }, performance.now());
    screen = 'mini';
  } else if (game === 'climb') {
    sim.reset(activeKeys, (Math.random() * 0x100000000) >>> 0);
    runner.restart();
    lastKey[0] = lastKey[1] = -1;
    screen = 'play';
  } else if (game === 'reflex') {
    reflex.start(getMode(activeKeys), slotLabels, performance.now());
    screen = 'reflex';
  } else {
    cpsTrainer.start(getMode(activeKeys), liftLabels, performance.now());
    screen = 'burst';
  }
  startLoop();
}

function pause(): void {
  if (screen !== 'play') return;
  if (sim.phase === PHASE_READY) {
    showMenu();
    return;
  }
  if (sim.phase !== PHASE_RUN) return;
  runner.freeze(performance.now());
  stopLoop();
  screen = 'pause';
  ui.show(pauseHtml(settings.muted), true);
}

function resume(): void {
  if (screen !== 'pause') return;
  screen = 'play';
  ui.hide();
  runner.thaw(performance.now());
  startLoop();
}

/** The corner button, or Escape: pause a run, end a training session. */
function leave(): void {
  if (screen === 'play') pause();
  else if (screen === 'reflex') finishReflex();
  else if (screen === 'burst') finishBurst();
  else if (screen === 'mini') pauseMini();
}

let pausedAt = 0;
/** The length value this drill is played at (see lengthsFor), its time limit (ms, 0 for none) and its start on the game clock. */
let lengthValue = 1;
let miniLimit = 0;
let miniStartAt = 0;

/** Escape in a drill: stop the game clock and the audio, and offer the ways out. */
function pauseMini(): void {
  if (screen !== 'mini' || !mini || !miniDef) return;
  pausedAt = performance.now();
  // Let go of anything held, so nothing is stuck down on return.
  for (let slot = 0; slot <= SLOT_REFLEX; slot++) mini.release?.(slot, pausedAt - clockShift());
  pointerSlot.fill(0);
  stopLoop();
  sfx.suspend();
  screen = 'miniPause';
  inputLockUntil = performance.now() + 200;
  ui.show(miniPauseHtml(miniDef.name, !!dailyQueue, practicing));
}

function resumeMini(): void {
  if (screen !== 'miniPause' || !mini) return;
  setClockShift(clockShift() + (performance.now() - pausedAt));
  sfx.unlock();
  screen = 'mini';
  ui.hide();
  startLoop();
}

function liftSlots(): number[] {
  const mode = getMode(activeKeys);
  const slots: number[] = [];
  for (let i = 0; i < mode.left; i++) slots.push(i);
  for (let i = 0; i < mode.right; i++) slots.push(3 + i);
  return slots;
}

function finishRun(): void {
  stopLoop();
  const rt = rtStats(sim.rt, sim.rtCount);
  const cps = cpsStats(sim.tapT, sim.tapKey, sim.tapCount, liftSlots(), false);
  const prev = best('run', activeKeys, 'score');
  const score = Math.floor(sim.score);
  const isBest = score > 0 && (prev === null || score > (prev.score ?? 0));
  if (sim.time >= 3) {
    history = addRecord({
      kind: 'run',
      at: Date.now(),
      mode: activeKeys,
      time: sim.time,
      score,
      height: sim.height,
      rt: { ...rt, miss: sim.cueMisses, early: sim.falseStarts },
      cps: { peak: cps.peak, s5: cps.s5, s10: cps.s10, handEven: cps.handEvenness, repeatRate: cps.repeatRate },
    });
  }
  screen = 'results';
  inputLockUntil = performance.now() + 750;
  ui.show(
    resultsHtml({
      score,
      height: sim.height,
      time: sim.time,
      rt,
      hist: histogram(sim.rt, sim.rtCount, 20),
      cues: sim.cueCount,
      caught: sim.cueHits,
      holds: sim.nogoCount,
      held: sim.nogoHeld,
      falseStarts: sim.falseStarts,
      pullsWon: sim.burstsWon,
      pulls: sim.burstsWon + sim.burstsLost,
      rings: sim.rings,
      bestChain: sim.bestChain,
      surges: sim.surges,
      cps,
      labels: liftLabels,
      best: isBest,
    }),
  );
}

function finishReflex(): void {
  stopLoop();
  const t = reflex;
  const rt = rtStats(t.rts, t.n);
  const time = (performance.now() - t.startedAt) / 1000;
  const saved = t.trials >= 5;
  const prev = best('rt', activeKeys, 'score');
  const isBest = saved && t.score > 0 && (prev === null || t.score > (prev.score ?? 0));
  if (saved) {
    history = addRecord({
      kind: 'rt',
      at: Date.now(),
      mode: activeKeys,
      time,
      score: t.score,
      rt: { ...rt, miss: t.wrong + t.late, early: t.early },
      window: t.windowMs,
      rounds: t.roundsCleared,
      accuracy: t.correct / t.trials,
    });
  }
  screen = 'reflexResults';
  inputLockUntil = performance.now() + 750;
  ui.show(
    reflexResultsHtml({
      rt,
      hist: histogram(t.rts, t.n, 25),
      score: t.score,
      rounds: t.roundsCleared,
      trials: t.trials,
      correct: t.correct,
      wrong: t.wrong,
      late: t.late,
      early: t.early,
      window: t.windowMs,
      games: t.games.map((g, i) => ({
        name: g.name,
        tried: t.gTried[i]!,
        correct: t.gCorrect[i]!,
        avg: t.gRtN[i]! ? t.gRtSum[i]! / t.gRtN[i]! : 0,
      })),
      saved,
      best: isBest,
    }),
  );
}

function finishBurst(): void {
  stopLoop();
  const t = cpsTrainer;
  const cps = cpsStats(t.tapT, t.tapKey, t.tapCount, t.slots, t.crossHand);
  const time = (performance.now() - t.startedAt) / 1000;
  const saved = t.tapCount >= 20;
  if (saved) {
    history = addRecord({
      kind: 'cps',
      at: Date.now(),
      mode: activeKeys,
      time,
      target: t.cleared,
      cps: { peak: cps.peak, s5: cps.s5, s10: cps.s10, handEven: cps.handEvenness, repeatRate: cps.repeatRate },
    });
  }
  screen = 'burstResults';
  inputLockUntil = performance.now() + 750;
  ui.show(cpsResultsHtml({ cps, labels: t.labels, cleared: t.cleared, time, saved }));
}

function finishMini(): void {
  stopLoop();
  if (!mini || !miniDef) return;
  if (mini instanceof SoundCheck) {
    finishSoundCheck(mini);
    return;
  }
  const r = mini.result();
  // A session with no input at all, or too short to save, counts for nothing:
  // no score, no best, no history, no streak.
  if (miniInputs === 0) r.saved = false;
  if (practicing) {
    // Practice: show how it went, keep nothing.
    stopLoop();
    screen = 'miniResults';
    inputLockUntil = performance.now() + 750;
    const rts0 = r.rts ?? [];
    const st0 = rtStats(rts0, rts0.length);
    ui.show(miniResultsHtml(miniDef.id, r, rts0.length >= 3 ? histogram(rts0, rts0.length, 20) : null, st0.median, false, { index: 0, total: 0, nextName: null, label: '', practice: true }, null));
    return;
  }
  r.score = r.saved ? Math.max(0, Math.round(r.score)) : 0;
  const pointerOnly = !picksKeys(miniDef.id, miniDef.input);
  const keys = pointerOnly ? 0 : activeKeys;
  // Compare the tracked number with the last session and the best one (same key count).
  const lvl = miniDef.levels ? currentLevel : undefined;
  const lenNow = lengthValue;
  const earlier = history.filter((h) => h.kind === 'mini' && h.game === miniDef!.id && (pointerOnly || h.mode === activeKeys) && h.level === lvl && (h.len ?? 1) === lenNow && h.value !== undefined);
  const vals = earlier.map((h) => h.value!);
  const cmp = {
    last: vals.length ? vals[vals.length - 1]! : null,
    best: vals.length ? (r.primary.lower ? Math.min(...vals.filter((x) => r.primary.zeroOk || x > 0)) : Math.max(...vals)) : null,
    recent: vals.filter((x) => Number.isFinite(x) && (!r.primary.lower || r.primary.zeroOk || x > 0)).slice(-11),
  };
  if (cmp.best !== null && !Number.isFinite(cmp.best)) cmp.best = null;
  // A personal best is judged on the headline number, the one the results lead with, not
  // on the score, so the two can never disagree. The first session is a baseline, not a best.
  const isBest = r.saved && cmp.best !== null && Number.isFinite(r.primary.value) && (r.primary.lower ? (r.primary.zeroOk || r.primary.value > 0) && r.primary.value < cmp.best : r.primary.value > cmp.best);
  if (isBest) sfx.play(SND_BURST_OK);
  if (r.saved) {
    history = addRecord({
      kind: 'mini',
      game: miniDef.id,
      at: Date.now(),
      mode: keys,
      time: 0,
      score: r.score,
      value: r.primary.value,
      vlabel: r.primary.label,
      unit: r.primary.unit,
      decimals: r.primary.decimals,
      lower: r.primary.lower,
      level: lvl,
      len: lenNow === 1 ? undefined : lenNow,
    });
  }
  const rts = r.rts ?? [];
  const st = rtStats(rts, rts.length);
  screen = 'miniResults';
  inputLockUntil = performance.now() + 750;
  let step = null;
  if (dailyQueue) {
    // An endless run always has a next game.
    if (endlessScope && dailyIdx + 1 >= dailyQueue.length) dailyQueue.push(pickNext(dailyQueue));
    // Against the recent average of earlier sessions, signed so that positive is better.
    const usualOf = cmp.recent.slice(-5);
    const usual = usualOf.length >= 3 ? usualOf.reduce((a, b) => a + b, 0) / usualOf.length : 0;
    const vsUsual = r.saved && usual > 0 && Number.isFinite(r.primary.value) ? ((r.primary.value - usual) / usual) * (r.primary.lower ? -1 : 1) : undefined;
    dailyRows.push({ id: miniDef.id, name: miniDef.name, skill: miniDef.skill, score: r.score, primary: r.saved ? `${r.primary.label} ${formatPrimary(r.primary)}` : '', best: isBest, saved: r.saved, keys: activeKeys, vsUsual });
    const next = dailyQueue[dailyIdx + 1];
    step = { index: dailyIdx + 1, total: endlessScope ? 0 : dailyQueue.length, nextName: next ? (entry(next)?.name ?? next) : null, label: queueLabel };
  }
  ui.show(miniResultsHtml(miniDef.id, r, rts.length >= 3 ? histogram(rts, rts.length, 20) : null, st.median, isBest, step, cmp));
}

function showKeys(): void {
  stopLoop();
  screen = 'keys';
  ui.show(keysHtml(settings, bindKeys, listening));
}

const SOUND_CHECK: MiniDef = { id: 'soundcheck', name: 'Sound check', skill: 'timing', blurb: '', how: '', input: 'keys', make: () => new SoundCheck() };

/** Tap along to clicks; the typical lateness beyond what the browser reports becomes the audio offset. */
function startSoundCheck(): void {
  sfx.unlock();
  applyKeys(2);
  pointerSlot.fill(0);
  ui.hide();
  practicing = false;
  miniDef = SOUND_CHECK;
  miniInputs = 0;
  setClockShift(0);
  setLengthScale(1);
  mini = new SoundCheck();
  mini.start({ mode: getMode(activeKeys), labels: slotLabels, sound: (id) => sfx.play(id), soundAt: (id, d) => sfx.play(id, d), muted: settings.muted }, performance.now());
  screen = 'mini';
  startLoop();
}

let soundCheckNote = '';

function finishSoundCheck(m: SoundCheck): void {
  const d = m.delay();
  mini = null;
  if (Number.isFinite(d)) {
    // Games already allow for the delay the browser reports; keep only what is left over.
    settings.audioOffset = Math.round(clamp(d - sfx.latencyMs(), -60, 300));
    saveSettings(settings);
    soundCheckNote = `Measured: your taps land ${Math.round(d)} ms after each click starts. Allowing ${settings.audioOffset} ms on top of the ${Math.round(sfx.latencyMs())} ms the browser reports.`;
  } else soundCheckNote = 'Not enough taps on the clicks to measure. Try again, tapping on every click.';
  showMenu();
}

function toggleMute(): void {
  settings.muted = !settings.muted;
  sfx.setMuted(settings.muted);
  saveSettings(settings);
  sfx.play(SND_UI);
  if (screen === 'menu') showMenu();
  else if (screen === 'pause') ui.show(pauseHtml(settings.muted), true);
}

function exportHistory(): void {
  const blob = new Blob([JSON.stringify(history, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'tension-history.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function assignKey(code: string): void {
  const b = settings.bindings[bindKeys]!;
  const get = (id: string): string | null => {
    if (id === 'reflex') return b.reflex;
    const [side, i] = id.split(':');
    return (side === 'left' ? b.left : b.right)[Number(i)] ?? null;
  };
  const set = (id: string, c: string): void => {
    if (id === 'reflex') b.reflex = c;
    else {
      const [side, i] = id.split(':');
      (side === 'left' ? b.left : b.right)[Number(i)] = c;
    }
  };
  // If another slot of this key count already uses the key, swap the two.
  const ids = [...b.left.map((_, i) => `left:${i}`), ...b.right.map((_, i) => `right:${i}`), ...(b.reflex ? ['reflex'] : [])];
  const previous = get(listening);
  for (const id of ids) {
    if (id !== listening && get(id) === code && previous) set(id, previous);
  }
  set(listening, code);
  listening = '';
  saveSettings(settings);
  showKeys();
}

/** Set the key count a game is played with, from its page. */
function setKeys(game: GameId, n: number): void {
  const e = entry(game);
  if (!e || !picksKeys(game, e.input) || n < 1 || n > 6 || n < (e.minKeys ?? 1)) return;
  settings.keys[game] = n;
  saveSettings(settings);
  sfx.play(SND_UI);
  showMenu();
}

/** Play a fixed list of games back to back, like the daily set. */
function startList(ids: string[], label: string): void {
  endlessScope = null;
  dailyQueue = [...ids];
  queueLabel = label;
  dailyIdx = 0;
  dailyRows = [];
  showReady();
}

/** Start a game with a key count (and difficulty, if it has levels), remembering both for next time. */
function playWith(game: GameId, n: number, level?: number): void {
  const e = entry(game);
  if (!e) return;
  if (e.def?.levels) {
    currentLevel = level ?? levels[game] ?? 0;
    levels[game] = currentLevel;
    saveMap('tension.levels', levels);
  }
  if (picksKeys(game, e.input)) {
    if (n < 1 || n > 6 || n < (e.minKeys ?? 1)) return;
    settings.keys[game] = n;
    saveSettings(settings);
  }
  startGame(game);
}

function onAction(action: string, arg: string): void {
  sfx.unlock();
  switch (action) {
    case 'go':
      sfx.play(SND_UI);
      go(arg);
      break;
    case 'back':
      sfx.play(SND_UI);
      back();
      break;
    case 'page':
      nav[nav.length - 1]!.page = Number(arg) | 0;
      showMenu(1);
      break;
    case 'keycount': {
      const [id, n] = arg.split(':');
      setKeys(id as GameId, Number(n));
      break;
    }
    case 'routine': {
      const g = GUIDES[arg as keyof typeof GUIDES];
      if (g) startList(g.routine, `${SKILLS.find((k) => k.id === arg)?.name ?? 'Skill'} routine`);
      break;
    }
    case 'play': {
      const [id, n, lv] = arg.split(':');
      practicing = false;
      playWith(id as GameId, Number(n), lv === undefined ? undefined : Number(lv));
      break;
    }
    case 'practice': {
      const [id, n, lv] = arg.split(':');
      practicing = true;
      playWith(id as GameId, Number(n), lv === undefined ? undefined : Number(lv));
      break;
    }
    case 'custom': {
      // Nudge a game's custom difficulty.
      const [id, d] = arg.split(':');
      const cu = entry(id!)?.def?.custom;
      if (cu) {
        customLevels[id!] = clamp((customLevels[id!] ?? cu.def) + Number(d), cu.min, cu.max);
        saveMap('tension.custom', customLevels);
        sfx.play(SND_UI);
        showMenu();
      }
      break;
    }
    case 'crumb':
      // Re-open from a column further up the path.
      sfx.play(SND_UI);
      truncate(Number(arg) | 0);
      showMenu(-1);
      break;
    case 'pick': {
      // An item in a column further up: close the deeper columns, then act as if chosen there.
      const [level, act, ...rest] = arg.split('|');
      truncate(Number(level) | 0);
      if (act === 'go') onAction('go', rest.join('|'));
      else onAction(act ?? '', rest.join('|'));
      break;
    }
    case 'again':
      practicing = false;
      startGame(lastGame);
      break;
    case 'practiceagain':
      practicing = true;
      startGame(lastGame);
      break;
    case 'forreal':
      practicing = false;
      startGame(lastGame);
      break;
    case 'daily':
      startDaily();
      break;
    case 'quick':
      startQuick(arg || 'all:3');
      break;
    case 'dailynext':
      nextDaily();
      break;
    case 'endrun':
      endRun();
      break;
    case 'readygo':
      practicing = false;
      if (dailyQueue) startGame(dailyQueue[dailyIdx]! as GameId);
      break;
    case 'skip':
      skipDrill();
      break;
    case 'restart':
      startGame('climb');
      break;
    case 'gamestats':
      // From a results screen: the game's stats, over its page.
      gsFilter = 0;
      nav[nav.length - 1]!.sel = `gamestats:${arg || lastGame}`;
      nav.push({ kind: 'gamestats', arg: arg || lastGame, page: 0 });
      showMenu(1);
      break;
    case 'gsfilter':
      gsFilter = Number(arg) | 0;
      showMenu();
      break;
    case 'keys':
      bindKeys = settings.keys[lastGame] ?? 2;
      showKeys();
      break;
    case 'bindmode':
      bindKeys = Math.min(6, Math.max(1, Number(arg) | 0));
      listening = '';
      showKeys();
      break;
    case 'mute':
      toggleMute();
      break;
    case 'volume': {
      const steps = [0.25, 0.5, 0.75, 1];
      const cur = settings.volume ?? 0.8;
      const next = steps.find((v) => v > cur + 0.01) ?? steps[0]!;
      settings.volume = next;
      sfx.setVolume(next);
      saveSettings(settings);
      sfx.play(SND_CATCH);
      showMenu();
      break;
    }
    case 'audiodelay':
      settings.audioOffset = clamp((settings.audioOffset ?? 0) + (arg === '-' ? -10 : 10), -60, 300);
      saveSettings(settings);
      sfx.play(SND_UI);
      showMenu();
      break;
    case 'soundcheck':
      soundCheckNote = '';
      startSoundCheck();
      break;
    case 'menu':
      dailyQueue = null;
      endlessScope = null;
      showMenu(-1);
      break;
    case 'resume':
      resume();
      break;
    case 'keyset': {
      // Play a two-key game on another pair of keys, or back on the usual ones.
      const [id, set] = arg.split(':');
      settings.keysets = { ...(settings.keysets ?? {}), [id!]: set ?? '' };
      if (set) settings.keys[id!] = 2;
      saveSettings(settings);
      sfx.play(SND_UI);
      showMenu();
      break;
    }
    case 'length': {
      // Cycle or set the length a game is played at: short, standard, long.
      const [id, v] = arg.split(':');
      const order = lengthsFor(id!).map((l) => l.value);
      const cur = settings.lengths?.[id!] ?? 1;
      const next = v !== undefined ? Number(v) : order[(order.indexOf(cur) + 1) % order.length]!;
      settings.lengths = { ...(settings.lengths ?? {}), [id!]: next };
      saveSettings(settings);
      sfx.play(SND_UI);
      showMenu();
      break;
    }
    case 'miniresume':
      resumeMini();
      break;
    case 'minirestart':
      sfx.unlock();
      startGame(lastGame);
      break;
    case 'minifinish':
      sfx.unlock();
      screen = 'mini';
      finishMini();
      break;
    case 'miniquit':
      sfx.unlock();
      mini = null;
      if (dailyQueue) skipDrill();
      else {
        practicing = false;
        showMenu(-1);
      }
      break;
    case 'perf':
      perf.show = !perf.show;
      showMenu();
      break;
    case 'export':
      exportHistory();
      break;
    case 'clear':
      if (window.confirm('Clear all saved runs and training sessions?')) {
        clearHistory();
        history = [];
        showMenu();
      }
      break;
    case 'bind':
      listening = listening === arg ? '' : arg;
      showKeys();
      break;
    case 'resetkeys':
      settings.bindings[bindKeys] = defaultBindings(bindKeys);
      listening = '';
      saveSettings(settings);
      showKeys();
      break;
  }
}

// --- Input ------------------------------------------------------------------------

function stamp(e: Event): number {
  return e.timeStamp > 0 ? e.timeStamp : performance.now();
}

/** A key or pad went down during a session. */
function press(slot: number, ts: number): void {
  if (screen === 'play') {
    if (slot === SLOT_REFLEX) {
      runner.push(ACT_REFLEX, ts);
      return;
    }
    const side = slot >= 3 ? 1 : 0;
    const idx = slot - side * 3;
    runner.push(slot, ts);
    if (sim.phase > PHASE_RUN) return;
    // In a heavy pull a repeated key lifts less, and sounds like it.
    const pulling = sim.burstState === BURST_LEADIN || sim.burstState === BURST_ACTIVE;
    const keys = side === 0 ? sim.mode.left : sim.mode.right;
    const weak = pulling && keys > 1 && lastKey[side] === idx;
    lastKey[side] = idx;
    sfx.play(weak ? SND_TAP_WEAK : side === 0 ? SND_TAP_L : SND_TAP_R);
  } else if (screen === 'reflex') {
    const out = reflex.onPress(slot, ts);
    if (out === OUT_CORRECT) sfx.play(SND_CATCH);
    else if (out === OUT_WRONG || out === OUT_EARLY || out === OUT_LATE) sfx.play(SND_FALSE);
    else if (out === OUT_START) sfx.play(SND_UI);
    else sfx.play(slot >= 3 ? SND_TAP_R : SND_TAP_L);
  } else if (screen === 'mini' && mini) {
    miniInputs++;
    mini.press(slot, ts - clockShift());
  } else if (screen === 'burst') {
    if (slot === SLOT_REFLEX) return;
    const repeat = cpsTrainer.onTap(slot, ts);
    sfx.play(repeat ? SND_TAP_WEAK : slot >= 3 ? SND_TAP_R : SND_TAP_L);
  }
}

function release(slot: number, ts: number): void {
  if (screen === 'reflex') reflex.onRelease(slot);
  else if (screen === 'burst') cpsTrainer.onRelease(slot);
  else if (screen === 'mini') mini?.release?.(slot, ts - clockShift());
}

function onKeyDown(e: KeyboardEvent): void {
  const code = e.code;

  if (screen === 'keys' && listening) {
    e.preventDefault();
    if (e.repeat) return;
    if (code === 'Escape') {
      listening = '';
      showKeys();
    } else if (!RESERVED.has(code) && code) {
      assignKey(code);
    }
    return;
  }

  if (code === 'Backquote') {
    e.preventDefault();
    if (!e.repeat) {
      perf.show = !perf.show;
      if (screen === 'menu') showMenu();
    }
    return;
  }

  if (screen === 'mini' && mini?.typeKey && !e.repeat && mini.typeKey(code, stamp(e) - clockShift())) {
    miniInputs++;
    e.preventDefault();
    return;
  }
  if (screen === 'play' || screen === 'reflex' || screen === 'burst' || screen === 'mini') {
    const slot = keymap.get(code);
    if (slot !== undefined) {
      e.preventDefault();
      if (e.repeat) return;
      sfx.unlock();
      press(slot, stamp(e));
      return;
    }
    if (code === 'Escape') {
      e.preventDefault();
      if (!e.repeat) leave();
    } else if (code === 'Space' || code === 'Tab' || code === 'Enter' || code.startsWith('Arrow')) {
      e.preventDefault();
      // Any of these also dismisses a Reflex briefing card.
      if (!e.repeat && screen === 'reflex' && reflex.ready(stamp(e))) sfx.play(SND_UI);
    }
    return;
  }

  if (screen === 'pause') {
    if (e.repeat) return;
    const slot = keymap.get(code);
    if (slot !== undefined && slot !== SLOT_REFLEX) {
      e.preventDefault();
      resume();
      press(slot, stamp(e));
    } else if (code === 'Enter') resume();
    else if (code === 'KeyR') startGame('climb');
    else if (code === 'Escape') showMenu(-1);
    else if (code === 'Digit0') toggleMute();
    return;
  }

  // Menus.
  if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
  if (performance.now() < inputLockUntil) return;
  // A button reached with Tab keeps its own Enter / Space activation.
  if ((code === 'Enter' || code === 'Space') && document.activeElement instanceof HTMLButtonElement) return;
  sfx.unlock();
  const digit = code.startsWith('Digit') ? Number(code.slice(5)) : code.startsWith('Numpad') ? Number(code.slice(6)) : NaN;
  // Digits: key count on a game page, key-count filter on a game's stats, key set on the keys screen.
  if (!Number.isNaN(digit)) {
    const top = nav[nav.length - 1]!;
    if (screen === 'menu' && (top.kind === 'game' || top.kind === 'gamekeys') && digit >= 1 && digit <= 6) setKeys(top.arg.split(':')[0] as GameId, digit);
    else if (screen === 'menu' && top.kind === 'gamestats' && digit >= 0 && digit <= 6) onAction('gsfilter', String(digit));
    else if (screen === 'keys' && digit >= 1 && digit <= 6) onAction('bindmode', String(digit));
    else if (digit === 0) toggleMute();
    return;
  }
  // Everything else on a menu-like screen is a button carrying the key in data-key.
  const target = [...document.querySelectorAll<HTMLButtonElement>('#ui [data-key]')].find((el) => el.dataset.key!.split(' ').includes(code));
  if (target) {
    e.preventDefault();
    if (!target.disabled) target.click();
    return;
  }
  if (code === 'Escape' || code === 'Backspace') {
    e.preventDefault();
    if (screen === 'menu') back();
    else onAction('menu', '');
  } else if (code === 'ArrowDown' || code === 'ArrowUp') {
    // Arrow keys walk the items; Enter on a focused item opens it.
    const list = [...document.querySelectorAll<HTMLButtonElement>('#ui .item:not([disabled])')];
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    const step = code === 'ArrowDown' ? 1 : -1;
    list[at < 0 ? 0 : (at + step + list.length) % list.length]?.focus();
    e.preventDefault();
  }
}

function onKeyUp(e: KeyboardEvent): void {
  const slot = keymap.get(e.code);
  if (slot !== undefined) release(slot, stamp(e));
}

/** Touch, pen and mouse: pads in the corners, and a corner button for Escape. */
function onPointerDown(e: PointerEvent): void {
  if (screen !== 'play' && screen !== 'reflex' && screen !== 'burst' && screen !== 'mini') return;
  e.preventDefault();
  sfx.unlock();
  if (e.pointerType !== 'mouse' && !touch.active) {
    touch.active = true;
    refreshHints();
  }
  const rect = canvas.getBoundingClientRect();
  const hit = touch.hit((e.clientX - rect.left) * view.dpr, (e.clientY - rect.top) * view.dpr);
  if (hit === HIT_CORNER) {
    if (touch.active) leave();
    return;
  }
  if (screen === 'mini' && mini && miniDef && miniDef.input !== 'keys') {
    miniInputs++;
    mini.pointer?.((e.clientX - rect.left) * view.dpr, (e.clientY - rect.top) * view.dpr, stamp(e) - clockShift());
    return;
  }
  if (hit < 0) return;
  pointerSlot[e.pointerId & 63] = hit + 1;
  press(hit, stamp(e));
}

function onPointerUp(e: PointerEvent): void {
  const held = pointerSlot[e.pointerId & 63]!;
  if (held > 0) {
    pointerSlot[e.pointerId & 63] = 0;
    release(held - 1, stamp(e));
  }
  // Browsers that only unlock audio on a finished gesture get their chance here.
  sfx.unlock();
}

function onResize(): void {
  view.resize();
  touch.build(getMode(activeKeys), slotLabels, view.w, view.h, view.dpr);
  if (screen === 'mini' && miniDef && miniDef.input !== 'keys') touch.padsOff();
  if (screen === 'pause') view.drawGame(sim, 1, performance.now(), hints, touch);
}

function swallow(e: Event): void {
  e.preventDefault();
}

window.addEventListener('keydown', onKeyDown, { passive: false });
window.addEventListener('keyup', onKeyUp);
canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
canvas.addEventListener('pointermove', (e) => {
  if (screen !== 'mini' || !mini?.pointerMove) return;
  const rect = canvas.getBoundingClientRect();
  mini.pointerMove((e.clientX - rect.left) * view.dpr, (e.clientY - rect.top) * view.dpr, stamp(e) - clockShift());
});
canvas.addEventListener('pointerup', onPointerUp);
canvas.addEventListener('pointercancel', onPointerUp);
// Keep the browser from scrolling, zooming or selecting while fingers are on the board.
canvas.addEventListener('touchstart', swallow, { passive: false });
canvas.addEventListener('touchmove', swallow, { passive: false });
canvas.addEventListener('touchend', swallow, { passive: false });
canvas.addEventListener('contextmenu', swallow);
document.addEventListener('gesturestart', swallow, { passive: false });
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', onResize);
window.addEventListener('blur', pause);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});

applyKeys(activeKeys);
showMenu();

// Dev-only handle for automated playtesting.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__tension = {
    sim,
    runner,
    reflex,
    cpsTrainer,
    perf,
    view,
    touch,
    mini: () => mini,
    start: (id: string, keys = 2) => {
      settings.keys[id] = keys;
      startGame(id as GameId);
    },
  };
}

// Switching tabs or apps mid-drill pauses it, rather than letting the clock run on unseen.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && screen === 'mini') pauseMini();
});
