import { describe, expect, it } from 'vitest';
import { DISCS, DRIVERS, LAYERS, alignsWith, makeBuild, deriveStats } from './parts';

/**
 * The transcribed parts, pinned against their published stat blocks.
 *
 * These entries are not tuned numbers — they are the Beyblade X catalogue's own
 * Attack / Defense / Stamina / Dash / Burst ratings, mapped onto this sim by a
 * formula written down at the entries. That makes two things testable that a
 * hand-tuned part could not offer: the ORDERING the source states, and the
 * trade-offs it states.
 *
 * Ordering rather than absolute values on purpose. The mapping constants are
 * honest tuning and will move; the relationships between parts are facts about
 * the source and must not.
 */

const disc = (id: string) => DISCS.find((d) => d.id === id)!;
const driver = (id: string) => DRIVERS.find((d) => d.id === id)!;

describe('the transcribed Bit catalogue', () => {
  it('gives attack tips far more Dash than stamina tips', () => {
    // The published spread is 40 against 10 — a factor of four, and the whole
    // reason the axis is worth having.
    expect(driver('gearflat').railGrip!).toBeGreaterThan(driver('ball').railGrip! * 2);
    expect(driver('accel').railGrip!).toBeGreaterThan(driver('ball').railGrip! * 2);
  });

  it('keeps Rush between Accel and the stamina tips', () => {
    // Rush is 30 Dash against Accel's 40 and Ball's 10.
    expect(driver('rush').railGrip!).toBeLessThan(driver('accel').railGrip!);
    expect(driver('rush').railGrip!).toBeGreaterThan(driver('ball').railGrip!);
  });

  it('gives attack tips MORE burst resistance than stamina tips', () => {
    // The counter-intuitive one, and the reason it is pinned: the source rates
    // attack Bits at 80 burst and stamina Bits at 30, because a flat tip's wide
    // contact grips the burst locks. Anyone "fixing" this later should have to
    // delete a test that explains itself.
    expect(driver('accel').burstResist).toBeGreaterThan(driver('ball').burstResist);
    expect(driver('gearflat').burstResist).toBeGreaterThan(driver('needle').burstResist);
  });

  it('makes Gear Flat the most aggressive and Ball the most enduring', () => {
    expect(driver('gearflat').wander).toBeGreaterThan(driver('ball').wander);
    expect(driver('ball').spinRetention).toBeGreaterThan(driver('gearflat').spinRetention);
  });

  it('makes Dot the most planted tip in the catalogue', () => {
    // Dot's published Defense is 55, the highest of any Bit in the source data
    // and above every hand-authored Driver's implied one — so the friction
    // formula puts a two-gram plastic Bit above Bastion, the part that was
    // designed to be the wall. That inversion is transcribed rather than
    // tuned, and it is the kind of thing a later "cleanup" would quietly
    // revert, so it is pinned.
    for (const other of DRIVERS) {
      if (other.id === 'dot') continue;
      expect(driver('dot').friction, `dot vs ${other.id}`).toBeGreaterThan(other.friction);
    }
  });

  it('prices Dot out of the rail and Flat into it', () => {
    // Published Dash: Flat 35, Dot 10. The defence Bit cannot use the arena's
    // headline mechanic at all, which is the whole point of the axis.
    expect(driver('flat').railGrip!).toBeGreaterThan(driver('dot').railGrip! * 3);
  });

  it('keeps Flat just short of Accel on both of the axes they differ on', () => {
    // The two are the same published Attack (40) and Burst (80) and differ only
    // in Defense (15 v 10), Dash (35 v 40) and weight (2.2 g v 2.6 g). So Flat
    // must be grippier, less sure on the rail, and lighter — all three at once,
    // or the mapping has stopped being a function of the published block.
    expect(driver('flat').friction).toBeGreaterThan(driver('accel').friction);
    expect(driver('flat').railGrip!).toBeLessThan(driver('accel').railGrip!);
    expect(driver('flat').mass).toBeLessThan(driver('accel').mass);
    expect(driver('flat').wander).toBeCloseTo(driver('accel').wander, 2);
    expect(driver('flat').burstResist).toBeCloseTo(driver('accel').burstResist, 5);
  });
});

