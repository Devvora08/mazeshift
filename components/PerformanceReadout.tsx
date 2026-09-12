import { memo, useCallback, useState } from 'react';
import { Text } from 'react-native';
import { runOnJS, useFrameCallback, useSharedValue } from 'react-native-reanimated';

/** Development-only UI-frame sampling; one small React update each second. */
export const PerformanceReadout = memo(function PerformanceReadout() {
  const [label, setLabel] = useState('PERF-4 · measuring frames');
  const elapsed = useSharedValue(0), frames = useSharedValue(0), slow = useSharedValue(0);
  const report = useCallback((fps: number, longFrames: number) => {
    setLabel(`PERF-4 · UI ${fps} fps · ${longFrames} frames >25ms/s`);
  }, []);
  useFrameCallback(useCallback(info => {
    'worklet';
    const dt = info.timeSincePreviousFrame ?? 0;
    if (dt <= 0 || dt > 1000) { elapsed.value = 0; frames.value = 0; slow.value = 0; return; }
    elapsed.value += dt; frames.value += 1;
    if (dt > 25) slow.value += 1;
    if (elapsed.value >= 1000) {
      runOnJS(report)(Math.round(frames.value * 1000 / elapsed.value), slow.value);
      elapsed.value = 0; frames.value = 0; slow.value = 0;
    }
  }, [elapsed, frames, slow, report]));
  return <Text pointerEvents="none" style={{ position: 'absolute', bottom: 0, left: 0,
    fontSize: 10, color: '#555', backgroundColor: '#ffffffdd' }}>{label}</Text>;
});
