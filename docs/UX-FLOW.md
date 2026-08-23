# Flow: where the game is, and where it should go

Written because "put Overdrive in an entirely different page (game mode)" is a
restructure of the game's navigation, not a screen tweak, and the last two times
I guessed at intent here I guessed wrong.

## What the flow is today

```
HOME ─┬─ Play ──▶ GARAGE ──▶ LAUNCH ──▶ BATTLE ──▶ RESULT
      ├─ How to play ──▶ HOWTO
      └─ Bey inspector ──▶ inspect.html
```

**GARAGE is doing eight jobs at once.** In one scrolling column it holds:

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

## Proposed flow

```
HOME  (mode select)
 │
 ├─ BUILD BATTLE ──▶ BUILD ──▶ ARENA ──▶ LAUNCH ──▶ BATTLE ──▶ RESULT
 │                   │          │
 │                   │          └─ Standard / X-Rail / Spike Pit
 │                   └─ TOP / MIDDLE / BOTTOM, every design, live preview
 │
 ├─ OVERDRIVE ─────▶ ROSTER ──▶ ARENA ──▶ LAUNCH ──▶ BATTLE ──▶ RESULT
 │
 ├─ INSPECTOR ─────▶ every bey, every theme, exploded
 │
 └─ HOW TO PLAY
```

**Two battle modes, each with a two-step setup: choose your top, then choose
where you fight.** That split is the main fix. It gives the player one decision
per screen, and it puts the arena choice immediately before the battle where it
reads as "pick the fight" rather than as one more settings row.

**The shops move out of the setup path.** Crates and the shelf become their own
destination reached from HOME, not something between a player and a match.
Nothing about them needs to sit inside the flow that leads to a fight.

**Settings move out too.** Audio, effects and the all-beyblades toggle belong in
one Settings destination, not stapled to the bottom of the bey picker.

**The theme selector disappears from HOME and GARAGE.** In this structure the
mode *is* the look, which is the point of the request — there is no longer a
separate axis to choose.

## What I need decided before building it

Three questions, and the reason each matters rather than a preference:

**1. What is Overdrive's roster?** The request says "due to its unique beyblade
model designs". Overdrive currently renders the *Classic* construction — the
same metal build the Arena theme uses — while Anime renders the detailed cel
designs. So Overdrive does not have a unique roster today; it has a unique
*lighting*. Either it gets its own set of tops, or the mode split is really
"the cel beys" versus "the metal beys" and Overdrive is the metal one.

**2. Where does the Arena theme go?** Clean 3D, no glow, and its README contract
says it renders exactly as the game did before themes existed. Under a two-mode
structure it is either a look *inside* Overdrive mode, a third mode, or retired.

**3. Does progression survive?** The ladder, crates and shelf assume one career.
Two modes can share it, own one each, or one mode can be a free-play sandbox
with everything unlocked — which is close to what the all-beyblades toggle
already does.

## Not in this document

The outline issues raised alongside this are deferred, at the owner's direction.
