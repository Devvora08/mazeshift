import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { usePathname } from 'expo-router';

import { useProgressStore } from '../store/progressStore';

/**
 * The main-page track for every screen except gameplay, which has its own music.
 * Mounted once in the root layout so moving between menu pages never restarts it.
 */
export function MenuAudio() {
  const enabled = useProgressStore((state) => state.settings.musicEnabled);
  const pathname = usePathname();
  const inGame = pathname.startsWith('/game');
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const player = useAudioPlayer(require('../assets/audio/main_page.mp3'));
  const loaded = useAudioPlayerStatus(player).isLoaded;

  useEffect(() => {
    player.loop = true;
    player.volume = 0.12;
  }, [player]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => subscription.remove();
  }, []);

  // A play() issued before the source loads can be dropped on Android; wait for it.
  useEffect(() => {
    if (!loaded) return;
    if (enabled && !inGame && foreground) player.play();
    else player.pause();
  }, [loaded, enabled, inGame, foreground, player]);

  return null;
}
