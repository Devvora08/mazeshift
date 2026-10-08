import {
  Atlas, BlurMask, Canvas, Circle, Group, Image, RoundedRect, type SkImage, Skia, rect,
} from '@shopify/react-native-skia';
import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import {
  Easing,
  type SharedValue,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { BlockWalls } from './BlockWalls';
import { MonsterLayer } from './MonsterLayer';
import type { PlacedTrap } from '../lib/modules/utilities/effects';
import { useGameStore } from '../store/gameStore';
import { useHeroMotion } from './heroMotion';
import { HERO_SHEETS, type HeroAnimationName } from '../lib/sprites/heroFrames';
import { useCachedImage } from '../lib/sprites/imageCache';
import { useDisabledFlags } from '../lib/perfFlags';
import type { Direction, MazeWorld } from '../lib/maze/world';
import { SPELL_COLORS, SPELL_ICONS, type UtilityType } from '../lib/modules/utilities';

interface WorldCanvasProps {
  world: MazeWorld;
  currentBlockId: string;
  /** Held D-pad direction, written on the UI thread by the D-pad gestures. */
  held: SharedValue<Direction | null>;
  /** JS callbacks for the UI-thread hero engine; see components/heroMotion. */
  onStepStart: () => void;
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

const ROUTE_GLOW = '#a855f7';

/** A static, soft purple glow over each gateway opening that leads toward the exit.
 * Blocks form a chain b0 → b1 → … → exit, so "forward" means a higher block index.
 * Lives on the walls canvas, which only redraws when walls change. */
const RouteGlow = memo(function RouteGlow({ world, blockIds, cellSize }: {
  world: MazeWorld; blockIds: ReadonlySet<string>; cellSize: number;
}) {
  const glows = useMemo(() => {
    const index = new Map(world.blocks.map(b => [b.id, b.index]));
    const out: { key: string; x: number; y: number; w: number; h: number }[] = [];
    for (const block of world.blocks) {
      if (!blockIds.has(block.id)) continue;
      for (const g of world.gatewaysByBlock.get(block.id) ?? []) {
        if ((index.get(g.toBlockId) ?? -1) <= block.index) continue;
        const cx = block.worldOffsetX + g.fromCell.x, cy = block.worldOffsetY + g.fromCell.y;
        const along = 0.9, across = 0.7;
        // Centered on the cell side the opening passes through.
        const [mx, my, horizontal] = g.direction === 'right' ? [cx + 1, cy + 0.5, false]
          : g.direction === 'left' ? [cx, cy + 0.5, false]
          : g.direction === 'down' ? [cx + 0.5, cy + 1, true] : [cx + 0.5, cy, true];
        const w = (horizontal ? along : across) * cellSize, h = (horizontal ? across : along) * cellSize;
        out.push({ key: `${block.id}:${g.fromCell.x},${g.fromCell.y}:${g.direction}`,
          x: mx * cellSize - w / 2, y: my * cellSize - h / 2, w, h });
      }
    }
    return out;
  }, [world, blockIds, cellSize]);
  return <>
    {glows.map(g => (
      <RoundedRect key={g.key} x={g.x} y={g.y} width={g.w} height={g.h} r={cellSize * 0.3}
        color={ROUTE_GLOW} opacity={0.35}>
        <BlurMask blur={cellSize * 0.2} style="normal" />
      </RoundedRect>
    ))}
  </>;
});

/**
 * Keep every decoded sheet bound to its own frame geometry. Only the selected
 * direction records an Atlas or runs a frame clock, so direction changes are
 * atomic without giving up the single-active-Atlas rendering optimization.
 */
const HeroSprite = memo(function HeroSprite({ name, animation, cellSize, worldX, worldY, paused }: {
  name: HeroAnimationName;
  /** Chosen on the UI thread each frame by the hero engine. */
  animation: SharedValue<HeroAnimationName>;
  paused: boolean;
  cellSize: number;
  worldX: SharedValue<number>;
  worldY: SharedValue<number>;
}) {
  const sheet = HERO_SHEETS[name];
  const image = useCachedImage(sheet.asset);
  // Eight drawings take the same cycle time as five, rather than slowing the gait.
  const fps = name === 'idle' ? IDLE_FPS : RUN_FPS * sheet.frames.length / 5;
  const count = sheet.frames.length;
  const cycleMs = count * 1000 / fps;
  const frame = useSharedValue(0);
  const elapsed = useSharedValue(0);
  // The frame clock reads the UI-thread animation choice, so a direction change
  // swaps sheets on the very next frame with no JavaScript round trip.
  useFrameCallback((info) => {
    'worklet';
    if (paused || animation.value !== name) { elapsed.value = 0; frame.value = 0; return; }
    const delta = info.timeSincePreviousFrame ?? 0;
    elapsed.value = (elapsed.value + (delta > 250 ? 0 : delta)) % cycleMs;
    frame.value = Math.min(count - 1, Math.floor(elapsed.value * fps / 1000));
  });
  const scale = cellSize * HERO_HEIGHT_IN_CELLS / sheet.frames[0].height;
  // Inactive sheets submit nothing, so only one hero Atlas draws per frame.
  const sprites = useDerivedValue(() => {
    if (animation.value !== name) return [];
    const f = sheet.frames[frame.value] ?? sheet.frames[0];
    return [rect(f.x, f.y, f.width, f.height)];
  });
  const transforms = useDerivedValue(() => {
    if (animation.value !== name) return [];
    const f = sheet.frames[frame.value] ?? sheet.frames[0];
    return [Skia.RSXform(scale, 0, worldX.value - f.width * scale / 2,
      worldY.value - f.height * scale)];
  });
  return image ? <Atlas image={image} sprites={sprites} transforms={transforms} /> : null;
});

export const WorldCanvas = memo(function WorldCanvas({
  world,
  currentBlockId,
  held,
  onStepStart,
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
  const disabledFlags = useDisabledFlags();

  // Fixed set of hooks (one per spell, never conditional) so every icon is decoded once and
  // reused across however many pickups of that type appear in the world.
  const allowedSet = useMemo(() => new Set(allowedUtilities), [allowedUtilities]);
  const phaseIcon = useCachedImage(allowedSet.has('phase') ? SPELL_ICONS.phase : null);
  const destroyIcon = useCachedImage(allowedSet.has('destroy') ? SPELL_ICONS.destroy : null);
  const scrambleIcon = useCachedImage(allowedSet.has('scramble') ? SPELL_ICONS.scramble : null);
  const dashIcon = useCachedImage(allowedSet.has('dash') ? SPELL_ICONS.dash : null);
  const shieldIcon = useCachedImage(allowedSet.has('shield') ? SPELL_ICONS.shield : null);
  const trapIcon = useCachedImage(allowedSet.has('trap') ? SPELL_ICONS.trap : null);
  const spellIcons: Record<UtilityType, SkImage | null> = {
    phase: phaseIcon, destroy: destroyIcon, scramble: scrambleIcon,
    dash: dashIcon, shield: shieldIcon, trap: trapIcon,
  };

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

  // The hero engine runs on the UI thread; these stable callbacks forward its
  // reports to the store without making the engine depend on React renders.
  const callbacks = useRef({ onStepStart, onMoveComplete });
  callbacks.current = { onStepStart, onMoveComplete };
  const handleStepStart = useCallback((blockId: string, x: number, y: number, dir: Direction, duration: number) => {
    callbacks.current.onStepStart();
    useGameStore.getState().commitStep({ blockId, cell: { x, y } }, dir, duration);
  }, []);
  const handleStepEnd = useCallback(() => callbacks.current.onMoveComplete(), []);
  const handleFace = useCallback((dir: Direction) => useGameStore.getState().setFacing(dir), []);
  const handleRefund = useCallback((type: UtilityType) => useGameStore.getState().refundSpell(type), []);
  // Mounted per run (keyed by runId), so the store's hero position here is the start.
  const start = useRef<{ blockId: string; x: number; y: number; facing: Direction } | null>(null);
  if (!start.current) {
    const s = useGameStore.getState();
    start.current = { blockId: s.currentBlockId ?? currentBlockId, x: s.heroCell?.x ?? 0, y: s.heroCell?.y ?? 0, facing: s.facing };
  }
  const { heroX: heroWorldX, heroY: heroWorldY, animation, cameraX, cameraY } = useHeroMotion({
    world, start: start.current, cellSize, viewportHeight: height, held, halted: paused,
    onStepStart: handleStepStart, onStepEnd: handleStepEnd, onFace: handleFace, onRefund: handleRefund,
  });

  const cameraTransform = useDerivedValue(() => [
    { translateX: cameraX.value },
    { translateY: cameraY.value },
  ]);

  const auraY = useDerivedValue(() => heroWorldY.value - cellSize * 0.8);
  const exitWorldX = (endBlock.worldOffsetX + endBlock.maze.end.x + 0.5) * cellSize;
  const exitWorldY = (endBlock.worldOffsetY + endBlock.maze.end.y + 0.5) * cellSize;

  return (
    <View style={{ width, height }}>
    {/* Keep animated wall geometry off the hero/effects canvases. A scramble can
        now rebuild its paths without making sprite frames redraw that geometry. */}
    <Canvas pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Group transform={cameraTransform}>
        <RouteGlow world={world} blockIds={nearbyBlockIds} cellSize={cellSize} />
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
    {!disabledFlags.has('pickups') && <Canvas pointerEvents="none" style={StyleSheet.absoluteFill}>
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
    </Canvas>}

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
          <HeroSprite key={name} name={name} animation={animation}
            cellSize={cellSize} worldX={heroWorldX} worldY={heroWorldY} paused={paused} />
        ))}
      </Group>
    </Canvas>

    {!disabledFlags.has('monsterDraw') && <MonsterLayer world={world} currentBlockId={currentBlockId} cellSize={cellSize}
      cameraTransform={cameraTransform} paused={paused} />}
    </View>
  );
});
