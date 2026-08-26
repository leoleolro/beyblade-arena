# Real beyblade physics, and what this sim does instead

Research pass for the backlog item: *"research the physics of beyblades in real
life… by understanding the physics of these we can mimic it in our game."* Four
topics were named — rail acceleration, spin stealing, jumping out of and back
into the stadium, and near-vertical launches.

Same shape as `ARENA-IDEAS.md`: what the real thing does, what this sim already
models, **what the gap measures**, and what closing it would cost. Every number
about our own sim below is measured, not asserted; the harness is
`sim/railRate.test.ts` and the method is stated with each figure.

A note on the sources. Beyblade physics writing splits into competitive-player
empiricism (reliable about *what happens*, informal about *why*) and enthusiast
physics (rigorous notation, rarely measured). The most honest source found is
the Beyblade Research Group's own piece, which is explicit about where physics
stops being able to answer: burst thresholds need "actually disassembling and
measuring the parts", and design rationale "cannot be known without asking the
designer directly". Treated accordingly — mechanism from the physics, magnitudes
from our own measurements.

---

## 1. The X-Celerator rail

### What the real thing does

The gimmick is **gear-on-gear**, not friction. A Beyblade X Bit carries teeth on
its underside; the Xtreme Stadium carries a geared "Xtreme Line" along its
walls. When the two mesh, the stadium drives the top and it accelerates into an
**Xtreme Dash**. Tooth count is a tuning parameter on the *part*: the Accel bit
has 16 teeth against a standard 12, buying a faster dash at the cost of stamina.
Rubber Accel adds a wide guard so the top lifts clear of the rail during the
dash.

Two properties matter more than the mechanism:

**There is no limit on dashes, and they compound.** Nothing in the product caps
how many times a top may engage; a top can dash repeatedly and keep gaining
speed, which is the basis of the "Xtreme Dash Infinite" technique. The owner's
own observation of the toy — *"5 times under 3 seconds, small bumps then big
bumps"* — matches this exactly, and the second half of that sentence is the
important half: **the dashes escalate.** Early engagements are small; later ones,
from a faster top, are violent.

**Flat bits reach it; round ones do not.** A flat tip creates aggressive outward
movement, which is what puts a top on the wall in the first place. The rail is
therefore a reward for a build and launch that were already committed to the
outer orbit.

### What this sim does

`updateRail` in `sim/physics.ts` is a decent model of a *single* dash. A top
inside the band, moving tangentially above `engageSpeed`, latches for
`duration`; radial drift is cancelled so it tracks the band, it accelerates at
`accel` up to `maxSpeed`, and on release the exit velocity is rotated inward by
`releaseInward` — the slingshot. Then `cooldown` before it can happen again.

XRAIL's constants: `duration 0.55`, `cooldown 1.6`, `accel 3.0`, `maxSpeed 3.4`,
`engageSpeed 1.9`, `releaseInward 0.85`.

### The gap, measured

Across 120 AI-played rounds, all preset pairings:

    rides per round (both tops)            1.98
    rides per top per round                0.99
    most rides by one top, any round       3
    mean round length                      5.73 s
    rides per second per top               0.17
    median gap between one top's rides     3.93 s

Against the real toy's roughly **1.7 dashes per second**, our rail fires about
**ten times less often**, and the median wait between one top's dashes is 3.93 s
against something closer to 0.6 s.

This is not a tuning accident, it is arithmetic. `duration + cooldown` is 2.15 s,
so one top *cannot* dash more than 27 times a minute no matter what else
happens; five dashes in three seconds is unreachable without changing those two
numbers. `railRate.test.ts` asserts exactly that relationship, so the ceiling
cannot drift silently.

And there is no escalation at all. `accel` and `maxSpeed` are constants, every
ride starts from the same ceiling, and `railRides` is counted but never read by
the physics. Our rail is a **rare special event**; the real one is a **rhythm
that builds**.

### P1. Make the rail a rhythm — **the highest-value change here**

Cut `cooldown` hard (1.6 → ~0.35) and shorten `duration` (0.55 → ~0.3), so a top
holding the outer orbit dashes repeatedly instead of once. Then make it
escalate: let `maxSpeed` rise per consecutive ride, decaying back once the top
leaves the band — the "small bumps then big bumps" the owner described.

`railRides` already exists on `BeyState` and already resets per round, so the
escalation has a counter waiting for it. The decay is the new state.

