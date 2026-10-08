import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { LevelGrid, type LevelCell } from '../components/LevelGrid';
import { LEVELS } from '../lib/levels/data';
import { formatRunTime, useProgressStore } from '../store/progressStore';
import { usePurchaseStore } from '../store/purchaseStore';
import { UNLOCK_ALL_LEVELS } from '../lib/devUnlock';
import { FREE_LEVELS, PAYWALL_ENABLED, needsPurchase as levelNeedsPurchase } from '../lib/paywall';

export default function Levels() {
  const hydrated = useProgressStore((state) => state.hydrated);
  const highestUnlockedLevel = useProgressStore((state) => state.highestUnlockedLevel);
  const records = useProgressStore((state) => state.levels);
  const activeRun = useProgressStore((state) => state.activeRun);
  const settings = useProgressStore((state) => state.settings);
  const premiumUnlocked = useProgressStore((state) => state.premiumUnlocked);
  const setMusicEnabled = useProgressStore((state) => state.setMusicEnabled);
  const setSoundEffectsEnabled = useProgressStore((state) => state.setSoundEffectsEnabled);
  const setHapticsEnabled = useProgressStore((state) => state.setHapticsEnabled);
  const purchaseReady = usePurchaseStore((state) => state.ready);
  const purchaseBusy = usePurchaseStore((state) => state.busy);
  const priceText = usePurchaseStore((state) => state.priceText);
  const purchaseAppUserId = usePurchaseStore((state) => state.appUserId);
  const purchaseNotice = usePurchaseStore((state) => state.notice);
  const purchaseError = usePurchaseStore((state) => state.error);
  const purchaseFullGame = usePurchaseStore((state) => state.purchaseFullGame);
  const restorePurchases = usePurchaseStore((state) => state.restorePurchases);
  const [gridWidth, setGridWidth] = useState(0);

  const cells: LevelCell[] = LEVELS.map((level) => {
    // Local Expo development unlocks access without changing saved progress or purchases.
    const needsPurchase = levelNeedsPurchase(level.id, premiumUnlocked);
    const locked = !hydrated || (!UNLOCK_ALL_LEVELS && level.id > highestUnlockedLevel) || needsPurchase;
    const record = records[String(level.id)];
    const state = locked ? 'locked' : activeRun?.levelId === level.id ? 'ongoing'
      : record?.completed ? 'completed' : 'open';
    return { id: level.id, title: level.title, state,
      bestTime: record?.bestTimeMs != null ? formatRunTime(record.bestTimeMs) : undefined };
  });
  const openLevel = (cell: LevelCell) => router.push({ pathname: '/game/[id]',
    params: cell.state === 'ongoing' ? { id: String(cell.id), resume: '1' } : { id: String(cell.id) } });
  return (
    <View className="flex-1 bg-paper px-8 pt-16">
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} hitSlop={12}>
        <Text className="font-script text-lg text-ink-soft">‹ Back</Text>
      </Pressable>
      <Text className="mt-2 font-hand text-4xl text-ink">Levels</Text>

      <ScrollView className="mt-8" contentContainerClassName="gap-2 pb-8" showsVerticalScrollIndicator={false}>
        <Link href={{ pathname: '/game/[id]', params: { id: '0' } }} asChild>
          <Text className="rounded-xl border border-spell-phase px-4 py-3 font-script text-lg text-ink">
            Practice — try out spells
          </Text>
        </Link>
        {PAYWALL_ENABLED && !UNLOCK_ALL_LEVELS && hydrated && highestUnlockedLevel > FREE_LEVELS && !premiumUnlocked && (
          <View className="mb-3 rounded-xl border border-spell-phase p-4">
            <Text className="font-hand text-2xl text-ink">Unlock the full game</Text>
            <Text className="mt-1 font-script text-base text-ink-soft">Levels {FREE_LEVELS + 1} and beyond, plus future MazeShift campaign levels.</Text>
            <Pressable disabled={!purchaseReady || purchaseBusy} onPress={() => void purchaseFullGame()}
              className="mt-3 rounded-xl bg-ink px-4 py-3">
              <Text className="text-center font-hand text-xl text-paper">
                {purchaseBusy ? 'Connecting…' : `Unlock${priceText ? ` · ${priceText}` : ''}`}
              </Text>
            </Pressable>
            <Pressable disabled={purchaseBusy} onPress={() => void restorePurchases()} className="mt-2 py-2">
              <Text className="text-center font-script text-base text-ink">Restore purchase</Text>
            </Pressable>
            {purchaseError && <Text className="mt-1 font-script text-sm text-ink-soft">{purchaseError}</Text>}
          </View>
        )}
        <View className="mt-2" onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
          <LevelGrid width={gridWidth} cells={cells} onPress={openLevel} />
        </View>
        <View className="mt-6 border-t border-ink/15 pt-4">
          <Text className="font-hand text-xl text-ink">Settings</Text>
          <Pressable onPress={() => setMusicEnabled(!settings.musicEnabled)} className="py-2">
            <Text className="font-script text-lg text-ink">Music: {settings.musicEnabled ? 'On' : 'Off'}</Text>
          </Pressable>
          <Pressable onPress={() => setSoundEffectsEnabled(!settings.soundEffectsEnabled)} className="py-2">
            <Text className="font-script text-lg text-ink">Sound effects: {settings.soundEffectsEnabled ? 'On' : 'Off'}</Text>
          </Pressable>
          <Pressable onPress={() => setHapticsEnabled(!settings.hapticsEnabled)} className="py-2">
            <Text className="font-script text-lg text-ink">Vibration: {settings.hapticsEnabled ? 'On' : 'Off'}</Text>
          </Pressable>
          {PAYWALL_ENABLED && <>
          <Pressable disabled={!purchaseReady || purchaseBusy} onPress={() => void restorePurchases()} className="py-2">
            <Text className="font-script text-lg text-ink">
              {purchaseBusy ? 'Checking purchases…' : 'Restore purchase'}
            </Text>
          </Pressable>
          {purchaseNotice && <Text className="font-script text-sm text-ink-soft">{purchaseNotice}</Text>}
          {purchaseError && <Text className="font-script text-sm text-ink-soft">{purchaseError}</Text>}
          {purchaseAppUserId && (
            <Text selectable className="mt-2 font-script text-xs text-ink-soft">
              Purchase support ID: {purchaseAppUserId}
            </Text>
          )}
          </>}
        </View>
      </ScrollView>
    </View>
  );
}
