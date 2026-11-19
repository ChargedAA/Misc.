# TENSION

A minimal training suite: 122 small games for reaction, speed, timing, memory,
attention, coordination, judgement and reasoning. Near-black, thin lines, one accent colour. Every
game is short, adapts to you, and keeps your history so you can see trends.

```bash
npm install
npm run dev
```

The home screen leads with **Daily** (`Space`): one drill per skill, the same
set for everyone that day. Below it are the eight skills, the Reflexes skills on
the left hand's keys and the Mind skills on the right hand's:

| Left hand | | Right hand | |
| --- | --- | --- | --- |
| `Z` | Reaction | `B` | Memory |
| `X` | Speed | `N` | Attention |
| `C` | Timing | `M` | Judgement |
| `V` | Coordination | `,` | Reasoning |

`R` Mix, `S` Stats and `O` Settings sit in the header.

One page at a time, with the path back above it; `Esc` goes back.

A skill's page starts with a three-drill **routine** (`Space`), then lists every
drill grouped by what it trains, each on its own key. A drill's page gives
numbered steps naming your actual keys, the controls, a **length** choice
(short, standard or long, showing the real round count; `L` cycles it), a key
count only for the games where it matters, then **Start** (`Z`), **Stats**
(`X`) and **Practice** (`C`, plays it through but saves nothing).

**Mix** plays three, five or ten random drills, one of each skill, or random
drills endlessly. In sets, each drill opens with a ready card (the same steps
and controls) so the clock never runs while you read; `Space` starts it and `X`
skips it. Sets always play the standard length.

In a drill, `Esc` pauses: the game clock and the sound stop. Resume, restart,
finish and score it, or quit.

Results lead with the drill's own number in its units, say which direction is
better, compare with last time and your best, and draw bars where the parts
matter. A session with no input, or too short to count, scores nothing and is
not saved; neither are practice runs.

## Games

### Reaction

| Game | What it is | Input |
| --- | --- | --- |
| Reflex | Six rule games that change every round. Three strikes. | keys |
| Snap | Pure reaction time. One disc, one press. | keys or tap |
| Stop | Press fast, unless it gets struck out. | keys |
| Flank | Answer the middle arrow. Ignore the crowd. | keys |
| Choice | Press whichever string lights. More strings, more thinking. | keys, 2+ keys |
| Aim | Tap each target the moment it appears. They shrink. | tap or click |
| Alert | Two minutes of waiting. Stop the counter the moment it starts. | keys or tap |
| Duel | Quick draw against an opponent who keeps pace with you. | keys or tap |
| Whack | Discs pop up and vanish. Tap the white ones, leave the grey. | tap or click |
| Dodge | Shots come from either side. Block with that hand; let grey ones by. | keys, 2+ keys |
| Ears | A flash or a beep, at random. Which do you react to faster? | keys or tap |
| Lanes | The ball rolls on. Blocks pop up ahead: sidestep them. | keys, 2+ keys |
| Hurdles | The ball rolls on. Bars pop up across the track: jump them. | keys |
| Rush | Blocks and bars, at random. Sidestep or jump, and do not mix them up. | keys, 3+ keys |
| Lights | Five lights come on one by one, then go out together. Go. | keys or tap |
| Swerve | Drive up the road. Hazards pop up in your path: steer clear. | keys, 2+ keys |
| Catch | Slide a basket. Catch the white drops, dodge the grey. | keys, 2+ keys |
| Shield | Spin a shield round the core. Block every shot, from any side. | keys, 2+ keys |
| Opposite | Press the side away from the dot. Blocks of "same" and "opposite". | keys, 2+ keys |
| Parry | A fencer attacks left or right. Parry the real ones; hold on the feints. | keys, 2+ keys |
| Goalie | Penalties. Dive the way the ball goes, or stay put when it comes down the middle. | keys, 2+ keys |

### Speed

