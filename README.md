# Beyblade Arena

A 3D Beyblade battling arena that runs entirely in the browser. Build a top from
layer / disc / driver parts, launch it into a bowl-shaped stadium, and fight an
AI rival. No server, no accounts — it builds to a static site.

## Running it

```bash
npm run dev
```

Then open the printed URL. Other commands:

```bash
npm run build
```

```bash
npx vitest run
```

## Controls

| Screen | Key | Action |
| --- | --- | --- |
| Garage | mouse | pick parts, spin direction, and rival difficulty |
| Launch | `Space` | stop the meter — green zone is the widest, most aggressive orbit |
| Battle | `Space` | **Charge** — hunt and hit hard (costs a full meter) |
| Battle | `A` | **Block** — absorb a hit and punish the attacker (65%) |
| Battle | `S` | **Dodge** — break away and conserve spin (45%) |

Every input is a **single tap** — nothing is held down. The move buttons are also
clickable. Moves were originally called Anchor and Slip: accurate, but playtesters
couldn't guess what they did, and a move nobody understands is a move nobody
presses.

Rounds are won by ring-out or burst (2 points) or by outlasting your rival
(1 point). First to 4 takes the match.

## How the physics works

The interesting decision here is that the tops are **not** simulated with a
general rigid-body engine. Real spinning-top dynamics — gyroscopic precession,
tilt, wobble at thousands of RPM — are notoriously unstable in general solvers,
which is why comparable projects hand-roll their own.

Instead `src/sim/` simulates position on the stadium plane plus spin as a
separate scalar, and the renderer expresses that as full 3D motion:

1. **Dish slope** pulls the top toward the centre, proportional to radius.
2. **Precession** rotates the velocity vector rather than adding force to it.
   This is why tops *circle* the dish instead of rolling straight to the middle,
   and because it's energy-preserving it cannot run away. As spin bleeds off,
   precession weakens and the orbit decays inward — the arc of a real match.
3. **Driver self-propulsion** pushes aggressive tips outward toward the ridge.
4. **Drag and spin decay**, then integrate.

Collisions are resolved pairwise: a normal impulse, a tangential "smash" where
the attacker's spin bites and flings the defender (this is what causes
ring-outs), then spin drain and burst charge scaled by attack vs. defense.

Everything is a closed-form function of state, so a step is deterministic and
cheap. The sim runs on a fixed timestep with a seeded PRNG, so a given seed
always replays identically — which also leaves a clean path to netcode later.

### Things the model needed that weren't obvious

Each of these was found by measuring, not by guessing, and each is preserved as
a named constant in `src/sim/constants.ts`:

- **`MIN_IMPACT`** — two tops sharing an orbit otherwise sit in permanent
  contact and register ~190 "hits" per round, turning every match into attrition
  that only stamina builds can win. Gating soft contacts dropped that to ~9.
- **`SMASH_MAX`** — the smash scales with impact speed, and uncapped a single
  head-on applies a several-m/s kick in one step and ends the round instantly.
- **`MAX_SPIN_LOSS_PER_HIT`** — without a ceiling, one violent opposite-spin
  clash drains both tops below the finish threshold on the same step.
- **The aggressor model** — clashes that punish both sides equally kill both at
  once. Weighting damage by who was carrying speed *into* the contact is what
  makes a high-aggression attack build worth playing.
- **Orbital launch speed** — launch velocity is derived from the actual circular
  orbit velocity for the spawn radius. A flat guessed speed silently put every
  top below orbital velocity, so they all dived to the centre and collided
  within a second. Launch power now controls orbit *shape*, which makes it a
  real decision rather than "more is better".
- **`SETTLE_TIME`** — the worst defect found so far, and only visible once match
  *pacing* was measured rather than round balance. The game forced every match
  to be opposite-spin while the balance harness ran opposite-spin half the time,
  so the harness reported a 9s median while players actually got **1.2s**, with
  57% of rounds finished inside two seconds. Ramping collision damage in over
  the first 1.25s lets both tops establish an orbit before anything can be
  decided. Under-2s rounds fell to 8.6% and matches went from 2.6 to 4.3 rounds.

## Balance

Stats multiply across the three slots, so any part that is above average on both
survivability axes lets a build compound into something unbeatable. Every part
is therefore strong on at most two axes and clearly weak on at least one, around
a triangle: attack beats stamina, stamina beats defense, defense beats attack.

`src/sim/tuning.test.ts` is a diagnostic harness rather than an assertion — it
sweeps every preset pairing and reports finish types, round lengths, hit counts
and win rates:

