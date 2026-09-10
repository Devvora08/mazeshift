import { Atlas, Canvas, Circle, Group, Path, Skia, rect, useImage, type SkPath } from '@shopify/react-native-skia';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  Easing,
  runOnJS,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { edgeKey, posKey } from '../lib/maze/graph';
import { HERO_SHEETS, type HeroAnimationName } from '../lib/sprites/heroFrames';
import type { Direction, MazeBlock, MazeWorld } from '../lib/maze/world';
import type { Position } from '../lib/maze/types';
import { useSpriteLoop } from '../hooks/useSpriteLoop';

interface WorldCanvasProps {
  world: MazeWorld;
  currentBlockId: string;
  heroCell: Position;
  facing: Direction;
  /** Whether the player is currently holding a movement direction (drives idle vs. run sprite —
   *  intentionally NOT the same as "a single step's slide animation is in flight", which flips
   *  true/false every ~220ms during continuous movement and would flicker the sprite sheet). */
  isHolding: boolean;
  width: number;
  height: number;
}

const RUN_FPS = 12;
const IDLE_FPS = 6;
const HERO_HEIGHT_IN_CELLS = 1.7;
const CAMERA_DURATION = 700;
const MOVE_DURATION = 200;

function cellSizeForWorld(world: MazeWorld, viewportWidth: number, viewportHeight: number): number {
  const maxBlockWidth = Math.max(...world.blocks.map((b) => b.maze.width));
  const maxBlockHeight = Math.max(...world.blocks.map((b) => b.maze.height));
  // A little breathing room so a block never touches the viewport edge.
  return Math.min(viewportWidth / (maxBlockWidth + 1), viewportHeight / (maxBlockHeight + 1));
}

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

  return slots;
}

function isFilled(slot: WallSlot, openEdges: ReadonlySet<string>): boolean {
  return slot.edge === null || !openEdges.has(slot.edge);
}

function pathFromSlots(slots: WallSlot[], ox: number, oy: number, cellSize: number): SkPath {
  const pb = Skia.PathBuilder.Make();
  for (const s of slots) {
    pb.moveTo(ox + s.x1 * cellSize, oy + s.y1 * cellSize);
    pb.lineTo(ox + s.x2 * cellSize, oy + s.y2 * cellSize);
  }
  return pb.build();
}

const SCRAMBLE_TRANSITION_MS = 380;

interface WallTransition {
  appearing: WallSlot[];
  disappearing: WallSlot[];
}

