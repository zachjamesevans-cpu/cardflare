import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";

import { ActionSheet, DotsButton } from "./action-menu";
import type { FeedEntry } from "./api";
import { agoFrom, postActions } from "./flare-feed-card";
import { shelfFor } from "./flare-deck-pager";
import { PlayerAvatar } from "./player-avatar";
import { PostSocialRow, type PostRef } from "./post-social";
import { colors, radius, spacing } from "./theme";
import { CardImage, Tap } from "./ui";

type Hunt = Extract<FeedEntry, { kind: "hunt" }>;

/**
 * The COMPACT view: a post as a strip of card art.
 *
 * The founder: "let's make a compact view. maybe a carousel of just the
 * card art and a green quantity count of the card they're needing on
 * the card. so if it's a bonney, the bottom right will show a '1x'.
 * let's work on a compact view, and focus on making things contexual -
 * only popping up when needed. one flare takes up the whole screen
 * right now pretty much."
 *
 * So the rule here is subtraction, and the test for every line is
 * whether its absence would cost somebody something:
 *
 * - The CARD ART stays, because it is what a trader scans for.
 * - The COUNT stays, on the art, because "how many do they need" is the
 *   question the art raises and the only one it cannot answer itself.
 * - The NAME and NUMBER go. They are on the card, and legible the
 *   moment it is tapped.
 * - "Want"/"Trade" go. Want is true of every hunt, so it said nothing;
 *   cash is the exception and the only one that earns a word.
 * - PROGRESS goes unless there is some: "0 of 4 found" is noise on a
 *   post nobody has answered.
 * - The NOTE goes unless it was written, which was already true.
 * - The BUTTONS go. Everything they did is a tap on the card away, and
 *   a row of buttons under every post is what made a Feed one post
 *   tall.
 *
 * The header keeps a face, a name and a time, on ONE line, and at its
 * end the same three dots the classic card wears: the founder, "the 3
 * dots contextual menu isn't present in the compact view. Fix it."
 * Behind them, the same items as the classic card, from `postActions`.
 * You still have to know whose hunt you are looking at.
 */
