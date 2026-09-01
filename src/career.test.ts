import { beforeEach, describe, expect, it } from 'vitest';
import { Progress } from './progress';
import { MASTERY_TIERS, dayIndex } from './career';
import type { RoundRecord } from './career';

/**
 * The career layer, tested where it can actually be trusted.
 *
 * WHY THIS FILE EXISTS RATHER THAN A BROWSER SOAK. The first attempt to verify
 * this drove the real game in the Browser pane, and the numbers were nonsense:
 * a round reported `roundTime: 0` after 2400 manual ticks while its spin had
 * plainly drained. Nothing was broken. The tab was fronted, so
 * `requestAnimationFrame` was live and the game was ALSO stepping itself
 * between my calls — rounds were starting and ending inside the measurement.
 *
 * That is the third time this session that a confounded instrument looked like
 * a bug, after an A/B whose lever was not connected and a rate measured against
 * the wrong denominator. The lesson each time is the same: verify at the layer
 * that has no clock of its own. `Progress` takes a record and returns an
 * outcome, so it can be driven exactly.
 */

function installStorage(): void {
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage;
}

/** A fixed instant, so the daily/weekly deal is deterministic. */
const NOW = 1_700_000_000_000;

function round(over: Partial<RoundRecord> = {}): RoundRecord {
  return {
    won: true,
    reason: 'burst',
    decidedMatch: false,
    layerId: 'valtryek',
    discId: 'gravity',
    driverId: 'atomic',
    archetype: 'attack',
    spinDir: 1,
    hitsLanded: 4,
    spinStolen: 0,
    spinLeft: 0.5,
    seconds: 8,
    opponent: 'ladder',
    ...over,
  };
}

describe('career recording', () => {
  beforeEach(installStorage);

  it('tallies mastery and class rounds', () => {
    const p = new Progress();
    for (let i = 0; i < 5; i++) p.recordRound(round(), NOW);
    p.recordRound(round({ layerId: 'fafnir', archetype: 'stamina' }), NOW);

    expect(p.data.mastery.valtryek).toBe(5);
    expect(p.data.mastery.fafnir).toBe(1);
    expect(p.data.classRounds.attack).toBe(5);
    expect(p.data.classRounds.stamina).toBe(1);
  });

  it('deals objectives on the first round rather than the second', () => {
    // The order inside `recordRound` matters: a fresh save has an empty set, so
    // dealing has to happen BEFORE ticking or the very first round of a career
    // counts toward nothing and the player silently loses it.
    const p = new Progress();
    expect(p.data.challenges.daily.length).toBe(0);
    p.recordRound(round(), NOW);
    expect(p.data.challenges.daily.length).toBeGreaterThan(0);
    const ticked = [...p.data.challenges.daily, ...p.data.challenges.weekly].some(
      (c) => c.n > 0 || c.keys.length > 0,
    );
    expect(ticked, 'the dealing round also counted').toBe(true);
  });

  it('pays an objective exactly once, however many more rounds are played', () => {
    const p = new Progress();
    // Drive far past every daily target.
    let paid = 0;
    for (let i = 0; i < 120; i++) {
      paid += p.recordRound(round({ hitsLanded: 30, spinStolen: 50, spinLeft: 0.95 }), NOW).coins;
    }
    const done = [...p.data.challenges.daily, ...p.data.challenges.weekly].filter((c) => c.paid);
    expect(done.length, 'nothing completed at all — the drive was too weak').toBeGreaterThan(0);
    expect(p.data.challengesDone).toBe(done.length);

    // The coins banked must equal what was reported, and no further round may
    // add to it once everything payable is paid.
    const before = p.data.coins;
    for (let i = 0; i < 20; i++) p.recordRound(round({ hitsLanded: 30 }), NOW);
    expect(p.data.coins, 'a completed objective paid again').toBe(before);
    expect(paid, 'reported coins were never actually banked').toBeGreaterThan(0);
  });

  it('reports a mastery tier on the round that crosses it, and only then', () => {
    const p = new Progress();
    const first = MASTERY_TIERS[0];
    let crossings = 0;
    for (let i = 0; i < first + 5; i++) {
      const out = p.recordRound(round(), NOW);
      if (out.masteryTier > 0) {
        crossings++;
        expect(out.masteryTier, 'first tier is tier 1').toBe(1);
        expect(out.masteryLayerId).toBe('valtryek');
        expect(p.data.mastery.valtryek, 'crossed at the threshold').toBe(first);
      }
    }
    expect(crossings, 'a tier must be announced exactly once').toBe(1);
  });

  it('counts the nemesis head-to-head only on decisive nemesis rounds', () => {
    const p = new Progress();
    // Non-decisive rounds against them, and decisive rounds against others,
    // must both be ignored — otherwise the record shown in the garage counts
    // things the player would not call a meeting.
    p.recordRound(round({ opponent: 'nemesis', decidedMatch: false }), NOW);
    p.recordRound(round({ opponent: 'ladder', decidedMatch: true }), NOW);
    expect(p.data.nemesis.met).toBe(0);

    p.recordRound(round({ opponent: 'nemesis', decidedMatch: true, won: true }), NOW);
    p.recordRound(round({ opponent: 'nemesis', decidedMatch: true, won: false }), NOW);
    expect(p.data.nemesis.met).toBe(2);
    expect(p.data.nemesis.playerWins).toBe(1);
    expect(p.data.nemesis.rivalWins).toBe(1);
  });

  it('redeals the dailies when the day rolls over', () => {
    const p = new Progress();
    p.recordRound(round(), NOW);
    const day = p.data.challenges.day;
    expect(day).toBe(dayIndex(NOW));

    // Push a daily along, then move the clock on a day. The set must be new and
    // the progress must not carry over — a daily that keeps yesterday's count
    // is a weekly wearing the wrong label.
    p.data.challenges.daily[0].n = 99;
    p.recordRound(round(), NOW + 86_400_000);
    expect(p.data.challenges.day).toBe(day + 1);
    expect(p.data.challenges.daily.every((c) => c.n < 99)).toBe(true);
  });
});

