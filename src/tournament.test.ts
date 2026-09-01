import { beforeEach, describe, expect, it } from 'vitest';
import {
  CUP_PLAYER,
  CUP_PURSE,
  CUP_ROUNDS,
  CUP_SIZE,
  CUP_UNLOCK_RUNG,
  cupAvailable,
  cupBracket,
  cupFinished,
  cupInProgress,
  cupOpponent,
  cupSeedForDay,
  drawCup,
  entrantBuild,
  freshCup,
  mergeCup,
  recordCupMatch,
  startCup,
} from './tournament';
import { CUP_FIELD } from './tournament';
import { Progress } from './progress';
import { dayIndex } from './career';

/**
 * The daily cup.
 *
 * WHY IT IS TESTED AT ALL: this module arrived as 769 lines with no tests and
 * nothing importing it — a complete design that had never once been executed.
 * Everything below is the first time any of it has run.
 *
 * The properties chosen are the ones a bracket can get wrong SILENTLY. A cup
 * that crashes gets fixed; a cup that quietly puts the same opponent in two
 * slots, or pays its purse twice, or loses a half-played run on reload, just
 * feels off and nobody can say why.
 */

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

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;

describe('the draw', () => {
  it('is deterministic from its seed', () => {
    for (const seed of [1, 7, 12345]) {
      expect(drawCup(seed)).toEqual(drawCup(seed));
    }
  });

  it('fills the bracket without ever drawing the same entrant twice', () => {
    // The failure this catches is the one nobody would report as a bug: a
    // field with a duplicate still plays, it just quietly feels wrong.
    for (let seed = 0; seed < 200; seed++) {
      const field = drawCup(seed);
      expect(field.length, `seed ${seed}`).toBe(CUP_SIZE - 1);
      expect(new Set(field).size, `seed ${seed} drew a duplicate`).toBe(field.length);
      for (const id of field) {
        expect(
          CUP_FIELD.some((e) => e.id === id),
          `seed ${seed} drew an entrant that does not exist: ${id}`,
        ).toBe(true);
      }
    }
  });

  it('draws different fields for different days', () => {
    // A daily cup that deals the same eight every day is a fixture list.
    const fields = new Set<string>();
    for (let d = 0; d < 30; d++) fields.add(drawCup(cupSeedForDay(d)).join(','));
    expect(fields.size, 'thirty days produced too few distinct fields').toBeGreaterThan(20);
  });

  it('every entrant is actually buildable', () => {
    // The registry and the parts catalogue are joined by id. An entrant naming
    // a part that no longer exists would only surface when it was drawn.
    for (const e of CUP_FIELD) {
      expect(() => entrantBuild(e), e.id).not.toThrow();
    }
  });
});

