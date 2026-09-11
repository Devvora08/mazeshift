import { Path, Skia, type SkPath } from '@shopify/react-native-skia';
import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { cancelAnimation, Easing, runOnUI, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';
import { edgeKey, posKey } from '../lib/maze/graph';
import type { MazeBlock } from '../lib/maze/world';
import { planWallMotion, sampleWallMotion, sampleWallScene, WALL_SHIFT_MS,
  type WallScene, type WallSegment } from '../lib/maze/wallMotion';

/** One possible wall line segment (a cell's side). Geometry is fixed; whether it's "filled"
 *  (drawn as a wall) depends only on which maze state you check it against. */
interface WallSlot {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** null for a boundary/gateway side, which is always filled regardless of scrambling. */
  edge: string | null;
}

function enumerateWallSlots(block: MazeBlock, openSides: ReadonlySet<string>): WallSlot[] {
  const { maze } = block;
  const slots: WallSlot[] = [];

  for (const key of maze.activeCells) {
    const [x, y] = key.split(',').map(Number);
    const cell = { x, y };

    const top = { x, y: y - 1 };
    if (!openSides.has(`${x},${y}:up`)) {
      const boundary = !maze.activeCells.has(posKey(top));
      slots.push({ key: `${x},${y}:up`, x1: x, y1: y, x2: x + 1, y2: y, edge: boundary ? null : edgeKey(cell, top) });
    }

    const left = { x: x - 1, y };
    if (!openSides.has(`${x},${y}:left`)) {
      const boundary = !maze.activeCells.has(posKey(left));
      slots.push({ key: `${x},${y}:left`, x1: x, y1: y, x2: x, y2: y + 1, edge: boundary ? null : edgeKey(cell, left) });
    }

    const right = { x: x + 1, y };
    if (!openSides.has(`${x},${y}:right`)) {
      const boundary = !maze.activeCells.has(posKey(right));
      slots.push({
        key: `${x},${y}:right`,
        x1: x + 1,
        y1: y,
        x2: x + 1,
        y2: y + 1,
        edge: boundary ? null : edgeKey(cell, right),
      });
    }

    const bottom = { x, y: y + 1 };
    if (!openSides.has(`${x},${y}:down`)) {
      const boundary = !maze.activeCells.has(posKey(bottom));
      slots.push({
        key: `${x},${y}:down`,
        x1: x,
        y1: y + 1,
        x2: x + 1,
        y2: y + 1,
        edge: boundary ? null : edgeKey(cell, bottom),
      });
    }
  }

  const unique = new Map<string, WallSlot>();
  for (const slot of slots) {
    const identity = slot.edge ?? slot.key;
    if (!unique.has(identity)) unique.set(identity, { ...slot, key: identity });
  }
  return [...unique.values()];
}

function isFilled(slot: WallSlot, openEdges: ReadonlySet<string>): boolean {
  return slot.edge === null || !openEdges.has(slot.edge);
}

function pathFromSlots(slots: WallSegment[], ox: number, oy: number, cellSize: number): SkPath {
  'worklet';
  const pb = Skia.PathBuilder.Make();
  for (const s of slots) {
    pb.moveTo(ox + s.x1 * cellSize, oy + s.y1 * cellSize);
    pb.lineTo(ox + s.x2 * cellSize, oy + s.y2 * cellSize);
  }
  return pb.build();
}


export const BlockWalls = memo(function BlockWalls({ block, openSides, cellSize }: {
  block: MazeBlock;
  openSides: ReadonlySet<string>;
  cellSize: number;
}) {
  const ox = block.worldOffsetX * cellSize;
  const oy = block.worldOffsetY * cellSize;
  const allSlots = useMemo(() => enumerateWallSlots(block, openSides), [block.maze.activeCells, openSides]);
  const targets = useMemo(() => allSlots.filter(s => isFilled(s, block.maze.openEdges)),
    [allSlots, block.maze.openEdges]);
  const previousTargets = useRef(targets);
  const scene = useSharedValue<WallScene>({ fixed: targets, moving: [] });
  const progress = useSharedValue(1);

  useLayoutEffect(() => {
    if (previousTargets.current === targets) return;
    previousTargets.current = targets;
    // Sample an interrupted transition before replacing it. Scene and clock change together
    // on the UI thread, so the new maze cannot flash onscreen before the movement starts.
    runOnUI((next: WallSegment[]) => {
      'worklet';
      const visible = sampleWallScene(scene.value, progress.value);
      cancelAnimation(progress);
      const planned = planWallMotion(visible, next);
      scene.value = planned;
      progress.value = 0;
      progress.value = withTiming(1, { duration: WALL_SHIFT_MS, easing: Easing.linear });
    })(targets);
  }, [targets, scene, progress]);

  useEffect(() => () => cancelAnimation(progress), [progress]);

  const fixedPath = useDerivedValue(() => pathFromSlots(scene.value.fixed, ox, oy, cellSize));
  const movingPath = useDerivedValue(() => {
    const segments = scene.value.moving.map(item => sampleWallMotion(item, progress.value))
      .filter(s => Math.hypot(s.x2-s.x1, s.y2-s.y1) > 0.00001);
    return pathFromSlots(segments, ox, oy, cellSize);
  });

  return <>
    <Path path={fixedPath} color="#111111" style="stroke" strokeWidth={2.5} strokeJoin="round" />
    <Path path={movingPath} color="#111111" style="stroke" strokeWidth={2.5}
      strokeJoin="round" strokeCap="round" />
  </>;
});
