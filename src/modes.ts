import { ARENAS, arenaById } from './sim/arena';
import { THEMES, themeById } from './render/theme';
import type { Theme } from './render/theme';

/**
 * Game modes and stadiums — the two choices a player makes before a match.
 *
 * WHY A MODE EXISTS AT ALL. A beyblade is built by a different code path
 * depending on the look: `buildBeyMesh`'s `toon` flag chooses between the
 * detailed designed construction (tiered layers, moulded caps, emblems, the
 * imported models) and the plain metal build this project started with. That is
 * not a filter over one object, it is two different objects. Burying that
 * behind a "visual style" row at the bottom of the garage meant the single
 * biggest decision about what the game looks like was the last one a player
 * would ever find, if they found it.
 *
 * So the mode is the FIRST choice, and it decides what a beyblade *is*:
 *
 *   Beyblade Arena — the roster. Every top designed here part by part, plus the
 *                    imported models. These look like actual beyblades.
 *   Overdrive      — the kept prototype. The original metal build under the
 *                    glow rig, preserved to look back at rather than developed.
 *
 * WHY THE ARENA THEME LIVES UNDER OVERDRIVE. This was the open question in
 * docs/UX-FLOW.md and the answer falls out of the paragraph above rather than
 * from taste. The Arena theme renders `buildClassicBey` — the same metal build
 * Overdrive does — and its own contract in theme.ts is that it is "the
 * preserved backup style" which must not drift. It is the prototype without the
 * glow, so it is a look inside the prototype mode. Putting it in the roster
 * mode would mean shipping a stadium whose beyblades are the ones the owner
 * specifically did not want to see.
 *
 * WHY STADIUM = ARENA × LOOK. Asked for directly: "combine arena and visual
 * style into just simply Arena or Stadium — anime visual style is simply an
 * arena that looks like anime with anime visual effects". Two dropdowns that
 * multiply into one place you fight is a worse model of the same thing, so the
 * product of the two IS the list, generated rather than hand-maintained. Adding
 * an arena or a look adds stadiums with no edit here, which is the same reason
 * the roster is generated rather than typed — see the 100-bey note in PLAN.md.
 */

export type ModeId = 'arena' | 'overdrive';

export interface GameMode {
  id: ModeId;
  name: string;
  /** One line under the name on the mode card. */
  tagline: string;
  /** The longer sell, for the card body. */
  blurb: string;
  /**
   * Which looks this mode's stadiums may use, in display order.
   *
   * This is the real content of a mode: a theme's `toon` flag decides which
   * beyblade gets built, so the theme list is what makes the two modes hold
   * different objects rather than different lighting.
   */
  themeIds: string[];
  /** Accent for the card, so the two modes read as different places. */
  accent: number;
}

export const MODES: GameMode[] = [
  {
    id: 'arena',
    name: 'Beyblade Arena',
    tagline: 'the roster',
    blurb:
      'Every top designed here — layer, disc and driver — alongside the imported models. ' +
      'Legendary and Epic, cel-shaded and inked.',
    themeIds: ['anime'],
    accent: 0x7cc4ff,
  },
  {
    id: 'overdrive',
    name: 'Overdrive',
    tagline: 'the kept prototype',
    blurb:
      'Where this project started: plain metal tops under the glow rig. ' +
      'Preserved to look back at, not developed further.',
    themeIds: ['overdrive', 'arena'],
    accent: 0xff56c8,
  },
];

export const DEFAULT_MODE: ModeId = 'arena';

export function modeById(id: string): GameMode {
  return MODES.find((m) => m.id === id) ?? MODES[0];
}

/** True for beyblades that only exist inside the kept prototype. */
export function isPrototypeMode(id: string): boolean {
  return modeById(id).id === 'overdrive';
}

/* ---------------------------------------------------------------- stadiums */

