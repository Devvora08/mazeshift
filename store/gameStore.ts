import { create } from 'zustand';

import { getLevel } from '../lib/levels/data';
import { PRACTICE_LEVEL, practicePickups } from '../lib/levels/practice';
import type { LevelConfig } from '../lib/levels/types';
import { edgeKey, posKey } from '../lib/maze/graph';
import { createRng, type Rng } from '../lib/maze/rng';
import type { Position } from '../lib/maze/types';
import { DIRECTION_DELTAS, generateWorld, type Direction, type MazeWorld } from '../lib/maze/world';
import { scheduleNextScramble, tickScramble } from '../lib/modules/scramble';
import { applyDestroy, findWallTarget, type UtilityType } from '../lib/modules/utilities';

export type { Direction };

const DELTAS = DIRECTION_DELTAS;
const FEEDBACK_MS = 1400;

function pickupKey(blockId: string, cell: Position): string {
  return `${blockId}:${posKey(cell)}`;
}

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

  inventory: UtilityType[];
  /** keyed by "blockId:x,y" — cleared as each is picked up. */
  pickups: Map<string, UtilityType>;
  feedback: { message: string; until: number } | null;

  loadLevel: (id: number) => void;
  /** Call every frame/tick with the current time; scrambles when due. */
  checkScramble: (now: number) => void;
  /** Attempt to step one cell in `dir`; returns whether the move was legal (wall/gateway allowed it). */
  move: (dir: Direction) => boolean;
  /** UI calls this once the move's slide animation finishes, unblocking the next input. */
  finishMove: () => void;
  /** A sigil was recognized from a drawn stroke — acquire it if standing on a matching pickup,
   *  otherwise try to cast it from inventory. */
  castSigil: (type: UtilityType) => void;
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
  inventory: [],
  pickups: new Map(),
  feedback: null,

  loadLevel: (id) => {
    const level = id === 0 ? PRACTICE_LEVEL : getLevel(id);
    if (!level) throw new Error(`Unknown level id: ${id}`);

    const rng = createRng(id * 7919 + 13);
    const world = generateWorld(level.blocks, id * 104729);
    const startBlock = world.blocks[0];
    const nextScrambleAt = level.scramble.enabled
      ? scheduleNextScramble(level.scramble, rng, Date.now())
      : null;

    const pickups = new Map<string, UtilityType>();
    if (id === 0) {
      for (const p of practicePickups(startBlock.maze)) {
        pickups.set(pickupKey(startBlock.id, p.cell), p.type);
      }
    }

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
      inventory: [],
      pickups,
      feedback: null,
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

  castSigil: (type) => {
    const { world, level, currentBlockId, heroCell, facing, inventory, pickups } = get();
    if (!world || !level || !currentBlockId || !heroCell) return;
    const blockIndex = world.blocks.findIndex((b) => b.id === currentBlockId);
    if (blockIndex === -1) return;
    const block = world.blocks[blockIndex];
    const say = (message: string) => set({ feedback: { message, until: Date.now() + FEEDBACK_MS } });

    // 1. Standing on a matching pickup — acquire it.
    const key = pickupKey(currentBlockId, heroCell);
    if (pickups.get(key) === type) {
      if (inventory.length >= level.inventoryCap) {
        say('Inventory full');
        return;
      }
      const nextPickups = new Map(pickups);
      nextPickups.delete(key);
      set({ inventory: [...inventory, type], pickups: nextPickups });
      say(`Acquired ${type}`);
      return;
    }

    // 2. Otherwise, try to cast it from inventory.
    const heldIndex = inventory.indexOf(type);
    if (heldIndex === -1) {
      say(`No ${type} to cast`);
      return;
    }

    if (type !== 'phase' && type !== 'destroy') {
      say(`${type} isn't implemented yet`);
      return;
    }

    const target = findWallTarget(block, heroCell, facing);
    if (!target) {
      say('No wall there');
      return;
    }

    const nextInventory = inventory.slice();
    nextInventory.splice(heldIndex, 1);

    if (type === 'destroy') {
      const nextMaze = applyDestroy(block.maze, target);
      const blocks = world.blocks.slice();
      blocks[blockIndex] = { ...block, maze: nextMaze };
      set({ world: { ...world, blocks }, inventory: nextInventory });
      say('Wall destroyed');
    } else {
      set({ heroCell: target.neighbor, inventory: nextInventory });
      say('Phased through');
    }
  },
}));