| Game | What it is | Input |
| --- | --- | --- |
| Burst | Hold a rising tap rate for five seconds. | keys |
| Sprint | Ten seconds, flat out. Watch your rate fade. | keys |
| Pulse | Ride a target rate that rises, drops and stops. | keys |
| Steady | Fast is not enough. Fifteen seconds, perfectly even. | keys |
| Ladder | The target rate steps up every second. Hang on. | keys |
| Tug | Tug of war against a rate that never gets tired. | keys |
| Sets | Four five-second sprints with short rests. Can you hold your speed? | keys or tap |
| Roll | Run through your keys in order, round and round, fast and clean. | keys, 2+ keys |
| Exact | Tap exactly N times inside the window. Fast enough, and stop on time. | keys or tap |
| Rain | Letters fall. Type them before they land. | keys |
| Trill | Alternate in order, flat out, for ten seconds. Fast and even both count. | keys, 2+ keys |
| Code | A symbol for each key. Turn symbols into presses as fast as you can. | keys, 4+ keys |

### Timing

| Game | What it is | Input |
| --- | --- | --- |
| Tempo | Keep the beat going after it goes silent. | keys or tap |
| Cross | Press as the dot crosses the line. Then it vanishes early. | keys or tap |
| Gap | Two clicks make a gap. Copy it from memory. | keys or tap |
| Echo | Hear a rhythm. Tap it back. It gets longer. | keys or tap |
| Swing | Press as the pendulum passes the bottom. It speeds up, then hides. | keys or tap |
| Second | Hold a key for exactly the time shown. No clock. | keys |
| Drift | Tap with a silent pulse that speeds up and slows down. | keys or tap |
| Offbeat | Tap exactly halfway between the clicks. | keys or tap |
| Meet | Two dots close in at different speeds. Press as they touch. | keys or tap |
| Hop | Run, jump the blocks, and slam down to land in time. | keys or tap |
| Even | Your keys in order, to a click, then alone. Perfectly even. The pace climbs. | keys, 2+ keys |
| Tower | A block slides over the stack. Drop it squarely; overhang is cut off. | keys or tap |
| Keep | Steer a paddle to keep the balls in play. A second one joins later. | keys, 2+ keys |
| Late | Six beats by ear. Were they even, or did one land late? | keys, 2+ keys |

### Memory

| Game | What it is | Input |
| --- | --- | --- |
| Sequence | A pattern plays across your strings. Play it back. | keys, 2+ keys |
| Grid | Tiles flash. Tap every one once they hide. | tap or click |
| Order | Numbers flash. Tap them in order, blind. | tap or click |
| Back | Does it match the one n steps ago? Two streams at once. | keys |
| Pairs | Turn tiles two at a time. Remember where everything was. | tap or click |
| Path | Blocks light up in order. Tap the same path, sometimes backwards. | tap or click |
| Spot | Look, look away, look again. Did anything change? | keys, 2+ keys |
| Digits | Remember a number. Type it back, sometimes backwards. | tap or click |
| Where | Shapes scatter and vanish. Tap where one of them was. | tap or click |
| Running | Digits stream by and stop without warning. Type the last few. | tap or click |
| Melody | Pads play a tune. Play it back. Later you only hear it. | tap or click |
| Again | Pairs of shapes, one after another. Seen this exact one before? | keys or tap, 2+ keys |
| Link | Shapes and numbers, paired. Which number went with this shape? | tap or click |
| Route | Learn a string of turns, then drive it from memory. | keys, 2+ keys |
| Hold | Remember positions while checking sums in between. | keys or tap, 2+ keys |
| Remind | Sort numbers odd or even, and remember the rule for the rare boxed one. | keys, 2+ keys |

### Attention