const BlockWalls = memo(function BlockWalls({
  block,
  openSides,
  cellSize,
}: {
  block: MazeBlock;
  openSides: ReadonlySet<string>;
  cellSize: number;
}) {
  const ox = block.worldOffsetX * cellSize;
  const oy = block.worldOffsetY * cellSize;

  // Slot geometry only depends on the block's shape/gateways, which never change after
  // generation — activeCells keeps the same Set reference across scrambles (scrambleMaze only
  // replaces openEdges), so this is effectively computed once per block.
  const allSlots = useMemo(() => enumerateWallSlots(block, openSides), [block.maze.activeCells, openSides]);

  // On a scramble, only the wall slots whose filled-state actually changed should animate —
  // everything else stays perfectly still, so the player watches specific walls open/close in
  // place instead of the whole maze blinking away and back.
  const prevOpenEdgesRef = useRef(block.maze.openEdges);
  const [transition, setTransition] = useState<WallTransition | null>(null);
  const appearOpacity = useSharedValue(1);
  const disappearOpacity = useSharedValue(1);

  useEffect(() => {
    if (prevOpenEdgesRef.current === block.maze.openEdges) return;
    const oldEdges = prevOpenEdgesRef.current;
    const newEdges = block.maze.openEdges;
    prevOpenEdgesRef.current = newEdges;

    const appearing = allSlots.filter((s) => !isFilled(s, oldEdges) && isFilled(s, newEdges));
    const disappearing = allSlots.filter((s) => isFilled(s, oldEdges) && !isFilled(s, newEdges));
    if (appearing.length === 0 && disappearing.length === 0) return;

    setTransition({ appearing, disappearing });
    disappearOpacity.value = 1;
    disappearOpacity.value = withTiming(0, { duration: SCRAMBLE_TRANSITION_MS, easing: Easing.inOut(Easing.ease) });
    appearOpacity.value = 0;
    appearOpacity.value = withTiming(
      1,
      { duration: SCRAMBLE_TRANSITION_MS, easing: Easing.inOut(Easing.ease) },
      (finished) => {
        if (finished) runOnJS(setTransition)(null);
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.maze.openEdges, allSlots]);

  const transitioningKeys = useMemo(
    () => (transition ? new Set([...transition.appearing, ...transition.disappearing].map((s) => s.key)) : null),
    [transition]
  );

  // Everything NOT currently mid-transition — drawn once, statically, never re-animated.
  const staticPath = useMemo(() => {
    const filled = allSlots.filter((s) => isFilled(s, block.maze.openEdges) && !transitioningKeys?.has(s.key));
    return pathFromSlots(filled, ox, oy, cellSize);
  }, [allSlots, block.maze.openEdges, transitioningKeys, ox, oy, cellSize]);

  const appearingPath = useMemo(
    () => (transition ? pathFromSlots(transition.appearing, ox, oy, cellSize) : null),
    [transition, ox, oy, cellSize]
  );
  const disappearingPath = useMemo(
    () => (transition ? pathFromSlots(transition.disappearing, ox, oy, cellSize) : null),
    [transition, ox, oy, cellSize]
  );

  return (
    <>
      <Path path={staticPath} color="#111111" style="stroke" strokeWidth={2.5} strokeJoin="round" />
      {disappearingPath && (
        <Path
          path={disappearingPath}
          color="#111111"
          style="stroke"
          strokeWidth={2.5}
          strokeJoin="round"
          opacity={disappearOpacity}
        />
      )}
      {appearingPath && (
        <Path
          path={appearingPath}
          color="#111111"
          style="stroke"
          strokeWidth={2.5}
          strokeJoin="round"
          opacity={appearOpacity}
        />
      )}
    </>
  );
});

function ExitRadar({ x, y, cellSize }: { x: number; y: number; cellSize: number }) {
  const progressA = useSharedValue(0);
  const progressB = useSharedValue(0);
  const progressC = useSharedValue(0);

  useEffect(() => {
    const ping = () => withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.ease) }), -1);

    progressA.value = ping();
    // Stagger the other two rings so they ping in sequence rather than in lockstep.
    const t1 = setTimeout(() => {
      progressB.value = ping();
    }, 600);
    const t2 = setTimeout(() => {
      progressC.value = ping();
    }, 1200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const maxRadius = cellSize * 2.2;
  const radiusA = useDerivedValue(() => 2 + progressA.value * maxRadius);
  const radiusB = useDerivedValue(() => 2 + progressB.value * maxRadius);
  const radiusC = useDerivedValue(() => 2 + progressC.value * maxRadius);
  const opacityA = useDerivedValue(() => 1 - progressA.value);
  const opacityB = useDerivedValue(() => 1 - progressB.value);
  const opacityC = useDerivedValue(() => 1 - progressC.value);

  return (
    <>
      <Circle cx={x} cy={y} r={radiusA} color="#111111" style="stroke" strokeWidth={2} opacity={opacityA} />
      <Circle cx={x} cy={y} r={radiusB} color="#111111" style="stroke" strokeWidth={2} opacity={opacityB} />
      <Circle cx={x} cy={y} r={radiusC} color="#111111" style="stroke" strokeWidth={2} opacity={opacityC} />
      <Circle cx={x} cy={y} r={cellSize * 0.16} color="#111111" />
    </>
  );
}

export const WorldCanvas = memo(function WorldCanvas({
  world,
  currentBlockId,
  heroCell,
  facing,
  isHolding,
  width,
  height,
}: WorldCanvasProps) {
  const cellSize = useMemo(() => cellSizeForWorld(world, width, height), [world, width, height]);

  const currentBlock = world.blocks.find((b) => b.id === currentBlockId) ?? world.blocks[0];
  const endBlock = world.blocks[world.blocks.length - 1];

  // Gateway "open side" lookups per block, computed once per world (never changes after
  // generation) rather than rebuilt inline every render — that rebuild was invalidating every
  // block's memoized wall path on every single sprite frame tick.
  const openSidesByBlock = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const block of world.blocks) {
      const gateways = world.gatewaysByBlock.get(block.id) ?? [];
      map.set(block.id, new Set(gateways.map((g) => `${g.fromCell.x},${g.fromCell.y}:${g.direction}`)));
    }
    return map;
  }, [world]);

  // Camera pans (translate only, no zoom) so the current block's center sits in the viewport center.
  const cameraX = useSharedValue(0);
  const cameraY = useSharedValue(0);
  const cameraInitialized = useSharedValue(false);

  useEffect(() => {
    // Anchor the current block near the viewport's top rather than fully centering it — full
    // centering left a symmetric gap around every block that isn't exactly viewport-shaped, which
    // read as dead space right under the header. Splitting the leftover space (mostly toward the
    // bottom, a little toward the top) balances the two complaints.
    const marginX = cellSize * 0.6;
    const leftoverY = height - currentBlock.maze.height * cellSize;
    const marginY = Math.max(cellSize * 0.6, leftoverY * 0.25);
    const targetX = marginX - currentBlock.worldOffsetX * cellSize;
    const targetY = marginY - currentBlock.worldOffsetY * cellSize;
    if (!cameraInitialized.value) {
      cameraX.value = targetX;
      cameraY.value = targetY;
      cameraInitialized.value = true;
    } else {
      cameraX.value = withTiming(targetX, { duration: CAMERA_DURATION, easing: Easing.inOut(Easing.cubic) });
      cameraY.value = withTiming(targetY, { duration: CAMERA_DURATION, easing: Easing.inOut(Easing.cubic) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBlockId, cellSize, width, height]);

  const cameraTransform = useDerivedValue(() => [
    { translateX: cameraX.value },
    { translateY: cameraY.value },
  ]);

  // Hero world position, tweened smoothly between cells (and across block transitions).
  const heroWorldX = useSharedValue(
    (currentBlock.worldOffsetX + heroCell.x + 0.5) * cellSize
  );
  const heroWorldY = useSharedValue((currentBlock.worldOffsetY + heroCell.y + 1) * cellSize);
  const heroInitialized = useSharedValue(false);

  useEffect(() => {
    const targetX = (currentBlock.worldOffsetX + heroCell.x + 0.5) * cellSize;
    const targetY = (currentBlock.worldOffsetY + heroCell.y + 1) * cellSize;
    if (!heroInitialized.value) {
      heroWorldX.value = targetX;
      heroWorldY.value = targetY;
      heroInitialized.value = true;
    } else {
      heroWorldX.value = withTiming(targetX, { duration: MOVE_DURATION, easing: Easing.linear });
      heroWorldY.value = withTiming(targetY, { duration: MOVE_DURATION, easing: Easing.linear });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroCell.x, heroCell.y, currentBlockId, cellSize]);

  const animationName: HeroAnimationName = isHolding ? facing : 'idle';
  const sheet = HERO_SHEETS[animationName];
  const fps = animationName === 'idle' ? IDLE_FPS : RUN_FPS;
  const frameIndexSV = useSpriteLoop(sheet.frames.length, fps);
  // Every frame in a given sheet shares the same source height, so scale only depends on
  // which sheet is active (idle vs a run direction) — safe to compute per-render, not per-frame.
  const heroScale = (cellSize * HERO_HEIGHT_IN_CELLS) / sheet.frames[0].height;

  const heroImage = useImage(sheet.asset);
  // Both read frameIndexSV directly, so frame-swapping (up to 12x/sec while running) never
  // triggers a React re-render — it stays entirely on the UI thread, same as the position tween.
  const heroSprites = useDerivedValue(() => {
    const f = sheet.frames[frameIndexSV.value] ?? sheet.frames[0];
    return [rect(f.x, f.y, f.width, f.height)];
  });
  const heroTransforms = useDerivedValue(() => {
    const f = sheet.frames[frameIndexSV.value] ?? sheet.frames[0];
    return [
      Skia.RSXform(
        heroScale,
        0,
        heroWorldX.value - (f.width * heroScale) / 2,
        heroWorldY.value - f.height * heroScale
      ),
    ];
  });

  const exitWorldX = (endBlock.worldOffsetX + endBlock.maze.end.x + 0.5) * cellSize;
  const exitWorldY = (endBlock.worldOffsetY + endBlock.maze.end.y + 0.5) * cellSize;

  return (
    <Canvas style={{ width, height }}>
      <Group transform={cameraTransform}>
        {world.blocks.map((block) => (
          <BlockWalls
            key={block.id}
            block={block}
            openSides={openSidesByBlock.get(block.id) ?? new Set()}
            cellSize={cellSize}
          />
        ))}

        <ExitRadar x={exitWorldX} y={exitWorldY} cellSize={cellSize} />

        {heroImage && (
          <Atlas image={heroImage} sprites={heroSprites} transforms={heroTransforms} />
        )}
      </Group>
    </Canvas>
  );
});
