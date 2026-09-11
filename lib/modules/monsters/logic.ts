import { edgeKey } from '../../maze/graph';
import type { MazeWorld } from '../../maze/world';
import { BOMB_FUSE_MS, MONSTER_STEP_MS, TRACK_RADIUS, cellKey, sameCell, graphFor,
  detectionDistances, distanceField, mobilityFor, nextStep } from './navigation';
import type { Monster, MonsterType, Travel, WorldCell } from './types';

export function spawnMonsters(world: MazeWorld, types: MonsterType[]): Monster[] {
  if (!types.length) return [];
  const start = { blockId: world.startBlockId, cell: world.blocks[0].maze.start };
  const safety = distanceField(world, start, 'phase');
  return world.blocks.flatMap((block, index) => {
    const anchor = { blockId: block.id, cell: block.maze.end };
    const fromExit = distanceField(world, anchor, 'walk');
    const candidates = [...graphFor(world).cells.values()].filter(p => p.blockId === block.id
      && (safety.get(cellKey(p)) ?? 0) > 8 && fromExit.has(cellKey(p)));
    candidates.sort((a, b) => fromExit.get(cellKey(a))! - fromExit.get(cellKey(b))!);
    const location = candidates[0];
    if (!location) return [];
    return [{ id: `monster-${index}`, type: types[index % types.length], location, facing: 'down' as const,
      travel: null, bomb: null, blast: null, mode: 'roam' as const, lastKnown: null,
      patrolTarget: null, patrolSequence: index }];
  });
}

function patrol(world: MazeWorld, monster: Monster): WorldCell | null {
  // Choose a reachable destination, favoring a meaningful walk over a one-cell oscillation.
  const field = distanceField(world, monster.location, 'walk');
  const candidates = [...graphFor(world).cells.values()].filter(p => p.blockId === monster.location.blockId
    && (field.get(cellKey(p)) ?? Infinity) >= 4 && (field.get(cellKey(p)) ?? Infinity) <= 12);
  if (!candidates.length) {
    const link = (graphFor(world).links.get(cellKey(monster.location)) ?? []).find(l => !l.wall);
    return link ? graphFor(world).cells.get(link.to)! : null;
  }
  return candidates[((monster.patrolSequence + 1) * 37) % candidates.length];
}

/** Opens both sides via the canonical edge; permanently immune to future scrambling. */
export function breakWall(world: MazeWorld, from: WorldCell, to: WorldCell): MazeWorld {
  if (from.blockId !== to.blockId || Math.abs(from.cell.x - to.cell.x) + Math.abs(from.cell.y - to.cell.y) !== 1) return world;
  const index = world.blocks.findIndex(b => b.id === from.blockId);
  if (index < 0) return world;
  const block = world.blocks[index];
  if (!block.maze.activeCells.has(`${to.cell.x},${to.cell.y}`)) return world;
  const key = edgeKey(from.cell, to.cell), blocks = world.blocks.slice();
  const openEdges = new Set(block.maze.openEdges); openEdges.add(key);
  const destroyedEdges = new Set(block.maze.destroyedEdges); destroyedEdges.add(key);
  blocks[index] = { ...block, maze: { ...block.maze, openEdges, destroyedEdges } };
  return { ...world, blocks };
}

