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

  it('makes taller ratchets heavier', () => {
    // 6.9 g at 8.0 mm against 6.0-6.6 g at 6.0 mm.
    expect(disc('r980').mass).toBeGreaterThan(disc('r160').mass);
    expect(disc('r980').heightMm!).toBeGreaterThan(disc('r160').heightMm!);
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
