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

### P1. Make the rail a rhythm — **SHIPPED, see the rebuild section below**

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

### P2. Tooth count as a real part stat — **SHIPPED, partly**

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

### P3. Equalisation as the base rule — **BUILT, MEASURED, REVERTED**

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

### P4. Make it visible, not survivable — **DONE**

Nothing to fix in the rules — our behaviour already matches the real one. The
gap was that nothing *framed* the moment.

**And the first version of this proposal was wrong.** It said the exit was
instant and proposed adding a ballistic arc. The arc already existed, in
`playDefeat`: the top leaves on its exit bearing, rises at 2.2/s against 26/s²
of gravity, and drops out of shot at 0.40s. Written from reading the plan
instead of reading the code.

The actual bug was one level down, and subtler. The camera already knew to keep
framing a defeated top — a previous pass fixed the framing SET, filmstripping
`__moment('ringout')` to prove it. But it framed on `b.pos`, the **sim**
position, which freezes the instant the top crosses `EXIT_RADIUS` because the
sim has stopped touching it. The visual then flew on without it. The camera held
a point the top had already left.

Fixed by framing on the drawn position for any defeated top whose visual is
still visible. `beyWorldPosition` maps sim (x, y) to world (x, height, z) one to
one, so the visual's x/z drop straight into the framing maths. Because `spread`
reads the same set, the camera also widens to keep winner and departing loser in
one shot.

Filmstripped before and after: the loser went from a grey speck at the top edge
of frame to filling the lower third of it, sailing out of the dish. That is the
shot people clip.

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

1. ~~**P4** — the ring-out arc.~~ **Done.** The arc existed; the camera was
   framing the sim's frozen exit point instead of the drawn one.
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


---

# Deep research pass: the design language, and what it bought

A second, wider research pass was run as a fan-out of six parallel dives. Four
returned before the session limit stopped the rest: **dash**, **spin**,
**launch** and **designs** (107 findings and 140 hard numbers between them). The
**stadiums** and **spectacle** dives did not complete, and neither did the
adversarial fact-check stage — so everything below is single-sourced research
that has NOT been independently verified. Treated accordingly: it was used to
shape *designs*, where being wrong costs a redraw, and deliberately not to
retune balance numbers, where being wrong costs a sweep.

## What the dash dive added over part 1

- The rail **redirects the top toward the centre of the stadium**, it does not
  merely speed it along the wall. Our `releaseInward: 0.85` was already the
  right shape; this confirms it rather than changing it.
- Only three tooth counts exist across the whole Bit catalogue: **10, 12, 16**.
  12 is standard.
- The trade is not "more teeth is better". **Fewer teeth (10) means a slower but
  MORE FREQUENT dash and less stamina burn**; more teeth (16) means a faster
  dash at a stamina cost. Rush's own product copy says so directly. That is a
  genuinely better model for P2 than the one in part 1, which assumed teeth
  simply scaled dash strength.
- Rail reach is set by **Bit height class**, not ratchet: Low −1mm, High +1mm,
  Under −2mm.
- Gear Bits extend the teeth to the floor contact, so the tip *is* the gear —
  and Gear Ball dashes **involuntarily when struck**, which is a Stamina part
  with an attack-shaped failure mode.

## The design language, which is what got built

This is the part that produced work rather than notes. The conventions are
consistent enough to design from:

| Type | Contact points | Silhouette | Weight | Modern colour |
| --- | --- | --- | --- | --- |
| Attack | 2–4 large | sharp, jagged, upward-slanting | heaviest, 33–39 g | blue |
| Defence | 5–9 small | round, thick, near-continuous rim | **central** | green |
| Stamina | 0–5 smooth | circular, no corners | **outward** | orange |
| Balance | mixed | heterogeneous or asymmetric rim | middling | red |

Three rules worth keeping:

**Fewer, larger blades create recoil; more, smaller blades damp it.** Not a
metaphor — KnightShield's copy says its six blades "create an impact dampening
structure", and SphinxCowl's nine "repel attacks from multiple directions".

**Balance is heterogeneity, not averageness.** WeissTiger carries three
separately named blade families on one rim. A balance bey that is just a
middling attacker reads as nothing.

**Three-fold symmetry is the structural default**, because every Beyblade X
blade physically needs three launcher hooks.

Colour conventions flipped between generations — attack was red in the older
lines and is blue in Burst/X — so the roster follows the modern set.

## Built from this

