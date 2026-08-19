import { defineConfig } from 'vite';

/**
 * Build config, added when the game became something to publish rather than
 * something to run locally.
 *
 * `base` is the one setting that is not optional. GitHub Pages serves a project
 * site from `/<repo>/`, not from the domain root, so a build made with the
 * default base emits absolute `/assets/...` URLs that 404 in production while
 * working perfectly in `vite dev` — the classic "it worked locally" deploy
 * failure. It is read from an env var rather than hardcoded so the same repo
 * can also be served from a root domain (`BASE=/`) without editing this file.
 */
export default defineConfig(({ command }) => ({
  // Build only. Applying it to `vite dev` too would move the dev server off
  // localhost root and quietly break every local link and bookmark for the
  // sake of a setting that only matters in production.
  base: command === 'build' ? (process.env.BASE ?? '/beyblade-arena/') : '/',
  build: {
    // The bundle is ~745 kB raw / ~198 kB gzipped and is almost entirely three.
    // That is a known, accepted cost — the default 500 kB warning fires on
    // every build and trains everyone to ignore build output, which is worse
    // than the number it is warning about. Raised to just above the real size
    // so it still fires if something unexpected lands.
    chunkSizeWarningLimit: 800,
  },
  test: {
    // The balance sweeps genuinely take seconds. vitest's 5s default reports
    // them as failures under load — HEAD itself "fails" four tests on a busy
    // machine — which is a false signal that has cost real debugging time.
    testTimeout: 120_000,
  },
}));