**Cost: small in code, large in balance, and it must not be done blind.** The
rail already biases exits toward the graded pocket (33.3% of knockouts against
25% by chance — see `ARENA-IDEAS.md`), and making it ten times more frequent
moves every number in `played.test.ts` and `xtremeFinish.test.ts`. The Spike
Pit's own history is the warning: a harsher tax made the archetype spread
*worse*, not flatter. Re-run the preset sweep, read hits-per-round and round
length, and expect to retune `maxSpeed` downward to pay for the frequency.

### P2. Tooth count as a real part stat

The Accel bit trades stamina for dash speed at 16 teeth against 12. We have
`DRIVERS` with a `spin` stat already; a `railGrip` alongside it would make
"which bottom" a decision about the rail specifically, which is what it is in
the real game. Cheap, and it only becomes meaningful after P1 — with one dash a
round there is nothing for it to modify.

---

## 2. Spin stealing

### What the real thing does

Two tops in **opposite** rotation meet, and the faster one's rotational momentum
transfers to the slower until they equalise — the loser of that exchange sheds
spin, the winner gains it. In **same-spin** contact there is no such transfer;
the rotation vectors reinforce rather than mesh, and both tops are simply
destabilised.

Two amplifiers: **rubber**, which raises friction at the contact and so moves
more energy per hit, and **round, smooth layer shapes**, which stay in contact
instead of deflecting. Absorber layers are round for this reason and attackers
are not.

The clean physical statement, from the research-group piece: opposite rotation
lets the angular-momentum vectors mesh, producing "spin equalisation" and
leaving the absorbing side harder to topple. Same-spin collisions interfere
destructively and destabilise both.

### What this sim does

Better than expected, and the model is already the right shape. `resolvePair`
computes `opposite = dirA !== dirB`, and:

- `spinSteal` per layer transfers spin on contact, gated on `opposite`
- `sameSteal` lets one layer (the vampire) steal in same-spin too, at a fraction
  of its rate — deliberately the exception
- `OPPOSITE_SPIN_DRAIN` multiplies drain in opposite-spin matchups
- surface slip is modelled from the real cancel/add asymmetry: measured slip of
  about **188** in a same-spin pairing against **3.5** opposite, a factor of 54,
  because the tangential terms cancel when the spins oppose and add when they
  agree

That last one is genuinely the real physics, already derived and already
measured in this codebase.

### The gap

**Equalisation, not one-way theft.** Ours is a one-way transfer at a rate set by
the absorber's `spinSteal`. The real exchange is symmetric and runs *toward
equality*: the faster top loses, the slower gains, and it stops when they match.
A top that is already slower than its opponent should gain spin from a hit even
without an absorber layer.

**Rubber is not represented.** Friction at the contact is a property of the
layer material in the real game and a flat constant here.

### P3. Equalisation as the base rule

Make opposite-spin contact move a small fraction of the *difference* in spin
rather than a fixed rate from B to A, with `spinSteal` becoming a multiplier on
that fraction rather than the whole mechanism. Fafnir keeps its identity — it
just has a much larger multiplier than a plain attacker.

Why it is worth doing: it makes the comeback real. Right now a top that has lost
the spin race has no route back except its opponent's mistakes; under
equalisation, choosing opposite spin against a faster opponent is a *strategy*,
which is what the source material treats it as.

**Cost: this is a core sim change and touches every balance number in the
project.** `POINTS_TO_WIN`, spin-finish rates and the whole preset sweep. Not
hard to write; expensive to validate. Do it alone, not alongside P1.

---

## 3. Jumping out, and landing back in

### What the real thing does

**It does not save you.** A Beyblade that leaves the play area is knocked out
even if it bounces back into the stadium afterwards. The finish registers on
exit. Beyblade X scores that as a 2-point Over Finish; the graded pockets we
already model (`ARENA-IDEAS.md` E1) are the same family of rule.

So the dramatic image of a top flying out and returning is exactly that — an
image. Competitively it is already over when it crosses the line.

### What this sim does

The same thing, and for the same reason. `resolveWall` lets a top in a pocket
fly out, and the round logic sees it cross `EXIT_RADIUS`. There is no path back.

### P4. Make it visible, not survivable

Nothing to fix in the rules — our behaviour already matches the real one. What
is missing is the *drama*: the exit is instant, and the moment a top is flung
over the wall is the most cinematic thing that can happen in a round.

A ballistic arc after the exit crossing, purely cosmetic, with the round already
decided at the crossing. That keeps the rule exactly as it is (and as the real
one is) while making the picture match the show. This belongs in the renderer,
not `sim/`, and the sim/render boundary makes it safe: the sim has already
returned its verdict before the arc begins.

Cost: small, renderer-only, no balance risk. **The best value-per-risk item in
this document.**

---

