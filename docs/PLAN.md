# Working plan

> **Status.** A, B, C and D are done. E (arena concepts) is the only original
> section still open. A second round of visual work followed the owner's
> "still looks off", and is summarised at the bottom.

Ordered by what unblocks what. Everything here is either verified in the
browser today or marked as an assumption.

## A. Testing access — **DONE** (`eb628cb`)

**A1. Unlock everything.** A dev switch that grants every layer, disc, driver
and skin plus a coin float. Deliberately *not* written to the real save by
default: a testing flag that silently rewrites career progress is a flag that
eventually eats somebody's run. `?unlock=all` applies for the session;
`?unlock=persist` writes it.

**A2. Reach the inspector without hunting for it.** `inspect.html` is a real
page in the build and there is no link to it anywhere, so getting to it means
remembering the filename. Add a discreet link on the title screen and record the
URL in the README.

## B. Imported beyblades — **DONE** (`de82794`, `58519e7`)

**B1. Take the ink back off imported tops.** Owner's call, and it matches what
the screenshots show: at battle scale a 0.02 screen-space outline swallows a
top that is only ~60px wide, and the model renders as a black blob. Verified
today by sweeping the value — at ink≈0 the same top is clean silver.

The welded-normal work (`outlineHull.ts`) still stands: it genuinely fixes the
shard tearing, proven by an A/B on identical frames. The question is only
whether anything still *wants* ink. See B2.

**B2. Decide what the Anime theme does to tops.** Owner: "i am ok with
beyblades being 3d and shiny metallic looking, the anime is just an arena and
battlefield effect." Read strictly, that removes cel shading and ink from tops
in every theme and leaves the Anime treatment to the arena. That would make
`outlineHull.ts` dead weight for tops, though the stadium linework still uses
the same outline pass. **Needs a decision before B1 lands** — the two answers
lead to different amounts of deletion.

**B3. Import Gemstone.** `public/models/Gemstone/` is Wavefront OBJ + MTL,
21,908 triangles, six materials, four textures. It does not load today — the
loader handles `.glb`/`.gltf`/`.stl` only. Work: add `OBJLoader` + `MTLLoader`,
register it in `topModelIndex.ts`, and give it a garage slot and a battle slot.

One real decision inside this: Gemstone has **authored colour and textures**,
unlike Valtryek which arrived with none. `finishAsMetal()` currently overrides
every material with one silver finish, which would throw that away. Proposal:
keep a model's own materials when it ships with usable ones, and fall back to
the silver finish when it does not.

## C. Overdrive — **DONE** (`116dcbf`)

Target images live in `docs/design-targets/`. The gap, stated as ratios rather
than hexes: the reference is **mostly black** with a few bright lines; the
current build has no dark left in it.

**C1. Kill the light pollution.** Verified live today, and the result was
immediate: thin bars instead of glowing capsules, readable tops, haze gone.

| Value | Now | Proposed |
| --- | --- | --- |
| `postEmissive` | 3 | ~0.35 |
| `bloomRadius` | 0.62 | ~0.32 |
| `bloomStrength` | 0.72 | ~0.5 |
| `beyLightIntensity` | 2.1 | ~1.1 |

Worth recording why this was hard to find: **the Overdrive theme's colour
values are byte-identical to the commit that introduced them.** Nothing in
`theme.ts` drifted. The washout came from emissive strength meeting a bloom
pass, which is invisible in a diff. This is exactly the case the design-target
screenshots exist for.

**C2. Post colour.** The reference posts are magenta; ours are cyan
(`postColour: 0x00e5ff`). Once emissive drops they mostly take their colour
from the magenta rim light anyway, so this may resolve itself — check before
changing the value.

**C3. The rail is a wall of fire.** X-Rail in Overdrive is a solid orange band
with no dark between the segments. The reference is a calm gold band plus one
crisp cyan ring. Tune rail emissive; add the inner ring.

**C4. The lights should be combat, not weather.** Owner: "the lights are
effects during combat" — right now the arena is at full brightness before
anything has touched. Drive the hot elements off actual contact and proximity
so an idle arena sits dark and a clash lights it.

