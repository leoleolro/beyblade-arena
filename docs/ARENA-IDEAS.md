# Arena ideas, from the real X-Accelerator stadiums

Research pass for the "reference X-Accelerator rail for stadium ideas" item.
What the actual product does, what of it this sim can support, and what each
idea would cost.

## What the real stadiums do

Facts worth designing against, rather than a product tour:

**The floor is square, and the rails are straight.** The Xtreme Stadium is a
square bucket with "Xtreme Lines" — geared rails along the sides that mesh with
the gear on a top's Bit and fire it into an *Xtreme Dash*. Our rail is a circle
at radius 0.9 and a top riding it travels an arc; a straight rail throws a top
across the box in a line and into a corner.

**The exits are not equal, and they are not evenly spaced.** BX-10 puts *three
pockets on one side*: two corner **Knockout Zones** worth 2 points, and a
central **Xtreme Finish Zone** worth 3. BX-32 Wide swaps them — corner **Xtreme
Zones** worth 3, a central **Over Zone** worth 2. The positions are a deliberate
design variable between stadiums.

**A smaller floor makes faster, more violent rounds.** The Hasbro Xtreme
Beystadium is smaller than the Takara Tomy one and is described as producing
more dashes and quicker battles for exactly that reason.

**Rails favour attack; plain bowls favour stamina and defence.** Which is
precisely the balance axis this project already measured when it built the Spike
Pit, and the same reason competitive play prefers the plain stadium: rails add
variance.

## What this sim already has

- Four pockets, **evenly spaced** at 90° (`POCKET_COUNT`, `POCKET_OFFSET`), all
  identical.
- A knockout is worth 2 points wherever it happens.
- A circular rail at radius 0.9 that accelerates and slings inward.
- A centre hazard (Spike Pit) that taxes camping.

The gap that matters: **our exits are interchangeable.** `sim/arena.ts` opens by
arguing that the rail is good design because it creates "a contested location …
geography players can reason about". The pockets are the one piece of geography
that has no opinion at all — every direction you can shove someone is worth the
same, so there is never a reason to prefer one.

## The proposals

### E1. The Xtreme Finish — one pocket worth more — **SHIPPED**

One designated pocket scores **3** instead of 2. Straight from BX-10.

Why this one first: it is the smallest change that creates a *direction*. Right
now a knockout is a knockout and position is irrelevant; with a graded pocket
there is a side of the dish you want your opponent on, which every other system
in the game already rewards you for being able to control — Charge's speed kick,
the rail's slingshot bearing, launch entry angle.

It also composes with what exists rather than replacing it. Burst stays 2,
spin-finish stays 1, an ordinary ring-out stays 2, and only one exit changes.

Cost: an `ArenaSpec` field, the exit bearing recorded on the knockout, a points
lookup in `Battle`, and a visual marker — the mechanic is worthless if a player
cannot see which pocket is the good one. Tests for the scoring path.

**Risk checked by measurement, as promised.** Over 220 AI-played rounds per
arena, all preset pairings:

    xrail     49.1% of rounds end in a knockout, 33.3% of those through the
              graded pocket — 16.4% of all rounds, about one in six
    standard  0%, as it must be

One in six rounds is a bonus, not a tyrant, and the numbers are pinned in
`xtremeFinish.test.ts` with deliberately wide bounds — the test exists to catch
a rule that has silently stopped firing or started firing on everything, not to
freeze a number honest tuning will move.

The 33.3% is itself the mechanic working. Four evenly spaced pockets would give
25% by chance; the rail biases exits toward this one because it slings on a
bearing the rider does not fully choose.

**And the marker was invisible on the first attempt**, which is worth recording
because it is the same mistake three other effects in this codebase made. Gold
reads as "special" in the abstract; this marker lives in the stadium whose rail
is a band of gold running right past it. The materials were being set correctly
and the pocket still could not be seen. Green is the gap in every theme's
palette — magenta posts and a gold rail in Overdrive, red on near-white in
Anime, orange on dark blue in Arena.

### E2. Cluster the pockets on one side

Real stadiums put every pocket on one face. Ours are at 45°, 135°, 225°, 315° —
so wherever a top is, an exit is at most 45° away and no part of the floor is
safer than any other.

Clustering makes half the dish lethal and half of it survivable, which turns
positioning into a decision rather than a consequence. It is the single biggest
change to how the floor plays that does not require new physics.

