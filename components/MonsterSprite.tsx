import { Atlas, Circle, Group, Skia, rect, useImage } from '@shopify/react-native-skia';
import { memo, useEffect } from 'react';
import { cancelAnimation, Easing, useDerivedValue, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSpriteLoop } from '../hooks/useSpriteLoop';
import type { Monster, WorldCell } from '../lib/modules/monsters';
import type { MazeWorld, Direction } from '../lib/maze/world';
import { MONSTER_SHEETS, type MonsterSheet } from '../lib/sprites/monsterFrames';
import { useGameStore } from '../store/gameStore';

const DIRECTIONS: Direction[] = ['up', 'down', 'left', 'right'];
const HEIGHT = { hunter: 1.8, wraith: 1.65, brute: 1.8, stalker: 1.8 };

function worldPoint(world: MazeWorld, p: WorldCell, size: number) {
  const block = world.blocks.find(b => b.id === p.blockId)!;
  return { x: (block.worldOffsetX + p.cell.x + 0.5) * size,
    y: (block.worldOffsetY + p.cell.y + 1) * size };
}

const DirectionSheet = memo(function DirectionSheet({ sheet, active, frame, x, y, height }: {
  sheet: MonsterSheet; active: boolean; frame: SharedValue<number>; x: SharedValue<number>;
  y: SharedValue<number>; height: number;
}) {
  const image = useImage(sheet.asset);
  const scale = height / sheet.frames[0].height;
  const sprites = useDerivedValue(() => {
    const f = sheet.frames[frame.value] ?? sheet.frames[0];
    return [rect(f.x, f.y, f.width, f.height)];
  });
  const transforms = useDerivedValue(() => {
    const f = sheet.frames[frame.value] ?? sheet.frames[0];
    return [Skia.RSXform(scale, 0, x.value - f.width * scale / 2, y.value - f.height * scale)];
  });
  return image ? <Group opacity={active ? 1 : 0}>
    <Atlas image={image} sprites={sprites} transforms={transforms} />
  </Group> : null;
});

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
 * drives the five-frame gait, and the step duration is identical for every species.
 */
export const MonsterSprite = memo(function MonsterSprite({ monster, world, cellSize, paused }: {
  monster: Monster; world: MazeWorld; cellSize: number; paused: boolean;
}) {
  const initial = worldPoint(world, monster.location, cellSize);
  const x = useSharedValue(initial.x), y = useSharedValue(initial.y);
  const frame = useSpriteLoop(5, !paused && monster.travel ? 10 : 0);
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
    {DIRECTIONS.map(direction => <DirectionSheet key={direction}
      sheet={MONSTER_SHEETS[monster.type][direction]} active={direction === monster.facing}
      frame={frame} x={x} y={y} height={cellSize * HEIGHT[monster.type]} />)}
    <BombEffect monster={monster} world={world} cellSize={cellSize} paused={paused} />
  </>;
});
