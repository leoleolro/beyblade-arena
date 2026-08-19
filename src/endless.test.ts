import { describe, expect, it } from 'vitest';
import { LADDER, endlessRival } from './ladder';
import { PRESETS } from './sim/parts';
import { SKINS } from './render/skins';

/**
 * The endless run, after the ladder is cleared.
 *
 * The ladder is six rivals and then `rivalAt` clamped to Zeph forever — about
 * twenty minutes of content, after which the game had no reason to be reopened.
 * Endless is the loop that uses what was already here: a deterministic seeded
 * sim, an AI that escalates in skill, and six balanced anchor builds.
 *
 * Two rules keep it from undoing the balance and progression work, and both are
 * pinned here because both are easy to break by accident later.
 */
describe('endless rivals', () => {
  it('never grant unlocks', () => {
    // By the time these run the catalog is complete, and progress.test.ts
    // asserts the ladder distributes it EXACTLY ONCE. An endless rival handing
    // out a part would either duplicate a ladder grant or break that test from
    // a file that does not mention the ladder at all.
    for (let n = 1; n <= 60; n++) {
      const r = endlessRival(n);
      expect(r.unlocks.layers ?? [], `round ${n}`).toHaveLength(0);
      expect(r.unlocks.discs ?? [], `round ${n}`).toHaveLength(0);
      expect(r.unlocks.drivers ?? [], `round ${n}`).toHaveLength(0);
      expect(r.unlocks.skins ?? [], `round ${n}`).toHaveLength(0);
    }
  });

  it('only ever field builds the balance suite already sweeps', () => {
    // Escalation is skill and matchup, never stats — the same rule the ladder
    // states. Every endless build is one of the six PRESETS, so an endless
    // rival is provably beatable rather than a stat-inflated boss.
    const known = new Set(PRESETS.map((p) => p.name));
    for (let n = 1; n <= 60; n++) {
      expect(known.has(endlessRival(n).beyName), `round ${n}`).toBe(true);
    }
  });

  it('is deterministic, so a run is a fair sequence and not a slot machine', () => {
    // Two players who both say "I got to 12" must have fought the same twelve.
    for (let n = 1; n <= 30; n++) {
      const a = endlessRival(n);
      const b = endlessRival(n);
      expect(a.name).toBe(b.name);
      expect(a.beyName).toBe(b.beyName);
      expect(a.difficulty).toBe(b.difficulty);
      expect(a.skinId).toBe(b.skinId);
    }
  });

  it('eases in, then stays hard', () => {
    // Clearing the ladder should not slam straight into a wall, but endless is
    // supposed to be the hard mode — so the ramp is short and one-way.
    expect(endlessRival(1).difficulty).toBe('blader');
    expect(endlessRival(2).difficulty).toBe('blader');
    for (let n = 3; n <= 40; n++) {
      expect(endlessRival(n).difficulty, `round ${n}`).toBe('champion');
    }
  });

  it('names a real skin and a distinct id every round', () => {
    const skins = new Set(SKINS.map((s) => s.id));
    const ids = new Set<string>();
    for (let n = 1; n <= 60; n++) {
      const r = endlessRival(n);
      expect(skins.has(r.skinId), `round ${n} skin ${r.skinId}`).toBe(true);
      expect(ids.has(r.id), `round ${n} duplicate id`).toBe(false);
      ids.add(r.id);
    }
  });

  it('starts where the ladder stops', () => {
    // Round 1 of endless is the fight AFTER the last ladder rival, so the two
    // sequences must not overlap or repeat an opponent's identity.
    const ladderIds = new Set(LADDER.map((r) => r.id));
    for (let n = 1; n <= 20; n++) {
      expect(ladderIds.has(endlessRival(n).id), `round ${n}`).toBe(false);
    }
  });
});