| Game | What it is | Input |
| --- | --- | --- |
| Track | Follow a few dots among identical ones. | tap or click |
| Find | Spot the one that matches, among look-alikes. | keys or tap |
| Switch | The rule depends on where the number lands. | keys, 2+ keys |
| Shape | The word says square. The outline is a circle. | keys, 2+ keys |
| Rotate | Same shape, turned, or its mirror image? | keys, 2+ keys |
| Count | How many dots were there, in that blink? | tap or click |
| Glance | A shape in the middle, a dot out wide. One blink to see both. | tap or click |
| Stream | Letters fly past. Press for the X. | keys or tap |
| Side | Shade picks the hand. Where it appears pulls the other way. | keys, 2+ keys |
| Flicker | Two versions flicker back and forth. Find what changes. | tap or click |
| Shells | A ball under a cup, then the cups swap. Where is it? | tap or click |
| Except | Press for every digit except 3. The rare 3 is the trap. | keys or tap |
| Clock | A dot ticks round a dial. Now and then it skips a step. Catch the skips. | keys or tap |
| Tangle | Follow one line through a tangle to its end. | tap or click |
| Sort | Flip the switch to send each item down the right chute. The rule changes. | keys, 2+ keys |
| Shadow | Keep your pointer on a wandering target. Catch flashes at the edges. | tap or click |
| Away | A flash grabs your eyes. The arrow you must read is on the other side. | keys, 2+ keys |

### Coordination

| Game | What it is | Input |
| --- | --- | --- |
| Climb | Dash between lanes, surge over holes, catch the cables. Endless. | keys |
| Strings | Pluck notes on time: streams, chords, holds. Endless. | keys |
| Split | Each hand steers its own dot. Dodge on both sides at once. | keys, 2+ keys |
| Juggle | Every key keeps its own ball in the air. | keys |
| Poly | Two hands, two tempos at once. Two against three, and up. | keys, 2+ keys |
| Zigzag | Hold to rise, let go to fall. The corridor narrows. | keys |
| Orbit | Each hand flips the direction of its own orbiting dot. | keys, 2+ keys |
| Drum | Read a left/right/both pattern. Play it in time. | keys, 2+ keys |
| Twin | Two tunnels, one per hand. Hold to climb, let go to fall. | keys, 2+ keys |
| Pole | Balance a pole on a cart. One hand pushes each way. | keys, 2+ keys |
| Sync | Both hands at exactly the same moment. Then with a set gap. | keys, 2+ keys |
| Dock | Thrust a drifting ship into the dock and stop dead inside it. | keys, 2+ keys |
| Lander | Feather the thrust and touch down softly on the pad. | keys |
| Mirror | Steer along a track. Every so often the controls swap sides. | keys, 2+ keys |

### Judgement

| Game | What it is | Input |
| --- | --- | --- |
| Longer | Which line is longer? The difference keeps shrinking. | keys or tap, 2+ keys |
| More | Which cloud had more dots? There is no time to count. | keys or tap, 2+ keys |
| Middle | Tap the exact middle of a line. | tap or click |
| Tilt | Which way does the line lean? Later, a tilted frame tries to fool you. | keys or tap, 2+ keys |
| Faster | Which dot moved faster? Distance is no clue. | keys or tap, 2+ keys |
| Shade | Which square is lighter? Their surroundings lie. | keys or tap, 2+ keys |
| Guess | A cloud of dots flashes. How many? | tap or click |
| First | Two dots race for the line and vanish on the way. Which gets there first? | keys or tap, 2+ keys |
| Merge | Cars stream past the junction. Pull out into the first safe gap. | keys or tap |
| Pour | Fill the glass to the line. It keeps flowing after you let go. | keys |
| Pitch | Two tones. Was the second higher or lower? By ear alone. | keys or tap, 2+ keys |
| Bank | A ball heads for the wall and vanishes. Where will it land after the bounce? | tap or click |
| Line | Put a number on a number line. | tap or click |
| Flow | A cloud of jittering dots. Which way are most of them drifting? | keys, 2+ keys |
| Pump | Pump a balloon for points; bank before it pops. Each size has its own risk. | keys, 2+ keys |

### Reasoning

