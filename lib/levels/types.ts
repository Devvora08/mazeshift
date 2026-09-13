import type { BlockPlan } from '../maze/world';
import type { MonsterType } from '../modules/monsters';
import type { ScrambleConfig } from '../modules/scramble';
import type { UtilityType } from '../modules/utilities';

export type { MonsterType, ScrambleConfig, UtilityType };

/** A level is its maze (blocks) plus which feature modules are active and how each is configured. */
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
}
