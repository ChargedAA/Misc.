# TENSION

A minimal training suite: 42 small games for reaction, speed, timing, memory,
attention and coordination. Near-black, thin lines, one accent colour. Every
game is short, adapts to you, and keeps your history so you can see trends.

```bash
npm install
npm run dev
```

Pick a game on the title screen. Games played with keys open a pop-out where
you choose how many keys to use (1 to 6); games played by tapping need no keys.
The **Daily set** at the top plays one game from each skill back to back; it is
the same set for everyone on a given day.

## Games

### Reaction

| Game | What it is | Input |
| --- | --- | --- |
| Reflex | Six rule games that change every round. Three strikes. | keys |
| Snap | Pure reaction time. One disc, one press. | keys or tap |
| Stop | Press fast, unless it gets struck out. | keys |
| Flank | Answer the middle arrow. Ignore the crowd. | keys |
| Choice | Press whichever string lights. More strings, more thinking. | 2+ keys |
| Aim | Tap each target the moment it appears. They shrink. | tap or click |
| Alert | Two minutes of waiting. Stop the counter the moment it starts. | keys or tap |

### Speed

| Game | What it is | Input |
| --- | --- | --- |
| Burst | Hold a rising tap rate for five seconds. | keys |
| Sprint | Ten seconds, flat out. Watch your rate fade. | keys |
| Pulse | Ride a target rate that rises, drops and stops. | keys |
| Steady | Fast is not enough. Fifteen seconds, perfectly even. | keys |
| Ladder | The target rate steps up every second. Hang on. | keys |
| Tug | Tug of war against a rate that never gets tired. | keys |

### Timing

| Game | What it is | Input |
| --- | --- | --- |
| Tempo | Keep the beat going after it goes silent. | keys or tap |
| Cross | Press as the dot crosses the line. Then it vanishes early. | keys or tap |
| Gap | Two clicks make a gap. Copy it from memory. | keys or tap |
| Echo | Hear a rhythm. Tap it back. It gets longer. | keys or tap |
| Swing | Press as the pendulum passes the bottom. It speeds up, then hides. | keys or tap |
| Second | Hold a key for exactly the time shown. No clock. | keys |

### Memory

| Game | What it is | Input |
| --- | --- | --- |
| Sequence | A pattern plays across your strings. Play it back. | 2+ keys |
| Grid | Tiles flash. Tap every one once they hide. | tap or click |
| Order | Numbers flash. Tap them in order, blind. | tap or click |
| Back | Does it match the one n steps ago? Two streams at once. | keys |
| Pairs | Turn tiles two at a time. Remember where everything was. | tap or click |
| Path | Blocks light up in order. Tap the same path, sometimes backwards. | tap or click |
| Spot | Look, look away, look again. Did anything change? | 2+ keys |
| Digits | Remember a number. Type it back, sometimes backwards. | tap or click |

### Attention

| Game | What it is | Input |
| --- | --- | --- |
| Track | Follow a few dots among identical ones. | tap or click |
| Find | Spot the one that matches, among look-alikes. | keys or tap |
| Switch | The rule depends on where the number lands. | 2+ keys |
| Shape | The word says square. The outline is a circle. | 2+ keys |
| Rotate | Same shape, turned, or its mirror image? | 2+ keys |
| Count | How many dots were there, in that blink? | tap or click |
| Glance | A shape in the middle, a dot out wide. One blink to see both. | tap or click |
| Stream | Letters fly past. Press for the X. | keys or tap |
| Side | Shade picks the hand. Where it appears pulls the other way. | 2+ keys |

### Coordination

| Game | What it is | Input |
| --- | --- | --- |
| Climb | Dash between lanes, surge over holes, catch the cables. Endless. | keys |
| Strings | Pluck notes on time: streams, chords, holds. Endless. | keys |
| Split | Each hand steers its own dot. Dodge on both sides at once. | 2+ keys |
| Juggle | Every key keeps its own ball in the air. | keys |
| Poly | Two hands, two tempos at once. Two against three, and up. | 2+ keys |
| Zigzag | Hold to rise, let go to fall. The corridor narrows. | keys |

## Why these games

The suite leans on established tasks and on what is known about training:

- **Practise the thing itself.** Meta-analyses find little far transfer from
  brain games, but real near transfer. So each game trains one specific skill
  (reaction time, tap rate, timing, span), rather than promising to make you
  smarter.
- **Adaptive difficulty.** Most games use a staircase (two right answers make it
  harder, one miss makes it easier), which settles near 71% correct, the usual
  target for staying challenged without giving up.
- **Classic paradigms, minimal skins.** Stop is a stop-signal task (about a
  quarter of trials are stops, with an adaptive delay). Flank, Shape and Switch
  are flanker, Stroop and task-switching tasks. Grid, Order and Path are visual
  memory, the chimp test and Corsi blocks. Back is dual n-back. Track is
  multiple object tracking. Glance is a useful-field-of-view task. Spot is
  change detection with a Cowan's K estimate.
- **Speed you can use.** Rhythm-game and Geometry Dash players need tap rates
  they can hold and control, not one-second peaks. Pulse, Ladder, Steady and
  Burst train held and controlled rates; Sprint measures the peak.

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
| `Enter` | Start, again, next |
| `Esc` | Pause, finish, back |
| arrows | Move through the game list |
| `D` | Daily set |
| `S` `K` `0` | Stats, keys, mute |
| `` ` `` | FPS and frame-time overlay |

**Touch:** in key games, pads appear in the bottom corners once you touch the
screen (outer key at the edge, reflex above), and the corner button pauses or
finishes. Tap games take taps anywhere on the board.

## Stats

Each session ends with its numbers: reaction time histograms, tap-rate
breakdowns, accuracy, spans, timing errors. Everything is kept in
`localStorage`; **Stats** plots each game's tracked number across sessions with
a 5-session moving average, and history can be exported as JSON.

Reaction times run from the frame a stimulus was drawn (`performance.now()`) to
the input's `event.timeStamp`, so they include display and input latency.

## Tech

Vite and TypeScript, no framework, Canvas 2D.

- Climb runs on a fixed 480 Hz simulation with render interpolation; input is
  applied to the tick its timestamp falls in, so a run plays out the same at 60
  and 240 fps (`tests/sim.test.ts` checks this).
- Rendering uses `requestAnimationFrame` at the display rate, scaled for
  `devicePixelRatio`.
- Sound is procedural Web Audio: clicks, plucked strings (Karplus-Strong) and
  metronome ticks. No assets, no music.
- Each mini-game is one class behind a small interface (`src/minis/kit.ts`);
  the registry is `src/minis/index.ts`. A smoke test plays every game in every
  key mode with seeded random input.

```bash
npm run build     # type-check, then static build to dist/
npm run preview   # serve dist/
npm test          # unit tests (node --test)
npm run bot       # headless bot for checking Climb's difficulty curve
node scripts/games-md.ts   # regenerate the game list above
```

`netlify.toml` builds with `npm run build` and publishes `dist`.
