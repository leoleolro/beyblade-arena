# The black shards bug

A write-up you can hand to another chat, or to a graphics person, cold.

## Symptom

Black polygonal splinters plastered over the tops — worst on the imported
model, but also present as heavy black chunks around the rim of the procedural
beys. They are not a texture, not shadow acne, and not z-fighting. They move
with the mesh and they get thicker as the camera pulls back.

## Stack

- three.js **r0.185.1**, WebGL2, `WebGLRenderer` with `antialias: true`
- Cel look = `MeshToonMaterial` + an N-step `DataTexture` gradient
  (`NearestFilter`) + `three/examples/jsm/effects/OutlineEffect.js`
- `new OutlineEffect(renderer, { defaultThickness: 0.014, defaultColor: [0.02,0.02,0.05], defaultAlpha: 1 })`
- Imported model: glTF 2.0, one mesh, one primitive, 14,152 triangles

## What OutlineEffect actually does

It is an **inverted-hull** outliner. For every material in the scene it builds a
parallel `ShaderMaterial` with `side: BackSide` and re-draws the whole scene
with this vertex shader (verbatim from r185):

```glsl
vec4 calculateOutline( vec4 pos, vec3 normal, vec4 skinned ) {
    float thickness = outlineThickness;
    const float ratio = 1.0;
    vec4 pos2 = projectionMatrix * modelViewMatrix * vec4( skinned.xyz + normal, 1.0 );
    vec4 norm = normalize( pos - pos2 );
    return pos + norm * thickness * pos.w * ratio;
}
...
vec3 outlineNormal = - objectNormal;   // material is always BackSide
gl_Position = calculateOutline( gl_Position, outlineNormal, vec4( transformed, 1.0 ) );
```

Three properties of that shader matter:

1. **`* pos.w`** cancels the perspective divide, so `thickness` is a **screen-space**
   quantity — constant in NDC at any depth. It is *not* world units. (This
   already cost us one wrong fix; see "Attempt 1" below.)
2. **`objectNormal`** is the mesh's own `normal` attribute. Each vertex is pushed
   along **its own** normal, independently of its neighbours.
3. The hull is drawn with the normal depth test on. It is visible wherever the
   pushed-out backface lands **in front of** the front-facing geometry.

For that to read as a clean line, the mesh has to be (a) broadly **convex** and
(b) **smoothly normalled**, so the hull inflates as one continuous shell that
only pokes out at the silhouette. Break either assumption and the hull tears.

## The measurement

I parsed `scene.bin` directly and counted:

```
vertices                               14,978
distinct positions                      7,020     -> 2.13 vertices per position
positions carrying >1 normal            6,885     -> 98.1%
triangles                              14,152
bbox                     x -40.00..-0.92  y 27.70..65.00  z 0.00..22.90
```

**98.1% of the model's positions are split with divergent normals.** It is a
fully hard-edged / faceted mesh — the exporter duplicated the vertex at nearly
every edge so each face could keep its own flat normal.

That is the bug. At a split position there are two coincident vertices with
different normals, and the shader pushes each one a different direction. The
hull does not inflate, it **comes apart at every edge**: adjacent triangles
separate, the shell opens up, and you see the black backfaces of the hull
sticking out through the front of the model. Every one of those splinters is one
triangle's hull, pushed out on its own.

Concavity compounds it. The recesses between the blades are deep, and a
backface inside a recess gets pushed *toward* the camera where it wins the depth
test against the front face in front of it — a solid black patch, not an edge.

The procedural beys have the same disease in milder form: they are assembled
from many small extruded pieces with hard edges at every bevel.

## What is *not* the cause (ruled out)

- Not thickness being too large. Shards persist at any thickness > 0 and simply
  scale with it. See attempts 1–2.
- Not the material. Verified identical with `MeshToonMaterial`,
  `MeshStandardMaterial`, and `metalToonMaterial`. `OutlineEffect` never sees the
  source material's shader — it builds a fresh `ShaderMaterial` and copies across
  only `userData.outlineParameters` (r185, `getOutlineMaterial`). So
  `onBeforeCompile` patches are invisible to the outline pass, and a metal part
  outlines identically to a plastic one.
- Not `KHR_materials_pbrSpecularGlossiness`. That extension is unsupported in
  r185 (grep count 0 in the source) so the model's grey diffuse is dropped, but
  that is a *colour* problem and unrelated to geometry.
