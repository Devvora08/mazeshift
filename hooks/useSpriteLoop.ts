import { useEffect } from 'react';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

/**
 * Cycles 0..frameCount-1 on a fixed-rate interval, looping forever.
 * Writes directly to a shared value (not React state) so frame-ticking never
 * triggers a React re-render — it stays entirely on the UI thread, same as
 * the position/camera tweens it needs to stay in sync with.
 */
export function useSpriteLoop(frameCount: number, fps: number): SharedValue<number> {
  const frame = useSharedValue(0);

  useEffect(() => {
    if (frameCount <= 1) return;
    const interval = setInterval(() => {
      frame.value = (frame.value + 1) % frameCount;
    }, 1000 / fps);
    return () => clearInterval(interval);
  }, [frameCount, fps, frame]);

  return frame;
}
