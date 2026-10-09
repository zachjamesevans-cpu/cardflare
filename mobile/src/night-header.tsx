import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import type { StackParams } from "../App";
import { ApiError, setGoing, type RoomPhase } from "./api";
import { markFeedStale } from "./feed-refresh";
import { FollowStoreButton } from "./follow-store-button";
import { GoingButton } from "./going-button";
import { GOING } from "./going-copy";
import { playersLine } from "./night-copy";
import { colors, spacing } from "./theme";
import { Muted, Tap } from "./ui";
import { VerifiedMark } from "./verified-mark";

/**
 * The compact header on a Night: the website's night-header.tsx.
 *
 * The founder (2026-10-03): "The current event page repeats too much
 * information (1 here now, 1 tonight, You're going, You're going
 * button, 1 going, Who's going, another attendance count). REMOVE
 * REPEATED INFORMATION." So one block, top to bottom: the venue, the
 * night's name, when, and ONE line with the RSVP state and the
 * players count. Attendance is said here and nowhere else on the page.
 * It said how many were here now as well until the founder
 * (2026-10-09) took it off: it counted people looking at the room from
 * home. The website's header lost it in the same round.
 *
 * The Going button sits on that line at chip size while the viewer is
 * not going; once they are, the line reads "Going" with the check and
 * tapping it is Not going, as the button has always done.
 */
export function NightHeader({
  name,
  storeName,
  storeId,
  verified,
  following,
  startsAt,
  endsAt,
  phase,
  eventId,
  going,
  playersCount,
  onSettled,
  right,
}: {
  name: string;
  storeName: string;
  storeId?: string;
  verified?: boolean;
  /** Whether the signed-in account follows the store; undefined draws no chip. */
  following?: boolean;
  startsAt: string | null;
  endsAt: string | null;
  phase: RoomPhase | null;
  /** The night's id, for Going. Null on an older server: no chip. */
  eventId: string | null;
  going: { youGoing: boolean; goingCount: number } | null;
  /** Who is going, the number the players line says. */
  playersCount: number;
  onSettled: () => void;
  /** The small round buttons at the end of the name's line. */
  right?: ReactNode;
}) {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const canGo = Boolean(eventId && going) && phase !== "finished";

  return (
    <View style={{ gap: spacing(1.5) }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          flexWrap: "wrap",
          gap: spacing(2),
        }}
      >
        {storeId ? (
          <Tap
            onPress={() => navigation.navigate("StoreProfile", { storeId })}
            hitSlop={6}
            accessibilityLabel={storeName}
            style={{ flexDirection: "row", alignItems: "center", gap: spacing(1) }}
          >
            <Text
              style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "600" }}
            >
              {storeName}
            </Text>
            {/* Verified is trust, drawn beside a store's name wherever
                the name is; never Ultra, which is a tier. */}
            {verified ? <VerifiedMark size={14} /> : null}
          </Tap>
        ) : (
          <Muted>{storeName}</Muted>
        )}
        {storeId && following !== undefined ? (
          <FollowStoreButton
            key={`${storeId}:${following}`}
            storeId={storeId}
            initial={following}
            size="chip"
          />
        ) : null}
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}>
        {/* Uppercase by style, never in the data: the website does the
            same through CSS, and the name stays itself everywhere else. */}
        <Text
          style={{
            color: colors.textPrimary,
            fontSize: 22,
            fontWeight: "800",
            letterSpacing: 0.4,
            textTransform: "uppercase",
            flex: 1,
          }}
          numberOfLines={2}
        >
          {name}
        </Text>
        {right ? (
          <View style={{ flexDirection: "row", gap: spacing(2) }}>{right}</View>
        ) : null}
      </View>

      {startsAt ? (
        <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
          {whenLine(startsAt, endsAt)}
        </Text>
      ) : null}

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          flexWrap: "wrap",
          gap: spacing(3),
          minHeight: 28,
        }}
      >
        {canGo && going && eventId ? (
          going.youGoing ? (
            <GoingMark eventId={eventId} onSettled={onSettled} />
          ) : (
            <GoingButton
              eventId={eventId}
              youGoing={false}
              goingCount={going.goingCount}
              withCount={false}
              size="chip"
              onSettled={onSettled}
            />
          )
        ) : null}
        <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "600" }}>
          {playersLine(playersCount)}
        </Text>
      </View>
    </View>
  );
}

/**
 * "Sat, Oct 3 · 11:00 AM to 2:00 PM", in the phone's own zone, the
 * way the room has always told the time to whoever is holding it.
 */
export function whenLine(startsAt: string, endsAt: string | null): string {
  const start = new Date(startsAt);
  const day = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(start);
  const time = (iso: string) =>
    new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(
      new Date(iso),
    );
  const span = endsAt ? `${time(startsAt)} to ${time(endsAt)}` : time(startsAt);
  return `${day} · ${span}`;
}

/**
 * The line's RSVP state once you are going: the check and the word,
 * and tapping it is Not going. The same flip-then-confirm the Going
 * button does, in the header's own compact shape: it goes at once, the
 * server's answer is painted back, and a refusal puts it back the way
 * it was. A lapsed sign-in opens the sign-in door, as the button does.
 */
function GoingMark({ eventId, onSettled }: { eventId: string; onSettled: () => void }) {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);

  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const notGoing = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await setGoing(eventId, false);
      if (!alive.current) return;
      markFeedStale();
      onSettled();
    } catch (caught) {
      if (!alive.current) return;
      if (caught instanceof ApiError && caught.code === "no-account") {
        navigation.navigate("SignIn");
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  return (
    <Tap
      onPress={() => void notGoing()}
      disabled={busy}
      hitSlop={6}
      accessibilityLabel="Going. Tap for Not going"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing(1),
        opacity: busy ? 0.7 : 1,
      }}
    >
      {busy ? (
        <ActivityIndicator size="small" color={colors.accent} />
      ) : (
        <Ionicons name="checkmark" size={16} color={colors.accent} />
      )}
      <Text style={{ color: colors.accent, fontSize: 14, fontWeight: "700" }}>
        {GOING}
      </Text>
    </Tap>
  );
}
