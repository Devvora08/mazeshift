import { BlurMask, Canvas, Circle, Group, Path, Skia } from '@shopify/react-native-skia';
import { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  Easing, runOnJS, useDerivedValue, useFrameCallback, useSharedValue, withTiming,
} from 'react-native-reanimated';

import { recognizeSigil, type SigilPoint, type UtilityType } from '../lib/modules/utilities';
import {
  advanceSpellParticles, emitSpellParticles, type SpellParticle,
} from '../lib/sprites/spellParticles';

interface SigilCanvasProps {
  width: number;
  height: number;
  onComplete: (type: UtilityType | null) => void;
}

/** One shared magical drawing effect for every utility, independent of level configuration. */
export function SigilCanvas({ width, height, onComplete }: SigilCanvasProps) {
  const trailPoints = useSharedValue<SigilPoint[]>([]);
  const particles = useSharedValue<SpellParticle[]>([]);
  const trailOpacity = useSharedValue(0);
  const tipOpacity = useSharedValue(0);
  const tipX = useSharedValue(0);
  const tipY = useSharedValue(0);
  const clock = useSharedValue(0);
  const drawing = useSharedValue(false);
  const emissionDistance = useSharedValue(0);

  // The finger trail, twinkle, and drifting dust animate without React state updates.
  useFrameCallback(useCallback((info) => {
    'worklet';
    if (!drawing.value && particles.value.length === 0) return;
    const delta = info.timeSincePreviousFrame ?? 0;
    clock.value += delta;
    if (particles.value.length > 0) {
      particles.value = advanceSpellParticles(particles.value, delta);
    }
  }, [drawing, particles, clock]));

  const finishStroke = useCallback((points: SigilPoint[]) => {
    const match = recognizeSigil(points);
    onComplete(match?.type ?? null);
  }, [onComplete]);

  const pan = useMemo(() => Gesture.Pan()
    .maxPointers(1)
    .onBegin((e) => {
      trailPoints.value = [{ x: e.x, y: e.y }];
      trailOpacity.value = 1;
      tipOpacity.value = 1;
      tipX.value = e.x;
      tipY.value = e.y;
      emissionDistance.value = 0;
      drawing.value = true;
      particles.value = emitSpellParticles(particles.value, e.x, e.y, 4);
    })
    .onUpdate((e) => {
      const dx = e.x - tipX.value;
      const dy = e.y - tipY.value;
      const distance = Math.hypot(dx, dy);
      emissionDistance.value += distance;
      // Space particles along the stroke rather than tying density to display refresh rate.
      const count = Math.min(8, Math.floor(emissionDistance.value / 6));
      if (count > 0) {
        let next = particles.value;
        for (let i = 0; i < count; i++) {
          const t = (i + 1) / count;
          next = emitSpellParticles(next, tipX.value + dx * t, tipY.value + dy * t, 1);
        }
        particles.value = next;
        emissionDistance.value %= 6;
      }
      tipX.value = e.x;
      tipY.value = e.y;
      trailPoints.value = [...trailPoints.value, { x: e.x, y: e.y }];
    })
    .onEnd((_e, success) => {
      if (!success) return;
      // A single snapshot preserves every recognition point and avoids per-point JS traffic.
      runOnJS(finishStroke)(trailPoints.value);
      // Release dissolves the sigil into motes; this is cosmetic, not cast-success feedback.
      const pts = trailPoints.value;
      let next = particles.value;
      const count = Math.min(18, pts.length);
      for (let i = 0; i < count; i++) {
        const p = pts[Math.floor(i * pts.length / count)];
        next = emitSpellParticles(next, p.x, p.y, 1);
      }
      particles.value = next;
    })
    .onFinalize(() => {
      drawing.value = false;
      tipOpacity.value = withTiming(0, { duration: 180 });
      trailOpacity.value = withTiming(0, { duration: 580, easing: Easing.out(Easing.quad) }, (finished) => {
        if (finished) trailPoints.value = [];
      });
    }), [finishStroke, trailPoints, particles, trailOpacity, tipOpacity, tipX, tipY, drawing, emissionDistance]);

  const trailPath = useDerivedValue(() => {
    const pts = trailPoints.value;
    const pb = Skia.PathBuilder.Make();
    if (pts.length > 0) {
      pb.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) pb.lineTo(pts[i].x, pts[i].y);
    }
    return pb.build();
  });

  // Batch all particles into four small paths instead of creating a component per particle.
  const dustPaths = useDerivedValue(() => {
    const builders = Array.from({ length: 4 }, () => Skia.PathBuilder.Make());
    for (const p of particles.value) {
      const remaining = 1 - p.age / p.life;
      const twinkle = 0.65 + 0.35 * Math.sin(p.age * 0.019 + p.phase);
      const brightness = remaining * twinkle;
      const bucket = Math.min(3, Math.floor(brightness * 4));
      const pb = builders[bucket];
      const radius = p.radius * (0.35 + 0.65 * remaining);
      if (p.star) {
        const r = radius * 2.4;
        const inner = radius * 0.35;
        pb.moveTo(p.x, p.y - r);
        pb.lineTo(p.x + inner, p.y - inner);
        pb.lineTo(p.x + r, p.y);
        pb.lineTo(p.x + inner, p.y + inner);
        pb.lineTo(p.x, p.y + r);
        pb.lineTo(p.x - inner, p.y + inner);
        pb.lineTo(p.x - r, p.y);
        pb.lineTo(p.x - inner, p.y - inner);
        pb.close();
      } else {
        pb.addCircle(p.x, p.y, radius);
      }
    }
    return builders.map(pb => pb.build());
  });
  const dust0 = useDerivedValue(() => dustPaths.value[0]);
  const dust1 = useDerivedValue(() => dustPaths.value[1]);
  const dust2 = useDerivedValue(() => dustPaths.value[2]);
  const dust3 = useDerivedValue(() => dustPaths.value[3]);
  const tipRadius = useDerivedValue(() => 3.2 + Math.sin(clock.value * 0.012) * 0.6);

  return (
    <GestureDetector gesture={pan}>
      <View style={[StyleSheet.absoluteFill, { width, height }]}>
        <Canvas style={{ width, height }}>
          <Group opacity={trailOpacity}>
            <Path path={trailPath} color="#9333ea" style="stroke" strokeWidth={5}
              strokeJoin="round" strokeCap="round" opacity={0.35}>
              <BlurMask blur={4} style="normal" />
            </Path>
            <Path path={trailPath} color="#a855f7" style="stroke" strokeWidth={2}
              strokeJoin="round" strokeCap="round" opacity={0.85} />
            <Path path={trailPath} color="#f5deff" style="stroke" strokeWidth={0.75}
              strokeJoin="round" strokeCap="round" />
          </Group>
          <Path path={dust0} color="#a855f7" opacity={0.12} />
          <Path path={dust1} color="#9333ea" opacity={0.35} />
          <Path path={dust2} color="#b24cec" opacity={0.65} />
          <Path path={dust3} color="#d080ff" opacity={0.95} />
          <Group opacity={tipOpacity}>
            <Circle cx={tipX} cy={tipY} r={7} color="#a855f7" opacity={0.6}>
              <BlurMask blur={5} style="normal" />
            </Circle>
            <Circle cx={tipX} cy={tipY} r={tipRadius} color="#c084fc" />
            <Circle cx={tipX} cy={tipY} r={1.5} color="#fff7ff" />
          </Group>
        </Canvas>
      </View>
    </GestureDetector>
  );
}
