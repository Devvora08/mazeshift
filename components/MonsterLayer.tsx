import { Canvas, Group } from '@shopify/react-native-skia';
import { memo } from 'react';
import { StyleSheet } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import type { SharedValue } from 'react-native-reanimated';
import type { MazeWorld } from '../lib/maze/world';
import { useGameStore } from '../store/gameStore';
import { MonsterSprite } from './MonsterSprite';

/** Monster commits restart only this small canvas's recorder, never the hero's. */
export const MonsterLayer = memo(function MonsterLayer({ world, currentBlockId, cellSize, cameraTransform, paused }: {
  world: MazeWorld; currentBlockId: string; cellSize: number; paused: boolean;
  cameraTransform: SharedValue<({ translateX: number } | { translateY: number })[]>;
}) {
  const monsters = useGameStore(useShallow(s => s.monsters.filter(m =>
    m.location.blockId === currentBlockId || m.travel?.from.blockId === currentBlockId
    || m.travel?.to.blockId === currentBlockId)));
  return <Canvas pointerEvents="none" style={StyleSheet.absoluteFill}>
    <Group transform={cameraTransform}>
      {monsters.map(monster => <MonsterSprite key={monster.id} monster={monster}
        world={world} cellSize={cellSize} paused={paused} />)}
    </Group>
  </Canvas>;
});
