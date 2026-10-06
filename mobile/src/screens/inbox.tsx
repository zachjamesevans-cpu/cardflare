import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";

import type { StackParams } from "../../App";
import { followHref } from "../follow-href";
import { openRoom } from "../open-room";
import {
  friendlyError,
  getNotifications,
  markRead,
  storedAccessToken,
  type InboxItem,
} from "../api";
import { cachedPlayerId, readCache, writeCache } from "../cache";
import { syncBadge } from "../push";
import { setUnread } from "../unread";
import { PlayerAvatar } from "../player-avatar";
import { Button, Card, Loading, Muted, Tap } from "../ui";
import { colors, gutter, radius, spacing } from "../theme";
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
 * The app icon's badge follows the same two beats: set to what loaded
 * unread, cleared once the server has them marked read. Every focus,
 * not every mount: a tab stays mounted, and a notice that landed while
 * you were on the Feed has to be here when you come back.
 * The website draws the same row in `src/components/inbox/inbox-list.tsx`.
 */
export function InboxScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const tabInset = useTabBarInset();
  const [items, setItems] = useState<InboxItem[] | null>(null);
  /*
   * Whether `items` is this visit's answer or last visit's paint. The
   * unread tint follows the fresh answer only: a painted row cannot
   * know whether it has been read since, so it is drawn as read until
   * the server says otherwise.
   */
  const [fresh, setFresh] = useState(false);
  const freshRef = useRef(false);
  /*
   * A load that failed, in words, when there is nothing painted to
   * show instead. "Nothing yet" would be a lie: there may be plenty,
   * we just could not ask. Try again asks again.
   */
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  /*
   * THE PAINT: last visit's notices, from the `inbox` kind, so the
   * list has its shape the moment the tab opens. The founder
   * (2026-10-05): "Same thing with everything else pretty much on the
   * main tabs." Only with a session, under this account, and never
   * over the real answer.
   */
  useEffect(() => {
    let live = true;
    void (async () => {
      if (!(await storedAccessToken())) return;
      const id = await cachedPlayerId();
      if (!id || !live) return;
      const cached = await readCache<InboxItem[]>("inbox", id);
      if (!cached || !live || freshRef.current || !Array.isArray(cached)) return;
      setItems((current) => current ?? cached);
    })();
    return () => {
      live = false;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void (async () => {
        try {
          const { notifications } = await getNotifications();
          if (!live) return;
          freshRef.current = true;
          setLoadError(null);
          setItems(notifications);
          setFresh(true);

          /* Remembered for the next open's paint, under this account. */
          const id = await cachedPlayerId();
          if (id) void writeCache("inbox", id, notifications);

          const unread = notifications.filter((n) => !n.readAt).map((n) => n.id);
          /* The icon's badge says what the list says: this many, then
             none once the server has them marked read. Every push
             carries the count, so the icon is right the moment a
             notice lands; this is what makes it right afterwards. */
          await syncBadge(unread.length);
          if (unread.length > 0) {
            await markRead(unread);
            await syncBadge(0);
            /* And the dot on the tab goes with the badge. */
            setUnread(0);
          }
        } catch (caught) {
          if (live) setLoadError(friendlyError(caught));
        }
      })();
      return () => {
        live = false;
      };
    }, [attempt]),
  );

  const openProfile = (playerId: string) =>
    navigation.navigate("PlayerProfile", { playerId });

  /*
   * A notice with a path is a door. The same router a push tap and the
   * Feed's notice buttons go through (src/follow-href.ts): a message
   * opens its conversation, a follow opens the follower, a night opens
   * the room, and a path the app has no screen for opens the website,
   * so the row always lands where its words said. A notice with no
   * path stays a note, honestly.
   */
  const destination = (item: InboxItem): (() => void) | null => {
    const url = item.url;
    if (!url || !url.startsWith("/")) return null;
    return () => void followHref(navigation, url).catch(() => {});
  };

  return (
    <ScrollView
      contentContainerStyle={{
        paddingHorizontal: gutter,
        paddingVertical: spacing(4),
        gap: spacing(4),
        /* Clear of the floating tab bar. */
        paddingBottom: spacing(4) + tabInset,
      }}
    >
      {/* No heading here: the navigation bar above already says
          "Inbox", and printing it twice on one screen reads as a
          mistake. The website has one because it has no nav bar. */}

      {items === null && loadError === null && <Loading />}

      {items === null && loadError !== null && (
        <Card>
          <View
            style={{
              alignItems: "center",
              gap: spacing(3),
              paddingVertical: spacing(6),
            }}
          >
            <Ionicons name="cloud-offline-outline" size={24} color={colors.textMuted} />
            <Text
              accessibilityRole="alert"
              style={{
                color: colors.textSecondary,
                textAlign: "center",
                maxWidth: 280,
                lineHeight: 21,
              }}
            >
              {loadError}
            </Text>
            <Button
              label="Try again"
              variant="secondary"
              onPress={() => {
                setLoadError(null);
                setAttempt((n) => n + 1);
              }}
            />
          </View>
        </Card>
      )}

      {items?.length === 0 && (
        <Card>
          <View
            style={{
              alignItems: "center",
              gap: spacing(3),
              paddingVertical: spacing(6),
            }}
          >
            <Ionicons name="notifications-outline" size={24} color={colors.textMuted} />
            <Text
              style={{
                color: colors.textSecondary,
                textAlign: "center",
                maxWidth: 280,
                lineHeight: 21,
              }}
            >
              Nothing yet. When somebody offers on one of your Flares, or a board opens
              early at a store you follow, it lands here.
            </Text>
            <Button
              label="Open the room"
              variant="secondary"
              onPress={() => openRoom(navigation)}
            />
          </View>
        </Card>
      )}

      {items !== null && items.length > 0 && (
        <Card style={{ padding: spacing(2), gap: 0 }}>
          {collapseRuns(items).map(({ item, count, anyUnread }) => {
            const unread = fresh && anyUnread;
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
                    {count > 1 ? (
                      <Text style={{ color: colors.textPrimary, fontWeight: "600" }}>
                        {" "}
                        ×{count}
                      </Text>
                    ) : null}
                    <Text style={{ color: colors.textMuted }}>
                      {" "}
                      {ago(item.createdAt)}
                    </Text>
                  </Text>
                  {item.body ? (
                    <Text
                      numberOfLines={2}
                      style={{
                        color: colors.textSecondary,
                        fontSize: 13,
                        lineHeight: 18,
                      }}
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

/**
 * Back-to-back notices that say the same thing, as one row with a
 * count. The website's `collapseRuns`, word for word.
 */
function collapseRuns<
  T extends {
    id: string;
    kind: string;
    title: string;
    url: string | null;
    readAt: string | null;
    actor?: { playerId: string } | null;
  },
>(items: T[]): { item: T; count: number; anyUnread: boolean }[] {
  const runs: { item: T; count: number; anyUnread: boolean; key: string }[] = [];
  for (const n of items) {
    const key = [n.kind, n.actor?.playerId ?? "", n.title, n.url ?? ""].join("|");
    const last = runs[runs.length - 1];
    if (last && last.key === key) {
      last.count += 1;
      if (!n.readAt) last.anyUnread = true;
    } else {
      runs.push({ item: n, count: 1, anyUnread: !n.readAt, key });
    }
  }
  return runs.map(({ item, count, anyUnread }) => ({ item, count, anyUnread }));
}

/** The icon a row with nobody behind it leads with. */
function kindIcon(kind: string): "store" | "bell" {
  return kind === "board-open" || kind === "early-board" || kind === "store-post"
    ? "store"
    : "bell";
}
