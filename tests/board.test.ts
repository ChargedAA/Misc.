import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allow, insert, refuse, type Entry, type Submission } from '../src/board.ts';
import { handle, type Store } from '../netlify/functions/scores.ts';

const good = (over: Partial<Submission> = {}): Submission => ({
  device: 'abcdef1234567890',
  name: 'Ada',
  game: 'snap',
  value: 245,
  unit: 'ms',
  lower: true,
  len: 1,
  keys: 2,
  inputs: 18,
  durationMs: 40000,
  rts: [230, 250, 241, 260, 238, 255, 249, 233, 270, 244],
  flags: [],
  ...over,
});

test('a plausible run is accepted', () => {
  assert.equal(refuse(good()), null);
});

test('runs a person could not produce are refused', () => {
  assert.match(refuse(good({ flags: ['scripted'] }))!, /fair-play/);
  assert.match(refuse(good({ rts: [80, 85, 90, 95, 88, 92] }))!, /humanly|impossible/);
  assert.match(refuse(good({ rts: [200, 200, 200, 200, 200, 200, 200, 200, 200, 200] }))!, /uniform/);
  assert.match(refuse(good({ value: 90 }))!, /does not match/);
  assert.match(refuse(good({ unit: '/s', value: 40, rts: [] }))!, /taps/);
  assert.match(refuse(good({ inputs: 2 }))!, /not enough/);
  assert.match(refuse(good({ durationMs: 1000 }))!, /duration/);
  assert.match(refuse(good({ inputs: 5000, durationMs: 10000 }))!, /hands/);
  assert.match(refuse(good({ name: '<' }))!, /name/);
  assert.match(refuse(good({ game: '../x' }))!, /game/);
});

test('one entry per device, best first, and only improvements replace it', () => {
  const e = (device: string, value: number, at = 1): Entry => ({ device, name: device, value, unit: 'ms', lower: true, keys: 2, at });
  let b: Entry[] = [];
  b = insert(b, e('a', 300)).board;
  b = insert(b, e('b', 250)).board;
  assert.deepEqual(b.map((x) => x.device), ['b', 'a']);
  b = insert(b, e('a', 320)).board; // worse: ignored
  assert.equal(b.find((x) => x.device === 'a')!.value, 300);
  const r = insert(b, e('a', 200));
  assert.equal(r.rank, 1);
  assert.equal(r.board.length, 2);
});

test('rate limit: 60 an hour per device', () => {
  let times: number[] = [];
  for (let i = 0; i < 60; i++) times = allow(times, i * 1000).times;
  assert.equal(allow(times, 61000).ok, false);
  assert.equal(allow(times, 3700 * 1000).ok, true);
});

test('the API: submit, read back, refuse junk', async () => {
  const mem = new Map<string, unknown>();
  const store: Store = { get: async (k) => mem.get(k) ?? null, setJSON: async (k, v) => mem.set(k, v) };
  const post = (body: unknown) => handle(new Request('https://x/api/scores', { method: 'POST', body: JSON.stringify(body) }), store);
  const r1 = await (await post(good())).json();
  assert.deepEqual(r1, { ok: true, rank: 1 });
  const r2 = await post(good({ flags: ['x'] }));
  assert.equal(r2.status, 422);
  const list = await (await handle(new Request('https://x/api/scores?game=snap&len=1&keys=2'), store)).json();
  const other = await (await handle(new Request('https://x/api/scores?game=snap&len=1&keys=4'), store)).json();
  assert.equal(other.entries.length, 0, 'a 4-key board is separate from a 2-key one');
  assert.equal(list.entries.length, 1);
  assert.equal(list.entries[0].name, 'Ada');
  assert.equal(list.entries[0].device, undefined, 'device ids are not published');
});
