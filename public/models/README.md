# Beyblade models

Drop a model here and add one line to `src/render/topModelIndex.ts`. A bey with
no entry keeps its procedural mesh, so the game runs fine with this folder
empty — which is how it shipped before the first file arrived.

## Whole tops, not parts

**One file per beyblade.** Not one per layer/disc/driver.

That is a deliberate reversal of the original plan. Per-part files would keep
all 330 build combinations visually swappable, but real models are whole
beyblades and splitting them is fiddly and unwanted. So a model overrides the
whole top.

What it costs, stated plainly: while an imported top is showing, changing the
disc or driver does not change what you see. What it does **not** cost is
anything mechanical — the sim still reads stats from the parts, so a different
disc still flies differently. The model is a skin over the build, not the build.

## Format: GLB, glTF or STL — all three work

**STL is supported, which is not the obvious call.** STL is normally the worst
format to build on: no materials, no colours, no UVs, no node names, no
hierarchy, and 3D-printing triangle counts.

Every one of those objections assumes you wanted per-part structure and authored
colour. This project wants neither — a top is one object, finished in one metal,
and the finish comes from the game rather than the file. The format's weaknesses
land entirely outside what is asked of it, and in exchange it removes a
conversion step from the loop that decides how often new beys actually get
added. That trade is worth more than the theoretical purity.

So use whatever you have — the STL path is verified, not just written: the first
model was converted to STL and run in the arena.

**It will not look better or worse.** Every material is replaced on import, so a
GLB and an STL of the same mesh render identical pixels.

The only measured difference is download size. STL stores three full vertices
per triangle with no sharing, so the same mesh is **1.33x larger** — 708 kB
against 532 kB for the first model, because 42,456 vertices get stored where
14,978 would do. If you are exporting fresh and have the choice, GLB, for that
reason and because it can carry real materials later if that ever matters. If
you already have STL, use it and do not think about it again.

## What actually matters

**Triangle budget.** Aim under ~20k. The first import was 14k and is fine. This
is the one STL weakness that does bite, because printing exports are often
100k+; decimate in Blender if yours is.

**Scale does not matter.** Do not try to match the game's units. Every model is
measured and scaled so its widest horizontal point sits exactly on the sim's
collision circle, so what you see is what hits. The first import was 39 units
across and needed no adjustment.

**Orientation does not matter much either.** The model is recentred
horizontally and dropped so its lowest point sits on the dish. A model lying on
its side will look wrong — beyond that, do not worry about it.

**Colour is ignored.** The finish is applied by the game: cel metal in the Anime
theme, a genuinely reflective metal in the lit themes. A file's own materials
are replaced, so there is no point authoring them.

## Licensing

If a model requires attribution, put the credit in its `topModelIndex.ts` entry
rather than trusting the downloaded `license.txt`. The game renders it in the
garage whenever that bey is equipped. A credit sitting in a text file inside a
folder is a credit nobody sees, and it vanishes the first time the directory is
tidied.
