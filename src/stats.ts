// Pure statistics over reaction times and tap logs. Runs once at the end of a
// run, so clarity matters more than allocation here.

export interface RtStats {
  n: number;
  avg: number;
  median: number;
  best: number;
  sd: number;
}

export function rtStats(samples: ArrayLike<number>, n = samples.length): RtStats {
  if (n === 0) return { n: 0, avg: 0, median: 0, best: 0, sd: 0 };
  const a = new Float64Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    a[i] = samples[i]!;
    sum += a[i]!;
  }
  a.sort();
  const avg = sum / n;
  let sq = 0;
  for (let i = 0; i < n; i++) sq += (a[i]! - avg) * (a[i]! - avg);
  const mid = n >> 1;
  return {
    n,
    avg,
    median: n % 2 ? a[mid]! : (a[mid - 1]! + a[mid]!) / 2,
    best: a[0]!,
    sd: n > 1 ? Math.sqrt(sq / (n - 1)) : 0,
  };
}

export interface Histogram {
  start: number;
  bin: number;
  counts: number[];
}

export function histogram(samples: ArrayLike<number>, n = samples.length, bin = 20): Histogram {
  if (n === 0) return { start: 0, bin, counts: [] };
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = samples[i]!;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const start = Math.floor(lo / bin) * bin;
  const bins = Math.max(1, Math.floor((hi - start) / bin) + 1);
  const counts = new Array<number>(bins).fill(0);
  for (let i = 0; i < n; i++) counts[Math.min(bins - 1, Math.floor((samples[i]! - start) / bin))]!++;
  return { start, bin, counts };
}

/**
 * Highest tap rate (taps per second) held across any window of `windowMs`.
 * Returns 0 when the log does not span a full window.
 */
export function sustainedRate(times: ArrayLike<number>, n: number, windowMs: number): number {
  if (n < 2 || times[n - 1]! - times[0]! < windowMs * 0.98) return 0;
  let best = 0;
  let j = 0;
  for (let i = 0; i < n; i++) {
    while (times[i]! - times[j]! > windowMs) j++;
    const c = i - j + 1;
    if (c > best) best = c;
  }
  return best / (windowMs / 1000);
}

/** Peak rate: the most taps landed inside any one-second window. */
export function peakRate(times: ArrayLike<number>, n: number): number {
  if (n === 0) return 0;
  let best = 0;
  let j = 0;
  for (let i = 0; i < n; i++) {
    while (times[i]! - times[j]! > 1000) j++;
    const c = i - j + 1;
    if (c > best) best = c;
  }
  return best;
}

export interface KeyStat {
  /** Slot id: side * 3 + key index. */
  slot: number;
  taps: number;
  /** Fraction of all taps. */
  share: number;
  /** Fraction of this hand's taps. */
  handShare: number;
  /** Coefficient of variation of this key's press-to-press interval (0 = metronome). */
  jitter: number;
}

export interface HandStat {
  taps: number;
  share: number;
  peak: number;
  s5: number;
  s10: number;
  /** Weakest key / strongest key on this hand, 0..1. 1 when the hand has one key. */
  evenness: number;
}

export interface CpsStats {
  taps: number;
  peak: number;
  s5: number;
  s10: number;
  keys: KeyStat[];
  hands: [HandStat, HandStat];
  /** Weaker hand / stronger hand, 0..1. */
  handEvenness: number;
  /** Same key twice in a row within its alternation group. */
  repeats: number;
  /** Taps that had a chance to alternate (groups with more than one key). */
  alternations: number;
  repeatRate: number;
}

/**
 * @param slots     slot ids in play, e.g. [0, 1, 3, 4] for the 4-key mode
 * @param crossHand when true (one key per hand) the two hands form a single
 *                  alternation group, so L L counts as a repeat.
 */
export function cpsStats(
  times: ArrayLike<number>,
  keys: ArrayLike<number>,
  n: number,
  slots: readonly number[],
  crossHand = false,
): CpsStats {
  const perKeyT: number[][] = [];
  for (let s = 0; s < 6; s++) perKeyT.push([]);
  const handT: [number[], number[]] = [[], []];
  let repeats = 0;
  let grouped = 0;
  const last = [-1, -1];
  // A group only has alternation to get wrong if it holds more than one key.
  const leftKeys = slots.filter((s) => s < 3).length;
  const groupSize = crossHand ? [slots.length, slots.length] : [leftKeys, slots.length - leftKeys];
  for (let i = 0; i < n; i++) {
    const k = keys[i]!;
    const hand = k >= 3 ? 1 : 0;
    perKeyT[k]!.push(times[i]!);
    handT[hand].push(times[i]!);
    const g = crossHand ? 0 : hand;
    if (groupSize[g]! > 1) {
      if (last[g]! >= 0) {
        grouped++;
        if (last[g] === k) repeats++;
      }
      last[g] = k;
    }
  }

  const keyStats: KeyStat[] = slots.map((slot) => {
    const t = perKeyT[slot]!;
    const hand = slot >= 3 ? 1 : 0;
    return {
      slot,
      taps: t.length,
      share: n ? t.length / n : 0,
      handShare: handT[hand].length ? t.length / handT[hand].length : 0,
      jitter: intervalCv(t),
    };
  });

  const hands = [0, 1].map((hand) => {
    const t = handT[hand as 0 | 1];
    const mine = keyStats.filter((k) => (k.slot >= 3 ? 1 : 0) === hand);
    let lo = Infinity;
    let hi = 0;
    for (const k of mine) {
      if (k.taps < lo) lo = k.taps;
      if (k.taps > hi) hi = k.taps;
    }
    return {
      taps: t.length,
      share: n ? t.length / n : 0,
      peak: peakRate(t, t.length),
      s5: sustainedRate(t, t.length, 5000),
      s10: sustainedRate(t, t.length, 10000),
      evenness: mine.length > 1 && hi > 0 ? lo / hi : 1,
    };
  }) as [HandStat, HandStat];

  const a = hands[0].taps;
  const b = hands[1].taps;
  return {
    taps: n,
    peak: peakRate(times, n),
    s5: sustainedRate(times, n, 5000),
    s10: sustainedRate(times, n, 10000),
    keys: keyStats,
    hands,
    handEvenness: a > 0 && b > 0 ? Math.min(a, b) / Math.max(a, b) : a + b > 0 ? 0 : 1,
    repeats,
    alternations: grouped,
    repeatRate: grouped ? repeats / grouped : 0,
  };
}

/** CV of the gaps between presses, ignoring rests longer than a second. */
function intervalCv(t: number[]): number {
  let sum = 0;
  let c = 0;
  for (let i = 1; i < t.length; i++) {
    const d = t[i]! - t[i - 1]!;
    if (d <= 1000) {
      sum += d;
      c++;
    }
  }
  if (c < 2) return 0;
  const mean = sum / c;
  let sq = 0;
  for (let i = 1; i < t.length; i++) {
    const d = t[i]! - t[i - 1]!;
    if (d <= 1000) sq += (d - mean) * (d - mean);
  }
  return mean > 0 ? Math.sqrt(sq / (c - 1)) / mean : 0;
}

/** Trailing moving average used for the trend lines. */
export function movingAverage(values: readonly number[], window = 5): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= window) sum -= values[i - window]!;
    out.push(sum / Math.min(i + 1, window));
  }
  return out;
}
