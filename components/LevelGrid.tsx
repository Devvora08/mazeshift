import { Canvas, Group, Path, RoundedRect, Skia, rrect, rect } from '@shopify/react-native-skia';
import { useIsFocused } from 'expo-router';
import { memo, useCallback, useEffect, useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useDerivedValue, useFrameCallback, useSharedValue } from 'react-native-reanimated';

export type LevelState = 'locked' | 'open' | 'ongoing' | 'completed';
export interface LevelCell { id: number; title: string; state: LevelState; bestTime?: string }

const COLUMNS = 3;
const GAP = 14;
const NAME_HEIGHT = 40;
const ROW_GAP = 16;
const RADIUS = 6;
const INK = '#111111';
const DEEP_PURPLE = '#2a0a45';
const FLUID = '#c9a7f5';
const FLUID_CREST = '#dcc4fa';
const DUST = '#fbcfe8';
const DUST_GLOW = '#f9a8d455';
const SPECKS = 12;

/** Deterministic 0..1 noise per (cell, speck, channel), so motion needs no stored state. */
function hash(a: number, b: number, c: number): number {
  'worklet';
  const x = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Three-per-row level boxes. One Skia canvas behind the boxes draws every effect
 * from a single clock: the ongoing level's half-filled fluid and the pixie dust in
 * completed levels. The clock stops whenever this screen is not focused, since it
 * stays mounted beneath a level while you play.
 */
export const LevelGrid = memo(function LevelGrid({ width, cells, onPress }: {
  width: number;
  cells: LevelCell[];
  onPress: (cell: LevelCell) => void;
}) {
  const size = (width - GAP * (COLUMNS - 1)) / COLUMNS;
  const rowHeight = size + NAME_HEIGHT + ROW_GAP;
  const rows = Math.ceil(cells.length / COLUMNS);
  const at = (index: number) => ({ x: (index % COLUMNS) * (size + GAP), y: Math.floor(index / COLUMNS) * rowHeight });

  const focused = useIsFocused();
  const clock = useSharedValue(0);
  const frame = useFrameCallback(useCallback((info) => {
    'worklet';
    const dt = info.timeSincePreviousFrame ?? 0;
    clock.value += dt > 100 ? 0 : dt / 1000;
  }, [clock]), false);
  const animated = cells.some(c => c.state === 'ongoing' || c.state === 'completed');
  useEffect(() => {
    frame.setActive(focused && animated && width > 0);
    return () => frame.setActive(false);
  }, [frame, focused, animated, width]);

  const completed = useMemo(() => cells.map((c, i) => ({ ...at(i), i, id: c.id }))
    .filter((_, i) => cells[i].state === 'completed'), [cells, size]); // eslint-disable-line react-hooks/exhaustive-deps
  const ongoing = useMemo(() => cells.map((c, i) => ({ ...at(i), id: c.id }))
    .filter((_, i) => cells[i].state === 'ongoing'), [cells, size]); // eslint-disable-line react-hooks/exhaustive-deps

  // All dust for all completed boxes in two paths (soft glow + bright core).
  const dust = useDerivedValue(() => {
    const t = clock.value;
    const glow = Skia.PathBuilder.Make(), core = Skia.PathBuilder.Make();
    for (const box of completed) {
      for (let k = 0; k < SPECKS; k++) {
        const ax = 0.25 + hash(box.id, k, 1) * 0.35, ay = 0.2 + hash(box.id, k, 2) * 0.35;
        const px = hash(box.id, k, 3) * 6.28, py = hash(box.id, k, 4) * 6.28;
        const x = box.x + size * (0.5 + 0.4 * Math.sin(t * ax + px) * Math.cos(t * 0.13 + py));
        const y = box.y + size * (0.5 + 0.4 * Math.sin(t * ay + py));
        const twinkle = 0.55 + 0.45 * Math.sin(t * (1.5 + hash(box.id, k, 5) * 2) + px);
        const r = size * (0.012 + hash(box.id, k, 6) * 0.014) * (0.6 + 0.4 * twinkle);
        glow.addCircle(x, y, r * 2.6);
        core.addCircle(x, y, r);
      }
    }
    return [glow.build(), core.build()];
  });
  const dustGlow = useDerivedValue(() => dust.value[0]);
  const dustCore = useDerivedValue(() => dust.value[1]);

  // A gently sloshing surface around the half-way line: two waves, back and front.
  const fluid = useDerivedValue(() => {
    const t = clock.value;
    const back = Skia.PathBuilder.Make(), front = Skia.PathBuilder.Make();
    for (const box of ongoing) {
      for (const [pb, phase, amp] of [[back, 1.7, 0.035], [front, 0, 0.045]] as const) {
        const level = box.y + size * 0.5;
        pb.moveTo(box.x, box.y + size);
        for (let s = 0; s <= 24; s++) {
          const fx = s / 24;
          const y = level + size * amp * Math.sin(fx * 6.28 * 1.1 + t * 1.6 + phase)
            + size * amp * 0.5 * Math.sin(fx * 6.28 * 2.3 - t * 1.1 + phase);
          pb.lineTo(box.x + fx * size, y);
        }
        pb.lineTo(box.x + size, box.y + size);
        pb.close();
      }
    }
    return [back.build(), front.build()];
  });
  const fluidBack = useDerivedValue(() => fluid.value[0]);
  const fluidFront = useDerivedValue(() => fluid.value[1]);

  const clip = useMemo(() => {
    const pb = Skia.PathBuilder.Make();
    for (const box of [...completed, ...ongoing]) pb.addRRect(rrect(rect(box.x, box.y, size, size), RADIUS, RADIUS));
    return pb.build();
  }, [completed, ongoing, size]);

  if (width <= 0) return null;
  return (
    <View style={{ width, height: rows * rowHeight - ROW_GAP }}>
      <Canvas pointerEvents="none" style={{ position: 'absolute', width, height: rows * rowHeight }}>
        {completed.map(box => (
          <RoundedRect key={box.id} x={box.x} y={box.y} width={size} height={size} r={RADIUS} color={DEEP_PURPLE} />
        ))}
        <Group clip={clip}>
          <Path path={fluidBack} color={FLUID_CREST} />
          <Path path={fluidFront} color={FLUID} />
          <Path path={dustGlow} color={DUST_GLOW} />
          <Path path={dustCore} color={DUST} />
        </Group>
      </Canvas>

      {cells.map((cell, index) => {
        const { x, y } = at(index);
        const dark = cell.state === 'completed';
        return (
          <View key={cell.id} style={{ position: 'absolute', left: x, top: y, width: size }}>
            <Pressable accessibilityRole="button" disabled={cell.state === 'locked'}
              accessibilityLabel={`Level ${cell.id}, ${cell.title}${cell.state === 'locked' ? ', locked'
                : cell.state === 'completed' ? ', completed' : cell.state === 'ongoing' ? ', in progress' : ''}`}
              onPress={() => onPress(cell)}>
              {({ pressed }) => (
                <View style={{ width: size, height: size, borderRadius: RADIUS, borderWidth: 2.5,
                  borderColor: dark ? DEEP_PURPLE : INK, alignItems: 'center', justifyContent: 'center',
                  opacity: cell.state === 'locked' ? 0.35 : 1, transform: [{ scale: pressed ? 0.95 : 1 }] }}>
                  <Text style={{ fontFamily: 'CinzelDecorative', fontSize: size * 0.36,
                    color: dark ? DUST : INK }}>{cell.id}</Text>
                  {dark && cell.bestTime && (
                    <Text className="font-script" style={{ position: 'absolute', bottom: 4, fontSize: 12, color: DUST }}>
                      {cell.bestTime}
                    </Text>
                  )}
                </View>
              )}
            </Pressable>
            <Text className="font-hand text-ink" numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}
              style={{ height: NAME_HEIGHT, paddingTop: 4, fontSize: 14, lineHeight: 17, textAlign: 'center',
                opacity: cell.state === 'locked' ? 0.45 : 1 }}>
              {cell.title}
            </Text>
          </View>
        );
      })}
    </View>
  );
});