| Game | What it is | Input |
| --- | --- | --- |
| Sum | True or false, as fast as you can. | keys or tap, 2+ keys |
| Compare | Two expressions. Which is bigger? | keys or tap, 2+ keys |
| Series | Five numbers. What comes next? | tap or click |
| Relate | Square above circle, circle above triangle. Is the square above the triangle? | keys or tap, 2+ keys |
| Matrix | A three-by-three pattern with a gap. Which piece fits? | tap or click |
| Balance | The scales balance. How many triangles weigh the same as a square? | tap or click |
| Odd | All but one share something. Which one does not? | tap or click |
| Probe | A hidden rule says yes or no to shapes. Test it three times, then classify. | keys or tap, 2+ keys |
| Plan | Jobs with lengths, deadlines and values. Put them in the best order. | tap or click |
| Crack | Find the hidden code from right-place and wrong-place clues. | tap or click |
| Compass | Follow a string of turns in your head. Which way are you facing? | tap or click |
| Letters | Unscramble the word. Type it. | keys |
| Chain | Keep a running total through a string of operations. | tap or click |

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
  change detection with a Cowan's K estimate. Flicker is the flicker
  paradigm for change blindness. Alert is the psychomotor vigilance task
  (lapses are responses over 500 ms).
- **Judgement as thresholds.** Longer and More measure discrimination
  thresholds: the smallest length difference (a Weber fraction) and the
  smallest numerosity ratio (approximate number acuity) you can reliably tell.
  More equates total dot area on half the trials so size is no shortcut.
  Middle is line bisection, where most people show a small, consistent lean.
  Tilt adds the rod-and-frame illusion and Shade simultaneous contrast, so
  part of the skill is not being fooled by context.
- **Reasoning under time.** Sum and Compare are speeded arithmetic
  verification and comparison, scored as right minus wrong so guessing does
  not pay. Series is number-series completion, a classic inductive reasoning
  item. Matrix is a procedurally generated progressive-matrices puzzle, Relate
  is transitive inference (the premises vanish later, adding a memory load),
  and Balance is algebra in pictures.
- **More classic tasks.** Opposite is an anti-saccade style task (respond away
  from the cue, in blocks against same-side responding). Hold is a complex-span
  task: positions held while verifying sums. Line is number-line estimation.
  Pitch measures a pitch discrimination threshold in cents.
- **Sustained attention.** Except is the sustained attention to response task
  (SART): press for every digit but the rare 3, so the habit of pressing is the
  trap. It reports withheld 3s, misses, and how steady your presses are.
- **Vigilance.** Clock is the Mackworth clock test: a dot steps round a dial
  and rarely skips a step; Alert is the psychomotor vigilance task. Both measure
  keeping attention up when almost nothing happens.
- **More than one sense.** Ears mixes flashes and beeps; simple reaction to
  sound is usually a few tens of milliseconds faster than to light. Melody
  turns the pads dark on alternate tunes so you work from pitch alone.
- **Updating, not just holding.** Running is running memory span: the list
  stops without warning, so you must keep replacing what you hold. Again is
  continuous recognition with lures (same shapes, other order or shade), scored
  as hits minus false alarms so calling everything "seen" does not pay.
- **Even alternation.** Even has you play your keys strictly in order, hands
  alternating, to a metronome and then alone, and only raises the pace while
  your gaps stay within about 10% of each other. Trill does the same flat out.
  Both show each gap as a bar, so a hand that runs fast shows as a zigzag
  ("galloping"), and report that imbalance.
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
| `Z` `X` `C` `B` `N` `M` | The options of the open list |
| `Space` | Seventh option, or the next page of a long list |
| `Enter` | Start, again, next |
| `Esc` | In a drill: pause (resume, restart, finish and score, or quit). In menus: back |
| `1`-`6` | On a game's list: play with that many keys; on its stats: key filter |
| `0` | Sound on or off |
| `` ` `` | FPS and frame-time overlay |

**Touch:** in key games, pads appear in the bottom corners once you touch the
screen (outer key at the edge, reflex above), and the corner button pauses or
finishes. Tap games take taps anywhere on the board.

## Stats

Each session ends with its numbers: reaction time histograms, tap-rate
breakdowns, accuracy, spans, timing errors, compared with your last session
and your best. Everything is kept in `localStorage`. **Stats** shows your day
streak, sessions per skill this week, and the games you have played; each game
has its own page with its tracked number and score over time (with a 5-session
moving average), best, average of the last five, change since your first
sessions, and recent sessions, filterable by key count. History can be exported
as JSON from Settings.

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
