import { buildBlockPlans } from './blockPlans';
import type { LevelConfig } from './types';
import { NO_SCRAMBLE } from '../modules/scramble';

/**
 * Locked v1 roadmap: 20 levels across 4 chapters, matching the Free (1-5) /
 * Pack I (6-10) / Pack II (11-20) monetization tiers. See project memory
 * `mazeshift-level-plan` for the full design rationale per level.
 *
 * Each level's maze is a chain of connected blocks (lib/maze/world), not one
 * flat rectangle — `numBlocks` grows across the roadmap, and `refW`/`refH`
 * are the reference size each block is scaled from (see buildBlockPlans).
 */
function level(
  id: number,
  chapter: 1 | 2 | 3 | 4,
  title: string,
  numBlocks: number,
  refW: number,
  refH: number,
  rest: Omit<LevelConfig, 'id' | 'chapter' | 'title' | 'blocks'>
): LevelConfig {
  return { id, chapter, title, blocks: buildBlockPlans(numBlocks, refW, refH, id, chapter), ...rest };
}

export const LEVELS: LevelConfig[] = [
  level(1, 1, 'First Steps', 2, 14, 18, {
    scramble: NO_SCRAMBLE,
    monsters: [],
    utilities: [],
    inventoryCap: 0,
  }),
  level(2, 1, 'Longer Path', 2, 16, 20, {
    scramble: NO_SCRAMBLE,
    monsters: [],
    utilities: [],
    inventoryCap: 0,
  }),
  level(3, 1, "It's Changing", 3, 15, 19, {
    scramble: { enabled: true, minIntervalSec: 20, maxIntervalSec: 23, falseAlarmChance: 0, intensityRatio: 0.08 },
    monsters: [],
    utilities: [],
    inventoryCap: 0,
  }),
  level(4, 1, 'Faster', 3, 14, 18, {
    scramble: { enabled: true, minIntervalSec: 15, maxIntervalSec: 17, falseAlarmChance: 0.1, intensityRatio: 0.08 },
    monsters: [],
    utilities: [],
    inventoryCap: 0,
  }),
  level(5, 1, 'The First Mark', 3, 16, 20, {
    scramble: { enabled: true, minIntervalSec: 15, maxIntervalSec: 18, falseAlarmChance: 0.15, intensityRatio: 0.09 },
    monsters: [],
    utilities: ['phase'],
    inventoryCap: 2,
  }),
  level(6, 2, 'Sealed Routes', 3, 16, 20, {
    scramble: { enabled: true, minIntervalSec: 14, maxIntervalSec: 17, falseAlarmChance: 0.15, intensityRatio: 0.09 },
    monsters: [],
    utilities: ['phase'],
    inventoryCap: 2,
  }),
  level(7, 2, 'Second Sign', 4, 17, 21, {
    scramble: { enabled: true, minIntervalSec: 14, maxIntervalSec: 17, falseAlarmChance: 0.15, intensityRatio: 0.1 },
    monsters: [],
    utilities: ['phase', 'destroy'],
    inventoryCap: 2,
  }),
  level(8, 2, 'Something Hunts', 3, 15, 19, {
    scramble: NO_SCRAMBLE,
    monsters: ['hunter'],
    utilities: ['phase', 'destroy'],
    inventoryCap: 2,
  }),
  level(9, 2, 'Hunted & Shifting', 4, 16, 20, {
    scramble: { enabled: true, minIntervalSec: 13, maxIntervalSec: 16, falseAlarmChance: 0.15, intensityRatio: 0.1 },
    monsters: ['hunter'],
    utilities: ['phase', 'destroy'],
    inventoryCap: 2,
  }),
  level(10, 2, 'BOOM', 4, 17, 21, {
    scramble: { enabled: true, minIntervalSec: 13, maxIntervalSec: 16, falseAlarmChance: 0.2, intensityRatio: 0.1 },
    monsters: ['hunter', 'brute'],
    utilities: ['phase', 'destroy'],
    inventoryCap: 2,
  }),
  level(11, 3, 'Walls Lie', 4, 18, 22, {
    scramble: { enabled: true, minIntervalSec: 12, maxIntervalSec: 15, falseAlarmChance: 0.2, intensityRatio: 0.1 },
    monsters: ['hunter', 'wraith'],
    utilities: ['phase', 'destroy'],
    inventoryCap: 2,
  }),
  level(12, 3, 'Choose Wisely', 5, 18, 22, {
    scramble: { enabled: true, minIntervalSec: 12, maxIntervalSec: 15, falseAlarmChance: 0.2, intensityRatio: 0.1 },
    monsters: ['hunter', 'wraith'],
    utilities: ['phase', 'destroy', 'scramble'],
    inventoryCap: 2,
  }),
  level(13, 3, 'Scarcity', 5, 18, 22, {
    scramble: { enabled: true, minIntervalSec: 11, maxIntervalSec: 14, falseAlarmChance: 0.2, intensityRatio: 0.1 },
    monsters: ['hunter', 'wraith'],
    utilities: ['phase', 'destroy', 'scramble'],
    inventoryCap: 1,
  }),
  level(14, 3, 'Everything', 5, 19, 23, {
    scramble: { enabled: true, minIntervalSec: 11, maxIntervalSec: 14, falseAlarmChance: 0.2, intensityRatio: 0.1 },
    monsters: ['hunter', 'wraith', 'brute', 'stalker'],
    utilities: ['phase', 'destroy', 'scramble', 'dash'],
    inventoryCap: 2,
  }),
  level(15, 3, 'The Maze Knows You', 6, 21, 25, {
    scramble: { enabled: true, minIntervalSec: 10, maxIntervalSec: 13, falseAlarmChance: 0.25, intensityRatio: 0.11 },
    monsters: ['hunter', 'wraith', 'brute', 'stalker'],
    utilities: ['phase', 'destroy', 'scramble', 'dash'],
    inventoryCap: 2,
    isBoss: true,
  }),
  level(16, 4, 'Being Watched', 4, 15, 19, {
    scramble: NO_SCRAMBLE,
    monsters: ['watcher'],
    utilities: ['phase', 'destroy', 'scramble', 'dash'],
    inventoryCap: 2,
  }),
  level(17, 4, 'Predicted', 4, 17, 21, {
    scramble: NO_SCRAMBLE,
    monsters: ['stalker', 'watcher'],
    utilities: ['phase', 'destroy', 'scramble', 'dash', 'shield'],
    inventoryCap: 2,
  }),
  level(18, 4, 'The Gallery', 6, 20, 24, {
    scramble: { enabled: true, minIntervalSec: 10, maxIntervalSec: 13, falseAlarmChance: 0.2, intensityRatio: 0.11 },
    monsters: ['hunter', 'wraith', 'brute', 'stalker', 'watcher'],
    utilities: ['phase', 'destroy', 'scramble', 'dash', 'shield', 'trap'],
    inventoryCap: 2,
  }),
  level(19, 4, 'Nothing Left to Spare', 6, 20, 25, {
    scramble: { enabled: true, minIntervalSec: 9, maxIntervalSec: 12, falseAlarmChance: 0.25, intensityRatio: 0.12 },
    monsters: ['wraith', 'stalker', 'watcher'],
    utilities: ['phase', 'destroy', 'scramble', 'dash', 'shield', 'trap'],
    inventoryCap: 1,
  }),
  level(20, 4, 'The Maze Fights Back', 7, 23, 28, {
    scramble: { enabled: true, minIntervalSec: 8, maxIntervalSec: 11, falseAlarmChance: 0.25, intensityRatio: 0.12 },
    monsters: ['hunter', 'wraith', 'brute', 'stalker', 'watcher'],
    utilities: ['phase', 'destroy', 'scramble', 'dash', 'shield', 'trap'],
    inventoryCap: 1,
    isBoss: true,
  }),
];

export function getLevel(id: number): LevelConfig | undefined {
  return LEVELS.find((l) => l.id === id);
}