describe('the bracket', () => {
  it('advances the player one round per win and ends on a loss', () => {
    const c = startCup(freshCup(), 42);
    expect(cupInProgress(c)).toBe(true);
    expect(cupFinished(c)).toBe(false);

    recordCupMatch(c, true, NOW);
    expect(c.wins).toBe(1);
    expect(cupFinished(c)).toBe(false);

    recordCupMatch(c, false, NOW);
    expect(c.out).toBe(true);
    expect(cupFinished(c), 'a loss must end the run immediately').toBe(true);
    expect(cupInProgress(c)).toBe(false);
  });

  it('names an opponent for every round of a winning run, and none after', () => {
    const c = startCup(freshCup(), 7);
    const seen: string[] = [];
    for (let r = 0; r < CUP_ROUNDS; r++) {
      const foe = cupOpponent(c);
      expect(foe, `round ${r} had no opponent`).not.toBeNull();
      seen.push(foe!.id);
      recordCupMatch(c, true, NOW);
    }
    expect(cupOpponent(c), 'a finished cup still offered an opponent').toBeNull();
    // You must not meet the same entrant twice on the way up.
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('puts the player in the bracket exactly once', () => {
    const c = startCup(freshCup(), 3);
    const slots = cupBracket(c)[0].flatMap((m) => [m.a, m.b]);
    expect(slots.filter((s) => s === CUP_PLAYER).length).toBe(1);
    expect(slots.length, 'first round is not a full eight').toBe(CUP_SIZE);
  });
});

describe('the purse', () => {
  it('pays for how far the run got, and pays it exactly once', () => {
    const c = startCup(freshCup(), 11);
    let total = 0;
    for (let r = 0; r < CUP_ROUNDS; r++) total += recordCupMatch(c, true, NOW).coins;
    expect(total, 'a won cup paid the wrong purse').toBe(CUP_PURSE[CUP_ROUNDS]);
    expect(c.won).toBe(1);

    // Every further call must be inert. `paid` is the only thing between a
    // finished cup and an endless coin tap.
    for (let i = 0; i < 5; i++) {
      expect(recordCupMatch(c, true, NOW).coins, 'the purse paid twice').toBe(0);
    }
  });

  it('pays a knocked-out run less than a won one', () => {
    const lost = startCup(freshCup(), 11);
    recordCupMatch(lost, true, NOW);
    const paid = recordCupMatch(lost, false, NOW).coins;
    expect(paid).toBe(CUP_PURSE[1]);
    expect(paid).toBeLessThan(CUP_PURSE[CUP_ROUNDS]);
  });
});

describe('availability', () => {
  it('stays locked until the ladder unlock rung', () => {
    expect(cupAvailable(freshCup(), CUP_UNLOCK_RUNG - 1, NOW)).toBe(false);
    expect(cupAvailable(freshCup(), CUP_UNLOCK_RUNG, NOW)).toBe(true);
  });

  it('allows one run a day, and a new one tomorrow', () => {
    const c = startCup(freshCup(), 5);
    for (let r = 0; r < CUP_ROUNDS; r++) recordCupMatch(c, true, NOW);
    expect(c.lastDay).toBe(dayIndex(NOW));
    expect(cupAvailable(c, 9, NOW), 'a second cup was allowed on the same day').toBe(false);
    expect(cupAvailable(c, 9, NOW + DAY), 'tomorrow was refused').toBe(true);
  });

  it('keeps a half-played run playable but refuses to redraw over it', () => {
    // `cupAvailable` means "is the cup playable", and it is deliberately true
    // mid-run so a bracket can be resumed — the day is stamped when a run
    // FINISHES precisely so an unfinished one is never eaten at midnight.
    //
    // But `startCup` redraws unconditionally, so the guard against destroying a
    // live bracket has to live at the caller. This is the test that found that:
    // it was written expecting `cupAvailable` to be false and the failure was
    // the useful half — the predicate was right and `Progress.enterCup` was
    // gating a NEW DRAW on a PLAYABLE check.
    const c = startCup(freshCup(), 5);
    recordCupMatch(c, true, NOW);
    expect(cupInProgress(c)).toBe(true);
    expect(cupAvailable(c, 9, NOW), 'a live run must stay playable').toBe(true);
  });
});

describe('save compatibility', () => {
  beforeEach(installStorage);

  it('accepts a save that predates the cup entirely', () => {
    expect(() => mergeCup(undefined)).not.toThrow();
    expect(mergeCup(undefined)).toEqual(freshCup());
    expect(mergeCup(null)).toEqual(freshCup());
    expect(mergeCup('nonsense')).toEqual(freshCup());
    expect(mergeCup({ field: 'not an array' })).toEqual(freshCup());
  });

  it('resumes a half-played bracket across a reload', () => {
    const p = new Progress();
    p.data.rung = CUP_UNLOCK_RUNG;
    p.enterCup(NOW);
    expect(p.cupRunning).toBe(true);
    const foe = p.cupOpponent();
    expect(foe).not.toBeNull();
    p.recordCup(true, NOW);
    const midField = [...p.data.cup.field];
    const midWins = p.data.cup.wins;

    // Entering again mid-run must be inert, not a redraw. A player who taps
    // the button twice must not lose the bracket they are two matches into.
    p.enterCup(NOW);
    expect(p.data.cup.field, 'a live bracket was redrawn').toEqual(midField);
    expect(p.data.cup.wins, 'a live run was reset').toBe(midWins);
    expect(p.data.cup.entered, 'a redraw was counted as a second entry').toBe(1);

    // Same storage, new instance — exactly what a reload is.
    const again = new Progress();
    expect(again.data.cup.field).toEqual(midField);
    expect(again.data.cup.wins).toBe(midWins);
    expect(again.cupRunning, 'a live run did not survive the reload').toBe(true);
  });

  it('drops a saved bracket naming an entrant that no longer exists', () => {
    // The bracket stores ids, and the catalogue moves. A run that cannot be
    // played must be discarded rather than resumed into a crash.
    const broken = { ...freshCup(), field: ['not-a-real-entrant'], wins: 1 };
    expect(cupInProgress(mergeCup(broken)), 'a broken bracket was resumed').toBe(false);
  });
});