```bash
npx vitest run tuning --silent=false --disable-console-intercept
```

Current spread across the six presets is roughly 33%–63%, with all four finish
types represented. `sim.test.ts` asserts no build exceeds 72% or falls below
25%, so a balance regression fails the suite.

`src/sim/pacing.test.ts` measures the other axis — how long a player actually
sits in a match, which is not the same question as whether builds are balanced:

```bash
npx vitest run pacing --silent=false --disable-console-intercept
```

It reports round length by spin pairing, rounds per match, and total match time.
Balance can look healthy while pacing is broken; that is exactly what happened.

## Layout

```
src/
  sim/        deterministic physics + match rules (no rendering imports)
    constants.ts   every tuned number, with the reasoning
    physics.ts     the step function
    battle.ts      rounds, scoring, win conditions
    parts.ts       part catalog and stat derivation
  render/     Three.js — stadium, top meshes, sparks and trails
  ai.ts       rival: build counter-picking, launch choice, boost timing
  game.ts     screen flow, launch minigame, input
  ui.ts       DOM overlay
```

`sim/` has no dependency on `render/`, which is what makes the balance sweep
possible: thousands of matches run headlessly in about a second.

## Spin direction

Spin direction is a real strategic choice, not a cosmetic one, because the two
pairings measure completely differently:

| Pairing | Median round | Rounds under 2s | Plays like |
| --- | --- | --- | --- |
| Same direction | 8.1s | 0.0% | quiet attrition race, stamina favoured |
| Opposite direction | 14.2s | 8.6% | repeated violent exchanges, attack favoured |

The rival picks its own direction from its archetype — aggressive builds seek
the exchanges, stamina builds seek the attrition race — so the matchup is worth
reading before you commit.

## Spin absorption

The rubber-blade mechanic from the series: a layer with `spinSteal` bites into an
opponent turning the *other* way and converts part of that contact back into its
own rotation. The top looks like it's dying, then climbs back with every further
clash — Fafnir absorbs 62%, Luinor 12%, everything else nothing.

It **only works in opposite-spin matchups**. Against a same-spin opponent the
blades travel together at the contact point and there is nothing to bite into.
That restriction is what stops it being a free stat, and it gives the
spin-direction choice real weight: an absorber *wants* the pairing that would
destroy anything else. Measured, the absorber survives **14.7s in opposite-spin
against 7.4s in same-spin**.

Stolen spin is capped at launch spin. Uncapped, a long absorbing exchange
ratchets upward and the round never ends. `src/sim/steal.test.ts` pins all four
invariants: it works, it's inert in same-spin, it never exceeds launch spin, and
a non-absorbing layer absorbs nothing.

Adding it fixed the game's chronically weakest build — Endless Coil went from
32% to 47% — and needed one compensating buff to Ragnaruk, whose fast
opposite-spin kills the mechanic was designed to blunt. Preset spread is now
**33%–63%**, the tightest it has been.

## The move triangle

The three battle moves beat each other in a cycle, and that cycle is a
*consequence* of physical modifiers rather than a special-cased lookup — which
means it also holds against builds and situations never explicitly considered.

| Matchup | Win rate | Why |
| --- | --- | --- |
| Charge beats Dodge | 60.9% | a fleeing top can't outrun a seeking one |
| Block beats Charge | 50.4% | the charger is committed and eats the reflected hit |
| Dodge beats Block | 55.0% | a blocking top can't catch anything and bleeds spin waiting |

`src/sim/moves.test.ts` measures every leg with identical builds on both sides,
so any difference is down to the moves alone, and fails if a leg inverts.

Getting this to hold surfaced four real bugs, all of which are now named
constants or comments in the source:

- **The per-hit damage cap was neutering defense.** `MAX_SPIN_LOSS_PER_HIT`
  clamps a hit to 20% of launch spin, and big hits blew past that ceiling
  *before* defense applied — so a full-meter Anchor bought a 9% reduction. The
  cap is now a limit on the raw exchange, with the defensive move mitigating on
  top of it.
- **Reflected damage scaled off the wrong number** — the damage the attacker
  took rather than the hit the blocker absorbed. Since an anchored top deals
  almost nothing, the punish vanished.
- **Reflect punished the wrong top.** Applied flat, it hurt anyone who touched
  an anchor, including a disengaging top that got bumped. It now scales with the
  attacker's own aggression: you only get hurt by a wall if you ran into it.
