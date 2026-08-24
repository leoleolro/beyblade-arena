import { describe, expect, it } from 'vitest';
import {
  MODES,
  defaultStadium,
  modeById,
  modeOfTheme,
  rosterThemes,
  stadiumIn,
  stadiumsByLook,
  stadiumsFor,
} from './modes';
import { ARENAS, arenaById } from './sim/arena';
import { THEMES, themeById } from './render/theme';

/**
 * Mode and stadium wiring.
 *
 * These are tested because the failure mode is silent and cosmetic-looking
 * while being neither. A stadium carries a theme, a theme's `toon` flag chooses
 * which of two construction paths builds the beyblade, so a stadium that leaks
 * across a mode boundary does not throw, does not look broken, and quietly puts
 * the prototype's plain metal tops in the mode whose entire point is the
 * designed roster. That is precisely the bug this restructure exists to fix, so
 * it gets pinned rather than trusted.
 */

describe('modes', () => {
  it('gives every mode at least one look and one stadium', () => {
    for (const m of MODES) {
      expect(m.themeIds.length).toBeGreaterThan(0);
      expect(stadiumsFor(m.id).length).toBeGreaterThan(0);
    }
  });

  it('names only themes that exist', () => {
    // A dead theme id would fall through `themeById`'s default and put an
    // arbitrary look — and so an arbitrary beyblade build — inside a mode.
    const known = new Set(THEMES.map((t) => t.id));
    for (const m of MODES) {
      for (const id of m.themeIds) expect(known.has(id)).toBe(true);
    }
  });

  it('partitions the themes — every look belongs to exactly one mode', () => {
    // Overlap would make `modeOfTheme` a coin toss and `rosterThemes` wrong.
    const seen = new Map<string, string>();
    for (const m of MODES) {
      for (const id of m.themeIds) {
        expect(seen.has(id)).toBe(false);
        seen.set(id, m.id);
      }
    }
    for (const t of THEMES) expect(seen.has(t.id)).toBe(true);
  });

  it('falls back to a real mode for an unknown id', () => {
    expect(modeById('no-such-mode').id).toBe(MODES[0].id);
  });
});

describe('stadiums', () => {
  it('is the product of the mode’s looks and the arena registry', () => {
    for (const m of MODES) {
      const list = stadiumsFor(m.id);
      expect(list.length).toBe(m.themeIds.length * ARENAS.length);
      // Ids are unique, which is what makes them safe to persist.
      expect(new Set(list.map((s) => s.id)).size).toBe(list.length);
    }
  });

  it('carries the arena’s own name and blurb rather than a second copy', () => {
    for (const s of stadiumsFor('arena')) {
      const arena = arenaById(s.arenaId);
      expect(s.name).toBe(arena.name);
      expect(s.blurb).toBe(arena.blurb);
      expect(s.look).toBe(themeById(s.themeId).name);
    }
  });

  it('never returns a stadium from another mode', () => {
    // The important one. Switching modes always arrives holding an id that
    // belongs to the mode just left.
    const other = defaultStadium('overdrive');
    const resolved = stadiumIn('arena', other.id);
    expect(resolved.modeId).toBe('arena');
    expect(modeById('arena').themeIds).toContain(resolved.themeId);
  });

  it('falls back to the mode’s default for a junk id', () => {
    expect(stadiumIn('arena', 'nonsense').id).toBe(defaultStadium('arena').id);
    expect(stadiumIn('arena', null).id).toBe(defaultStadium('arena').id);
  });

  it('groups by look without losing or duplicating a stadium', () => {
    for (const m of MODES) {
      const flat = stadiumsFor(m.id);
      const grouped = stadiumsByLook(m.id);
      expect(grouped.flatMap((g) => g.items).map((s) => s.id)).toEqual(flat.map((s) => s.id));
      // One group per look, not one per stadium.
      expect(grouped.length).toBe(m.themeIds.length);
    }
  });
});

describe('the roster / prototype split', () => {
  it('keeps Overdrive out of the roster looks', () => {
    // What the inspector filters on. Overdrive is a kept prototype, so the page
    // for judging designs must not offer to render one.
    const ids = rosterThemes().map((t) => t.id);
    expect(ids).not.toContain('overdrive');
    expect(ids.length).toBeGreaterThan(0);
  });

  it('builds designed tops in the roster mode and metal tops in the prototype', () => {
    // The whole reason the mode comes first. `toon` is the construction switch
    // in buildBeyMesh; asserting it here means the modes hold genuinely
    // different objects rather than different lighting on the same one.
    for (const id of modeById('arena').themeIds) {
      expect(themeById(id).toon).toBe(true);
    }
    for (const id of modeById('overdrive').themeIds) {
      expect(themeById(id).toon).toBe(false);
    }
  });

  it('reports the owning mode for every theme', () => {
    expect(modeOfTheme('anime').id).toBe('arena');
    expect(modeOfTheme('overdrive').id).toBe('overdrive');
    expect(modeOfTheme('arena').id).toBe('overdrive');
  });
});
