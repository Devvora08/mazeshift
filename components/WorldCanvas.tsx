import {
  Atlas, BlurMask, Canvas, Circle, Group, Image, Path, type SkImage, Skia, rect, useImage,
} from '@shopify/react-native-skia';
import { memo, useCallback, useEffect, useMemo } from 'react';
import {
  Easing,
  cancelAnimation,
  type SharedValue,
  runOnJS,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { BlockWalls } from './BlockWalls';
import { MonsterSprite } from './MonsterSprite';
import type { Monster } from '../lib/modules/monsters';
import { HERO_STEP_MS, useGameStore } from '../store/gameStore';
import { HERO_SHEETS, type HeroAnimationName } from '../lib/sprites/heroFrames';
import type { Direction, MazeWorld } from '../lib/maze/world';
import type { Position } from '../lib/maze/types';
import { SPELL_COLORS, SPELL_ICONS, type UtilityType } from '../lib/modules/utilities';
import { advanceSpellParticles, emitSpellParticles, type SpellParticle } from '../lib/sprites/spellParticles';
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
  monsters: Monster[];
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

/** Lightens a hex color toward white by `t` (0-1) — used to fake the ink trail's dark-to-bright
 *  dust gradient (its hand-picked purple shades) for an arbitrary per-spell base color. */
function tintTowardWhite(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 0xff) + (255 - ((n >> 16) & 0xff)) * t);
  const g = Math.round(((n >> 8) & 0xff) + (255 - ((n >> 8) & 0xff)) * t);
  const b = Math.round((n & 0xff) + (255 - (n & 0xff)) * t);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/** Ambient sparkle aura hovering around an uncollected pickup — the exact same dust-particle
 *  system as the sigil-drawing ink trail in SigilCanvas (just tinted to the pickup's own spell
 *  color instead of the trail's fixed purple), trickling out continuously rather than the
 *  trail's per-stroke bursts, so an unclaimed spell still reads as "the same kind of magic". */
function PickupAura({ x, y, cellSize, color }: { x: number; y: number; cellSize: number; color: string }) {
  const particles = useSharedValue<SpellParticle[]>([]);
  const emitAccumulator = useSharedValue(0);
  const dustColors = useMemo(
    () => [color, tintTowardWhite(color, 0.15), tintTowardWhite(color, 0.32), tintTowardWhite(color, 0.55)],
    [color],
  );

  useFrameCallback(useCallback((info) => {
    'worklet';
    const delta = info.timeSincePreviousFrame ?? 16;
    emitAccumulator.value += delta;
    let next = particles.value;
    // A slow, steady trickle — ambient, not the drawing burst's density.
    const emitIntervalMs = 150;
    while (emitAccumulator.value > emitIntervalMs) {
      next = emitSpellParticles(next, x, y, 1);
      emitAccumulator.value -= emitIntervalMs;
    }
    particles.value = advanceSpellParticles(next, delta);
  }, [x, y, particles, emitAccumulator]));

  // Motes drift a full cell's worth before fading, so keep them from wandering past its edge.
  const maxDrift = cellSize * 0.45;
  const dustPaths = useDerivedValue(() => {
    const builders = Array.from({ length: 4 }, () => Skia.PathBuilder.Make());
    for (const p of particles.value) {
      const dx = Math.min(maxDrift, Math.max(-maxDrift, p.x - x));
      const dy = Math.min(maxDrift, Math.max(-maxDrift, p.y - y));
      const remaining = 1 - p.age / p.life;
      const twinkle = 0.65 + 0.35 * Math.sin(p.age * 0.019 + p.phase);
      const brightness = remaining * twinkle;
      const bucket = Math.min(3, Math.floor(brightness * 4));
      const pb = builders[bucket];
      const radius = p.radius * (0.35 + 0.65 * remaining) * 0.72;
      const px = x + dx;
      const py = y + dy;
      if (p.star) {
        const r = radius * 2.4;
        const inner = radius * 0.35;
        pb.moveTo(px, py - r);
        pb.lineTo(px + inner, py - inner);
        pb.lineTo(px + r, py);
        pb.lineTo(px + inner, py + inner);
        pb.lineTo(px, py + r);
        pb.lineTo(px - inner, py + inner);
        pb.lineTo(px - r, py);
        pb.lineTo(px - inner, py - inner);
        pb.close();
      } else {
        pb.addCircle(px, py, radius);
      }
    }
    return builders.map((pb) => pb.build());
  });
  const dust0 = useDerivedValue(() => dustPaths.value[0]);
  const dust1 = useDerivedValue(() => dustPaths.value[1]);
  const dust2 = useDerivedValue(() => dustPaths.value[2]);
  const dust3 = useDerivedValue(() => dustPaths.value[3]);

  return (
    <>
      <Path path={dust0} color={dustColors[0]} opacity={0.18} />
      <Path path={dust1} color={dustColors[1]} opacity={0.44} />
      <Path path={dust2} color={dustColors[2]} opacity={0.74} />
      <Path path={dust3} color={dustColors[3]} opacity={1} />
    </>
  );
}

