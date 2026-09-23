import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import type { StackParams, TabParams } from "../../App";
import {
  dropWant,
  getMe,
  getRoom,
  lastRoom,
  nudgeWant,
  storedAccessToken,
  type Me,
  rememberRoom,
  dropOffering,
  nudgeOffering,
} from "../api";
import { FlareComposer } from "./flare-composer";
import type { PostTarget } from "../flare-bits";
import { Body, Button, Card, Muted, Title } from "../ui";
import { colors, gutter, spacing } from "../theme";
import { openRoom } from "../open-room";
import { WantRow } from "../want-row";

/**
 * The centre tab — the mark itself, and behind it the list the whole
 * product orbits: the Flares you are looking for. The founder's reframe.
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
  /*
   * "Add cards" on a profile hunt arrives here as a param: the hunt's
   * id. Read once and cleared, because a param that sticks would
   * re-open the same hunt every time somebody came back to the tab for
   * an unrelated card.
   */
  const route = useRoute<RouteProp<TabParams, "Flare">>();
  const hunt = route.params?.hunt;
  const [openInto, setOpenInto] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (hunt === undefined) return;
    setOpenInto(hunt);
    navigation.setParams({ hunt: undefined } as never);
  }, [hunt, navigation]);
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
      <View style={{ paddingHorizontal: gutter, paddingVertical: spacing(4) }}>
        <Muted>One moment…</Muted>
      </View>
    );
  }

  if (target === "scan") {
    return (
      <View style={{ paddingHorizontal: gutter, paddingVertical: spacing(4) }}>
        <Card>
          <Title>Post a Flare</Title>
          <Body>
            A Flare says what card you are looking for, and the people who can help see
            it: the room at a store event and everyone who follows you.
          </Body>
          {/* The account first: it is what a Flare needs to reach anyone.
              The room door stays for the guest already standing at a
              counter, the same two buttons the website's guest card has. */}
          <Button
            label="Create free account"
            onPress={() => navigation.navigate("CreateAccount")}
          />
          <Button
            label="Scan a code"
            variant="secondary"
            onPress={() => navigation.navigate("Scan")}
          />
        </Card>
      </View>
    );
  }

  // No redirect after posting: the screen confirms in place and offers
  // the Feed. The composer is the one composer; the Flares
  // under it are what is published, so a draft and a post never look
  // like the same thing.
  return (
    <FlareComposer
      target={target}
      initialHuntId={openInto}
      resetSignal={resetSignal}
      onPosted={(rows) => {
        /* On the list at once; the re-read confirms it a moment later. */
        setWants((current) => [...rows, ...(current ?? [])]);
        void loadWants();
      }}
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
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: spacing(1) }}
              >
                <MaterialCommunityIcons name="fire" size={18} color={colors.accent} />
                <Title>Flares</Title>
              </View>
              <Muted>
                {`${wants.length} ${wants.length === 1 ? "card" : "cards"}`}
              </Muted>
            </View>

            {wants.length === 0 ? (
              <Body>
                Post a Flare above and its cards stay here until you find them. Every
                room, store and show you scan into helps answer this list.
              </Body>
            ) : (
              <View>
                {wants.map((want) => (
                  <WantRow
                    key={want.id}
                    want={want}
                    onNudge={(delta) =>
                      editWant(() =>
                        want.direction === "offering"
                          ? nudgeOffering(want.cardId, delta)
                          : nudgeWant(want.id, delta),
                      )
                    }
                    onDrop={() =>
                      editWant(() =>
                        want.direction === "offering"
                          ? dropOffering(want.cardId)
                          : dropWant(want.id),
                      )
                    }
                    /* Remember the room, then open it - the same two
                       steps the Feed's own buttons take. */
                    onOpenRoom={(code) => {
                      void rememberRoom(code.trim().toUpperCase()).then(() =>
                        openRoom(navigation),
                      );
                    }}
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