export function tickMonsters(world: MazeWorld, monsters: Monster[], hero: WorldCell, now: number) {
  if (!monsters.length) return { world, monsters, alert: false };
  const distances = detectionDistances(world, hero);
  const spots = (m: Monster) => {
    if (!m.travel) return (distances.get(cellKey(m.location)) ?? Infinity) <= TRACK_RADIUS[m.type];
    const p = progress(m.travel, now);
    // Distance along the current edge: no one-cell jumps in detection at arrival.
    const distance = Math.min((distances.get(cellKey(m.travel.from)) ?? Infinity) + p,
      (distances.get(cellKey(m.travel.to)) ?? Infinity) + 1 - p);
    return distance <= TRACK_RADIUS[m.type];
  };
  const alert = monsters.some(m => m.type === 'stalker' && spots(m));
  let nextWorld = world;
  const next = monsters.map(original => {
    let m = original;
    const change = (patch: Partial<Monster>) => { m = { ...m, ...patch }; };
    if (m.blast && now >= m.blast.until) change({ blast: null });
    const detected = alert || spots(m);
    if (detected && (!m.lastKnown || !sameCell(m.lastKnown, hero))) change({ lastKnown: hero, patrolTarget: null });
    const intent = m.bomb ? 'bomb' : detected ? 'chase' : m.lastKnown ? 'search' : 'roam';
    if (m.mode !== intent) change({ mode: intent });
    if (m.travel) {
      if (now < m.travel.startedAt + m.travel.duration) return m;
      change({ location: m.travel.to, travel: null });
    }
    if (m.bomb) {
      if (now < m.bomb.detonatesAt) return m;
      const target = m.bomb.target;
      nextWorld = breakWall(nextWorld, m.location, target);
      change({ bomb: null, blast: { from: m.location, to: target, until: now + 500 } });
    }
    if (m.lastKnown && sameCell(m.location, m.lastKnown) && !detected) change({ lastKnown: null });
    const mode = detected ? 'chase' : m.lastKnown ? 'search' : 'roam';
    if (m.mode !== mode) change({ mode });
    if (!m.lastKnown && (!m.patrolTarget || sameCell(m.location, m.patrolTarget))) {
      change({ patrolTarget: patrol(nextWorld, m), patrolSequence: m.patrolSequence + 1 });
    }
    const target = m.lastKnown ?? m.patrolTarget;
    let link = target ? nextStep(nextWorld, m.location, target, m.lastKnown ? mobilityFor(m.type) : 'walk') : null;
    if (!link && target && !sameCell(m.location, target)) {
      // A scramble can isolate the old target. Roam within the reachable component.
      change({ lastKnown: null, patrolTarget: patrol(nextWorld, m), patrolSequence: m.patrolSequence + 1, mode: 'roam' });
      link = m.patrolTarget ? nextStep(nextWorld, m.location, m.patrolTarget, 'walk') : null;
    }
    if (link) {
      const to = graphFor(nextWorld).cells.get(link.to)!;
      change({ facing: link.direction });
      if (link.wall && m.type === 'brute') {
        change({ mode: 'bomb', bomb: { target: to, startedAt: now, detonatesAt: now + BOMB_FUSE_MS } });
      } else change({ travel: { from: m.location, to, startedAt: now, duration: MONSTER_STEP_MS } });
    }
    return m;
  });
  return { world: nextWorld, monsters: next.every((m, i) => m === monsters[i]) ? monsters : next, alert };
}

function progress(travel: Travel, now: number): number {
  return Math.max(0, Math.min(1, (now - travel.startedAt) / travel.duration));
}

/** Continuous graph-space contact: handles swaps/head-on collisions, shared junctions
 * and gateway crossings without killing through a neighboring solid wall.
 * Both trajectories are linear on [start,end]; absolute linear distance reaches
 * its minimum at an endpoint or zero crossing. The tick never spans a new step.
 */
export function touches(a: WorldCell, at: Travel | null, b: WorldCell, bt: Travel | null, start: number, end: number): boolean {
  const af = at?.from ?? a, az = at?.to ?? a, bf = bt?.from ?? b, bz = bt?.to ?? b;
  const ap = (t: number) => at ? progress(at, t) : 0;
  const bp = (t: number) => bt ? progress(bt, t) : 0;
  const contact = 0.22;
  if ((sameCell(af, bf) && sameCell(az, bz)) || (sameCell(af, bz) && sameCell(az, bf))) {
    const reversed = !sameCell(af, bf);
    const d = (t: number) => ap(t) - (reversed ? 1 - bp(t) : bp(t));
    const x = d(start), y = d(end);
    if (x * y <= 0 || Math.min(Math.abs(x), Math.abs(y)) <= contact) return true;
  }
  for (const endpoint of [af, az]) {
    if (!sameCell(endpoint, bf) && !sameCell(endpoint, bz)) continue;
    const distance = (t: number) => (sameCell(af, az) ? 0 : sameCell(endpoint, af) ? ap(t) : 1 - ap(t))
      + (sameCell(bf, bz) ? 0 : sameCell(endpoint, bf) ? bp(t) : 1 - bp(t));
    if (Math.min(distance(start), distance(end)) <= contact) return true;
  }
  return false;
}
