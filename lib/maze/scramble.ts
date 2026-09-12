import { edgeKey, neighbors, posKey } from './graph';
import { shuffle, type Rng } from './rng';
import type { Maze, Position } from './types';

export interface ScrambleResult { maze: Maze; changedEdges: number; requestedEdges: number }

export function allAdjacentPairs(width: number, height: number, activeCells: ReadonlySet<string>): [Position, Position][] {
  const pairs: [Position, Position][] = [];
  for (const key of activeCells) {
    const [x, y] = key.split(',').map(Number);
    for (const next of [{ x: x + 1, y }, { x, y: y + 1 }]) {
      if (next.x < width && next.y < height && activeCells.has(posKey(next))) pairs.push([{ x, y }, next]);
    }
  }
  return pairs;
}

/** Permanent openings and occupied passages do not count toward the change budget. */
export function eligibleEdgeCount(maze: Maze, reserved: ReadonlySet<string> = new Set()): number {
  return allAdjacentPairs(maze.width, maze.height, maze.activeCells)
    .filter(([a, b]) => !maze.destroyedEdges?.has(edgeKey(a, b)) && !reserved.has(edgeKey(a, b))).length;
}

/** Rewire around a connected backbone. Open roughly half the budget, build a
 * spanning backbone, then close old passages outside it. Union/find avoids
 * repeated BFS per wall when every block changes at once. */
export function scrambleMaze(maze: Maze, rng: Rng, intensity: number, reserved: ReadonlySet<string> = new Set()): ScrambleResult {
  const pairs = allAdjacentPairs(maze.width, maze.height, maze.activeCells);
  const edges = shuffle(rng, pairs.map(([a, b]) => ({ key: edgeKey(a, b), a: posKey(a), b: posKey(b) })));
  const fixed = new Set([...(maze.destroyedEdges ?? []), ...reserved]);
  const eligible = edges.filter(e => !fixed.has(e.key));
  const requestedEdges = Math.min(eligible.length, Math.max(0, Math.round(intensity)));
  if (!requestedEdges) return { maze, changedEdges: 0, requestedEdges };
  const closed = eligible.filter(e => !maze.openEdges.has(e.key));
  const oldOpen = edges.filter(e => maze.openEdges.has(e.key));
  let openingCount = Math.min(closed.length, Math.ceil(requestedEdges / 2));
  let removable: typeof edges = [];

  while (true) {
    const parent = new Map([...maze.activeCells].map(key => [key, key]));
    const rank = new Map<string, number>();
    const find = (key: string): string => {
      let root = key;
      while (parent.get(root)! !== root) root = parent.get(root)!;
      while (parent.get(key)! !== key) { const next = parent.get(key)!; parent.set(key, root); key = next; }
      return root;
    };
    const join = (a: string, b: string) => {
      let x = find(a), y = find(b);
      if (x === y) return false;
      if ((rank.get(x) ?? 0) < (rank.get(y) ?? 0)) [x, y] = [y, x];
      parent.set(y, x);
      if ((rank.get(x) ?? 0) === (rank.get(y) ?? 0)) rank.set(x, (rank.get(x) ?? 0) + 1);
      return true;
    };
    const backbone = new Set<string>();
    for (const edge of edges) if (fixed.has(edge.key)) { backbone.add(edge.key); join(edge.a, edge.b); }
    for (const edge of closed.slice(0, openingCount)) { backbone.add(edge.key); join(edge.a, edge.b); }
    for (const edge of oldOpen) if (join(edge.a, edge.b)) backbone.add(edge.key);
    removable = oldOpen.filter(e => !backbone.has(e.key) && !fixed.has(e.key));
    const deficit = requestedEdges - openingCount - removable.length;
    if (deficit <= 0 || openingCount === closed.length) break;
    openingCount = Math.min(closed.length, openingCount + deficit);
  }

  const openEdges = new Set(maze.openEdges);
  for (const edge of edges) if (fixed.has(edge.key)) openEdges.add(edge.key);
  for (const edge of closed.slice(0, openingCount)) openEdges.add(edge.key);
  const closingCount = Math.min(removable.length, requestedEdges - openingCount);
  for (const edge of removable.slice(0, closingCount)) openEdges.delete(edge.key);
  return { maze: { ...maze, openEdges }, changedEdges: openingCount + closingCount, requestedEdges };
}

/** Every cell must remain reachable, including charms and all gateways. */
export function assertMazeIsFair(maze: Maze): void {
  const seen = new Set([posKey(maze.start)]), queue = [maze.start];
  for (let i = 0; i < queue.length; i++) for (const next of neighbors(queue[i], maze.width, maze.height, maze.activeCells)) {
    const key = posKey(next);
    if (seen.has(key) || !maze.openEdges.has(edgeKey(queue[i], next))) continue;
    seen.add(key); queue.push(next);
  }
  if (seen.size !== maze.activeCells.size) throw new Error('Scrambled maze contains unreachable cells');
}
