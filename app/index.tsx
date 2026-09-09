import { Text, View } from 'react-native';

export default function Home() {
  return (
    <View className="flex-1 items-center justify-center bg-paper px-8">
      <Text className="font-hand text-4xl text-ink">MazeShift</Text>
      <Text className="mt-3 font-script text-base text-ink-soft">
        The maze moves. Find the exit before it changes again.
      </Text>
    </View>
  );
}
