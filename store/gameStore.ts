import { create } from 'zustand';

import { getLevel } from '../lib/levels/data';
import type { LevelConfig } from '../lib/levels/types';
import { generateMaze } from '../lib/maze/generate';
import { createRng, type Rng } from '../lib/maze/rng';
import { scrambleMaze } from '../lib/maze/scramble';
import type { Maze } from '../lib/maze/types';

interface GameState {
  level: LevelConfig | null;
  maze: Maze | null;
  /** epoch ms when the next scramble (real or false-alarm) is due; null while scrambling is disabled. */
  nextScrambleAt: number | null;
  /** epoch ms until which the scramble "tell" should be shown in the UI. */
  scrambleFlashUntil: number | null;
  rng: Rng | null;
  loadLevel: (id: number) => void;
  /** Call every frame/tick with the current time; scrambles when due. */
  checkScramble: (now: number) => void;
}

function scheduleNext(level: LevelConfig, rng: Rng, now: number): number {
  const { minIntervalSec, maxIntervalSec } = level.scramble;
  const span = maxIntervalSec - minIntervalSec;
  const seconds = minIntervalSec + rng() * span;
  return now + seconds * 1000;
}

export const useGameStore = create<GameState>((set, get) => ({
  level: null,
  maze: null,
  nextScrambleAt: null,
  scrambleFlashUntil: null,
  rng: null,

  loadLevel: (id) => {
    const level = getLevel(id);
    if (!level) throw new Error(`Unknown level id: ${id}`);

    const rng = createRng(id * 7919 + 13);
    const maze = generateMaze({
      width: level.grid.width,
      height: level.grid.height,
      seed: id * 104729,
    });
    const nextScrambleAt = level.scramble.enabled ? scheduleNext(level, rng, Date.now()) : null;

    set({ level, maze, rng, nextScrambleAt, scrambleFlashUntil: null });
  },

  checkScramble: (now) => {
    const { level, maze, rng, nextScrambleAt } = get();
    if (!level || !maze || !rng || !level.scramble.enabled || nextScrambleAt === null) return;
    if (now < nextScrambleAt) return;

    const isFalseAlarm = rng() < level.scramble.falseAlarmChance;
    if (isFalseAlarm) {
      set({ nextScrambleAt: scheduleNext(level, rng, now), scrambleFlashUntil: now + 600 });
      return;
    }

    const { maze: nextMaze } = scrambleMaze(maze, rng, level.scramble.intensity);
    set({
      maze: nextMaze,
      nextScrambleAt: scheduleNext(level, rng, now),
      scrambleFlashUntil: now + 600,
    });
  },
}));
