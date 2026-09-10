import type { BlockPlan } from '../maze/world';

export type UtilityType = 'phase' | 'destroy' | 'scramble' | 'dash' | 'shield' | 'trap';
export type MonsterType = 'hunter' | 'wraith' | 'brute' | 'stalker' | 'watcher';

export interface ScrambleConfig {
  enabled: boolean;
  /** Randomized interval range, in seconds, between scrambles. */
  minIntervalSec: number;
  maxIntervalSec: number;
  /** Chance (0-1) that a scramble "tell" plays but nothing actually changes — keeps players honest. */
  falseAlarmChance: number;
  /** Fraction of the *current block's* active cells attempted as wall toggles per scramble (0-1). */
  intensityRatio: number;
}

export interface LevelConfig {
  id: number;
  chapter: 1 | 2 | 3 | 4;
  title: string;
  /** The level's maze is a chain of connected blocks (see lib/maze/world) — built via buildBlockPlans. */
  blocks: BlockPlan[];
  scramble: ScrambleConfig;
  monsters: MonsterType[];
  utilities: UtilityType[];
  inventoryCap: number;
  isBoss?: boolean;
}

export const NO_SCRAMBLE: ScrambleConfig = {
  enabled: false,
  minIntervalSec: 0,
  maxIntervalSec: 0,
  falseAlarmChance: 0,
  intensityRatio: 0,
};
