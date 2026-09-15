import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Text, useWindowDimensions, View } from "react-native";

import type { FeedEntry } from "./api";
import { GuestChip } from "./feed-person";
import { FlareDeckPager } from "./flare-deck-pager";
import { PlayerAvatar } from "./player-avatar";
import { PostSocialRow, haveFor, type PostRef } from "./post-social";
import { colors, radius, spacing } from "./theme";
import { Button, CardImage, Tap, type ZoomCard } from "./ui";

/**
 * One Flare on the Feed, drawn as a post.
 *
 * The founder's redesign: the card is the headline, then its name, then
 * who is hunting it, then what they will do for it, then where and when,
 * then the counts. The old row gave its weight to grey space; this one
 * gives it to the card, which is what a trader is scanning for.
 *
 * Every piece of behaviour is the one the Feed already had: the tap on
 * the card opens the same zoom with "I have this" inside it, the heart
 * and the bubble are the post's own, and the paper plane opens the same
 * conversation Local opens.
 */

type Hunt = Extract<FeedEntry, { kind: "hunt" }>;

/** How long ago, in the shortest true form. */
export function agoFrom(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** "2.1 mi away", or "nearby" under a mile. */
export function awayLabel(miles: number): string {
  if (miles < 1) return "nearby";
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi away`;
}

/**
 * The crosshair and the words: CardFlare's status line.
 *
 * A targeting reticle in the accent with a faint glow behind it, then
 * "is hunting" in the same green. Meant to be the recognisable mark of
 * a Flare wherever one is drawn, so it is one component and nothing
 * else draws the pair.
 */
export function FlareStatus({ label = "is hunting" }: { label?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(1.5) }}>
      <View
        style={{
          shadowColor: colors.accent,
          shadowOpacity: 0.7,
          shadowRadius: 5,
          shadowOffset: { width: 0, height: 0 },
        }}
      >
        <MaterialCommunityIcons name="crosshairs" size={17} color={colors.accent} />
      </View>
      <Text style={{ color: colors.accent, fontSize: 14, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}

/** Want, Trade, Cash ok: the primary one filled, the rest outlined. */
export function FlareTypeChip({ label, primary = false }: { label: string; primary?: boolean }) {
  return (
    <View
      style={{
        borderRadius: 999,
        borderWidth: 1,
        borderColor: primary ? colors.accent : colors.borderStrong,
        backgroundColor: primary ? colors.accent : "transparent",
        paddingHorizontal: spacing(3),
        paddingVertical: spacing(1),
      }}
    >
      <Text
        style={{
          color: primary ? colors.accentContrast : colors.textSecondary,
          fontSize: 12,
          fontWeight: "700",
        }}
      >
        {label}
      </Text>
    </View>
  );
}

export function FlareFeedCard({
  item,
  post,
  onOpenProfile,
  onLike,
  onOpenThread,
  onMessage,
  onEnterRoom,
}: {
  item: Hunt;
  post: PostRef;
  onOpenProfile: (playerId: string) => void;
  onLike: (liked: boolean) => Promise<unknown>;
  onOpenThread: () => void;
  /** Absent on your own post: there is nobody to message. */
  onMessage?: () => void;
  onEnterRoom: (code: string) => void;
}) {
  const window = useWindowDimensions();
  /*
   * The card takes a real share of the row on any phone, and stops
   * growing on a tablet so the details keep their column.
   *
   * SMALLER THAN IT WAS. At 0.42 of the row the art stood about 235pt
   * tall while the name, number and two chips beside it needed barely
   * ninety - so every post carried a column of black down its right
   * hand side. The founder: "notice how the cards are so large and
   * there's a lot of dead space? lessen card size a bit so it looks
   * better."
   *
   * A third of the row is still big enough to read a card at a glance,
   * which is what this picture is for, and it takes roughly fifty
   * points of nothing out of every post in the feed.
   */
  const cardWidth = Math.round(
    Math.min(132, Math.max(104, (window.width - spacing(16)) * 0.34)),
  );

  const lead = item.cards[0];
  const single = item.total === 1 && lead;
  const shelf: ZoomCard[] = item.cards.map((card) => ({
    imageUrl: card.imageUrl,
    name: card.cardName,
    cardNumber: card.cardNumber,
    youHave: card.match ? { kind: card.match, count: 0 } : null,
    have: haveFor(card, post),
  }));

  const chips = (
    <>
      <FlareTypeChip label="Want" primary />
      {item.acceptsTrade !== false ? <FlareTypeChip label="Trade" /> : null}
      {item.acceptsCash ? <FlareTypeChip label="Cash ok" /> : null}
    </>
  );

  const details = (
    <View style={{ flex: 1, gap: spacing(2), minWidth: 0 }}>
      {single ? (
        <View style={{ gap: 2 }}>
          <Text
            numberOfLines={2}
            style={{ color: colors.textPrimary, fontSize: 18, fontWeight: "800" }}
          >
            {lead.cardName}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 14 }}>{lead.cardNumber}</Text>
        </View>
      ) : (
        <View style={{ gap: 2 }}>
          <Text
            numberOfLines={2}
            style={{ color: colors.textPrimary, fontSize: 18, fontWeight: "800" }}
          >
            {item.deckLabel ?? `${item.total} cards`}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
            {item.deckLabel ? `${item.total} cards` : "One hunt"}
          </Text>
        </View>
      )}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing(1.5) }}>
        {chips}
      </View>

      {single && lead.match ? (
        <Text style={{ color: colors.accent, fontSize: 13, fontWeight: "600" }}>
          {lead.match === "exact" ? "You have this" : "You have another printing"}
        </Text>
      ) : null}
      {single && lead.state === "found" ? (
        <Text style={{ color: colors.accent, fontSize: 13, fontWeight: "600" }}>Found</Text>
      ) : single && lead.youOffered ? (
        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>You said you have this</Text>
      ) : single && lead.state === "offered" ? (
        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Somebody offered</Text>
      ) : null}
      {!single && item.youCanAnswer > 0 ? (
        <Text style={{ color: colors.accent, fontSize: 13, fontWeight: "600" }}>
          {`You can answer ${item.youCanAnswer} of ${item.total}`}
        </Text>
      ) : null}

      {/* What they wrote with it, in the quiet colour. Nothing at all
          when they wrote nothing: no empty row. */}
      {item.note ? (
        <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>
          {`“${item.note}”`}
        </Text>
      ) : null}
    </View>
  );

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: radius.panel,
        padding: spacing(4),
        gap: spacing(3),
      }}
    >
      {/* The header: face, name, the status line; time and distance on
          the right. "Your Flare" is a small label inside this row, never
          a line between posts. */}
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing(3) }}>
        {/*
          * THE FLEX LIVES ON THIS WRAPPER, NOT ON THE TAP.
          *
          * Tap puts its `style` on an inner Animated.View rather than on
          * the Pressable, so `flex: 1` there never reaches the thing
          * being laid out: the Pressable sized itself to its content,
          * the name column inside it collapsed to nothing, and the post
          * drew a face, a crushed "YOUR FLARE" pill and no name at all.
          * The same trap is written up in src/collapsing-header.tsx,
          * where it swallowed the search icon.
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
            size={44}
          />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(1.5) }}>
              <Text
                numberOfLines={1}
                style={{ color: colors.textPrimary, fontSize: 17, fontWeight: "800", flexShrink: 1 }}
              >
                {item.displayName}
              </Text>
              {item.playerId === null ? <GuestChip /> : null}
              {item.yours ? (
                <Text
                  style={{
                    color: colors.textMuted,
                    fontSize: 10,
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
                label={
                  item.total === 1 ? "is hunting" : `is hunting ${item.total} cards`
                }
              />
            </View>
          </Tap>
        </View>
        <View style={{ alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
          {item.postedAt ? (
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>{agoFrom(item.postedAt)}</Text>
          ) : null}
          {typeof item.milesAway === "number" ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
              <Ionicons name="location-outline" size={13} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                {awayLabel(item.milesAway)}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* The card, big, with its details beside it. A deck keeps its
          rail across the width and the details underneath. */}
      {single ? (
        /* Centred, not top-aligned. The details are shorter than the
           art whatever size it is, and hanging them from the top put
           all of the slack in one block at the bottom - which is what
           read as dead space. Split evenly it reads as breathing room. */
        <View
          style={{ flexDirection: "row", alignItems: "center", gap: spacing(3) }}
        >
          <CardImage
            imageUrl={lead.imageUrl}
            width={cardWidth}
            name={lead.cardName}
            cardNumber={lead.cardNumber}
            youHave={lead.match ? { kind: lead.match, count: 0 } : undefined}
            state={lead.state}
            have={haveFor(lead, post)}
            siblings={shelf}
            position={0}
          />
          {details}
        </View>
      ) : (
        <FlareDeckPager
          cards={item.cards}
          total={item.total}
          post={post}
          chips={chips}
          note={item.note ?? null}
        />
      )}

      {/* A hairline, then the counts. Understated until touched. */}
      <View style={{ height: 1, backgroundColor: colors.border }} />
      <PostSocialRow
        likes={item.likes ?? 0}
        liked={item.liked ?? false}
        comments={item.comments ?? 0}
        offers={item.offers ?? 0}
        onLike={onLike}
        onOpenThread={onOpenThread}
        onMessage={onMessage}
      />

      {/* Every post that HAS a place ends in one. */}
      {item.code && item.storeName ? (
        <Button
          label={`Go to ${item.storeName}`}
          variant="secondary"
          onPress={() => onEnterRoom(item.code ?? "")}
        />
      ) : null}
    </View>
  );
}
