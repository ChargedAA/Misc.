// Application shell: screens, input, the rAF loop and persistence.

import './style.css';
import {
  SND_BURST_OK,
  SND_CATCH,
  SND_FALL,
  SND_FALSE,
  SND_LURCH,
  SND_TAP_L,
  SND_TAP_R,
  SND_TAP_WEAK,
  SND_UI,
  SND_ZONE,
  Sfx,
} from './audio.ts';
import { getMode } from './config.ts';
import { ACT_REFLEX, Runner } from './loop.ts';
import { View, type Hints, type PerfStats } from './render.ts';
import {
  FX_BURST_OK,
  FX_CATCH,
  FX_FALL,
  FX_FALSE,
  FX_LURCH,
  FX_ZONE,
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
  type RunRecord,
} from './storage.ts';
import { CpsTrainer, RT_EARLY, RT_HIT, RT_LATE, ReactionTrainer } from './trainers.ts';
import {
  Ui,
  cpsResultsHtml,
  keysHtml,
  menuHtml,
  pauseHtml,
  resultsHtml,
  rtResultsHtml,
  statsHtml,
} from './ui.ts';

type Screen = 'menu' | 'play' | 'pause' | 'results' | 'rt' | 'cps' | 'rtResults' | 'cpsResults' | 'stats' | 'keys';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const view = new View(canvas);
const sfx = new Sfx();
const sim = new Sim();
const runner = new Runner(sim);
const rtTrainer = new ReactionTrainer();
const cpsTrainer = new CpsTrainer();
const ui = new Ui(document.getElementById('ui')!, onAction);

const settings = loadSettings();
sfx.muted = settings.muted;
let history = loadHistory();

let screen: Screen = 'menu';
let statsFilter = 0;
let listening = '';
/** Ignore menu keys until this time, so mashing through a death does not skip the results. */
let inputLockUntil = 0;

/** code -> action: 0..5 lift slot (side * 3 + key), 6 reflex. */
const keymap = new Map<string, number>();
const hints: Hints = { left: '', right: '', reflex: '' };
let slotLabels: string[] = [];
const lastKey = new Int8Array(2);
const touchKey = new Int8Array(2);

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

// --- Mode and bindings ------------------------------------------------------------

function applyMode(): void {
  const b = settings.bindings[settings.mode]!;
  keymap.clear();
  slotLabels = [];
  b.left.forEach((code, i) => {
    keymap.set(code, i);
    slotLabels.push(keyLabel(code));
  });
  b.right.forEach((code, i) => {
    keymap.set(code, 3 + i);
    slotLabels.push(keyLabel(code));
  });
  if (b.reflex) keymap.set(b.reflex, ACT_REFLEX);
  hints.left = b.left.map(keyLabel).join('  ');
  hints.right = b.right.map(keyLabel).join('  ');
  hints.reflex = b.reflex ? keyLabel(b.reflex) : '';
}

function setMode(id: number): void {
  if (id < 1 || id > 6) return;
  settings.mode = id;
  saveSettings(settings);
  applyMode();
}

function bestRun(mode: number): RunRecord | null {
  let best: RunRecord | null = null;
  for (const r of history) {
    if (r.kind === 'run' && r.mode === mode && (best === null || (r.score ?? 0) > (best.score ?? 0))) best = r;
  }
  return best;
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
    view.drawGame(sim, runner.alpha, now, hints);
    view.drawPerf(perf);
    if (sim.phase === PHASE_OVER) finishRun();
  } else if (screen === 'rt') {
    rtTrainer.frame(now, view);
    view.drawPerf(perf);
  } else if (screen === 'cps') {
    const done = cpsTrainer.frame(now, view);
    view.drawPerf(perf);
    if (done) finishCps();
  }
}

function playFx(fx: number): void {
  if (fx & FX_FALL) sfx.play(SND_FALL);
  else if (fx & FX_LURCH) sfx.play(SND_LURCH);
  if (fx & FX_CATCH) sfx.play(SND_CATCH);
  if (fx & FX_FALSE) sfx.play(SND_FALSE);
  if (fx & FX_BURST_OK) sfx.play(SND_BURST_OK);
  if (fx & FX_ZONE) sfx.play(SND_ZONE);
}

// --- Screens ----------------------------------------------------------------------

function showMenu(): void {
  stopLoop();
  screen = 'menu';
  listening = '';
  ui.show(menuHtml(settings, bestRun(settings.mode)));
}

