import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { WorldCanvas } from '../../components/WorldCanvas';
import type { Direction } from '../../store/gameStore';
import { useGameStore } from '../../store/gameStore';

const SWIPE_THRESHOLD = 24;

export default function GameScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const levelId = Number(id);

  const level = useGameStore((s) => s.level);
  const world = useGameStore((s) => s.world);
  const currentBlockId = useGameStore((s) => s.currentBlockId);
  const heroCell = useGameStore((s) => s.heroCell);
  const facing = useGameStore((s) => s.facing);
  const isMoving = useGameStore((s) => s.isMoving);
  const nextScrambleAt = useGameStore((s) => s.nextScrambleAt);
  const scrambleFlashUntil = useGameStore((s) => s.scrambleFlashUntil);
  const reachedExit = useGameStore((s) => s.reachedExit);
  const loadLevel = useGameStore((s) => s.loadLevel);
  const checkScramble = useGameStore((s) => s.checkScramble);
  const move = useGameStore((s) => s.move);
  const finishMove = useGameStore((s) => s.finishMove);

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

  // The store flips isMoving back off once the slide animation (MOVE_DURATION in WorldCanvas) settles.
  useEffect(() => {
    if (!isMoving) return;
    const timeout = setTimeout(() => finishMove(), 220);
    return () => clearTimeout(timeout);
  }, [isMoving, heroCell, finishMove]);

  const handleSwipe = (dir: Direction) => move(dir);

  const swipeGesture = Gesture.Pan()
    .runOnJS(true)
    .onEnd((e) => {
      const { translationX, translationY } = e;
      if (Math.max(Math.abs(translationX), Math.abs(translationY)) < SWIPE_THRESHOLD) return;
      const dir: Direction =
        Math.abs(translationX) > Math.abs(translationY)
          ? translationX > 0
            ? 'right'
            : 'left'
          : translationY > 0
            ? 'down'
            : 'up';
      handleSwipe(dir);
    });

  const isFlashing = scrambleFlashUntil !== null && now < scrambleFlashUntil;
  const secondsToScramble = nextScrambleAt !== null ? Math.max(0, (nextScrambleAt - now) / 1000) : null;

  return (
    <View className="flex-1 bg-paper px-4 pt-14">
      <Text className="font-hand text-2xl text-ink">
        {level ? `${level.id}. ${level.title}` : 'Loading...'}
      </Text>
      <Text className={`font-script text-base ${isFlashing ? 'text-ink' : 'text-ink-soft'}`}>
        {reachedExit
          ? 'you made it out'
          : secondsToScramble !== null
            ? `next scramble in ${secondsToScramble.toFixed(1)}s`
            : 'maze is calm here'}
      </Text>

      <GestureDetector gesture={swipeGesture}>
        <View
          className="mt-1 flex-1"
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            setCanvasSize({ width, height });
          }}
        >
          {world && currentBlockId && heroCell && canvasSize.width > 0 && canvasSize.height > 0 && (
            <WorldCanvas
              world={world}
              currentBlockId={currentBlockId}
              heroCell={heroCell}
              facing={facing}
              isMoving={isMoving}
              width={canvasSize.width}
              height={canvasSize.height}
            />
          )}
        </View>
      </GestureDetector>
    </View>
  );
}
