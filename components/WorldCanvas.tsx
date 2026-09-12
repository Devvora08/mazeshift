import {
  Atlas, Canvas, Circle, Group, Image, type SkImage, Skia, rect, useImage,
} from '@shopify/react-native-skia';
import { memo, useEffect, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import {
  Easing,
  cancelAnimation,
  type SharedValue,
  runOnJS,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { BlockWalls } from './BlockWalls';
import { MonsterLayer } from './MonsterLayer';
import type { PlacedTrap } from '../lib/modules/utilities/effects';
import { HERO_STEP_MS, useGameStore } from '../store/gameStore';
import { HERO_SHEETS, type HeroAnimationName } from '../lib/sprites/heroFrames';
import type { Direction, MazeWorld } from '../lib/maze/world';
import type { Position } from '../lib/maze/types';
import { SPELL_COLORS, SPELL_ICONS, type UtilityType } from '../lib/modules/utilities';
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
  allowedUtilities: UtilityType[];
  traps: PlacedTrap[];
  shieldActive: boolean;
  dashActive: boolean;
  paused: boolean;
  width: number;
  height: number;
}

const RUN_FPS = 12;
const IDLE_FPS = 6;
const HERO_HEIGHT_IN_CELLS = 1.7;
const CAMERA_DURATION = 700;
const MOVE_DURATION = HERO_STEP_MS;

function cellSizeForWorld(world: MazeWorld, viewportWidth: number, viewportHeight: number): number {
  const maxBlockWidth = Math.max(...world.blocks.map((b) => b.maze.width));
  const maxBlockHeight = Math.max(...world.blocks.map((b) => b.maze.height));
  // A little breathing room so a block never touches the viewport edge.
  return Math.min(viewportWidth / (maxBlockWidth + 1), viewportHeight / (maxBlockHeight + 1));
}

const ExitRadar = memo(function ExitRadar({ x, y, cellSize }: { x: number; y: number; cellSize: number }) {
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
});

/** A gently pulsing spell icon marking where a utility can be traced up — the only other spot
 *  of color in the otherwise monochrome world besides the hero, per the art direction. */
const PickupMarker = memo(function PickupMarker({ x, y, cellSize, image, color, ambient }: {
  x: number; y: number; cellSize: number; image: SkImage | null; color: string; ambient: boolean;
}) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [pulse]);

  const size = useDerivedValue(() => cellSize * (0.88 + 0.08 * pulse.value));
  const imageX = useDerivedValue(() => x - size.value / 2);
  const imageY = useDerivedValue(() => y - size.value / 2);
  const opacity = useDerivedValue(() => 0.85 + 0.15 * pulse.value);
  const haloRadius = useDerivedValue(() => cellSize * (0.36 + 0.05 * pulse.value));
  const haloOpacity = useDerivedValue(() => 0.4 + 0.15 * pulse.value);

  return (
    <>
      <Circle cx={x} cy={y} r={haloRadius} color={color} opacity={haloOpacity} />
      {ambient && <Circle cx={x + cellSize * 0.35} cy={y - cellSize * 0.35}
        r={cellSize * 0.06} color={color} opacity={opacity} />}
      {image && (
        <Image image={image} x={imageX} y={imageY} width={size} height={size}
          fit="contain" opacity={opacity} />
      )}
    </>
  );
});

const HERO_ANIMATIONS = Object.keys(HERO_SHEETS) as HeroAnimationName[];

/**
 * Keep every decoded sheet bound to its own frame geometry. Only the selected
 * direction records an Atlas or runs a frame clock, so direction changes are
 * atomic without giving up the single-active-Atlas rendering optimization.
 */
