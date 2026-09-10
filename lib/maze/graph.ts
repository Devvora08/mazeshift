import type { Position } from './types';

export function posKey(p: Position): string {
  return `${p.x},${p.y}`;
}

/** Canonical, order-independent key for the edge between two adjacent cells. */
export function edgeKey(a: Position, b: Position): string {
  return posKey(a) < posKey(b) ? `${posKey(a)}-${posKey(b)}` : `${posKey(b)}-${posKey(a)}`;
}

export function inBounds(p: Position, width: number, height: number): boolean {
  return p.x >= 0 && p.x < width && p.y >= 0 && p.y < height;
}

export function neighbors(p: Position, width: number, height: number): Position[] {
  const candidates: Position[] = [
    { x: p.x, y: p.y - 1 },
    { x: p.x + 1, y: p.y },
    { x: p.x, y: p.y + 1 },
    { x: p.x - 1, y: p.y },
  ];
  return candidates.filter((c) => inBounds(c, width, height));
}

/** BFS over open edges. Returns true if `end` is reachable from `start`. */
export function isReachable(
  openEdges: ReadonlySet<string>,
  width: number,
  height: number,
  start: Position,
  end: Position
): boolean {
  const startKey = posKey(start);
  const endKey = posKey(end);
  if (startKey === endKey) return true;

  const visited = new Set<string>([startKey]);
  const queue: Position[] = [start];
  let head = 0;

  while (head < queue.length) {
    const current = queue[head++];
    for (const next of neighbors(current, width, height)) {
      if (!openEdges.has(edgeKey(current, next))) continue;
      const nextKey = posKey(next);
      if (visited.has(nextKey)) continue;
      if (nextKey === endKey) return true;
      visited.add(nextKey);
      queue.push(next);
    }
  }
  return false;
}
