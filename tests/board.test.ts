import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allow, cleanName, insert, nameKey, refuse, type Entry, type Submission } from '../src/board.ts';
import { handle, type Store, type Verify } from '../netlify/functions/api.ts';

const good = (over: Partial<Submission> = {}): Submission => ({
  game: 'snap',
  value: 245,
  unit: 'ms',
  lower: true,
  len: 1,
  keys: 2,
  inputs: 18,
  durationMs: 40000,
  rts: [230, 250, 241, 260, 238, 255, 249, 233, 270, 244],
  rtHeadline: true,
  flags: [],
  ...over,
});

test('names are cleaned, and unique regardless of case and spacing', () => {
  assert.equal(cleanName('  Ada <b>L</b> '), 'Ada bLb');
  assert.equal(cleanName('x'), null);
  assert.equal(nameKey('Ada L'), nameKey('ada_l'));
});

test('a plausible run is accepted', () => {
  assert.equal(refuse(good()), null);
});

test('runs a person could not produce are refused', () => {
  assert.match(refuse(good({ flags: ['scripted'] }))!, /fair-play/);
  assert.match(refuse(good({ rts: [60, 70, 65, 80, 75, 70] }))!, /humanly|impossible/);
  assert.match(refuse(good({ rts: Array(12).fill(200) }))!, /uniform/);
  assert.match(refuse(good({ value: 90 }))!, /does not match/);
  assert.match(refuse(good({ unit: '%', value: 140 }))!, /percentage/);
  assert.match(refuse(good({ inputs: 2000, durationMs: 10000 }))!, /per second/);
  assert.match(refuse(good({ durationMs: 1000 }))!, /duration/);
});

test('a reaction headline must agree with its reaction times; other ms headlines need not', () => {
  assert.match(refuse(good({ value: 80, rtHeadline: true }))!, /does not match/);
  // Stream's headline is the letter speed (ms per letter), unrelated to how fast the X was hit.
  assert.equal(refuse(good({ value: 80, rtHeadline: false })), null);
});

test('boards keep one entry per player, their best, and every player', () => {
  const e = (uid: string, value: number): Entry => ({ uid, name: uid, value, unit: 'ms', lower: true, keys: 2, at: value });
  let b: Entry[] = [];
  for (let i = 0; i < 300; i++) b = insert(b, e(`p${i}`, 400 - i * 0.5)).board;
  assert.equal(b.length, 300, 'no top-N cut-off');
  assert.equal(b[0]!.uid, 'p299');
  const worse = insert(b, e('p0', 500));
  assert.equal(worse.improved, false);
  assert.equal(worse.board.length, 300);
  const better = insert(b, e('p0', 100));
  assert.equal(better.rank, 1);
  assert.equal(better.board.length, 300);
});

test('rate limit: 60 an hour per account', () => {
  let times: number[] = [];
  for (let i = 0; i < 60; i++) times = allow(times, i * 1000).times;
  assert.equal(allow(times, 61000).ok, false);
  assert.equal(allow(times, 3700 * 1000).ok, true);
});

/** A server with an in-memory store and a stand-in for Google: "google:<sub>" signs in as <sub>. */
function server() {
  const mem = new Map<string, unknown>();
  const store: Store = { get: async (k) => mem.get(k) ?? null, setJSON: async (k, v) => void mem.set(k, structuredClone(v)), delete: async (k) => void mem.delete(k) };
  const verify: Verify = async (c) => (c.startsWith('google:') ? { sub: c.slice(7), given: 'Ada' } : null);
  const call = async (path: string, init: { method?: string; body?: unknown; token?: string } = {}) => {
    const res = await handle(
      new Request(`https://x${path}`, {
        method: init.method ?? (init.body ? 'POST' : 'GET'),
        body: init.body ? JSON.stringify(init.body) : undefined,
        headers: init.token ? { authorization: `Bearer ${init.token}` } : {},
      }),
      { store, verify },
    );
    return { status: res.status, data: (await res.json()) as Record<string, any> };
  };
  const signIn = async (sub: string, name?: string) => {
    const r = await call('/api/auth', { body: { credential: `google:${sub}` } });
    assert.equal(r.status, 200);
    if (name) assert.equal((await call('/api/name', { body: { name }, token: r.data.token })).status, 200);
    return r.data.token as string;
  };
  return { call, signIn, mem };
}