export function FlareFeedCardCompact({
  item,
  post,
  onOpenProfile,
  onLike,
  onOpenThread,
  onMessage,
  onViewAll,
  onProgress,
  onTakeDown,
  onReport,
}: {
  item: Hunt;
  post: PostRef;
  onOpenProfile: (playerId: string) => void;
  onLike: (liked: boolean) => Promise<unknown>;
  onOpenThread: () => void;
  onMessage?: () => void;
  /** The full list, to read; behind the three dots. */
  onViewAll?: () => void;
  /** The progress ticks on your own post; behind the three dots. */
  onProgress?: () => void;
  /** "Take down" on your own post; behind the three dots. */
  onTakeDown?: () => void;
  /** "Report" on somebody else's; behind the three dots. */
  onReport?: () => void;
}) {
  const shelf = shelfFor(item.cards, post);
  const direction = item.direction ?? "want";
  const offering = direction === "showcase";
  const [menu, setMenu] = useState(false);
  const actions = postActions({
    total: item.total,
    yours: item.yours,
    direction,
    onViewAll,
    onProgress,
    onTakeDown,
    onReport,
  });

  /* Cash is the only term that is not the default, so it is the only
     one worth a word. "Want · Trade" on every post said nothing. */
  const terms = item.acceptsCash
    ? item.acceptsTrade
      ? "Trade or cash"
      : "Cash"
    : null;
  /* No "All found" line: a finished post's glyph in the header is the
     check, and every finished tile below already wears its own. */

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: radius.card,
        paddingVertical: spacing(2),
        paddingHorizontal: spacing(2.5),
        gap: spacing(2),
      }}
    >
      {/* One line: face, name, what they are doing, when. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}>
        <Tap
          onPress={() => item.playerId && onOpenProfile(item.playerId)}
          accessibilityLabel={`Open ${item.displayName}'s profile`}
          style={{
            flex: 1,
            minWidth: 0,
            flexDirection: "row",
            alignItems: "center",
            gap: spacing(2),
          }}
        >
          <PlayerAvatar
            displayName={item.displayName}
            seed={item.playerId ?? item.displayName}
            avatarUrl={item.avatarUrl}
            frame={item.frame}
            ring={item.ring}
            size={26}
          />
          <Text
            numberOfLines={1}
            style={{
              color: colors.textPrimary,
              fontWeight: "700",
              fontSize: 14,
              flexShrink: 1,
            }}
          >
            {item.displayName}
          </Text>
          <Ionicons
            name={
              item.completed
                ? "checkmark-circle"
                : offering
                  ? "arrow-up-circle-outline"
                  : "locate-outline"
            }
            size={13}
            color={colors.accent}
          />
        </Tap>
        {/* An older server sends a post with no time. Nothing rather
            than "NaN ago" - the same guard the classic card makes. */}
        {item.postedAt ? (
          <Text style={{ color: colors.textMuted, fontSize: 11 }}>
            {agoFrom(item.postedAt)}
          </Text>
        ) : null}
        {actions.length > 0 ? (
          <View style={{ marginLeft: spacing(1) }}>
            <DotsButton onPress={() => setMenu(true)} label="More about this post" />
          </View>
        ) : null}
      </View>
      <ActionSheet items={menu ? actions : null} onClose={() => setMenu(false)} />

      {/* The strip. Art only, each with what is still wanted. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing(1.5) }}
      >
        {item.cards.map((card, index) => (
          <View key={card.cardId}>
            <CardImage
              imageUrl={card.imageUrl}
              width={COMPACT_TILE}
              name={card.cardName}
              cardNumber={card.cardNumber}
              state={card.state}
              siblings={shelf}
              position={index}
            />
            <NeedBadge card={card} offering={offering} />
          </View>
        ))}
      </ScrollView>

      {/* Contextual, all of it: a term that is not the default, a note
          somebody wrote, a place to go. Nothing draws an empty row. */}
      {(terms || item.note) && (
        <Text numberOfLines={2} style={{ color: colors.textSecondary, fontSize: 12 }}>
          {[terms, item.note && `“${item.note}”`].filter(Boolean).join(" · ")}
        </Text>
      )}

      <PostSocialRow
        likes={item.likes}
        liked={item.liked}
        comments={item.comments}
        onLike={onLike}
        onOpenThread={onOpenThread}
        onMessage={onMessage}
      />
    </View>
  );
}

/** Small enough that four fit across a phone, big enough to recognise. */
const COMPACT_TILE = 64;

/**
 * "1x", bottom right, in the accent.
 *
 * The founder asked for exactly this: "a green quantity count of the
 * card they're needing on the card. so if it's a bonney, the bottom
 * right will show a '1x'."
 *
 * It says what is STILL wanted, not what was asked for - a card three
 * of four found is a card somebody needs one of, and the number that
 * helps is the one you could answer today. A card fully found says so
 * with a tick instead: zero is not a quantity worth drawing.
 *
 * Half again as big as it started. The founder: "make the '1x'/quanity
 * stuff like 50% bigger when soemone posts a quantity." At nine points
 * it was a mark you noticed rather than a number you read, which is the
 * wrong way round for the one fact this view keeps.
 */
function NeedBadge({
  card,
  offering,
}: {
  card: Hunt["cards"][number];
  offering: boolean;
}) {
  const wanted = card.remaining ?? card.quantity ?? 1;
  const done = card.state === "found" || (!offering && wanted <= 0);

  /* The tile's own foot says FOUND; a second tick on top of it was
     the founder's "overlapping gray checkmark thing". */
  if (done) return null;

  return (
    <View
      style={{
        position: "absolute",
        right: 3,
        bottom: 3,
        borderRadius: 6,
        paddingHorizontal: 5,
        paddingVertical: 2,
        backgroundColor: colors.accent,
      }}
    >
      <Text
        style={{
          color: colors.canvas,
          fontSize: 13,
          fontWeight: "800",
        }}
      >
        {`${wanted}x`}
      </Text>
    </View>
  );
}
