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

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    ArchitectsDaughter: ArchitectsDaughter_400Regular,
    PatrickHand: PatrickHand_400Regular,
  });

  useEffect(() => {
    if (fontError) console.error(fontError);
  }, [fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </GestureHandlerRootView>
  );
}
