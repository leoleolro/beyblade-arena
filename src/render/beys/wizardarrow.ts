import { wizardEmblem } from '../emblems';
import type { BeyEntry } from './registry';

/**
 * WizardArrow — the blade the whole stamina archetype is argued from.
 *
 * Source: beyblade.fandom.com/wiki/Blade_-_WizardArrow. Stamina Type,
 * right-spin, **A15 / D30 / S55**, 31.8 g, single mold — "a round Stamina Type
 * Blade with two large blades acting as the main contact points".
 *
 * ITS PRODUCT COPY IS THIS ROSTER'S STAMINA RULE, quoted verbatim in
 * sim/parts.ts and in WizardRod's entry: "Two large blades create an outward
 * center of gravity, which generates strong centrifugal force." Every wide
 * stamina blade here — WizardRod, SilverWolf, ViperTail — is downstream of that
 * sentence, and until now the blade that actually says it was missing.
 *
 * TWO-FOLD, WHICH NOTHING ELSE IN THE ROSTER IS. Every other stamina blade runs
 * three or five lobes; this one runs two, and the source calls that out as what
 * makes it distinctive. It is also the roster's only two-lobed top that is not
 * an attacker — Tempest and SharkEdge are two huge keels with a gaping rim
 * between them, and this is the opposite reading of the same count: a high root
 * and a shallow cut, so the two large blades are long swells in a circle rather
 * than fins on a hub. The source's "low recoil, smooth perimeter" is exactly
 * that difference.
 *
 * At 31.8 g it is the lightest blade in the source data, which is not a
 * coincidence in the numbers: it is the gram figure the mass mapping's floor
 * was fitted to, so this entry lands on 0.44 exactly.
 *
 * Gear Chip: a fantasy wizard casting a spell — the only human mark in the
 * emblem set, and the reason `wizardEmblem` leads with a hat rather than a face.
 * Colour: yellow, the BX-03 Starter / Hasbro F9582 Arrow Wizard base release,
 * out of a release list that also runs red, green, brown, blue, orange, purple.
 */
export const entry: BeyEntry = {
  id: 'wizardarrow',
  anime: {
    layerId: 'wizardarrow',
    canonName: 'Wizard Arrow',
    primary: 0xc6c3b4,
    secondary: 0x6b4c12,
    accent: 0xeab308,
    emblem: wizardEmblem,
    letter: 'W',
    spinDir: 1,
    // CHROME RIM, COLOURED BODY — the convention every produced Beyblade X
    // blade follows.
    metal: true,
    // Sticker, not dark: a light chip face is what the wizard's ink hood needs
    // to read as a shadow. `wizardEmblem` works under either treatment — it
    // keeps the caller's cel line rather than hard-setting ink — but the hood
    // disappears into a black face, and the hood is half the mark.
    chip: 'sticker',
    underRing: 0x6b4c12,
    // Round with two long swells: high root, modest belly, shallow cut. The
    // `wave` grammar has no corners anywhere, which is the "smooth perimeter"
    // the source credits for its low recoil.
    surface: 'wave',
    blade: { root: 0.88, belly: 0.26, cut: 0.1, edge: 'wave' },
  },
  preset: {
    name: 'Wizard Arrow 5-60B',
    // The release is WizardArrow 4-80B and this catalogue has no 4-80 ratchet,
    // so the stamina-peak 5-60 stands in for it and is labelled as what it is
    // rather than as the product code. Ball IS the real Bit, exactly.
    discId: 'r560',
    driverId: 'ball',
    spinDir: 1,
    skinId: 'solar',
  },
};
