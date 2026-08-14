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
| Charge beats Dodge | 63.3% | a fleeing top can't outrun a seeking one |
| Block beats Charge | 57.1% | the charger is committed and eats the reflected hit |
| Dodge beats Block | 64.6% | a blocking top can't catch anything and bleeds spin waiting |

**Charge actually hunts now.** It originally worked by multiplying the driver's
`wander` stat — but wander pushes a top *radially outward from the centre*, so
it never pointed at anyone. Pressing Charge nudged you toward the rim by an
amount scaled by a stat that is 0.06 on some drivers, which is why the button
felt dead. It now has real homing plus an instant kick toward the opponent, and
closes 43–76% of the gap depending on driver.

The homing **steers** rather than only accelerating. Adding acceleration alone
worked on most drivers but did nothing on Volcanic (5% of the gap closed, versus
74% for Atomic): it carries so much orbital velocity, and precession rotates
that velocity a full turn every ~1.4s, that the added component was smeared away
before it closed anything. Rotating the velocity toward the target works
regardless of how fast the top is already moving.

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

## Arenas

An arena is a **gameplay** setting, not a cosmetic one — it changes the physics,
so it lives in the sim and is labelled in the UI as "changes how the match
plays". This is the one slot in the game that isn't provably inert, which is
exactly why it must never become something sold.

| Arena | What it does |
| --- | --- |
| Standard Dish | the plain bowl — no archetype favoured |
| X-Rail Stadium | outer rail slingshots fast tops — faster, deadlier rounds |

The **X-Rail** is the signature mechanic of the current Beyblade generation.
Engaging it requires being in the band, off cooldown, *and* carrying real
tangential speed — a top that merely drifts across isn't moving fast enough for
the teeth to bite, which makes riding it a choice rather than something that
happens to you. While locked in, radial drift is cancelled so it tracks the band
and speed is driven to a ceiling; on release the exit velocity is rotated toward
the centre.

Riding it is deliberately loud: the rail flares while anyone is locked in,
sparks stream off the contact point, a mechanical clatter plays on engage
followed by a tone that rises for exactly the length of the ride, and a whoosh
fires on release. The coach names it too. Without all that the slingshot arrives
with no explanation — the player feels it without seeing why.

It creates a **contested location**: the rail is where damage comes from, so
both players want it, but a top riding it moves predictably along a known arc
and sits one clean hit from an exit pocket.

Two things the tuning taught, both preserved in `rail.test.ts`:

- **Less inward redirect made rounds shorter, not longer.** A tangential exit
  leaves the top hugging the rim next to the pockets; a steep inward redirect is
  both safer and more dramatic, because throwing a top across the dish is the
  actual mechanic.
- **The rail roughly doubles fast finishes** (8% → 22% on identical pairings).
  That is not a defect. Its purpose is to manufacture decisive moments, and
  decisive moments end rounds — at the speeds where fast finishes matched the
  plain dish, the rail had stopped slinging tops and was just holding them in a
  circle. The test asserts the rail arena's own bounds rather than pretending it
  should behave like a different arena.

## Visual themes

Two looks, switchable in the garage and persisted:

- **Arena** — the original clean technical style. `ARENA` in `src/render/theme.ts`
  is a literal transcription of the values that used to be hardcoded across
  `arena.ts` and `stadium.ts`, so selecting it reproduces the original *exactly*.
  That is the theme system's contract: a theme system that subtly changes the
  default look has failed at its one job.
- **Anime** — full cartoon mode. Cel shading (`MeshToonMaterial` on a three-step
  `NearestFilter` ramp), `OutlineEffect` ink lines with the beys carrying a
  heavier line than the set, the painted Beystadium below, spin-blur discs,
  ribbon trails, manga impact frames, auras, speed lines and shockwaves — one
  theme that owns the whole treatment.

There used to be four: three separate part-way attempts at the anime look
(Beam Clash, Overdrive, Toon) accumulated alongside Arena, none of which
actually landed it — three "anime" chips in the picker and no anime. They are
consolidated into the single **Anime** theme; saved ids from the retired themes
migrate to it via `loadThemeId`/`themeById`, so returning players keep their
cartoon mode instead of silently falling back to Arena. The lesson worth
keeping: themes are *commitments*, not accretions — when a new attempt at a
look supersedes an old one, the old one should be absorbed, not left as a
third option that dilutes the picker.

