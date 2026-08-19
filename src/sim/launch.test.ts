import { describe, expect, it } from 'vitest';
import { Battle } from './battle';
import type { Fighter } from './battle';
import { makeBuild } from './parts';
import { arenaById } from './arena';
import * as C from './constants';

/**
 * The launch minigame's green band.
 *
 * `perfectLaunch` shipped WRITTEN AND READ BY NOTHING. The bonus spin was
 * applied, the how-to-play screen told the player to aim for the band and
 * promised bonus spin, and hitting it felt identical to missing it — the one
 * input a player makes before the round starts had no response at all.
 *
 * It now drives an audio chime and an on-screen cue, so these tests exist to
 * stop the flag drifting away from the bonus it announces. A cue that fires
 * when no spin was granted would be worse than the silence it replaced.
 */

function launchAt(power: number): { perfect: boolean; spin: number } {
  const fighters: Fighter[] = [
    { id: 'p', name: 'P', build: makeBuild('valtryek', 'gravity', 'atomic'), spinDir: 1 },
    { id: 'a', name: 'A', build: makeBuild('spryzen', 'heavy', 'atomic'), spinDir: -1 },
  ];
  const b = new Battle(fighters, { seed: 11, arena: arenaById('standard') });
  b.startRound({
    p: { power, entryAngle: 0, entryDepth: 0.12 },
    a: { power: 0.8, entryAngle: Math.PI, entryDepth: 0.12 },
  });
  const me = b.beys.find((x) => x.id === 'p')!;
  return { perfect: me.perfectLaunch, spin: Math.abs(me.spin) };
}

describe('perfect launch', () => {
  it('is flagged inside the green band and not outside it', () => {
    expect(launchAt(C.PERFECT_LAUNCH_MIN - 0.02).perfect).toBe(false);
    expect(launchAt(C.PERFECT_LAUNCH_MIN).perfect).toBe(true);
    expect(launchAt((C.PERFECT_LAUNCH_MIN + C.PERFECT_LAUNCH_MAX) / 2).perfect).toBe(true);
    expect(launchAt(C.PERFECT_LAUNCH_MAX).perfect).toBe(true);
    expect(launchAt(C.PERFECT_LAUNCH_MAX + 0.02).perfect).toBe(false);
  });

  it('the flag always coincides with spin actually granted', () => {
    // The cue announces a specific number (+14% spin). If the flag could ever
    // be true without the bonus, the game would be lying at the exact moment it
    // claims to reward the player.
    const inside = launchAt(C.PERFECT_LAUNCH_MAX);
    // Just outside the top of the band: MORE power, but no bonus — so a
    // perfect launch at the band's ceiling must still out-spin it.
    const outside = launchAt(C.PERFECT_LAUNCH_MAX + 0.02);
    expect(inside.perfect).toBe(true);
    expect(outside.perfect).toBe(false);
    console.log(
      `  band ceiling ${inside.spin.toFixed(1)} spin (perfect) vs ` +
        `${outside.spin.toFixed(1)} at higher power (no bonus)`,
    );
    expect(inside.spin).toBeGreaterThan(outside.spin);
  });
});
