import { useRef, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MenuPage } from '../components/MenuPage';
import { SPELL_COLORS, SPELL_ICONS, type UtilityType } from '../lib/modules/utilities';
import type { MonsterType } from '../lib/modules/monsters/types';
import { MONSTER_SHEETS } from '../lib/sprites/monsterFrames';

const SPELLS: { type: UtilityType; name: string; text: string }[] = [
  { type: 'phase', name: 'Phase', text: 'Slip through the nearest wall you are facing.' },
  { type: 'destroy', name: 'Destroy', text: 'Break the nearest wall you are facing, for good. Scrambles can never rebuild it.' },
  { type: 'scramble', name: 'Scramble', text: 'Reshuffle the walls of every block, right now.' },
  { type: 'dash', name: 'Dash', text: 'Burst three quick steps in the direction you are facing.' },
  { type: 'shield', name: 'Shield', text: 'Five seconds in which monsters cannot hurt you.' },
  { type: 'trap', name: 'Trap', text: 'Set a trap where you stand. The first monster to touch it is held for four seconds. Traps fade after fifteen.' },
];

const MONSTERS: { type: MonsterType; name: string; text: string }[] = [
  { type: 'hunter', name: 'Hunter', text: 'Spots you within seven steps and chases you through open corridors.' },
  { type: 'wraith', name: 'Ghost', text: 'Sees only three steps ahead, but glides straight through walls.' },
  { type: 'brute', name: 'Brute', text: 'Spots you within seven steps. When a wall is in the way, it plants a bomb and blasts through.' },
  { type: 'stalker', name: 'Stalker', text: 'Senses you within four steps and raises the alarm: every monster in its block comes for you.' },
];

/** First "down" frame of the in-game sprite sheet, cropped without any extra assets. */
function MonsterPortrait({ type, height }: { type: MonsterType; height: number }) {
  const sheet = MONSTER_SHEETS[type].down;
  const frame = sheet.frames[0];
  const scale = height / frame.height;
  return (
    <View style={{ width: frame.width * scale, height, overflow: 'hidden' }}>
      <Image source={sheet.asset} style={{ position: 'absolute', left: -frame.x * scale, top: -frame.y * scale,
        width: sheet.imageWidth * scale, height: sheet.imageHeight * scale }} />
    </View>
  );
}

function Entry({ art, name, color, text }: { art: React.ReactNode; name: string; color: string; text: string }) {
  return (
    <View className="mb-5 flex-row items-center" style={{ gap: 16 }}>
      <View style={{ width: 64, alignItems: 'center' }}>{art}</View>
      <View style={{ flex: 1 }}>
        <Text className="font-hand text-xl" style={{ color }}>{name}</Text>
        <Text className="font-script text-base text-ink-soft" style={{ lineHeight: 22 }}>{text}</Text>
      </View>
    </View>
  );
}

const TABS = ['Spells', 'Monsters'] as const;

/** Two side-by-side pages: tap a tab or swipe between them. Spells opens first. */
export default function Guide() {
  const insets = useSafeAreaInsets();
  const [pageWidth, setPageWidth] = useState(0);
  const [tab, setTab] = useState(0);
  const pager = useRef<Animated.ScrollView>(null);
  const offset = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => { offset.value = e.contentOffset.x; });
  // The underline slides with the swipe, not only when it settles.
  const underline = useAnimatedStyle(() => ({
    transform: [{ translateX: pageWidth ? (offset.value / pageWidth) * ((pageWidth - 64) / 2) : 0 }],
  }));
  const goTo = (index: number) => {
    setTab(index);
    pager.current?.scrollTo({ x: index * pageWidth, animated: true });
  };
  const page = { width: pageWidth };
  const content = { paddingHorizontal: 32, paddingTop: 20, paddingBottom: insets.bottom + 32 };

  return (
    <MenuPage title="Spells & monsters" scroll={false}>
      <View style={{ marginHorizontal: 32, marginTop: 14 }}>
        <View style={{ flexDirection: 'row' }}>
          {TABS.map((name, index) => (
            <Pressable key={name} accessibilityRole="tab" accessibilityState={{ selected: tab === index }}
              onPress={() => goTo(index)} style={{ flex: 1, alignItems: 'center', paddingVertical: 8 }}>
              <Text className="font-hand text-2xl" style={{ color: tab === index ? '#111111' : '#40404099' }}>{name}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ height: 2, backgroundColor: '#11111122' }}>
          <Animated.View style={[{ height: 3, marginTop: -0.5, width: '50%', backgroundColor: '#111111', borderRadius: 2 }, underline]} />
        </View>
      </View>

      <Animated.ScrollView ref={pager} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
        style={{ flex: 1 }} onScroll={onScroll} scrollEventThrottle={16}
        onLayout={(e) => setPageWidth(e.nativeEvent.layout.width)}
        onMomentumScrollEnd={(e) => pageWidth && setTab(Math.round(e.nativeEvent.contentOffset.x / pageWidth))}>
        <ScrollView style={page} contentContainerStyle={content}>
          <Text className="mb-5 font-script text-base text-ink-soft">
            Stand on a charm and draw its symbol to collect it, then tap it in the spell bar to cast.
          </Text>
          {SPELLS.map(spell => (
            <Entry key={spell.type} name={spell.name} text={spell.text} color="#111111"
              art={<View style={{ width: 56, height: 56, borderRadius: 28, borderWidth: 2,
                borderColor: SPELL_COLORS[spell.type], alignItems: 'center', justifyContent: 'center' }}>
                <Image source={SPELL_ICONS[spell.type]} style={{ width: 46, height: 46 }} resizeMode="contain" />
              </View>} />
          ))}
        </ScrollView>
        <ScrollView style={page} contentContainerStyle={content}>
          <Text className="mb-5 font-script text-base text-ink-soft">
            One touch ends the run. Every monster stays inside its own block.
          </Text>
          {MONSTERS.map(monster => (
            <Entry key={monster.type} name={monster.name} text={monster.text} color="#111111"
              art={<MonsterPortrait type={monster.type} height={64} />} />
          ))}
        </ScrollView>
      </Animated.ScrollView>
    </MenuPage>
  );
}
