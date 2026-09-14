import { useEffect } from 'react';
import { useAudioPlayer } from 'expo-audio';
import { useIsFocused } from 'expo-router';

import { useProgressStore } from '../store/progressStore';

export function MenuAudio() {
  const enabled = useProgressStore((state) => state.settings.musicEnabled);
  const isFocused = useIsFocused();
  const player = useAudioPlayer(require('../assets/audio/menu_music.mp3'));

  useEffect(() => {
    player.loop = true;
    player.volume = 0.12;
  }, [player]);

  useEffect(() => {
    if (enabled && isFocused) player.play();
    else player.pause();
    return () => player.pause();
  }, [enabled, isFocused, player]);

  return null;
}