describe('the transcribed Ratchet catalogue', () => {
  it('encodes its own name: protrusions and height', () => {
    expect(disc('r460').protrusions).toBe(4);
    expect(disc('r460').heightMm).toBe(6.0);
    expect(disc('r980').protrusions).toBe(9);
    expect(disc('r980').heightMm).toBe(8.0);
  });

  it('peaks defence at four protrusions and stamina at five', () => {
    // Published: 4-60 is 13 defence, the highest; 5-60 is 9 stamina, the
    // highest. Fewer protrusions concentrate contact, more spread it.
    const sixties = ['r160', 'r360', 'r460', 'r560'].map(disc);
    const bestDef = sixties.reduce((a, b) => (b.stability > a.stability ? b : a));
    const bestSta = sixties.reduce((a, b) => (b.spinRetention > a.spinRetention ? b : a));
    expect(bestDef.id).toBe('r460');
    expect(bestSta.id).toBe('r560');
  });

  it('seats 9-60 between its neighbours on both axes', () => {
    // Published 13 / 10 / 7 against 3-60's 15 / 9 / 6, 4-60's 11 / 13 / 6 and
    // 5-60's 12 / 9 / 9. A recessed nine-point rim should out-defend the
    // sparser 60s without reaching the four-protrusion peak, and out-last them
    // without reaching the five-protrusion one.
    expect(disc('r960').stability).toBeGreaterThan(disc('r360').stability);
    expect(disc('r960').stability).toBeLessThan(disc('r460').stability);
    expect(disc('r960').spinRetention).toBeGreaterThan(disc('r360').spinRetention);
    expect(disc('r960').spinRetention).toBeLessThan(disc('r560').spinRetention);
  });

  it('makes the 60-height nine lighter than the 80-height nine', () => {
    // Same protrusion count, 6.2 g against 6.9 g. Height is what costs weight,
    // not the number of prongs — which is the rule the whole table encodes.
    expect(disc('r960').protrusions).toBe(disc('r980').protrusions);
    expect(disc('r960').heightMm!).toBeLessThan(disc('r980').heightMm!);
    expect(disc('r960').mass).toBeLessThan(disc('r980').mass);
  });

  it('makes taller ratchets heavier', () => {
    // 6.9 g at 8.0 mm against 6.0-6.6 g at 6.0 mm.
    expect(disc('r980').mass).toBeGreaterThan(disc('r160').mass);
    expect(disc('r980').heightMm!).toBeGreaterThan(disc('r160').heightMm!);
  });
});

describe('the transcribed Blade catalogue', () => {
  const layer = (id: string) => LAYERS.find((l) => l.id === id)!;

  it('lands WizardArrow exactly on the mass mapping’s anchor', () => {
    // The mapping is `0.44 + (grams - 31.8) / (40.7 - 31.8) * 0.13`, and 31.8 g
    // is WizardArrow's own published weight — it is the gram figure the low end
    // of that formula was fitted to. So 0.44 here is not a rounded number, it
    // is the identity, and it is worth pinning precisely because a later
    // "tidy the catalogue" pass would see a suspiciously round value and nudge
    // it. Both ends are pinned: BlackShell's 40.7 g is the other anchor.
    expect(layer('wizardarrow').mass).toBe(0.44);
    expect(layer('blackshell').mass).toBeCloseTo(0.57, 5);
  });

  it('widens a stamina blade and narrows a defence one at equal stamina', () => {
    // The mapping's last clause, and the one that encodes the two weight
    // distributions the source states outright: stamina blades use OUTWARD
    // distribution ("two large blades create an outward center of gravity"),
    // defence blades CENTRAL. WizardArrow (S55) must therefore out-reach every
    // defender, and at the SAME published stamina — CobaltDragoon S25 against
    // KnightShield S25 — the defender must be exactly 0.0020 narrower.
    expect(layer('wizardarrow').radius).toBeGreaterThan(layer('knightshield').radius);
    expect(layer('cobaltdragoon').radius - layer('knightshield').radius).toBeCloseTo(0.002, 5);
  });

  it('ties PhoenixWing and CobaltDragoon on attack and splits them elsewhere', () => {
    // Both are published A60, so attack must be identical — a difference there
    // would mean someone had "balanced" one of them. They differ on D25 v D15
    // and S15 v S25, and the derived numbers have to follow both ways round.
    expect(layer('phoenixwing').attack).toBe(layer('cobaltdragoon').attack);
    expect(layer('phoenixwing').defense).toBeGreaterThan(layer('cobaltdragoon').defense);
    expect(layer('phoenixwing').burstResist).toBeLessThan(layer('cobaltdragoon').burstResist);
  });

  it('gives PhoenixWing the heaviest blade of the attack transcriptions', () => {
    // 38.0 g — the heaviest Blade in the source line at release. Against the
    // other transcribed attackers only: the invented defence layers are heavier
    // still and are not making a claim about the source data.
    for (const id of ['dransword', 'sharkedge', 'dranbuster', 'cobaltdragoon', 'tyrannobeat']) {
      expect(layer('phoenixwing').mass, `phoenixwing vs ${id}`).toBeGreaterThan(layer(id).mass);
    }
  });

  it('keeps WizardArrow a two-lobed blade that is not an attacker', () => {
    // The roster's other two-lobed tops are Tempest and SharkEdge, both attack:
    // two huge keels with an empty rim between them. This is the opposite
    // reading of the same count, and the archetype is what says so.
    expect(layer('wizardarrow').blades).toBe(2);
    expect(layer('wizardarrow').archetype).toBe('stamina');
    expect(layer('wizardarrow').attack).toBeLessThan(layer('tempest').attack);
  });
});

describe('blade / ratchet alignment', () => {
  it('matches a nine-blade layer to the nine-protrusion ratchet', () => {
    // The real rule, from SphinxCowl: its nine Barrage Blades are "intended to
    // align with the 9 protrusions of the 9-80 Ratchet".
    const sphinx = LAYERS.find((l) => l.id === 'sphinxcowl')!;
    expect(sphinx.blades).toBe(9);
    expect(alignsWith(sphinx, disc('r980'))).toBe(true);
    expect(alignsWith(sphinx, disc('r360'))).toBe(false);
  });

  it('changes nothing about how the top performs', () => {
    // Deliberately inert. Making alignment grant a stat would invent a mechanic
    // the source does not describe, and every number in these entries is
    // supposed to come from a published one.
    const aligned = deriveStats(makeBuild('sphinxcowl', 'r980', 'ball'));
    const not = deriveStats(makeBuild('sphinxcowl', 'r980', 'ball'));
    expect(aligned).toEqual(not);
  });
});