function startRun(): void {
  applyMode();
  sim.reset(settings.mode, (Math.random() * 0x100000000) >>> 0);
  runner.restart();
  lastKey[0] = lastKey[1] = -1;
  screen = 'play';
  ui.hide();
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

function finishRun(): void {
  stopLoop();
  const mode = getMode(sim.mode.id);
  const slots: number[] = [];
  for (let i = 0; i < mode.left; i++) slots.push(i);
  for (let i = 0; i < mode.right; i++) slots.push(3 + i);
  const rt = rtStats(sim.rt, sim.rtCount);
  const cps = cpsStats(sim.tapT, sim.tapKey, sim.tapCount, slots, false);
  const prev = bestRun(mode.id);
  const score = Math.floor(sim.score);
  const best = score > 0 && (prev === null || score > (prev.score ?? 0));
  if (sim.time >= 3) {
    history = addRecord({
      kind: 'run',
      at: Date.now(),
      mode: mode.id,
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
      mode: mode.id,
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
      cps,
      labels: slotLabels,
      best,
    }),
  );
}

function startRt(): void {
  screen = 'rt';
  ui.hide();
  rtTrainer.start(performance.now());
  startLoop();
}

function finishRt(): void {
  stopLoop();
  const t = rtTrainer;
  const rt = rtStats(t.rts, t.n);
  const time = (performance.now() - t.startedAt) / 1000;
  const saved = t.n >= 5;
  if (saved) {
    history = addRecord({
      kind: 'rt',
      at: Date.now(),
      mode: 0,
      time,
      rt: { ...rt, miss: t.late + t.misses, early: t.early },
      window: t.windowMs,
    });
  }
  screen = 'rtResults';
  inputLockUntil = performance.now() + 300;
  ui.show(
    rtResultsHtml({
      rt,
      hist: histogram(t.rts, t.n, 20),
      hits: t.hits,
      late: t.late,
      early: t.early,
      misses: t.misses,
      window: t.windowMs,
      time,
      saved,
    }),
  );
}

function startCps(): void {
  applyMode();
  screen = 'cps';
  ui.hide();
  cpsTrainer.start(getMode(settings.mode), slotLabels, performance.now());
  startLoop();
}

function finishCps(): void {
  stopLoop();
  const t = cpsTrainer;
  const cps = cpsStats(t.tapT, t.tapKey, t.tapCount, t.slots, t.crossHand);
  const time = (performance.now() - t.startedAt) / 1000;
  const saved = t.tapCount >= 20;
  if (saved) {
    history = addRecord({
      kind: 'cps',
      at: Date.now(),
      mode: settings.mode,
      time,
      target: t.cleared,
      cps: { peak: cps.peak, s5: cps.s5, s10: cps.s10, handEven: cps.handEvenness, repeatRate: cps.repeatRate },
    });
  }
  screen = 'cpsResults';
  inputLockUntil = performance.now() + 450;
  ui.show(cpsResultsHtml({ cps, labels: t.labels, cleared: t.cleared, time, saved }));
}

function showStats(): void {
  stopLoop();
  screen = 'stats';
  ui.show(statsHtml(history, statsFilter));
}

function showKeys(): void {
  stopLoop();
  screen = 'keys';
  ui.show(keysHtml(settings, listening));
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
  const b = settings.bindings[settings.mode]!;
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
  // If another slot of this mode already uses the key, swap the two.
  const ids = [...b.left.map((_, i) => `left:${i}`), ...b.right.map((_, i) => `right:${i}`), ...(b.reflex ? ['reflex'] : [])];
  const previous = get(listening);
  for (const id of ids) {
    if (id !== listening && get(id) === code && previous) set(id, previous);
  }
  set(listening, code);
  listening = '';
  saveSettings(settings);
  applyMode();
  showKeys();
}

function onAction(action: string, arg: string): void {
  sfx.unlock();
  switch (action) {
    case 'mode':
      setMode(Number(arg));
      listening = '';
      if (screen === 'keys') showKeys();
      else showMenu();
      break;
    case 'play':
      startRun();
      break;
    case 'rt':
      startRt();
      break;
    case 'cps':
      startCps();
      break;
    case 'stats':
      showStats();
      break;
    case 'keys':
      showKeys();
      break;
    case 'mute':
      toggleMute();
      break;
    case 'menu':
      showMenu();
      break;
    case 'resume':
      resume();
      break;
    case 'restart':
      startRun();
      break;
    case 'filter':
      statsFilter = Number(arg) | 0;
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
      settings.bindings[settings.mode] = defaultBindings(settings.mode);
      listening = '';
      saveSettings(settings);
      applyMode();
      showKeys();
      break;
  }
}

// --- Input ------------------------------------------------------------------------

function stamp(e: Event): number {
  return e.timeStamp > 0 ? e.timeStamp : performance.now();
}

function lift(slot: number, ts: number): void {
  const side = slot >= 3 ? 1 : 0;
  const idx = slot - side * 3;
  const keys = side === 0 ? sim.mode.left : sim.mode.right;
  const weak = keys > 1 && lastKey[side] === idx;
  lastKey[side] = idx;
  runner.push(slot, ts);
  if (sim.phase <= PHASE_RUN) sfx.play(weak ? SND_TAP_WEAK : side === 0 ? SND_TAP_L : SND_TAP_R);
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
    if (!e.repeat) perf.show = !perf.show;
    return;
  }

  const act = keymap.get(code);

  if (screen === 'play') {
    if (act !== undefined) {
      e.preventDefault();
      if (e.repeat) return;
      sfx.unlock();
      if (act === ACT_REFLEX) runner.push(ACT_REFLEX, stamp(e));
      else lift(act, stamp(e));
      return;
    }
    if (code === 'Escape') {
      e.preventDefault();
      if (!e.repeat) pause();
    } else if (code === 'Space' || code.startsWith('Arrow')) {
      e.preventDefault();
    }
    return;
  }

  if (screen === 'cps') {
    if (act !== undefined) {
      e.preventDefault();
      if (e.repeat || act === ACT_REFLEX) return;
      sfx.unlock();
      const repeat = cpsTrainer.onTap(act, stamp(e));
      sfx.play(repeat ? SND_TAP_WEAK : act >= 3 ? SND_TAP_R : SND_TAP_L);
      return;
    }
    if (code === 'Escape') {
      e.preventDefault();
      if (!e.repeat) finishCps();
    } else if (code === 'Space') {
      e.preventDefault();
    }
    return;
  }

  if (screen === 'rt') {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    e.preventDefault();
    if (e.repeat) return;
    if (code === 'Escape') {
      finishRt();
      return;
    }
    sfx.unlock();
    reactionKey(stamp(e));
    return;
  }

  if (screen === 'pause') {
    if (e.repeat) return;
    if (act !== undefined && act !== ACT_REFLEX) {
      e.preventDefault();
      resume();
      lift(act, stamp(e));
    } else if (code === 'Enter') resume();
    else if (code === 'KeyR') startRun();
    else if (code === 'Escape') showMenu();
    else if (code === 'Digit0') toggleMute();
    return;
  }

  // Menus.
  if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
  if (performance.now() < inputLockUntil) return;
  sfx.unlock();
  const digit = code.startsWith('Digit') ? Number(code.slice(5)) : code.startsWith('Numpad') ? Number(code.slice(6)) : NaN;
  switch (screen) {
    case 'menu':
      if (digit >= 1 && digit <= 6) onAction('mode', String(digit));
      else if (code === 'Enter' || code === 'NumpadEnter') startRun();
      else if (code === 'KeyR') startRt();
      else if (code === 'KeyC') startCps();
      else if (code === 'KeyS') showStats();
      else if (code === 'KeyK') showKeys();
      else if (digit === 0) toggleMute();
      break;
    case 'results':
      if (code === 'Enter' || code === 'NumpadEnter') startRun();
      else if (code === 'KeyS') showStats();
      else if (code === 'Escape') showMenu();
      break;
    case 'rtResults':
      if (code === 'Enter' || code === 'NumpadEnter') startRt();
      else if (code === 'KeyS') showStats();
      else if (code === 'Escape') showMenu();
      break;
    case 'cpsResults':
      if (code === 'Enter' || code === 'NumpadEnter') startCps();
      else if (code === 'KeyS') showStats();
      else if (code === 'Escape') showMenu();
      break;
    case 'stats':
      if (code === 'Escape') showMenu();
      else if (digit >= 0 && digit <= 6) onAction('filter', String(digit));
      break;
    case 'keys':
      if (code === 'Escape') showMenu();
      else if (digit >= 1 && digit <= 6) onAction('mode', String(digit));
      break;
  }
}

