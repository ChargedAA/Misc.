// Fair-play checks on a run's input. Each one looks for something a person cannot do:
//   - events a script made rather than a keyboard, mouse or finger (browsers mark those untrusted)
//   - tapping more evenly than any human hand (a timer, not a finger)
//   - reacting faster than nerves carry a signal, again and again
// A run that trips one still shows its result, but it is marked unverified: it sets no best and
// goes on no leaderboard.

export interface Verdict {
  ok: boolean;
  flags: string[];
}

export class Integrity {
  private untrusted = 0;
  private presses: number[] = [];

  reset(): void {
    this.untrusted = 0;
    this.presses = [];
  }

  /** Every press or tap that reaches a game. */
  note(e: Event, ts: number): void {
    if (!e.isTrusted) this.untrusted++;
    this.presses.push(ts);
  }

  /** Judge the run; `rts` are its reaction times when it measures them. */
  verdict(rts: readonly number[] = []): Verdict {
    const flags: string[] = [];
    if (this.untrusted > 0) flags.push(`${this.untrusted} input event${this.untrusted === 1 ? '' : 's'} came from a script, not a keyboard, mouse or touch`);
    // Timing regularity: over a long enough run of presses, people vary by several percent.
    const gaps = this.presses.slice(1).map((t, i) => t - this.presses[i]!).filter((g) => g > 15 && g < 1500);
    if (gaps.length >= 25) {
      const m = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      const sd = Math.sqrt(gaps.reduce((a, b) => a + (b - m) ** 2, 0) / gaps.length);
      if (m > 0 && sd / m < 0.012) flags.push('presses were spaced more evenly than a person can tap');
    }
    // Reactions: an occasional lucky guess under 100 ms happens; a run of them does not.
    if (rts.length >= 6) {
      const fast = rts.filter((t) => t < 100).length;
      if (fast / rts.length > 0.35) flags.push('too many reactions under 100 ms, faster than a signal travels from eye to finger');
    }
    return { ok: flags.length === 0, flags };
  }
}
