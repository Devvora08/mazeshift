import { Atlas, Canvas, Circle, Group, Path, Skia, rect, useImage } from '@shopify/react-native-skia';
import { memo, useEffect, useMemo } from 'react';
import {
  Easing,
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
  isMoving: boolean;
  width: number;
  height: number;
}

const RUN_FPS = 10;
const IDLE_FPS = 6;
const HERO_HEIGHT_IN_CELLS = 1.7;
const CAMERA_DURATION = 700;
const MOVE_DURATION = 160;

function cellSizeForWorld(world: MazeWorld, viewportWidth: number, viewportHeight: number): number {
  const maxBlockWidth = Math.max(...world.blocks.map((b) => b.maze.width));
  const maxBlockHeight = Math.max(...world.blocks.map((b) => b.maze.height));
  // A little breathing room so a block never touches the viewport edge.
  return Math.min(viewportWidth / (maxBlockWidth + 1), viewportHeight / (maxBlockHeight + 1));
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
  const path = useMemo(() => {
    const pb = Skia.PathBuilder.Make();
    const { maze, worldOffsetX, worldOffsetY } = block;
    const ox = worldOffsetX * cellSize;
    const oy = worldOffsetY * cellSize;

    for (const key of maze.activeCells) {
      const [x, y] = key.split(',').map(Number);
      const cell = { x, y };

      const top = { x, y: y - 1 };
      if (
        !openSides.has(`${x},${y}:up`) &&
        (!maze.activeCells.has(posKey(top)) || !maze.openEdges.has(edgeKey(cell, top)))
      ) {
        pb.moveTo(ox + x * cellSize, oy + y * cellSize);
        pb.lineTo(ox + (x + 1) * cellSize, oy + y * cellSize);
      }

      const left = { x: x - 1, y };
      if (
        !openSides.has(`${x},${y}:left`) &&
        (!maze.activeCells.has(posKey(left)) || !maze.openEdges.has(edgeKey(cell, left)))
      ) {
        pb.moveTo(ox + x * cellSize, oy + y * cellSize);
        pb.lineTo(ox + x * cellSize, oy + (y + 1) * cellSize);
      }

      const right = { x: x + 1, y };
      if (
        !openSides.has(`${x},${y}:right`) &&
        (!maze.activeCells.has(posKey(right)) || !maze.openEdges.has(edgeKey(cell, right)))
      ) {
        pb.moveTo(ox + (x + 1) * cellSize, oy + y * cellSize);
        pb.lineTo(ox + (x + 1) * cellSize, oy + (y + 1) * cellSize);
      }

      const bottom = { x, y: y + 1 };
      if (
        !openSides.has(`${x},${y}:down`) &&
        (!maze.activeCells.has(posKey(bottom)) || !maze.openEdges.has(edgeKey(cell, bottom)))
      ) {
        pb.moveTo(ox + x * cellSize, oy + (y + 1) * cellSize);
        pb.lineTo(ox + (x + 1) * cellSize, oy + (y + 1) * cellSize);
      }
    }

    return pb.build();
  }, [block, openSides, cellSize]);

  return <Path path={path} color="#111111" style="stroke" strokeWidth={2.5} strokeJoin="round" />;
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

export function WorldCanvas({
  world,
  currentBlockId,
  heroCell,
  facing,
  isMoving,
  width,
  height,
}: WorldCanvasProps) {
  const cellSize = useMemo(() => cellSizeForWorld(world, width, height), [world, width, height]);

  const currentBlock = world.blocks.find((b) => b.id === currentBlockId) ?? world.blocks[0];
  const endBlock = world.blocks[world.blocks.length - 1];

  // Camera pans (translate only, no zoom) so the current block's center sits in the viewport center.
  const cameraX = useSharedValue(0);
  const cameraY = useSharedValue(0);
  const cameraInitialized = useSharedValue(false);

  useEffect(() => {
    // Anchor the current block's top-left near the viewport's top-left (with a little breathing
    // room) rather than centering it — centering leaves a symmetric gap around every block that
    // isn't exactly viewport-shaped, which reads as dead space right under the header.
    const margin = cellSize * 0.6;
    const targetX = margin - currentBlock.worldOffsetX * cellSize;
    const targetY = margin - currentBlock.worldOffsetY * cellSize;
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

  const animationName: HeroAnimationName = isMoving ? facing : 'idle';
  const sheet = HERO_SHEETS[animationName];
  const fps = animationName === 'idle' ? IDLE_FPS : RUN_FPS;
  const frameIndex = useSpriteLoop(sheet.frames.length, fps);
  const heroFrame = sheet.frames[frameIndex];
  const heroScale = (cellSize * HERO_HEIGHT_IN_CELLS) / heroFrame.height;

  const heroImage = useImage(sheet.asset);
  const heroSprites = useMemo(
    () => [rect(heroFrame.x, heroFrame.y, heroFrame.width, heroFrame.height)],
    [heroFrame]
  );
  const heroTransforms = useDerivedValue(() => [
    Skia.RSXform(
      heroScale,
      0,
      heroWorldX.value - (heroFrame.width * heroScale) / 2,
      heroWorldY.value - heroFrame.height * heroScale
    ),
  ]);

  const exitWorldX = (endBlock.worldOffsetX + endBlock.maze.end.x + 0.5) * cellSize;
  const exitWorldY = (endBlock.worldOffsetY + endBlock.maze.end.y + 0.5) * cellSize;

  return (
    <Canvas style={{ width, height }}>
      <Group transform={cameraTransform}>
        {world.blocks.map((block) => {
          const gateways = world.gatewaysByBlock.get(block.id) ?? [];
          const openSides = new Set(gateways.map((g) => `${g.fromCell.x},${g.fromCell.y}:${g.direction}`));
          return <BlockWalls key={block.id} block={block} openSides={openSides} cellSize={cellSize} />;
        })}

        <ExitRadar x={exitWorldX} y={exitWorldY} cellSize={cellSize} />

        {heroImage && (
          <Atlas image={heroImage} sprites={heroSprites} transforms={heroTransforms} />
        )}
      </Group>
    </Canvas>
  );
}
