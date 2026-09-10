import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { MazeCanvas } from '../../components/MazeCanvas';
import { useGameStore } from '../../store/gameStore';

export default function GameScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const levelId = Number(id);

  const level = useGameStore((s) => s.level);
  const maze = useGameStore((s) => s.maze);
  const nextScrambleAt = useGameStore((s) => s.nextScrambleAt);
  const scrambleFlashUntil = useGameStore((s) => s.scrambleFlashUntil);
  const loadLevel = useGameStore((s) => s.loadLevel);
  const checkScramble = useGameStore((s) => s.checkScramble);

  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    loadLevel(levelId);
  }, [levelId, loadLevel]);

  useEffect(() => {
    const interval = setInterval(() => {
      const t = Date.now();
      setNow(t);
      checkScramble(t);
    }, 100);
    return () => clearInterval(interval);
  }, [checkScramble]);

  const isFlashing = scrambleFlashUntil !== null && now < scrambleFlashUntil;
  const secondsToScramble = nextScrambleAt !== null ? Math.max(0, (nextScrambleAt - now) / 1000) : null;

  return (
    <View className="flex-1 bg-paper px-4 pt-16">
      <Text className="font-hand text-2xl text-ink">
        {level ? `${level.id}. ${level.title}` : 'Loading...'}
      </Text>
      <Text className={`mt-1 font-script text-base ${isFlashing ? 'text-ink' : 'text-ink-soft'}`}>
        {secondsToScramble !== null
          ? `next scramble in ${secondsToScramble.toFixed(1)}s`
          : 'maze is calm here'}
      </Text>

      <View
        className="mt-4 flex-1"
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setCanvasSize({ width, height });
        }}
      >
        {maze && canvasSize.width > 0 && canvasSize.height > 0 && (
          <MazeCanvas maze={maze} width={canvasSize.width} height={canvasSize.height} />
        )}
      </View>
    </View>
  );
}
