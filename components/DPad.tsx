import { memo, useCallback } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { Direction } from '../store/gameStore';

interface DPadProps {
  size?: number;
  onDirectionChange: (direction: Direction | null) => void;
}

const GLYPH: Record<Direction, string> = { up: '▲', down: '▼', left: '◀', right: '▶' };

const INK = '#111111';
const PAPER = '#f0f0f0';

/**
 * Four discrete direction buttons around a static (non-functional) center piece — replaces the
 * old free-drag joystick, whose continuous angle had no hysteresis at the diagonal boundaries:
 * hovering near up-right would flip the computed direction (and the sprite sheet with it) back
 * and forth on tiny thumb tremor. A button has none of that ambiguity — it's either pressed or not.
 */
export const DPad = memo(function DPad({ size = 168, onDirectionChange }: DPadProps) {
  const buttonSize = Math.round(size * 0.34);
  const centerSize = Math.round(size * 0.3);
  const offset = (size - buttonSize) / 2;

  const press = useCallback((dir: Direction) => () => onDirectionChange(dir), [onDirectionChange]);
  const release = useCallback(() => onDirectionChange(null), [onDirectionChange]);

  const renderButton = (dir: Direction, style: { top: number; left: number }) => (
    <Pressable
      key={dir}
      onPressIn={press(dir)}
      onPressOut={release}
      hitSlop={6}
      style={({ pressed }) => [
        {
          position: 'absolute' as const,
          top: style.top,
          left: style.left,
          width: buttonSize,
          height: buttonSize,
          borderRadius: buttonSize * 0.2,
          borderWidth: 2,
          borderColor: INK,
          backgroundColor: pressed ? INK : 'transparent',
          alignItems: 'center' as const,
          justifyContent: 'center' as const,
        },
      ]}
    >
      {({ pressed }) => (
        <Text style={{ fontSize: buttonSize * 0.4, color: pressed ? PAPER : INK }}>{GLYPH[dir]}</Text>
      )}
    </Pressable>
  );

  return (
    <View style={{ width: size, height: size }}>
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 2,
          borderColor: INK,
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: (size - centerSize) / 2,
          left: (size - centerSize) / 2,
          width: centerSize,
          height: centerSize,
          borderRadius: centerSize / 2,
          backgroundColor: INK,
        }}
      />
      {renderButton('up', { top: 0, left: offset })}
      {renderButton('down', { top: size - buttonSize, left: offset })}
      {renderButton('left', { top: offset, left: 0 })}
      {renderButton('right', { top: offset, left: size - buttonSize })}
    </View>
  );
});
