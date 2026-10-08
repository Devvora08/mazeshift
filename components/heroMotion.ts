import { useCallback, useEffect, useMemo } from 'react';
import {
  Easing, runOnJS, useFrameCallback, useSharedValue, withTiming, type SharedValue,
} from 'react-native-reanimated';

import { attachHeroDriver, type ForcedSteps } from '../lib/hero/driver';
import { edgeKey, posKey } from '../lib/maze/graph';
import { DIRECTION_DELTAS, type Direction, type MazeWorld } from '../lib/maze/world';
import type { UtilityType } from '../lib/modules/utilities/types';
import type { HeroAnimationName } from '../lib/sprites/heroFrames';
import { HERO_STEP_MS } from '../store/gameStore';

/**
 * UI-thread hero engine. Input, wall checks, step chaining, facing, animation
 * choice and camera all run in one frame callback, so held movement never waits
 * on the JavaScript thread (monster AI, scrambles, React renders). JavaScript is
 * told about each step afterwards and keeps all game rules: contact, traps,
 * exit, pickups and persistence.
 */

type Cell = [blockId: string, x: number, y: number];

/** Everything the UI thread needs to walk the maze, rebuilt when walls change. */
interface WalkMap {
  /** "blockId:x,y" -> direction -> destination (open edges and gateways). */
  moves: Record<string, Partial<Record<Direction, Cell>>>;
  blocks: Record<string, { ox: number; oy: number; camX: number; camY: number }>;
  exitKey: string;
  cellSize: number;
}

const CAMERA_DURATION = 700;

function buildWalkMap(world: MazeWorld, cellSize: number, viewportHeight: number): WalkMap {
  const moves: WalkMap['moves'] = {};
  const blocks: WalkMap['blocks'] = {};
  for (const block of world.blocks) {
    // Anchor near the viewport's top rather than fully centering (see camera notes in WorldCanvas history).
    const marginX = cellSize * 0.6;
    const leftoverY = viewportHeight - block.maze.height * cellSize;
    const marginY = Math.max(cellSize * 0.6, leftoverY * 0.25);
    blocks[block.id] = { ox: block.worldOffsetX, oy: block.worldOffsetY,
      camX: marginX - block.worldOffsetX * cellSize, camY: marginY - block.worldOffsetY * cellSize };
    for (const key of block.maze.activeCells) {
      const [x, y] = key.split(',').map(Number);
      const exits: Partial<Record<Direction, Cell>> = {};
      for (const dir of Object.keys(DIRECTION_DELTAS) as Direction[]) {
        const d = DIRECTION_DELTAS[dir];
        const to = { x: x + d.x, y: y + d.y };
        if (block.maze.activeCells.has(posKey(to)) && block.maze.openEdges.has(edgeKey({ x, y }, to))) {
          exits[dir] = [block.id, to.x, to.y];
        }
      }
      moves[`${block.id}:${key}`] = exits;
    }
    for (const g of world.gatewaysByBlock.get(block.id) ?? []) {
      const exits = moves[`${block.id}:${posKey(g.fromCell)}`];
      if (exits) exits[g.direction] = [g.toBlockId, g.toCell.x, g.toCell.y];
    }
  }
  const end = world.blocks[world.blocks.length - 1];
  return { moves, blocks, exitKey: `${end.id}:${posKey(end.maze.end)}`, cellSize };
}

interface Step { from: Cell; to: Cell; dir: Direction; start: number; duration: number }
interface Forced { seq: number; from: Cell; steps: Cell[]; dir: Direction; stepMs: number; refund: UtilityType }

export interface HeroMotion {
  heroX: SharedValue<number>;
  heroY: SharedValue<number>;
  animation: SharedValue<HeroAnimationName>;
  cameraX: SharedValue<number>;
  cameraY: SharedValue<number>;
}

