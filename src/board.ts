// Leaderboard rules, shared by the server function and the tests. Pure: no storage, no network.
//
// The server trusts nothing the browser says without checking it: names and ids are cleaned,
// values must be numbers a person could produce, the run must carry evidence of real play
// (inputs, duration, reaction times that agree with the headline), anything the client's own
// fair-play checks flagged is refused, and each device is rate limited.

export interface Submission {
  /** Random id kept by the device, so one player's entries stay one entry. */
  device: string;
  name: string;
  game: string;
  /** The headline number and its meaning, exactly as the results showed it. */
  value: number;
  unit: string;
  lower: boolean;
  /** Length setting (1 standard, 0.5 short, 2 long, 0 endless, -60 a minute...) and key count. */
  len: number;
  keys: number;
  /** Evidence: how many inputs the run had, how long it lasted, and its reaction times if any. */
  inputs: number;
  durationMs: number;
  rts?: number[];
  /** True when the headline itself is a reaction time, so it must agree with `rts`. */
  rtHeadline?: boolean;
  /** The client's own fair-play flags; any at all and the run is refused. */
  flags: string[];
}

export interface Entry {
  device: string;
  name: string;
  value: number;
  unit: string;
  lower: boolean;
  keys: number;
  at: number;
}

/** Units are short labels the games print: ms, %, /s, cents, taps a second... */
const UNIT = /^[a-z%°/ -]{0,16}$/i;

/** Clean a display name: letters, digits, spaces, _ and -, 2 to 16 characters. */
export function cleanName(name: string): string | null {
  const n = String(name ?? '').replace(/[^A-Za-z0-9 _-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  return n.length >= 2 ? n : null;
}

function median(a: readonly number[]): number {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/**
 * Why a submission is refused, or null if it is acceptable. Floors and ceilings are set at what
 * the best humans manage, with room to spare, so only machines and tampering hit them.
 */
export function refuse(s: Submission): string | null {
  if (!s || typeof s !== 'object') return 'bad request';
  if (!/^[a-z0-9]{12,40}$/.test(String(s.device))) return 'bad device id';
  if (!cleanName(s.name)) return 'name must be 2-16 letters or digits';
  if (!/^[a-z]{2,12}$/.test(String(s.game))) return 'unknown game';
  if (typeof s.value !== 'number' || !Number.isFinite(s.value) || s.value < 0 || s.value > 1e7) return 'bad value';
  if (typeof s.unit !== 'string' || !UNIT.test(s.unit)) return 'bad unit';
  if (typeof s.lower !== 'boolean') return 'bad direction';
  if (![1, 0.5, 2, 0, -60, -180].includes(s.len)) return 'bad length';
  if (!Number.isInteger(s.keys) || s.keys < 0 || s.keys > 6) return 'bad key count';
  if (!Array.isArray(s.flags) || s.flags.length) return 'flagged by fair-play checks';
  if (!Number.isFinite(s.inputs) || s.inputs < 3 || s.inputs > 20000) return 'not enough play';
  if (!Number.isFinite(s.durationMs) || s.durationMs < 4000 || s.durationMs > 4 * 3600 * 1000) return 'implausible duration';
  // Plausibility by unit.
  if (s.unit === '%' && s.value > 100) return 'impossible percentage';
  if ((s.unit === '/s' || s.unit === 'taps a second') && s.value > 25) return 'faster than anyone taps';
  if (s.unit === 'wpm' && s.value > 260) return 'faster than anyone types';
  if (s.unit === '/min' && s.value > 400) return 'implausible rate';
  // Reaction-time headlines: no human median is under 120 ms, and the evidence must agree.
  const rts = Array.isArray(s.rts) ? s.rts.filter((t) => typeof t === 'number' && Number.isFinite(t)) : [];
  if (rts.length >= 5) {
    const med = median(rts);
    if (med < 120) return 'reactions faster than humanly possible';
    if (rts.filter((t) => t < 100).length / rts.length > 0.35) return 'too many impossible reactions';
    const sd = Math.sqrt(rts.reduce((a, t) => a + (t - med) ** 2, 0) / rts.length);
    if (rts.length >= 10 && sd < 4) return 'reactions too uniform to be human';
    // A reaction headline far better than the reaction times it came from has been edited.
    if (s.rtHeadline && s.unit === 'ms' && s.lower && s.value < med * 0.5 - 20) return 'headline does not match the reaction times';
  }
  if (inputsPerSecond(s) > 30) return 'more inputs per second than hands can make';
  return null;
}

function inputsPerSecond(s: Submission): number {
  return s.inputs / Math.max(1, s.durationMs / 1000);
}

/** Board key for a game at a length setting and key count (0 where the count doesn't matter). */
export function boardKey(game: string, len: number, keys = 0): string {
  return `b/${game}/${String(len).replace('-', 'm')}${keys ? `/k${keys}` : ''}`;
}

/** Put an entry on a board, one entry per device (its best), sorted best first, kept to `max`. */
export function insert(board: Entry[], e: Entry, max = 100): { board: Entry[]; rank: number } {
  const better = (a: Entry, b: Entry) => (e.lower ? a.value < b.value : a.value > b.value);
  const mine = board.find((x) => x.device === e.device);
  let next = board;
  if (mine) {
    if (!better(e, mine)) return { board, rank: rankOf(board, e.device) };
    next = board.filter((x) => x.device !== e.device);
  }
  next = [...next, e].sort((a, b) => (e.lower ? a.value - b.value : b.value - a.value) || a.at - b.at).slice(0, max);
  return { board: next, rank: rankOf(next, e.device) };
}

function rankOf(board: Entry[], device: string): number {
  return board.findIndex((x) => x.device === device) + 1;
}

/** Rate limit: true if this device may submit now, given its recent submission times. */
export function allow(times: number[], now: number, perHour = 60): { ok: boolean; times: number[] } {
  const recent = times.filter((t) => now - t < 3600 * 1000);
  if (recent.length >= perHour) return { ok: false, times: recent };
  return { ok: true, times: [...recent, now] };
}
