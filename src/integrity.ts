// Fair-play checks on a run. Each one looks for something a person at a normal browser cannot do:
//   - events a script made rather than a keyboard, mouse or finger (browsers mark those untrusted)
//   - a browser driven by automation software (Selenium, Puppeteer, Playwright set a flag)
//   - the page's timing functions swapped out by a script (how speed hacks and replay bots hook in)
//   - the game clock running faster or slower than the wall clock (speed-hack extensions)
//   - tapping more evenly than any human hand (a timer, not a finger)
//   - holding keys for the same length every time (auto-clickers send fixed-length presses)
//   - more presses a second than fingers can make
//   - reacting faster than nerves carry a signal, again and again
// A run that trips one still shows its result, but it is marked unverified: it sets no best and
// goes on no leaderboard.

export interface Verdict {
  ok: boolean;
  flags: string[];
}

/** What the checks need from the browser; tests pass their own. */
export interface Env {
  webdriver: boolean;
  /** Names of timing or event functions that are not the browser's own. */
  patched: string[];
  wall: () => number;
}

const NATIVE = /\{\s*\[native code\]\s*\}\s*$/;

/** True if a function is still the browser's built-in one. */
function native(f: unknown): boolean {
  try {
    return typeof f === 'function' && NATIVE.test(Function.prototype.toString.call(f));
  } catch {
    return false;
  }
}

export function browserEnv(dev = false): Env {
  const g = globalThis as typeof globalThis & { performance?: Performance; requestAnimationFrame?: unknown; navigator?: Navigator };
  const checks: [string, unknown][] = [
    ['performance.now', g.performance?.now],
    ['Date.now', Date.now],
    ['requestAnimationFrame', g.requestAnimationFrame],
    ['dispatchEvent', typeof EventTarget !== 'undefined' ? EventTarget.prototype.dispatchEvent : undefined],
    ['addEventListener', typeof EventTarget !== 'undefined' ? EventTarget.prototype.addEventListener : undefined],
  ];
  const patched = checks.filter(([, f]) => f !== undefined && !native(f)).map(([n]) => n);
  // The dev server is driven by test bots, so automation is only held against a run on the real site.
  return { webdriver: !dev && g.navigator?.webdriver === true, patched, wall: () => Date.now() };
}

export class Integrity {
  private untrusted = 0;
  private presses: number[] = [];
  private down = new Map<string, number>();
  private holds: number[] = [];
  private startPerf = 0;
  private startWall = 0;

  private env: () => Env;

  constructor(env: () => Env = () => browserEnv()) {
    this.env = env;
  }

  /** A run starts: clear everything and note both clocks. */
  reset(perfNow = performance.now()): void {
    this.untrusted = 0;
    this.presses = [];
    this.down.clear();
    this.holds = [];
    this.startPerf = perfNow;
    this.startWall = this.env().wall();
  }

  /** Every press or tap that reaches a game. `key` names the key, for hold times. */
  note(e: Event, ts: number, key?: string): void {
    if (!e.isTrusted) this.untrusted++;
    this.presses.push(ts);
    if (key) this.down.set(key, ts);
  }

  /** A key let go: how long it was held. */
  noteUp(key: string, ts: number): void {
    const t = this.down.get(key);
    if (t === undefined) return;
    this.down.delete(key);
    const held = ts - t;
    if (held > 0 && held < 2000) this.holds.push(held);
  }

  /** Judge the run; `rts` are its reaction times when it measures them. */
  verdict(rts: readonly number[] = [], perfNow = performance.now()): Verdict {
    const flags: string[] = [];
    const env = this.env();
    if (this.untrusted > 0) flags.push(`${this.untrusted} input event${this.untrusted === 1 ? '' : 's'} came from a script, not a keyboard, mouse or touch`);
    if (env.webdriver) flags.push('the browser is being driven by automation software');
    if (env.patched.length) flags.push(`a script replaced the page's ${env.patched.join(', ')}`);
    // Clocks: over a run of 5 s or more, the game's clock and the wall clock agree within a few
    // percent unless something is speeding one of them up or slowing it down.
    const perfSpan = perfNow - this.startPerf;
    const wallSpan = env.wall() - this.startWall;
    if (perfSpan > 5000 && wallSpan > 0) {
      const ratio = perfSpan / wallSpan;
      if (ratio < 0.9 || ratio > 1.1) flags.push(`the game clock ran at ${Math.round(ratio * 100)}% of real time`);
    }
    // Timing regularity: over a long enough run of presses, people vary by several percent.
    const gaps = this.presses.slice(1).map((t, i) => t - this.presses[i]!).filter((g) => g > 15 && g < 1500);
    if (gaps.length >= 25 && cv(gaps) < 0.012) flags.push('presses were spaced more evenly than a person can tap');
    // Hold times: a finger never holds a key for the same few milliseconds thirty times running.
    if (this.holds.length >= 30 && cv(this.holds) < 0.02) flags.push('every key was held for the same length of time, like an auto-clicker');
    // Sustained rate: the fastest tappers manage about 16 a second with several fingers.
    if (this.presses.length >= 40) {
      const span = this.presses[this.presses.length - 1]! - this.presses[0]!;
      if (span > 0 && (this.presses.length - 1) / (span / 1000) > 30) flags.push('more presses a second than fingers can make');
    }
    // Reactions: an occasional lucky guess under 100 ms happens; a run of them does not.
    if (rts.length >= 6) {
      const fast = rts.filter((t) => t < 100).length;
      if (fast / rts.length > 0.35) flags.push('too many reactions under 100 ms, faster than a signal travels from eye to finger');
    }
    return { ok: flags.length === 0, flags };
  }
}

/** Coefficient of variation: spread relative to the mean. */
function cv(a: readonly number[]): number {
  const m = a.reduce((x, y) => x + y, 0) / a.length;
  if (m <= 0) return 1;
  const sd = Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length);
  return sd / m;
}
