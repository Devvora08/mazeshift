import { edgeKey } from '../../maze/graph';
import type { Rng } from '../../maze/rng';
import { eligibleEdgeCount, scrambleMaze } from '../../maze/scramble';
import type { MazeWorld } from '../../maze/world';
import type { Travel } from '../monsters/types';
import type { ScrambleConfig } from './types';

export const SCRAMBLE_FLASH_MS = 1050;
export function scheduleNextScramble(config: ScrambleConfig, rng: Rng, now: number): number {
  return now + (config.minIntervalSec + rng() * (config.maxIntervalSec - config.minIntervalSec)) * 1000;
}

export function scrambleWorld(world: MazeWorld, rng: Rng, ratio: number, travels: (Travel | null)[] = []): MazeWorld {
  const blocks = world.blocks.map(block => {
    const reserved = new Set<string>();
    for (const travel of travels) if (travel?.from.blockId === block.id && travel.to.blockId === block.id) {
      const key = edgeKey(travel.from.cell, travel.to.cell);
      if (block.maze.openEdges.has(key)) reserved.add(key);
    }
    const count = Math.round(eligibleEdgeCount(block.maze, reserved) * ratio);
    const result = scrambleMaze(block.maze, rng, count, reserved);
    return result.maze === block.maze ? block : { ...block, maze: result.maze };
  });
  return { ...world, blocks };
}

export type ScrambleTickResult =
  | { type: 'idle' }
  | { type: 'notDue' }
  | { type: 'falseAlarm'; nextScrambleAt: number; flashUntil: number }
  | { type: 'scrambled'; world: MazeWorld; nextScrambleAt: number; flashUntil: number };

/** One countdown governs the entire level, including unvisited blocks. */
export function tickScramble(params: {
  config: ScrambleConfig; world: MazeWorld; rng: Rng; now: number;
  nextScrambleAt: number | null; travels?: (Travel | null)[];
}): ScrambleTickResult {
  const { config, world, rng, now, nextScrambleAt, travels } = params;
  if (!config.enabled || nextScrambleAt === null) return { type: 'idle' };
  if (now < nextScrambleAt) return { type: 'notDue' };
  const timing = { nextScrambleAt: scheduleNextScramble(config, rng, now), flashUntil: now + SCRAMBLE_FLASH_MS };
  if (config.falseAlarmChance > 0 && rng() < config.falseAlarmChance) return { type: 'falseAlarm', ...timing };
  return { type: 'scrambled', world: scrambleWorld(world, rng, config.intensityRatio, travels), ...timing };
}
