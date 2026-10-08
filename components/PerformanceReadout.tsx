import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { runOnJS, useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { drainCounts, drainMeasurements } from '../lib/perfProbe';
import { PERF_FLAGS, toggleFlag, useDisabledFlags } from '../lib/perfFlags';

const JS_PROBE_MS = 16;

/** Test-only sampling of both threads; one small React update each second.
 * UI: frame rate and frames >25ms. JS: worst timer lateness, which is how long
 * a held move waits at a cell boundary before the next step can start. */
export const PerformanceReadout = memo(function PerformanceReadout() {
  const [label, setLabel] = useState('PERF-7 · measuring');
  const disabledFlags = useDisabledFlags();
  const js = useRef({ worst: 0, late: 0 });
  const elapsed = useSharedValue(0), frames = useSharedValue(0), slow = useSharedValue(0);
  const report = useCallback((fps: number, longFrames: number) => {
    const { worst, late } = js.current;
    js.current = { worst: 0, late: 0 };
    setLabel(`PERF-7 · UI ${fps} fps, ${longFrames} slow · JS worst ${worst}ms, ${late} stalls>30ms
${drainMeasurements()}
${drainCounts()}`);
  }, []);
  useEffect(() => {
    let expected = performance.now() + JS_PROBE_MS;
    const probe = setInterval(() => {
      const now = performance.now();
      const lateness = Math.round(now - expected);
      expected = now + JS_PROBE_MS;
      if (lateness > js.current.worst) js.current.worst = lateness;
      if (lateness > 30) js.current.late += 1;
    }, JS_PROBE_MS);
    return () => clearInterval(probe);
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
  // Tap a switch to turn that subsystem off (struck through) while playing.
  return <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#ffffffdd' }}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {PERF_FLAGS.map(flag => <Pressable key={flag} onPress={() => toggleFlag(flag)}
        style={{ paddingHorizontal: 6, paddingVertical: 4, margin: 2, borderWidth: 1, borderRadius: 4,
          borderColor: disabledFlags.has(flag) ? '#dc2626' : '#555' }}>
        <Text style={{ fontSize: 11, color: disabledFlags.has(flag) ? '#dc2626' : '#222',
          textDecorationLine: disabledFlags.has(flag) ? 'line-through' : 'none' }}>{flag}</Text>
      </Pressable>)}
    </View>
    <Text pointerEvents="none" style={{ fontSize: 11, color: '#555' }}>{label}</Text>
  </View>;
});
