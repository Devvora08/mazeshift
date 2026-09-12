import { create } from 'zustand';

import { getLevel } from '../lib/levels/data';
import { PRACTICE_LEVEL, practicePickups } from '../lib/levels/practice';
import type { LevelConfig } from '../lib/levels/types';
import { edgeKey, posKey } from '../lib/maze/graph';
import { createRng, type Rng } from '../lib/maze/rng';
import type { Position } from '../lib/maze/types';
import { DIRECTION_DELTAS, generateWorld, type Direction, type MazeWorld } from '../lib/maze/world';
import { scheduleNextScramble, tickScramble, scrambleWorld } from '../lib/modules/scramble';
import { applyDestroy, findWallTarget, type UtilityType } from '../lib/modules/utilities';
import { spawnMonsters, tickMonsters, touches, type Monster, type Travel, type WorldCell } from '../lib/modules/monsters';

import { campaignPickups } from '../lib/levels/pickups';
import { DASH_STEPS, DASH_STEP_MS, SHIELD_MS, TRAP_LIFETIME_MS, triggerTraps, type PlacedTrap } from '../lib/modules/utilities/effects';

export const HERO_STEP_MS = 200;

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
  monsters: Monster[];
  simulationTime: number;
  heroTravel: Travel | null;
  caughtBy: Monster['type'] | null;
  stalkerAlert: boolean;
  paused: boolean;
  pausedAt: number | null;
  runId: number;
  tick: (deltaMs: number) => void;
  setPaused: (paused: boolean) => void;

  shieldUntil: number;
  traps: PlacedTrap[];
  dashRemaining: number;
  dashDirection: Direction | null;
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
  monsters: [],
  simulationTime: 0,
  heroTravel: null,
  caughtBy: null,
  stalkerAlert: false,
  paused: false,
  pausedAt: null,
  runId: 0,
  shieldUntil: 0, traps: [], dashRemaining: 0, dashDirection: null,
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

    const monsters = spawnMonsters(world, level.monsters);
    const pickups = id === 0 ? new Map<string, UtilityType>() : campaignPickups(world, level.utilities, monsters);
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
      monsters,
      simulationTime: 0,
      heroTravel: null,
      caughtBy: null,
      stalkerAlert: false,
      paused: false,
      pausedAt: null,
      runId: get().runId + 1,
      shieldUntil: 0, traps: [], dashRemaining: 0, dashDirection: null,
    inventory: [],
      pickups,
      feedback: null,
    });
  },

  move: (dir) => {
    const { world, level, currentBlockId, heroCell, isMoving, rng } = get();
    if (!world || !level || !currentBlockId || !heroCell || !rng || isMoving || get().caughtBy || get().paused || get().reachedExit) return false;
    if (get().dashRemaining > 0 && dir !== get().dashDirection) return false;
    const from = { blockId: currentBlockId, cell: heroCell };
    const travelTo = (to: WorldCell): Travel => ({ from, to, startedAt: get().simulationTime, duration: get().dashRemaining > 0 ? DASH_STEP_MS : HERO_STEP_MS });

    const block = world.blocks.find((b) => b.id === currentBlockId);
    if (!block) return false;

    const delta = DELTAS[dir];
    const target: Position = { x: heroCell.x + delta.x, y: heroCell.y + delta.y };

    // 1. A normal step within the current block's maze.
    if (block.maze.activeCells.has(posKey(target)) && block.maze.openEdges.has(edgeKey(heroCell, target))) {
      set({ heroCell: target, facing: dir, isMoving: true, dashRemaining: Math.max(0, get().dashRemaining - 1), heroTravel: travelTo({ blockId: currentBlockId, cell: target }) });
      return true;
    }

    // 2. A gateway to the next/previous block, if this cell has one facing `dir`.
    const gateways = world.gatewaysByBlock.get(currentBlockId) ?? [];
    const gateway = gateways.find((g) => g.direction === dir && posKey(g.fromCell) === posKey(heroCell));
    if (gateway) {
      set({
        currentBlockId: gateway.toBlockId,
        heroCell: gateway.toCell,
        facing: dir,
        isMoving: true,
        heroTravel: travelTo({ blockId: gateway.toBlockId, cell: gateway.toCell }),
        dashRemaining: Math.max(0, get().dashRemaining - 1),
      });
      return true;
    }

    return false;
  },

  finishMove: () => {
    const state = get();
    if (state.paused || state.caughtBy) return;
    if (state.heroTravel && state.heroCell && state.currentBlockId) {
      const through = Math.max(state.simulationTime, state.heroTravel.startedAt + state.heroTravel.duration);
      const hero = { blockId: state.currentBlockId, cell: state.heroCell };
      const trapped = triggerTraps(state.monsters, state.traps, state.simulationTime, through);
      set({ monsters: trapped.monsters, traps: trapped.traps });
      const caught = trapped.monsters.find(m => {
        const start = Math.max(state.simulationTime, state.shieldUntil, m.stunnedUntil ?? 0);
        return start <= through && touches(hero, state.heroTravel, m.location, m.travel, start, through);
      });
      if (caught) { set({ caughtBy: caught.type, isMoving: false, stalkerAlert: false, dashRemaining: 0, dashDirection: null }); return; }
    }
    const end = state.world?.blocks.find(b => b.id === state.world!.endBlockId);
    const reachedExit = !!end && state.currentBlockId === end.id && !!state.heroCell && posKey(state.heroCell) === posKey(end.maze.end);
    set({ isMoving: false, heroTravel: null, reachedExit,
      dashRemaining: reachedExit ? 0 : state.dashRemaining,
      dashDirection: !reachedExit && state.dashRemaining > 0 ? state.dashDirection : null });
    // Dash chains legal individual steps, so walls, gateways and contacts all apply.
    if (!reachedExit && state.dashRemaining > 0 && state.dashDirection && !get().move(state.dashDirection)) {
      set({ dashRemaining: 0, dashDirection: null });
    }
  },

  setPaused: (paused) => {
    const state = get();
    if (paused === state.paused) return;
    const now = Date.now();
    set({ paused, pausedAt: paused ? now : null,
      nextScrambleAt: !paused && state.pausedAt !== null && state.nextScrambleAt !== null
        ? state.nextScrambleAt + now - state.pausedAt : state.nextScrambleAt });
  },

  tick: (deltaMs) => {
    const s = get();
    if (!s.world || !s.heroCell || !s.currentBlockId || s.paused || s.caughtBy || s.reachedExit) return;
    // Small bounded ticks; background time is discarded by the screen lifecycle.
    const now = s.simulationTime + Math.max(0, Math.min(deltaMs, 100));
    const hero = { blockId: s.currentBlockId, cell: s.heroCell };
    const trapped = triggerTraps(s.monsters, s.traps, s.simulationTime, now);
    const caught = trapped.monsters.find(m => {
      const start = Math.max(s.simulationTime, s.shieldUntil, m.stunnedUntil ?? 0);
      return start <= now && touches(hero, s.heroTravel, m.location, m.travel, start, now);
    });
    if (caught) {
      set({ simulationTime: now, monsters: trapped.monsters, traps: trapped.traps,
        caughtBy: caught.type, isMoving: false, stalkerAlert: false, dashRemaining: 0, dashDirection: null });
      return;
    }
    const sensedHero = s.heroTravel && now < s.heroTravel.startedAt + s.heroTravel.duration / 2 ? s.heroTravel.from : hero;
    const result = tickMonsters(s.world, trapped.monsters, sensedHero, now);
    set({ simulationTime: now, world: result.world, monsters: result.monsters, traps: trapped.traps, stalkerAlert: result.alert });
  },

  checkScramble: (now) => {
    const s = get();
    if (!s.level || !s.world || !s.rng || s.paused || s.caughtBy || s.reachedExit) return;
    const result = tickScramble({ config: s.level.scramble, world: s.world, rng: s.rng, now,
      nextScrambleAt: s.nextScrambleAt, travels: [s.heroTravel, ...s.monsters.map(m => m.travel)] });
    if (result.type === 'idle' || result.type === 'notDue') return;
    set({ nextScrambleAt: result.nextScrambleAt, scrambleFlashUntil: result.flashUntil,
      ...(result.type === 'scrambled' ? { world: result.world } : {}) });
  },

  castSigil: (type) => {
    const s = get();
    const { world, level, currentBlockId, heroCell, facing, inventory, pickups } = s;
    if (!world || !level || !currentBlockId || !heroCell || s.caughtBy || s.paused || s.reachedExit || s.isMoving) return;
    const blockIndex = world.blocks.findIndex(b => b.id === currentBlockId);
    if (blockIndex < 0) return;
    const block = world.blocks[blockIndex];
    const say = (message: string) => set({ feedback: { message, until: Date.now() + FEEDBACK_MS } });
    if (!level.utilities.includes(type)) { say('This charm is not available in this level'); return; }

    const key = pickupKey(currentBlockId, heroCell);
    if (pickups.get(key) === type) {
      if (inventory.length >= level.inventoryCap) { say('Inventory full'); return; }
      const nextPickups = new Map(pickups); nextPickups.delete(key);
      set({ inventory: [...inventory, type], pickups: nextPickups });
      say('Acquired ' + type); return;
    }
    const index = inventory.indexOf(type);
    if (index < 0) { say('No ' + type + ' to cast'); return; }
    const nextInventory = inventory.slice(); nextInventory.splice(index, 1);

    if (type === 'shield') {
      set({ inventory: nextInventory, shieldUntil: s.simulationTime + SHIELD_MS });
      say('Shield active for 5 seconds'); return;
    }
    if (type === 'trap') {
      if (s.traps.some(t => t.location.blockId === currentBlockId && posKey(t.location.cell) === posKey(heroCell) && t.expiresAt > s.simulationTime)) {
        say('A trap is already here'); return;
      }
      set({ inventory: nextInventory, traps: [...s.traps, {
        id: s.runId + ':' + s.simulationTime + ':' + s.traps.length,
        location: { blockId: currentBlockId, cell: heroCell }, expiresAt: s.simulationTime + TRAP_LIFETIME_MS,
      }] });
      say('Trap placed — holds a monster for 4 seconds'); return;
    }
    if (type === 'scramble') {
      if (!s.rng) return;
      const nextWorld = scrambleWorld(world, s.rng, 0.7, s.monsters.map(m => m.travel));
      const changed = nextWorld.blocks.some((b, i) => b.maze.openEdges.size !== world.blocks[i].maze.openEdges.size
        || [...b.maze.openEdges].some(e => !world.blocks[i].maze.openEdges.has(e)));
      if (!changed) { say('No walls can safely change'); return; }
      set({ world: nextWorld, inventory: nextInventory, scrambleFlashUntil: Date.now() + 1050 });
      say('Every block scrambled'); return;
    }
    if (type === 'dash') {
      set({ dashRemaining: DASH_STEPS, dashDirection: facing });
      if (!get().move(facing)) {
        set({ dashRemaining: 0, dashDirection: null });
        say('No open path ahead'); return;
      }
      set({ inventory: nextInventory });
      say('Dash!'); return;
    }

    const target = findWallTarget(block, heroCell, facing);
    if (!target) { say('No wall there'); return; }
    if (type === 'destroy') {
      const blocks = world.blocks.slice();
      blocks[blockIndex] = { ...block, maze: applyDestroy(block.maze, target) };
      set({ world: { ...world, blocks }, inventory: nextInventory });
      say('Wall destroyed');
    } else {
      set({ heroCell: target.neighbor, inventory: nextInventory, isMoving: true,
        heroTravel: { from: { blockId: currentBlockId, cell: heroCell }, to: { blockId: currentBlockId, cell: target.neighbor },
          startedAt: s.simulationTime, duration: HERO_STEP_MS } });
      say('Phased through');
    }
  },
}));
