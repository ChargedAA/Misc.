import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MODES, SLOT_REFLEX, getMode } from '../src/config.ts';
import { Keys, NONE, OUT_CORRECT, OUT_WRONG, ReflexSession, SHADE_GREY, STRIKES, Stim, makeGames } from '../src/reflex.ts';
import { Rng } from '../src/rng.ts';

const LABELS: Record<number, string[]> = {
  1: ['SPACE', '', '', '', '', '', ''],
  2: ['Z', '', '', 'M', '', '', ''],
  3: ['Z', '', '', 'M', '', '', 'SPACE'],
  4: ['Z', 'X', '', 'N', 'M', '', ''],
  5: ['Z', 'X', '', 'N', 'M', '', 'SPACE'],
  6: ['Z', 'X', 'C', 'B', 'N', 'M', ''],
};

function slotsOf(modeId: number): number {
  const m = getMode(modeId);
  return ((1 << m.left) - 1) | (((1 << m.right) - 1) << 3) | (m.reflex ? 1 << SLOT_REFLEX : 0);
}

test('every mini-game asks only for keys the mode has, at every level', () => {
  for (const mode of MODES) {
    const keys = new Keys(mode, LABELS[mode.id]!);
    const have = slotsOf(mode.id);
    const rng = new Rng(mode.id * 101);
    const st = new Stim();
    for (const game of makeGames()) {
      for (let level = 0; level < 6; level++) {
        const lines = game.setup(level, keys, rng);
        assert.ok(lines.length >= 1 && lines.length <= 6, `${game.name}: ${lines.length} rule lines`);
        for (const l of lines) assert.ok(l.text.length > 0);
        let go = 0;
        let hold = 0;
        for (let i = 0; i < 120; i++) {
          const a = game.trial(st, keys, rng, i);
          assert.ok(a.groups.length <= 2);
          for (const g of a.groups) {
            assert.ok(g !== 0, `${game.name}: empty group`);
            assert.equal(g & ~have, 0, `${game.name} keys ${mode.id} level ${level}: asks for a key that is not bound`);
          }
          if (a.groups.length === 2) assert.equal(a.groups[0]! & a.groups[1]!, 0, 'a two-key answer uses two different keys');
          if (a.groups.length) go++;
          else hold++;
          assert.ok(st.x >= -1 && st.x <= 1 && st.y >= -1 && st.y <= 1);
        }
        assert.ok(go > 10, `${game.name} keys ${mode.id} level ${level}: only ${go} of 120 need a press`);
        if (mode.id === 1) assert.ok(hold > 5, `${game.name} with one key needs some "do not press" trials`);
      }
    }
  }
});

test('rules: anything grey overrides the shape, and means both keys with two keys', () => {
  const keys = new Keys(getMode(2), LABELS[2]!);
  const rng = new Rng(7);
  const rules = makeGames()[0]!;
  const lines = rules.setup(1, keys, rng);
  assert.equal(lines[0]!.text, 'anything grey');
  assert.equal(lines[0]!.answer, keys.both);
  assert.equal(lines[lines.length - 2]!.answer, NONE);
  const st = new Stim();
  let grey = 0;
  for (let i = 0; i < 300; i++) {
    const a = rules.trial(st, keys, rng, i);
    if (st.shade === SHADE_GREY) {
      assert.equal(a, keys.both);
      grey++;
    } else {
      assert.ok(a.groups.length <= 1, 'white shapes never need both keys');
    }
  }
  assert.ok(grey > 40);
});

function rtFor(game: string): number {
  return game === 'CABLE' ? 200 : game === 'ARROWS' ? 240 : 300;
}