const HeroSprite = memo(function HeroSprite({ name, active, cellSize, worldX, worldY, paused }: {
  name: HeroAnimationName;
  active: boolean;
  paused: boolean;
  cellSize: number;
  worldX: SharedValue<number>;
  worldY: SharedValue<number>;
}) {
  const sheet = HERO_SHEETS[name];
  const image = useImage(sheet.asset);
  // Eight drawings take the same cycle time as five, rather than slowing the gait.
  const fps = name === 'idle' ? IDLE_FPS : RUN_FPS * sheet.frames.length / 5;
  const frame = useSpriteLoop(sheet.frames.length, active && !paused ? fps : 0);
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
  return active && image
    ? <Atlas image={image} sprites={sprites} transforms={transforms} />
    : null;
});

export const WorldCanvas = memo(function WorldCanvas({
  world,
  currentBlockId,
  heroCell,
  facing,
  isHolding,
  onMoveComplete,
  pickups,
  allowedUtilities,
  traps,
  shieldActive,
  dashActive,
  paused,
  width,
  height,
}: WorldCanvasProps) {
  const cellSize = useMemo(() => cellSizeForWorld(world, width, height), [world, width, height]);

  // Fixed set of hooks (one per spell, never conditional) so every icon is decoded once and
  // reused across however many pickups of that type appear in the world.
  const allowedSet = useMemo(() => new Set(allowedUtilities), [allowedUtilities]);
  const phaseIcon = useImage(allowedSet.has('phase') ? SPELL_ICONS.phase : null);
  const destroyIcon = useImage(allowedSet.has('destroy') ? SPELL_ICONS.destroy : null);
  const scrambleIcon = useImage(allowedSet.has('scramble') ? SPELL_ICONS.scramble : null);
  const dashIcon = useImage(allowedSet.has('dash') ? SPELL_ICONS.dash : null);
  const shieldIcon = useImage(allowedSet.has('shield') ? SPELL_ICONS.shield : null);
  const trapIcon = useImage(allowedSet.has('trap') ? SPELL_ICONS.trap : null);
  const spellIcons: Record<UtilityType, SkImage | null> = {
    phase: phaseIcon, destroy: destroyIcon, scramble: scrambleIcon,
    dash: dashIcon, shield: shieldIcon, trap: trapIcon,
  };

  const currentBlock = world.blocks.find((b) => b.id === currentBlockId) ?? world.blocks[0];
  const endBlock = world.blocks[world.blocks.length - 1];

  const nearbyBlockIds = useMemo(() => new Set([
    currentBlockId,
    ...(world.gatewaysByBlock.get(currentBlockId) ?? []).map(g => g.toBlockId),
  ]), [currentBlockId, world]);

  const pickupMarkers = useMemo(() => {
    const markers: { key: string; x: number; y: number; type: UtilityType }[] = [];
    for (const [key, type] of pickups) {
      const sep = key.indexOf(':');
      const blockId = key.slice(0, sep);
      if (!nearbyBlockIds.has(blockId)) continue;
      const [cx, cy] = key.slice(sep + 1).split(',').map(Number);
      const block = world.blocks.find((b) => b.id === blockId);
      if (!block) continue;
      markers.push({
        key,
        x: (block.worldOffsetX + cx + 0.5) * cellSize,
        y: (block.worldOffsetY + cy + 0.5) * cellSize,
        type,
      });
    }
    return markers;
  }, [pickups, world, cellSize, nearbyBlockIds]);

  const nearbyTraps = useMemo(
    () => traps.filter(trap => nearbyBlockIds.has(trap.location.blockId)),
    [traps, nearbyBlockIds],
  );

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
    if (paused) {
      cancelAnimation(heroWorldX); cancelAnimation(heroWorldY);
      return;
    }
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
      const state = useGameStore.getState();
      const remaining = state.heroTravel
        ? Math.max(1, state.heroTravel.startedAt + state.heroTravel.duration - state.simulationTime) : MOVE_DURATION;
      heroWorldX.value = withTiming(targetX, { duration: remaining, easing: Easing.linear },
        movesHorizontally ? onFinished : undefined);
      heroWorldY.value = withTiming(targetY, { duration: remaining, easing: Easing.linear },
        movesHorizontally ? undefined : onFinished);
    }
    return () => { cancelAnimation(heroWorldX); cancelAnimation(heroWorldY); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroCell.x, heroCell.y, currentBlockId, cellSize, onMoveComplete, paused]);

  const animationName: HeroAnimationName = isHolding ? facing : 'idle';
  const auraY = useDerivedValue(() => heroWorldY.value - cellSize * 0.8);
  const exitWorldX = (endBlock.worldOffsetX + endBlock.maze.end.x + 0.5) * cellSize;
  const exitWorldY = (endBlock.worldOffsetY + endBlock.maze.end.y + 0.5) * cellSize;

  return (
    <View style={{ width, height }}>
    {/* Keep animated wall geometry off the hero/effects canvases. A scramble can
        now rebuild its paths without making sprite frames redraw that geometry. */}
    <Canvas pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Group transform={cameraTransform}>
        {world.blocks.filter(block => nearbyBlockIds.has(block.id)).map((block) => (
          <BlockWalls
            key={block.id}
            block={block}
            openSides={openSidesByBlock.get(block.id) ?? new Set()}
            cellSize={cellSize}
            animate={block.id === currentBlockId}
          />
        ))}
      </Group>
    </Canvas>

    {/* Ambient effects update continuously, but no longer invalidate walls or
        the hero Atlas. Skip the exit radar until its block is nearby. */}
    <Canvas pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Group transform={cameraTransform}>
        {nearbyBlockIds.has(endBlock.id) &&
          <ExitRadar x={exitWorldX} y={exitWorldY} cellSize={cellSize} />}

        {pickupMarkers.map((m) => (
          <PickupMarker key={m.key} x={m.x} y={m.y} cellSize={cellSize}
            image={spellIcons[m.type]} color={SPELL_COLORS[m.type]}
            ambient={m.key.startsWith(`${currentBlockId}:`)} />
        ))}


        {nearbyTraps.map(trap => {
          const block = world.blocks.find(b => b.id === trap.location.blockId)!;
          const x = (block.worldOffsetX + trap.location.cell.x + 0.5) * cellSize;
          const y = (block.worldOffsetY + trap.location.cell.y + 0.5) * cellSize;
          return <Group key={trap.id}>
            <Circle cx={x} cy={y} r={cellSize * 0.42} color="#ef4444" style="stroke" strokeWidth={2} />
            {trapIcon && <Image image={trapIcon} x={x-cellSize*0.3} y={y-cellSize*0.3}
              width={cellSize*0.6} height={cellSize*0.6} fit="contain" />}
          </Group>;
        })}
      </Group>
    </Canvas>

    {/* Hero movement/frame ticks stay on a tiny independent canvas, so held
        movement remains smooth while walls and ambient effects are busy. */}
    <Canvas pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Group transform={cameraTransform}>
        {shieldActive && <>
          <Circle cx={heroWorldX} cy={auraY} r={cellSize * 0.85} color="#38bdf8" opacity={0.16} />
          <Circle cx={heroWorldX} cy={auraY} r={cellSize * 0.85} color="#38bdf8" style="stroke" strokeWidth={2.5} />
        </>}
        {dashActive && <Circle cx={heroWorldX} cy={auraY} r={cellSize * 0.65}
          color="#facc15" style="stroke" strokeWidth={3} opacity={0.8} />}

        {HERO_ANIMATIONS.map(name => (
          <HeroSprite key={name} name={name} active={animationName === name}
            cellSize={cellSize} worldX={heroWorldX} worldY={heroWorldY} paused={paused} />
        ))}
      </Group>
    </Canvas>

    <MonsterLayer world={world} currentBlockId={currentBlockId} cellSize={cellSize}
      cameraTransform={cameraTransform} paused={paused} />
    </View>
  );
});
