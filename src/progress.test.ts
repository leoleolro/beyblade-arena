import { beforeEach, describe, expect, it } from 'vitest';
import { LADDER, STARTING_UNLOCKS } from './ladder';
import { Progress } from './progress';
import { DISCS, DRIVERS, LAYERS } from './sim/parts';
import { SKINS } from './render/skins';

/** Minimal in-memory localStorage, so these run headlessly. */
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

describe('ladder', () => {
  it('unlocks the entire catalog exactly once across the ladder', () => {
    const seen = {
      layers: new Set(STARTING_UNLOCKS.layers),
      discs: new Set(STARTING_UNLOCKS.discs),
      drivers: new Set(STARTING_UNLOCKS.drivers),
      skins: new Set(STARTING_UNLOCKS.skins),
    };

    for (const rival of LADDER) {
      for (const kind of ['layers', 'discs', 'drivers', 'skins'] as const) {
        for (const id of rival.unlocks[kind] ?? []) {
          // A part handed out twice is a wasted reward — the player opens the
          // garage expecting something new and finds nothing changed.
          expect(seen[kind].has(id)).toBe(false);
          seen[kind].add(id);
        }
      }
    }

    // Clearing the ladder should leave nothing locked, or the tail of the
    // catalog is unreachable content.
    expect([...seen.layers].sort()).toEqual(LAYERS.map((p) => p.id).sort());
    expect([...seen.discs].sort()).toEqual(DISCS.map((p) => p.id).sort());
    expect([...seen.drivers].sort()).toEqual(DRIVERS.map((p) => p.id).sort());
    expect([...seen.skins].sort()).toEqual(SKINS.map((s) => s.id).sort());
  });

  it('starts the player with a usable build in every slot', () => {
    expect(STARTING_UNLOCKS.layers.length).toBeGreaterThanOrEqual(2);
    expect(STARTING_UNLOCKS.discs.length).toBeGreaterThanOrEqual(2);
    expect(STARTING_UNLOCKS.drivers.length).toBeGreaterThanOrEqual(2);
  });

  it('escalates difficulty and never goes backwards', () => {
    const rank = { rookie: 0, blader: 1, champion: 2 };
    let last = -1;
    for (const r of LADDER) {
      const cur = rank[r.difficulty];
      expect(cur).toBeGreaterThanOrEqual(last);
      last = cur;
    }
  });
});

describe('progress', () => {
  beforeEach(() => {
    installStorage();
    localStorage.clear();
  });

  it('advances one rung per win and awards that rung’s unlocks', () => {
    const p = new Progress();
    expect(p.data.rung).toBe(0);

    const gained = p.recordMatch(true);
    expect(p.data.rung).toBe(1);
    expect(p.data.wins).toBe(1);
    for (const id of LADDER[0].unlocks.layers ?? []) {
      expect(p.has('layers', id)).toBe(true);
      expect(gained.layers).toContain(id);
    }
  });

  it('does not advance or unlock on a loss', () => {
    const p = new Progress();
    const gained = p.recordMatch(false);
    expect(p.data.rung).toBe(0);
    expect(p.data.losses).toBe(1);
    expect(Object.keys(gained)).toHaveLength(0);
  });

  it('cannot farm unlocks by replaying a cleared ladder', () => {
    const p = new Progress();
    for (let i = 0; i < LADDER.length; i++) p.recordMatch(true);
    expect(p.cleared).toBe(true);

    const before = p.data.layers.length + p.data.skins.length;
    const gained = p.recordMatch(true);
    expect(Object.keys(gained)).toHaveLength(0);
    expect(p.data.layers.length + p.data.skins.length).toBe(before);
    // Wins still count, so replaying for practice is still recorded.
    expect(p.data.wins).toBe(LADDER.length + 1);
  });

  it('tracks streaks and resets them on a loss', () => {
    const p = new Progress();
    p.recordMatch(true);
    p.recordMatch(true);
    expect(p.data.streak).toBe(2);
    expect(p.data.bestStreak).toBe(2);
    p.recordMatch(false);
    expect(p.data.streak).toBe(0);
    expect(p.data.bestStreak).toBe(2);
  });

  it('survives a reload, and a corrupt save falls back to a fresh one', () => {
    const p = new Progress();
    p.recordMatch(true);
    expect(new Progress().data.rung).toBe(1);

    localStorage.setItem('beyblade-arena.progress.v1', '{ not json');
    const recovered = new Progress();
    expect(recovered.data.rung).toBe(0);
    expect(recovered.data.layers.length).toBeGreaterThan(0);
  });
});