export function useHeroMotion({ world, start, cellSize, viewportHeight, held, halted,
  onStepStart, onStepEnd, onFace, onRefund }: {
  world: MazeWorld;
  /** Where the hero stands when this engine mounts (WorldCanvas remounts per run). */
  start: { blockId: string; x: number; y: number; facing: Direction };
  cellSize: number;
  viewportHeight: number;
  held: SharedValue<Direction | null>;
  /** Paused, caught or finished: freeze mid-step and take no input. */
  halted: boolean;
  onStepStart: (blockId: string, x: number, y: number, dir: Direction, duration: number) => void;
  onStepEnd: () => void;
  onFace: (dir: Direction) => void;
  onRefund: (type: UtilityType) => void;
}): HeroMotion {
  const walk = useMemo(() => buildWalkMap(world, cellSize, viewportHeight), [world, cellSize, viewportHeight]);
  const startBlock = walk.blocks[start.blockId];
  const walkSV = useSharedValue(walk);
  const haltedSV = useSharedValue(halted);
  const hero = useSharedValue<Cell>([start.blockId, start.x, start.y]);
  const step = useSharedValue<Step | null>(null);
  const facing = useSharedValue<Direction>(start.facing);
  const animation = useSharedValue<HeroAnimationName>('idle');
  const exited = useSharedValue(false);
  const forced = useSharedValue<Forced | null>(null);
  const forcedIndex = useSharedValue(-1);
  const heroX = useSharedValue((startBlock.ox + start.x + 0.5) * cellSize);
  const heroY = useSharedValue((startBlock.oy + start.y + 1) * cellSize);
  const cameraX = useSharedValue(startBlock.camX);
  const cameraY = useSharedValue(startBlock.camY);
  const cameraBlock = useSharedValue(start.blockId);

  useEffect(() => { walkSV.value = walk; }, [walk, walkSV]);
  useEffect(() => { haltedSV.value = halted; }, [halted, haltedSV]);

  // A resize or layout change re-targets the camera; scrambles leave it untouched.
  useEffect(() => {
    const block = walk.blocks[cameraBlock.value];
    if (!block) return;
    cameraX.value = withTiming(block.camX, { duration: CAMERA_DURATION, easing: Easing.inOut(Easing.cubic) });
    cameraY.value = withTiming(block.camY, { duration: CAMERA_DURATION, easing: Easing.inOut(Easing.cubic) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walk.cellSize, viewportHeight]);

  useEffect(() => attachHeroDriver({
    force: (command: ForcedSteps) => {
      forced.value = {
        seq: (forced.value?.seq ?? 0) + 1,
        from: [command.from.blockId, command.from.cell.x, command.from.cell.y],
        steps: command.steps.map(s => [s.blockId, s.cell.x, s.cell.y] as Cell),
        dir: command.direction, stepMs: command.stepMs, refund: command.refund,
      };
      forcedIndex.value = 0;
    },
  }), [forced, forcedIndex]);

  useFrameCallback(useCallback((info) => {
    'worklet';
    const now = info.timestamp;
    const map = walkSV.value;
    const size = map.cellSize;
    const place = (c: Cell) => {
      const b = map.blocks[c[0]];
      return { x: (b.ox + c[1] + 0.5) * size, y: (b.oy + c[2] + 1) * size };
    };

    if (haltedSV.value) {
      // Freeze mid-step: shift the step's clock so progress resumes where it stopped.
      const current = step.value;
      if (current) step.value = { ...current, start: current.start + (info.timeSincePreviousFrame ?? 0) };
      animation.value = 'idle';
      return;
    }

    let startAt = now;
    const current = step.value;
    if (current) {
      const p = (now - current.start) / current.duration;
      const a = place(current.from), b = place(current.to);
      if (p < 1) {
        heroX.value = a.x + (b.x - a.x) * p;
        heroY.value = a.y + (b.y - a.y) * p;
        return;
      }
      heroX.value = b.x; heroY.value = b.y;
      hero.value = current.to;
      step.value = null;
      runOnJS(onStepEnd)();
      if (`${current.to[0]}:${current.to[1]},${current.to[2]}` === map.exitKey) exited.value = true;
      // Chain the next step from the exact end of this one: no frame gap at cell boundaries.
      startAt = Math.min(now, current.start + current.duration);
    }
    if (exited.value) { animation.value = 'idle'; return; }

    const at = hero.value;
    const here = `${at[0]}:${at[1]},${at[2]}`;
    let dir: Direction | null = null;
    let to: Cell | null = null;
    let duration = HERO_STEP_MS;

    const command = forced.value;
    if (command && forcedIndex.value >= 0) {
      const i = forcedIndex.value;
      if (i === 0 && `${command.from[0]}:${command.from[1]},${command.from[2]}` !== here) {
        forcedIndex.value = -1;
        runOnJS(onRefund)(command.refund);
      } else if (i < command.steps.length) {
        dir = command.dir; to = command.steps[i]; duration = command.stepMs;
        forcedIndex.value = i + 1;
      } else forcedIndex.value = -1;
    }
    if (!to) {
      dir = held.value;
      if (dir) {
        to = map.moves[here]?.[dir] ?? null;
        if (!to && facing.value !== dir) { facing.value = dir; runOnJS(onFace)(dir); }
      }
    }

    if (to && dir) {
      facing.value = dir;
      step.value = { from: at, to, dir, start: startAt, duration };
      runOnJS(onStepStart)(to[0], to[1], to[2], dir, duration);
      if (to[0] !== cameraBlock.value) {
        cameraBlock.value = to[0];
        const block = map.blocks[to[0]];
        cameraX.value = withTiming(block.camX, { duration: CAMERA_DURATION, easing: Easing.inOut(Easing.cubic) });
        cameraY.value = withTiming(block.camY, { duration: CAMERA_DURATION, easing: Easing.inOut(Easing.cubic) });
      }
      // Position the first frame of the step immediately (a chained step may already be under way).
      const a = place(at), b = place(to);
      const p = Math.min(1, Math.max(0, (now - startAt) / duration));
      heroX.value = a.x + (b.x - a.x) * p;
      heroY.value = a.y + (b.y - a.y) * p;
    }
    // Run while stepping or while a direction is held (even into a wall), else idle.
    animation.value = step.value || held.value ? facing.value : 'idle';
  }, [walkSV, haltedSV, hero, step, facing, animation, exited, forced, forcedIndex, heroX, heroY,
    cameraX, cameraY, cameraBlock, held, onStepStart, onStepEnd, onFace, onRefund]));

  return { heroX, heroY, animation, cameraX, cameraY };
}
