import { DISCS, DRIVERS, LAYERS } from './sim/parts';
import { SKINS } from './render/skins';
import type { Unlocks } from './ladder';

/**
 * Coins and crates.
 *
 * The collection loop, in the shape the reference games use: play, earn, spend
 * on a randomised pull, watch the reveal, keep the thing. Two constraints make
 * this honest rather than predatory, and both are structural rather than
 * promises:
 *
 *  1. **The only source of coins is playing.** There is no purchase path
 *     anywhere in the codebase, so a crate cannot be bought — only earned. If
 *     that ever changes it becomes a genuinely different product with
 *     genuinely different obligations, and this comment is the place to
 *     notice it.
 *  2. **Crates hold nothing the ladder does not already give.** Every reward
 *     here also drops from beating rivals. A crate buys you the part *sooner*
 *     and in a different order; it cannot buy you something a patient player
 *     can never have, and it cannot buy power the balance suite has not
 *     measured.
 *
 * Duplicates refund rather than being silently swallowed. A pull that gives
 * you nothing and says nothing is the single most resented moment in this
 * genre, and the refund is what keeps a bad pull merely disappointing.
 */

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface RewardRef {
  kind: keyof Unlocks;
  id: string;
  /** Display name. */
  name: string;
  rarity: Rarity;
}

export interface CrateResult {
  reward: RewardRef;
  /** True when the player already owned it; coins are refunded instead. */
  duplicate: boolean;
  refund: number;
  /** Filler entries for the reveal reel — plausible items, not the winner. */
  reel: RewardRef[];
}

export interface CrateSpec {
  id: string;
  name: string;
  blurb: string;
  cost: number;
  /** Relative weights per rarity; need not sum to 1. */
  weights: Record<Rarity, number>;
}

export const RARITY_COLOUR: Record<Rarity, number> = {
  common: 0x6b7d99,
  rare: 0x3f8fe8,
  epic: 0xa855f7,
  legendary: 0xf0a020,
};

export const RARITY_LABEL: Record<Rarity, string> = {
  common: 'Common',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
};

/** Coins refunded for a duplicate, by rarity. */
const REFUND: Record<Rarity, number> = {
  common: 15,
  rare: 40,
  epic: 90,
  legendary: 200,
};

/**
 * Rarity is derived from what a part *does*, not assigned by hand.
 *
 * A hand-written table would drift the moment a part is retuned, and it would
 * let rarity and power disagree — the state that turns a cosmetic pull into a
 * pay-to-win complaint. Deriving it means a part that gets nerfed becomes
 * commoner automatically, and the ordering is always defensible.
 *
 * Layers score on their best axis relative to the field; discs and drivers on
 * how far they sit from the middle of their catalog. Skins are cosmetic and
 * provably inert, so they are never above rare — the rarest thing in the game
 * should not be something that cannot affect a match.
 */
function layerRarity(attack: number, defense: number, steal: number): Rarity {
  const peak = Math.max(attack, defense * 0.95);
  if (steal > 0.5 || peak >= 1.5) return 'legendary';
  if (steal > 0 || peak >= 1.25) return 'epic';
  if (peak >= 1.05) return 'rare';
  return 'common';
}

function spreadRarity(value: number, all: number[]): Rarity {
  const mean = all.reduce((a, b) => a + b, 0) / all.length;
  const dev = Math.max(...all.map((v) => Math.abs(v - mean))) || 1;
  const k = Math.abs(value - mean) / dev;
  if (k >= 0.92) return 'epic';
  if (k >= 0.55) return 'rare';
  return 'common';
}

/** Every grantable reward, with a derived rarity. Built once. */
export const REWARDS: RewardRef[] = (() => {
  const out: RewardRef[] = [];

  for (const l of LAYERS) {
    out.push({
      kind: 'layers',
      id: l.id,
      name: l.name,
      rarity: layerRarity(l.attack, l.defense, l.spinSteal),
    });
  }

  const discStab = DISCS.map((d) => d.stability);
  for (const d of DISCS) {
    out.push({
      kind: 'discs',
      id: d.id,
      name: d.name,
      rarity: spreadRarity(d.stability, discStab),
    });
  }

  const driverSpin = DRIVERS.map((d) => d.spinRetention);
  for (const d of DRIVERS) {
    out.push({
      kind: 'drivers',
      id: d.id,
      name: d.name,
      rarity: spreadRarity(d.spinRetention, driverSpin),
    });
  }

  for (const s of SKINS) {
    // Cosmetics cap at rare on purpose — see the note on layerRarity.
    out.push({ kind: 'skins', id: s.id, name: s.name, rarity: 'rare' });
  }

  return out;
})();

export const CRATES: CrateSpec[] = [
  {
    id: 'scrap',
    name: 'Scrap Crate',
    blurb: 'cheap and cheerful — mostly commons',
    cost: 60,
    weights: { common: 68, rare: 26, epic: 6, legendary: 0 },
  },
  {
    id: 'forge',
    name: 'Forge Crate',
    blurb: 'a fair shot at something good',
    cost: 160,
    weights: { common: 34, rare: 40, epic: 22, legendary: 4 },
  },
  {
    id: 'relic',
    name: 'Relic Crate',
    blurb: 'expensive, and the only real path to a legendary',
    cost: 420,
    weights: { common: 8, rare: 30, epic: 44, legendary: 18 },
  },
];

