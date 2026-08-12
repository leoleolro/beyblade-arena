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