**C5. Restore the white shockwave under the tops on a clash.** Currently gated
at `h.strength >= HITSTOP_THRESHOLD` (1.6), so ordinary contacts draw nothing.
Lower or re-shape the gate and check against `overdrive-target-clash.png`.

## D. Motion — speed should be visible — **DONE** (`5666f16`)

`speedKick` already exists (Charge 1.15, Dodge 1.6), so the sim does change
speed; it does not *read* as changing. Two parts, and the first is a
measurement, not a change: confirm the sim sustains a speed differential rather
than damping it out within a few frames. Then make it legible — trail length
and brightness scaled by speed, spin-blur rate following it, and a short camera
push on a burst.

## E. Arena concepts — **DONE** — see docs/ARENA-IDEAS.md

Research the real X-Accelerator rail stadium and produce concrete proposals for
arena mechanics and layout. Design output, not code.

## F2. Process — the verification failure of the model import

Worth its own entry because the bug was not in the code, it was in the checking,
and the checking is supposed to be this project's strength.

Four models were imported. **One was looked at, in one viewer, at one angle**,
and the import declared verified. Two of the four were exported Z-up and stood
vertically in the dish; the owner found them in under a minute of play.

`docs/` already contains a written rule against exactly this — the contact sheet
exists so a rendering change is checked against every asset rather than the one
in front of you — and the rule was not applied to models because models did not
feel like "a rendering change".

Three things changed as a result:

1. **`uprightAxis` in motion.ts.** A beyblade is a flat disc, so the shortest
   bounding-box axis IS the spin axis. Derived rather than hand-flagged per
   model, so the next import is covered too, and it reports a confidence
   (`dominance`) so a non-disc shape is refused rather than guessed at.
2. **It runs inside `normaliseToRadius`, not beside it.** Five call sites need
   it; a preparation step each of them must remember is a parallel list waiting
   to drift, and four would have looked right while the fifth shipped a bey on
   its side.
3. **Regression tests built from the four real bounding boxes**, so the two
   that were broken stay pinned by their actual measured dimensions.

The general lesson, which is now in the `game-visual-qa` skill: **N assets
imported means N assets checked.** One is a spot check, and a spot check on
asset one of four has a 25% chance of finding a per-asset bug.

### And a second round, because the first fix was not enough

Dran Sword was still wrong after the axis fix — reported again as "still very
broken". It rendered 38% oversized and floating, and **every static measurement
said it was fine**, including the ones added to catch the first bug.

The cause: `Blead_metal` is a `SkinnedMesh` under an `Armature`, and the file
carries two baked animations, one of them named "exploded view". Its bones were
exported part-way through one. `Box3.setFromObject` computes a skinned mesh's
box from the **bind pose** and does not run the skinning — so the box, the
uprighting, `normaliseToRadius` and `seatOnOrigin` all agreed with each other
and with nothing on screen. Measured live: blade 0.296 wide against a scaled
prediction of 0.211.

`Skeleton.pose()` restores the base pose and makes the box true again. We never
play these clips — the whole top is spun by its parent group — so the rig is
dead weight the exporter left behind. After the fix: 0.209 against 0.215, seated
at y 0.002.

**The check that now exists: `__models()`.** It runs the real preparation path
on every registered model and reports width error, upright axis, seating, and
leftover rig, with a verdict per bey. Both classes of bug are one command away
now instead of one playthrough away:

    OK   dransword — 12 skinned mesh(es) — rest-posed on import; box would otherwise lie
    OK   valkyrie  — arrived Z-up — rotated to Y
    OK   magejab   — arrived Z-up — rotated to Y

### Third round — the actual cause

Still broken after both fixes above, and this one is the real answer.

`Object3D.clone()` **does not rebind skeletons.** The copy's `SkinnedMesh` kept
pointing at the ORIGINAL skeleton, whose bones live in the loader cache and are
never added to our scene. A skinned mesh draws its vertices from bone matrices,
not from its own transform — so the geometry rendered wherever those orphaned
bones sat, which is the world origin, while the mesh object followed the bey
perfectly.

Measured in the running game, and this is the whole shape of it:

    meshRootIsScene   true    — mesh in our scene at (-0.62, 0.24, 1.27)
    boneRootIsScene   FALSE   — its bones are not in our scene at all
    boneWorld         (0, -0.44, 0)

