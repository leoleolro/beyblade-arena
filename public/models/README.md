# Beyblade part models

Drop `.glb` files here. Any part without one keeps its procedural mesh, so the
game runs fine with this folder empty — which is how it ships today.

## Naming

**One file per PART, not per beyblade.**

```
<partId>-layer.glb      crossx-layer.glb    phoenix-layer.glb
<partId>-disc.glb       gravity-disc.glb    heavy-disc.glb
<partId>-driver.glb     xtreme-driver.glb   atomic-driver.glb
```

The ids are the ones in `src/sim/parts.ts`. Per-part is not a stylistic
preference: the game lets you build **11 layers × 5 discs × 6 drivers = 330
combinations**, and modelling those as whole tops would be 330 files. As parts
it is 22, and every combination keeps working.

## Format

**GLB.** It is glTF binary — the format three.js loads natively, in one file,
carrying materials, colours, UVs and node names.

Not STL. STL is triangle soup: no materials, no colours, no node names, no
hierarchy, and usually 100k+ triangles because it is a 3D-printing format.
Converting is fine — Blender: File → Import → STL, then File → Export → glTF 2.0
(.glb) — but decimate and assign materials while you are in there.

Not USDZ. three.js has no usable loader for it in core.

## The rules that actually matter

**Origin at the mounting point, +Y up.** The whole renderer assumes a top's
group origin is where the driver tip touches the dish. The burst-scatter
animation and the garage's exploded view are both built on that, and a model
with its origin at the centre of mass will float or sink.

**≤ 3,000 triangles per part.** At the battle camera a top is about 60 px
across; detail past that is invisible there and costs load time on every visit.
The garage view is where detail shows, and 3k is plenty for it.

**Scale does not matter.** Do not try to match the game's units. Every model is
measured and scaled so its widest horizontal point sits exactly on the sim's
collision circle — see `normaliseToRadius`, pinned by `partModels.test.ts`
across scales from 0.001 to 1000. This is a stronger guarantee than the
procedural meshes get.

**Skip metalness and roughness maps.** The cel-shaded theme uses
`MeshToonMaterial`, which has no slot for either, so they have nowhere to go.
Base colour and a colour map are used. Mark a material metallic (metalness > 0.5)
and it gets the cel-metal treatment automatically.

**Keep it one object per file.** Sub-meshes are fine and are preserved; just do
not pack two different parts into one file.

## Checking your work

Load the game and open the garage — the exploded view is the honest test, since
it shows each part separately at a size where you can see it. `/inspect.html`
renders a single top full-frame with pitch and spin controls.
