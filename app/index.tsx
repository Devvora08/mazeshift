import { Link } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { LEVELS } from '../lib/levels/data';
import { MenuAudio } from '../components/MenuAudio';
import { formatRunTime, useProgressStore } from '../store/progressStore';
import { usePurchaseStore } from '../store/purchaseStore';

export default function Home() {
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
  return (
    <View className="flex-1 bg-paper px-8 pt-16">
      <MenuAudio />
      <Text className="font-hand text-4xl text-ink">MazeShift</Text>
      <Text className="mt-2 font-script text-base text-ink-soft">
        The maze moves. Find the exit before it changes again.
      </Text>

      <ScrollView className="mt-8" contentContainerClassName="gap-2 pb-8">
        {hydrated && activeRun && (
          <Link href={{ pathname: '/game/[id]', params: { id: String(activeRun.levelId), resume: '1' } }} asChild>
            <Text className="rounded-xl bg-ink px-4 py-3 font-script text-lg text-paper">
              Continue level {activeRun.levelId} · {formatRunTime(activeRun.elapsedMs)}
            </Text>
          </Link>
        )}
        <Link href={{ pathname: '/game/[id]', params: { id: '0' } }} asChild>
          <Text className="rounded-xl border border-spell-phase px-4 py-3 font-script text-lg text-ink">
            Practice — try out spells
          </Text>
        </Link>
        {hydrated && highestUnlockedLevel >= 11 && !premiumUnlocked && (
          <View className="mb-3 rounded-xl border border-spell-phase p-4">
            <Text className="font-hand text-2xl text-ink">Unlock the full game</Text>
            <Text className="mt-1 font-script text-base text-ink-soft">Levels 11–20 and future MazeShift campaign levels.</Text>
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
        {LEVELS.map((level) => {
          const needsPurchase = level.id > 10 && !premiumUnlocked;
          const locked = !hydrated || level.id > highestUnlockedLevel || needsPurchase;
          const record = records[String(level.id)];
          return (
          <Link
            key={level.id}
            href={{ pathname: '/game/[id]', params: { id: String(level.id) } }}
            asChild
            disabled={locked}
          >
            <Text className={`rounded-xl border px-4 py-3 font-script text-lg ${locked ? 'border-ink/10 text-ink-soft' : 'border-ink/15 text-ink'}`}>
              {level.id}. {level.title}{needsPurchase ? '  · full game' : locked ? '  · locked' : record?.completed ? '  ✓' : ''}
              {record?.bestTimeMs != null ? `  · best ${formatRunTime(record.bestTimeMs)}` : ''}
            </Text>
          </Link>
        );})}
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
        </View>
      </ScrollView>
    </View>
  );
}
