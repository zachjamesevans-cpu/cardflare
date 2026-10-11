import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { getFeed, type FeedEntry } from "./api";
import { remainingAcross } from "./flare-deck-pager";
import { RemoteImage } from "./remote-image";
import { colors, radius, spacing } from "./theme";
import { Tap } from "./ui";

/**
 * Your own posts, on your own profile, as rows above the Flares grid.
 *
 * The Feed had a My Flares tab; the founder asked "is my flares even
 * useful anymore now that they're displaying in your own profile?" and
 * it went. The grid below draws your wants card by card, which is not
 * where a post is managed, so this is: one row per post, what it is
 * after and how far along, and a tap onto the post's own screen, where
 * Update progress and Take down live.
 *
 * Read from the Feed's own call, which already carries every post of
 * yours with its progress. Nothing at all while it loads or when you
 * have no post up: the grid's empty state speaks then.
 */

type Hunt = Extract<FeedEntry, { kind: "hunt" }>;

const THUMB = 36;

/** "2 of 4 still needed", "Found them all", or how many are up. */
export function postProgress(post: {
  direction?: "want" | "showcase";
  completed?: boolean;
  remainingCopies?: number;
  cards: Hunt["cards"];
}): string {
  const showcase = post.direction === "showcase";
  if (post.completed) return showcase ? "All gone" : "Found them all";
  const left = remainingAcross(
    post.cards,
    showcase ? "showcase" : "want",
    post.remainingCopies,
  );
  const asked = post.cards.reduce(
    (sum, card) => sum + Math.max(1, card.quantity ?? 1),
    0,
  );
  if (showcase) return `${left} available`;
  return left >= asked ? `${asked} wanted` : `${left} of ${asked} still needed`;
}

export function OwnPosts({ onOpen }: { onOpen: (postId: string) => void }) {
  const [posts, setPosts] = useState<Hunt[] | null>(null);

  useEffect(() => {
    let alive = true;
    getFeed()
      .then((answer) => {
        if (!alive) return;
        const mine = answer.items.filter(
          (item): item is Hunt => item.kind === "hunt" && item.yours,
        );
        /* One row per post: the Feed can carry a post in two places. */
        const seen = new Set<string>();
        setPosts(
          mine.filter((post) => !seen.has(post.postId) && seen.add(post.postId)),
        );
      })
      .catch(() => alive && setPosts([]));
    return () => {
      alive = false;
    };
  }, []);

  if (!posts || posts.length === 0) return null;

  return (
    <View
      style={{
        gap: spacing(1),
        paddingHorizontal: spacing(4),
        paddingBottom: spacing(3),
      }}
    >
      <Text
        style={{
          color: colors.textMuted,
          fontSize: 12,
          fontWeight: "600",
          letterSpacing: 1.4,
          textTransform: "uppercase",
          marginBottom: spacing(1),
        }}
      >
        Your posts
      </Text>
      {posts.map((post) => (
        <Tap
          key={post.postId}
          onPress={() => onOpen(post.postId)}
          accessibilityLabel={`Open your post ${post.hunt?.name ?? post.cards[0]?.cardName ?? ""}`}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing(3),
            paddingVertical: spacing(2),
          }}
        >
          <RemoteImage
            uri={post.cards[0]?.imageUrl}
            contentFit="contain"
            style={{
              width: THUMB,
              height: Math.round((THUMB * 88) / 63),
              borderRadius: radius.control / 2,
              backgroundColor: colors.elevated,
            }}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "700" }}
            >
              {post.hunt?.name ??
                (post.total > 1
                  ? `${post.cards[0]?.cardName} +${post.total - 1}`
                  : post.cards[0]?.cardName)}
            </Text>
            <Text
              numberOfLines={1}
              style={{
                color: post.completed ? colors.accent : colors.textSecondary,
                fontSize: 13,
              }}
            >
              {postProgress(post)}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Tap>
      ))}
    </View>
  );
}