/** Play a session by reading the expected answer. `mistake` decides when to press wrongly. */
function playSession(modeId: number, seed: number, rounds: number, mistake: (trial: number) => boolean) {
  const s = new ReflexSession();
  s.start(getMode(modeId), LABELS[modeId]!, 0, seed);
  const have = slotsOf(modeId);
  let now = 0;
  let trial = 0;
  let answered = false;
  let pressAt = 0;
  while (!s.done && s.roundsCleared < rounds && now < 600000) {
    now += 4;
    if (s.briefing) s.ready(now);
    const before = s.expected;
    s.update(now);
    const exp = s.expected;
    if (exp && before !== exp) {
      // A new stimulus: it is "drawn" now and answered a little later. Like a
      // person, the plain go signal gets a faster answer than a rule lookup.
      s.markDrawn(now);
      answered = false;
      pressAt = now + rtFor(s.gameName);
      trial++;
    }
    if (exp && !answered && now >= pressAt) {
      answered = true;
      if (mistake(trial)) {
        // Press something the answer does not allow (or anything, if it wants no press).
        let wrong = -1;
        const allowed = exp.groups.reduce((a, g) => a | g, 0);
        for (let slot = 0; slot < 7; slot++) if (have & (1 << slot) && !(allowed & (1 << slot))) wrong = slot;
        if (wrong < 0 && exp.groups.length === 0) wrong = 0;
        if (wrong >= 0) assert.equal(s.onPress(wrong, now), OUT_WRONG);
        else answered = false; // every key is right for this one ("any key")
      }
      if (!answered) {
        answered = true;
      } else if (!mistake(trial)) {
        exp.groups.forEach((g, i) => {
          const slot = 31 - Math.clz32(g & -g);
          const out = s.onPress(slot, now + i * 20);
          if (i === exp.groups.length - 1) assert.equal(out, OUT_CORRECT);
        });
      }
    }
  }
  return s;
}

test('a player who follows the rules clears rounds with no strikes, in every key mode', () => {
  for (const mode of MODES) {
    const s = playSession(mode.id, 1234 + mode.id, 8, () => false);
    assert.equal(s.roundsCleared, 8, `keys ${mode.id}: rounds`);
    assert.equal(s.strikes, 0);
    assert.equal(s.wrong + s.late + s.early, 0, `keys ${mode.id}: no errors`);
    assert.equal(s.correct, s.trials);
    assert.ok(s.n > 20, 'reaction times were logged');
    for (let i = 0; i < s.n; i++) assert.ok(s.rts[i]! >= 196 && s.rts[i]! <= 304, `rt ${s.rts[i]}`);
    assert.ok(s.windowMs < 1250, 'the window shrank');
    assert.ok(s.score > 0);
    let games = 0;
    for (let g = 0; g < 6; g++) if (s.gTried[g]! > 0) games++;
    assert.ok(games >= 5, `keys ${mode.id}: only ${games} different mini-games in 8 rounds`);
  }
});

test('three wrong answers end the session', () => {
  const s = playSession(2, 99, 50, (trial) => trial === 2 || trial === 4 || trial === 6);
  assert.ok(s.done);
  assert.equal(s.strikes, STRIKES);
  assert.equal(s.wrong, 3);
  assert.equal(s.trials, 6);
});

test('too slow, half a two-key answer, and pressing with nothing on screen all count against you', () => {
  // Never answering: the first stimulus that needs a press times out.
  const slow = new ReflexSession();
  slow.start(getMode(2), LABELS[2]!, 0, 5);
  let now = 0;
  while (slow.late === 0 && now < 60000) {
    now += 4;
    if (slow.briefing) slow.ready(now);
    slow.update(now);
    if (slow.expected) slow.markDrawn(now);
  }
  assert.equal(slow.late, 1);
  assert.equal(slow.strikes, 1);

  // Only one key of a "both" answer.
  const half = new ReflexSession();
  half.start(getMode(2), LABELS[2]!, 0, 5);
  now = 0;
  let pressed = false;
  while (half.wrong === 0 && now < 600000) {
    now += 4;
    if (half.briefing) half.ready(now);
    half.update(now);
    const exp = half.expected;
    if (!exp) {
      pressed = false;
      continue;
    }
    half.markDrawn(now - 200);
    if (pressed) continue;
    pressed = true;
    if (exp.groups.length === 2) half.onPress(0, now);
    else exp.groups.forEach((g) => half.onPress(31 - Math.clz32(g & -g), now));
  }
  assert.equal(half.wrong, 1, 'half a chord is a wrong answer');

  // A press in the gap before anything appears.
  const early = new ReflexSession();
  early.start(getMode(2), LABELS[2]!, 0, 5);
  early.ready(1000);
  early.update(1004);
  early.onPress(0, 1300);
  assert.equal(early.early, 1);
});
