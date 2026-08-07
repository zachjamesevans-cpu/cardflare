import { useEffect, useState } from "react";
import { ScrollView } from "react-native";

import { getNotifications, markRead, type InboxItem } from "../api";
import { Body, Card, Muted, Title } from "../ui";
import { spacing } from "../theme";

/**
 * The inbox: the same rows the backbone records and email delivers.
 * Opening the screen marks the unread ones read — an inbox you have
 * looked at is an inbox you have read.
 */
export function InboxScreen() {
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
    <ScrollView contentContainerStyle={{ padding: spacing(4), gap: spacing(3) }}>
      {items === null && <Muted>Loading…</Muted>}
      {items?.length === 0 && (
        <Card>
          <Body>
            Nothing yet. When somebody offers on one of your Flares, it lands here —
            and on your lock screen.
          </Body>
        </Card>
      )}
      {items?.map((item) => (
        <Card key={item.id}>
          <Title>{item.title}</Title>
          {item.body && <Body>{item.body}</Body>}
          <Muted>{new Date(item.createdAt).toLocaleString()}</Muted>
        </Card>
      ))}
    </ScrollView>
  );
}