- Not bloom / the `EffectComposer`. `OutlineEffect` and the composer are never
  both active — they are mutually exclusive by construction in `arena.ts`.
- Not scale. `normaliseToRadius()` uniformly scales the model onto the sim's
  collision radius; the shader's offset is screen-space and does not care.

## Fixes attempted, and why each failed

**Attempt 1 — `clampInk()`.** Clamped per-material outline thickness against the
part's bounding-box size, on the theory "the hull is thicker than the part is
wide". This compared a **screen-space** thickness against **world-space** extents.
A straight category error — the two numbers are not in the same units and the
clamp fired arbitrarily. Deleted.

**Attempt 2 — `HARDWARE_OUTLINE = 0.005`.** Dropped thickness from 0.014 to
0.005 on the disc and driver. Made the shards smaller. Did not remove them:
user reported "still very prominent black lines and shards around the edge".
Correctly so — shrinking a torn hull just gives you smaller tears.

**Attempt 3 — `noOutline()` on imported tops (current state).** Sets
`userData.outlineParameters = { visible: false }`, which r185 honours at line
303 of `OutlineEffect.js`. This *works* — the shards are gone from imported
models. But it is a removal, not a fix: the imported tops now have no ink at
all, so they do not match the cel look of the rest of the scene, and the
procedural beys still have the milder version of the problem.

## What a real fix looks like

The technique is fine; our geometry violates its preconditions. Three known
routes, roughly in order of how well they'd suit this project:

1. **Smoothed normals for the hull only** — the Arc System Works / *Guilty Gear
   Xrd* technique. Weld the geometry by position, average the normals across all
   faces sharing a position, and use *those* for the outline pass while the
   display mesh keeps its hard normals for shading. In three that means either a
   second BackSide "outline mesh" built from a welded clone
   (`BufferGeometryUtils.mergeVertices` + `computeVertexNormals`), or writing the
   smoothed normals into a spare attribute and patching the outline shader to
   read it. Keeps faceted metal shading *and* gets a continuous line.
2. **Post-process edge detection** — render depth + normals to a target and run a
   Sobel/Roberts cross over them. Completely indifferent to mesh topology,
   convexity and normals; this is what most modern stylised games ship. Costs a
   pass and does not currently coexist with our bloom/composer setup.
3. **Depth-biased hull** — push the hull back in depth instead of outward along
   normals, or render it with `depthWrite: false` and a depth function that only
   lets it draw *behind* existing geometry. Cheap, but produces a flatter,
   less controllable line.

Route 1 is the smallest change that keeps everything else intact. Route 2 is the
one that would still be correct after we add ten more imported models.

## Also worth knowing

A second model was dropped into `public/models/Gemstone/` — Wavefront **OBJ +
MTL** with four textures and six materials (21,908 triangles). The loader
currently handles `.glb` / `.gltf` / `.stl` only, so this one does not load at
all yet. It also has real authored colour, which the metal-finish override in
`finishAsMetal()` would currently throw away.


---

# Part two: the ink thickens as a round goes on

Reported later, and separately: *"the epic beyblades, in a battle, after each
contact, the black outlines get thicker and thicker. even though at launch they
all appear normal and fine."*

That description is exactly right, and the cause is **not** thickness.

## What was measured

Stepping a round by hand and sampling `userData.outlineParameters.thickness` on
the player's layer after every hit:

    t=0.0  hits 0   ink [0.02, 0.014]
    t=0.3  hits 1   ink [0.02, 0.014]
    t=1.1  hits 2   ink [0.02, 0.014]

**The ink values never change.** Nothing writes them per hit; `spinBlur` only
ever thins them, and only while the blur is engaged.

What *does* change is the top's **lean**. `b.tilt` is
`speed * 0.06 + (1 - spinNorm) * 0.22`, so as contacts drain spin the top tilts
further — measured 0 at launch, 0.27 rad (about 16°) after two hits, and the
renderer applies that as a real rotation with a wobble on top.

## Isolating it

Four frames of the same tilted top, one variable each:

| | result |
| --- | --- |
| as shipped | thick black mass over the upper rim |
| spin blur hidden | unchanged |
| contact shadow hidden | unchanged |
| **layer ink off** | **black gone entirely** |

