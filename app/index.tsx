import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { needsPurchase } from '../lib/paywall';
import { useProgressStore } from '../store/progressStore';

const PAPER = require('../assets/home_paper.jpg');
const HERO = require('../assets/home_hero.webp');
/** Transparent cutout, 1024x1536. */
const HERO_ASPECT = 1536 / 1024;
/** Silhouette's widest left/right edges (fractions of image width) between the
 * shoulders and hips, measured from the artwork's alpha channel. */
const BODY_LEFT = 0.204;
const BODY_RIGHT = 0.766;
/** Where the feet end (fraction of image height), for placing the levels button. */
const FEET_BOTTOM = 0.992;
/** Height (fraction of image) the two button rows are centered on: mid-torso. */
const BUTTONS_CENTER = 0.34;
const HERO_WIDTH_RATIO = 0.72;
/** The hero is drawn slightly smaller than the layout box, shrunk about the
 * button rows' center, so the buttons keep their size and position. */
const HERO_DRAW_SCALE = 0.9;
const BUTTON_HEIGHT = 76;
const BUTTON_GAP = 14;
const INK = '#111111';

/** Opening screen: paper backdrop, the transparent hero, two boxes on each side. */
export default function Home() {
  const window = useWindowDimensions();
  // Measure the space this screen really gets: on edge-to-edge Android the window
  // size can exclude the system bars, which left an unpainted strip at the bottom.
  const [size, setSize] = useState({ width: window.width, height: window.height });
  const { width, height } = size;
  const insets = useSafeAreaInsets();
  const hydrated = useProgressStore((state) => state.hydrated);
  const activeRun = useProgressStore((state) => state.activeRun);
  const highestUnlockedLevel = useProgressStore((state) => state.highestUnlockedLevel);
  const premiumUnlocked = useProgressStore((state) => state.premiumUnlocked);
  const musicEnabled = useProgressStore((state) => state.settings.musicEnabled);
  const soundEffectsEnabled = useProgressStore((state) => state.settings.soundEffectsEnabled);

  // Size the hero to the width (capped by the height left between title and
  // footer), then center its body silhouette so both button columns match.
  const titleSpace = insets.top + 100, footerSpace = insets.bottom + 90;
  const heroWidth = Math.min(width * HERO_WIDTH_RATIO, (height - titleSpace - footerSpace) / HERO_ASPECT);
  const heroHeight = heroWidth * HERO_ASPECT;
  const heroLeft = width / 2 - (BODY_LEFT + BODY_RIGHT) / 2 * heroWidth;
  const heroTop = titleSpace + Math.max(0, (height - titleSpace - footerSpace - heroHeight) / 2);
  const gutter = 10, clearance = 4;
  const columnWidth = Math.min(heroLeft + BODY_LEFT * heroWidth, width - (heroLeft + BODY_RIGHT * heroWidth))
    - gutter - clearance;
  const buttonsTop = heroTop + BUTTONS_CENTER * heroHeight - (BUTTON_HEIGHT * 2 + BUTTON_GAP) / 2;
  // The drawn hero, shrunk about the point the buttons are centered on.
  const anchorX = heroLeft + (BODY_LEFT + BODY_RIGHT) / 2 * heroWidth;
  const anchorY = heroTop + BUTTONS_CENTER * heroHeight;
  const drawWidth = heroWidth * HERO_DRAW_SCALE, drawHeight = heroHeight * HERO_DRAW_SCALE;
  const drawLeft = anchorX - (BODY_LEFT + BODY_RIGHT) / 2 * drawWidth;
  const drawTop = anchorY - BUTTONS_CENTER * drawHeight;
  const levelsTop = Math.min(drawTop + FEET_BOTTOM * drawHeight + 14, height - insets.bottom - 70);
  const titleHeight = 72;
  const titleTop = Math.max(insets.top + 8, drawTop - titleHeight - 8);

  const audioOn = musicEnabled || soundEffectsEnabled;
  const toggleAudio = () => {
    const progress = useProgressStore.getState();
    progress.setMusicEnabled(!audioOn);
    progress.setSoundEffectsEnabled(!audioOn);
  };

  const nextLevel = Math.min(20, Math.max(1, highestUnlockedLevel));
  const nextNeedsPurchase = needsPurchase(nextLevel, premiumUnlocked);
  const play = () => {
    if (activeRun) {
      router.push({ pathname: '/game/[id]', params: { id: String(activeRun.levelId), resume: '1' } });
    } else if (nextNeedsPurchase) {
      router.push('/levels');
    } else {
      router.push({ pathname: '/game/[id]', params: { id: String(nextLevel) } });
    }
  };
  const playLabel = activeRun ? `Continue\nLevel ${activeRun.levelId}` : `Play\nLevel ${nextLevel}`;

  return (
    <View style={styles.root}
      onLayout={(e) => {
        const { width: w, height: h } = e.nativeEvent.layout;
        if (w !== width || h !== height) setSize({ width: w, height: h });
      }}>
      <Image source={PAPER} resizeMode="cover" style={StyleSheet.absoluteFill} />
      <Image source={HERO} accessibilityIgnoresInvertColors resizeMode="contain"
        style={{ position: 'absolute', left: drawLeft, top: drawTop, width: drawWidth, height: drawHeight }} />

      <View style={{ position: 'absolute', top: titleTop, height: titleHeight, left: 16, right: 16,
        justifyContent: 'center' }}>
        <Text accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.4}
          style={styles.title}>MazeShift</Text>
      </View>

      <View style={{ position: 'absolute', top: buttonsTop, left: gutter, width: columnWidth, gap: BUTTON_GAP }}>
        <HomeButton label={playLabel} onPress={play} disabled={!hydrated} />
        <HomeButton label="How to play" onPress={() => router.push('/how-to-play')} />
      </View>
      <View style={{ position: 'absolute', top: buttonsTop, right: gutter, width: columnWidth, gap: BUTTON_GAP }}>
        <HomeButton label={'Spells &\nmonsters'} onPress={() => router.push('/guide')} />
        <HomeButton label={`Audio\n${audioOn ? 'On' : 'Off'}`} onPress={toggleAudio} disabled={!hydrated} />
      </View>

      <View style={{ position: 'absolute', top: levelsTop, alignSelf: 'center', width: Math.min(220, width * 0.55) }}>
        <HomeButton label="All levels" onPress={() => router.push('/levels')} height={56} />
      </View>
    </View>
  );
}

