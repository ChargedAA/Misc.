# TENSION (working title)

Three small games that train the same things: fast, accurate presses with one
to six keys. Pick one on the title screen, then choose how many keys to use.
Works with a keyboard or a touch screen.

```bash
npm install
npm run dev
```

## Climb

A ball rides a beam that climbs forever up a board full of holes.

- **Dash.** A tap on a side snaps the ball one lane that way. With two or three
  keys per side, the outer keys dash further.
- **Surge.** Both sides at the same moment jerk the beam up the board and carry
  the ball over whatever is in between: a hole, a wide pit, or a bar across
  every lane. Then it recharges (the ball is hollow until it is ready).
- **Cables.** When a cable turns orange, catch it: the reflex key, or a tap on
  that side in modes without one. Miss, and the ball slides a lane toward it.
- **Heavy pull.** The beam thickens and a meter appears. Tap both sides at the
  target rate until it fills. The target rises each time.
- **Pickups.** Diamonds build a chain (up to x5 score). It decays if you stop
  collecting, and a missed cable breaks it.

The board moves through named sections (holes, pits, bars, sliders, mix), and
the climb, hole density and event rate all ramp up the longer you last.

With one key the ball stays in the middle lane and the key only surges, so the
game becomes timing every jump.

## Reflex

A reaction test that keeps changing the question. Each round is one of six
mini-games with freshly shuffled rules, shown on a card first:

- **Rules:** shapes map to keys, "anything grey" means both keys at once,
  anything else means no press. Later rounds add overrides.
- **Arrows:** the side it points to, the side it points away from, or the side
  of the screen it is on, depending on the round.
- **Odd one:** find the shape or shade that differs; sometimes there is none.
- **More:** which side has more (or fewer) dots, ignoring grey ones.
- **Same:** is it the same as the one before?
- **Cable:** orange means go, grey means hold.

Stimuli appear at shuffled positions. Wrong, too slow and too early each cost a
strike; three strikes end the session, and a clean round gives one back. The
response window adapts to your pace. The rules stay on screen for the first two
rounds only.

## Burst

Hold a target tap rate for five seconds, rest, and the target rises. Tracks
peak and sustained rate, each key's share and timing, and repeats (the same key
twice where you meant to alternate). Two drops at one target end it.

## Keys

| Keys | Left | Right | Reflex |
| --- | --- | --- | --- |
| 1 | `Space` | | |
| 2 | `Z` | `M` | |
| 3 | `Z` | `M` | `Space` |
| 4 | `Z` `X` | `N` `M` | |
| 5 | `Z` `X` | `N` `M` | `Space` |
| 6 | `Z` `X` `C` | `B` `N` `M` | |

Every key can be rebound per key count under **Keys**. Bindings follow the
physical key position, not the printed letter.

| Key | Action |
| --- | --- |
| `Enter` | Start, again |
| `Esc` | Pause, finish, back |
| `` ` `` | FPS and frame-time overlay |
| `0` | Mute (menus and pause) |
| `C` `R` `B` `S` `K` | Title shortcuts: Climb, Reflex, Burst, Stats, Keys |

**Touch:** pads appear in the bottom corners once you touch the screen (outer
key at the edge, reflex above), and the corner button pauses or finishes. Two
thumbs at once is a surge, or a two-key answer in Reflex.

## Stats

After each session: reaction average, median, best, standard deviation and a
histogram; peak and sustained tap rate with per-key and per-hand evenness;
score, height and survival time; per-mini-game accuracy in Reflex. Everything
is kept in `localStorage`, and **Stats** plots each metric across sessions with
a 5-session moving average. History can be exported as JSON.

Reaction times run from the frame a stimulus was drawn (`performance.now()`) to
the input's `event.timeStamp`, so they include display and input latency.

## Tech

Vite and TypeScript, no framework, Canvas 2D.

- Climb runs on a fixed 480 Hz simulation with render interpolation, and input
  is applied to the tick its timestamp falls in, so a run plays out the same at
  60 and 240 fps (`tests/sim.test.ts` checks this).
- Rendering uses `requestAnimationFrame` at the display rate, scaled for
  `devicePixelRatio`. The game loop does not allocate.
- Sound is a handful of procedural Web Audio buffers. No assets, no music.

```bash
npm run build     # type-check, then static build to dist/
npm run preview   # serve dist/
npm test          # unit tests (node --test)
npm run bot       # headless bot for checking Climb's difficulty curve
```

`netlify.toml` builds with `npm run build` and publishes `dist`.
