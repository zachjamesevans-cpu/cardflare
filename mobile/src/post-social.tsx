import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Text, View } from "react-native";

import type { FeedCard, PostCard } from "./api";
import { colors, spacing } from "./theme";
import { Tap, type ZoomHave } from "./ui";

/**
 * The social row under a Flare post, and the one rule about which card
 * can be answered. Shared by the Feed's hunt card and the post's own
 * screen so the two never disagree.
 */

/** The post a rail of cards belongs to, with the call "I have this" makes. */
export interface PostRef {
  postId: string;
  /** The viewer's own post: nothing to offer on. */
  yours: boolean;
  offer: (flareId: string, note: string) => Promise<void>;
}

/**
 * "I have this" for one card, or null where it makes no sense: your own
 * post, a card that already traded, an item that is not a post.
 */
export function haveFor(
  card: FeedCard | PostCard,
  post: PostRef | undefined,
): ZoomHave | null {
  if (!post || post.yours || !card.flareId || card.state === "found") return null;
  const flareId = card.flareId;
  return {
    state: card.state ?? "open",
    youOffered: card.youOffered ?? false,
    onOffer: (note) => post.offer(flareId, note),
  };
}

/**
 * A heart with its count and a bubble with its count. The heart flips
 * at once and the server settles it; the count follows the flip so the
 * number never lags the thumb.
 */
export function PostSocialRow({
  likes: initialLikes,
  liked: initialLiked,
  comments,
  offers,
  onLike,
  onOpenThread,
  onMessage,
  threadOpen = false,
}: {
  likes: number;
  liked: boolean;
  comments: number;
  /** Hands raised on the post, beside the message action. */
  offers?: number;
  onLike: (liked: boolean) => Promise<unknown>;
  onOpenThread: () => void;
  /** The third action: message the poster. Absent on your own post. */
  onMessage?: () => void;
  /** On the post's own screen the bubble is a label, not a door. */
  threadOpen?: boolean;
}) {
  const [liked, setLiked] = useState(initialLiked);
  const [likes, setLikes] = useState(initialLikes);

  const toggle = () => {
    const next = !liked;
    setLiked(next);
    setLikes((current) => Math.max(0, current + (next ? 1 : -1)));
    onLike(next).catch(() => {
      setLiked(!next);
      setLikes((current) => Math.max(0, current + (next ? -1 : 1)));
    });
  };

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(4) }}>
      <Tap
        onPress={toggle}
        hitSlop={6}
        accessibilityLabel={liked ? "Unlike" : "Like"}
        style={{ flexDirection: "row", alignItems: "center", gap: spacing(1.5) }}
      >
        <Ionicons
          name={liked ? "heart" : "heart-outline"}
          size={22}
          color={liked ? colors.accent : colors.textSecondary}
        />
        <Text
          style={{
            color: liked ? colors.accent : colors.textSecondary,
            fontSize: 14,
            fontWeight: "600",
          }}
        >
          {likes}
        </Text>
      </Tap>
      <Tap
        onPress={onOpenThread}
        disabled={threadOpen}
        hitSlop={6}
        accessibilityLabel="Show comments"
        style={{ flexDirection: "row", alignItems: "center", gap: spacing(1.5) }}
      >
        <Ionicons
          name={threadOpen ? "chatbubble" : "chatbubble-outline"}
          size={21}
          color={threadOpen ? colors.textPrimary : colors.textSecondary}
        />
        <Text
          style={{
            color: threadOpen ? colors.textPrimary : colors.textSecondary,
            fontSize: 14,
            fontWeight: "600",
          }}
        >
          {comments}
        </Text>
      </Tap>
      {onMessage ? (
        <Tap
          onPress={onMessage}
          hitSlop={6}
          accessibilityLabel="Message them"
          style={{ flexDirection: "row", alignItems: "center", gap: spacing(1.5) }}
        >
          <Ionicons name="paper-plane-outline" size={21} color={colors.textSecondary} />
          {offers !== undefined ? (
            <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "600" }}>
              {offers}
            </Text>
          ) : null}
        </Tap>
      ) : null}
    </View>
  );
}
