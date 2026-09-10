import { create } from 'zustand';

import { getLevel } from '../lib/levels/data';
import type { LevelConfig } from '../lib/levels/types';
import { edgeKey, posKey } from '../lib/maze/graph';
import { createRng, type Rng } from '../lib/maze/rng';
import type { Position } from '../lib/maze/types';
import { generateWorld, type MazeWorld } from '../lib/maze/world';
import { scheduleNextScramble, tickScramble } from '../lib/modules/scramble';

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
    const nextScrambleAt = level.scramble.enabled
      ? scheduleNextScramble(level.scramble, rng, Date.now())
      : null;

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
      const nextScrambleAt = level.scramble.enabled
        ? scheduleNextScramble(level.scramble, rng, Date.now())
        : null;
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
    if (!level || !world || !currentBlockId || !rng) return;

    const blockIndex = world.blocks.findIndex((b) => b.id === currentBlockId);
    if (blockIndex === -1) return;
    const block = world.blocks[blockIndex];

    const result = tickScramble({ config: level.scramble, block, rng, now, nextScrambleAt });
    if (result.type === 'idle' || result.type === 'notDue') return;

    if (result.type === 'falseAlarm') {
      set({ nextScrambleAt: result.nextScrambleAt, scrambleFlashUntil: result.flashUntil });
      return;
    }

    const blocks = world.blocks.slice();
    blocks[blockIndex] = { ...block, maze: result.maze };
    set({
      world: { ...world, blocks },
      nextScrambleAt: result.nextScrambleAt,
      scrambleFlashUntil: result.flashUntil,
    });
  },
}));