export interface Stadium {
  /** `${themeId}:${arenaId}` — derived, never typed by hand. */
  id: string;
  modeId: ModeId;
  /** Drives physics. See sim/arena.ts. */
  arenaId: string;
  /** Drives the look, and through `toon`, the beyblade build. */
  themeId: string;
  /** The arena's name — what the player is choosing between within one look. */
  name: string;
  /** The look's name, shown as a badge and used to group the picker. */
  look: string;
  /** The arena's own one-liner about how it plays. */
  blurb: string;
}

const stadiumId = (themeId: string, arenaId: string): string => `${themeId}:${arenaId}`;

function makeStadium(mode: GameMode, theme: Theme, arenaId: string): Stadium {
  const arena = arenaById(arenaId);
  return {
    id: stadiumId(theme.id, arena.id),
    modeId: mode.id,
    arenaId: arena.id,
    themeId: theme.id,
    name: arena.name,
    look: theme.name,
    blurb: arena.blurb,
  };
}

/**
 * Every stadium a mode offers, grouped-friendly: all of one look, then all of
 * the next. The order is the mode's own `themeIds` order crossed with the
 * arena registry's order, so "the first stadium" is a stable, meaningful
 * default rather than whatever the registry happens to list first.
 */
export function stadiumsFor(modeId: string): Stadium[] {
  const mode = modeById(modeId);
  const out: Stadium[] = [];
  for (const themeId of mode.themeIds) {
    const theme = themeById(themeId);
    // Guard rather than trust: a theme id that no longer exists would otherwise
    // silently fall back to THEMES[0] and put the wrong beyblade in the mode.
    if (theme.id !== themeId) continue;
    for (const arena of ARENAS) out.push(makeStadium(mode, theme, arena.id));
  }
  return out;
}

/** Stadiums of one mode, grouped by look, in mode order. */
export function stadiumsByLook(modeId: string): { look: string; items: Stadium[] }[] {
  const out: { look: string; items: Stadium[] }[] = [];
  for (const s of stadiumsFor(modeId)) {
    const group = out.find((g) => g.look === s.look);
    if (group) group.items.push(s);
    else out.push({ look: s.look, items: [s] });
  }
  return out;
}

export function defaultStadium(modeId: string): Stadium {
  return stadiumsFor(modeId)[0];
}

/**
 * Resolve a stadium id within a mode, falling back to that mode's default.
 *
 * The fallback is the point. A saved stadium belongs to the mode it was chosen
 * in, so switching modes always arrives holding an id that does not exist here
 * — and a stadium from the wrong mode would carry the wrong theme, which would
 * build the wrong beyblade. Resolving through the mode makes that unreachable
 * rather than something the callers have to remember.
 */
export function stadiumIn(modeId: string, stadiumId: string | null): Stadium {
  const list = stadiumsFor(modeId);
  return list.find((s) => s.id === stadiumId) ?? list[0];
}

/**
 * Which mode a theme belongs to, for the surfaces that hold a theme rather than
 * a mode — the inspector, mainly, which shows designs and so must not offer the
 * prototype's builds.
 */
export function modeOfTheme(themeId: string): GameMode {
  return MODES.find((m) => m.themeIds.includes(themeId)) ?? MODES[0];
}

/** Themes belonging to the roster modes — everything the inspector may show. */
export function rosterThemes(): Theme[] {
  return THEMES.filter((t) => modeOfTheme(t.id).id !== 'overdrive');
}

/* ------------------------------------------------------------- persistence */

const MODE_KEY = 'bey.mode';
const STADIUM_KEY = 'bey.stadium';

export function loadModeId(): ModeId {
  try {
    return modeById(localStorage.getItem(MODE_KEY) ?? DEFAULT_MODE).id;
  } catch {
    return DEFAULT_MODE;
  }
}

export function saveModeId(id: string): void {
  try {
    localStorage.setItem(MODE_KEY, id);
  } catch {
    // Storage unavailable; the choice still applies for this session.
  }
}

export function loadStadiumId(): string | null {
  try {
    return localStorage.getItem(STADIUM_KEY);
  } catch {
    return null;
  }
}

export function saveStadiumId(id: string): void {
  try {
    localStorage.setItem(STADIUM_KEY, id);
  } catch {
    // Storage unavailable; the choice still applies for this session.
  }
}
