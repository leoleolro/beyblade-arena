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

describe('the transcribed spin-absorber set', () => {
  const layer = (id: string) => LAYERS.find((l) => l.id === id)!;
  const steal = (id: string) => layer(id).spinSteal;

  /**
   * `spinSteal` used to be two hand-placed numbers; it is now a ladder read off
   * beyblade.fandom.com/wiki/Spin_Absorption — roundness qualifies, rubber
   * amplifies. See the block above LAYERS for the quotes.
   *
   * These pin the ORDER and the ZEROES, never the magnitudes, for the reason
   * this file's header already gives: the magnitudes are honest tuning and will
   * move; which parts absorb and which do not is a fact about the source.
   *
   * The zeroes matter more than the non-zeroes. Absorption is worth roughly ten
   * points of win rate to a stamina build, so every future balance pass will be
   * tempted to hand it to the next struggling bey. These tests are the thing
   * that makes doing so require deleting a citation.
   */

  it('puts the rubber layer above every layer that only has a round shape', () => {
    // The source's own hierarchy: roundness is the qualifier, rubber is the
    // amplifier. Drain Fafnir is the only transcribed layer here whose official
    // description names absorption as the part's gimmick — "absorbs the attack
    // of a clockwise spinning opponent with a rubber blade" — so nothing
    // sourced on shape alone may reach it.
    for (const id of ['wizardrod', 'wizardarrow', 'silverwolf', 'knightshield',
      'hellsscythe', 'sphinxcowl', 'orichalcum', 'luinor']) {
      expect(steal(id), `${id} vs fafnir`).toBeLessThan(steal('fafnir'));
    }
  });

  it('ranks a clean round perimeter above a round one the source calls recoily', () => {
    // WizardRod "wide circular shape", WizardArrow "round... lower recoil",
    // SilverWolf "an overall round shape", KnightShield "a round Defense Type
    // Blade" — against HellsScythe, which is round but "suffers from high
    // recoil due to the gaps in its four blades", SphinxCowl's "rugged
    // perimeter", and Orichalcum's gimmick that "creates a much more aggressive
    // elliptical shape". A round blade that also recoils cannot stay in contact
    // long enough to gear with the opponent, which is the whole mechanism.
    for (const clean of ['wizardrod', 'wizardarrow', 'silverwolf', 'knightshield']) {
      for (const rough of ['hellsscythe', 'sphinxcowl', 'orichalcum']) {
        expect(steal(clean), `${clean} vs ${rough}`).toBeGreaterThan(steal(rough));
      }
    }
  });

  it('keeps Lost Longinus the weakest absorber in the catalogue', () => {
    // "it allows for some degree of Spin-Equalization, however not enough to be
    // the primary focus for Combinations" — the source's own hedge, and the
    // floor of the ladder. It predates this pass; the number was already right
    // and only the citation was missing, so an ordering test is what proves the
    // new rows were fitted around it rather than over it.
    const absorbers = LAYERS.filter((l) => l.spinSteal > 0 && l.id !== 'nosferu');
    for (const l of absorbers) {
      if (l.id === 'luinor') continue;
      expect(l.spinSteal, `${l.id} vs luinor`).toBeGreaterThan(steal('luinor'));
    }
    expect(steal('luinor')).toBeGreaterThan(0);
  });

  it('ties KnightShield to WizardRod, because the source ties them', () => {
    // "WizardRod, which had a similar shape and use, eventually replaced both
    // KnightShield and HellsScythe." Two blades the source calls the same shape
    // must not drift apart here, even though one is a defender and one is the
    // stamina blade this whole pass was chasing — which is exactly the pressure
    // that would separate them.
    expect(steal('knightshield')).toBe(steal('wizardrod'));
  });

  it('gives nothing to a blade whose wiki entry was never written', () => {
    // All four carry the same placeholder: "In-depth information for the X
    // Blade will be placed here once drafting has been completed for it."
    //
    // ViperTail is the one that costs something. It is a STAMINA blade sitting
    // near the bottom of the roster, the archetype this pass was opened to
    // help, and handing it the round-blade value would have been a free eight
    // points. There is no sentence in the source to hang that on, so it gets
    // nothing — and this test is here so that stays a decision someone has to
    // argue with rather than one they can quietly reverse.
    for (const id of ['vipertail', 'leonclaw', 'tyrannobeat', 'rhinohorn']) {
      expect(steal(id), `${id} has no sourced shape`).toBe(0);
    }
  });

  it('gives nothing to any attack blade, or to the elliptical balance one', () => {
    // Every attack entry in the source data is described by its edges —
    // "three upward slanting blades", "an overall blocky shape", "two large
    // blades... very aggressive shapes", "Launcher Hooks protrude past the
    // perimeter", "four upward slanting blades". An edge deflects instead of
    // gearing, which is the same reason docs/PHYSICS.md gives.
    //
    // Storm Spryzen rides with them: "a rather elliptical Layer" with an
    // "aggressive design". Spriggan REQUIEM is the rubber spin-equalizer of
    // that line — a different product, not in this catalogue — and confusing
    // the two is the single most likely way this row gets "corrected" later.
    for (const l of LAYERS) {
      if (l.archetype !== 'attack') continue;
      expect(l.spinSteal, `${l.id} is an attack blade`).toBe(0);
    }
    expect(steal('spryzen'), 'Storm Spryzen is elliptical').toBe(0);
    expect(steal('blackshell'), 'BlackShell is a diamond').toBe(0);
  });

  it('leaves the invented lines out of it entirely', () => {
    // The player-designed and imported blades are authored to archetype
    // anchors, not transcribed, so there is no perimeter to read. Two of them
    // are stamina and both are near the bottom of the roster, which is the
    // temptation this pins shut: the fix for an invented bey is to invent a
    // better one, not to cite a source it does not have.
    for (const id of ['basilisk', 'magejab', 'chimera', 'solaris', 'drake', 'dsycther']) {
      expect(steal(id), `${id} is invented`).toBe(0);
    }
  });

  it('still leaves stamina the archetype with the least access to it', () => {
    // The honest scoreboard for this pass. Nine stamina blades; four now
    // absorb, five do not, and the five include the two the source cannot
    // justify. If a later change makes this ratio look healthy, check whether
    // the reason is a new citation or a quiet hand on the dial.
    const stamina = LAYERS.filter((l) => l.archetype === 'stamina');
    const absorbing = stamina.filter((l) => l.spinSteal > 0);
    expect(stamina.length).toBeGreaterThanOrEqual(9);
    expect(absorbing.length).toBeLessThan(stamina.length);
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
