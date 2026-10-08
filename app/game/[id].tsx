import { router, useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Pressable, Text, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';

import { DPad } from '../../components/DPad';
import { SPELL_BAR_HEIGHT, SpellBar } from '../../components/SpellBar';
import { SigilCanvas } from '../../components/SigilCanvas';
import { WorldCanvas } from '../../components/WorldCanvas';
import { PerformanceReadout } from '../../components/PerformanceReadout';
import { GameAudio } from '../../components/GameAudio';
import type { UtilityType } from '../../lib/modules/utilities';
import type { Direction } from '../../store/gameStore';
import { useGameStore } from '../../store/gameStore';
import { formatRunTime, useProgressStore } from '../../store/progressStore';
import { UNLOCK_ALL_LEVELS } from '../../lib/devUnlock';
import { screenOwnsRun } from '../../lib/runGuard';
import { count, measure } from '../../lib/perfProbe';
import { useDisabledFlags } from '../../lib/perfFlags';

/** Retry only when a held direction is blocked; completed slides chain immediately. */
const SIMULATION_TICK_MS = 50;

export default function GameScreen() {
  count('screen renders');
  const disabledFlags = useDisabledFlags();
  const { id, resume } = useLocalSearchParams<{ id: string; resume?: string }>();
  const levelId = Number(id);
  const progressHydrated = useProgressStore((state) => state.hydrated);
  const highestUnlockedLevel = useProgressStore((state) => state.highestUnlockedLevel);
  const premiumUnlocked = useProgressStore((state) => state.premiumUnlocked);

  const level = useGameStore((s) => s.level);
  const world = useGameStore((s) => s.world);
  const currentBlockId = useGameStore((s) => s.currentBlockId);
  // Per-step hero state is deliberately not subscribed here: the hero moves on the
  // UI thread, and re-rendering this screen every step only slowed JavaScript down.
  const hasHero = useGameStore((s) => s.heroCell !== null);
  const nextScrambleAt = useGameStore((s) => s.nextScrambleAt);
  const scrambleFlashUntil = useGameStore((s) => s.scrambleFlashUntil);
  const reachedExit = useGameStore((s) => s.reachedExit);
  const inventory = useGameStore((s) => s.inventory);
  const pickups = useGameStore((s) => s.pickups);
  const feedback = useGameStore((s) => s.feedback);
  const traps = useGameStore((s) => s.traps);
  const shieldUntil = useGameStore((s) => s.shieldUntil);
  const dashActive = useGameStore((s) => !!s.heroTravel && s.heroTravel.duration < 200);
  const caughtBy = useGameStore((s) => s.caughtBy);
  const stalkerAlert = useGameStore((s) => s.stalkerAlert);
  const paused = useGameStore((s) => s.paused);
  const runId = useGameStore((s) => s.runId);
  const loadLevel = useGameStore((s) => s.loadLevel);
  const checkScramble = useGameStore((s) => s.checkScramble);
  const finishMove = useGameStore((s) => s.finishMove);
  const castSigil = useGameStore((s) => s.castSigil);
  const castSpell = useGameStore((s) => s.castSpell);
  const spellOrder = useGameStore((s) => s.spellOrder);

  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [now, setNow] = useState(Date.now());
  const [displaySimulationTime, setDisplaySimulationTime] = useState(0);
  const [heldDir, setHeldDir] = useState<Direction | null>(null);
  /** Written by the D-pad on the UI thread; the hero engine reads it every frame. */
  const heldShared = useSharedValue<Direction | null>(null);
  const baseElapsed = useRef(0);
  const recordedDeathRun = useRef<number | null>(null);
  /** The run this screen loaded; progress is only ever recorded for it. */
  const loadedRun = useRef<number | null>(null);
  /** Load once per visit, even if purchase or hydration state changes mid-run. */
  const loadedKey = useRef<string | null>(null);
  const ownsRun = useCallback(
    () => screenOwnsRun(useGameStore.getState(), loadedRun.current, levelId), [levelId]);
  const recordedWinRun = useRef<number | null>(null);
  const heldDirection = useRef<Direction | null>(null);
  const screenActive = useRef(false);
  const previousTick = useRef(performance.now());
  const advanceTime = useCallback(() => {
    const time = performance.now();
    const elapsed = Math.max(0, time - previousTick.current);
    previousTick.current = time;
    if (screenActive.current) measure('tick', () => useGameStore.getState().tick(elapsed));
  }, []);

  const clearInput = useCallback(() => {
    heldDirection.current = null;
    heldShared.value = null;
    setHeldDir(null);
  }, [heldShared]);

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
    const key = `${levelId}:${resume ?? ''}`;
    if (loadedKey.current === key) return;
    const progress = useProgressStore.getState();
    if (!UNLOCK_ALL_LEVELS && (levelId > progress.highestUnlockedLevel || (levelId > 10 && !progress.premiumUnlocked))) return;
    const continued = resume === '1' && progress.activeRun?.levelId === levelId;
    baseElapsed.current = continued ? progress.activeRun!.elapsedMs : 0;
    loadLevel(levelId);
    loadedKey.current = key;
    loadedRun.current = useGameStore.getState().runId;
    if (!continued) progress.startRun(levelId);
    previousTick.current = performance.now();
  }, [levelId, resume, loadLevel, progressHydrated, premiumUnlocked]);

  useEffect(() => {
    if (!UNLOCK_ALL_LEVELS && progressHydrated && (levelId > highestUnlockedLevel || (levelId > 10 && !premiumUnlocked))) router.dismissTo('/levels');
  }, [progressHydrated, highestUnlockedLevel, premiumUnlocked, levelId]);

  useEffect(() => {
    // Read the outcome from the store and only for this screen's own run: a new
    // screen's first render can still carry the previous level's win or death.
    if (levelId === 0 || !ownsRun()) return;
    const game = useGameStore.getState();
    const elapsed = baseElapsed.current + game.simulationTime;
    if (game.caughtBy && recordedDeathRun.current !== game.runId) {
      recordedDeathRun.current = game.runId;
      useProgressStore.getState().recordDeath(levelId, elapsed);
    }
    if (game.reachedExit && recordedWinRun.current !== game.runId) {
      recordedWinRun.current = game.runId;
      useProgressStore.getState().completeLevel(levelId, elapsed);
    }
  }, [caughtBy, reachedExit, runId, levelId, ownsRun]);

  useEffect(() => {
    if (levelId === 0 || reachedExit) return;
    const checkpoint = () => {
      if (!ownsRun()) return;
      useProgressStore.getState().checkpointRun(levelId, baseElapsed.current + useGameStore.getState().simulationTime);
    };
    const interval = setInterval(checkpoint, 2000);
    return () => {
      clearInterval(interval);
      checkpoint();
    };
  }, [levelId, reachedExit, ownsRun]);

  // Leaving mid-run (Android back) asks first and pauses while asking. The run is
  // already checkpointed, so leaving keeps it available as Continue on the home screen.
  const navigation = useNavigation();
  useEffect(() => navigation.addListener('beforeRemove', (event) => {
    const game = useGameStore.getState();
    if (levelId === 0 || !ownsRun() || game.caughtBy || game.reachedExit) return;
    event.preventDefault();
    const wasPaused = game.paused;
    clearInput();
    game.setPaused(true);
    const stay = () => {
      if (wasPaused || AppState.currentState !== 'active') return;
      previousTick.current = performance.now();
      useGameStore.getState().setPaused(false);
    };
    Alert.alert('Leave this level?', 'Your run is saved. You can continue it from the home screen.', [
      { text: 'Keep playing', style: 'cancel', onPress: stay },
      { text: 'Leave', style: 'destructive', onPress: () => navigation.dispatch(event.data.action) },
    ], { cancelable: true, onDismiss: stay });
  }), [navigation, levelId, ownsRun, clearInput]);

  useEffect(() => {
    const simulationInterval = setInterval(() => {
      const t = Date.now();
      advanceTime();
      if (screenActive.current) measure('scramble', () => checkScramble(t));
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

  // The UI-thread hero engine chains steps itself; JavaScript only records them.
  const handleStepStart = useCallback(() => {
    if (useGameStore.getState().runId !== runId) return;
    advanceTime();
  }, [advanceTime, runId]);

  const handleMoveComplete = useCallback(() => {
    if (useGameStore.getState().runId !== runId) return;
    advanceTime();
    measure('step', () => finishMove());
  }, [finishMove, advanceTime, runId]);

  // Only footstep audio and pause bookkeeping need the held direction on this thread.
  const handleDirectionChange = useCallback((dir: Direction | null) => {
    heldDirection.current = dir;
    setHeldDir(dir);
  }, []);

  const handleSigilComplete = useCallback(
    (type: UtilityType | null) => {
      if (type) { advanceTime(); castSigil(type); }
    },
    [castSigil, advanceTime]
  );

  const handleSpellTap = useCallback((type: UtilityType) => {
    advanceTime(); castSpell(type);
  }, [castSpell, advanceTime]);

  const isFlashing = scrambleFlashUntil !== null && now < scrambleFlashUntil;
  const secondsToScramble = nextScrambleAt !== null ? Math.max(0, (nextScrambleAt - now) / 1000) : null;
  const isFeedbackVisible = feedback !== null && now < feedback.until;
  const shieldActive = displaySimulationTime < shieldUntil;

  return (
    <View className="flex-1 bg-paper px-4 pt-14">
      {!disabledFlags.has('audio') && <GameAudio heroHeld={heldDir !== null} />}
      <Text className="font-hand text-2xl text-ink">
        {level ? `${level.id}. ${level.title}` : 'Loading...'}
        {__DEV__ ? ' · PERF-4' : ''}
        {UNLOCK_ALL_LEVELS ? ' · test build B15' : ''}
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
        {world && currentBlockId && hasHero && canvasSize.width > 0 && canvasSize.height > 0 && (
          <>
            <WorldCanvas
              key={runId}
              world={world}
              currentBlockId={currentBlockId}
              held={heldShared}
              onStepStart={handleStepStart}
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
            {(__DEV__ || UNLOCK_ALL_LEVELS) && !paused && <PerformanceReadout />}
          </>
        )}
      </View>

      {/* Above the controls section, taking its height from the maze area, so the
          D-pad keeps its original, reachable position. Height is reserved even when
          empty so nothing shifts as spells are collected and spent. */}
      {caughtBy || reachedExit
        ? <View style={{ height: SPELL_BAR_HEIGHT }} />
        : <SpellBar order={spellOrder} inventory={inventory} onCast={handleSpellTap}
            hint={level && level.utilities.length > 0
              ? 'Stand on a charm and draw its symbol to collect it, then tap it here to cast'
              : undefined} />}
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
              loadLevel(levelId); loadedRun.current = useGameStore.getState().runId;
              previousTick.current = performance.now();
            }}>
            <Text className="font-hand text-xl text-paper">Try again</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to levels"
            className="mt-3 px-6 py-2" onPress={() => router.dismissTo('/levels')}>
            <Text className="font-hand text-lg text-ink">Back to levels</Text>
          </Pressable>
        </View> : <DPad key={`${runId}-${paused}`} held={heldShared} onDirectionChange={handleDirectionChange} />}
      </View>
    </View>
  );
}
