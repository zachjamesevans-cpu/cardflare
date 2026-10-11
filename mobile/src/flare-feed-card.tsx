import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useState } from "react";
import { Text, View } from "react-native";

import { ActionSheet, DotsButton, type ActionItem } from "./action-menu";
import { agoFrom } from "./ago";
import type { FeedEntry } from "./api";
import { cardsLabel } from "./flare-copy";
import { FlareCardSlide, FlareStrip, remainingOf, shelfFor } from "./flare-deck-pager";
import { GuestChip } from "./feed-person";
import { inYourOfferLine } from "./offer-copy";
import { OfferReviewSheet } from "./offer-review-sheet";
import { PlayerAvatar } from "./player-avatar";
import { PostSocialRow, type PostRef } from "./post-social";
import { colors, radius, spacing, accentGlow } from "./theme";
import { Button, Tap, type ZoomPicks } from "./ui";

/**
 * One Flare on the Feed, drawn as a post.
 *
 * The founder's redesign: who is hunting, then the card and what is
 * asked of it, then what they wrote, then the counts. A post with
 * several cards is the same row as a post with one, swiped: compact
 * slides rather than a hero, because a Feed is scanned and a hero
 * costs half a screen per post.
 *
 * Every piece of behaviour is the one the Feed already had: the tap on
 * the card opens the same zoom with "I have this card" inside it, the
 * heart and the bubble are the post's own, and the paper plane opens
 * the same conversation Local opens. New here: "I have these" for
 * several at once, "Update progress" on your own, and the hunt a post
 * belongs to.
 *
 * THE PICKS LIVE ON THE POST, NOT IN THE VIEWER. The audit of
 * 2026-10-02: "Closing the viewer silently drops every picked card."
 * So the post holds what has been added, flareId -> copies, hands it
 * to the viewer and to the review, and keeps it when the viewer closes.
 * While the viewer is closed and something is in, one line under the
 * cards says "2 in your offer · Review", and Review opens the review
 * directly. Sending, or taking everything out, clears the line. The
 * founder's call: for the page's life, no warning dialog, nothing
 * stored, so a reload starts clean.
 *
 * AND THERE IS ONE STORE PER POST. The Feed screen keeps every post's
 * picks in `picksByPost` and hands this card its own as `picks` and
 * `onPicks`, and hands the same picks to the full-list sheet when it
 * opens on this post. So a card ticked in the viewer is ticked in the
 * sheet and counted on the "N in your offer" line, and the other way
 * round: one pick, three places to see it. This card keeps no picks
 * of its own.
 */

type Hunt = Extract<FeedEntry, { kind: "hunt" }>;

/* How long ago: one helper for the whole app (src/ago.ts), re-exported
   here because the post's siblings already import it from the post. */
export { agoFrom };

