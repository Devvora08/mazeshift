import { edgeKey, neighbors, posKey } from '../maze/graph';
import type { Maze, Position } from '../maze/types';
import { NO_SCRAMBLE } from '../modules/scramble';
import type { UtilityType } from '../modules/utilities';
import type { LevelConfig } from './types';

/** Not part of the 20-level roadmap — a sandbox for trying out utilities without any pressure. */
export const PRACTICE_LEVEL: LevelConfig = {
  id: 0,
  chapter: 1,
  title: 'Practice',
  blocks: [{ width: 12, height: 14, shape: 'rect' }],
  scramble: NO_SCRAMBLE,
  monsters: [],
  utilities: ['phase', 'destroy', 'scramble', 'dash', 'shield', 'trap'],
  inventoryCap: 6,
};

/** BFS visitation order from `start` (excluding start) — used to place pickups at guaranteed-
 *  reachable spots instead of hardcoded coordinates that could land outside the generated shape. */
function bfsOrder(maze: Maze, start: Position): Position[] {
  const order: Position[] = [];
  const visited = new Set<string>([posKey(start)]);
  const queue: Position[] = [start];
  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];
    for (const next of neighbors(current, maze.width, maze.height, maze.activeCells)) {
      if (!maze.openEdges.has(edgeKey(current, next))) continue;
      const key = posKey(next);
      if (visited.has(key)) continue;
      visited.add(key);
      order.push(next);
      queue.push(next);
    }
  }
  return order;
}

export function practicePickups(maze: Maze): { cell: Position; type: UtilityType }[] {
  const order = bfsOrder(maze, maze.start);
  const pickups: { cell: Position; type: UtilityType }[] = [];
  PRACTICE_LEVEL.utilities.forEach((type, index) => {
    if (order[2 + index * 4]) pickups.push({ cell: order[2 + index * 4], type });
  });
  return pickups;
}
