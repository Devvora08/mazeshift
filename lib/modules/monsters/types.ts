import type { Position } from '../../maze/types';
import type { Direction } from '../../maze/world';

/** wraith is the campaign's existing name for the Ghost artwork. */
export type MonsterType = 'hunter' | 'wraith' | 'brute' | 'stalker';
export interface WorldCell { blockId: string; cell: Position }
export interface Travel { from: WorldCell; to: WorldCell; startedAt: number; duration: number }
export interface Monster {
  id: string;
  type: MonsterType;
  location: WorldCell;
  facing: Direction;
  travel: Travel | null;
  bomb: { target: WorldCell; startedAt: number; detonatesAt: number } | null;
  blast: { from: WorldCell; to: WorldCell; until: number } | null;
  mode: 'roam' | 'chase' | 'search' | 'bomb';
  lastKnown: WorldCell | null;
  patrolTarget: WorldCell | null;
  patrolSequence: number;
}
