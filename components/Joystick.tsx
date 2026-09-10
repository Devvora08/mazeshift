import { memo, useMemo } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import type { Direction } from '../store/gameStore';

interface JoystickProps {
  size?: number;
  onDirectionChange: (direction: Direction | null) => void;
}

const KNOB_RATIO = 0.42;
/** Fraction of the max travel a drag must clear before any direction registers. */
const DEADZONE_RATIO = 0.22;

export const Joystick = memo(function Joystick({ size = 152, onDirectionChange }: JoystickProps) {
  const knobSize = size * KNOB_RATIO;
  const maxOffset = (size - knobSize) / 2;
  const deadzone = maxOffset * DEADZONE_RATIO;

  const knobX = useSharedValue(0);
  const knobY = useSharedValue(0);
  // Lives on the UI thread so onUpdate can compare against it every touch sample without crossing
  // the JS bridge — only calls back to JS (runOnJS) on the rare frames where direction actually flips.
  const lastDirection = useSharedValue<Direction | null>(null);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .onUpdate((e) => {
          const dist = Math.sqrt(e.translationX * e.translationX + e.translationY * e.translationY);
          const clamped = Math.min(dist, maxOffset);
          const angle = Math.atan2(e.translationY, e.translationX);
          knobX.value = Math.cos(angle) * clamped;
          knobY.value = Math.sin(angle) * clamped;

          const next: Direction | null =
            dist < deadzone
              ? null
              : Math.abs(e.translationX) > Math.abs(e.translationY)
                ? e.translationX > 0
                  ? 'right'
                  : 'left'
                : e.translationY > 0
                  ? 'down'
                  : 'up';

          if (next !== lastDirection.value) {
            lastDirection.value = next;
            runOnJS(onDirectionChange)(next);
          }
        })
        .onFinalize(() => {
          knobX.value = withSpring(0, { damping: 14, stiffness: 180 });
          knobY.value = withSpring(0, { damping: 14, stiffness: 180 });
          if (lastDirection.value !== null) {
            lastDirection.value = null;
            runOnJS(onDirectionChange)(null);
          }
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [maxOffset, deadzone, onDirectionChange]
  );

  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: knobX.value }, { translateY: knobY.value }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 2,
          borderColor: '#111111',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Animated.View
          style={[
            {
              width: knobSize,
              height: knobSize,
              borderRadius: knobSize / 2,
              backgroundColor: '#111111',
            },
            knobStyle,
          ]}
        />
      </View>
    </GestureDetector>
  );
});