Cost: small in code, **large in balance**. It would need the full preset sweep
rerun — the Spike Pit's own comment shows how badly this kind of change can
misbehave (a harsher tax made the spread *worse*, not flatter).

### E3. A square floor with straight rails

The most faithful, and by far the most expensive. The physics is radial
throughout: `EXIT_RADIUS`, the bowl parabola, `wander` pushing outward along a
radius, pocket bearings as angles. A square floor is a different coordinate
system, not a parameter.

Worth wanting, not worth doing next. If it ever happens it should be a second
`ArenaSpec` *shape*, not a retrofit of the circular one.

### E4. A tighter dish

"Smaller battle zone → more dashes, quicker rounds." This is one constant, and
the project already has the harness to measure whether it is true here: run the
sweep at a reduced `STADIUM_RADIUS` and read hits per round and round length off
`played.test.ts`.

Cheap enough to be an experiment rather than a feature. If the numbers move the
way the real product claims, it is a third arena for free.

### E5. Three-player stadiums

BX-32 supports three tops and three launch positions. Out of scope: `Battle` is
built around two fighters and a move triangle read against one opponent.
Recorded so it is a decision rather than an oversight.

## Order

E1, then measure. E4 as a cheap experiment alongside it. E2 only with a full
sweep behind it. E3 and E5 are noted, not planned.

## Sources

- [Beyblade Wiki — Xtreme Stadium](https://beyblade.fandom.com/wiki/Xtreme_Stadium)
- [Beyblade Wiki — Xtreme Beystadium](https://beyblade.fandom.com/wiki/Xtreme_Beystadium)
- [Beyblade X Database — BX-32 Wide Stadium](https://www.beybxdb.com/stadiums/stadiums/bx-32-wide-stadium)
- [Mall of Toys — Speed Rails vs Standard Stadiums](https://malloftoys.com/blogs/news/speed-rails-vs-standard-stadiums)
- [Hasbro — Xtreme Battle Set instructions](https://instructions.hasbro.com/en-us/instruction/beyblade-x-xtreme-battle-set-with-beystadium-2-right-spinning-top-toys-and-2-launchers)

---

## E2 revisited — **SHIPPED as "Three Sides Safe"**

E2 above proposed clustering the pockets on one side and called it "the single
biggest change to how the floor plays that does not require new physics". A
later research pass found Takara Tomy's own regulation, which settles that it is
not merely a good idea but **what the real stadium does**:

> The Over Zone refers to the two pockets located at the front left and right of
> the Xtreme Stadium. The Xtreme Zone refers to the hole located at the center
> front of the Xtreme Stadium.

All three exits on one wall; three of four walls solid. BX-32 Wide moves them
and **inverts** which is worth 3 (centre becomes the 2-point Over Zone, the rear
corners become the 3-point Xtreme Zones). The Infinity Stadium runs six in a 4+2
arrangement down two long sides, so there is no safe back wall at all.

### What it took

`ArenaSpec.pockets` — an optional list of bearings, defaulting to the even four.
Threading it turned out to matter in three places, and one of them was a latent
scoring bug:

- `pocketAngles(arena)` and `inPocket(angle, arena)` — the physics.
- `pocketIndexAt(angle, arena)`, called by `isFinishPocket`. **This one would
  have scored the wrong exit**: `finishPocket` is an index into
  `pocketAngles()`, so a clustered floor would have resolved its graded pocket
  against bearings that do not exist there. Silently, since every exit still
  works and only the points differ.
- `buildStadium(theme, pockets)` — the rim wall's gaps are geometry, cut at
  build time, so the mesh has to be rebuilt rather than re-flagged. Keyed on the
  bearings so the common case costs nothing.

### Still owed

Not balance-swept, and E2's original warning stands: this changes knockout rates
and wants the full preset sweep. Shipped as a floor to play, not a tuned one.

### The other two, not built

**BX-37's motorised centre** — a floor section that drops on a cadence to expose
a second, inner rail, then rises and flings the top outward. Reachable in
principle (a timed `PitSpec` that becomes a `RailSpec`), and genuinely novel.
The community view is that it adds randomness rather than depth, which is a
reason to be careful rather than a reason not to.

**Infinity's double-sided rail** — riding a rail in a continuous loop, sweeping
through the centre and re-engaging on the far side. This is the mechanic that
would actually close our engagement-rate gap (0.16/s against the real ~1.7/s),
because it keeps a top on a rail almost permanently. Needs a non-circular rail,
which the radial physics does not currently express.