test('accounts: sign in, choose a unique name, sessions cannot be forged', async () => {
  const { call, signIn } = server();
  assert.equal((await call('/api/auth', { body: { credential: 'forged' } })).status, 401);
  const first = await call('/api/auth', { body: { credential: 'google:111' } });
  assert.equal(first.data.name, null);
  assert.equal(first.data.suggested, 'Ada');
  const a = first.data.token as string;
  assert.equal((await call('/api/scores', { body: good(), token: a })).status, 403, 'a name comes first');
  assert.equal((await call('/api/name', { body: { name: 'Ada' }, token: a })).status, 200);
  const b = await signIn('222');
  assert.equal((await call('/api/name', { body: { name: 'ada' }, token: b })).status, 409, 'taken, whatever the case');
  assert.equal((await call('/api/me', { token: a })).data.name, 'Ada');
  // Signing in again is the same account.
  const again = await call('/api/auth', { body: { credential: 'google:111' } });
  assert.equal(again.data.name, 'Ada');
  // Tampering with a token breaks it.
  const [uid, exp, sig] = a.split('.');
  assert.equal((await call('/api/me', { token: `${uid}.${Number(exp) + 1}.${sig}` })).status, 401);
  assert.equal((await call('/api/scores', { body: good() })).status, 401, 'no session, no score');
});

test('scores: every player on a board, pages, boards list, player pages, renames', async () => {
  const { call, signIn } = server();
  const players: string[] = [];
  for (let i = 0; i < 60; i++) {
    const t = await signIn(`u${i}`, `P${i}`);
    players.push(t);
    const r = await call('/api/scores', { body: good({ value: 300 - i }), token: t });
    assert.equal(r.status, 200, JSON.stringify(r.data));
  }
  // A worse run doesn't replace a best.
  assert.equal((await call('/api/scores', { body: good({ value: 400 }), token: players[0] })).data.improved, false);
  const page1 = await call('/api/scores?game=snap&len=1&keys=2&limit=50');
  assert.equal(page1.data.total, 60);
  assert.equal(page1.data.entries.length, 50);
  assert.deepEqual([page1.data.entries[0].rank, page1.data.entries[0].name], [1, 'P59']);
  const page2 = await call('/api/scores?game=snap&len=1&keys=2&offset=50&limit=50');
  assert.equal(page2.data.entries.length, 10);
  assert.deepEqual([page2.data.entries[9].rank, page2.data.entries[9].name], [60, 'P0']);
  assert.equal(page2.data.entries[0].uid, undefined, 'account ids are not published');
  // Another board: separate, and listed.
  await call('/api/scores', { body: good({ game: 'sprint', unit: '', value: 90, lower: false, rts: [], rtHeadline: false, keys: 4 }), token: players[3] });
  assert.equal((await call('/api/scores?game=snap&len=1&keys=4')).data.total, 0);
  const boards = (await call('/api/boards')).data.boards as { game: string; count: number; top: { name: string } }[];
  assert.deepEqual(boards.map((b) => [b.game, b.count, b.top.name]).sort(), [['snap', 60, 'P59'], ['sprint', 1, 'P3']]);
  // A player's page: their best everywhere.
  const p3 = await call('/api/player?name=p3');
  assert.deepEqual(p3.data.bests.map((b: { game: string }) => b.game).sort(), ['snap', 'sprint']);
  // Renaming shows everywhere.
  assert.equal((await call('/api/name', { body: { name: 'Leader' }, token: players[59] })).status, 200);
  assert.equal((await call('/api/scores?game=snap&len=1&keys=2&limit=1')).data.entries[0].name, 'Leader');
  assert.equal(((await call('/api/boards')).data.boards as { game: string; top: { name: string } }[]).find((b) => b.game === 'snap')!.top.name, 'Leader');
  assert.equal((await call('/api/player?name=P59')).status, 404, 'the old name is free again');
});
