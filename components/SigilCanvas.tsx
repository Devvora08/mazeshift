import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useDerivedValue, useSharedValue } from 'react-native-reanimated';

import { recognizeSigil, type SigilPoint } from '../lib/modules/utilities';
import type { UtilityType } from '../lib/modules/utilities';

interface SigilCanvasProps {
  width: number;
  height: number;
  onComplete: (type: UtilityType | null) => void;
}

const TRAIL_COLOR = '#a78bfa';

/** Transparent overlay on top of the maze canvas — captures a single-stroke drawing gesture,
 *  shows a live ink trail while the finger moves, and reports the recognized sigil on release. */
export function SigilCanvas({ width, height, onComplete }: SigilCanvasProps) {
  const trailPoints = useSharedValue<SigilPoint[]>([]);
  const rawPoints = useRef<SigilPoint[]>([]);

  const pushRawPoint = (x: number, y: number) => {
    rawPoints.current.push({ x, y });
  };
  const resetRawPoints = () => {
    rawPoints.current = [];
  };
  const finishStroke = () => {
    const match = recognizeSigil(rawPoints.current);
    onComplete(match?.type ?? null);
  };

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .onBegin((e) => {
          trailPoints.value = [{ x: e.x, y: e.y }];
          runOnJS(resetRawPoints)();
          runOnJS(pushRawPoint)(e.x, e.y);
        })
        .onUpdate((e) => {
          trailPoints.value = [...trailPoints.value, { x: e.x, y: e.y }];
          runOnJS(pushRawPoint)(e.x, e.y);
        })
        .onEnd(() => {
          runOnJS(finishStroke)();
        })
        .onFinalize(() => {
          trailPoints.value = [];
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onComplete]
  );

  const trailPath = useDerivedValue(() => {
    const pts = trailPoints.value;
    const pb = Skia.PathBuilder.Make();
    if (pts.length > 0) {
      pb.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) pb.lineTo(pts[i].x, pts[i].y);
    }
    return pb.build();
  });

  return (
    <GestureDetector gesture={pan}>
      <View style={[StyleSheet.absoluteFill, { width, height }]}>
        <Canvas style={{ width, height }}>
          <Path
            path={trailPath}
            color={TRAIL_COLOR}
            style="stroke"
            strokeWidth={4}
            strokeJoin="round"
            strokeCap="round"
          />
        </Canvas>
      </View>
    </GestureDetector>
  );
}
