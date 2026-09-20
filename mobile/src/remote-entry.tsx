import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";

import type { StackParams } from "../App";
import { getMe, storedAccessToken, type Me } from "./api";
import { colors, radius, spacing } from "./theme";
import { Body, Button, Card, Tap, Title } from "./ui";

/**
 * The organizer's two doors into the timer remote.
 *
 * The founder: "having someone being able to control the round timers
 * on the phone app? like a 'remote' in a way. so they can just pull
 * out their phone and not have to run back to the store computer."
 *
 * `RemoteEntry` is the card at the top of a joined room: it asks the
 * server who this account may run a store for (`me.staff`) and draws
 * nothing at all for everybody else, so a player never sees a button
 * that would 403. `OrganizerChips` is the TO badge on a profile, the
 * public side of the same fact: the stores that named this player an
 * organizer, each chip opening the store's own page.
 */

type Staff = NonNullable<Me["staff"]>[number];

export function RemoteEntry() {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const [staff, setStaff] = useState<Staff[]>([]);

  /* Asked on every focus rather than cached: being made staff should
     show up the next time the room is opened, not the next day. A
     guest has no token and gets no request. */
  useFocusEffect(
    useCallback(() => {
      let live = true;
      void (async () => {
        if (!(await storedAccessToken())) return;
        try {
          const me = await getMe();
          if (live) setStaff(me.staff ?? []);
        } catch {
          /* Offline, or an older server: the card stays away, which is
             the safe reading. Nothing else on the room depends on it. */
        }
      })();
      return () => {
        live = false;
      };
    }, []),
  );

  if (staff.length === 0) return null;

  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}>
        <Ionicons name="timer-outline" size={18} color={colors.accent} />
        <Title>Timer remote</Title>
      </View>
      <Body>Run the round clocks from here, no trip to the counter</Body>
      <Button
        label="Open remote"
        onPress={() =>
          /* One store: straight to its clocks. More: the screen asks
             which counter first. */
          navigation.navigate(
            "Remote",
            staff.length === 1 ? { storeId: staff[0].storeId } : undefined,
          )
        }
      />
    </Card>
  );
}

/**
 * The TO badge: one chip per store that named this player an organizer.
 *
 * Takes any profile shape with the field, so the owner's Profile and
 * the PeekProfile a visitor sees pass the same object in. Absent (an
 * older server, or nobody) draws nothing.
 */
export function OrganizerChips({
  profile,
}: {
  profile: { playerId: string; organizerAt?: { storeId: string; name: string }[] };
}) {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const stores = profile.organizerAt ?? [];
  if (stores.length === 0) return null;

  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap: spacing(2),
        marginTop: spacing(2),
      }}
    >
      {stores.map((store) => (
        <Tap
          key={store.storeId}
          onPress={() =>
            navigation.navigate("StoreProfile", { storeId: store.storeId })
          }
          accessibilityLabel={`Tournament organizer at ${store.name}`}
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: colors.elevated,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: radius.panel,
            paddingHorizontal: spacing(2.5),
            paddingVertical: spacing(1),
          }}
        >
          <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "800" }}>
            TO
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
            {` · ${store.name}`}
          </Text>
        </Tap>
      ))}
    </View>
  );
}
