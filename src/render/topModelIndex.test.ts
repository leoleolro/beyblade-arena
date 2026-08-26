import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
import { TOP_MODELS, topModelFor } from './topModelIndex';
import { LAYERS } from '../sim/parts';

/**
 * The registration step is one line per bey, which is exactly why it needs a
 * test: a typo in a layer id fails silently. The bey keeps its procedural mesh,
 * nothing throws, nothing logs, and the model simply never appears — which
 * reads as "the import is broken" rather than "the key is wrong".
 */
describe('top model index', () => {
  it('keys every entry to a layer that exists', () => {
    const ids = new Set(LAYERS.map((l) => l.id));
    for (const key of Object.keys(TOP_MODELS)) {
      expect(ids.has(key), `TOP_MODELS key "${key}" is not a layer id`).toBe(true);
    }
  });

  it('points every entry at a format the loader handles', () => {
    // Kept in sync with `formatOf` in topModels.ts by hand, deliberately: a
    // model whose extension the loader does not recognise is treated as GLB and
    // fails at parse time with a message about JSON, which is a long way from
    // the actual mistake.
    for (const [key, entry] of Object.entries(TOP_MODELS)) {
      expect(
        /\.(glb|gltf|stl|obj)$/.test(entry.url),
        `${key} -> ${entry.url} is not a supported extension`,
      ).toBe(true);
    }
  });

  it('resolves a registered bey and declines an unregistered one', () => {
    expect(topModelFor('valtryek')).toBeDefined();
    expect(topModelFor('nosferu')).toBeDefined();
    expect(topModelFor('crossx')).toBeUndefined();
  });

  it('points every entry at a file that is actually on disk', () => {
    // This used to assert folder NAMES, which pinned an incidental detail and
    // duly broke the moment the models directory was tidied — while saying
    // nothing about whether the files were still there.
    //
    // The real invariant is that a registered model resolves. A missing file
    // does not throw at build time and does not throw at load either: the
    // loader returns null, the bey silently keeps its procedural mesh, and the
    // only symptom is a Legendary top that looks Epic.
    for (const [key, entry] of Object.entries(TOP_MODELS)) {
      const path = resolve(__dirname, '../../public', entry.url);
      expect(existsSync(path), `${key} -> public/${entry.url} does not exist`).toBe(true);
    }
  });

  it('gives Gemstone its own materials and Valtryek the silver finish', () => {
    // Not a style preference — Gemstone's blacks are its panel lines and
    // Valtryek's only authored colour does not survive the loader at all.
    expect(TOP_MODELS.nosferu.finish).toBe('own');
    expect(TOP_MODELS.valtryek.finish).toBe('silver');
  });
});
