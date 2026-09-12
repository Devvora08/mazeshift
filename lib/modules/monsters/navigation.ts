import { edgeKey, posKey } from '../../maze/graph';
import { DIRECTION_DELTAS, type Direction, type MazeWorld } from '../../maze/world';
import type { MonsterType, WorldCell } from './types';

export const MONSTER_STEP_MS = 400;
export const BOMB_FUSE_MS = 1800;
export const TRACK_RADIUS: Record<MonsterType, number> = { hunter: 7, wraith: 3, brute: 7, stalker: 4 };
export const cellKey = (p: WorldCell): string => `${p.blockId}:${posKey(p.cell)}`;
export const sameCell = (a: WorldCell, b: WorldCell): boolean => cellKey(a) === cellKey(b);
export type Mobility = 'walk' | 'phase' | 'bomb';
export const mobilityFor = (type: MonsterType): Mobility => type === 'wraith' ? 'phase' : type === 'brute' ? 'bomb' : 'walk';
export interface Link { to: string; direction: Direction; wall: boolean }
interface Graph {
  cells: Map<string, WorldCell>;
  links: Map<string, Link[]>;
  fields: Map<string, Map<string, number>>;
  detectionFields: Map<string, Map<string, number>>;
}
const graphs = new WeakMap<MazeWorld, Graph>();

/** Immutable worlds invalidate the topology automatically after scramble/destroy/bomb. */
export function graphFor(world: MazeWorld): Graph {
  const existing = graphs.get(world);
  if (existing) return existing;
  const graph: Graph = { cells: new Map(), links: new Map(), fields: new Map(), detectionFields: new Map() };
  for (const block of world.blocks) {
    for (const key of block.maze.activeCells) {
      const [x, y] = key.split(',').map(Number);
      const at = { blockId: block.id, cell: { x, y } };
      const links: Link[] = [];
      for (const direction of Object.keys(DIRECTION_DELTAS) as Direction[]) {
        const delta = DIRECTION_DELTAS[direction];
        const cell = { x: x + delta.x, y: y + delta.y };
        if (block.maze.activeCells.has(posKey(cell))) {
          links.push({ to: cellKey({ blockId: block.id, cell }), direction,
            wall: !block.maze.openEdges.has(edgeKey(at.cell, cell)) });
        }
      }
      for (const gateway of world.gatewaysByBlock.get(block.id) ?? []) {
        if (posKey(gateway.fromCell) === key) links.push({
          to: cellKey({ blockId: gateway.toBlockId, cell: gateway.toCell }),
          direction: gateway.direction, wall: false,
        });
      }
      graph.cells.set(cellKey(at), at);
      graph.links.set(cellKey(at), links);
    }
  }
  graphs.set(world, graph);
  return graph;
}

class MinHeap {
  items: { key: string; cost: number }[] = [];
  push(item: { key: string; cost: number }) {
    const a = this.items; a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].cost <= item.cost) break;
      a[i] = a[p]; i = p;
    }
    a[i] = item;
  }
  pop() {
    const a = this.items, first = a[0], last = a.pop()!;
    if (a.length) {
      let i = 0;
      while (i * 2 + 1 < a.length) {
        let c = i * 2 + 1;
        if (c + 1 < a.length && a[c + 1].cost < a[c].cost) c++;
        if (last.cost <= a[c].cost) break;
        a[i] = a[c]; i = c;
      }
      a[i] = last;
    }
    return first;
  }
}

// Brute commits to direct pursuit even when bombing takes longer than a detour.
const costOf = (link: Link, mobility: Mobility) => link.wall && mobility === 'walk' ? Infinity : 1;

/** Reverse Dijkstra fields are shared by all pursuers with the same target/ability.
 * Gateway hops cost one step; a world-space Manhattan heuristic would be incorrect
 * for these links. A binary heap keeps large, multi-block searches O(E log V).
 */
export function distanceField(world: MazeWorld, target: WorldCell, mobility: Mobility): Map<string, number> {
  const graph = graphFor(world), key = `${mobility}:${cellKey(target)}`;
  const cached = graph.fields.get(key);
  if (cached) return cached;
  const distances = new Map<string, number>();
  const heap = new MinHeap();
  if (graph.cells.has(cellKey(target))) {
    distances.set(cellKey(target), 0); heap.push({ key: cellKey(target), cost: 0 });
  }
  while (heap.items.length) {
    const current = heap.pop();
    if (current.cost !== distances.get(current.key)) continue;
    for (const link of graph.links.get(current.key) ?? []) {
      const cost = current.cost + costOf(link, mobility);
      if (cost >= (distances.get(link.to) ?? Infinity)) continue;
      distances.set(link.to, cost); heap.push({ key: link.to, cost });
    }
  }
  // Bound memory while the hero changes cells and individual patrol targets change.
  if (graph.fields.size >= 24) graph.fields.delete(graph.fields.keys().next().value!);
  graph.fields.set(key, distances);
  return distances;
}

export function nextStep(world: MazeWorld, from: WorldCell, target: WorldCell, mobility: Mobility): Link | null {
  if (sameCell(from, target)) return null;
  const field = distanceField(world, target, mobility);
  let best: Link | null = null, bestCost = Infinity, bestDisplacement = Infinity;
  const graph = graphFor(world);
  const targetBlock = world.blocks.find(b => b.id === target.blockId)!;
  for (const link of graphFor(world).links.get(cellKey(from)) ?? []) {
    const cost = costOf(link, mobility) + (field.get(link.to) ?? Infinity);
    const candidate = graph.cells.get(link.to)!;
    const block = world.blocks.find(b => b.id === candidate.blockId)!;
    const displacement = (block.worldOffsetX + candidate.cell.x - targetBlock.worldOffsetX - target.cell.x) ** 2
      + (block.worldOffsetY + candidate.cell.y - targetBlock.worldOffsetY - target.cell.y) ** 2;
    if (cost < bestCost || (Number.isFinite(cost) && cost === bestCost && mobility !== 'walk' && displacement < bestDisplacement)) {
      bestCost = cost; best = link; bestDisplacement = displacement;
    }
  }
  return best;
}

/** Bounded proximity sensing, ignoring interior walls but respecting masks and
 * actual gateways. Shared once per tick rather than searching once per monster.
 */
export function detectionDistances(world: MazeWorld, hero: WorldCell): Map<string, number> {
  const graph = graphFor(world), heroKey = cellKey(hero);
  const cached = graph.detectionFields.get(heroKey);
  if (cached) return cached;
  const distances = new Map([[heroKey, 0]]), queue = [heroKey];
  for (let i = 0; i < queue.length; i++) {
    const key = queue[i], depth = distances.get(key)!;
    if (depth >= 7) continue;
    for (const link of graph.links.get(key) ?? []) {
      if (distances.has(link.to)) continue;
      distances.set(link.to, depth + 1); queue.push(link.to);
    }
  }
  if (graph.detectionFields.size >= 16) graph.detectionFields.delete(graph.detectionFields.keys().next().value!);
  graph.detectionFields.set(heroKey, distances);
  return distances;
}
