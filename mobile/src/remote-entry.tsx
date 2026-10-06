import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useState } from "react";
import type { ComponentProps } from "react";
import { Text, View } from "react-native";

import type { StackParams } from "../App";
import { getMe, storedAccessToken, type Me } from "./api";
import { colors, radius, spacing } from "./theme";
import { Tap } from "./ui";

/**
 * The organizer's two doors into the timer remote.
 *
 * The founder: "having someone being able to control the round timers
 * on the phone app? like a 'remote' in a way. so they can just pull
 * out their phone and not have to run back to the store computer."
 *
 * `RemoteEntry` is the stopwatch icon on a joined room's door card: it
 * asks the server who this account may run a store for (`me.staff`)
 * and draws nothing at all for everybody else, so a player never sees
 * a button that would 403. It was a whole card with a sentence and a
 * button; the founder, on the room: "moving the remote from a big
 * block to a small little remote icon if they have access to it."
 * `OrganizerChips` is the TO badge on a profile, the public side of
 * the same fact: the stores that named this player an organizer, each
 * chip opening the store's own page.
 */

type Staff = NonNullable<Me["staff"]>[number];

/**
 * One of the small round buttons at the end of the night's name: a
 * glyph in a 36-point ring. The remote wears the accent, in the ring
 * as a tint and in the glyph outright; the help button beside it is
 * muted, so the one that does something to the room reads first.
 */
export function DoorIconButton({
  icon,
  label,
  onPress,
  accent = false,
}: {
  icon: ComponentProps<typeof Ionicons>["name"];
  /** The accessible name; the glyph says nothing on its own. */
  label: string;
  onPress: () => void;
  accent?: boolean;
}) {
  return (
    <Tap
      onPress={onPress}
      accessibilityLabel={label}
      hitSlop={4}
      style={{
        width: 36,
        height: 36,
        borderRadius: 999,
        borderWidth: 1,
        /* The accent at forty percent for the ring, so it tints
           rather than glows; the glyph carries the full colour. */
        borderColor: accent ? `${colors.accent}66` : colors.border,
        backgroundColor: colors.surface,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons
        name={icon}
        size={18}
        color={accent ? colors.accent : colors.textSecondary}
      />
    </Tap>
  );
}

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
    <DoorIconButton
      icon="timer-outline"
      label="Timer remote"
      accent
      onPress={() =>
        /* One store: straight to its clocks. More: the screen asks
           which counter first. */
        navigation.navigate(
          "Remote",
          staff.length === 1 ? { storeId: staff[0].storeId } : undefined,
        )
      }
    />
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
  stores,
}: {
  stores: { storeId: string; name: string }[];
}) {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
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
