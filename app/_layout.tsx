import '../global.css';

import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import {
  ArchitectsDaughter_400Regular,
} from '@expo-google-fonts/architects-daughter';
import { PatrickHand_400Regular } from '@expo-google-fonts/patrick-hand';
import { CinzelDecorative_900Black } from '@expo-google-fonts/cinzel-decorative';
import { useProgressStore } from '../store/progressStore';
import { usePurchaseStore } from '../store/purchaseStore';
import { MenuAudio } from '../components/MenuAudio';
import { preloadSpriteImages } from '../lib/sprites/imageCache';

export default function RootLayout() {
  const hydrate = useProgressStore((state) => state.hydrate);
  const progressHydrated = useProgressStore((state) => state.hydrated);
  const initializePurchases = usePurchaseStore((state) => state.initialize);
  const [fontsLoaded, fontError] = useFonts({
    ArchitectsDaughter: ArchitectsDaughter_400Regular,
    PatrickHand: PatrickHand_400Regular,
    CinzelDecorative: CinzelDecorative_900Black,
  });

  useEffect(() => {
    if (fontError) console.error(fontError);
  }, [fontError]);

  useEffect(() => { preloadSpriteImages(); }, []);
  useEffect(() => { void hydrate(); }, [hydrate]);
  useEffect(() => {
    if (progressHydrated) void initializePurchases();
  }, [initializePurchases, progressHydrated]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="dark" />
      {progressHydrated && <MenuAudio />}
      <Stack screenOptions={{ headerShown: false }} />
    </GestureHandlerRootView>
  );
}
