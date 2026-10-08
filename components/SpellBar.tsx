import { memo } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import { SPELL_COLORS, SPELL_ICONS, type UtilityType } from '../lib/modules/utilities';
import { useProgressStore } from '../store/progressStore';

export const SPELL_BAR_HEIGHT = 56;
const SLOT = 44;

/**
 * Held spells between the maze and the D-pad: draw a charm's sigil once to
 * collect it, then tap here to cast. Slots follow first-acquisition order for the
 * level; a count shows only when more than one charge is held. Fixed height, so
 * collecting or spending a spell never shifts the D-pad.
 */
export const SpellBar = memo(function SpellBar({ order, inventory, onCast }: {
  order: UtilityType[];
  inventory: UtilityType[];
  onCast: (type: UtilityType) => void;
}) {
  const hapticsEnabled = useProgressStore((state) => state.settings.hapticsEnabled);
  const counts = new Map<UtilityType, number>();
  for (const type of inventory) counts.set(type, (counts.get(type) ?? 0) + 1);
  const held = order.filter(type => (counts.get(type) ?? 0) > 0);

  return (
    <View style={{ height: SPELL_BAR_HEIGHT, flexDirection: 'row', alignItems: 'center',
      justifyContent: 'center', gap: 10 }}>
      {held.map(type => {
        const count = counts.get(type) ?? 0;
        return (
          <Pressable key={type} accessibilityRole="button" accessibilityLabel={`Cast ${type}`}
            hitSlop={6}
            onPress={() => {
              if (hapticsEnabled) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              onCast(type);
            }}
            style={({ pressed }) => ({
              width: SLOT, height: SLOT, borderRadius: SLOT / 2, borderWidth: 2,
              borderColor: SPELL_COLORS[type], backgroundColor: '#ffffffcc',
              alignItems: 'center', justifyContent: 'center',
              transform: [{ scale: pressed ? 0.9 : 1 }],
            })}>
            <Image source={SPELL_ICONS[type]} style={{ width: SLOT - 10, height: SLOT - 10 }} resizeMode="contain" />
            {count > 1 && (
              <View style={{ position: 'absolute', bottom: -6, right: -6, minWidth: 18, height: 18,
                borderRadius: 9, backgroundColor: '#111111', alignItems: 'center', justifyContent: 'center',
                paddingHorizontal: 3 }}>
                <Text style={{ color: '#ffffff', fontSize: 11, fontWeight: '700' }}>{count}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
});
