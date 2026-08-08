import { describe, expect, it } from 'vitest';
import { Battle } from './battle';
import type { Fighter } from './battle';
import * as C from './constants';
import { makeRng } from './math';
import { makeBuild } from './parts';
import type { LaunchParams, MoveKind } from './types';

/**
 * The move triangle is meant to be a *consequence* of the physical modifiers in
 * MOVES, not a special-cased lookup. That claim is only worth making if it can
 * be measured, so this pits fixed strategies against each other with identical
 * builds on both sides — any difference in outcome is down to the moves alone.
 */

/** Plays one top on a fixed strategy: use `move` whenever it can afford it. */
function playStrategy(
  aMove: MoveKind,
  bMove: MoveKind,
  seed: number,
  opposite: boolean,
): 'a' | 'b' | null {
  const rng = makeRng(seed);
  // Identical balanced builds, so the only variable is the move choice.
  const build = () => makeBuild('spryzen', 'gravity', 'atomic');
  const fighters: Fighter[] = [
    { id: 'a', name: 'A', build: build(), spinDir: 1 },
    { id: 'b', name: 'B', build: build(), spinDir: opposite ? -1 : 1 },
  ];
  const battle = new Battle(fighters, { seed, pointsToWin: 999 });

  const base = rng() * Math.PI * 2;
  const mk = (angle: number): LaunchParams => ({
    power: 0.7 + rng() * 0.25,
    entryAngle: angle,
    entryDepth: rng() * 0.15,
  });
  battle.startRound({ a: mk(base), b: mk(base + Math.PI) });

  // Commit to the move when an exchange is imminent, which is the situation
  // these moves exist for. Spamming them blindly instead measures which is best
  // to hold permanently — a different and much less interesting question.
  const ENGAGE = 0.5;
  while (battle.phase === 'battle') {
    battle.update(1 / 60);
    const [x, y] = battle.beys;
    const near = Math.hypot(x.pos.x - y.pos.x, x.pos.y - y.pos.y) < ENGAGE;
    if (near) {
      battle.activateMove('a', aMove);
      battle.activateMove('b', bMove);
    }
  }
  const w = battle.lastRound?.winnerId;
  return w === 'a' ? 'a' : w === 'b' ? 'b' : null;
}

/** Win rate for `aMove` against `bMove` over a spread of seeds. */
function winRate(aMove: MoveKind, bMove: MoveKind): number {
  let wins = 0;
  let games = 0;
  for (let s = 0; s < 120; s++) {
    const r = playStrategy(aMove, bMove, s * 613 + 11, s % 2 === 0);
    if (r) {
      games += 1;
      if (r === 'a') wins += 1;
    }
    // Play the mirror so neither side benefits from launching first.
    const r2 = playStrategy(bMove, aMove, s * 613 + 11, s % 2 === 0);
    if (r2) {
      games += 1;
      if (r2 === 'b') wins += 1;
    }
  }
  return games ? wins / games : 0.5;
}

describe('move triangle', () => {
  it('charge beats slip, anchor beats charge, slip beats anchor', () => {
    const chargeVsSlip = winRate('charge', 'slip');
    const anchorVsCharge = winRate('anchor', 'charge');
    const slipVsAnchor = winRate('slip', 'anchor');

    console.log('\n=== move matchups (win rate for the first move) ===');
    console.log(`  charge vs slip   ${(chargeVsSlip * 100).toFixed(1)}%`);
    console.log(`  anchor vs charge ${(anchorVsCharge * 100).toFixed(1)}%`);
    console.log(`  slip   vs anchor ${(slipVsAnchor * 100).toFixed(1)}%`);

    // Each leg of the triangle must favour the counter. The margin is
    // deliberately loose: a hard counter would make the read the whole game.
    expect(chargeVsSlip).toBeGreaterThan(0.5);
    expect(anchorVsCharge).toBeGreaterThan(0.5);
    expect(slipVsAnchor).toBeGreaterThan(0.5);
  });

  it('keeps every move costed and time-limited', () => {
    for (const kind of ['charge', 'anchor', 'slip'] as MoveKind[]) {
      const m = C.MOVES[kind];
      expect(m.cost).toBeGreaterThan(0);
      expect(m.cost).toBeLessThanOrEqual(1);
      expect(m.duration).toBeGreaterThan(0);
    }
  });

  it('refuses a move that cannot be afforded', () => {
    const build = () => makeBuild('spryzen', 'gravity', 'atomic');
    const fighters: Fighter[] = [
      { id: 'a', name: 'A', build: build(), spinDir: 1 },
      { id: 'b', name: 'B', build: build(), spinDir: -1 },
    ];
    const battle = new Battle(fighters, { seed: 3, pointsToWin: 999 });
    battle.startRound({});

    // Meter starts empty, so nothing is affordable on the first frame.
    expect(battle.activateMove('a', 'charge')).toBe(false);

    const a = battle.beys[0];
    a.meter = 1;
    expect(battle.activateMove('a', 'charge')).toBe(true);
    expect(a.meter).toBeCloseTo(0, 5);
    // Already committed: a second move can't interrupt the first.
    a.meter = 1;
    expect(battle.activateMove('a', 'slip')).toBe(false);
  });
});