### The anime pipeline

What finally closed the gap with the source material was research, not more
effects. A deep pass on the actual designs produced `src/render/beydex.ts` —
per-layer canonical identity as *data*: palette, beast motif, face letter, spin
direction, and blade character for all six layers (Valtryek's swept wings,
Fafnir's near-round gold spin-steal shield, Luinor's jagged left-spin dragon…).
The mesh code consumes it:

- **Layers** are `ExtrudeGeometry` silhouettes shaped by the design's
  `BladeStyle` (root/belly/cut), with a full-face painted sticker texture:
  body disc, blade ticks, die-cut ring lines and the procedural beast crest
  with its roman letter, mapped so painted marks land exactly on the geometry.
- **Discs and drivers** each get their own researched shape — Heavy's squat
  ring with armour bosses, Gravity's octagonal flywheel, Spread's knife-edge
  saucer, Blitz's tri-corner flaps, Wall's shield lobes; Xtreme's rubber puck,
  Volcanic's knurled collar, Atomic's ball-and-skirt, Orbit's tabbed collar,
  Needle's studded point, Bastion's pot-lid flange. This came from a direct
  complaint: swapping parts "does not look like it changed much". Parts are
  hardware, so they wear their own colours, not the skin's.
- **Design vs skin**: the layer's look comes from its canonical design —
  Valtryek is blue-and-gold whoever throws it — while the skin keeps the slots
  that carry *ownership*: trail, aura, blur tint, hit ring, HUD swatch. Two
  systems, two questions: "which bey is that?" vs "whose is it?".
