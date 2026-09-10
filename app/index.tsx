import { Link } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';

import { LEVELS } from '../lib/levels/data';

export default function Home() {
  return (
    <View className="flex-1 bg-paper px-8 pt-16">
      <Text className="font-hand text-4xl text-ink">MazeShift</Text>
      <Text className="mt-2 font-script text-base text-ink-soft">
        The maze moves. Find the exit before it changes again.
      </Text>

      <ScrollView className="mt-8" contentContainerClassName="gap-2 pb-8">
        {LEVELS.map((level) => (
          <Link
            key={level.id}
            href={{ pathname: '/game/[id]', params: { id: String(level.id) } }}
            asChild
          >
            <Text className="rounded-xl border border-ink/15 px-4 py-3 font-script text-lg text-ink">
              {level.id}. {level.title}
              {level.isBoss ? '  ★' : ''}
            </Text>
          </Link>
        ))}
      </ScrollView>
    </View>
  );
}