export const crateById = (id: string): CrateSpec | undefined =>
  CRATES.find((c) => c.id === id);

/** Pick one entry by relative weight. */
function weightedPick<T>(items: T[], weight: (t: T) => number, rng: () => number): T {
  let total = 0;
  for (const it of items) total += weight(it);
  if (total <= 0) return items[Math.floor(rng() * items.length)];
  let r = rng() * total;
  for (const it of items) {
    r -= weight(it);
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

/**
 * Roll a crate.
 *
 * Rarity is chosen first and the item second, which is what makes the crate's
 * advertised weights true. Rolling an item directly and reading its rarity
 * afterwards would let the *catalog's* shape silently override the crate's —
 * add three more common layers and every crate quietly gets worse.
 *
 * `owned` decides only the duplicate flag and refund, never the roll itself:
 * biasing away from owned items would make late crates progressively better
 * than advertised, and the refund already solves the problem it would address.
 */
export function rollCrate(
  crate: CrateSpec,
  owned: (kind: keyof Unlocks, id: string) => boolean,
  rng: () => number,
): CrateResult {
  const rarities = (Object.keys(crate.weights) as Rarity[]).filter(
    (r) => crate.weights[r] > 0 && REWARDS.some((x) => x.rarity === r),
  );
  const rarity = weightedPick(rarities, (r) => crate.weights[r], rng);
  const pool = REWARDS.filter((x) => x.rarity === rarity);
  const reward = pool[Math.floor(rng() * pool.length)];

  const duplicate = owned(reward.kind, reward.id);

  // Reel filler. Weighted by the same crate so the reel *looks* like the crate
  // it came from — a reel full of legendaries under a scrap crate would read
  // as a lie the moment the common lands.
  const reel: RewardRef[] = [];
  for (let i = 0; i < 48; i++) {
    const r = weightedPick(rarities, (x) => crate.weights[x], rng);
    const p = REWARDS.filter((x) => x.rarity === r);
    reel.push(p[Math.floor(rng() * p.length)]);
  }

  return { reward, duplicate, refund: duplicate ? REFUND[reward.rarity] : 0, reel };
}

/* -------------------------------------------------------------- the offer */

export interface OfferSlot {
  reward: RewardRef;
  price: number;
}

/**
 * What a specific, named part costs outright.
 *
 * These are the release valve on the crate, and the reason both mechanisms can
 * coexist without one making the other pointless:
 *
 *  - The **crate** is cheaper per item. 420 coins always returns something.
 *  - The **offer** is the only way to buy the part you actually want. Chasing a
 *    particular legendary through Relic Crates costs about 2,300 coins in
 *    expectation (420 / 0.18) and hands you a random one at the end of it; the
 *    offer sells the exact part for 1,500 and cannot disappoint you.
 *
 * So the gamble is for players with few coins who want *anything*, and the
 * offer is for players who know what they are missing. Deliberately priced so
 * that the player who refuses to gamble is not the player who falls behind —
 * if the certain path were the worse deal, the crate would stop being optional.
 */
export const DIRECT_PRICE: Record<Rarity, number> = {
  common: 90,
  rare: 240,
  epic: 620,
  legendary: 1500,
};

export const OFFER_SIZE = 4;

/**
 * Flat, and it stays flat.
 *
 * Escalating reroll costs are the standard trick and they are the manipulative
 * part of this genre: they punish the player for continuing to look, which is
 * pressure rather than a choice. A constant price means rerolling is a plain
 * trade the player can evaluate once and then stop thinking about.
 */
export const REROLL_COST = 45;

/** Appearance weights for the offer. Cheap things show up often. */
const OFFER_WEIGHT: Record<Rarity, number> = {
  common: 44,
  rare: 33,
  epic: 18,
  legendary: 5,
};

/**
 * Roll a fresh set of offers.
 *
 * Unlike the crate, this filters out what the player already owns. The crate
 * cannot do that — excluding owned items would silently make its advertised
 * weights false — but nothing is advertised here, and a shop slot showing a
 * part you already have is simply dead space on the screen.
 */
export function rollOffer(
  owned: (kind: keyof Unlocks, id: string) => boolean,
  rng: () => number,
  size: number = OFFER_SIZE,
): OfferSlot[] {
  const pool = REWARDS.filter((r) => !owned(r.kind, r.id));
  const out: OfferSlot[] = [];
  const taken = new Set<string>();

  while (out.length < size && taken.size < pool.length) {
    const left = pool.filter((r) => !taken.has(`${r.kind}:${r.id}`));
    if (left.length === 0) break;
    const pick = weightedPick(left, (r) => OFFER_WEIGHT[r.rarity], rng);
    taken.add(`${pick.kind}:${pick.id}`);
    out.push({ reward: pick, price: DIRECT_PRICE[pick.rarity] });
  }

  return out;
}

/**
 * Coins for finishing a match.
 *
 * Winning pays roughly three times losing rather than everything, because a
 * loss that pays nothing turns a losing streak into a dead end — the player
 * least able to afford a crate would be the one earning nothing toward one.
 * The streak bonus is capped: it should reward a run, not compound into a
 * source of infinite coins.
 */
export function matchReward(won: boolean, streak: number): number {
  const base = won ? 75 : 25;
  const bonus = won ? Math.min(4, streak) * 15 : 0;
  return base + bonus;
}
