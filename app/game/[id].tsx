import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { Joystick } from '../../components/Joystick';
import { SigilCanvas } from '../../components/SigilCanvas';
import { WorldCanvas } from '../../components/WorldCanvas';
import type { UtilityType } from '../../lib/modules/utilities';
import type { Direction } from '../../store/gameStore';
import { useGameStore } from '../../store/gameStore';

/** How often we retry a held joystick direction — matches WorldCanvas's MOVE_DURATION + settle buffer. */
const MOVE_REPEAT_MS = 220;

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
  const inventory = useGameStore((s) => s.inventory);
  const pickups = useGameStore((s) => s.pickups);
  const feedback = useGameStore((s) => s.feedback);
  const loadLevel = useGameStore((s) => s.loadLevel);
  const checkScramble = useGameStore((s) => s.checkScramble);
  const move = useGameStore((s) => s.move);
  const finishMove = useGameStore((s) => s.finishMove);
  const castSigil = useGameStore((s) => s.castSigil);

  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [now, setNow] = useState(Date.now());
  const [heldDir, setHeldDir] = useState<Direction | null>(null);
  const heldDirection = useRef<Direction | null>(null);

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
    const timeout = setTimeout(() => finishMove(), MOVE_REPEAT_MS);
    return () => clearTimeout(timeout);
  }, [isMoving, heroCell, finishMove]);

  // Repeats the held joystick direction every MOVE_REPEAT_MS. move() itself no-ops while already
  // mid-step or if the held direction is currently wall-blocked, so this is safe to call freely —
  // and it doubles as a retry in case a blocked direction opens up later (e.g. after a scramble).
  useEffect(() => {
    const interval = setInterval(() => {
      const dir = heldDirection.current;
      if (dir) move(dir);
    }, MOVE_REPEAT_MS);
    return () => clearInterval(interval);
  }, [move]);

  const handleJoystickDirection = useCallback(
    (dir: Direction | null) => {
      heldDirection.current = dir;
      setHeldDir(dir);
      if (dir) move(dir);
    },
    [move]
  );

  const handleSigilComplete = useCallback(
    (type: UtilityType | null) => {
      if (type) castSigil(type);
    },
    [castSigil]
  );

  const isFlashing = scrambleFlashUntil !== null && now < scrambleFlashUntil;
  const secondsToScramble = nextScrambleAt !== null ? Math.max(0, (nextScrambleAt - now) / 1000) : null;
  const isFeedbackVisible = feedback !== null && now < feedback.until;

  const inventoryCounts = inventory.reduce<Partial<Record<UtilityType, number>>>((acc, type) => {
    acc[type] = (acc[type] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <View className="flex-1 bg-paper px-4 pt-14">
      <Text className="font-hand text-2xl text-ink">
        {level ? `${level.id}. ${level.title}` : 'Loading...'}
      </Text>
      <Text className={`font-script text-base ${isFlashing ? 'text-ink' : 'text-ink-soft'}`}>
        {isFeedbackVisible
          ? feedback!.message
          : reachedExit
            ? 'you made it out'
            : secondsToScramble !== null
              ? `next scramble in ${secondsToScramble.toFixed(1)}s`
              : 'maze is calm here'}
      </Text>
      {Object.keys(inventoryCounts).length > 0 && (
        <Text className="font-script text-sm text-ink-soft">
          {Object.entries(inventoryCounts)
            .map(([type, count]) => `${type} x${count}`)
            .join('   ')}
        </Text>
      )}

      <View
        className="mt-1 flex-1"
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setCanvasSize({ width, height });
        }}
      >
        {world && currentBlockId && heroCell && canvasSize.width > 0 && canvasSize.height > 0 && (
          <>
            <WorldCanvas
              world={world}
              currentBlockId={currentBlockId}
              heroCell={heroCell}
              facing={heldDir ?? facing}
              isHolding={heldDir !== null}
              pickups={pickups}
              width={canvasSize.width}
              height={canvasSize.height}
            />
            <SigilCanvas width={canvasSize.width} height={canvasSize.height} onComplete={handleSigilComplete} />
          </>
        )}
      </View>

      <View className="h-72 items-center">
        <Joystick onDirectionChange={handleJoystickDirection} />
      </View>
    </View>
  );
}