/** Ink-outlined rectangle with no fill. The border lives on an inner View: a
 * style function on a NativeWind Pressable was dropped, leaving no box at all. */
function HomeButton({ label, onPress, disabled, height = BUTTON_HEIGHT }: {
  label: string; onPress: () => void; disabled?: boolean; height?: number;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label.replace('\n', ' ')}
      disabled={disabled} onPress={onPress}>
      {({ pressed }) => (
        <View style={[styles.box, { height, opacity: disabled ? 0.4 : 1,
          backgroundColor: pressed ? '#1111111a' : 'transparent',
          transform: [{ scale: pressed ? 0.96 : 1 }] }]}>
          <Text className="font-hand text-ink" numberOfLines={2} adjustsFontSizeToFit
            style={[styles.bold, styles.label]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ddd7d2' },
  box: {
    borderWidth: 2.5, borderColor: INK, borderRadius: 6,
    paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center',
  },
  label: { fontSize: 20, lineHeight: 24, textAlign: 'center' },
  title: {
    fontFamily: 'CinzelDecorative', fontSize: 64, color: INK, textAlign: 'center',
    textShadowColor: '#a855f7aa', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 10,
  },
  // The hand-drawn font ships in one weight; a tight same-color shadow thickens it.
  bold: { textShadowColor: INK, textShadowOffset: { width: 0.6, height: 0 }, textShadowRadius: 0.6 },
});
