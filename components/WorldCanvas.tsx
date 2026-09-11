import { Atlas, Canvas, Circle, Group, Skia, rect, useImage } from '@shopify/react-native-skia';
import { memo, useEffect, useMemo } from 'react';
import {
  Easing,
  type SharedValue,
  runOnJS,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { BlockWalls } from './BlockWalls';
import { HERO_SHEETS, type HeroAnimationName } from '../lib/sprites/heroFrames';
import type { Direction, MazeWorld } from '../lib/maze/world';
import type { Position } from '../lib/maze/types';
import { SPELL_COLORS, type UtilityType } from '../lib/modules/utilities';
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
  onMoveComplete: () => void;
  /** keyed by "blockId:x,y", same shape as gameStore's pickups map. */
  pickups: Map<string, UtilityType>;
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

/** A colored, gently pulsing dot marking where a utility can be traced up — the only other spot
 *  of color in the otherwise monochrome world besides the hero, per the art direction. */
function PickupMarker({ x, y, cellSize, color }: { x: number; y: number; cellSize: number; color: string }) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [pulse]);

  const radius = useDerivedValue(() => cellSize * (0.16 + 0.05 * pulse.value));

  return <Circle cx={x} cy={y} r={radius} color={color} />;
}

const HERO_ANIMATIONS = Object.keys(HERO_SHEETS) as HeroAnimationName[];

/** Keep decoded sheets mounted: an image can never use another sheet's rectangles. */
const HeroSprite = memo(function HeroSprite({ name, active, cellSize, worldX, worldY }: {
  name: HeroAnimationName;
  active: boolean;
  cellSize: number;
  worldX: SharedValue<number>;
  worldY: SharedValue<number>;
}) {
  const sheet = HERO_SHEETS[name];
  const image = useImage(sheet.asset);
  // Eight drawings take the same cycle time as five, rather than slowing the gait.
  const fps = name === 'idle' ? IDLE_FPS : RUN_FPS * sheet.frames.length / 5;
  const frame = useSpriteLoop(sheet.frames.length, fps);
  const scale = cellSize * HERO_HEIGHT_IN_CELLS / sheet.frames[0].height;
  const sprites = useDerivedValue(() => {
    const f = sheet.frames[frame.value] ?? sheet.frames[0];
    return [rect(f.x, f.y, f.width, f.height)];
  });
  const transforms = useDerivedValue(() => {
    const f = sheet.frames[frame.value] ?? sheet.frames[0];
    return [Skia.RSXform(scale, 0, worldX.value - f.width * scale / 2,
      worldY.value - f.height * scale)];
  });
  return image ? <Group opacity={active ? 1 : 0}>
    <Atlas image={image} sprites={sprites} transforms={transforms} />
  </Group> : null;
});

export const WorldCanvas = memo(function WorldCanvas({
  world,
  currentBlockId,
  heroCell,
  facing,
  isHolding,
  onMoveComplete,
  pickups,
  width,
  height,
}: WorldCanvasProps) {
  const cellSize = useMemo(() => cellSizeForWorld(world, width, height), [world, width, height]);

  const currentBlock = world.blocks.find((b) => b.id === currentBlockId) ?? world.blocks[0];
  const endBlock = world.blocks[world.blocks.length - 1];

  const pickupMarkers = useMemo(() => {
    const markers: { key: string; x: number; y: number; color: string }[] = [];
    for (const [key, type] of pickups) {
      const sep = key.indexOf(':');
      const blockId = key.slice(0, sep);
      const [cx, cy] = key.slice(sep + 1).split(',').map(Number);
      const block = world.blocks.find((b) => b.id === blockId);
      if (!block) continue;
      markers.push({
        key,
        x: (block.worldOffsetX + cx + 0.5) * cellSize,
        y: (block.worldOffsetY + cy + 0.5) * cellSize,
        color: SPELL_COLORS[type],
      });
    }
    return markers;
  }, [pickups, world, cellSize]);

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
      // An unchanged axis completes immediately in Reanimated. Only the moving
      // axis may unlock the next step, otherwise horizontal moves chain too early.
      const movesHorizontally = targetX !== heroWorldX.value;
      const onFinished = (finished?: boolean) => {
        'worklet';
        if (finished) runOnJS(onMoveComplete)();
      };
      heroWorldX.value = withTiming(targetX, { duration: MOVE_DURATION, easing: Easing.linear },
        movesHorizontally ? onFinished : undefined);
      heroWorldY.value = withTiming(targetY, { duration: MOVE_DURATION, easing: Easing.linear },
        movesHorizontally ? undefined : onFinished);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroCell.x, heroCell.y, currentBlockId, cellSize, onMoveComplete]);

  const animationName: HeroAnimationName = isHolding ? facing : 'idle';
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

        {pickupMarkers.map((m) => (
          <PickupMarker key={m.key} x={m.x} y={m.y} cellSize={cellSize} color={m.color} />
        ))}

        {HERO_ANIMATIONS.map((name) => (
          <HeroSprite key={name} name={name} active={animationName === name}
            cellSize={cellSize} worldX={heroWorldX} worldY={heroWorldY} />
        ))}
      </Group>
    </Canvas>
  );
});
