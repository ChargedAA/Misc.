/**
 * Sliding tap-rate estimator. Rate is n taps over the span they cover (plus one
 * mean interval), and decays smoothly once the next tap is overdue, so it does
 * not quantise to whole taps the way a plain "count in the last second" does.
 * Times are in seconds. No allocation after construction.
 */
export class RateMeter {
  private readonly t: Float64Array;
  private readonly cap: number;
  private head = 0; // index of the next write
  private n = 0;
  readonly window: number;

  constructor(window = 1.25, capacity = 64) {
    this.window = window;
    this.cap = capacity;
    this.t = new Float64Array(capacity);
  }

  reset(): void {
    this.head = 0;
    this.n = 0;
  }

  push(time: number): void {
    this.t[this.head] = time;
    this.head = (this.head + 1) % this.cap;
    if (this.n < this.cap) this.n++;
  }

  rate(now: number): number {
    const cap = this.cap;
    const cutoff = now - this.window;
    // Drop taps that have left the window.
    while (this.n > 0 && this.t[(this.head - this.n + cap) % cap]! < cutoff) this.n--;
    const n = this.n;
    if (n === 0) return 0;
    if (n === 1) return 1 / this.window;
    const first = this.t[(this.head - n + cap) % cap]!;
    const last = this.t[(this.head - 1 + cap) % cap]!;
    const span = last - first;
    if (span <= 0) return 1 / this.window;
    const full = (span * n) / (n - 1);
    const waited = now - first;
    return n / (waited > full ? waited : full);
  }
}
