import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";

import type { StackParams } from "../../App";
import { lastRoom } from "../api";
import { PostFlareScreen } from "./post-flare";
import { Body, Button, Card, Title } from "../ui";
import { spacing } from "../theme";

/**
 * The centre tab — the mark itself, and the product's one verb behind
 * it: post a Flare. In a room it goes straight to the picker; outside
 * one it points at the door, honestly, rather than pretending.
 */
export function HubScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const [code, setCode] = useState<string | null>(null);

  /*
   * Tapping the Flare tab is also "start over": if a card is open in the
   * picker, the tap pops it back to the search. The counter is the
   * signal; the picker resets whenever it changes. (tabPress is a tab-
   * navigator event this screen actually receives, but the hook's typing
   * follows the stack param list — hence the cast.)
   */
  const [resetSignal, setResetSignal] = useState(0);
  useEffect(() => {
    return (
      navigation as unknown as {
        addListener: (event: string, callback: () => void) => () => void;
      }
    ).addListener("tabPress", () => setResetSignal((n) => n + 1));
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      void lastRoom().then(setCode);
    }, []),
  );

  if (!code) {
    return (
      <View style={{ padding: spacing(4) }}>
        <Card>
          <Title>Post a Flare</Title>
          <Body>
            A Flare goes up in a room. Scan the store&rsquo;s counter code first,
            and this button becomes the fastest way to say what you&rsquo;re
            hunting.
          </Body>
          <Button label="Scan a code" onPress={() => navigation.navigate("Scan")} />
        </Card>
      </View>
    );
  }

  // No redirect after posting: the screen confirms with "Posted ✓" and
  // resets itself for the next card. The Room tab is one tap away.
  return <PostFlareScreen code={code} resetSignal={resetSignal} />;
}
