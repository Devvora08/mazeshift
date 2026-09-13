import { memo, useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import type { Direction } from '../store/gameStore';
import { useProgressStore } from '../store/progressStore';

interface DPadProps {
  size?: number;
  onDirectionChange: (direction: Direction | null) => void;
}

const ROTATION: Record<Direction, string> = {
  up: '0deg', right: '90deg', down: '180deg', left: '270deg',
};
const SPRING = { damping: 15, stiffness: 330, mass: 0.6 };

const DirectionKey = memo(function DirectionKey({ direction, size, onDown, onUp }: {
  direction: Direction;
  size: number;
  onDown: (direction: Direction) => void;
  onUp: (direction: Direction) => void;
}) {
  const hapticsEnabled = useProgressStore((state) => state.settings.hapticsEnabled);
  const press = useSharedValue(0);
  const faceStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: press.value * 4 },
      { scale: 1 - press.value * 0.06 },
    ],
    backgroundColor: interpolateColor(press.value, [0, 1], ['#252332', '#8138c8']),
    borderColor: interpolateColor(press.value, [0, 1], ['#4d465e', '#e3a5ff']),
  }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: press.value * 0.75,
    transform: [{ scale: 0.95 + press.value * 0.12 }],
  }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Move ${direction}`}
      onPressIn={() => {
        onDown(direction);
        press.value = withSpring(1, SPRING);
        if (hapticsEnabled) void Haptics.selectionAsync().catch(() => {});
      }}
      onPressOut={() => {
        onUp(direction);
        press.value = withSpring(0, SPRING);
      }}
      style={[styles.key, { width: size, height: size }]}
    >
      <Animated.View pointerEvents="none" style={[styles.glow, glowStyle]} />
      <View pointerEvents="none" style={styles.keyBase} />
      <Animated.View pointerEvents="none" style={[styles.keyFace, faceStyle]}>
        <View style={{ transform: [{ rotate: ROTATION[direction] }] }}>
          <View style={styles.chevron} />
        </View>
        <View style={styles.keyHighlight} />
      </Animated.View>
    </Pressable>
  );
});

/** Explicit grid slots keep layout independent of Pressable's pressed-style handling. */
export const DPad = memo(function DPad({ size = 192, onDirectionChange }: DPadProps) {
  const gap = 6;
  const padding = 12;
  const keySize = (size - padding * 2 - gap * 2) / 3;
  const pressedDirections = useRef<Direction[]>([]);
  const [active, setActive] = useState<Direction | null>(null);
  const tiltX = useSharedValue(0);
  const tiltY = useSharedValue(0);
  const energy = useSharedValue(0);

  const update = useCallback((direction: Direction | null) => {
    setActive(direction);
    onDirectionChange(direction);
    tiltX.value = withSpring(direction === 'left' ? -3 : direction === 'right' ? 3 : 0, SPRING);
    tiltY.value = withSpring(direction === 'up' ? -3 : direction === 'down' ? 3 : 0, SPRING);
    energy.value = withSpring(direction ? 1 : 0, SPRING);
  }, [onDirectionChange, tiltX, tiltY, energy]);

  const down = useCallback((direction: Direction) => {
    pressedDirections.current = [...pressedDirections.current.filter(d => d !== direction), direction];
    update(direction);
  }, [update]);
  const up = useCallback((direction: Direction) => {
    pressedDirections.current = pressedDirections.current.filter(d => d !== direction);
    update(pressedDirections.current[pressedDirections.current.length - 1] ?? null);
  }, [update]);

  const coreStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tiltX.value }, { translateY: tiltY.value },
      { rotate: '45deg' }, { scale: 1 + energy.value * 0.12 }],
    backgroundColor: interpolateColor(energy.value, [0, 1], ['#50415e', '#cf7cff']),
  }));

  const key = (direction: Direction) => (
    <DirectionKey direction={direction} size={keySize} onDown={down} onUp={up} />
  );
  const empty = <View pointerEvents="none" style={{ width: keySize, height: keySize }} />;

  return (
    <View style={[styles.pad, { width: size, height: size, padding, gap }]}>
      <View pointerEvents="none" style={[styles.outline, { borderRadius: size / 2 }]} />
      <View style={[styles.row, { gap }]}>{empty}{key('up')}{empty}</View>
      <View style={[styles.row, { gap }]}>
        {key('left')}
        <View pointerEvents="none" style={[styles.center, { width: keySize, height: keySize }]}>
          <View style={[styles.coreRing, active !== null && styles.coreRingActive]} />
          <Animated.View style={[styles.core, coreStyle]} />
        </View>
        {key('right')}
      </View>
      <View style={[styles.row, { gap }]}>{empty}{key('down')}{empty}</View>
    </View>
  );
});

const styles = StyleSheet.create({
  pad: { backgroundColor: 'transparent' },
  outline: {
    ...StyleSheet.absoluteFill, borderWidth: 2, borderColor: '#111111',
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  key: { position: 'relative', flexShrink: 0 },
  glow: { ...StyleSheet.absoluteFill, backgroundColor: '#bb6cf0', borderRadius: 17 },
  keyBase: {
    ...StyleSheet.absoluteFill, top: 4, bottom: -4,
    backgroundColor: '#100d18', borderRadius: 15,
  },
  keyFace: {
    ...StyleSheet.absoluteFill, borderRadius: 15, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  chevron: {
    width: 13, height: 13, borderTopWidth: 3, borderLeftWidth: 3,
    borderColor: '#faf2ff', transform: [{ translateY: 3 }, { rotate: '45deg' }],
  },
  keyHighlight: {
    position: 'absolute', top: 4, left: 13, right: 13, height: 1,
    backgroundColor: '#ffffff26', borderRadius: 1,
  },
  center: { alignItems: 'center', justifyContent: 'center' },
  coreRing: {
    position: 'absolute', width: 32, height: 32, borderRadius: 16,
    borderWidth: 1, borderColor: '#c0b2cc',
  },
  coreRingActive: { borderColor: '#aa65d6' },
  core: { width: 11, height: 11, borderRadius: 3 },
});
