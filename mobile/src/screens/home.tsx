import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";

import type { StackParams } from "../../App";
import {
  getMe,
  joinRoom,
  postFlare,
  rememberRoom,
  removeLocal,
  storedAccessToken,
  type Me,
} from "../api";
import { Body, Button, Card, Input, Muted, Tap, Title } from "../ui";
import { colors, spacing } from "../theme";

/**
 * The Join tab — the front door, guest-first like the website: scan the
 * counter code or type it. A signed-in player also gets their locals —
 * the stores they actually go to, saved automatically on every join —
 * so the second visit never needs the QR code at all.
 */
export function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const [code, setCode] = useState("");
  const [me, setMe] = useState<Me | null>(null);
  const [rsvping, setRsvping] = useState<string | null>(null);
  const locals = me?.locals ?? [];

  useFocusEffect(
    useCallback(() => {
      let live = true;

      void (async () => {
        if (!(await storedAccessToken())) {
          if (live) setMe(null);
          return;
        }
        try {
          const fresh = await getMe();
          if (live) setMe(fresh);
        } catch {
          if (live) setMe(null);
        }
      })();

      return () => {
        live = false;
      };
    }, []),
  );

  const enter = async (raw: string) => {
    await rememberRoom(raw.trim().toUpperCase());
    setCode("");
    navigation.navigate("Tabs", { screen: "Room" });
  };

  /*
   * "I'll be there", the app's way: join the early board under the
   * account's own name and post every saved want. Duplicates already on
   * the board are skipped by the server, so this is safe to repeat.
   */
  const rsvp = async (local: Me["locals"][number]) => {
    if (!me || !local.nextEventCode || rsvping) return;
    setRsvping(local.storeId);
    try {
      await joinRoom(local.nextEventCode, me.player.displayName);
      for (const want of me.wants) {
        await postFlare(local.nextEventCode, {
          cardId: want.cardId,
          printingId: want.printingId,
          quantity: want.quantity,
          note: want.note ?? undefined,
        }).catch(() => {});
      }
      await rememberRoom(local.nextEventCode);
      navigation.navigate("Tabs", { screen: "Room" });
    } catch {
      // The Room tab shows the truthful state; nothing to add here.
    } finally {
      setRsvping(null);
    }
  };

  const nextLine = (local: Me["locals"][number]) => {
    if (local.liveNow) return "A room is open right now";
    if (local.nextEventAt) {
      const day = new Date(local.nextEventAt).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
      return `Next: ${local.nextEventName} · ${day}`;
    }
    return [local.city, local.region].filter(Boolean).join(", ") || "Saved";
  };

  return (
    <ScrollView contentContainerStyle={{ padding: spacing(4), gap: spacing(4) }}>
      <Card>
        <Title>Join a room</Title>
        <Body>
          Scan the code on the store&rsquo;s counter, or type it if scanning is
          awkward. No account needed.
        </Body>

        <Button label="Scan a QR code" onPress={() => navigation.navigate("Scan")} />

        <View style={{ flexDirection: "row", gap: spacing(2) }}>
          <View style={{ flex: 1 }}>
            <Input
              value={code}
              onChangeText={setCode}
              placeholder="Or enter the code"
              autoCapitalize="characters"
              autoCorrect={false}
            />
          </View>
          <Button
            label="Go"
            variant="secondary"
            onPress={() => code.trim() && void enter(code)}
          />
        </View>
      </Card>

      {locals.length > 0 && (
        <Card>
          <Title>Your locals</Title>
          <Muted>
            Saved automatically when you join signed in. Tap one to walk in, no
            QR needed.
          </Muted>
          {locals.map((local) => (
            <View
              key={local.storeId}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing(2),
              }}
            >
              <Tap onPress={() => void enter(local.code)} style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: colors.textPrimary, fontWeight: "700" }}>
                  {local.name}
                </Text>
                <Text
                  style={{
                    color: local.liveNow ? colors.accent : colors.textMuted,
                    fontSize: 12,
                  }}
                >
                  {nextLine(local)}
                </Text>
              </Tap>
              <Tap
                onPress={() => {
                  setMe((current) =>
                    current
                      ? {
                          ...current,
                          locals: current.locals.filter(
                            (entry) => entry.storeId !== local.storeId,
                          ),
                        }
                      : current,
                  );
                  void removeLocal(local.storeId).catch(() => {});
                }}
                hitSlop={8}
              >
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>Remove</Text>
              </Tap>
            </View>
          ))}
          {locals.some((local) => local.earlyOpen && local.nextEventCode) &&
            locals
              .filter((local) => local.earlyOpen && local.nextEventCode)
              .map((local) => (
                <Button
                  key={`rsvp-${local.storeId}`}
                  label={
                    rsvping === local.storeId
                      ? "Joining the board…"
                      : `I'll be there: ${local.nextEventName ?? local.name}`
                  }
                  onPress={() => void rsvp(local)}
                  busy={rsvping === local.storeId}
                />
              ))}
        </Card>
      )}

      <Card>
        <Title>How it works</Title>
        <Body>
          Post a Flare for the card you&rsquo;re hunting. When somebody in the room
          has it, they raise a hand, and you go trade, in person, at the table.
        </Body>
      </Card>
    </ScrollView>
  );
}
