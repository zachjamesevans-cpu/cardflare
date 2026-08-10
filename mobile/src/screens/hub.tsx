import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";

import type { StackParams } from "../../App";
import { getRoom, lastRoom, storedAccessToken } from "../api";
import { PostFlareScreen, type PostTarget } from "./post-flare";
import { Body, Button, Card, Muted, Title } from "../ui";
import { spacing } from "../theme";

/**
 * The centre tab — the mark itself, and the product's one verb behind
 * it: post a Flare. Where the Flare lands depends on where the player
 * actually is:
 *
 * - In a live (or early) room they have joined: straight onto that
 *   board, tonight's loop.
 * - Signed in with no live room — the founder's midnight bug: posting
 *   used to target the *last* room regardless, quietly keeping a
 *   closed store's room warm. Now it saves to the account list
 *   instead, and the next room they walk into offers to post it.
 * - A guest with no room: pointed at the door, honestly.
 */
export function HubScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const [target, setTarget] = useState<PostTarget | "scan" | null>(null);

  /*
   * Re-tapping the Flare tab while already ON it means "different card":
   * the search clears for a fresh hunt. The focus check is the whole
   * point — someone who looked up a card, wandered to another tab, and
   * came back has NOT asked to start over, so arriving from elsewhere
   * never touches their search. (tabPress is a tab-navigator event this
   * screen actually receives, but the hook's typing follows the stack
   * param list — hence the cast.)
   */
  const [resetSignal, setResetSignal] = useState(0);
  useEffect(() => {
    const nav = navigation as unknown as {
      addListener: (event: string, callback: () => void) => () => void;
      isFocused: () => boolean;
    };
    return nav.addListener("tabPress", () => {
      if (nav.isFocused()) setResetSignal((n) => n + 1);
    });
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      let stale = false;

      const decide = async () => {
        const code = await lastRoom();
        const signedIn = Boolean(await storedAccessToken());

        if (code) {
          try {
            const state = await getRoom(code);
            const live =
              state.state === "room" &&
              Boolean(state.joined) &&
              (state.room?.status === "open" || state.room?.early);

            if (live) {
              if (!stale) setTarget({ kind: "room", code });
              return;
            }
          } catch {
            // Unreachable room counts as "not live"; fall through.
          }
        }

        if (!stale) setTarget(signedIn ? { kind: "list" } : "scan");
      };

      void decide();
      return () => {
        stale = true;
      };
    }, []),
  );

  if (target === null) {
    return (
      <View style={{ padding: spacing(4) }}>
        <Muted>One moment…</Muted>
      </View>
    );
  }

  if (target === "scan") {
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

  // No redirect after posting: the screen confirms in place and resets
  // itself for the next card. The Room tab is one tap away.
  return <PostFlareScreen target={target} resetSignal={resetSignal} />;
}