## 4. Near-vertical and banked launches

### What the real thing does

Launch angle is a real skill with three named techniques:

- **Flat** — launcher level. Stable, centred; suits stamina and defence.
- **Bank** — launcher tilted so the top's base sits parallel to the stadium
  slope. Produces the **flower pattern**: repeated excursions from centre to rim
  and back. Suits attack, and it is what keeps a fast-tipped top from flying
  straight out. Overdo the tilt and it scrapes and destabilises.
- **Sliding** — a more direct centre-crossing path, very sensitive to starting
  position.

The bank launch is the interesting one, because the flower pattern is a genuine
emergent orbit, not a scripted move, and it is the pattern that repeatedly
brings a top into the wall — which in Beyblade X is how you meet the rail.

### What this sim does

`LaunchParams` carries `power`, `entryAngle` and `entryDepth`. That is a launch
*position* and strength, and it has no tilt at all. Entry depth is the closest
analogue — rim versus centre — but it sets a starting point rather than an
ongoing orbit shape.

`b.tilt` exists but is an *output*: `speed * 0.06 + (1 - spinNorm) * 0.22`, a
consequence of the round's state that the renderer leans the top by. Nothing the
player chooses feeds it.

### P5. Launch tilt as an input

Add a tilt to `LaunchParams` that seeds a radial oscillation — an initial
outward radial velocity component with the bowl's own restoring slope producing
the in-and-out motion. `bowlHeight` and `slopeAccel` already give the restoring
force, so the flower pattern is what falls out of an off-centre launch with
radial energy; it does not need to be scripted.

This composes with P1 in a way none of the others do: a banked launch produces
repeated wall contacts, repeated wall contacts meet the rail, and the rail is
what a banked launch is *for* in the real game. Those two together turn the
X-Rail arena from "a ring that sometimes grabs you" into a floor you play.

**Cost: medium, and it needs a UI.** The launch minigame is currently one
meter — power — and a second axis has to be learnable rather than fiddly. Worth
prototyping the physics behind a fixed value before designing the control, so
the question "does this produce an interesting orbit" is answered before the
question "how does a player set it".

---

## Order

1. **P4** — the ring-out arc. Renderer-only, no balance risk, biggest picture.
2. **P1** — the rail as a rhythm. The largest gap measured, and the mechanic the
   arena is named for. Full sweep behind it.
3. **P5** — launch tilt, physics first behind a fixed value, control after.
4. **P2** — rail grip per bottom. Only meaningful after P1.
5. **P3** — spin equalisation. Alone, with the whole sweep re-run.

## What the research does not support

Two things worth writing down so they are decisions rather than omissions:

**Modelling gear teeth individually.** The mesh is the real mechanism, but a
tooth-level model would be a rigid-body contact problem at 60 Hz for an effect
fully described by "accelerate while engaged". P2 captures the design intent —
different bottoms grip differently — at a thousandth of the cost.

**Physics-derived burst thresholds.** The research group is explicit that this
needs the parts disassembled and measured; the ratchet tooth profile, material
elasticity and manufacturing tolerance are not derivable. Our `burstResist` is a
tuned game number and should stay one.

## Sources

- [Beyblade Wiki — Xtreme Dash](https://beyblade.fandom.com/wiki/Xtreme_Dash)
- [Beyblade Wiki — Bit: Accel](https://beyblade.fandom.com/wiki/Bit_-_Accel)
- [Beyblade X Database — Rubber Accel](https://www.beybxdb.com/parts-system-guide/parts/bit/rubber-accel)
- [Beyblade Wiki — Xtreme Dash Infinite](https://beyblade.fandom.com/wiki/Xtreme_Dash_Infinite)
- [Beyblade Wiki — Spin Absorption](https://beyblade.fandom.com/wiki/Spin_Absorption)
- [Beyblade Research Group — What Physics Can and Cannot Answer](https://note.com/kamen_a/n/nc133774c64a5?hl=en)
- [BeyBase — Redefining "Play Area" and "Knocked-Out"](https://beybase.com/redefining-play-area-knocked-out-beyblade/)
- [SEQ Beyblade X Rulebook](https://bey.au/post/7-rulebook/)
- [BBX Arena — Launch Techniques](https://bbxarena.com/blog/launch-techniques)
- [Beyblade Wiki — Advanced Techniques](https://beyblade.wiki/advanced-techniques/)
- [Hasbro — Xtreme Battle Set instructions](https://instructions.hasbro.com/en-us/instruction/beyblade-x-xtreme-battle-set-with-beystadium-2-right-spinning-top-toys-and-2-launchers)
