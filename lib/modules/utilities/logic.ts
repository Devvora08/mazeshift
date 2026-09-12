import { edgeKey, posKey } from '../../maze/graph';
import type { Maze, Position } from '../../maze/types';
import { DIRECTION_DELTAS, type Direction, type MazeBlock } from '../../maze/world';

export interface WallTarget {
  edge: string;
  neighbor: Position;
}

/** The interior wall (if any) directly in front of `cell` facing `dir` — null if that side is the
 *  block's own boundary (never a valid Phase/Destroy target, so players can't break out of the
 *  maze) or if there's no wall there to begin with. */
export function findWallTarget(block: MazeBlock, cell: Position, dir: Direction): WallTarget | null {
  const delta = DIRECTION_DELTAS[dir];
  const neighbor: Position = { x: cell.x + delta.x, y: cell.y + delta.y };
  if (!block.maze.activeCells.has(posKey(neighbor))) return null;

  const edge = edgeKey(cell, neighbor);
  if (block.maze.openEdges.has(edge)) return null;
  return { edge, neighbor };
}

/** Find an adjacent interior wall without using stroke coordinates. The hero's
 * facing side wins, followed by the two side walls and then the wall behind. */
export function findNearestWallTarget(block: MazeBlock, cell: Position, facing: Direction): WallTarget | null {
  const order: Record<Direction, Direction[]> = {
    up: ['up', 'left', 'right', 'down'],
    right: ['right', 'up', 'down', 'left'],
    down: ['down', 'right', 'left', 'up'],
    left: ['left', 'down', 'up', 'right'],
  };
  for (const direction of order[facing]) {
    const target = findWallTarget(block, cell, direction);
    if (target) return target;
  }
  return null;
}

/** Permanently opens the targeted wall — same "open an edge" operation scrambleMaze uses, so it's
 *  always safe (adding a passage never disconnects the maze). */
export function applyDestroy(maze: Maze, target: WallTarget): Maze {
  const openEdges = new Set(maze.openEdges);
  openEdges.add(target.edge);
  const destroyedEdges = new Set(maze.destroyedEdges);
  destroyedEdges.add(target.edge);
  return { ...maze, openEdges, destroyedEdges };
}
