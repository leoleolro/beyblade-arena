import { describe, expect, it } from 'vitest';
import { BEY_REGISTRY, registryDesigns, registryClassic, registryPresets } from './registry';
import { LAYERS, DISCS, DRIVERS } from '../../sim/parts';
import { SKINS } from '../skins';
import { LADDER, STARTING_UNLOCKS } from '../../ladder';

/**
 * The seam between a beyblade's two halves.
 *
 * A beyblade is deliberately split: stats in `sim/parts.ts`, art in
 * `beys/<id>.ts`, joined by `id`. That split exists because `src/sim/` must
 * never import from `src/render/` — the balance suite sweeps thousands of
 * matches headlessly and a combined entry would drag the renderer in.
 *
 * The cost of the split is that the two halves can silently disagree. Before
 * the registry there were FOUR parallel lists in that position and nothing
 * checked any of them: a bey with stats but no design, or a design with no
 * preset, just rendered wrong at runtime and waited to be noticed by eye.
 *
 * These tests are what makes the split safe. They are the reason adding a
 * beyblade is now a two-file job that either compiles and passes or fails
 * loudly, rather than one that half-works.
 */
describe('bey registry', () => {
  it('has an art entry for every layer the sim knows about, and vice versa', () => {
    const simIds = LAYERS.map((l) => l.id).sort();
    const artIds = BEY_REGISTRY.map((b) => b.id).sort();
    // Reported as a diff rather than a count, so a failure names the bey.
    expect(artIds, 'registry vs sim/parts.ts LAYERS').toEqual(simIds);
  });

  it('has no duplicate ids', () => {
    const ids = BEY_REGISTRY.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every entry's design agrees with its own id", () => {
    // `anime.layerId` and `classic.layerId` are what the mesh builders look up
    // by, so an entry whose art points at a different bey would render the
    // wrong top under the right name.
    for (const b of BEY_REGISTRY) {
      expect(b.anime.layerId, `${b.id} anime`).toBe(b.id);
      if (b.classic) expect(b.classic.layerId, `${b.id} classic`).toBe(b.id);
    }
  });

  it('every entry can actually be drawn', () => {
    // The emblem is a function now rather than a name in a union, which is what
    // removed the compile-time blocker — but it also means a missing one is no
    // longer a type error. This is the replacement guarantee.
    for (const b of BEY_REGISTRY) {
      expect(typeof b.anime.emblem, `${b.id} emblem`).toBe('function');
      expect(b.anime.letter, `${b.id} letter`).toBeTruthy();
      expect(b.anime.blade, `${b.id} blade grammar`).toBeTruthy();
    }
  });

  it('every preset builds from parts that exist', () => {
    const discs = new Set(DISCS.map((d) => d.id));
    const drivers = new Set(DRIVERS.map((d) => d.id));
    const skins = new Set(SKINS.map((s) => s.id));
    for (const p of registryPresets()) {
      expect(discs.has(p.discId), `${p.name} disc ${p.discId}`).toBe(true);
      expect(drivers.has(p.driverId), `${p.name} driver ${p.driverId}`).toBe(true);
      expect(skins.has(p.skinId), `${p.name} skin ${p.skinId}`).toBe(true);
      expect(Math.abs(p.spinDir), `${p.name} spinDir`).toBe(1);
    }
  });

  it('every bey is reachable — starting roster or a ladder unlock', () => {
    // progress.test.ts already pins that the ladder distributes the whole
    // catalog exactly once. This is the same property stated from the
    // registry's side, so a bey added to the registry and forgotten on the
    // ladder fails HERE, next to the file you just wrote, rather than in a
    // progression test that does not mention beyblades.
    const reachable = new Set<string>(STARTING_UNLOCKS.layers);
    for (const rival of LADDER) for (const id of rival.unlocks.layers ?? []) reachable.add(id);
    for (const b of BEY_REGISTRY) {
      expect(reachable.has(b.id), `${b.id} is unobtainable`).toBe(true);
    }
  });

  it('the derived lists are projections, not copies', () => {
    // If these ever drift the registry has stopped being the source of truth,
    // which is the whole point of it.
    expect(registryDesigns().length).toBe(BEY_REGISTRY.length);
    expect(registryClassic().length).toBe(
      BEY_REGISTRY.filter((b) => b.classic).length,
    );
    expect(registryPresets().length).toBe(BEY_REGISTRY.filter((b) => b.preset).length);
  });
});
