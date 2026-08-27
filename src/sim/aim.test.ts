import { describe, expect, it } from 'vitest';
import { Battle } from './battle';
import type { Fighter } from './battle';
import { STANDARD } from './arena';
import * as C from './constants';
import { makeBuild } from './parts';
import type { LaunchParams } from './types';

/**
 * Aimed Charge.
 *
 * The player points, and the strike goes where they pointed. This file holds
 * the properties that make that a control rather than a suggestion:
 *
 *   1. an aim is OBEYED — the heading ends up on the aim, not on the opponent
 *   2. no aim is UNCHANGED — the AI, and a player who never touches the
 *      pointer, get the old homing exactly, so this is purely additive
 *   3. the assist BENDS and does not SNAP — an aim well outside the cone is
 *      left alone, which is what keeps a deliberate feint possible
 *   4. physics still wins — an aim the top cannot physically take is
 *      approached, not teleported to
 *
 * Property 3 is the one worth guarding hardest. The obvious way to make aiming
 * feel good is to widen the assist until every aim lands, and at that point the
 * aim is decorative and the game is back to homing with extra steps.
 *
 * MEASURED, and the reason property 4 is stated separately. Over a 0.25s charge
 * from a top orbiting at radius 0.5, across eight aim directions:
 *
 *     aim   -3.14  -2.36  -1.57  -0.79   0.00   0.79   1.57   2.36
 *     error  0.00   0.00   1.24   0.61   0.04   0.00   0.00   0.00
 *
 * Six of eight land on the aim to within a rounding error. The two that do not
 * are the ones pointing back through the top's own momentum — -1.57 is an exact
 * reversal of the launch heading — and they fall short because a spinning top
 * has a finite turn rate and the bowl is pushing back. That is not a bug to
 * tune out. A charge you can reverse mid-flight is a cursor, not a beyblade.
 */

/** The charge window these measurements use, in frames at 60Hz. */
const FRAMES = 15;

/** The heading a top is placed on: orbiting anticlockwise at radius 0.5. */
const START = Math.PI / 2;

/** Bearing from the charger to the parked opponent. */
const FOE_BEARING = 0;

/**
 * Run one charge and report the heading it ends on, in radians.
 *
 * The top is placed on a balanced orbit rather than at the centre. That detail
 * cost a first draft of this file: launched from the middle with radial speed,
 * the bowl stalls the top and throws it back, so every heading measured was the
 * BOWL's answer and not the aim's. On a tangential orbit the bowl is in
 * equilibrium and the only thing steering is the move.
 */
function chargeHeading(aim: { x: number; y: number } | undefined): number {
  const fighters: Fighter[] = [
    { id: 'a', name: 'A', build: makeBuild('valtryek', 'heavy', 'xtreme'), spinDir: 1 },
    { id: 'b', name: 'B', build: makeBuild('spryzen', 'gravity', 'atomic'), spinDir: -1 },
  ];
  const battle = new Battle(fighters, { seed: 7, pointsToWin: 999, arena: STANDARD });
  const mk = (angle: number): LaunchParams => ({ power: 0.85, entryAngle: angle, entryDepth: 0.1 });
  battle.startRound({ a: mk(0), b: mk(Math.PI) });

  const a = battle.beys[0];
  const b = battle.beys[1];
  a.pos.x = -0.5;
  a.pos.y = 0;
  a.vel.x = 0;
  a.vel.y = 1.2;
  // Parked opposite, so "at the opponent" is +x — a full right angle away from
  // the orbit heading, which is what lets an obeyed aim be told apart from a
  // homing one.
  b.pos.x = 0.5;
  b.pos.y = 0;
  b.vel.x = 0;
  b.vel.y = 0;

  // Meter starts empty and Charge costs all of it. Without this the move never
  // activates and every assertion below silently measures launch drift.
  a.meter = 1;
  if (!battle.activateMove('a', 'charge', aim)) throw new Error('charge did not activate');

  for (let i = 0; i < FRAMES; i++) battle.update(1 / 60);
  return Math.atan2(a.vel.y, a.vel.x);
}