That is precisely the report: "a big object in the middle of the stadium
sitting, and a ghost blade that is not visible is battling." The object at the
centre was the mesh drawn at the orphaned bones. The ghost was the bey group,
moving, with an emptied layer.

Fixed with `SkeletonUtils.clone`, behind a single `instantiateModel()` — the
third fix in a row that had to be moved inside a shared function, because six
call sites cloned models and any conditional at the call site drifts.

### The lesson, and it is not "check harder"

All three bugs shared one property: **every check measured the object, and the
GPU was reading something else.**

- Bug one: the box was right, the axis was wrong.
- Bug two: the box read the bind pose; the GPU read posed bones.
- Bug three: the box read the mesh's transform; the GPU read detached bones.

Adding more measurements of the same kind found nothing, three times. What
finally worked was checking a *different sort of thing* — a structural
invariant: **a skinned mesh's bones must live inside the model that skins
them.** `__models()` asserts that now, and it has teeth: run against the old
`clone(true)` it reports 12 detached meshes on Dran Sword alone.

A measurement taken from the same source as the bug will confirm the bug. The
bounding box was never a second opinion; it was the first opinion restated.

## F. Process

`docs/design-targets/` — done. Screenshot approved states as they happen.

**A screenshot of an animated page can be a photograph of the past.**
`requestAnimationFrame` does not fire while the browser pane is hidden, so the
inspector, the garage preview and the game loop all freeze — and a screenshot
still returns the last frame drawn, with nothing to say it is stale. Two
screenshots taken either side of a code change can be the same frame. This cost
most of one session and produced both a false positive and a false negative
before it was spotted.

Check it in one line before trusting any visual comparison:

    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

If that hangs, use a synchronous render path instead — `__sweep()`,
`__moment(...)`, or `__game.renderer.update(...)` followed by
`__game.renderer.present()`. None of them depend on rAF. See
docs/BLACK-SHARDS.md part three.

---

## I. A hundred beyblades — **DONE (the binding cost)**

Asked for as an architecture constraint: "should support up to 100 beyblades in
the future. without affecting the games performance."

**Measured rather than guessed, and the answer was not where it was expected.**
Not the sim, not the 3D scene — the *thumbnails*. `drawBeyThumb` paints a real
illustration (lathed tiers, blade fans, an emblem) at **2.52 ms**, the garage
rebuilds its whole panel on every part click, and it painted one per bey every
time. Eleven beys was already 27.7 ms per click; a hundred projected to
**252 ms** — a quarter-second freeze on every tap.

Now painted once per (bey, theme) and blitted. Measured on a synthetic
hundred-bey roster with a hundred *distinct* masters:

    first pass (all cold)   164 ms, once
    every pass after        16.1 ms   (0.161 ms per thumbnail)
    uncached, projected     252 ms    per pass, every pass

A full garage render at a hundred beys, timed end to end, is a **6 ms median**.

**The cache's own sizing turned out to be the real trap.** The first version
held 48 entries on the reasoning that a visible roster is a few dozen chips.
That reasoning is wrong: the garage paints every bey in the roster, not the ones
on screen. A hundred-bey pass against a 48-entry LRU is a sequential scan over a
working set larger than the cache — it evicts each entry moments before it is
next needed and hits roughly never, which is *slower* than no cache. Invisible
from outside: same pictures, no error, just no speed-up.

So the limit is specified as a relationship — it must exceed one render pass —
and `beyThumb.test.ts` asserts the hit rate on a hundred-bey roster rather than
a duration. Both of those tests fail against the 48-entry version.

### Still open at a hundred

- `modelThumb` (imported beys) already caches, so it scales; but a hundred
  imported models is a download problem, not a paint problem, and nothing here
  addresses that.
- The roster is one flat DOM list. 138 chips measured fine; a thousand would
  want virtualising, and nothing does yet.
- `BEYDEX` and `BEY_PRESETS` are derived from the per-bey registry already, so
  adding beys is a data edit and costs no UI change.

---

## H. The thickening outlines — **DONE**

