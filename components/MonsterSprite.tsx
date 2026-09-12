import { Atlas, Circle, Skia, rect, useImage } from '@shopify/react-native-skia';
import { memo, useEffect } from 'react';
import { cancelAnimation, Easing, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSpriteLoop } from '../hooks/useSpriteLoop';
import type { Monster, WorldCell } from '../lib/modules/monsters';
import type { MazeWorld } from '../lib/maze/world';
import { MONSTER_SHEETS } from '../lib/sprites/monsterFrames';
import { useGameStore } from '../store/gameStore';

const HEIGHT = { hunter: 1.8, wraith: 1.65, brute: 1.8, stalker: 1.8 };

function worldPoint(world: MazeWorld, p: WorldCell, size: number) {
  const block = world.blocks.find(b => b.id === p.blockId)!;
  return { x: (block.worldOffsetX + p.cell.x + 0.5) * size,
    y: (block.worldOffsetY + p.cell.y + 1) * size };
}

function BombEffect({ monster, world, cellSize, paused }: {
  monster: Monster; world: MazeWorld; cellSize: number; paused: boolean;
}) {
  const progress = useSharedValue(0);
  const bomb = monster.bomb, blast = monster.blast;
  useEffect(() => {
    cancelAnimation(progress);
    const now = useGameStore.getState().simulationTime;
    const start = bomb?.startedAt ?? (blast ? blast.until - 500 : now);
    const end = bomb?.detonatesAt ?? blast?.until ?? now;
    progress.value = end > start ? Math.min(1, (now - start) / (end - start)) : 0;
    if (!paused && end > now) progress.value = withTiming(1, { duration: end - now, easing: Easing.linear });
    return () => cancelAnimation(progress);
  }, [bomb, blast, paused, progress]);
  const from = bomb ? monster.location : blast?.from;
  const to = bomb?.target ?? blast?.to;
  const a = worldPoint(world, from ?? monster.location, cellSize);
  const b = worldPoint(world, to ?? monster.location, cellSize);
  const radius = useDerivedValue(() => cellSize * (blast ? 0.15 + progress.value * 1.1 : 0.22 + progress.value * 0.23));
  const opacity = useDerivedValue(() => blast ? 1 - progress.value : 0.55 + 0.45 * Math.abs(Math.sin(progress.value * 25)));
  if (!bomb && !blast) return null;
  const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2 - cellSize / 2;
  return <>
    <Circle cx={x} cy={y} r={radius} color="#f97316" style="stroke" strokeWidth={2.5} opacity={opacity} />
    {bomb && <Circle cx={x} cy={y} r={cellSize * 0.15} color="#29201b" />}
  </>;
}

/** Four decoded images stay paired with their own frame tables; a single UI clock
 * drives the active gait, and every frame count uses the same overall cycle time.
 */
export const MonsterSprite = memo(function MonsterSprite({ monster, world, cellSize, paused }: {
  monster: Monster; world: MazeWorld; cellSize: number; paused: boolean;
}) {
  const initial = worldPoint(world, monster.location, cellSize);
  const x = useSharedValue(initial.x), y = useSharedValue(initial.y);
  // Decode each direction once, but submit only the active sheet to Skia. Previously
  // four Atlas nodes were drawn per monster every frame, three at zero opacity.
  const sheets = MONSTER_SHEETS[monster.type];
  const upImage = useImage(sheets.up.asset);
  const downImage = useImage(sheets.down.asset);
  const leftImage = useImage(sheets.left.asset);
  const rightImage = useImage(sheets.right.asset);
  const image = { up: upImage, down: downImage, left: leftImage, right: rightImage }[monster.facing];
  const sheet = sheets[monster.facing];
  const frame = useSpriteLoop(sheet.frames.length,
    !paused && monster.travel ? 10 * sheet.frames.length / 5 : 0);
  const sprites = useDerivedValue(() => {
    const f = sheet.frames[frame.value] ?? sheet.frames[0];
    return [rect(f.x, f.y, f.width, f.height)];
  });
  const transforms = useDerivedValue(() => {
    const f = sheet.frames[frame.value] ?? sheet.frames[0];
    const scale = cellSize * HEIGHT[monster.type] * (sheet.sizeMultiplier ?? 1) / f.height;
    return [Skia.RSXform(scale, 0, x.value - f.width * scale / 2, y.value - f.height * scale)];
  });
  const travel = monster.travel;
  const location = monster.location;
  useEffect(() => {
    cancelAnimation(x); cancelAnimation(y);
    const now = useGameStore.getState().simulationTime;
    const from = worldPoint(world, travel?.from ?? location, cellSize);
    const to = worldPoint(world, travel?.to ?? location, cellSize);
    const p = travel ? Math.max(0, Math.min(1, (now - travel.startedAt) / travel.duration)) : 1;
    x.value = from.x + (to.x - from.x) * p;
    y.value = from.y + (to.y - from.y) * p;
    if (travel && !paused) {
      const options = { duration: Math.max(0, travel.duration * (1 - p)), easing: Easing.linear };
      x.value = withTiming(to.x, options); y.value = withTiming(to.y, options);
    }
    return () => { cancelAnimation(x); cancelAnimation(y); };
  }, [travel, location, cellSize, paused, world, x, y]);
  const ringY = useDerivedValue(() => y.value - cellSize * 0.4);
  return <>
    {monster.type === 'stalker' && monster.mode === 'chase' && <Circle cx={x} cy={ringY}
      r={cellSize * 0.55} color="#b45309" style="stroke" strokeWidth={1.5} opacity={0.8} />}
    {monster.mode === 'stunned' && <Circle cx={x} cy={ringY}
      r={cellSize * 0.65} color="#ef4444" style="stroke" strokeWidth={3} />}
    {image && <Atlas image={image} sprites={sprites} transforms={transforms} />}
    <BombEffect monster={monster} world={world} cellSize={cellSize} paused={paused} />
  </>;
});
