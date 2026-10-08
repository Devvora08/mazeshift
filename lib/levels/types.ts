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
  /**
   * When false or omitted, every monster is confined to the block it spawned in:
   * it never paths through a gateway, senses only a hero inside its block, and
   * Stalker alerts reach only that block. Set true to let monsters roam the world.
   */
  monstersCrossBlocks?: boolean;
  utilities: UtilityType[];
  inventoryCap: number;
}