`spinBlur.ts` thinned the layer's ink and scaled the thinning by blur dominance,
which is a pure function of remaining spin. At launch the outline drew at 0.45x
its authored thickness; as contacts drained the spin it grew to 1.0x. A 2.2x
change in line weight over a round, keyed to the one quantity that only ever
falls — which is exactly "thicker and thicker after each contact, even though at
launch they all appear normal and fine".

Now constant at the launch value. Pinned by `spinBlur.test.ts`, which drives the
real `SpinBlur.update()` at both ends of the spin range; both tests fail against
the old formula.

Two earlier diagnoses blamed the inverted hull and were wrong. See
`docs/BLACK-SHARDS.md` part four for how, which is the more useful half.

---

## G. The white disk under a clash — **DONE**

Reported three times, and the third time as "the white disk at bottom needs to
look exactly the same as before, bigger, more impactful. not just a small wave
like a water drop. im still not satisfied".

**It was the wrong OBJECT, not the wrong size.** Every previous attempt tuned
`Shockwave` — span, peak, front count — and `Shockwave` draws an annulus: its
texture is fully transparent until 87% of its radius, and it is born at 22% of
its travel and expands outward. That is a ripple by construction. No value of
"bigger" turns a thin expanding circle into a flash, which is why three rounds
of tuning all landed back on "a small wave like a water drop".

The reference frame — `docs/design-targets/overdrive-target-clash.png`, which
was sitting in the repo the whole time — shows a broad blown-out white mass
lying ON the dish floor beneath the tops. Filled, not annular. Already at full
size when it appears. Gone in a quarter second.

So `clashPool.ts` is a second, separate effect rather than a fourth attempt at
the first one. The ring is the pressure front leaving the impact; the pool is
the impact. Both fire on a heavy hit.

The two curves that make it a flash rather than a wave live in `motion.ts`,
which is three-free, and are pinned by tests: born at ≥80% of final size,
peaking inside the first fifth of its life, monotone decay after. Those are the
properties that were wrong before, and they are invisible in a diff.

**Measured, because "light pollution" is the standing risk in this theme:** over
a full Overdrive round the pool is lit on **9.5% of frames**, mean alpha 0.042.
It is off nine frames in ten. Light pollution is glow with no event attached;
this is glow that is the event.

Checked against the burst invariant too — `playDefeat` gets the biggest pool in
the game and the dish stays readable through all three sampled frames, which is
the thing a previous burst effect broke.

## Backlog — not now

- The chevron arrows on the X-Rail dish. Busy, and absent from the reference.
- Garage picker chips still draw the procedural silhouette for imported beys —
  the thumbnails are Canvas2D and have no `Shape` to sample from a model.
- Garage framing and orientation for imported models: the preview camera
  measures procedural part heights, so an imported top sits off-centre and
  tilted.
- Skins vary colour and material but not silhouette.
- The tutorial is explanatory, not interactive.
- Garage labels sit at fixed thirds and drift when the model is rotated.
- The shelf restocks per match but does not rotate on a clock.

### Named by the owner, not yet started

- **The controls are not fun.** Reported directly: "clicking the charge button
  and the battle becomes cat chase mouse, one is just following the other
  beyblade."

  **One hypothesis tested and rejected, with the numbers.** The obvious suspect
  was Charge's homing: `applySeek` turns the charger's velocity toward its
  target at `seek * 0.8 * spinNorm`, and Charge's seek of 8.5 allows 6.8 rad/s
  — about 390 degrees per second, enough to reverse heading in half a second.
  Capping that at 1.9 rad/s drops the seek's turn authority from ~312 deg/s to
  ~87 deg/s, which sounds decisive.

  Measured across 100 AI-played rounds, mean heading change while charging:

      uncapped   324 deg/s     round 10.05 s
      capped     303 deg/s     round  9.84 s

  **A 6% difference.** The seek was rarely the binding constraint: a charging
  top's heading is dominated by orbital motion and the bowl's inward slope, not
  by how hard it is allowed to steer. So the cap was reverted — it changes
  balance without changing the thing it was meant to change, and shipping it
  would have been a fix justified by a hypothesis its own measurement refutes.

  **What that leaves.** Two candidates remain, in order of suspicion: the direct
  closing push (`mv.seek * 0.45`, which shortens distance regardless of
  heading), and the absence of any *positional* input for the player — three
  buttons and no way to influence WHERE anything happens, so the only variable
  is when to press. The second is the same hole the launch-tilt work
  (docs/PHYSICS.md P5) opens from the other side, and the next experiment should
  measure time-spent-in-close-range-without-contact rather than heading, since
  that is what "chasing" actually describes.

