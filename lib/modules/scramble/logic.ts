import type { Rng } from '../../maze/rng';
import { scrambleMaze } from '../../maze/scramble';
import type { Maze } from '../../maze/types';
import type { MazeBlock } from '../../maze/world';
import type { ScrambleConfig } from './types';

/** How long the UI "tell" (flash/pulse) should show after a scramble or false alarm. */
export const SCRAMBLE_FLASH_MS = 600;

export function scheduleNextScramble(config: ScrambleConfig, rng: Rng, now: number): number {
  const { minIntervalSec, maxIntervalSec } = config;
  const span = maxIntervalSec - minIntervalSec;
  return now + (minIntervalSec + rng() * span) * 1000;
}

export type ScrambleTickResult =
  | { type: 'idle' }
  | { type: 'notDue' }
  | { type: 'falseAlarm'; nextScrambleAt: number; flashUntil: number }
  | { type: 'scrambled'; maze: Maze; nextScrambleAt: number; flashUntil: number };

/**
 * Pure decision function for "should the current block scramble right now, and if so how" — the
 * store just calls this and applies whatever it returns. Keeps the scramble *rules* (timing,
 * false-alarm odds, intensity) in one place, separate from state orchestration.
 */
export function tickScramble(params: {
  config: ScrambleConfig;
  block: MazeBlock;
  rng: Rng;
  now: number;
  nextScrambleAt: number | null;
}): ScrambleTickResult {
  const { config, block, rng, now, nextScrambleAt } = params;
  if (!config.enabled || nextScrambleAt === null) return { type: 'idle' };
  if (now < nextScrambleAt) return { type: 'notDue' };

  const isFalseAlarm = rng() < config.falseAlarmChance;
  if (isFalseAlarm) {
    return {
      type: 'falseAlarm',
      nextScrambleAt: scheduleNextScramble(config, rng, now),
      flashUntil: now + SCRAMBLE_FLASH_MS,
    };
  }

  const intensity = Math.round(block.maze.activeCells.size * config.intensityRatio);
  const { maze } = scrambleMaze(block.maze, rng, intensity);
  return {
    type: 'scrambled',
    maze,
    nextScrambleAt: scheduleNextScramble(config, rng, now),
    flashUntil: now + SCRAMBLE_FLASH_MS,
  };
}
