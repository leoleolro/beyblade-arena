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
| Garage | mouse | pick parts and rival difficulty |
| Launch | `Space` | stop the meter — green zone is the widest, most aggressive orbit |
| Battle | `Space` | spend a full boost meter to charge your rival |

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

Current spread across the six presets is roughly 31%–69%, with all four finish
types represented. `sim.test.ts` asserts no build exceeds 72% or falls below
25%, so a balance regression fails the suite.

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

## Known gaps

- Roughly a fifth of rounds end inside two seconds. These are genuine fast
  knockouts in opposite-spin matchups — true to the real game — but a launch
  grace period would soften the extremes if they feel abrupt.
- Every match is deliberately an opposite-spin matchup (you spin right, the
  rival spins left), because it's the most dramatic version of the model.
  Same-spin matchups are supported by the sim but not currently reachable in the
  UI.
- Bundle is ~558 kB (143 kB gzipped), almost entirely Three.js.
