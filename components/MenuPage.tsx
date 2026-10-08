import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Back link and title over plain paper; content flows directly on the page. */
export function MenuPage({ title, children, scroll = true }: {
  title: string; children: ReactNode;
  /** false: children manage their own scrolling (e.g. swipeable tabs). */
  scroll?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top + 12 }}>
      <View className="px-8">
        <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={12}
          onPress={() => router.back()} style={{ alignSelf: 'flex-start' }}>
          <Text className="font-script text-lg text-ink-soft">‹ Back</Text>
        </Pressable>
        <Text className="mt-2 font-hand text-4xl text-ink">{title}</Text>
      </View>
      {scroll ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 32, paddingTop: 16, paddingBottom: insets.bottom + 32 }}>
          {children}
        </ScrollView>
      ) : <View style={{ flex: 1 }}>{children}</View>}
    </View>
  );
}

/** A section heading with a hand-drawn underline stroke instead of a boxed panel. */
export function PageSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="mb-7">
      <Text className="font-hand text-2xl text-ink">{title}</Text>
      <View style={{ height: 2, width: 56, backgroundColor: '#111111', borderRadius: 1, marginTop: 2, marginBottom: 8,
        transform: [{ rotate: '-1.5deg' }] }} />
      {children}
    </View>
  );
}