- **Motion is drawn, not simulated**: past ~55% spin the detailed mesh hands
  its silhouette to a **spin-blur disc** — tangential streaks in the design's
  colours bounded by a hot rim, which is exactly the shorthand the show uses
  for a top too fast to see. Trails are triangle-strip **ribbons** (a line
  can't be wider than a pixel), and heavy clashes cut to a 0.18s **manga
  impact frame** of irregular radial wedges projected from the actual hit
  position — a cut, not a fade.
- **The stadium** is the researched wbba Beystadium: pale glossy cyan dish,
  white moulding, red posts, red ring on the saturated-blue tornado shelf —
  sitting in a *dark* painted hall (a gradient on an inverted sphere), because
  the source material lights the bowl and lets everything else fall away.

The garage gained a **whole-bey picker**: presets that set layer, disc, driver,
matching skin and the bey's canonical spin direction in one click — picking
Fafnir *means* picking left spin. The per-part slots remain below for tinkerers.

### The owner's own line

Four designs of the project owner's — **Cross X**, **Crimson Phoenix**,
**Steel Leon**, **Cobalt Drake** — ship as first-class beys: sim layers in
`parts.ts`, entries in the beydex, and presets in the picker. They start
unlocked, because locking someone out of their own designs would be absurd,
and `Progress.load` now *unions* saved unlock lists with the starting roster
rather than replacing them — the old behaviour would have kept an existing
save's list and silently hidden the new beys from anyone who had already
played.

Their stats deliberately sit on the existing archetype anchors, and they stay
out of the AI's `PRESETS` pool. Both choices protect the same thing: the
balance and pacing suites sweep `PRESETS`, so adding ten beys to the roster
changes nothing the sim was measured on.

They also drove three engine changes, because their construction is genuinely
different from the first six:

- **Tiered layers.** The complaint was exact: *"from a side view, the blades
  shouldn't be just a straight vertical line at the edge."* They weren't
  wrong — the layer was one `ExtrudeGeometry` with `bevelEnabled: false`, so
  its wall was a literal vertical extrusion. Now the wall is bevelled at both
  ends (with `bevelOffset: 0`, so the *caps* keep the original contour and the
  face texture's ±r mapping survives while the waist swells), and a second
  **under-ring tier** sits below it, rotated a half blade-step so its blades
  fill the upper tier's cutaways instead of hiding behind them.
- **Raised crests.** Cross X's gold X is extruded geometry standing above the
  face, not paint — it catches its own outline and its own cel band.
- **Dark chips.** A `chip: 'sticker' | 'dark'` mode on `BeyDesign`: black face,
  triple-stroke gold bezel, beast drawn larger in accent colours, and a small
  gold letter tucked at the chip's bottom edge. The six originals are pinned to
  `'sticker'` and render bit-identically.

One bug worth recording, because it came from a naming collision rather than
from maths: `secondary` means "the second plastic colour" for the original six
and the face texture paints blade tips with it — but for the metal designs I'd
defined it as the *detail* colour (Leon's eyes, Drake's flame). Steel Leon
therefore rendered blue-and-white instead of brushed steel. Metal designs now
derive their tip paint from a darkened `primary`. A field that means two things
is a bug waiting for its second reader.

### Impact frames

The first version was one drawing — 40 white wedges — and it read as canned
within a few matches. There are now four styles: white burst, ink burst (the
classic manga read, and the one that actually works on a near-white floor), a
two-colour clash tone carrying both beys' design primaries, and a `flash-cut`
reserved for crits that inverts the full screen for one pre-frame before
resolving. A style never repeats back to back, and wedge count, jitter,
rotation, inner radius and lifetime are all re-rolled per hit. Measured over
300 triggers: an even 103/103/94 split with zero back-to-back repeats.

The style switch also replaced the old white screen pulse under the anime
theme — a cut and a fade on the same hit undercut each other.

### /inspect.html

A dev-only bench (not linked from the game, not in the production bundle) that
renders any bey full-frame with a pitch control. It exists because the
questions that keep coming up about these meshes — *is the side profile flat?
do these two read as different?* — are only answerable by looking at a model
held still, big, from a chosen angle. The garage canvas is too small and the
arena is moving. It found the Steel Leon colour bug in about a minute.

### What the cartoon look actually cost

Almost none of the work was cel shading. It was four bugs the dark themes had
been hiding, each of which looked like a lighting problem and wasn't:

- **A dark ellipse over the middle of the stadium.** The outer housing skirt is
  a `CylinderGeometry`, which is capped, and its top cap sat at y = 0.06 while
  the bowl floor — `0.2r²` — is below 0.06 for every radius under 0.548. The cap
  had been painted across the centre of the dish in every theme since the
  stadium was written. It only became visible when the dish got bright.
- **A bright speck at dead centre.** `SparkBurst` parks dead particles at
  y = -999, but a particle that has never been *spawned* has never been through
  that path, so all 600 sat at the origin — the exact centre of the dish —
  drawing additively every frame.
- **The dish rendering nearly black.** `LatheGeometry` derives normals from the
  profile direction, and a centre → rim profile yields `normal.y = -Δr`, i.e.
  straight *down*: measured at `ny ≈ -1` on every sampled vertex, `NdotL ≈ -0.8`
  against an overhead key. Under a toon ramp that collapses the whole floor into
  the darkest band. The dish is now unlit `MeshBasicMaterial` with a painted
  texture, which sidesteps the question rather than depending on winding.
- **A dark cap over the basin from the outline pass.** An inverted hull on a
  *concave* surface lifts off it toward the camera instead of hiding behind it,
  so the back faces win the depth test across the whole bowl. The floor opts out
  of outlining via `material.userData.outlineParameters`.

The through-line: three of the four had been shipping for weeks and were only
ever invisible because the background was as dark as the artefact. Raising the
brightness of a scene is a surprisingly effective way to audit it.

Because the dish is now unlit it cannot receive a shadow map, so each top draws
its own hard elliptical contact shadow — which is what the reference art does
anyway. It's cheaper than shadow mapping and more on-model.

Both effect passes had to be pulled *back* after first build, and for the same
reason each time: an effect that overpowers its subject stops being an effect.
The aura initially rendered over the tops and washed them out — it now draws
behind them, which is where the medium actually puts it — and the speed lines
peaked at full opacity and fought the beys for attention, so they're capped
around 0.4 and masked out of the centre of the screen.

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

## The Spike Pit

Three arenas now: the plain dish, the X-Rail, and the Spike Pit. The pit exists
to fix a *measured* hole rather than to add a feature. Sweeping every preset
against every other, win rates ran **32.5% to 59.2%** — and the worst archetype
was pure attack. The reason is geography: the bowl is a parabola, so its centre
is the calmest place on the board, and a low deep launch that parks there takes
fewer contacts and outlasts. The game was quietly paying tops to do nothing.

The pit charges rent on the safe square. Spin drains as the product of two
ramps — **depth** (zero at the rim, full at the centre, so no radius is quietly
optimal) and **dwell** (zero until 1.8s of *unbroken* occupancy, so crossing the
middle to engage stays free). It is a gradient, not a wall; a hard edge would
only relocate the camp to its perimeter.

The tuning is the interesting part, because the response is **not monotonic**.
The first attempt used a drain of 34 on the obvious assumption that a harsher
tax means a flatter meta, and it made the spread *worse than the plain dish*
(26.7 → 30.0). Sweeping properly:

| drain | floor | ceiling | spread |
|------:|------:|--------:|-------:|
| plain | 32.5% | 59.2%   | 26.7   |
| 6     | 36.7% | 64.2%   | 27.5   |
| **12**| **41.7%** | **61.7%** | **20.0** |
| 20    | 38.3% | 63.3%   | 25.0   |
| 34    | 33.3% | 66.7%   | 33.3   |

Past a certain strength the pit stops being a nerf to camping and becomes a
*subsidy* to whichever build already never goes near the middle — so the harsher
settings handed the game to the most mobile top. The useful value raises the
floor nearly ten points while barely touching the ceiling: a flatter meta, not a
different tyrant. `pit.test.ts` asserts the spread narrows, and that assertion is
the arena's whole justification — if it ever fails the pit should be retuned or
removed, not have the test relaxed.

## The AI mixes now

`pickMove` used to counter a committed opponent with probability 1. That is a
pure strategy in a rock-paper-scissors triangle, and a pure strategy has an
exploit: show a cheap move, watch the guaranteed counter, and the next few
seconds are scripted. The champion's 3% misread made it a near-perfect counter
machine, which sounds hard and plays as predictable.

Difficulties now carry a `mix` (chance of declining a read it can see) and a
`bait` (spending a cheap move purely to draw a reaction, gated on a meter lead
big enough that the trade still leaves a charge in hand). `mix` *rises* with
difficulty while `misread` falls — they look similar and are opposites: a
misread is the AI being wrong, a mix is the AI being unpredictable on purpose.
Measured, the champion now answers a repeated Charge with Block 53 / Charge 7 —
unpredictable, still 88% correct.

### A measurement that lied

Worth recording because it nearly cost a day. A first version of the AI test sat
the champion on one side of a mirror match and reported it losing 65% of the
time, which read as damning evidence that mixing had crippled it. It had not.
Instrumenting the rounds showed **neither AI activating a single move**, so
their policies could not possibly have been the cause.

The seat was. With no controller running at all:

| condition | side A wins |
|---|---|
| opposite spin, angles 0/π | 88% |
| same spin, angles 0/π | 48% |
| opposite spin, same angle | 0% |

Before finding that, an entire archetype-aware aggression system had been
written to fix the phantom — and was reverted, because there was no evidence it
helped and one measurement suggesting it hurt. The tests now average both
seatings. The lesson is the old one in a new costume: a confounded measurement
is worse than no measurement, because it is persuasive.

## The seat bias, and where it actually was

A mirror match — same build both sides, opposite angles, opposite spin — is
symmetric under reflection about the y-axis: it maps each top exactly onto the
other. Neither seat can deserve to win. One did, taking 88% of them, and up to
100% at some launch angles, with no AI running at all.

Three hypotheses were wrong before the right one. The tangential smash *looked*
asymmetric under opposite spin, but swapping labels flips both the normal and
the tangent and the expressions map onto each other exactly. Array order was
ruled out by swapping it (identical result). Pockets were ruled out by their
4-fold symmetry.

What settled it was measuring instead of reasoning: instrument the round and
assert the mirror relationship every frame. The error held at **3.6e-16 for the
entire match** — the physics preserves the symmetry perfectly and never
amplifies it. Which meant both tops were reaching defeat on the *same step*,
separated only by floating-point dust, ultimately from `sin(pi)` evaluating to
1.22e-16 rather than 0 at launch.

The bug was in the simultaneous-defeat tiebreak, which compared the two spins
with a strict `>`. That treated 1e-16 of IEEE754 rounding as a real result, and
always in the same direction. It now compares with a relative tolerance and
breaks genuine dead heats on the seeded RNG — deterministic for replays, fair in
aggregate, and without resurrecting the 29% draw rate the tiebreak was added to
kill. Mirror matches now run 48–53% across every launch angle and archetype
(`fairness.test.ts`).

The lesson is the expensive one: an "obviously asymmetric" piece of code cost
three wrong diagnoses, and a five-line instrumentation harness found the real
cause immediately. Reach for the measurement first.

## Silhouette grammar

Every layer used to be cut from one curve language, so the ten designs differed
in proportion but never in *kind* — they read as recolours. There are now four
genuinely different constructions, chosen per design:

| profile | character | used by |
|---|---|---|
| `blade` | straight run to a hard point, deep undercut — cut metal | Valtryek, Spryzen, Cross X |
| `wave` | continuous scallop, no corner anywhere — moulded plastic | Fafnir, Aegis, Steel Leon |
| `hook` | edge bulges past contact radius then curls back into a barb | Luinor, Cobalt Drake |
| `flame` | long slow rise, short sharp fall — blown backwards | Ragnaruk, Crimson Phoenix |

Every design also carries an `underRing` now, not just the player-designed four.
That tier is what made Crimson Phoenix read as assembled hardware while the
originals read as a single slab: it is a second, blunter cut of the *same* edge
grammar, rotated a half blade-step so its blades fill the upper tier's cutaways
rather than hiding behind them.

### Surface hardware

Changing the outline was only half of it — the blade *faces* were still flat
colour with painted ring lines, so from above a top read as a printed disc.
Each edge grammar now carries the surface treatment that belongs to it, as real
geometry rather than paint:

- `blade` — raised radial ribs tapering out along each blade, plus a bright
  accent chip at the contact point: the bit that actually strikes.
- `wave` — vent slots cut along the scallop, tied together by a raised arc band.
- `hook` — plates stepping outward and upward, so the face reads as scaled.
- `flame` — fins raked progressively harder along the lick, so the surface
  agrees with the outline about which way the flame is blowing.

Tying the detail to the edge grammar rather than making it a separate field is
deliberate: a scalloped layer wearing hard machined ridges reads as two designs
bolted together. Cel shading pays for this more than a lit renderer would,
because `OutlineEffect` inks every one of these pieces individually — the
detail survives at battle distance as linework even when the shading flattens.

Everything sits strictly inside the contact radius, so *what you see is what
hits* still holds: none of it widens the silhouette the sim collides on.

## Cel metal

`MeshToonMaterial` has no metalness channel and no specular term at all, which
is why a gold forge disc rendered as flat yellow and the Classic theme looked
more metallic for free — MeshStandardMaterial hands it a real specular lobe.
Cel art solves this differently, and the two things it actually draws are a
**banded** highlight (a hard chip of light that snaps between levels; a smooth
Blinn-Phong falloff is the strongest "this is CG" signal there is) and a
**fresnel rim** tinted with the metal rather than white, so gold edges warm and
steel edges cool.

Implemented as an `onBeforeCompile` patch on a real MeshToonMaterial, which
keeps the lights, gradientMap, shadows and fog working untouched. Measured
off-screen against a plain `toonMaterial` control on a gold sphere: peak
luminance 172 → 244, with the lobe landing in the core (+5.5) and the fresnel
only at grazing angles (+4.1). On a cube the control renders the ramp's 3 flat
plateaus and the metal renders a discrete 4th — a plateau, not a gradient.

`OutlineEffect` is unaffected, and that was checked rather than assumed:
`getOutlineMaterialFromCache` builds a *fresh* BackSide ShaderMaterial keyed on
the original's uuid and copies across a fixed list of properties that includes
neither `onBeforeCompile` nor `customProgramCacheKey`. Measured: 254 hull
pixels for a plastic cube, 254 for the same cube in metal, 0 with `noOutline`.

Only some parts take it, and that restraint is the effect: the forge disc, the
accent hardware (contact chips, bands, the X crest) and the walls of designs
flagged `metal: true`. A top where every surface carries a specular chip reads
as chrome-plated and stops saying "this bit is metal" about anything.

## Why a spinning top looked like a picket fence

Reported as "these blade vertical lines around the beyblade". The cause was
aliasing, not the blur texture. `b.angle += b.spin * dt * 0.05` at
`SPIN_REF = 900` advances **0.75 rad per frame**, and against a blade step of
`2π/blades` no blade count lands anywhere trackable:

| layer | blades | steps advanced per frame | result |
|---|---|---|---|
| Aegis | 8 | 0.955 | crawls *backwards* — a frozen fence |
| Fafnir | 6 | 0.716 | reverse strobe |
| Spryzen | 4 | 0.477 | sits on Nyquist — maximum shimmer |

The fence was drawn with the layer's own inked side walls. And the blur disc
could not have hidden it: at radius `1.15r` and height `1.25r`, the sight line
from a 34° camera to the near blade tip crosses the disc plane at `1.28r` —
*outside* the disc, so the near half of the fence was drawn in front of it.

Fixed by removing the thing that aliases rather than dressing it: the blur body
is now rotationally symmetric (a symmetric disc cannot alias), motion is
carried by a single glint on its own pivot counter-rotated to a drawn 3.4 rad/s,
and **afterimage ghosts** share the real layer's geometry at quarter-blade-step
offsets so blades + ghosts sit at 4× blade count and close the gaps the fence
was made of. The disc is domed and view-angle faded so it stops reading as a
flat plate, and the layer's ink thickness tapers to 45% at full blur — taking
the pen away from the fence.

## Impact frames, take two

Reported as repetitive twice. The first pass varied palette and jitter inside a
single radial-wedge drawing, and measured evenly across four styles — which was
the wrong axis, because every frame was the same *composition* recoloured.

There are now six genuinely different pictures: radial burst, speed-line sheet
with a hole punched at the clash, shattered pane, concentric shock rings, ink
vignette, and a crit-only negative slam. Tone (ink / paper / inverted / bey
colours) is rolled independently on top. Anti-repetition remembers the last
**two** compositions, not one — with a set this small, A B A B never repeats
back-to-back and still reads as a loop. Measured over 600 triggers:
`{radial 101, sheet 108, shatter 117, rings 100, vignette 110, slam 64}`, with
zero repeats at distance 1 or 2 and the slam never firing on a non-crit.

One structural note: no stroked circles anywhere. `preserveAspectRatio="none"`
scales stroke width anisotropically, so every ring is a filled two-contour
polygon instead.

## Picker thumbnails

The picker used to represent each bey as a text chip with a colour dot, so
choosing a bey was choosing a *name* — none of the silhouette, tiering or
palette work was visible at the one moment it should matter.

Each preset now draws its own plan view, and the important part is that it is
drawn from the *same* `bladeSilhouette` the mesh is extruded from, sampled via
`Shape.getPoints`. A preview drawn separately is a second implementation of the
design and will drift; sharing the source means a thumbnail cannot advertise a
shape the model does not have. It paints in the same order the mesh stacks —
under-ring (with the same half-blade-step stagger), blade tier, accent ring,
chip — because that ordering is what makes the tiering read.

Canvas2D rather than a WebGL preview per chip, deliberately: ten live renderers
would exhaust the browser's ~16 context limit on their own, and the plan view is
the honest angle anyway — it is where the blade profile reads, and roughly what
the battle camera shows.

## Coins, crates and the shelf

Two ways to acquire a part, on purpose, because either one alone is a worse
game. `src/economy.ts` holds both.

**The crate** is chance. Three tiers, each with published odds, and the odds bar
under every crate in the garage is *generated from the crate's own weights* —
there is no second copy of those numbers to drift out of sync with the roll.
`rollCrate` picks the rarity first and the item second, which is what makes the
advertised weights true: rolling an item directly and reading its rarity
afterwards would let the catalog's shape silently override the crate's, so
adding three common layers would quietly make every crate worse.

**The shelf** is choice. Four named parts at fixed prices, restocked free after
every match, with a flat 45-coin reroll for impatience. It exists so that
wanting a specific part never requires gambling for it. Chasing one particular
legendary through Relic Crates costs roughly 4,700 coins in expectation and
hands you a random one at the end; the shelf sells the exact part for 1,500 and
cannot disappoint you. `economy.test.ts` pins that relation for every rarity —
if the certain path ever became the worse deal, the crate would stop being
optional, and that test fails the build.

Three properties are structural rather than promises, and each has a test:

1. **The only source of coins is playing.** There is no purchase path anywhere
   in the codebase. A crate cannot be bought, only earned.
2. **Crates hold nothing the ladder does not also give.** Every reward also
   drops from beating rivals. A crate buys the part *sooner*, never exclusively,
   and never power the balance suite has not measured.
3. **Rarity is derived, not assigned.** `layerRarity` and `spreadRarity` compute
   it from what a part actually does, so a nerfed part becomes commoner
   automatically and rarity can never disagree with power. Skins cap at rare —
   the rarest thing in the game should not be something that cannot affect a
   match.

Duplicates refund instead of being swallowed. The invariant that matters is
*expected* refund, not the maximum one: bounding the maximum sounds right and is
wrong, because the cheapest crate costs 60, so it would force a legendary
duplicate below that and make the best consolation prize in the game worth less
than a common part. Measured expectation is 21–43% of cost — enough to sting,
never a coin printer for a fully-collected player.

The reroll cost is flat and there is a test asserting it. Escalating reroll
prices are the standard trick in this genre and they are the manipulative part:
they charge you more for continuing to look, which is pressure dressed as a
choice.

### The reveal

The reel is the feature. A pull that prints "you got X" is worth nothing — the
value is in the seconds before you know. `crateReveal.ts` scrolls 48 tiles,
decelerates with a cubic ease carrying a damped sine on the tail so it overshoots
slightly and comes back, and settles with the winner under a fixed marker.

Two details that look like styling and are not:

- The winner is **placed into the strip** and the strip translated so it lands
  under the marker — not the marker moved to wherever the reel stopped. Those
  render identically and only one of them can silently show the wrong item.
- The result is **rolled and banked before the animation starts**. Closing the
  tab mid-reveal cannot cost the item, and the near-miss is honest theatre
  rather than a recalculation.

The settle glow scales hard with rarity and a legendary pulses, because if every
outcome lights up the room then none of them mean anything. Common was darkened
from `#8fa3bf` for the same reason — it was bright enough that the dullest
possible result looked like a jackpot.

Found while testing: `requestAnimationFrame` does not run in a hidden tab, so
switching away mid-reveal froze the reel with no caption and left it frozen on
return. Nothing was lost — the item is already banked — but a stalled reel is
indistinguishable from a crash, so a `setTimeout` backstop resolves it.

## Known gaps

- **The champion AI loses to the rookie in stamina and defence mirrors** (35%
  and 15%). Pre-existing and identical with mixing on or off, so it is not the
  mixing. `chooseSpinDir` and `chooseLaunch` branch on archetype but `pickMove`
  does not, which is the obvious suspect — but one attempt at fixing it was
  chasing the seat-bias confound above and had to be reverted, so this needs
  measuring properly rather than another guess. The confound is gone now, so a
  re-measurement would finally be trustworthy.
- Skins vary colour and material but not **silhouette**. Blade count already
  differs per layer; distinct shapes per skin would push identification further.
- The tutorial is explanatory, not interactive. A scripted round that forces
  each situation in turn would teach the triangle faster than reading it.
- The garage labels sit at fixed thirds rather than tracking the projected
  screen position of each part, so they drift when the model is rotated steeply.
- The ladder ends. After Zeph there is no endless mode, no ranked ladder and no
  daily challenge — and the deterministic seeded sim makes a seeded daily run
  nearly free, so that is the obvious next step.
- The shelf restocks per match but does not rotate on a clock, so there is no
  reason to come back tomorrow specifically.
- Bundle is ~700 kB (182 kB gzipped), almost entirely Three.js.
