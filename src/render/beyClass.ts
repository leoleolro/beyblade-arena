import { topModelFor } from './topModelIndex';

/**
 * What KIND of beyblade this is, in the owner's own terms.
 *
 *   Legendary — imported. A model authored outside this project in a 3D tool
 *               and loaded from `public/models`.
 *   Epic      — designed and built here, part by part: silhouette grammar,
 *               tiered construction, moulded caps, emblems, palette.
 *
 * WHY THIS IS ITS OWN CONCEPT AND NOT A LOOKUP. Today the answer is derivable —
 * a bey is Legendary exactly when `topModelFor` has an entry — and this
 * function does derive it, because two sources of truth that must agree are a
 * bug waiting to happen and the registry test cannot check a hand-typed
 * duplicate of a fact the loader already owns.
 *
 * But it is named and exported rather than inlined at three call sites, because
 * it is a PRODUCT category the player sees, not an implementation detail. When
 * an imported model eventually wants to be Epic — or a built one Legendary —
 * the change belongs here, in one place, with a reason next to it.
 *
 * THE OVERDRIVE EXCLUSION lives here too. Overdrive is a kept prototype rather
 * than part of the roster, so it is not a class of beyblade at all: the
 * inspector and the pickers ask this module whether to show a bey, and the
 * answer for Overdrive's own set is no.
 */

export type BeyClass = 'legendary' | 'epic';

export interface BeyClassInfo {
  id: BeyClass;
  /** Shown on group headings and chips. */
  label: string;
  /** One line, for a heading subtitle. */
  blurb: string;
  /** Accent, for the group heading and the chip's rarity pip. */
  colour: number;
}

export const BEY_CLASSES: Record<BeyClass, BeyClassInfo> = {
  legendary: {
    id: 'legendary',
    label: 'Legendary',
    // Deliberately says where it came from rather than how good it is. These
    // are not a power tier, and a player who reads them as one will expect
    // Legendary to win more, which is not true and must not become true by
    // accident — see `classOf`, which touches nothing the sim can see.
    blurb: 'imported models',
    colour: 0xf5b942,
  },
  epic: {
    id: 'epic',
    label: 'Epic',
    blurb: 'designed and built here',
    colour: 0x7cc4ff,
  },
};

/**
 * Which class a layer belongs to.
 *
 * Purely cosmetic and provably so: it reads the model index and nothing the sim
 * owns, and nothing here is passed to `Battle`. A Legendary bey has exactly the
 * stats its `LayerPart` gives it.
 */
export function classOf(layerId: string): BeyClass {
  return topModelFor(layerId) !== undefined ? 'legendary' : 'epic';
}

/** Group a list of layer ids by class, preserving the order given. */
export function groupByClass<T>(
  items: T[],
  layerId: (item: T) => string,
): { info: BeyClassInfo; items: T[] }[] {
  const out: { info: BeyClassInfo; items: T[] }[] = [];
  // Legendary first: it is the shorter list and the one a player is looking
  // for. A long Epic list above it would bury two entries under nine.
  for (const id of ['legendary', 'epic'] as BeyClass[]) {
    const group = items.filter((it) => classOf(layerId(it)) === id);
    if (group.length) out.push({ info: BEY_CLASSES[id], items: group });
  }
  return out;
}
