import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";

import type { StackParams } from "../../App";
import {
  getMe,
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
  const [locals, setLocals] = useState<Me["locals"]>([]);

  useFocusEffect(
    useCallback(() => {
      let live = true;

      void (async () => {
        if (!(await storedAccessToken())) {
          if (live) setLocals([]);
          return;
        }
        try {
          const me = await getMe();
          if (live) setLocals(me.locals);
        } catch {
          if (live) setLocals([]);
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
          Scan the code on the store&rsquo;s counter — or type it if scanning is
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
            Saved automatically when you join signed in. Tap one to walk in — no
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
                  setLocals((current) =>
                    current.filter((entry) => entry.storeId !== local.storeId),
                  );
                  void removeLocal(local.storeId).catch(() => {});
                }}
                hitSlop={8}
              >
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>Remove</Text>
              </Tap>
            </View>
          ))}
        </Card>
      )}

      <Card>
        <Title>How it works</Title>
        <Body>
          Post a Flare for the card you&rsquo;re hunting. When somebody in the room
          has it, they raise a hand — and you go trade, in person, at the table.
        </Body>
      </Card>
    </ScrollView>
  );
}
