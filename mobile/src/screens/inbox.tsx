import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";

import type { StackParams } from "../../App";
import { LOCAL_ENABLED } from "../local-enabled";
import { openRoom } from "../open-room";
import { getNotifications, markRead, type InboxItem } from "../api";
import { Button, Card, Muted, Tap } from "../ui";
import { colors, spacing } from "../theme";

/**
 * The inbox — the website's Notifications page, row for row: one card,
 * divided rows, the unread dot, and the time said relatively. Opening
 * the screen marks the unread ones read (the app's advantage over a
 * browser tab: it knows you looked), but the dots from THIS visit stay
 * on screen, so what was new when you arrived reads as new.
 */
export function InboxScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
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

  return (
    <ScrollView contentContainerStyle={{ padding: spacing(4), gap: spacing(4) }}>
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
        <Card>
          <View>
            {items.map((item, index) => (
              /*
               * A notice that names a screen the app has is a door to
               * it. Messages land on Local, where the conversation is
               * one row down; everything else stays a note, honestly.
               */
              <Tap
                key={item.id}
                disabled={item.url !== "/local"}
                onPress={() =>
                  LOCAL_ENABLED
                    ? navigation.navigate("Tabs", { screen: "Local" })
                    : navigation.navigate("Messages")
                }
                style={{
                  gap: spacing(1),
                  paddingVertical: spacing(3),
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: colors.border,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    gap: spacing(3),
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: spacing(2),
                      flexShrink: 1,
                    }}
                  >
                    {!item.readAt && (
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: colors.accent,
                        }}
                      />
                    )}
                    <Text
                      numberOfLines={2}
                      style={{
                        color: item.readAt ? colors.textSecondary : colors.textPrimary,
                        fontWeight: item.readAt ? "500" : "700",
                        flexShrink: 1,
                      }}
                    >
                      {item.title}
                    </Text>
                  </View>
                  <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                    {ago(item.createdAt)}
                  </Text>
                </View>
                {item.body ? (
                  <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                    {item.body}
                  </Text>
                ) : null}
              </Tap>
            ))}
          </View>
        </Card>
      )}
    </ScrollView>
  );
}

/** "4m ago", the web inbox's relative clock. */
function ago(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}
