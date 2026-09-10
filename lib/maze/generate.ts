import { edgeKey, neighbors, posKey } from './graph';
import { createRng, shuffle, type Rng } from './rng';
import type { Maze, Position } from './types';

export interface GenerateMazeOptions {
  width: number;
  height: number;
  seed: number;
  start?: Position;
  end?: Position;
  /** Fraction of extra (redundant) connections to open beyond the perfect-maze spanning tree, 0-1. */
  braidRatio?: number;
}

/** Randomized DFS (recursive backtracker) — produces a perfect maze: every cell reachable, no loops. */
function generateSpanningTree(width: number, height: number, rng: Rng): Set<string> {
  const openEdges = new Set<string>();
  const visited = new Set<string>();
  const start: Position = { x: 0, y: 0 };
  const stack: Position[] = [start];
  visited.add(posKey(start));

  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    const unvisitedNeighbors = shuffle(rng, neighbors(current, width, height)).filter(
      (n) => !visited.has(posKey(n))
    );

    if (unvisitedNeighbors.length === 0) {
      stack.pop();
      continue;
    }

    const next = unvisitedNeighbors[0];
    openEdges.add(edgeKey(current, next));
    visited.add(posKey(next));
    stack.push(next);
  }

  return openEdges;
}

/** Opens a random subset of the remaining closed edges to create loops/redundant routes. */
function braid(
  openEdges: Set<string>,
  width: number,
  height: number,
  rng: Rng,
  ratio: number
): void {
  const closedEdges: [Position, Position][] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = { x, y };
      const right = { x: x + 1, y };
      const down = { x, y: y + 1 };
      if (right.x < width && !openEdges.has(edgeKey(cell, right))) closedEdges.push([cell, right]);
      if (down.y < height && !openEdges.has(edgeKey(cell, down))) closedEdges.push([cell, down]);
    }
  }

  const toOpen = shuffle(rng, closedEdges).slice(0, Math.round(closedEdges.length * ratio));
  for (const [a, b] of toOpen) {
    openEdges.add(edgeKey(a, b));
  }
}

export function generateMaze(options: GenerateMazeOptions): Maze {
  const { width, height, seed, braidRatio = 0.15 } = options;
  const start = options.start ?? { x: 0, y: 0 };
  const end = options.end ?? { x: width - 1, y: height - 1 };
  const rng = createRng(seed);

  const openEdges = generateSpanningTree(width, height, rng);
  if (braidRatio > 0) braid(openEdges, width, height, rng, braidRatio);

  return { width, height, start, end, openEdges };
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}
