import { edgeKey, neighbors, posKey } from '../maze/graph';
import type { MazeWorld } from '../maze/world';
import type { Monster } from '../modules/monsters';
import type { UtilityType } from '../modules/utilities';

/** One of every allowed charm per block, spread through reachable corridors.
 * Deterministic placement does not consume the scramble RNG. */
export function campaignPickups(world: MazeWorld, allowed: UtilityType[], monsters: Monster[]): Map<string, UtilityType> {
  const pickups = new Map<string, UtilityType>();
  const types = [...new Set(allowed)];
  if (!types.length) return pickups;
  for (const block of world.blocks) {
    const excluded = new Set([posKey(block.maze.start), posKey(block.maze.end),
      ...(world.gatewaysByBlock.get(block.id) ?? []).map(g => posKey(g.fromCell)),
      ...monsters.filter(m => m.location.blockId === block.id).map(m => posKey(m.location.cell))]);
    const visited = new Set([posKey(block.maze.start)]), queue = [block.maze.start];
    for (let i = 0; i < queue.length; i++) for (const next of neighbors(queue[i], block.maze.width, block.maze.height, block.maze.activeCells)) {
      const key = posKey(next);
      if (visited.has(key) || !block.maze.openEdges.has(edgeKey(queue[i], next))) continue;
      visited.add(key); queue.push(next);
    }
    let candidates = queue.filter(p => !excluded.has(posKey(p)));
    if (candidates.length >= types.length + 2) candidates = candidates.slice(2);
    const count = Math.min(types.length, candidates.length);
    for (let i = 0; i < count; i++) {
      const p = candidates[Math.floor(i * candidates.length / count)];
      pickups.set(`${block.id}:${posKey(p)}`, types[(i + block.index) % types.length]);
    }
  }
  return pickups;
}
