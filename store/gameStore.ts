import { create } from 'zustand';

import { getLevel } from '../lib/levels/data';
import type { LevelConfig } from '../lib/levels/types';
import { edgeKey, posKey } from '../lib/maze/graph';
import { createRng, type Rng } from '../lib/maze/rng';
import { scrambleMaze } from '../lib/maze/scramble';
import type { Position } from '../lib/maze/types';
import { generateWorld, type MazeWorld } from '../lib/maze/world';

export type Direction = 'up' | 'down' | 'left' | 'right';

const DELTAS: Record<Direction, Position> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

interface GameState {
  level: LevelConfig | null;
  world: MazeWorld | null;
  currentBlockId: string | null;
  heroCell: Position | null;
  facing: Direction;
  isMoving: boolean;
  /** epoch ms when the next scramble (real or false-alarm) is due; null while scrambling is disabled. */
  nextScrambleAt: number | null;
  /** epoch ms until which the scramble "tell" should be shown in the UI. */
  scrambleFlashUntil: number | null;
  rng: Rng | null;
  reachedExit: boolean;

  loadLevel: (id: number) => void;
  /** Call every frame/tick with the current time; scrambles when due. */
  checkScramble: (now: number) => void;
  /** Attempt to step one cell in `dir`; returns whether the move was legal (wall/gateway allowed it). */
  move: (dir: Direction) => boolean;
  /** UI calls this once the move's slide animation finishes, unblocking the next input. */
  finishMove: () => void;
}

function scheduleNext(level: LevelConfig, rng: Rng, now: number): number {
  const { minIntervalSec, maxIntervalSec } = level.scramble;
  const span = maxIntervalSec - minIntervalSec;
  const seconds = minIntervalSec + rng() * span;
  return now + seconds * 1000;
}

export const useGameStore = create<GameState>((set, get) => ({
  level: null,
  world: null,
  currentBlockId: null,
  heroCell: null,
  facing: 'down',
  isMoving: false,
  nextScrambleAt: null,
  scrambleFlashUntil: null,
  rng: null,
  reachedExit: false,

  loadLevel: (id) => {
    const level = getLevel(id);
    if (!level) throw new Error(`Unknown level id: ${id}`);

    const rng = createRng(id * 7919 + 13);
    const world = generateWorld(level.blocks, id * 104729);
    const startBlock = world.blocks[0];
    const nextScrambleAt = level.scramble.enabled ? scheduleNext(level, rng, Date.now()) : null;

    set({
      level,
      world,
      currentBlockId: startBlock.id,
      heroCell: startBlock.maze.start,
      facing: 'down',
      isMoving: false,
      rng,
      nextScrambleAt,
      scrambleFlashUntil: null,
      reachedExit: false,
    });
  },

  move: (dir) => {
    const { world, level, currentBlockId, heroCell, isMoving, rng } = get();
    if (!world || !level || !currentBlockId || !heroCell || !rng || isMoving) return false;

    const block = world.blocks.find((b) => b.id === currentBlockId);
    if (!block) return false;

    const delta = DELTAS[dir];
    const target: Position = { x: heroCell.x + delta.x, y: heroCell.y + delta.y };

    // 1. A normal step within the current block's maze.
    if (block.maze.activeCells.has(posKey(target)) && block.maze.openEdges.has(edgeKey(heroCell, target))) {
      const isExit = currentBlockId === world.endBlockId && posKey(target) === posKey(block.maze.end);
      set({ heroCell: target, facing: dir, isMoving: true, reachedExit: isExit });
      return true;
    }

    // 2. A gateway to the next/previous block, if this cell has one facing `dir`.
    const gateways = world.gatewaysByBlock.get(currentBlockId) ?? [];
    const gateway = gateways.find((g) => g.direction === dir && posKey(g.fromCell) === posKey(heroCell));
    if (gateway) {
      const nextScrambleAt = level.scramble.enabled ? scheduleNext(level, rng, Date.now()) : null;
      set({
        currentBlockId: gateway.toBlockId,
        heroCell: gateway.toCell,
        facing: dir,
        isMoving: true,
        nextScrambleAt,
        scrambleFlashUntil: null,
      });
      return true;
    }

    return false;
  },

  finishMove: () => set({ isMoving: false }),

  checkScramble: (now) => {
    const { level, world, currentBlockId, rng, nextScrambleAt } = get();
    if (!level || !world || !currentBlockId || !rng || !level.scramble.enabled || nextScrambleAt === null) return;
    if (now < nextScrambleAt) return;

    const isFalseAlarm = rng() < level.scramble.falseAlarmChance;
    if (isFalseAlarm) {
      set({ nextScrambleAt: scheduleNext(level, rng, now), scrambleFlashUntil: now + 600 });
      return;
    }

    const blockIndex = world.blocks.findIndex((b) => b.id === currentBlockId);
    if (blockIndex === -1) return;
    const block = world.blocks[blockIndex];
    const intensity = Math.round(block.maze.activeCells.size * level.scramble.intensityRatio);
    const { maze: nextMaze } = scrambleMaze(block.maze, rng, intensity);

    const blocks = world.blocks.slice();
    blocks[blockIndex] = { ...block, maze: nextMaze };

    set({
      world: { ...world, blocks },
      nextScrambleAt: scheduleNext(level, rng, now),
      scrambleFlashUntil: now + 600,
    });
  },
}));