- **Epic beys are not detailed enough.** Measured against product photographs,
  four things are missing: faceted chrome (real blades are many small angled
  facets, ours are one smooth extrusion), concentric rings on the face (real
  ones have four or five, ours has an emblem on a flat disc), visible fasteners,
  and translucent jewel plastic under the chrome. The first two are geometry,
  apply to all fifteen Epic beys at once, and do not fight the cel look — start
  there. The fourth needs transmission materials and is a real cost.


- **Real beyblade physics — researched, see `docs/PHYSICS.md`.** Five proposals
  with costs and an order. Headline finding: our X-Rail fires **0.17 times per
  second per top** against the real toy's ~1.7, a tenfold gap that is
  arithmetic rather than tuning — `duration + cooldown` is 2.15 s, so "five
  dashes in three seconds" is unreachable without changing those constants. And
  our rail does not escalate at all, where the real one's whole character is
  that it does. Cheapest first move is the ring-out arc (renderer-only, no
  balance risk); biggest is making the rail a rhythm.
- **A second look for Beyblade Arena mode.** See `docs/UX-FLOW.md`, "Known gap".


---

## What the work changed about the plan

**B2 was decided "metallic everywhere".** Tops are hardware in all three
themes; the theme dresses the arena. That retired the cel bey construction and,
in doing so, exposed a bug the project had carried from the start: no
environment map anywhere, so every high-metalness material had been rendering
near-black. Cel metal fakes its highlights and needs no environment, which is
why nothing had noticed. See `environment.ts`.

**B3's premise was wrong and the answer survived anyway.** "Keep Gemstone's
textures" assumed textures. The MTL references none of the four images in its
folder — six materials, all greys and blacks, no maps. Kept `own` regardless,
because the blacks are panel lines and losing them makes it Valtryek.

**C5 needed no code change, which is the useful result.** The clash shockwave
was blamed in writing before being measured. `played.test.ts` reports 3.28
heavy hits per round against 7.6 total — the ring fires on 43% of hits and
always did. It was invisible in the bloom haze, and fixing C1 fixed it.

**C's real lesson is recorded in `docs/design-targets/`.** The Overdrive theme's
colour values never drifted; a diff of `theme.ts` against the commit that
introduced them is empty. The washout lived in the product of emissive strength
and bloom radius, which no diff shows. Screenshots of approved states are the
only thing that would have caught it early.


---

## Round two: "still looks off"

Everything above was shipped, and the game still looked wrong. What that
second pass found, in the order it was found:

**Tops were not visibly spinning in two of the three themes.** The sim advances
angle 0.75 rad per frame; against a six- or eight-bladed layer that aliases past
Nyquist and reads as stationary. `spinBlur.ts` had worked this out and solved it
for the cel theme only. `motion.ts` now caps the DRAWN rate below the aliasing
limit per blade count.

**Nothing on screen read velocity.** Measured: one top's own speed varies 4.32x
inside a single round. The only consumer was the full-screen speed lines, which
start above the median. The trail now carries it.

**Four separate elements were each "already at full brightness"** before
Overdrive's bloom pass — posts, rail, imported metal, and the aura. Each was
individually reasonable and authored against a scene with nothing else glowing.
An effect that arrives at a bloom pass saturated stops carrying information.

**A per-top light had a falloff wider than the dish.** What the code called a
per-top light was a floodlight; two of them made both beys balls of light, and a
clash had nothing left to add.

**Tops needed a contour, not more light.** Darkening a metal body just makes a
dark blob, and the arena's rim lights are directional — they wash a face rather
than draw an edge. `rimMetal.ts` adds a view-dependent fresnel term.

**The Anime theme's shockwave was invisible.** Additive white on a near-white
dish. It draws as ink there now.

**And the process gap that let all of it ship.** `contactSheet.ts` and
`momentSheet.ts` exist so a rendering change is checked against every bey, every
theme and the events that only last four frames — see the README. The contact
sheet found an unreported bug on its first run.
