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

/** 'climb', 'reflex', 'burst', or a mini-game id. */
export type GameId = string;

export interface Settings {
  /** Number of keys last chosen for each game. */
  keys: Record<string, number>;
  muted: boolean;
  bindings: Record<number, Bindings>;
  /** Extra audio delay to allow for (ms), e.g. Bluetooth headphones; set by the sound check. */
  audioOffset?: number;
  /** Master volume, 0 to 1. */
  volume?: number;
  /** Two-key games played on another pair of keys: 'shift' or 'arrows'. */
  keysets?: Record<string, string>;
  /** Signed-in session for the leaderboards (a token the server signed), and the display name. */
  session?: string;
  account?: string;
  /** What Random and Endless draw from: skills left out, and kinds of game to skip. */
  runFilter?: { skip: string[]; noSound?: boolean; noKeyboard?: boolean; touchOnly?: boolean };
  /** Rounds or length chosen per game, where a game offers the choice. */
  lengths?: Record<string, number>;
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
  /** Length scale played (short 0.5, long 2); absent means standard. */
  len?: number;
  /** 'run' is Climb, 'rt' is Reflex, 'cps' is Burst, 'mini' is any other game. */
  kind: 'run' | 'rt' | 'cps' | 'mini';
  /** Mini-games: which one, and its tracked number. */
  game?: string;
  value?: number;
  /** How to show `value`: its label, unit, decimals, and whether lower is better. */
  vlabel?: string;
  unit?: string;
  decimals?: number;
  lower?: boolean;
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
  /** Games with difficulty levels: the level played (0 = progressing). */
  level?: number;
  /** How long the session took, in seconds. */
  dur?: number;
  /** The results' breakdown lines; kept on each game's latest session only, to save space. */
  lines?: { label: string; value: string }[];
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

interface SavedSettings extends Partial<Omit<Settings, 'keys' | 'muted' | 'bindings'>> {
  keys?: Record<string, number>;
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
  const keys: Record<string, number> = { climb: old, reflex: old, burst: old === 1 ? 2 : old };
  for (const [id, n] of Object.entries(saved?.keys ?? {})) keys[id] = count(n, keys[id] ?? 2);
  const num = (v: unknown, lo: number, hi: number): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined);
  const record = <T,>(v: unknown, ok: (x: unknown) => x is T): Record<string, T> | undefined => {
    if (!v || typeof v !== 'object') return undefined;
    const out: Record<string, T> = {};
    for (const [k, x] of Object.entries(v)) if (ok(x)) out[k] = x;
    return out;
  };
  const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
  const isStr = (x: unknown): x is string => typeof x === 'string';
  const rf = saved?.runFilter;
  return {
    keys,
    muted: saved?.muted === true,
    bindings,
    audioOffset: num(saved?.audioOffset, -60, 300),
    volume: num(saved?.volume, 0, 1),
    keysets: record(saved?.keysets, isStr),
    lengths: record(saved?.lengths, isNum),
    session: typeof saved?.session === 'string' && saved.session.length < 300 ? saved.session : undefined,
    account: typeof saved?.account === 'string' ? saved.account.slice(0, 16) : undefined,
    runFilter: rf && typeof rf === 'object' ? { skip: Array.isArray(rf.skip) ? rf.skip.filter(isStr) : [], noSound: rf.noSound === true, noKeyboard: rf.noKeyboard === true, touchOnly: rf.touchOnly === true } : undefined,
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
  // Only the latest session of a game keeps its breakdown.
  if (r.lines && r.game) for (const x of h) if (x.game === r.game && x.lines) delete x.lines;
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
/** Other pairs of keys a two-key game can be played on, one key per hand. */
export const KEYSETS: Record<string, { label: string; left: string; right: string }> = {
  shift: { label: 'Shift keys', left: 'ShiftLeft', right: 'ShiftRight' },
  arrows: { label: 'Arrows', left: 'ArrowLeft', right: 'ArrowRight' },
};

/** The bindings a game is played with: the saved ones, or a two-key set chosen for that game. */
export function bindingsFor(settings: Settings, id: string, keys: number): Bindings {
  const set = KEYSETS[settings.keysets?.[id] ?? ''];
  if (set && keys === 2) return { left: [set.left], right: [set.right], reflex: null };
  return settings.bindings[keys]!;
}

export function keyLabel(code: string): string {
  if (code === 'ShiftLeft') return 'L\u21e7';
  if (code === 'ShiftRight') return 'R\u21e7';
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
    ShiftLeft: 'L\u21e7',
    ShiftRight: 'R\u21e7',
    ControlLeft: 'L CTRL',
    ControlRight: 'R CTRL',
    AltLeft: 'L ALT',
    AltRight: 'R ALT',
    Backspace: 'BKSP',
    CapsLock: 'CAPS',
  };
  return named[code] ?? code.toUpperCase();
}
