import { beforeEach, describe, expect, it } from 'vitest';
import { Progress } from './progress';
import { applyUnlockAll, unlockMode } from './devUnlock';
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

const KEY = 'beyblade-arena.progress.v1';

/** A career part-way up the ladder, which is what must survive the flag. */
function seedCareer(): void {
  localStorage.setItem(
    KEY,
    JSON.stringify({
      rung: 2,
      layers: ['valtryek', 'spryzen'],
      discs: ['gravity'],
      drivers: ['atomic'],
      skins: ['frost'],
      wins: 2,
      losses: 3,
      bestStreak: 2,
      streak: 0,
      coins: 195,
      offer: [],
      endless: 0,
      bestEndless: 0,
    }),
  );
}

beforeEach(() => {
  installStorage();
  seedCareer();
});

describe('unlockMode', () => {
  it('reads the spellings a person would actually type', () => {
    expect(unlockMode('')).toBe('off');
    expect(unlockMode('?something=else')).toBe('off');
    expect(unlockMode('?unlock')).toBe('session');
    expect(unlockMode('?unlock=all')).toBe('session');
    expect(unlockMode('?unlock=1')).toBe('session');
    expect(unlockMode('?unlock=persist')).toBe('persist');
    expect(unlockMode('?unlock=save')).toBe('persist');
  });

  it('treats an unrecognised value as off rather than as a grant', () => {
    // Failing open here would mean a typo silently clears somebody's ladder.
    expect(unlockMode('?unlock=yes-please')).toBe('off');
  });
});

describe('applyUnlockAll', () => {
  it('grants the whole catalog and leaves the ladder alone', () => {
    const p = new Progress();
    expect(applyUnlockAll(p, 'session')).toBe(true);

    expect(p.data.layers).toHaveLength(LAYERS.length);
    expect(p.data.discs).toHaveLength(DISCS.length);
    expect(p.data.drivers).toHaveLength(DRIVERS.length);
    expect(p.data.skins).toHaveLength(SKINS.length);
    // `rung` decides WHO YOU FIGHT, not what you own. An earlier version
    // cleared it and silently dropped the tester into endless mode against
    // escalating rivals — rounds ended in a burst inside a second, which looks
    // like a broken game rather than a much better opponent.
    expect(p.data.rung).toBe(2);
  });

  it('does nothing at all when off', () => {
    const p = new Progress();
    expect(applyUnlockAll(p, 'off')).toBe(false);
    expect(p.data.rung).toBe(2);
    expect(p.data.layers.length).toBeLessThan(LAYERS.length);
  });

  /**
   * The regression this file mostly exists for.
   *
   * The first version of the session mode simply declined to call `save()`,
   * which looked airtight and was not: the shop rolls its offer lazily on first
   * read and saves, so opening the garage wrote the granted roster to disk.
   * Reloading without the flag showed a cleared ladder and the full roster —
   * the exact outcome the mode was designed to prevent. The guard now lives on
   * `Progress.ephemeral`, so ANY save path is caught, not just the ones that
   * were remembered.
   */
  it('session mode survives an unrelated save call', () => {
    const p = new Progress();
    applyUnlockAll(p, 'session');

    // Stand-in for the shop, the match result, or anything else that persists
    // as a side effect of normal play.
    p.save();
    p.grant('layers', 'nosferu');
    p.save();

    const onDisk = JSON.parse(localStorage.getItem(KEY) as string) as {
      rung: number;
      layers: string[];
      coins: number;
    };
    expect(onDisk.rung).toBe(2);
    expect(onDisk.layers).toEqual(['valtryek', 'spryzen']);
    expect(onDisk.coins).toBe(195);
  });

  it('persist mode writes the grant through', () => {
    const p = new Progress();
    applyUnlockAll(p, 'persist');

    const onDisk = JSON.parse(localStorage.getItem(KEY) as string) as {
      rung: number;
      layers: string[];
    };
    expect(onDisk.rung).toBe(2);
    expect(onDisk.layers).toHaveLength(LAYERS.length);
  });

  it('leaves persist mode able to save afterwards', () => {
    // `ephemeral` is set on every apply, so the persist path must clear it
    // rather than inherit a stale true from an earlier call.
    const p = new Progress();
    applyUnlockAll(p, 'persist');
    expect(p.ephemeral).toBe(false);
  });
});
