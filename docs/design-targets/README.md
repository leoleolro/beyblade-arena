# Design targets

Screenshots of the game **as it should look**, kept in the repo so that "make it
look like it did" is a comparison instead of an argument. Every one of these is
a state somebody looked at and approved.

The practice exists because of a specific failure: the Overdrive theme drifted
over several commits into something the owner described as "glowing led light
bulbs hitting, full of light pollution", and reconstructing the good state cost
an afternoon of git archaeology that never found it — the theme's own colour
values had not changed at all, so the diff was invisible where everyone looked
first. A picture would have settled it in a minute.

## The files

| File | What it pins |
| --- | --- |
| `overdrive-target-wide.png` | Overdrive at match start. Note how much of the frame is **black**. |
| `overdrive-target-battle.png` | The reference frame. Thin magenta posts, gold rail band, one crisp cyan ring, dark purple basin, tops readable with a tight underglow. |
| `overdrive-target-clash.png` | A collision: white core, cyan halo, localised. The "white shockwave at the bottom of the beyblades" — spilling across the dish, not filling the frame. |
| `overdrive-target-tops.png` | Tops close up. Dark bodies, spin-blur disc, hairline trails. |

Source: an 8-second capture of a build the owner was happy with, recorded off a
laptop screen — so treat colour as indicative and **composition, contrast and
restraint** as the real specification. What matters is the ratio of lit to
unlit, not the exact hex.

## Capturing one

The game can screenshot itself, but only when asked — a WebGL back buffer is
discarded the instant it is composited, so `canvas.toDataURL()` on a live arena
returns a blank PNG. Keeping a readable copy of every frame costs bandwidth on
exactly the mobile GPUs least able to spare it, so it is behind a flag:

1. Load the game with `?shot` in the URL (combine freely: `?unlock=all&shot`).
2. Get the frame you want on screen.
3. In the console, call `__shot('name-of-the-state')`.

It downloads a PNG. Without the flag it says so in the console rather than
handing back a blank image, which is a genuinely confusing half-hour otherwise.

## Adding to this folder

Take the shot when something looks right, not when it looks finished. Name it
`<theme-or-feature>-target-<what>.png` and add a row above saying what the
picture is evidence *for* — an unlabelled screenshot ages into a mystery.