/** "2.1 mi away", or "nearby" under a mile. */
export function awayLabel(miles: number): string {
  if (miles < 1) return "nearby";
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi away`;
}

/**
 * What the person did, in the words the board uses.
 *
 * A Flare points one of two ways: wanted, or offered up. Everything in
 * the Feed used to be a want, so the line was a constant, and a
 * showcase post reading "is looking for" would have been backwards.
 * "Looking for" and "Offering" are the two directions everywhere, the
 * same words the composer's control uses.
 *
 * A FINISHED post says so HERE, in the line it already has, rather than
 * on a row of its own. The founder: "Delete the 'all gone' 'all found'
 * stuff. Just clutters the feed." So a want that is done reads "found
 * it" (one card) or "found them all" (several), and an offer with
 * nothing left reads "offered it all", and the glyph beside it is a
 * check rather than the crosshair. The website's statusLabel says the
 * same words (src/components/feed/flare-feed-card.tsx).
 */
export function statusLabel(item: {
  direction?: "want" | "showcase" | null;
  completed?: boolean | null;
  /** How many cards: `total` on a Feed post, the cards themselves on the post screen. */
  total?: number;
  cards?: unknown[];
  /** The hunt the post went up in: "is hunting", and the hunt's name after it. */
  hunt?: { id: string; name: string } | null;
}): string {
  const offering = item.direction === "showcase";
  if (item.completed) {
    if (offering) return "offered it all";
    return (item.total ?? item.cards?.length ?? 1) === 1
      ? "found it"
      : "found them all";
  }
  if (offering) return "is offering";
  /* The founder: "soupie posted 17 cards to her ace hunt. but it just
     says 'is looking for' with a little tiny ace 'view hunt' button
     below". A post in a hunt says so, and names it (see FlareStatus). */
  return item.hunt ? "is hunting" : "is looking for";
}

/**
 * The crosshair and the words: CardFlare's status line.
 *
 * A targeting reticle in the accent with a faint glow behind it, then
 * "is looking for" in the same green. Meant to be the recognisable mark of
 * a Flare wherever one is drawn, so it is one component and nothing
 * else draws the pair.
 *
 * Done, the reticle gives way to a check in the same accent and the
 * glow goes out: nothing is being hunted any more, and the line says
 * so in its own words (see statusLabel). One glyph swap, no new row.
 */
export function FlareStatus({
  label = "is looking for",
  detail,
  done = false,
  hunt,
  onOpenHunt,
}: {
  label?: string;
  /** "3 cards", in the quiet colour after the status. */
  detail?: string | null;
  /** Every copy in hand or given away: the check instead of the crosshair. */
  done?: boolean;
  /**
   * The hunt the post went up in, named after the words - "is hunting
   * Ace <3" - and the door to it. This replaced the small "◇ Ace <3 ·
   * View hunt" row under the cards, which was the only sign a post
   * belonged to a hunt, and the easiest thing on it to miss.
   */
  hunt?: { id: string; name: string } | null;
  onOpenHunt?: (huntId: string) => void;
}) {
  /*
   * THE HUNT AS A PILL, NOT AS WORDS.
   *
   * Hunts are named like cards - "Green Zoro", "Sabo" - so "is hunting
   * Green Zoro" in plain bold read as wanting one Green Zoro. A pill
   * says it is the name of a thing, and that it opens. The founder
   * asked whether "looking for" and "is hunting" would blur together
   * under one icon. The icon stays: the crosshair IS the hunts mark
   * (the hunts-as-binders round), and both lines mean "tap a card to
   * offer". The pill is the difference.
   */
  const huntPill = hunt ? (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 2,
        borderWidth: 1,
        borderColor: `${colors.accent}59`,
        backgroundColor: colors.accentTint,
        borderRadius: 999,
        paddingLeft: spacing(2),
        paddingRight: onOpenHunt ? spacing(1) : spacing(2),
        paddingVertical: 1,
        minWidth: 0,
      }}
    >
      <Text
        numberOfLines={1}
        style={{ color: colors.accent, fontSize: 13, fontWeight: "800", flexShrink: 1 }}
      >
        {hunt.name}
      </Text>
      {onOpenHunt ? (
        <Ionicons name="chevron-forward" size={12} color={colors.accent} />
      ) : null}
    </View>
  ) : null;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        /* Wraps rather than squeezing: a hunt named "Straw Hat Crew"
           beside "· 8 cards" shrank the pill to "S…" on a phone. Now the
           count goes to the next line and the name stays readable. */
        flexWrap: "wrap",
        columnGap: spacing(1.5),
        rowGap: 2,
        minWidth: 0,
      }}
    >
      {done ? (
        <Ionicons name="checkmark-circle" size={17} color={colors.accent} />
      ) : (
        <View
          style={{
            shadowColor: colors.accent,
            shadowOpacity: 0.7 * accentGlow,
            shadowRadius: 5,
            shadowOffset: { width: 0, height: 0 },
          }}
        >
          <MaterialCommunityIcons name="crosshairs" size={17} color={colors.accent} />
        </View>
      )}
      <Text style={{ color: colors.accent, fontSize: 14, fontWeight: "600" }}>
        {label}
      </Text>
      {hunt && onOpenHunt ? (
        /* Its own tap, inside the header's: the pill opens the hunt,
           the rest of the header still opens the profile. The shrink
           lives on this wrapper - Tap puts its style on an inner view. */
        <View style={{ flexShrink: 1, minWidth: 0, maxWidth: "100%" }}>
          <Tap
            onPress={() => onOpenHunt(hunt.id)}
            accessibilityLabel={`View hunt ${hunt.name}`}
            hitSlop={6}
          >
            {huntPill}
          </Tap>
        </View>
      ) : hunt ? (
        <View style={{ flexShrink: 1, minWidth: 0, maxWidth: "100%" }}>{huntPill}</View>
      ) : null}
      {detail ? (
        <Text style={{ color: colors.textMuted, fontSize: 13, flexShrink: 0 }}>
          {`· ${detail}`}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * What waits behind the three dots: the full list when there is more
 * than one card, the progress ticks on your own want, and last, on
 * your own post whichever way it points, "Take down". Shared with the
 * post's own screen so the two menus never differ.
 *
 * Take down is the second exit a Flare has. "Update progress" marks
 * copies found and the Feed says so; Take down withdraws the cards
 * everywhere, announces nothing, and can be undone for a minute. The
 * website's `PostMenu` ends in the same item.
 *
 * On somebody ELSE's post the last items are "Report" and "Block"
 * instead: the report sheet, filed as a post, and the same block the
 * profile offers, so a post you never want to see again is one tap
 * from the post itself (the audit of 2026-10-03). Never on your own;
 * there is nothing to tell the admins about yourself. A post with no
 * player behind it offers no Block, because there is nobody to block.
 */
export function postActions({
  total,
  yours,
  direction,
  onViewAll,
  onProgress,
  onTakeDown,
  onReport,
  onBlock,
}: {
  total: number;
  yours: boolean;
  direction: "want" | "showcase";
  onViewAll?: () => void;
  onProgress?: () => void;
  /** "Take down", on your own post. */
  onTakeDown?: () => void;
  /** "Report", on somebody else's. */
  onReport?: () => void;
  /** "Block", on somebody else's, after Report. */
  onBlock?: () => void;
}): ActionItem[] {
  const items: ActionItem[] = [];
  if (total > 1 && onViewAll) {
    items.push({
      key: "cards",
      label: `View all ${total} cards`,
      icon: "list-outline",
      onPress: onViewAll,
    });
  }
  if (yours && direction === "want" && onProgress) {
    items.push({
      key: "progress",
      label: "Update progress",
      icon: "checkmark-done-outline",
      onPress: onProgress,
    });
  }
  if (yours && onTakeDown) {
    items.push({
      key: "take-down",
      label: "Take down",
      icon: "trash-outline",
      onPress: onTakeDown,
    });
  }
  if (!yours && onReport) {
    items.push({
      key: "report",
      label: "Report",
      icon: "flag-outline",
      onPress: onReport,
    });
  }
  if (!yours && onBlock) {
    items.push({
      key: "block",
      label: "Block",
      icon: "ban-outline",
      onPress: onBlock,
    });
  }
  return items;
}

export function FlareFeedCard({
  item,
  post,
  onOpenProfile,
  onLike,
  onOpenThread,
  onShare,
  onViewAll,
  onProgress,
  onTakeDown,
  onReport,
  onBlock,
  onOpenHunt,
  picks,
  onPicks,
}: {
  item: Hunt;
  post: PostRef;
  /** This post's offer in progress, flareId -> copies, kept by the Feed screen. */
  picks: ZoomPicks;
  onPicks: (next: ZoomPicks) => void;
  onOpenProfile: (playerId: string) => void;
  onLike: (liked: boolean) => Promise<unknown>;
  onOpenThread: () => void;
  /** The paper plane: send this post to people you follow. */
  onShare?: () => void;
  /** "View all 3": the full list, to read. */
  onViewAll?: () => void;
  /** "Update progress", on your own post. */
  onProgress?: () => void;
  /** "Take down", on your own post: withdrawn everywhere, nothing announced. */
  onTakeDown?: () => void;
  /** "Report", on somebody else's post: the report sheet. */
  onReport?: () => void;
  /** "Block", on somebody else's post: the profile's confirm, then they are gone. */
  onBlock?: () => void;
  /** "View hunt", when the post belongs to one. */
  onOpenHunt?: (huntId: string) => void;
}) {
  const direction = item.direction ?? "want";
  const lead = item.cards[0];
  const single = item.total === 1 && lead;
  const shelf = shelfFor(item.cards, post);
  const completed = item.completed ?? false;
  const [menu, setMenu] = useState(false);
  /* Whether the post's review is up over the Feed (the viewer draws
     its own while it is open). The picks themselves are the post's. */
  const [reviewing, setReviewing] = useState(false);
  const inOffer = Object.keys(picks).length;
  const actions = postActions({
    total: item.total,
    yours: item.yours,
    direction,
    onViewAll,
    onProgress,
    onTakeDown,
    onReport,
    onBlock,
  });

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: radius.panel,
        padding: spacing(3),
        paddingBottom: spacing(2),
        gap: spacing(2.5),
      }}
    >
      {/* The header: face, name, the status line; time and distance on
          the right. "Your Flare" is a small label inside this row, never
          a line between posts. */}
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing(3) }}>
        {/*
         * THE FLEX LIVES ON THIS WRAPPER, NOT ON THE TAP.
         *
         * Tap puts its `style` on the Pressable it animates, but a
         * `flex: 1` there once landed on an inner view and the name
         * column collapsed to nothing. The same trap is written up in
         * src/collapsing-header.tsx, where it swallowed the search icon.
         */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Tap
            onPress={() => onOpenProfile(item.playerId)}
            accessibilityLabel={`Open ${item.displayName}'s profile`}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing(2.5),
            }}
          >
            <PlayerAvatar
              displayName={item.displayName}
              seed={item.playerId}
              avatarUrl={item.avatarUrl}
              frame={item.frame}
              ring={item.ring}
              size={34}
            />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing(1.5),
                }}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    color: colors.textPrimary,
                    fontSize: 17,
                    fontWeight: "800",
                    flexShrink: 1,
                  }}
                >
                  {item.displayName}
                </Text>
                {item.playerId === null ? <GuestChip /> : null}
                {item.yours ? (
                  <Text
                    maxFontSizeMultiplier={1.3}
                    style={{
                      color: colors.textMuted,
                      fontSize: 11,
                      fontWeight: "700",
                      letterSpacing: 0.6,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 999,
                      paddingHorizontal: 6,
                      paddingVertical: 1,
                      overflow: "hidden",
                    }}
                  >
                    YOUR FLARE
                  </Text>
                ) : null}
              </View>
              <FlareStatus
                label={statusLabel(item)}
                done={completed}
                /* No count beside a hunt's pill: the two did not fit one
                   line, and the strip under the post shows the cards. */
                detail={item.total > 1 && !item.hunt ? cardsLabel(item.total) : null}
                hunt={item.hunt}
                onOpenHunt={onOpenHunt}
              />
            </View>
          </Tap>
        </View>
        {/* One line, not a stacked block: the time and the distance as
            muted facts with dots between, then the three dots when the
            post has extras to offer. The room moved to the line above
            the actions, where it has the width to be read whole. */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            flexShrink: 1,
            maxWidth: "50%",
          }}
        >
          {item.postedAt ? (
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              {agoFrom(item.postedAt)}
            </Text>
          ) : null}
          {typeof item.milesAway === "number" ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
              {item.postedAt ? (
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>·</Text>
              ) : (
                <Ionicons name="location-outline" size={13} color={colors.textMuted} />
              )}
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                {awayLabel(item.milesAway)}
              </Text>
            </View>
          ) : null}
          {actions.length > 0 ? (
            <View style={{ marginLeft: spacing(1) }}>
              <DotsButton onPress={() => setMenu(true)} label="More about this post" />
            </View>
          ) : null}
        </View>
      </View>
      <ActionSheet items={menu ? actions : null} onClose={() => setMenu(false)} />

      {/* No row of chips here. The status line above already says which
          way the post points, and the founder read "Looking for" twice
          on every post. Same on the website. */}

      {/* The card and what is asked of it. Several cards are the same
          row, swiped, with the next one peeking in. */}
      {single ? (
        <FlareCardSlide
          card={lead}
          direction={direction}
          post={post}
          siblings={shelf}
          position={0}
          picks={picks}
          onPicks={onPicks}
        />
      ) : (
        <FlareStrip
          cards={item.cards}
          total={item.total}
          direction={direction}
          post={post}
          picks={picks}
          onPicks={onPicks}
          onSeeAll={onViewAll}
          bleed={spacing(3)}
        />
      )}

      {/* "2 in your offer · Review": the picks stay in sight while the
          viewer is closed, and Review is the door straight to them. */}
      {inOffer > 0 ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(1.5) }}>
          <Ionicons name="checkmark-circle" size={15} color={colors.accent} />
          <Text
            style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "600" }}
          >
            {inYourOfferLine(inOffer)}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>·</Text>
          <Tap
            onPress={() => setReviewing(true)}
            hitSlop={8}
            accessibilityLabel="Review your offer"
          >
            <Text style={{ color: colors.accent, fontSize: 13, fontWeight: "700" }}>
              Review
            </Text>
          </Tap>
        </View>
      ) : null}
      {/* Stays up after the send, with the picks cleared, so "Sent" is
          read; taking the last line out closes it from inside. */}
      {reviewing ? (
        <OfferReviewSheet
          postId={post.postId}
          posterName={post.posterName ?? item.displayName}
          lines={Object.entries(picks).map(([flareId, quantity]) => {
            const card = item.cards.find((entry) => entry.flareId === flareId);
            return {
              flareId,
              name: card?.cardName ?? "one card",
              imageUrl: card?.imageUrl ?? null,
              printingLabel: card?.printingLabel ?? null,
              quantity,
              max: card ? remainingOf(card) : 1,
            };
          })}
          onChange={(flareId, quantity) => {
            const next = { ...picks };
            if (quantity <= 0) delete next[flareId];
            else next[flareId] = quantity;
            onPicks(next);
          }}
          /* The same door the viewer sends through: the post's, which
             marks the cards offered at once and reloads behind it. */
          send={async (items, note) =>
            (await post.offer(items, note)) ?? { offered: items.length, refused: [] }
          }
          onSent={() => onPicks({})}
          onClose={() => setReviewing(false)}
        />
      ) : null}

      {/* No "All found" or "All gone" row: a finished post says it in
          its status line, where the crosshair became a check. */}

      {/* What they wrote with it, once, in the quiet colour. Nothing at
          all when they wrote nothing: no empty row. */}
      {item.note ? (
        <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>
          {item.note}
        </Text>
      ) : null}

      {/* No hunt row: the hunt is named in the status line and opens
          from there ("is hunting Ace <3"). No room line either: the
          store a post was made in used to be named here; the founder:
          "kinda redundant. remove that type of... CTA everywhere". */}

      {/* No offer button: a tap on any card opens the zoom with "I have
          this card" in it, as on compact. The founder: "no need for i
          have these button at all". */}
      <PostSocialRow
        likes={item.likes ?? 0}
        liked={item.liked ?? false}
        comments={item.comments ?? 0}
        offers={item.offers ?? 0}
        onLike={onLike}
        onOpenThread={onOpenThread}
        onShare={onShare}
      />
    </View>
  );
}
