import { edgeKey, neighbors, posKey } from './graph';
import { createRng, shuffle, type Rng } from './rng';
import { generateShapeMask, type ShapeType } from './shapes';
import type { Maze, Position } from './types';

export interface GenerateMazeOptions {
  width: number;
  height: number;
  seed: number;
  start?: Position;
  end?: Position;
  /** Fraction of extra (redundant) connections to open beyond the perfect-maze spanning tree, 0-1. */
  braidRatio?: number;
  /** Non-rectangular silhouette; defaults to a full rectangle. `start`/`end` must fall within it. */
  shape?: ShapeType;
  /** Pre-computed mask (e.g. shared with gateway placement elsewhere) — skips shape generation entirely. */
  activeCells?: Set<string>;
}

function fullRectMask(width: number, height: number): Set<string> {
  const mask = new Set<string>();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) mask.add(posKey({ x, y }));
  }
  return mask;
}

/** Randomized DFS (recursive backtracker) — produces a perfect maze: every active cell reachable, no loops. */
function generateSpanningTree(
  width: number,
  height: number,
  rng: Rng,
  activeCells: ReadonlySet<string>,
  start: Position
): Set<string> {
  const openEdges = new Set<string>();
  const visited = new Set<string>();
  const stack: Position[] = [start];
  visited.add(posKey(start));

  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    const unvisitedNeighbors = shuffle(rng, neighbors(current, width, height, activeCells)).filter(
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
  ratio: number,
  activeCells: ReadonlySet<string>
): void {
  const closedEdges: [Position, Position][] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!activeCells.has(posKey({ x, y }))) continue;
      const cell = { x, y };
      const right = { x: x + 1, y };
      const down = { x, y: y + 1 };
      if (right.x < width && activeCells.has(posKey(right)) && !openEdges.has(edgeKey(cell, right))) {
        closedEdges.push([cell, right]);
      }
      if (down.y < height && activeCells.has(posKey(down)) && !openEdges.has(edgeKey(cell, down))) {
        closedEdges.push([cell, down]);
      }
    }
  }

  const toOpen = shuffle(rng, closedEdges).slice(0, Math.round(closedEdges.length * ratio));
  for (const [a, b] of toOpen) {
    openEdges.add(edgeKey(a, b));
  }
}

/** BFS from `start` over 4-adjacency within `activeCells`, ignoring walls — used to validate/repair shape masks. */
function connectedRegion(
  width: number,
  height: number,
  activeCells: ReadonlySet<string>,
  start: Position
): Set<string> {
  const visited = new Set<string>([posKey(start)]);
  const queue: Position[] = [start];
  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];
    for (const n of neighbors(current, width, height, activeCells)) {
      const key = posKey(n);
      if (visited.has(key)) continue;
      visited.add(key);
      queue.push(n);
    }
  }
  return visited;
}

export function generateMaze(options: GenerateMazeOptions): Maze {
  const { width, height, seed, braidRatio = 0.15, shape } = options;
  const start = options.start ?? { x: 0, y: 0 };
  const end = options.end ?? { x: width - 1, y: height - 1 };
  const rng = createRng(seed);

  let activeCells =
    options.activeCells ?? (shape ? generateShapeMask(width, height, shape, rng) : fullRectMask(width, height));

  // A shape mask is generated independently of start/end, so on rare occasions the requested
  // start or end can fall outside the kept region (or its own disconnected pocket). Fall back to
  // whichever connected region actually contains `start` — guarantees generation never crashes
  // and the maze is always fully connected by construction.
  if (!activeCells.has(posKey(start)) || !activeCells.has(posKey(end))) {
    activeCells = fullRectMask(width, height);
  } else {
    const reachableFromStart = connectedRegion(width, height, activeCells, start);
    if (!reachableFromStart.has(posKey(end))) {
      activeCells = fullRectMask(width, height);
    }
  }

  const openEdges = generateSpanningTree(width, height, rng, activeCells, start);
  if (braidRatio > 0) braid(openEdges, width, height, rng, braidRatio, activeCells);

  return { width, height, start, end, openEdges, activeCells };
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}
