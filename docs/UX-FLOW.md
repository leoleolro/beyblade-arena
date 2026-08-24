# Flow: how you get to a match

Written because "put Overdrive in an entirely different page (game mode)" is a
restructure of the game's navigation, not a screen tweak, and the last two times
I guessed at intent here I guessed wrong.

**Status: built.** The flow below under "as built" is what ships. The section
immediately following is the structure it replaced, kept because the reasons it
was wrong are the reasons the new one is shaped as it is.

## What the flow used to be

```
HOME ─┬─ Play ──▶ GARAGE ──▶ LAUNCH ──▶ BATTLE ──▶ RESULT
      ├─ How to play ──▶ HOWTO
      └─ Bey inspector ──▶ inspect.html
```

**GARAGE was doing eight jobs at once.** In one scrolling column it held:

1. Collection — pick a whole bey
2. Workshop — build one from top / middle / bottom
3. Arena — Standard / X-Rail / Spike Pit
4. Spin direction
5. Crates — the gacha
6. Today's shelf — the direct-buy shop
7. Visual style — Arena / Overdrive / Anime
8. Audio and Effects settings

That is the whole game behind one button, and it is the root of most of what is
wrong with the flow. Three consequences worth naming:

- **The visual style is buried at position 7**, under two shops, so the thing
  that most changes what the game looks like is found last if at all.
- **The theme also lives on HOME**, so the same decision has two homes and
  neither is obviously the real one.
- **Choosing a bey and choosing a map are the same screen**, so there is no
  moment where the player has committed to a bey and is now picking a fight.

## What was asked for

> put overdrive in a entirely different page (game mode), due to its unique
> beyblade model designs.
>
> the other game play mode has the beyblade where we import, and built, with all
> the designs and top middle bottom, and shapes and curved surfaces. then select
> the arena/map that the battle takes place on.

Read literally that is a **mode select at the top**, and the modes differ by
*what a beyblade is* in them — which is real, not cosmetic. A top is built by a
different code path per theme today: cel construction under Anime, metal
construction under the other two. "Overdrive has unique beyblade model designs"
is a true statement about the build, not a preference.

## The flow, as built

```
HOME ─┬─ Play ──▶ MODE ──▶ GARAGE ──▶ STADIUM ──▶ LAUNCH ──▶ BATTLE ──▶ RESULT
      │            │         │           │
      │            │         │           └─ arena × look, grouped by look
      │            │         └─ your bey: collection, workshop, spin, shops
      │            └─ Beyblade Arena / Overdrive
      ├─ Inspect ──▶ inspect.html — roster only, no Overdrive
      └─ How to play
```

**Mode is the first choice**, because it is the only one that changes what a
beyblade *is*. `theme.toon` selects between two construction paths in
`buildBeyMesh`, so what used to be a "visual style" row at position 7 of the
garage was silently choosing between the designed roster and the prototype's
plain metal tops. See `src/modes.ts`.

**Arena and visual style are one choice.** A look with no floor attached is not
somewhere you can have a match. Stadiums are generated as the product of a
mode's looks and the arena registry, so adding either adds stadiums with no
edit to the picker.

**The garage heading names the mode**, not the game. Standing under "Beyblade
Arena" while holding an Overdrive top was the exact confusion the split exists
to remove.

## The three open questions, answered

**1. What is Overdrive's roster?** It was never a separate set of tops — it is
the *Classic* construction under the glow rig. So the split is "the designed
beys" versus "the prototype's metal beys", and Overdrive is the metal one.
Confirmed by the owner: "ALL other modes are using beyblades that LOOK like
actual beyblades, regardless of us designing them or importing them."

**2. Where does the Arena theme go?** Inside Overdrive, as a second look. It
renders `buildClassicBey` — the same build Overdrive does — and its contract in
`theme.ts` is that it is the preserved backup style which must not drift. It is
the prototype without the glow. Putting it in the roster mode would ship a
stadium whose beyblades are the ones the owner specifically did not want.

**3. Does progression survive?** Yes, shared, unchanged. Splitting the ladder
per mode would mean two careers, two crate inventories and two save shapes for
what is a cosmetic-and-construction split — and Overdrive is explicitly a
prototype to look back at, not a second campaign to grind.

## Known gap

**Beyblade Arena has one look, so it has three stadiums; Overdrive has two
looks and six.** That is the wrong way round for the mode that matters, and it
is a consequence of answer 2 rather than a choice. The fix is a second look for
the roster mode — a clean, non-cel presentation of the *designed* tops — which
means decoupling construction from `theme.toon` so a theme can pick the
designed build without the cel materials and ink. Deliberately not attempted
here: it is a render change with a real chance of looking worse, and it wanted
its own verification pass rather than riding along with a navigation change.

## The shops and settings

Still inside the garage, not moved out. Named here so it is a deferral rather
than an oversight: the restructure above is the part that was blocking play,
and moving the shops is a second, independent change.

## Not in this document

The outline issues raised alongside this are deferred, at the owner's
direction. See `docs/BLACK-SHARDS.md` part two for the diagnosis.
