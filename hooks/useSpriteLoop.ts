import { useCallback, useEffect } from 'react';
import { useFrameCallback, useSharedValue, type SharedValue } from 'react-native-reanimated';

/** Advance on the UI frame clock; JS work cannot delay individual sprite ticks. */
export function useSpriteLoop(frameCount: number, fps: number): SharedValue<number> {
  const frame = useSharedValue(0);
  const elapsed = useSharedValue(0);
  const callback = useFrameCallback(useCallback((info) => {
    'worklet';
    if (frameCount <= 1 || fps <= 0) {
      frame.value = 0;
      elapsed.value = 0;
      return;
    }
    const cycleMs = frameCount * 1000 / fps;
    // Pause across backgrounding rather than fast-forwarding through the cycle.
    const delta = info.timeSincePreviousFrame ?? 0;
    elapsed.value = (elapsed.value + (delta > 250 ? 0 : delta)) % cycleMs;
    frame.value = Math.min(frameCount - 1, Math.floor(elapsed.value * fps / 1000));
  }, [frameCount, fps, frame, elapsed]), fps > 0);
  useEffect(() => {
    const active = fps > 0;
    callback.setActive(active);
    if (!active) {
      frame.value = 0;
      elapsed.value = 0;
    }
    return () => callback.setActive(false);
  }, [callback, elapsed, fps, frame]);
  return frame;
}
