# Working plan

> **Status, 22 Aug.** A, B and C are done and committed. D and E are open.
> Decisions taken since this was written are recorded inline below.

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

## D. Motion — speed should be visible — **OPEN, next**

`speedKick` already exists (Charge 1.15, Dodge 1.6), so the sim does change
speed; it does not *read* as changing. Two parts, and the first is a
measurement, not a change: confirm the sim sustains a speed differential rather
than damping it out within a few frames. Then make it legible — trail length
and brightness scaled by speed, spin-blur rate following it, and a short camera
push on a burst.

## E. Arena concepts — **OPEN**

Research the real X-Accelerator rail stadium and produce concrete proposals for
arena mechanics and layout. Design output, not code.

## F. Process

`docs/design-targets/` — done. Screenshot approved states as they happen.

---

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
