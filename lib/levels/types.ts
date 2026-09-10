export type UtilityType = 'phase' | 'destroy' | 'scramble' | 'dash' | 'shield' | 'trap';
export type MonsterType = 'hunter' | 'wraith' | 'brute' | 'stalker' | 'watcher';

export interface ScrambleConfig {
  enabled: boolean;
  /** Randomized interval range, in seconds, between scrambles. */
  minIntervalSec: number;
  maxIntervalSec: number;
  /** Chance (0-1) that a scramble "tell" plays but nothing actually changes — keeps players honest. */
  falseAlarmChance: number;
  /** How many wall toggles are attempted per scramble (see scrambleMaze intensity). */
  intensity: number;
}

export interface LevelConfig {
  id: number;
  chapter: 1 | 2 | 3 | 4;
  title: string;
  grid: { width: number; height: number };
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
  intensity: 0,
};
