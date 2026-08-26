# Build queue

The machine-readable companion to [PLAN.md](PLAN.md). PLAN.md is where the
thinking lives — decisions, measurements, what was tried and rejected. This file
is only ever "what is next", in order, in a shape a script can read.

`/autobuild` works from the top of the Ready list down.

## Marker syntax

| Marker | Meaning |
| --- | --- |
| `- [ ]` | Ready. The loop will pick the topmost one and build it. |
| `- [~]` | Parked. Deliberately invisible to the loop — a backlog that stays here without being worked. |
| `- [x]` | Done. Tick it only after the build passes, and put the commit hash on the line. |
| `[decision]` | Anywhere on a line: the loop halts and asks instead of guessing. |

Order is the whole interface. If something should be built first, move its line up.

## Ready

- [ ] Virtualise the garage roster list. It is one flat DOM list today; 138 chips
      measured fine, a thousand would not. `BEYDEX` and `BEY_PRESETS` already
      derive from the per-bey registry, so this is a rendering change only.
- [ ] [decision] Imported-model download weight at a hundred beys. `modelThumb`
      caches and so scales fine for painting, but a hundred imported models is a
      download problem nothing addresses yet. Needs a strategy call first —
      lazy-load on garage open, a manifest with on-demand fetch, or cap the
      shipped set — and that is the owner's to make, not the loop's.

## Parked — the owner marked these "not now" in PLAN.md

- [~] Chevron arrows on the X-Rail dish — busy, and absent from the reference.
- [~] Garage picker chips draw the procedural silhouette for imported beys; the
      thumbnails are Canvas2D with no `Shape` to sample from a model.
- [~] Garage framing/orientation for imported models — the preview camera
      measures procedural part heights, so an imported top sits off-centre.
- [~] Skins vary colour and material but not silhouette.
- [~] The tutorial is explanatory, not interactive.
- [~] Garage labels sit at fixed thirds and drift when the model is rotated.
- [~] The shelf restocks per match but does not rotate on a clock.

## Done

_Ticked items collect here with their commit hash._