- **Slip was killing itself.** Its escape kick fired forward with almost no drag
  to remove it, so a repeatedly-slipping top accelerated until it hit the wall
  or flew out a pocket — a third of all Slip losses were self-inflicted
  knockouts. The kick now aims away from the opponent, is redirected inward near
  the rim, and is speed-capped.

The deeper lesson: rounds are decided by *contacts*, not by holding costs. An
attrition model that ignored collisions predicted ~23 spin/s when the real
figure was 120–260/s.

## Skins, and telling the tops apart

Two similarly-coloured tops circling a dark dish at speed are genuinely hard to
distinguish, and a player who loses track of their own top can't make any of the
decisions the rest of the game is built on.

This was first solved with ownership markers — a bright ring drawn under your
top. That worked, but it was a crutch: it told you which top was yours without
the top itself being recognisable. Skins fix the underlying problem, so the
markers are gone.

Six skins, each a distinct hue and material finish:

| Skin | Finish | Look |
| --- | --- | --- |
| Frost | glass | translucent, light refracts through it |
| Ember | chrome | mirror-polished metal |
| Venom | neon | strongly self-illuminated, readable in shadow |
| Void | carbon | dark and matte with an inner glow |
| Solar | chrome | polished gold |
| Rose | matte | flat, no specular highlight |

Skins are **purely cosmetic and never touch a stat**. A skin that changed
gameplay would turn "which top do I like" into "which top wins", and the part
triangle is where that decision is supposed to live.

The part that actually replaces the markers is `pickContrastingSkin`: the rival
is always given the skin furthest in hue from yours, so the two tops are
guaranteed to be different colour families. Picking Venom (hue 145°) forces the
rival to Rose (hue 330°) — a 175° separation out of a possible 180. Identification
never depends on the player having chosen sensibly. The HUD cards are keyed to
the same skin colour, so card and top are linked without reading anything.

## Sound

All synthesized in WebAudio (`src/audio.ts`) — no asset pipeline, nothing to
download, and a hit's pitch tracks its actual impact strength rather than
picking from a handful of samples. Launch rip, metal-on-metal impact, a
continuous spin whine whose frequency follows remaining spin so the arena
audibly winds down, a distinct cue per move so you can *hear* what your rival
committed to, and round-end stings.

Browsers refuse to start an AudioContext before a user gesture, so it resumes on
the first real key press or click rather than at construction. Toggle it in the
garage.

## Variance, on purpose

Fixing the pacing removed the coin-flip rounds — but it also flattened the
emotional range, and a distribution with no tail has no moments worth retelling.
Three systems put the spikes back, and the constraint was that they be *earned
or survivable* rather than arbitrary:

- **Perfect launch** — stopping the meter in the green band grants bonus spin.
  The band was previously decoration with no mechanical effect at all.
- **Perfect block** — blocking within 0.3s of contact multiplies the reflected
  damage 2.2x. Blocking early is safe and ordinary; blocking *on the read* is
  what earns the big punish and can end a round outright.
- **Critical clash** — a 7% chance to amplify a hit and raise the per-hit spin
  cap from 20% to 38%. Without lifting the cap a critical is invisible, because
  the normal ceiling clamps it straight back to an ordinary hit.

Two of the three are pure skill; only the critical is chance, and it is capped
so it swings a round rather than deciding one outright from full spin. Knockouts
rose from 15.5% to 18.8% and sub-2s rounds held at ~10%.

Note on the underlying psychology, since it's the obvious next step: variable
rewards are genuinely the strongest engagement mechanism known, which is exactly
why the manipulative versions are regulated. The line worth holding is that
variance here creates *drama*, and is never attached to money, a purchase, or a
"just one more" prompt.

## The career ladder

Six named rivals, each a fixed build with a stated tell, played in order. Beating
one unlocks parts and reveals the next. Progress persists in `localStorage`.

| # | Blader | Bey | Skill |
| --- | --- | --- | --- |
| 1 | Nyx, Street Blader | Blitz Striker | rookie |
| 2 | Orin, Dojo Regular | Endless Coil | rookie |
| 3 | Vale, Circuit Climber | Twin Fang | blader |
| 4 | Kes, Iron Wall | Iron Bastion | blader |
| 5 | Rhea, Storm Caller | Storm Breaker | champion |
| 6 | Zeph, Arena Champion | Crimson Edge | champion |

Two rules keep progression from undoing the balance work:

- **Unlocks are sidegrades, never upgrades.** Every part sits on the same
  trade-off surface, and the win-rate spread is asserted in tests. Handing out
  strictly better parts would flatten the triangle and turn the collection into
  a power ladder instead of a toolbox.
