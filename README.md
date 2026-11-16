# TENSION (working title)

A ball sits on a beam hung from two cables. Tap to lift each end, tilt the beam,
and roll the ball past the holes while the board scrolls by. It never ends: the
climb gets faster, the holes denser and the events more frequent the longer you
last. It also keeps score of your reaction time and tap speed, so it doubles as
a practice tool.

## Play

```bash
npm install
npm run dev
```

Open the printed URL, pick a key mode with `1`-`6`, press `Enter`.

- **Taps are lift.** Every tap kicks that end of the beam upward. Both ends sag
  all the time, so how fast you tap sets how high the end sits. Tap one side
  faster than the other to tilt.
- **Holes** end the run. **Dashed zones** triple your score while the ball is inside.
- **A cable turns orange:** it is slipping. Hit the reflex key (or, in modes
  without one, any key on that side) before the colour burns down, or the beam
  lurches. Pressing reflex with no cue showing is a false start and costs a jolt.
- **Heavy pull:** the beam thickens and a thin meter appears at the top. Keep both
  sides at or above the target taps per second (right of the meter; your slower
  side is on the left) until the meter fills. Fall behind for too long and that
  side slips. The target rises with every pull.

Score is height climbed, plus bonuses for caught cues and held pulls.

## Controls

| Mode | Left end | Right end | Reflex | Notes |
| --- | --- | --- | --- | --- |
| 1 key | `Space` | fixed | - | One end only |
| 2 keys | `Z` | `M` | - | |
| 3 keys | `Z` | `M` | `Space` | |
| 4 keys | `Z` `X` | `N` `M` | - | Alternate for full lift; repeating a key lifts less |
| 5 keys | `Z` `X` | `N` `M` | `Space` | |
| 6 keys | `Z` `X` `C` | `B` `N` `M` | - | Rolls; `Space` is unused |

Every key can be rebound per mode under **Rebind keys**. Bindings follow the
physical key position, not the letter printed on it.

| Key | Action |
| --- | --- |
| `Enter` | Start, retry |
| `Esc` | Pause, back |
| `` ` `` | FPS and frame-time overlay |
| `0` | Mute (in menus and when paused) |
| `R` `C` `S` `K` | Menu shortcuts: reaction trainer, CPS trainer, stats, keys |

Touch or mouse works too: the left and right half of the screen lift that end.

## Training

- **Reaction trainer:** random-delay cues and nothing else. Press any key when
  the line turns orange. The window you have to beat shrinks 5% after each hit
  and grows 8% after a miss, so it settles near your limit.
- **CPS trainer:** hold the target tap rate for 5 seconds, rest, then the target
  rises by 0.5. Two drops at the same target end the session. It tracks each
  key's share of the taps, timing jitter, and repeats (the same key twice in a
  row, where you meant to alternate). Uses the keys of the selected mode.

## Stats

After each run: reaction average, median, best, standard deviation and a
histogram; peak tap rate, best 5 s and 10 s sustained rate, per-key and per-hand
evenness; survival time, height and score. Runs and training sessions are saved
in `localStorage`, and **Stats** plots each metric across sessions with a
5-session moving average. History can be exported as JSON.

Reaction times run from the frame the cue was drawn (`performance.now()`) to the
keydown's `event.timeStamp`, so they include your display and keyboard latency.
There is no sound on the cue, on purpose: it would turn a visual test into an
auditory one. In modes without a reflex key your regular tapping often answers
the cue by itself, so use the 3 or 5 key modes or the trainer for clean numbers.

## Tech

Vite and TypeScript, no framework, Canvas 2D.

- Physics runs at a fixed 480 Hz and rendering interpolates between ticks.
  Input is applied to the tick its timestamp falls in, so a run plays out the
  same at 60 and 240 fps (`tests/sim.test.ts` checks this bit for bit).
- Rendering uses `requestAnimationFrame` at the display rate, scaled for
  `devicePixelRatio`. The loop does not allocate.
- Sound is a handful of procedural Web Audio buffers. No assets, no music.

```bash
npm run build     # type-check, then static build to dist/
npm run preview   # serve dist/
npm test          # unit tests (node --test)
npm run bot       # headless bot for checking the difficulty curve
```

`netlify.toml` builds with `npm run build` and publishes `dist`.
