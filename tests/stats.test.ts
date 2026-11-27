import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RateMeter } from '../src/rate.ts';
import { cpsStats, histogram, movingAverage, peakRate, rtStats, sustainedRate } from '../src/stats.ts';

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} !~ ${b}`);

test('rtStats: average, median, best, sd', () => {
  const s = rtStats([200, 240, 220, 260]);
  assert.equal(s.n, 4);
  near(s.avg, 230);
  near(s.median, 230);
  near(s.best, 200);
  near(s.sd, Math.sqrt(2000 / 3));
  near(rtStats([300, 100, 200]).median, 200);
  assert.deepEqual(rtStats([]), { n: 0, avg: 0, median: 0, best: 0, sd: 0 });
});

test('histogram bins by 20 ms', () => {
  const h = histogram([201, 219, 220, 259], 4, 20);
  assert.equal(h.start, 200);
  assert.deepEqual(h.counts, [2, 1, 1]);
});

test('peak and sustained tap rates', () => {
  // 10 taps per second for 12 seconds.
  const t: number[] = [];
  for (let i = 0; i < 120; i++) t.push(i * 100);
  assert.equal(peakRate(t, t.length), 11); // a closed 1 s window holds 11 taps at 10 Hz
  near(sustainedRate(t, t.length, 5000), 51 / 5);
  near(sustainedRate(t, t.length, 10000), 101 / 10);
  // Too short to cover the window.
  assert.equal(sustainedRate(t, 30, 5000), 0);
});

test('cpsStats: shares, hand evenness and repeats per hand', () => {
  // 4-key mode: left hand alternates cleanly, right hand repeats key 3 once.
  const keys = [0, 1, 0, 1, 3, 3, 4, 3];
  const times = keys.map((_, i) => i * 120);
  const c = cpsStats(times, keys, keys.length, [0, 1, 3, 4], false);
  assert.equal(c.taps, 8);
  assert.equal(c.repeats, 1);
  assert.equal(c.alternations, 6);
  near(c.hands[0].share, 0.5);
  near(c.hands[0].evenness, 1);
  near(c.hands[1].evenness, 1 / 3);
  near(c.handEvenness, 1);
  near(c.keys[0]!.share, 0.25);
});

test('cpsStats: one key per hand never counts repeats unless hands alternate', () => {
  const keys = [0, 3, 0, 0, 3, 3];
  const times = keys.map((_, i) => i * 150);
  assert.equal(cpsStats(times, keys, keys.length, [0, 3], false).alternations, 0);
  const cross = cpsStats(times, keys, keys.length, [0, 3], true);
  assert.equal(cross.repeats, 2);
  assert.equal(cross.alternations, 5);
});

test('RateMeter tracks a steady rate and decays when tapping stops', () => {
  const m = new RateMeter(1.25);
  let t = 0;
  for (let i = 0; i < 20; i++) {
    t = i * 0.2;
    m.push(t);
  }
  near(m.rate(t), 5, 1e-9);
  near(m.rate(t + 0.1), 5, 1e-9);
  assert.ok(m.rate(t + 0.6) < 4.5);
  assert.equal(m.rate(t + 5), 0);
});

test('movingAverage is a trailing mean', () => {
  assert.deepEqual(movingAverage([2, 4, 6, 8], 2), [2, 3, 5, 7]);
});