So it is the layer's own inverted hull, and neither the blur nor the shadow.

## Why thickness is not the lever

Sweeping the layer's ink at 0.02 / 0.012 / 0.008 / 0.005 on the same tilted
pose: the mass shrinks slightly and **survives at every value**. Disabling each
of the layer's two inked materials in turn leaves a mass from the other.

That is the signature of the concavity failure this document already describes,
not of an over-thick line. A tiered layer is concave — tiers, recesses, an
under-ring — and a leaning top turns more of that concave geometry toward the
camera, where back-faces pushed outward win the depth test and fill in as solid
black. Welded normals fixed the *tearing* at hard edges; they do nothing about
a back-face inside a recess, which is a different failure with the same colour.

## So the fix is route 2

The ranked options at the top of this document still stand, and this narrows
which one is needed. Smoothed hull normals are already in place and are not
enough. A post-process edge detector over depth and normals is indifferent to
concavity and to lean, which is precisely the property missing here.

Recorded rather than attempted: it replaces the cel theme's whole outline path
and coexists awkwardly with the bloom composer, so it is a deliberate piece of
work rather than a tuning pass.


---

# Part three: an attempt at the fix that did not earn its place

Recorded because the analysis is worth keeping and the outcome is worth being
honest about: **the thickening ink could not be reproduced in the current
build**, and a change built to fix it was reverted rather than shipped on
reasoning alone.

## The candidate fix, and why it looked right

`OutlineEffect`'s offset line is:

```glsl
vec4 norm = normalize( pos - pos2 );
return pos + norm * thickness * pos.w * ratio;
```

`norm` is a normalised **vec4**, not a direction in the screen plane. The offset
therefore carries `z` and `w` terms, so every hull vertex is moved through
DEPTH as well as across the screen. That is a real property of the shader and it
is exactly the mechanism you would expect to produce concavity artefacts: a hull
fragment inside a recess can be nudged toward the camera and win the depth test
against the surface in front of it.

The proposed fix was to keep the lateral components and drop the rest:

```glsl
return pos + vec4( norm.xy, 0.0, 0.0 ) * thickness * pos.w * ratio;
```

reached by patching the material through `Object3D.onBeforeRender` (the effect's
materials live in a closure and are never handed out) and `onBeforeCompile`.

## Why it was reverted

Posed at `tilt = 0.40` — above the sim's own 0.42 cap, so worse than anything a
round produces — with the patch on and off, on the same bey, the same camera and
the same lean: **the outline looks the same either way, and neither shows the
reported black mass.** The welded ink normals from part one appear to have
already dealt with the cases that were visible.

A rendering change that cannot be shown to change the rendering does not go in,
however good the reasoning behind it. It would also have been a liability: the
patch asserts on three's shader text and throws if a version bump rewords it,
which is a real cost to carry for a benefit nobody has seen.

## The method error that wasted most of the time, and how not to repeat it

**`requestAnimationFrame` does not fire while the Browser pane is hidden.** The
inspector, the garage preview and the game loop are all rAF-driven, so when the
pane is hidden they are frozen — and a screenshot still returns the last frame
that was drawn. It looks like a working screenshot of a live page. It is a
photograph of the past.

Several comparisons made this way were worthless without announcing themselves:
two screenshots taken minutes and one code change apart were the same stale
frame, which read first as "the fix works" and then as "the fix does nothing",
and neither reading was evidence of anything.

The tell is cheap and should be the first thing checked whenever a visual result
is surprising:

```js
await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
```

If that hangs, every screenshot of an animated page in that session is stale.

**Use a synchronous render path instead.** These do not depend on rAF and are
correct while the pane is hidden:

- `__sweep()` — the contact sheet, every bey in every theme
- `__moment('clash' | 'launch' | 'burst' | 'ringout')` — the filmstrip
- `__game.renderer.update(beys, [], dt, [])` followed by
  `__game.renderer.present()` — drives one arena frame by hand, which is how the
  posed-tilt comparison above was finally made. `__game` is exposed on `window`
  for exactly this.

## Where this leaves the bug

Still open, and still believed, but it needs a reproduction before it needs a
fix. What would pin it down: the bey, the theme and roughly how far into a round
it appears — or a screenshot. The analysis above is the head start for whoever
picks it up.
