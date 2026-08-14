import { describe, expect, it } from 'vitest';
import {
  CRATES,
  DIRECT_PRICE,
  REROLL_COST,
  REWARDS,
  RARITY_LABEL,
  matchReward,
  rollCrate,
  rollOffer,
} from './economy';
import type { Rarity } from './economy';
import { makeRng } from './sim/math';
import { DISCS, DRIVERS, LAYERS } from './sim/parts';
import { SKINS } from './render/skins';

/**
 * The crate system's honesty properties, pinned.
 *
 * Two of these are the whole ethical load-bearing structure of the feature and
 * are worth failing a build over: a crate cannot hold anything the ladder does
 * not also give, and its advertised weights have to be true. The rest guard
 * the derivation from drifting when parts are retuned.
 */

const RARITIES: Rarity[] = ['common', 'rare', 'epic', 'legendary'];

describe('economy', () => {
  it('offers nothing the catalog does not already contain', () => {
    // A crate that could grant an item unobtainable by playing would turn the
    // pull from "sooner" into "only", which is the line this feature does not
    // cross.
    const known = new Set<string>([
      ...LAYERS.map((l) => `layers:${l.id}`),
      ...DISCS.map((d) => `discs:${d.id}`),
      ...DRIVERS.map((d) => `drivers:${d.id}`),
      ...SKINS.map((s) => `skins:${s.id}`),
    ]);
    for (const r of REWARDS) expect(known.has(`${r.kind}:${r.id}`)).toBe(true);
    expect(REWARDS.length).toBe(known.size);
  });

  it('every rarity a crate advertises is actually reachable', () => {
    // A weight above zero for a rarity with an empty pool is a lie told in the
    // shop UI, and the pip display reads straight off these weights.
    for (const crate of CRATES) {
      for (const r of RARITIES) {
        if (crate.weights[r] > 0) {
          expect(REWARDS.some((x) => x.rarity === r), `${crate.id} → ${r}`).toBe(true);
        }
      }
    }
  });

  it('rolls match the advertised weights', () => {
    // Rarity is picked before the item precisely so this holds regardless of
    // how many items happen to sit in each pool. If the implementation ever
    // flips to picking an item first, this fails.
    for (const crate of CRATES) {
      const rng = makeRng(1234);
      const counts: Record<string, number> = {};
      const N = 4000;
      for (let i = 0; i < N; i++) {
        const res = rollCrate(crate, () => false, rng);
        counts[res.reward.rarity] = (counts[res.reward.rarity] ?? 0) + 1;
      }
      const total = RARITIES.reduce((a, r) => a + crate.weights[r], 0);
      const report = RARITIES.map((r) => {
        const want = crate.weights[r] / total;
        const got = (counts[r] ?? 0) / N;
        return `${RARITY_LABEL[r]} want ${(want * 100).toFixed(0)}% got ${(got * 100).toFixed(0)}%`;
      }).join('  ');
      console.log(`  ${crate.name.padEnd(12)} ${report}`);

      for (const r of RARITIES) {
        const want = crate.weights[r] / total;
        const got = (counts[r] ?? 0) / N;
        expect(Math.abs(got - want), `${crate.id} ${r}`).toBeLessThan(0.03);
      }
    }
  });

  it('refunds duplicates instead of swallowing them', () => {
    const rng = makeRng(77);
    // Everything owned: every pull must be a duplicate, and every duplicate
    // must pay something. A pull that returns nothing and says nothing is the
    // most resented moment in this genre.
    for (let i = 0; i < 200; i++) {
      const res = rollCrate(CRATES[1], () => true, rng);
      expect(res.duplicate).toBe(true);
      expect(res.refund).toBeGreaterThan(0);
    }
  });

  it('cannot be farmed once everything is owned', () => {
    // The invariant is EXPECTED value, not the maximum single refund.
    //
    // Bounding the maximum was the first attempt and it is the wrong rule: the
    // cheapest crate costs 60, so it would force a legendary duplicate below
    // that, making the best consolation prize in the game worth less than a
    // common part. A lucky refund exceeding a cheap crate's price is fine and
    // even desirable — it is the consolation having variance. What must never
    // happen is a positive expectation, because that is a coin printer for a
    // fully-collected player.
    for (const crate of CRATES) {
      const rng = makeRng(5);
      let paid = 0;
      const N = 3000;
      for (let i = 0; i < N; i++) paid += rollCrate(crate, () => true, rng).refund;
      const ev = paid / N;
      console.log(
        `  ${crate.name.padEnd(12)} cost ${crate.cost}  expected refund ${ev.toFixed(1)}  (${((ev / crate.cost) * 100).toFixed(0)}%)`,
      );
      expect(ev).toBeLessThan(crate.cost);
      // And it has to actually sting, or duplicates stop mattering at all.
      expect(ev).toBeLessThan(crate.cost * 0.75);
    }
  });

  it('fills the reel with plausible items, never the empty set', () => {
    const rng = makeRng(9);
    const res = rollCrate(CRATES[2], () => false, rng);
    expect(res.reel.length).toBeGreaterThan(20);
    for (const r of res.reel) expect(REWARDS).toContain(r);
  });

  it('cosmetics are never the rarest thing in the game', () => {
    // Skins are provably inert — the balance suite depends on it. The rarest
    // pull should not be something that cannot affect a match.
    for (const r of REWARDS) {
      if (r.kind === 'skins') expect(r.rarity).not.toBe('legendary');
    }
  });

  it('never puts something you already own on the shelf', () => {
    // A slot showing a part you have is dead space, and four of them is a shop
    // that appears broken.
    const rng = makeRng(11);
    const mine = new Set(['valtryek', 'gravity', 'atomic', 'frost']);
    for (let i = 0; i < 200; i++) {
      for (const slot of rollOffer((_k, id) => mine.has(id), rng)) {
        expect(mine.has(slot.reward.id)).toBe(false);
      }
    }
  });

  it('never repeats a part within one offer', () => {
    const rng = makeRng(3);
    for (let i = 0; i < 300; i++) {
      const slots = rollOffer(() => false, rng);
      const keys = slots.map((s) => `${s.reward.kind}:${s.reward.id}`);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('lets a patient player buy a specific part for less than chasing it', () => {
    // The whole justification for the shelf existing next to the crate. If
    // gambling were the cheaper route to a *named* part, the crate would stop
    // being optional and the shelf would be decoration.
    const relic = CRATES[2];
    const total = RARITIES.reduce((a, r) => a + relic.weights[r], 0);
    for (const rarity of RARITIES) {
      const p = relic.weights[rarity] / total;
      if (p <= 0) continue;
      // Expected coins to see ANY item of this rarity from the best crate for
      // it — and it would still be a random one of the several at that tier.
      const chase = relic.cost / p;
      const pool = REWARDS.filter((r) => r.rarity === rarity).length;
      const named = chase * pool; // expected cost to hit one *specific* part
      console.log(
        `  ${RARITY_LABEL[rarity].padEnd(9)} shelf ${DIRECT_PRICE[rarity]}  vs chasing a named one ≈ ${Math.round(named)}`,
      );
      expect(DIRECT_PRICE[rarity]).toBeLessThan(named);
    }
  });

  it('does not escalate the reroll price', () => {
    // Documented as a deliberate refusal in economy.ts; pinned here because it
    // is the kind of thing that gets "optimised" back in later.
    expect(REROLL_COST).toBe(45);
    expect(typeof REROLL_COST).toBe('number');
  });

  it('pays a loss enough to keep a losing streak playable', () => {
    // A loss paying nothing makes the player least able to afford a crate the
    // one earning nothing toward one.
    expect(matchReward(false, 0)).toBeGreaterThan(0);
    expect(matchReward(true, 0)).toBeGreaterThan(matchReward(false, 0));
    // And the streak bonus has to be bounded, or a long run mints coins.
    expect(matchReward(true, 999)).toBeLessThan(matchReward(true, 0) * 3);
  });
});
