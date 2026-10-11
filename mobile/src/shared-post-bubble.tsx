import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { getPost, type PostDetail } from "./api";
import { cardsLabel } from "./flare-copy";
import { PlayerAvatar } from "./player-avatar";
import { RemoteImage } from "./remote-image";
import { colors, radius, spacing } from "./theme";
import { Tap } from "./ui";

/**
 * A post sent from the Feed's share sheet, drawn in the conversation as
 * the post itself: who posted it, what it is after, the first cards, and
 * a tap into it - the way a shared post sits in an Instagram DM. The
 * founder, after the first try sent plain words: "it needs to be a
 * clickable post".
 *
 * Read with the post's own call, as whoever is looking at the chat sees
 * it; a post taken down or out of reach says so instead.
 */

const WIDTH = 240;
const THUMB = 64;

/** One read per post per launch, however many bubbles show it. */
const loaded = new Map<string, Promise<PostDetail | null>>();
function load(postId: string): Promise<PostDetail | null> {
  let pending = loaded.get(postId);
  if (!pending) {
    pending = getPost(postId)
      .then((answer) => answer.post)
      .catch(() => {
        loaded.delete(postId);
        return null;
      });
    loaded.set(postId, pending);
  }
  return pending;
}

export function SharedPostBubble({
  postId,
  onOpen,
}: {
  postId: string;
  onOpen: (postId: string) => void;
}) {
  const [post, setPost] = useState<PostDetail | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    void load(postId).then((found) => alive && setPost(found));
    return () => {
      alive = false;
    };
  }, [postId]);

  const frame = {
    width: WIDTH,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
    padding: spacing(3),
    gap: spacing(2.5),
  } as const;

  if (post === undefined) {
    return (
      <View style={[frame, { alignItems: "center", paddingVertical: spacing(6) }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (post === null) {
    return (
      <View style={frame}>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>
          This post isn't available.
        </Text>
      </View>
    );
  }

  const showcase = post.direction === "showcase";
  const total = post.cards.length;

  return (
    <Tap
      onPress={() => onOpen(post.postId)}
      accessibilityLabel={`Open ${post.author.displayName}'s Flare`}
      style={frame}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}>
        <PlayerAvatar
          displayName={post.author.displayName}
          seed={post.author.playerId ?? post.postId}
          avatarUrl={post.author.avatarUrl}
          frame={post.author.frame}
          ring={post.author.ring}
          aura={post.author.aura ?? null}
          size={28}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "800" }}
          >
            {post.author.displayName}
          </Text>
          <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: 12 }}>
            {`${showcase ? "is letting go of" : "is looking for"}${
              total > 1 ? ` · ${cardsLabel(total)}` : ""
            }`}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: spacing(2) }}>
        {post.cards.slice(0, 3).map((card) => (
          <RemoteImage
            key={card.flareId}
            uri={card.imageUrl}
            contentFit="contain"
            style={{
              width: THUMB,
              height: Math.round((THUMB * 88) / 63),
              borderRadius: radius.control / 2,
              backgroundColor: colors.canvas,
              opacity: card.state === "found" ? 0.5 : 1,
            }}
          />
        ))}
      </View>

      <Text
        numberOfLines={1}
        style={{ color: colors.textPrimary, fontSize: 13, fontWeight: "700" }}
      >
        {post.hunt?.name ?? post.cards[0]?.cardName ?? "View Flare"}
      </Text>
    </Tap>
  );
}
