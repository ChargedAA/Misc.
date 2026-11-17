// Settings, key bindings and run history in localStorage.

import { MODES, type ModeDef } from './config.ts';

export interface Bindings {
  left: string[];
  right: string[];
  reflex: string | null;
}

/** Defaults: KeyboardEvent.code values, so they follow physical key position. */
export function defaultBindings(modeId: number): Bindings {
  switch (modeId) {
    case 1:
      return { left: ['Space'], right: [], reflex: null };
    case 2:
      return { left: ['KeyZ'], right: ['KeyM'], reflex: null };
    case 3:
      return { left: ['KeyZ'], right: ['KeyM'], reflex: 'Space' };
    case 4:
      return { left: ['KeyZ', 'KeyX'], right: ['KeyN', 'KeyM'], reflex: null };
    case 5:
      return { left: ['KeyZ', 'KeyX'], right: ['KeyN', 'KeyM'], reflex: 'Space' };
    default:
      return { left: ['KeyZ', 'KeyX', 'KeyC'], right: ['KeyB', 'KeyN', 'KeyM'], reflex: null };
  }
}

/** Keys the game keeps for itself; they cannot be bound. */
export const RESERVED = new Set(['Escape', 'Enter', 'Backquote', 'Tab']);

export type GameId = 'climb' | 'reflex' | 'burst';
export const GAME_IDS: readonly GameId[] = ['climb', 'reflex', 'burst'];

export interface Settings {
  /** Number of keys last chosen for each game. */
  keys: Record<GameId, number>;
  muted: boolean;
  bindings: Record<number, Bindings>;
}

export interface RtSummary {
  n: number;
  avg: number;
  median: number;
  best: number;
  sd: number;
  miss: number;
  early: number;
}

export interface CpsSummary {
  peak: number;
  s5: number;
  s10: number;
  handEven: number;
  repeatRate: number;
}

export interface RunRecord {
  /** 'run' is Climb, 'rt' is Reflex, 'cps' is Burst. */
  kind: 'run' | 'rt' | 'cps';
  at: number;
  /** Number of keys used. */
  mode: number;
  time: number;
  score?: number;
  height?: number;
  rt?: RtSummary;
  cps?: CpsSummary;
  /** Reflex: response window (ms) at the end. */
  window?: number;
  /** Reflex: rounds finished and share of correct answers. */
  rounds?: number;
  accuracy?: number;
  /** Burst: highest target cleared. */
  target?: number;
}

const SETTINGS_KEY = 'tension.settings.v1';
const HISTORY_KEY = 'tension.history.v1';
const HISTORY_MAX = 600;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the game still works, it just forgets.
  }
}

function validBindings(b: unknown, mode: ModeDef): b is Bindings {
  if (!b || typeof b !== 'object') return false;
  const x = b as Bindings;
  const codes = (a: unknown, n: number) =>
    Array.isArray(a) && a.length === n && a.every((c) => typeof c === 'string' && c.length > 0);
  if (!codes(x.left, mode.left) || !codes(x.right, mode.right)) return false;
  return mode.reflex ? typeof x.reflex === 'string' && x.reflex.length > 0 : true;
}

interface SavedSettings {
  keys?: Partial<Record<GameId, number>>;
  /** Before the title screen there was one key count for everything. */
  mode?: number;
  muted?: boolean;
  bindings?: Record<number, Bindings>;
}

export function loadSettings(): Settings {
  const saved = read<SavedSettings>(SETTINGS_KEY);
  const bindings: Record<number, Bindings> = {};
  for (const m of MODES) {
    const b = saved?.bindings?.[m.id];
    bindings[m.id] = validBindings(b, m) ? { left: [...b.left], right: [...b.right], reflex: m.reflex ? b.reflex : null } : defaultBindings(m.id);
  }
  const count = (v: unknown, fallback: number): number => {
    const n = Number(v);
    return n >= 1 && n <= 6 ? n | 0 : fallback;
  };
  const old = count(saved?.mode, 2);
  return {
    keys: {
      climb: count(saved?.keys?.climb, old),
      reflex: count(saved?.keys?.reflex, old),
      burst: count(saved?.keys?.burst, old === 1 ? 2 : old),
    },
    muted: saved?.muted === true,
    bindings,
  };
}

export function saveSettings(s: Settings): void {
  write(SETTINGS_KEY, s);
}

export function loadHistory(): RunRecord[] {
  const h = read<RunRecord[]>(HISTORY_KEY);
  return Array.isArray(h) ? h.filter((r) => r && typeof r.at === 'number' && typeof r.kind === 'string') : [];
}

export function addRecord(r: RunRecord): RunRecord[] {
  const h = loadHistory();
  h.push(r);
  if (h.length > HISTORY_MAX) h.splice(0, h.length - HISTORY_MAX);
  write(HISTORY_KEY, h);
  return h;
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    // ignore
  }
}

/** Short label for a KeyboardEvent.code. */
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'NUM ' + code.slice(6).toUpperCase();
  if (code.startsWith('Arrow')) return code.slice(5).toUpperCase();
  const named: Record<string, string> = {
    Space: 'SPACE',
    Comma: ',',
    Period: '.',
    Slash: '/',
    Semicolon: ';',
    Quote: "'",
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Minus: '-',
    Equal: '=',
    ShiftLeft: 'L SHIFT',
    ShiftRight: 'R SHIFT',
    ControlLeft: 'L CTRL',
    ControlRight: 'R CTRL',
    AltLeft: 'L ALT',
    AltRight: 'R ALT',
    Backspace: 'BKSP',
    CapsLock: 'CAPS',
  };
  return named[code] ?? code.toUpperCase();
}
