import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";

import {
  ApiError,
  type FeedCard,
  type OfferItem,
  type OfferOutcome,
  type PostCard,
} from "./api";
import { colors, spacing } from "./theme";
import { ErrorLine, Tap, type ZoomHave } from "./ui";

/**
 * The social row under a Flare post, and the one rule about which card
 * can be answered. Shared by the Feed's hunt card and the post's own
 * screen so the two never disagree.
 */

/** The post a rail of cards belongs to, with the call "Offer" makes. */
export interface PostRef {
  postId: string;
  /** The viewer's own post: nothing to offer on. */
  yours: boolean;
  /** Who posted it, for the review's "<name> can see your name." */
  posterName?: string;
  /**
   * ONE offer, for one card or several: a line per card. Resolves with
   * what the server took, and throws an ApiError whose code is the
   * server's reason when it refused. A preview's post (the composer,
   * the lab) never sends and resolves with nothing.
   */
  offer: (items: OfferItem[], message: string) => Promise<OfferOutcome | void>;
}

/**
 * "I have this card" for one card, or null where it makes no sense:
 * your own post, a card that already traded, an item that is not a
 * post.
 */
/**
 * Each count's tap box: at least 44pt tall and wide, Apple's minimum,
 * so a thumb that lands a little off the heart still likes the post.
 */
const TARGET = {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  gap: spacing(1.5),
  minHeight: 44,
  minWidth: 44,
} as const;

export function haveFor(
  card: FeedCard | PostCard,
  post: PostRef | undefined,
): ZoomHave | null {
  if (!post || post.yours || !card.flareId || card.state === "found") return null;
  const flareId = card.flareId;
  return {
    postId: post.postId,
    posterName: post.posterName ?? "They",
    flareId,
    name: card.cardName,
    state: card.state ?? "open",
    youOffered: card.youOffered ?? false,
    onOffer: async (items, note) =>
      (await post.offer(items, note)) ?? { offered: items.length, refused: [] },
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

  /*
   * The server's word, remembered, so a change in it resets the heart.
   * Without this a row that came to hold a different post - the list
   * moved when a new post landed on top - kept the heart of the post it
   * used to show, and the founder read a like he never gave. A flip of
   * his own leaves the server's word alone until the next read, so it
   * survives; the next read then settles it.
   */
  const [seen, setSeen] = useState({ liked: initialLiked, likes: initialLikes });
  if (seen.liked !== initialLiked || seen.likes !== initialLikes) {
    setSeen({ liked: initialLiked, likes: initialLikes });
    setLiked(initialLiked);
    setLikes(initialLikes);
  }

  /*
   * One heart request per post at a time. A thumb that taps twice fast
   * used to send like, unlike, like in a race the server settled in
   * whatever order they landed, and a rollback could undo the wrong
   * flip. A tap while one is in flight is ignored; the heart already
   * shows the answer it is waiting on.
   */
  const inFlight = useRef(false);
  /* Said aloud when the server refuses, rather than a heart that
     quietly flips back. Clears itself after a few seconds. */
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(timer);
  }, [error]);

  const toggle = () => {
    if (inFlight.current) return;
    inFlight.current = true;
    const next = !liked;
    setLiked(next);
    setLikes((current) => Math.max(0, current + (next ? 1 : -1)));
    setError(null);
    onLike(next)
      .catch((caught: unknown) => {
        setLiked(!next);
        setLikes((current) => Math.max(0, current + (next ? -1 : 1)));
        setError(
          caught instanceof ApiError && caught.status === 429
            ? "That is a lot of likes. Try again in a little while."
            : "Couldn't save that like. Try again.",
        );
      })
      .finally(() => {
        inFlight.current = false;
      });
  };

  return (
    <View style={{ gap: spacing(1) }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(4) }}>
      <Tap
        onPress={toggle}
        hitSlop={6}
        accessibilityLabel={liked ? "Unlike" : "Like"}
        style={TARGET}
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
        style={TARGET}
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
          style={TARGET}
        >
          <Ionicons name="paper-plane-outline" size={21} color={colors.textSecondary} />
          {offers !== undefined ? (
            <Text
              style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "600" }}
            >
              {offers}
            </Text>
          ) : null}
        </Tap>
      ) : null}
    </View>
    <ErrorLine message={error} />
    </View>
  );
}
