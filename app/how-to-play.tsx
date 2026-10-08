import { router } from 'expo-router';
import { Pressable, Text } from 'react-native';

import { MenuPage, PageSection } from '../components/MenuPage';

function Body({ children }: { children: string }) {
  return <Text className="font-script text-lg text-ink-soft" style={{ lineHeight: 26 }}>{children}</Text>;
}

export default function HowToPlay() {
  return (
    <MenuPage title="How to play">
      <PageSection title="Find the exit">
        <Body>
          Each level is a chain of maze blocks joined by gateways. Reach the pulsing rings in the final block.
          A soft purple glow marks the openings that lead onward.
        </Body>
      </PageSection>

      <PageSection title="Move">
        <Body>Hold a direction on the pad to run. Tap it to take a single step.</Body>
      </PageSection>

      <PageSection title="The maze shifts">
        <Body>
          On most levels every block's walls reshuffle on a timer. Watch the countdown under the level name
          and plan your route before it changes.
        </Body>
      </PageSection>

      <PageSection title="Charms and spells">
        <Body>
          Stand on a charm and draw its symbol anywhere over the maze to collect it. Collected spells wait in the
          bar above the pad: tap one to cast it. Each level limits how many you can carry.
        </Body>
      </PageSection>

      <PageSection title="Monsters">
        <Body>
          One touch from a monster ends the run. Each monster stays inside its own block, so a gateway is
          always a way out.
        </Body>
      </PageSection>

      <PageSection title="Your progress">
        <Body>
          Leaving mid-level saves your run: pick it up with Continue on the home screen. Practice lets you try
          every spell with no monsters around.
        </Body>
      </PageSection>

      <Pressable accessibilityRole="button" onPress={() => router.push('/guide')} hitSlop={8}>
        <Text className="font-hand text-xl text-ink underline">Meet the spells and monsters ›</Text>
      </Pressable>
    </MenuPage>
  );
}
