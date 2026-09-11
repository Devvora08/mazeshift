/** Wall geometry in maze-cell units. The renderer scales it to the viewport. */
export interface WallSegment {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface WallMotion {
  from: WallSegment;
  to: WallSegment;
  delay: number;
}

export interface WallScene {
  fixed: WallSegment[];
  moving: WallMotion[];
}

export const WALL_SHIFT_MS = 1050;

function distance(ax: number, ay: number, bx: number, by: number): number {
  'worklet';
  return Math.hypot(ax - bx, ay - by);
}

function reverse(s: WallSegment): WallSegment {
  'worklet';
  return { ...s, x1: s.x2, y1: s.y2, x2: s.x1, y2: s.y1 };
}

function aligned(a: WallSegment, b: WallSegment): boolean {
  'worklet';
  const direct = distance(a.x1, a.y1, b.x1, b.y1) + distance(a.x2, a.y2, b.x2, b.y2);
  const flipped = distance(a.x1, a.y1, b.x2, b.y2) + distance(a.x2, a.y2, b.x1, b.y1);
  return Math.min(direct, flipped) < 0.00001;
}

function motion(from: WallSegment, to: WallSegment, index: number): WallMotion {
  'worklet';
  // Anchor at the nearest endpoints: a shared corner becomes a true stationary hinge.
  const options = [
    { from, to }, { from, to: reverse(to) },
    { from: reverse(from), to }, { from: reverse(from), to: reverse(to) },
  ];
  let best = options[0];
  let cost = Infinity;
  for (const option of options) {
    const next = distance(option.from.x1, option.from.y1, option.to.x1, option.to.y1) * 10
      + distance(option.from.x2, option.from.y2, option.to.x2, option.to.y2);
    if (next < cost) { best = option; cost = next; }
  }
  return { ...best, delay: (index % 5) * 0.025 };
}

/** Match identical walls first, then nearby changed walls, preferring shared hinges. */
export function planWallMotion(current: WallSegment[], target: WallSegment[]): WallScene {
  'worklet';
  const fixed: WallSegment[] = [];
  const moving: WallMotion[] = [];
  const remaining = current.slice();
  const added: WallSegment[] = [];
  for (const wall of target) {
    const index = remaining.findIndex(s => aligned(s, wall));
    if (index >= 0) { fixed.push(wall); remaining.splice(index, 1); }
    else added.push(wall);
  }

  // Globally choose the closest pair before consuming either endpoint.
  const candidates: { source: number; target: number; cost: number }[] = [];
  for (let i = 0; i < remaining.length; i++) {
    for (let j = 0; j < added.length; j++) {
      const a = remaining[i];
      const b = added[j];
      const hingeDistance = Math.min(
        distance(a.x1, a.y1, b.x1, b.y1), distance(a.x1, a.y1, b.x2, b.y2),
        distance(a.x2, a.y2, b.x1, b.y1), distance(a.x2, a.y2, b.x2, b.y2),
      );
      const centerDistance = distance((a.x1+a.x2)/2, (a.y1+a.y2)/2, (b.x1+b.x2)/2, (b.y1+b.y2)/2);
      candidates.push({ source: i, target: j, cost: hingeDistance * 10 + centerDistance });
    }
  }
  candidates.sort((a, b) => a.cost - b.cost);
  const usedFrom = new Set<number>();
  const usedTo = new Set<number>();
  for (const pair of candidates) {
    if (usedFrom.has(pair.source) || usedTo.has(pair.target)) continue;
    usedFrom.add(pair.source);
    usedTo.add(pair.target);
    moving.push(motion(remaining[pair.source], added[pair.target], moving.length));
  }
  for (let i = 0; i < remaining.length; i++) {
    if (usedFrom.has(i)) continue;
    const from = remaining[i];
    moving.push({ from, to: { ...from, x2: from.x1, y2: from.y1 }, delay: (moving.length % 5) * 0.025 });
  }
  for (let i = 0; i < added.length; i++) {
    if (usedTo.has(i)) continue;
    const to = added[i];
    moving.push({ from: { ...to, x2: to.x1, y2: to.y1 }, to, delay: (moving.length % 5) * 0.025 });
  }
  return { fixed, moving };
}

/** Polar interpolation preserves rigid wall length during a turn; endpoints don't squash. */
export function sampleWallMotion(item: WallMotion, progress: number): WallSegment {
  'worklet';
  const { from, to } = item;
  const local = Math.min(1, Math.max(0, (progress - item.delay) / 0.9));
  if (local === 0) return from;
  if (local === 1) return to;
  const t = local < 0.5 ? 4 * local ** 3 : 1 - (-2 * local + 2) ** 3 / 2;
  const startLength = distance(from.x1, from.y1, from.x2, from.y2);
  const endLength = distance(to.x1, to.y1, to.x2, to.y2);
  let startAngle = Math.atan2(from.y2-from.y1, from.x2-from.x1);
  let endAngle = Math.atan2(to.y2-to.y1, to.x2-to.x1);
  if (startLength < 0.00001) startAngle = endAngle - Math.PI / 2;
  if (endLength < 0.00001) endAngle = startAngle + Math.PI / 2;
  const angleDelta = Math.atan2(Math.sin(endAngle-startAngle), Math.cos(endAngle-startAngle));
  const angle = startAngle + angleDelta * t;
  const length = startLength + (endLength-startLength) * t;
  const x1 = from.x1 + (to.x1-from.x1) * t;
  const y1 = from.y1 + (to.y1-from.y1) * t;
  return { key: to.key, x1, y1, x2: x1 + Math.cos(angle)*length, y2: y1 + Math.sin(angle)*length };
}

export function sampleWallScene(scene: WallScene, progress: number): WallSegment[] {
  'worklet';
  return [...scene.fixed, ...scene.moving.map(item => sampleWallMotion(item, progress))]
    .filter(s => distance(s.x1, s.y1, s.x2, s.y2) > 0.00001);
}
