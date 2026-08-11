import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";

import type { StackParams } from "../../App";
import {
  dropWant,
  getMe,
  getRoom,
  lastRoom,
  nudgeWant,
  storedAccessToken,
  type Me,
} from "../api";
import { PostFlareScreen, type PostTarget } from "./post-flare";
import { Body, Button, Card, Muted, Title } from "../ui";
import { spacing } from "../theme";
import { WantRow } from "../want-row";

/**
 * The centre tab — the mark itself, and behind it the list the whole
 * product orbits: the Flares you are hunting. The founder's reframe.
 * Search on top, your standing list underneath, and every place you
 * scan into — a room, a store counter, a card show — is set up to
 * answer that list. Where a new Flare lands depends on where you are:
 *
 * - In a live (or early) room they have joined: straight onto that
 *   board, tonight's loop.
 * - Signed in with no live room — the founder's midnight bug: posting
 *   used to target the *last* room regardless, quietly keeping a
 *   closed store's room warm. Now it saves to the account list
 *   instead, and the next room they walk into offers to post it.
 * - A guest with no room: pointed at the door, honestly. Guests have
 *   no account for a list to live on, so the tab stays a door for
 *   them — the hub is the payoff of signing in, never a gate.
 */
export function HubScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const [target, setTarget] = useState<PostTarget | "scan" | null>(null);

  /*
   * The standing list. null = signed out (render nothing), [] = signed
   * in and empty (render the empty state, which earns its space by
   * saying what the list is for).
   */
  const [wants, setWants] = useState<Me["wants"] | null>(null);

  const loadWants = useCallback(async () => {
    if (!(await storedAccessToken())) {
      setWants(null);
      return;
    }
    try {
      setWants((await getMe()).wants);
    } catch {
      // Keep whatever was on screen; the next focus retries.
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadWants();
    }, [loadWants]),
  );

  /** A want edit, then the truth re-read — the room's `act` in miniature. */
  const editWant = async (work: () => Promise<unknown>) => {
    try {
      await work();
    } catch {
      // The reload shows the honest state either way.
    }
    await loadWants();
  };

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
  return (
    <PostFlareScreen
      target={target}
      resetSignal={resetSignal}
      onPosted={() => void loadWants()}
      footer={
        wants !== null ? (
          <Card>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: spacing(2),
              }}
            >
              <Title>Your Flares</Title>
              <Muted>
                {`${wants.length} ${wants.length === 1 ? "card" : "cards"}`}
              </Muted>
            </View>

            {wants.length === 0 ? (
              <Body>
                Post a Flare above and it stays here until you find the card.
                Every room, store and show you scan into helps answer this
                list.
              </Body>
            ) : (
              <View>
                {wants.map((want) => (
                  <WantRow
                    key={want.id}
                    want={want}
                    onNudge={(delta) => editWant(() => nudgeWant(want.id, delta))}
                    onDrop={() => editWant(() => dropWant(want.id))}
                  />
                ))}
              </View>
            )}
          </Card>
        ) : undefined
      }
    />
  );
}
