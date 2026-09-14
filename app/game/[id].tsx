import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';

import { DPad } from '../../components/DPad';
import { SigilCanvas } from '../../components/SigilCanvas';
import { WorldCanvas } from '../../components/WorldCanvas';
import { PerformanceReadout } from '../../components/PerformanceReadout';
import { GameAudio } from '../../components/GameAudio';
import type { UtilityType } from '../../lib/modules/utilities';
import type { Direction } from '../../store/gameStore';
import { useGameStore } from '../../store/gameStore';
import { formatRunTime, useProgressStore } from '../../store/progressStore';

/** Retry only when a held direction is blocked; completed slides chain immediately. */
const BLOCKED_RETRY_MS = 80;
const SIMULATION_TICK_MS = 50;

export default function GameScreen() {
  const { id, resume } = useLocalSearchParams<{ id: string; resume?: string }>();
  const levelId = Number(id);
  const progressHydrated = useProgressStore((state) => state.hydrated);
  const highestUnlockedLevel = useProgressStore((state) => state.highestUnlockedLevel);
  const premiumUnlocked = useProgressStore((state) => state.premiumUnlocked);

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
  const traps = useGameStore((s) => s.traps);
  const shieldUntil = useGameStore((s) => s.shieldUntil);
  const heroTravel = useGameStore((s) => s.heroTravel);
  const caughtBy = useGameStore((s) => s.caughtBy);
  const stalkerAlert = useGameStore((s) => s.stalkerAlert);
  const paused = useGameStore((s) => s.paused);
  const runId = useGameStore((s) => s.runId);
  const loadLevel = useGameStore((s) => s.loadLevel);
  const checkScramble = useGameStore((s) => s.checkScramble);
  const move = useGameStore((s) => s.move);
  const finishMove = useGameStore((s) => s.finishMove);
  const castSigil = useGameStore((s) => s.castSigil);

  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [now, setNow] = useState(Date.now());
  const [displaySimulationTime, setDisplaySimulationTime] = useState(0);
  const [heldDir, setHeldDir] = useState<Direction | null>(null);
  const baseElapsed = useRef(0);
  const recordedDeathRun = useRef<number | null>(null);
  const recordedWinRun = useRef<number | null>(null);
  const heldDirection = useRef<Direction | null>(null);
  const screenActive = useRef(false);
  const previousTick = useRef(performance.now());
  const advanceTime = useCallback(() => {
    const time = performance.now();
    const elapsed = Math.max(0, time - previousTick.current);
    previousTick.current = time;
    if (screenActive.current) useGameStore.getState().tick(elapsed);
  }, []);

  const clearInput = useCallback(() => {
    heldDirection.current = null;
    setHeldDir(null);
  }, []);

  useFocusEffect(useCallback(() => {
    screenActive.current = true;
    previousTick.current = performance.now();
    useGameStore.getState().setPaused(AppState.currentState !== null && AppState.currentState !== 'active');
    const subscription = AppState.addEventListener('change', state => {
      clearInput();
      useGameStore.getState().setPaused(state !== 'active');
    });
    return () => {
      screenActive.current = false;
      subscription.remove();
      clearInput();
      useGameStore.getState().setPaused(true);
    };
  }, [clearInput]));

  useEffect(() => {
    if (caughtBy || reachedExit || paused) clearInput();
  }, [caughtBy, reachedExit, paused, clearInput]);

  useEffect(() => {
    if (!progressHydrated) return;
    const progress = useProgressStore.getState();
    if (levelId > progress.highestUnlockedLevel || (levelId > 10 && !progress.premiumUnlocked)) return;
    const continued = resume === '1' && progress.activeRun?.levelId === levelId;
    baseElapsed.current = continued ? progress.activeRun!.elapsedMs : 0;
    loadLevel(levelId);
    if (!continued) progress.startRun(levelId);
    previousTick.current = performance.now();
  }, [levelId, resume, loadLevel, progressHydrated, premiumUnlocked]);

  useEffect(() => {
    if (progressHydrated && (levelId > highestUnlockedLevel || (levelId > 10 && !premiumUnlocked))) router.replace('/');
  }, [progressHydrated, highestUnlockedLevel, premiumUnlocked, levelId]);

  useEffect(() => {
    if (levelId === 0) return;
    const elapsed = baseElapsed.current + useGameStore.getState().simulationTime;
    if (caughtBy && recordedDeathRun.current !== runId) {
      recordedDeathRun.current = runId;
      useProgressStore.getState().recordDeath(levelId, elapsed);
    }
    if (reachedExit && recordedWinRun.current !== runId) {
      recordedWinRun.current = runId;
      useProgressStore.getState().completeLevel(levelId, elapsed);
    }
  }, [caughtBy, reachedExit, runId, levelId]);

  useEffect(() => {
    if (levelId === 0 || reachedExit) return;
    const interval = setInterval(() => {
      useProgressStore.getState().checkpointRun(levelId, baseElapsed.current + useGameStore.getState().simulationTime);
    }, 2000);
    return () => {
      clearInterval(interval);
      useProgressStore.getState().checkpointRun(levelId, baseElapsed.current + useGameStore.getState().simulationTime);
    };
  }, [levelId, reachedExit]);

  useEffect(() => {
    const simulationInterval = setInterval(() => {
      const t = Date.now();
      advanceTime();
      if (screenActive.current) checkScramble(t);
    }, SIMULATION_TICK_MS);
    // HUD clocks do not need to make React reconcile the game canvas 20 times a second.
    const displayInterval = setInterval(() => {
      setNow(Date.now());
      setDisplaySimulationTime(useGameStore.getState().simulationTime);
    }, 200);
    return () => {
      clearInterval(simulationInterval);
      clearInterval(displayInterval);
    };
  }, [checkScramble, advanceTime]);

  const handleMoveComplete = useCallback(() => {
    if (useGameStore.getState().runId !== runId) return;
    advanceTime();
    finishMove();
    const dir = heldDirection.current;
    if (dir) move(dir);
  }, [finishMove, move, advanceTime, runId]);

  useEffect(() => {
    const interval = setInterval(() => {
      const dir = heldDirection.current;
      if (dir && !useGameStore.getState().isMoving) { advanceTime(); move(dir); }
    }, BLOCKED_RETRY_MS);
    return () => clearInterval(interval);
  }, [move, advanceTime]);

  const handleDirectionChange = useCallback(
    (dir: Direction | null) => {
      heldDirection.current = dir;
      setHeldDir(dir);
      if (dir) { advanceTime(); move(dir); }
    },
    [move, advanceTime]
  );

  const handleSigilComplete = useCallback(
    (type: UtilityType | null) => {
      if (type) { advanceTime(); castSigil(type); }
    },
    [castSigil, advanceTime]
  );

  const isFlashing = scrambleFlashUntil !== null && now < scrambleFlashUntil;
  const secondsToScramble = nextScrambleAt !== null ? Math.max(0, (nextScrambleAt - now) / 1000) : null;
  const isFeedbackVisible = feedback !== null && now < feedback.until;
  const shieldActive = displaySimulationTime < shieldUntil;
  const dashActive = !!heroTravel && heroTravel.duration < 200;

  const inventoryCounts = inventory.reduce<Partial<Record<UtilityType, number>>>((acc, type) => {
    acc[type] = (acc[type] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <View className="flex-1 bg-paper px-4 pt-14">
      <GameAudio heroRunning={isMoving || heldDir !== null} />
      <Text className="font-hand text-2xl text-ink">
        {level ? `${level.id}. ${level.title}` : 'Loading...'}
        {__DEV__ ? ' · PERF-4' : ''}
      </Text>
      <Text className={`font-script text-base ${isFlashing ? 'text-ink' : 'text-ink-soft'}`}>
        {caughtBy
          ? `caught by ${caughtBy === 'wraith' ? 'the ghost' : `the ${caughtBy}`}`
          : stalkerAlert
            ? 'spotted! leave the stalker’s range to break the alarm'
          : isFeedbackVisible
          ? feedback!.message
          : reachedExit
            ? 'you made it out'
            : secondsToScramble !== null
              ? isFlashing ? 'all maze blocks are shifting' : `all blocks scramble in ${secondsToScramble.toFixed(1)}s`
              : 'maze is calm here'}
      </Text>
      {Object.keys(inventoryCounts).length > 0 && (
        <Text className="font-script text-sm text-ink-soft">
          {Object.entries(inventoryCounts)
            .map(([type, count]) => `${type} x${count}`)
            .join('   ')}
        </Text>
      )}
      {shieldActive && <Text className="font-script text-sm text-ink-soft">
        Shield: {Math.max(0, (shieldUntil - displaySimulationTime) / 1000).toFixed(1)}s
      </Text>}

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
              key={runId}
              world={world}
              currentBlockId={currentBlockId}
              heroCell={heroCell}
              facing={isMoving ? facing : heldDir ?? facing}
              isHolding={isMoving || heldDir !== null}
              onMoveComplete={handleMoveComplete}
              pickups={pickups}
              allowedUtilities={level?.utilities ?? []}
              traps={traps}
              shieldActive={shieldActive}
              dashActive={dashActive}
              paused={paused || !!caughtBy || reachedExit}
              width={canvasSize.width}
              height={canvasSize.height}
            />
            {!caughtBy && !reachedExit && !paused && <SigilCanvas width={canvasSize.width} height={canvasSize.height} onComplete={handleSigilComplete} />}
            {__DEV__ && !paused && <PerformanceReadout />}
          </>
        )}
      </View>

      <View className="h-72 items-center">
        {caughtBy || reachedExit ? <View className="items-center pt-6">
          <Text className="font-hand text-3xl text-ink">{caughtBy ? 'The maze claimed you' : 'You made it out'}</Text>
          {reachedExit && <Text className="font-script text-base text-ink-soft">Time {formatRunTime(baseElapsed.current + displaySimulationTime)}</Text>}
          {reachedExit && levelId < 20 && <Pressable accessibilityRole="button" accessibilityLabel="Next level"
            className="mt-4 rounded-xl bg-ink px-8 py-3" onPress={() => router.replace({ pathname: '/game/[id]', params: { id: String(levelId + 1) } })}>
            <Text className="font-hand text-xl text-paper">Next level</Text>
          </Pressable>}
          <Pressable accessibilityRole="button" accessibilityLabel="Retry level"
            className="mt-4 rounded-xl bg-ink px-8 py-3" onPress={() => {
              clearInput(); baseElapsed.current = 0; useProgressStore.getState().startRun(levelId);
              loadLevel(levelId); previousTick.current = performance.now();
            }}>
            <Text className="font-hand text-xl text-paper">Try again</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to levels"
            className="mt-3 px-6 py-2" onPress={() => router.replace('/')}>
            <Text className="font-hand text-lg text-ink">Back to levels</Text>
          </Pressable>
        </View> : <DPad key={`${runId}-${paused}`} onDirectionChange={handleDirectionChange} />}
      </View>
    </View>
  );
}
