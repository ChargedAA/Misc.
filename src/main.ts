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
import { SLOT_REFLEX, getMode } from './config.ts';
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
import { GAMES, Ui, cpsResultsHtml, keysHtml, pauseHtml, reflexResultsHtml, resultsHtml, statsHtml, titleHtml } from './ui.ts';

type Screen = 'title' | 'play' | 'pause' | 'results' | 'reflex' | 'reflexResults' | 'burst' | 'burstResults' | 'stats' | 'keys';

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
let history = loadHistory();

let screen: Screen = 'title';
/** Game whose key-count pop-out is open on the title screen. */
let picked: GameId | null = null;
let lastGame: GameId = 'climb';
/** Key count of the session in progress. */
let activeKeys = settings.keys.climb;
/** Key count shown on the rebinding screen. */
let bindKeys = settings.keys.climb;
let statsFilter = 0;
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

function applyKeys(count: number): void {
  activeKeys = count;
  const mode = getMode(count);
  const b = settings.bindings[count]!;
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
    hints.sub = 'orange cable: press once';
  } else {
    hints.left = pads ? 'dash left' : `${left}  dash left`;
    hints.right = pads ? 'dash right' : `dash right  ${right}`;
    hints.center = 'both sides: surge';
    hints.sub = mode.reflex && b.reflex ? `orange cable: ${keyLabel(b.reflex)}` : 'orange cable: tap that side';
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
  return game === 'climb' ? best('run', keys, 'score') : game === 'reflex' ? best('rt', keys, 'score') : best('cps', keys, 'target');
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

function showTitle(slide = false): void {
  stopLoop();
  screen = 'title';
  listening = '';
  ui.show(titleHtml(settings, picked, picked ? bestFor(picked, settings.keys[picked]) : null, slide));
}

function startGame(game: GameId): void {
  lastGame = game;
  picked = null;
  applyKeys(settings.keys[game]);
  pointerSlot.fill(0);
  ui.hide();
  if (game === 'climb') {
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
    showTitle();
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
  inputLockUntil = performance.now() + 450;
  ui.show(
    resultsHtml({
      score,
      height: sim.height,
      time: sim.time,
      rt,
      hist: histogram(sim.rt, sim.rtCount, 20),
      cues: sim.cueCount,
      caught: sim.cueHits,
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
  inputLockUntil = performance.now() + 450;
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
  inputLockUntil = performance.now() + 450;
  ui.show(cpsResultsHtml({ cps, labels: t.labels, cleared: t.cleared, time, saved }));
}

function showStats(): void {
  stopLoop();
  screen = 'stats';
  ui.show(statsHtml(history, statsFilter, perf.show));
}

function showKeys(): void {
  stopLoop();
  screen = 'keys';
  ui.show(keysHtml(settings, bindKeys, listening));
}

function toggleMute(): void {
  settings.muted = !settings.muted;
  sfx.setMuted(settings.muted);
  saveSettings(settings);
  sfx.play(SND_UI);
  if (screen === 'title') showTitle();
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

function setKeyCount(n: number): void {
  if (!picked || n < 1 || n > 6) return;
  settings.keys[picked] = n;
  saveSettings(settings);
  showTitle();
}

function onAction(action: string, arg: string): void {
  sfx.unlock();
  switch (action) {
    case 'pick':
      picked = arg as GameId;
      showTitle(true);
      break;
    case 'closepop':
      picked = null;
      showTitle();
      break;
    case 'keycount':
      setKeyCount(Number(arg));
      break;
    case 'start':
      if (picked) startGame(picked);
      break;
    case 'again':
      startGame(lastGame);
      break;
    case 'restart':
      startGame('climb');
      break;
    case 'stats':
      showStats();
      break;
    case 'keys':
      bindKeys = settings.keys[lastGame];
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
    case 'menu':
      picked = null;
      showTitle();
      break;
    case 'resume':
      resume();
      break;
    case 'filter':
      statsFilter = Number(arg) | 0;
      showStats();
      break;
    case 'perf':
      perf.show = !perf.show;
      showStats();
      break;
    case 'export':
      exportHistory();
      break;
    case 'clear':
      if (window.confirm('Clear all saved runs and training sessions?')) {
        clearHistory();
        history = [];
        showStats();
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
  } else if (screen === 'burst') {
    if (slot === SLOT_REFLEX) return;
    const repeat = cpsTrainer.onTap(slot, ts);
    sfx.play(repeat ? SND_TAP_WEAK : slot >= 3 ? SND_TAP_R : SND_TAP_L);
  }
}

function release(slot: number): void {
  if (screen === 'reflex') reflex.onRelease(slot);
  else if (screen === 'burst') cpsTrainer.onRelease(slot);
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
      if (screen === 'stats') showStats();
    }
    return;
  }

  if (screen === 'play' || screen === 'reflex' || screen === 'burst') {
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
    else if (code === 'Escape') {
      picked = null;
      showTitle();
    } else if (code === 'Digit0') toggleMute();
    return;
  }

  // Menus.
  if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
  if (performance.now() < inputLockUntil) return;
  // A button reached with Tab keeps its own Enter / Space activation.
  if ((code === 'Enter' || code === 'Space') && document.activeElement instanceof HTMLButtonElement) return;
  sfx.unlock();
  const enter = code === 'Enter' || code === 'NumpadEnter';
  const digit = code.startsWith('Digit') ? Number(code.slice(5)) : code.startsWith('Numpad') ? Number(code.slice(6)) : NaN;
  switch (screen) {
    case 'title':
      if (picked) {
        if (digit >= 1 && digit <= 6) setKeyCount(digit);
        else if (code === 'ArrowLeft') setKeyCount(settings.keys[picked] - 1);
        else if (code === 'ArrowRight') setKeyCount(settings.keys[picked] + 1);
        else if (enter) startGame(picked);
        else if (code === 'Escape') onAction('closepop', '');
        break;
      }
      for (const g of GAMES) if (code === 'Key' + g.key.toUpperCase()) onAction('pick', g.id);
      if (enter) onAction('pick', lastGame);
      else if (code === 'KeyS') showStats();
      else if (code === 'KeyK') onAction('keys', '');
      else if (digit === 0) toggleMute();
      break;
    case 'results':
    case 'reflexResults':
    case 'burstResults':
      if (enter) startGame(lastGame);
      else if (code === 'KeyS') showStats();
      else if (code === 'Escape') onAction('menu', '');
      break;
    case 'stats':
      if (code === 'Escape') onAction('menu', '');
      else if (digit >= 0 && digit <= 6) onAction('filter', String(digit));
      break;
    case 'keys':
      if (code === 'Escape') onAction('menu', '');
      else if (digit >= 1 && digit <= 6) onAction('bindmode', String(digit));
      break;
  }
}

function onKeyUp(e: KeyboardEvent): void {
  const slot = keymap.get(e.code);
  if (slot !== undefined) release(slot);
}

/** Touch, pen and mouse: pads in the corners, and a corner button for Escape. */
function onPointerDown(e: PointerEvent): void {
  if (screen !== 'play' && screen !== 'reflex' && screen !== 'burst') return;
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
  if (hit < 0) return;
  pointerSlot[e.pointerId & 63] = hit + 1;
  press(hit, stamp(e));
}

function onPointerUp(e: PointerEvent): void {
  const held = pointerSlot[e.pointerId & 63]!;
  if (held > 0) {
    pointerSlot[e.pointerId & 63] = 0;
    release(held - 1);
  }
  // Browsers that only unlock audio on a finished gesture get their chance here.
  sfx.unlock();
}

function onResize(): void {
  view.resize();
  touch.build(getMode(activeKeys), slotLabels, view.w, view.h, view.dpr);
  if (screen === 'pause') view.drawGame(sim, 1, performance.now(), hints, touch);
}

function swallow(e: Event): void {
  e.preventDefault();
}

window.addEventListener('keydown', onKeyDown, { passive: false });
window.addEventListener('keyup', onKeyUp);
canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
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
showTitle();

// Dev-only handle for automated playtesting.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__tension = { sim, runner, reflex, cpsTrainer, perf, view, touch };
}
