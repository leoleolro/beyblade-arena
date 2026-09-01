import { sharkheadEmblem } from '../emblems';
import type { BeyEntry } from './registry';

/**
 * Gill Shark — two blades, and NOT round.
 *
 * Source: beyblade.fandom.com/wiki/Blade_-_Gill_Shark. Stamina Type,
 * **A20 / D25 / S55**, 29.6 g — "a Stamina Type Blade with two large blades
 * acting as the main contact points."
 *
 * THAT SENTENCE IS WIZARDARROW'S, MINUS ONE WORD, and the missing word decides
 * its `spinSteal`. WizardArrow reads "a ROUND Stamina Type Blade with two large
 * blades acting as the main contact points" and takes 0.30; this one drops the
 * adjective and takes 0.15. The catalogue's rule is that a page's own claim of
 * roundness is the evidence for absorption, so two entries whose wording
 * differs by exactly that claim have to differ in value, or the rule is not
 * being applied — it is being decorated with.
 *
 * SO IT IS THE THIRD READING OF A TWO-LOBED TOP HERE, and the roster now has
 * all three: SharkEdge and Tempest are two huge keels with a gaping rim
 * between them (attack), WizardArrow is two long swells inside a circle
 * (stamina, smooth), and this sits between — real blades with a real gap, on a
 * stamina statline. Its A20 against WizardArrow's A15 is the same story in the
 * numbers.
 *
 * Shares its plastic with ShelterDrake, and the source notes the texturing
 * follows its predecessor Keel Shark.
 *
 * Gear Chip: "a shark head, and its name refers to the gill slits on sharks" —
 * so the gills are the mark, not the jaw.
 */
export const entry: BeyEntry = {
  id: 'gillshark',
  anime: {
    layerId: 'gillshark',
    canonName: 'Gill Shark',
    primary: 0x9fb4c4,
    secondary: 0x2a6f8f,
    accent: 0x5fd0e8,
    emblem: sharkheadEmblem,
    letter: 'G',
    spinDir: 1,
    metal: true,
    chip: 'dark',
    underRing: 0x2a6f8f,
    // Two real blades with a real gap: lower root than WizardArrow, deeper cut,
    // so the pair reads as fins rather than as swells in a circle.
    blade: { root: 0.7, belly: 0.4, cut: 0.34, edge: 'blade' },
  },
  preset: {
    name: 'Gill Shark 4-60O',
    // Release is Gill Shark 4-70O. No 70 ratchet here, so 4-60 stands in; Orbit
    // is the real Bit.
    discId: 'r460',
    driverId: 'orbit',
    spinDir: 1,
    skinId: 'frost',
  },
};