/** A gently pulsing spell icon marking where a utility can be traced up — the only other spot
 *  of color in the otherwise monochrome world besides the hero, per the art direction. */
function PickupMarker({ x, y, cellSize, image, color }: {
  x: number; y: number; cellSize: number; image: SkImage | null; color: string;
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
      <PickupAura x={x} y={y} cellSize={cellSize} color={color} />
      <Circle cx={x} cy={y} r={haloRadius} color={color} opacity={haloOpacity}>
        <BlurMask blur={8} style="normal" />
      </Circle>
      {image && (
        <Image image={image} x={imageX} y={imageY} width={size} height={size}
          fit="contain" opacity={opacity} />
      )}
    </>
  );
}

const HERO_ANIMATIONS = Object.keys(HERO_SHEETS) as HeroAnimationName[];

/** Keep decoded sheets mounted: an image can never use another sheet's rectangles. */
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
  const frame = useSpriteLoop(sheet.frames.length, paused ? 0 : fps);
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
  monsters,
  paused,
  width,
  height,
}: WorldCanvasProps) {
  const cellSize = useMemo(() => cellSizeForWorld(world, width, height), [world, width, height]);

  // Fixed set of hooks (one per spell, never conditional) so every icon is decoded once and
  // reused across however many pickups of that type appear in the world.
  const phaseIcon = useImage(SPELL_ICONS.phase);
  const destroyIcon = useImage(SPELL_ICONS.destroy);
  const scrambleIcon = useImage(SPELL_ICONS.scramble);
  const dashIcon = useImage(SPELL_ICONS.dash);
  const shieldIcon = useImage(SPELL_ICONS.shield);
  const trapIcon = useImage(SPELL_ICONS.trap);
  const spellIcons: Record<UtilityType, SkImage | null> = {
    phase: phaseIcon, destroy: destroyIcon, scramble: scrambleIcon,
    dash: dashIcon, shield: shieldIcon, trap: trapIcon,
  };

  const currentBlock = world.blocks.find((b) => b.id === currentBlockId) ?? world.blocks[0];
  const endBlock = world.blocks[world.blocks.length - 1];

  const pickupMarkers = useMemo(() => {
    const markers: { key: string; x: number; y: number; type: UtilityType }[] = [];
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
        type,
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
          <PickupMarker key={m.key} x={m.x} y={m.y} cellSize={cellSize}
            image={spellIcons[m.type]} color={SPELL_COLORS[m.type]} />
        ))}

        {monsters.map(monster => <MonsterSprite key={monster.id} monster={monster}
          world={world} cellSize={cellSize} paused={paused} />)}

        {HERO_ANIMATIONS.map((name) => (
          <HeroSprite key={name} name={name} active={animationName === name}
            cellSize={cellSize} worldX={heroWorldX} worldY={heroWorldY} paused={paused} />
        ))}
      </Group>
    </Canvas>
  );
});