function reactionKey(ts: number): void {
  const kind = rtTrainer.onKey(ts);
  if (kind === RT_HIT) sfx.play(SND_CATCH);
  else if (kind === RT_LATE) sfx.play(SND_TAP_WEAK);
  else if (kind === RT_EARLY) sfx.play(SND_FALSE);
}

/** Touch and mouse: the left / right half of the screen lifts that end. */
function onPointerDown(e: PointerEvent): void {
  if (screen !== 'play' && screen !== 'cps' && screen !== 'rt') return;
  e.preventDefault();
  sfx.unlock();
  const ts = stamp(e);
  if (screen === 'rt') {
    reactionKey(ts);
    return;
  }
  const mode = getMode(settings.mode);
  const side = mode.right > 0 && e.clientX > window.innerWidth / 2 ? 1 : 0;
  const keys = side === 0 ? mode.left : mode.right;
  touchKey[side] = (touchKey[side]! + 1) % keys;
  const slot = side * 3 + touchKey[side]!;
  if (screen === 'play') lift(slot, ts);
  else {
    const repeat = cpsTrainer.onTap(slot, ts);
    sfx.play(repeat ? SND_TAP_WEAK : side === 1 ? SND_TAP_R : SND_TAP_L);
  }
}

function onResize(): void {
  view.resize();
  if (screen === 'pause') view.drawGame(sim, 1, performance.now(), hints);
}

window.addEventListener('keydown', onKeyDown, { passive: false });
canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('resize', onResize);
window.addEventListener('blur', pause);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});

applyMode();
showMenu();

// Dev-only handle for automated playtesting.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__tension = { sim, runner, rtTrainer, cpsTrainer, perf, view };
}
