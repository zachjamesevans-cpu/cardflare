import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";

import type { StackParams } from "../../App";
import { LOCAL_ENABLED } from "../local-enabled";
import { openRoom } from "../open-room";
import { getNotifications, markRead, type InboxItem } from "../api";
import { PlayerAvatar } from "../player-avatar";
import { Button, Card, Muted, Tap } from "../ui";
import { colors, radius, spacing } from "../theme";
import { useTabBarInset } from "../glass";

/**
 * The inbox — the website's Notifications page, row for row, laid out
 * the way Instagram lays its notifications out.
 *
 * The founder, with the two side by side: "make it closer to Instagram
 * where the profile avatar is shown." So each row leads with the person
 * who did it — their picture, worn ring and all, opening their profile —
 * then the sentence with their name in bold and the time inline after
 * it, then the detail line. A row with nobody behind it (a board
 * opening) leads with the kind's icon in the same slot, so the column
 * of faces stays a column. Unread rows are tinted and carry a dot.
 *
 * Opening the screen marks the unread ones read (the app's advantage
 * over a browser tab: it knows you looked), but the tint from THIS
 * visit stays on screen, so what was new when you arrived reads as new.
 * The website draws the same row in `src/components/inbox/inbox-list.tsx`.
 */
export function InboxScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const tabInset = useTabBarInset();
  const [items, setItems] = useState<InboxItem[] | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const { notifications } = await getNotifications();
        setItems(notifications);

        const unread = notifications.filter((n) => !n.readAt).map((n) => n.id);
        if (unread.length > 0) await markRead(unread);
      } catch {
        setItems([]);
      }
    })();
  }, []);

  const openProfile = (playerId: string) =>
    navigation.navigate("PlayerProfile", { playerId });

  /*
   * A notice that names a screen the app has is a door to it. Messages
   * land on Local, where the conversation is one row down; a follow
   * opens the follower; everything else stays a note, honestly.
   */
  const destination = (item: InboxItem): (() => void) | null => {
    if (item.url === "/local") {
      return () =>
        LOCAL_ENABLED
          ? navigation.navigate("Tabs", { screen: "Local" })
          : navigation.navigate("Messages");
    }
    if (item.url?.startsWith("/p/")) {
      const playerId = item.url.slice("/p/".length);
      return () => openProfile(playerId);
    }
    return null;
  };

  return (
    <ScrollView
      contentContainerStyle={{
        padding: spacing(4),
        gap: spacing(4),
        /* Clear of the floating tab bar. */
        paddingBottom: spacing(4) + tabInset,
      }}
    >
      {/* No heading here: the navigation bar above already says
          "Notifications", and printing it twice on one screen reads as a
          mistake. The website has one because it has no nav bar. */}
      {items === null && <Muted>Loading…</Muted>}

      {items?.length === 0 && (
        <Card>
          <View style={{ alignItems: "center", gap: spacing(3), paddingVertical: spacing(6) }}>
            <Ionicons name="notifications-outline" size={24} color={colors.textMuted} />
            <Text
              style={{
                color: colors.textSecondary,
                textAlign: "center",
                maxWidth: 280,
                lineHeight: 21,
              }}
            >
              Nothing yet. When somebody offers on one of your Flares, or a board
              opens early at a store you save, it lands here.
            </Text>
            <Button
              label="Find a room"
              variant="secondary"
              onPress={() => openRoom(navigation)}
            />
          </View>
        </Card>
      )}

      {items !== null && items.length > 0 && (
        <Card style={{ padding: spacing(2), gap: 0 }}>
          {items.map((item) => {
            const unread = !item.readAt;
            const actor = item.actor ?? null;
            const { lead, rest } = splitTitle(item.title, actor?.displayName);
            const open = destination(item);

            return (
              <View
                key={item.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing(3),
                  paddingVertical: spacing(2.5),
                  paddingHorizontal: spacing(2),
                  borderRadius: radius.control,
                  /* The website's bg-accent/6: the lime at six percent. */
                  backgroundColor: unread ? `${colors.accent}0f` : "transparent",
                }}
              >
                {actor ? (
                  <Tap
                    accessibilityLabel={`Open ${actor.displayName}'s profile`}
                    onPress={() => openProfile(actor.playerId)}
                  >
                    <PlayerAvatar
                      displayName={actor.displayName}
                      seed={actor.playerId}
                      avatarUrl={actor.avatarUrl}
                      frame={actor.frame}
                      ring={actor.ring}
                      aura={actor.aura}
                      ringArt={actor.ringArt}
                      auraArt={actor.auraArt}
                      size={40}
                    />
                  </Tap>
                ) : (
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.elevated,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons
                      name={
                        kindIcon(item.kind) === "store"
                          ? "storefront-outline"
                          : "notifications-outline"
                      }
                      size={18}
                      color={colors.textMuted}
                    />
                  </View>
                )}

                {/* Most of these happened somewhere; the words are the
                    way back to it. */}
                <Tap
                  disabled={open === null}
                  onPress={open ?? undefined}
                  style={{ flex: 1, minWidth: 0, gap: 2 }}
                >
                  <Text style={{ fontSize: 14, lineHeight: 19 }}>
                    {lead ? (
                      <Text style={{ color: colors.textPrimary, fontWeight: "600" }}>
                        {lead}
                      </Text>
                    ) : null}
                    <Text
                      style={{
                        color: unread ? colors.textPrimary : colors.textSecondary,
                        fontWeight: lead ? "400" : "600",
                      }}
                    >
                      {rest}
                    </Text>
                    <Text style={{ color: colors.textMuted }}> {ago(item.createdAt)}</Text>
                  </Text>
                  {item.body ? (
                    <Text
                      numberOfLines={2}
                      style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}
                    >
                      {item.body}
                    </Text>
                  ) : null}
                </Tap>

                {unread && (
                  <View
                    accessibilityLabel="Unread"
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: colors.accent,
                    }}
                  />
                )}
              </View>
            );
          })}
        </Card>
      )}
    </ScrollView>
  );
}

/*
 * The three helpers below mirror `src/lib/notifications/inbox-row.ts`
 * on the website, word for word; tests/unit/inbox-row.test.ts holds
 * the two copies together.
 */

/** "4m", "3h", "2d", "3w" — Instagram's clock, the website's too. */
function ago(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

/** The name at the front of a title, split off so it can be bold. */
function splitTitle(
  title: string,
  actorName: string | null | undefined,
): { lead: string | null; rest: string } {
  if (actorName && title.startsWith(`${actorName} `)) {
    return { lead: actorName, rest: title.slice(actorName.length) };
  }
  return { lead: null, rest: title };
}

/** The icon a row with nobody behind it leads with. */
function kindIcon(kind: string): "store" | "bell" {
  return kind === "board-open" || kind === "early-board" ? "store" : "bell";
}