- **Rivals escalate in skill, not in stats.** A harder opponent reads your moves
  faster and misreads less; it never gets a bigger number. A rival that cheats
  reads as unfair rather than skilled.

`src/progress.test.ts` asserts the properties that are easy to break by hand:
the ladder distributes the *entire* catalog with no duplicates and nothing
unreachable, difficulty never goes backwards, losses don't advance the ladder,
a cleared ladder can't be farmed for repeat unlocks, and a corrupt save falls
back to a fresh one rather than crashing the garage.

Storage is treated as unreliable — private browsing and a full quota both throw
— so every access is wrapped. With storage unavailable the game plays
identically and simply forgets between reloads.

## Visual themes

Two looks, switchable in the garage and persisted:

- **Arena** — the original clean technical style. `ARENA` in `src/render/theme.ts`
  is a literal transcription of the values that used to be hardcoded across
  `arena.ts` and `stadium.ts`, so selecting it reproduces the original *exactly*.
  That is the theme system's contract: a theme system that subtly changes the
  default look has failed at its one job.
- **Beam Clash** — the anime read. The move is to stop lighting the arena and let
  the tops light it: near-black world, ambient fill crushed to 0.16, a coloured
  PointLight parented to each top that flares off `hitFlash` on contact, bloom,
  expanding shockwave rings on heavy clashes, a light-crush on the decisive blow,
  and a letterbox title card over the finish hold.

A theme is a flat bag of *parameters*, not callbacks or a subclass. Everything
applies by assigning to existing materials and lights, so switching never
rebuilds the scene graph and there is nothing to dispose — rebuilding would mean
hand-disposing geometries and one missed dispose is a GPU leak that only shows
after a dozen toggles. Themes compose *over* skins: a skin decides what a top is
made of, a theme decides what the world looks like.

### Cosmetic slots

Themes, skins, arenas, finisher effects and audio are deliberately separate,
independently swappable cosmetic slots that never touch a stat. That is the
structure a cosmetic storefront would need (the TFT model), and it is also just
good separation — nothing cosmetic can affect the balance the tests assert.
Nothing here is monetised; the seams simply exist.

## Audio

Three independently toggleable channels, persisted:

| Channel | Default | What it is |
| --- | --- | --- |
| All sound | on | master |
| Impacts & cues | on | launches, hits, move cues, stings — all short |
| Spin drone | **off** | the continuous pitch-tracks-spin tone |

The drone defaults off because a sustained tone that never resolves is fatiguing
in a way transient effects are not — a playtester reported it as a headache and
assumed it was background music. It is genuinely informative, so it stays
available, but opting *in* is the right default. It is also now a triangle rather
than a sawtooth, filtered at 900Hz and about half the level.

## The garage

The parts list used to be a wall of text chips: it told you a build's numbers but
never what it *was*. The garage now opens on the top itself, exploded into its
three parts with each one labelled.

The parts **counter-rotate at different rates** — layer slow one way, disc slower
against it, driver fastest, with the driver's rate taken from its own spin
retention. Spinning them in unison reads as a turntable; opposed rates read as a
working mechanism, and the animation previews what the part actually does.

Two implementation notes that matter more than they look:

- `buildBeyMesh` now nests each part in its own sub-group at the origin, with the
  meshes keeping their offsets. That is a deliberate no-op for the arena — the
  assembled top renders identically — but it lets the garage pull the parts apart
  without a second set of meshes.
- The preview is created **once** and re-parented on every render. `render()`
  wipes `innerHTML` and the garage re-renders on every part click, so building a
  fresh view each time would allocate a new `WebGLRenderer` per click and exhaust
  the browser's ~16 live WebGL context limit within seconds, after which the
  canvas silently stops drawing. Verified: clicking through six parts keeps the
  same canvas element and two total contexts.

## Known gaps

- Skins vary colour and material but not **silhouette**. Blade count already
  differs per layer; distinct shapes per skin would push identification further.
- The AI reads moves but does not bluff, so a patient player can bait it.
- The tutorial is explanatory, not interactive. A scripted round that forces
  each situation in turn would teach the triangle faster than reading it.
- The garage labels sit at fixed thirds rather than tracking the projected
  screen position of each part, so they drift slightly from the parts when the
  model is rotated steeply.
- The ladder ends. After Zeph there's no endless mode, no ranked ladder and no
  daily challenge — and the deterministic seeded sim makes a seeded daily run
  nearly free, so that's the obvious next step.
- Bundle is ~570 kB (147 kB gzipped), almost entirely Three.js.