/** Signed difference between two angles, wrapped to [-pi, pi]. */
function angleGap(x: number, y: number): number {
  let d = (x - y) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

const at = (theta: number): { x: number; y: number } => ({
  x: Math.cos(theta),
  y: Math.sin(theta),
});

describe('aimed charge', () => {
  it('goes where it is aimed, across the directions a top can take', () => {
    // Every direction except the two that fight the top's own momentum. Those
    // get their own test below, because "approached but not reached" is a
    // different and equally deliberate property.
    for (const theta of [-Math.PI, -2.36, 0, 0.79, START, 2.36]) {
      const h = chargeHeading(at(theta));
      expect(Math.abs(angleGap(h, theta)), `aim ${theta.toFixed(2)}`).toBeLessThan(0.15);
    }
  });

  it('obeys the aim rather than the opponent', () => {
    // Aimed at -x: directly AWAY from the opponent, who sits at +x. Homing
    // could never produce this heading, so it isolates the aim completely.
    const away = chargeHeading(at(Math.PI));
    expect(Math.abs(angleGap(away, FOE_BEARING))).toBeGreaterThan(2.5);
  });

  it('with no aim, still homes at the opponent exactly as before', () => {
    // The additive guarantee. The AI passes no aim and must play the game that
    // every balance number in this repo was measured against.
    const homed = chargeHeading(undefined);
    expect(Math.abs(angleGap(homed, FOE_BEARING))).toBeLessThan(0.2);
  });

  it('approaches an impossible aim instead of snapping to it', () => {
    // An exact reversal of the top's heading. It cannot be taken in a quarter
    // of a second — but it must still make real progress, or the control would
    // feel dead in exactly the moment a player most wants it.
    const reversal = -START;
    const h = chargeHeading(at(reversal));
    const before = Math.abs(angleGap(START, reversal));
    const after = Math.abs(angleGap(h, reversal));
    expect(after).toBeLessThan(before);
    // And not most of the way, either — this is the physics showing through.
    expect(after).toBeGreaterThan(0.5);
  });

  it('the assist bends a near-miss toward the intercept', () => {
    const off = C.AIM_ASSIST_CONE * 0.7;
    const bent = chargeHeading(at(off));
    const raw = chargeHeading(at(off * 3));
    expect(Math.abs(angleGap(bent, FOE_BEARING))).toBeLessThan(
      Math.abs(angleGap(raw, FOE_BEARING)),
    );
  });

  it('leaves an aim outside the cone alone, so a feint stays possible', () => {
    const wide = C.AIM_ASSIST_CONE + 0.9;
    const feint = chargeHeading(at(wide));
    expect(Math.abs(angleGap(feint, FOE_BEARING))).toBeGreaterThan(C.AIM_ASSIST_CONE);
  });

  it('normalises whatever vector it is handed', () => {
    // The UI computes the aim from a pointer position, so it arrives at an
    // arbitrary length. The sim must not trust a caller's vector.
    const fighters: Fighter[] = [
      { id: 'a', name: 'A', build: makeBuild('valtryek', 'heavy', 'xtreme'), spinDir: 1 },
      { id: 'b', name: 'B', build: makeBuild('spryzen', 'gravity', 'atomic'), spinDir: -1 },
    ];
    const battle = new Battle(fighters, { seed: 7, pointsToWin: 999, arena: STANDARD });
    const mk = (angle: number): LaunchParams => ({
      power: 0.85,
      entryAngle: angle,
      entryDepth: 0.1,
    });
    battle.startRound({ a: mk(0), b: mk(Math.PI) });
    const a = battle.beys[0];
    a.meter = 1;
    expect(battle.activateMove('a', 'charge', { x: 300, y: -400 })).toBe(true);
    expect(Math.hypot(a.aimX, a.aimY)).toBeCloseTo(1, 6);
    expect(a.aimX).toBeCloseTo(0.6, 6);
    expect(a.aimY).toBeCloseTo(-0.8, 6);

    // And a zero-length aim is "no aim", not a direction.
    const other = new Battle(fighters, { seed: 7, pointsToWin: 999, arena: STANDARD });
    other.startRound({ a: mk(0), b: mk(Math.PI) });
    const c = other.beys[0];
    c.meter = 1;
    expect(other.activateMove('a', 'charge', { x: 0, y: 0 })).toBe(true);
    expect(c.aimX).toBe(0);
    expect(c.aimY).toBe(0);
  });
});
