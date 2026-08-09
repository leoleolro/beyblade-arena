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

## Known gaps

- Skins vary colour and material but not **silhouette**. Blade count already
  differs per layer; distinct shapes per skin would push identification further.
- The AI reads moves but does not bluff, so a patient player can bait it.
- The tutorial is explanatory, not interactive. A scripted round that forces
  each situation in turn would teach the triangle faster than reading it.
- The ladder ends. After Zeph there's no endless mode, no ranked ladder and no
  daily challenge — and the deterministic seeded sim makes a seeded daily run
  nearly free, so that's the obvious next step.
- Bundle is ~570 kB (147 kB gzipped), almost entirely Three.js.