Six new Epic beys, each one an argument from the table above rather than a
recolour: **Tempest Lance** (attack, the only 2-blade top), **Basilisk Coil**
(stamina, roundest in the roster, outward weight), **Golem Bastion** (defence,
8 points, central weight), **Wyrm Fang** (attack, left spin — the documented
rival trope, and the roster's first left-spin attacker), **Solaris Halo**
(balance, asymmetric `flame` rim), **Chimera Maw** (balance, 6 hooks).

Stats sit on the existing archetype anchors on purpose. These exist for their
looks, and novel numbers would reopen a balance question the anchors already
answered.

## Still unverified

Carried forward rather than dropped: the stadiums and spectacle dives never ran,
the fact-check stage never ran, and 50 of the numbers gathered are single-source
wiki figures. Anything from this pass that is about to drive a *balance* change
should be re-checked first.


---

# The rail rebuild, and what the sweep actually said

P1 is built. The headline: **the median gap between one top's consecutive rides
falls from 3.93 s to 1.00 s**, rides now chain into escalating streaks of three,
and round length and knockout rate land within a whisker of where they were.

## The first attempt was wrong, and the sweep caught it

The plan in P1 said to cut `cooldown` **and** `duration`. That is what I did
first, and it was a mistake with an obvious cause in hindsight: shortening the
ride also shortens the *drive*. Tops left the band slower, returned less often,
and mean round length went from 5.73 s to **10.4 s** — an 80% slower game for no
gain in engagement at all.

Sweeping the two independently:

    dur 0.55  cd 1.60    gap 3.93 s   round  5.73 s   ko 49.1%   (before)
    dur 0.30  cd 0.35    gap 0.70 s   round 10.40 s   ko   --
    dur 0.45  cd 0.35    gap 0.88 s   round  6.88 s   ko 46.7%
    dur 0.50  cd 0.35    gap 1.00 s   round  6.31 s   ko 51.7%   <- shipped

**The lever was the cooldown alone.** The ride wants to stay long.

## The escalation

`RailSpec` gains `escalation`, `escalationMax` and `streakWindow`; `BeyState`
gains `railStreak` and `railIdle`. Each consecutive ride raises the speed
ceiling — 3.4, 3.75, 4.1, capped at 4.45 — and a top that leaves the band for
longer than the window drops back to a small bump.

Measured streaks reach **3**, so the ramp is reachable in play rather than
theoretical. `escalation: 0` reproduces the old flat behaviour exactly, so an
arena can opt out; the Gauntlet takes a shallower ramp because it already drives
tops to the wall with its pit and should not also hand them the steepest reward
for going there.

## What did NOT get closer, and why it is not a tuning problem

Engagements per second per top sit at **0.16**, against the real toy's ~1.7.
Essentially unchanged.

That gap is not in the rail's constants. It is that **our tops rarely reach the
wall at all** — they fight in the middle and touch the rim occasionally, where a
real flat-bit top rides the wall almost continuously. Closing it needs the orbit
shape to change, which is P5: launch tilt producing the flower pattern, whose
whole character is repeated excursions from centre to rim and back.

So the rail now has the right *rhythm* when it fires, and the wrong *frequency*
of firing, and the second half belongs to a different change. Recorded rather
than tuned around.


---

# P2 shipped: the Dash stat

The wiki publishes a five-axis stat block for every Beyblade X Bit — Attack /
Defense / Stamina / **Dash** / Burst Resistance — and Dash is precisely the
rail-grip axis P2 proposed. Transcribed rather than invented:

| Bit | type | g | Atk | Def | Sta | Dash | Burst |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Gear Flat | Attack | 2.3 | 50 | 5 | 5 | 40 | 80 |
| Accel | Attack | 2.6 | 40 | 10 | 10 | 40 | 80 |
| Flat | Attack | 2.2 | 40 | 15 | 10 | 35 | 80 |
| Rush | Attack | 2.1 | 40 | 10 | 20 | 30 | 80 |
| Point | Balance | 2.2 | 25 | 25 | 25 | 25 | 80 |
| Taper | Balance | 2.2 | 35 | 20 | 20 | 25 | 80 |
| Needle | Defense | 2.0 | 10 | 50 | 30 | 10 | 30 |
| Ball | Stamina | 2.1 | 15 | 25 | 50 | 10 | 30 |
| Orb | Stamina | 2.0 | 10 | 30 | 50 | 10 | 30 |

**The burst axis inverts what you would guess** — attack Bits score 80 and
stamina Bits 30 — because a flat tip's wide contact grips the burst locks where
a sharp stamina tip does not. Transcribed rather than "corrected"; the source is
consistent about it across every entry.

## I had the mechanism backwards first

The obvious reading is that Dash gates whether a tip can catch the rail at all.
Built that way, it measured a **62% collapse in rail use** — 0.99 rides per top
per round down to 0.375 — because most bottoms are not attack bottoms, so the
arena's headline mechanic became unreachable for two thirds of the roster.

The source says otherwise, explicitly. Rush's official description: *"Features a
ten tooth gear that reduces the SPEED of Xtreme Dashes, but also increases their
FREQUENCY."* Dash rates how hard the tip is **driven once meshed**. It is not a
gate on meshing.

## What is live, and what is masked

**Live: dash speed.** Peak speed while railed, measured over 60 rounds each —
Gear Flat and Accel reach **3.42**, everything else **3.15**.

**Masked: dash frequency.** Grip also scales the cooldown, so a low-Dash tip
should nag where a high-Dash tip hits hard and rarely. Measured, rides per round
are identical across every Bit (1.0–1.05) whatever the cooldown — because tops
only reach the rail about once a round anyway. **Engagement is limited by
getting to the wall, not by how soon you are allowed back**, which is the same
bottleneck that keeps our rail at 0.16 engagements per second against the real
toy's ~1.7.

Kept rather than removed, because it is what the source describes and it becomes
real the moment engagement improves. Recorded here so it is a known-masked
mechanic rather than a mystery later.


---

# P3 tested: equalisation is real physics and a worse game

Built it, measured it, reverted it. The finding is the deliverable.

**What it was.** Opposite-spin contact moved a fraction of the spin DIFFERENCE
from the faster top to the slower — `SPIN_EQUALISE = 0.03`, scaled by each
side's own `spinSteal` so an absorber still did it harder. That is what the
sources describe: counter-rotating contact meshes the angular-momentum vectors
and runs the exchange toward parity, rather than one top robbing another at a
rate set by its own parts.

**The claim I made for it** was that it "makes the comeback real" — a top that
has lost the spin race gets a route back, so choosing opposite spin against a
faster opponent becomes a strategy.

**The measurement says the opposite.** 160 forced opposite-spin rounds, champion
AI both sides, counting rounds where a meaningful spin gap (>5% of launch spin)
had opened by 2.5 seconds, and how often the top that was behind went on to win:

                        rounds with a gap    comeback rate
    without equalise           36                63.9%
    with equalise              18                50.0%

**It halves the number of rounds that ever develop a gap**, and the gaps that do
open reverse *less* often. Mean mid-round gap falls from 0.030 to 0.022.

The mechanism is obvious in hindsight: a rule that continuously pulls two tops
toward parity prevents the very gaps a comeback would reverse. It does not
create drama, it removes the conditions for it. Opposite-spin matchups become
flat attrition races decided at the end.

**So realism and game feel diverge here, and this project ships the game.** The
one-way `spinSteal` model stays: it concentrates the comeback into the parts
that are *about* comebacks, which is a design that has an opinion, where
equalisation is a physical law that flattens everyone.

Worth noting the first measurement was wrong and said so more strongly —
comebacks appeared to fall 14.4% to 5.6%. That was an artifact: equalisation
shrinks gaps, so fewer rounds passed the ">5% gap" filter at all and the
denominator was counting rounds that could not qualify. Fixing the denominator
changed the size of the effect but not its direction.

---

## 6. Gyroscopic stability — real physics, and it does not fix the balance

### The measurement that prompted it

Archetype win rates, champion AI, standard dish, cross-archetype pairings only
(192 matches for attack and balance, 120 for defense and stamina):

    attack   56.8%
    balance  48.4%
    defense  45.8%
    stamina  30.8%

A 26-point spread, with stamina the clear outlier. The useful question is not
"how much does stamina lose by" but **how** it loses, so the next measurement was
the defeat-reason breakdown per archetype:

    attack    knockout 20%   spin-finish 24%   burst  2%   survived 54%
    balance   knockout  9%   spin-finish 11%   burst 23%   survived 57%
    defense   knockout  0%   spin-finish 48%   burst  7%   survived 45%
    stamina   knockout 36%   spin-finish 16%   burst 12%   survived 36%

Stamina is **not losing an attrition race**. It is being thrown out of the
stadium, at nearly twice the knockout rate of anything else and infinitely more
than defense, which is never ejected at all. That is the wrong weakness for the
archetype whose entire identity is lasting.

### The missing term

`resolvePair`'s smash impulse scaled with the attacker's spin, the attacker's
attack, the impact speed and the **victim's mass** — but never with the victim's
own spin. A top at full spin was thrown exactly as far as the same top nearly
dead.

That is not how a gyroscope behaves. Rigidity in space scales with angular
momentum, so a fast-spinning top genuinely resists lateral displacement more
than a slow one. And it lines up with the diagnosis exactly: stamina blades are
the lightest in the catalogue — the mass formula's floor IS a stamina blade —
and stamina tips are free-running, so stamina was light AND slippery with
nothing to trade back.

    hold = 1 / (1 + GYRO_STABILITY * spinNorm(victim))

applied after the SMASH_MAX clamp so the cap keeps meaning what it says.

### It does not work, and the shape of the failure is the finding

    GYRO   attack  defense  stamina  balance   spread
    0.0     56.8     45.8     30.8     48.4     26.0
    0.5     65.6     51.7     40.8     44.8     24.8
    1.0     64.6     48.3     39.2     43.8     25.4
    1.6     64.1     43.3     51.7     38.0     26.1

Stamina rises — and **attack rises just as much**. The spread never moves: 26.0,
24.8, 25.4, 26.1. Making tops harder to eject raises everybody's floor, and the
cost lands on balance and defense rather than on the archetype that was already
winning. At every setting attack ends up MORE dominant than it started, so
shipping this would be a balance regression bought with correct physics.

A second variant made the resistance depend on spin ADVANTAGE rather than
absolute spin — `max(0, spinNorm(victim) - spinNorm(attacker))` — on the theory
that this rewards stamina's actual win condition and cannot help an attacker who
has burned its spin. It is worse:

    G=0.8   attack 63.0   defense 52.5   stamina 30.0   balance 44.8
    G=1.6   attack 63.0   defense 48.3   stamina 33.3   balance 47.4
    G=2.6   attack 64.6   defense 46.7   stamina 31.7   balance 44.3

Stamina does not move at all, and attack still climbs. Reverted, both of them.

### What the measurement actually points at

The interesting part is why stamina is light and wide in the first place. Both
come from faithful transcription: `mass` is the real gram weight and `radius`
grows with the published stamina stat, because real stamina blades genuinely are
wide — WizardArrow's own product copy explains that "two large blades create an
outward center of gravity, which generates strong centrifugal force".

So **the archetype's weakness here is baked into transcription fidelity**: real
stamina parts are light and wide, and in this sim light and wide means easy to
ring out. The real game does not have that problem, which suggests our dish
ejects tops more readily than a real stadium does relative to how long a round
lasts.

That makes the next thing to test a global one — ring-out frequency against
round length — rather than another per-archetype stat nudge. Three of those have
now been tried and reverted (spin equalisation, passive-decay rebalance, and
this), and all three failed the same way: they moved the numbers without
narrowing the spread, because they acted on every archetype at once.

### The sampling error underneath all of it

Every measurement above, and every balance measurement in this project before
it, swept `PRESETS` — **six anchor builds**. The game ships **thirty-seven**.

So "stamina wins 30.8%" was really "Endless Coil wins 30.8%": one
fafnir/spread/needle build, which is a SPIN-STEALER and therefore the least
representative stamina bey in the roster. Four experiments were designed against
that number.

Re-measured across every shipped build, cross-archetype pairings, both seats,
3736 rounds — see `src/roster.test.ts`, which now guards this permanently and
costs two seconds:

    attack   50.5% of 1248        defense  43.4% of 528
    balance  43.2% of 1320        stamina  27.0% of 640

The conclusion survives and hardens: stamina is the outlier by 23 points, on a
proper sample. Two of its five builds are in the worst three of the whole roster
(Wizard Arrow 19%, Silver Wolf 14%).

Two further things the wider sweep shows that six builds could not:

- **The roster is lopsided.** 13 attack, 15 balance, 5 stamina, 4 defense. Half
  the archetypes are represented by a handful of builds, so a single weak bey
  moves an archetype's average by a fifth.
- **Cobalt Dragoon 4-60A lands at 72%**, second-best in the game, on the day it
  was transcribed. That is what an untested addition looks like, and it is the
  argument for this test existing rather than for hand-checking new beys.

### Where this leaves the archetype gap

Four levers have now been tried and reverted: spin equalisation, the
passive-decay rebalance, gyroscopic stability, and tank compression. All four
failed the same way — they act on a mechanism every archetype shares, so they
move all four and relocate the outlier instead of removing it. Tank compression
is the clearest case: at 2.6x it lifts stamina from 27% to 52% and drops defense
from 47% to 22%, a straight swap, while costing 22% of the hits per round.

The measurement that explains why is the attrition clock. With no contact at
all, builds spin out in:

    attack 58s    defense 57s    balance 71s    stamina 75s+

against a median round length of **7.5 seconds**, with the winner still holding
**40% of its spin**. Stamina's entire advantage — roughly seventeen extra
seconds of tank — lives in a window the game never reaches. It is a resource for
a sixty-second fight in a seven-second one.

So the next thing to try is not another shared-economy constant. It is a win
route that only stamina can take, the way burst is effectively attack-only
(attack scores 52% of its wins by burst; stamina scores 0%). The real game's
answer is spin-stealing, and the sim already models it — but only two layers in
the entire catalogue have a non-zero `spinSteal` (Fafnir 0.62, Nosferu 0.88),
so seven of the nine stamina blades have no access to their archetype's
signature mechanic. That asymmetry, not the spin economy, is the next thing to
measure.