describe('titles', () => {
  beforeEach(installStorage);

  it('refuses a title that has not been earned, and keeps the old one', () => {
    const p = new Progress();
    p.equipTitle('nonsense-id');
    expect(p.data.title).toBe('');
    expect(p.equippedTitle()).toBeNull();
  });

  it('earns and equips one from real play', () => {
    const p = new Progress();
    for (let i = 0; i < MASTERY_TIERS[0]; i++) p.recordRound(round(), NOW);
    const earned = p.titles();
    expect(earned.length, 'mastery earned no title').toBeGreaterThan(0);

    p.equipTitle(earned[0].id);
    expect(p.equippedTitle()?.id).toBe(earned[0].id);

    // '' is always allowed: taking a title off must never be blocked by the
    // same check that blocks putting an unearned one on.
    p.equipTitle('');
    expect(p.equippedTitle()).toBeNull();
  });
});

describe('save compatibility', () => {
  beforeEach(installStorage);

  it('loads a career written before the career fields existed', () => {
    // Exactly the shape the save had before this feature: no mastery, no
    // challenges, no nemesis. `load` merges onto a fresh object, so these must
    // come back defaulted rather than undefined — there is deliberately no
    // version bump, so this is the only thing standing between an old save and
    // a crash.
    const legacy = {
      rung: 3,
      layers: ['valtryek'],
      discs: ['gravity'],
      drivers: ['atomic'],
      skins: [],
      wins: 7,
      losses: 2,
      bestStreak: 3,
      streak: 1,
      coins: 400,
      offer: [],
      endless: 0,
      bestEndless: 0,
    };
    localStorage.setItem('beyblade-arena.progress.v1', JSON.stringify(legacy));

    const p = new Progress();
    expect(p.data.rung, 'the old save was not read at all').toBe(3);
    expect(p.data.wins).toBe(7);
    expect(p.data.mastery).toEqual({});
    expect(p.data.classRounds.attack).toBe(0);
    expect(p.data.challengesDone).toBe(0);
    expect(p.data.title).toBe('');
    expect(p.data.nemesis.met).toBe(0);
    expect(p.data.challenges.daily).toEqual([]);

    // And it must be usable, not merely loadable.
    expect(() => p.recordRound(round(), NOW)).not.toThrow();
    expect(p.data.mastery.valtryek).toBe(1);
  });
});
