import { describe, expect, it } from 'vitest';
import { Battle } from './battle';
import type { Fighter } from './battle';
import { AiController } from '../ai';
import { PRESETS } from './parts';
import { ARENAS } from './arena';
import { makeRng } from './math';

interface Round {
  adjacent: number;
  frames: number;
  seconds: number;
  hits: number;
}

function playRound(arenaId: string, ai: number, bi: number, seed: number): Round {
  const rng = makeRng(seed);
  const aiA = new AiController('a', 'champion', makeRng(seed * 3 + 1));
  const aiB = new AiController('b', 'champion', makeRng(seed * 7 + 2));
  const fighters: Fighter[] = [
    { id: 'a', name: 'A', build: PRESETS[ai].build(), spinDir: 1 },
    { id: 'b', name: 'B', build: PRESETS[bi].build(), spinDir: seed % 2 ? -1 : 1 },
  ];
  const arena = ARENAS.find((x) => x.id === arenaId)!;
  const b = new Battle(fighters, { seed, arena, pointsToWin: 999 });
  const ang = rng() * Math.PI * 2;
  b.startRound({
    a: aiA.chooseLaunch(fighters[0].build, ang),
    b: aiB.chooseLaunch(fighters[1].build, ang),
  });
  let adjacent = 0;
  let frames = 0;
  let hits = 0;
  let t = 0;
  let guard = 0;
  while (b.phase === 'battle' && guard++ < 60 * 90) {
    aiA.update(b, 1 / 60);
    aiB.update(b, 1 / 60);
    b.update(1 / 60);
    t += 1 / 60;
    hits += b.hits.length;
    const [x, y] = b.beys;
    if (x.alive && y.alive) {
      frames++;
      const d = Math.hypot(x.pos.x - y.pos.x, x.pos.y - y.pos.y);
      if (d < 2.2 * (x.stats.radius + y.stats.radius)) adjacent++;
    }
  }
  return { adjacent, frames, seconds: t, hits };
}

function measure(arenaId: string, rounds = 90): { adj: number; secs: number; hits: number } {
  let adjacent = 0;
  let frames = 0;
  let secs = 0;
  let hits = 0;
  for (let s = 0; s < rounds; s++) {
    const i = s % PRESETS.length;
    const k = (s * 3 + 1) % PRESETS.length;
    const r = playRound(arenaId, i, k === i ? (k + 1) % PRESETS.length : k, s * 7919 + 13);
    adjacent += r.adjacent;
    frames += r.frames;
    secs += r.seconds;
    hits += r.hits;
  }
  return { adj: adjacent / frames, secs: secs / rounds, hits: hits / rounds };
}

describe('probe', () => {
  it('baseline adjacency', () => {
    for (const a of ARENAS) {
      const m = measure(a.id);
      console.log(
        `  ${a.id.padEnd(12)} adjacency ${(m.adj * 100).toFixed(1)}%  round ${m.secs.toFixed(1)}s  hits ${m.hits.toFixed(1)}`,
      );
    }
    expect(true).toBe(true);
  });
});
