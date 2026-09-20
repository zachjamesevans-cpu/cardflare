import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Text, View } from "react-native";

import type { FeedEntry } from "./api";
import { cardsLabel, doneLabel } from "./flare-copy";
import { FlareCardSlide, FlareCarousel, shelfFor } from "./flare-deck-pager";
import { GuestChip } from "./feed-person";
import { PlayerAvatar } from "./player-avatar";
import { PostSocialRow, type PostRef } from "./post-social";
import { colors, radius, spacing } from "./theme";
import { Button, Tap } from "./ui";

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
 * the card opens the same zoom with "I have this" inside it, the heart
 * and the bubble are the post's own, and the paper plane opens the same
 * conversation Local opens. New here: "Offer cards" for several at
 * once, "Update progress" on your own, and the hunt a post belongs to.
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
 * What the person did, in the words the board uses.
 *
 * A Flare points one of two ways: wanted, or offered up. Everything in
 * the Feed used to be a want, so the line was a constant, and a
 * showcase post reading "is looking for" would have been backwards.
 * "Looking for" and "Offering" are the two directions everywhere, the
 * same words the composer's control uses.
 */
export function statusLabel(item: Pick<Hunt, "direction">): string {
  return item.direction === "showcase" ? "is offering" : "is looking for";
}

/**
 * The crosshair and the words: CardFlare's status line.
 *
 * A targeting reticle in the accent with a faint glow behind it, then
 * "is looking for" in the same green. Meant to be the recognisable mark of
 * a Flare wherever one is drawn, so it is one component and nothing
 * else draws the pair.
 */
export function FlareStatus({
  label = "is looking for",
  detail,
}: {
  label?: string;
  /** "3 cards", in the quiet colour after the status. */
  detail?: string | null;
}) {
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
      <Text style={{ color: colors.accent, fontSize: 14, fontWeight: "600" }}>
        {label}
      </Text>
      {detail ? (
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>{`· ${detail}`}</Text>
      ) : null}
    </View>
  );
}

/** Want, Trade, Cash ok: the primary one filled, the rest outlined. */
export function FlareTypeChip({
  label,
  primary = false,
}: {
  label: string;
  primary?: boolean;
}) {
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

/**
 * The buttons under a post's cards, decided by whose post it is and
 * which way it points. Shared with the post's own screen so the two
 * never offer different things.
 */
export function FlareActions({
  yours,
  direction,
  completed,
  onOffer,
  onProgress,
}: {
  yours: boolean;
  direction: "want" | "showcase";
  completed: boolean;
  onOffer?: () => void;
  onProgress?: () => void;
}) {
  if (direction === "showcase") return null;
  if (yours) {
    return onProgress ? (
      <Button
        label={completed ? "All found · Update progress" : "Update progress"}
        variant="secondary"
        onPress={onProgress}
      />
    ) : null;
  }
  if (completed) {
    return (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: spacing(1.5),
          paddingVertical: spacing(2),
        }}
      >
        <Ionicons name="checkmark-circle" size={16} color={colors.accent} />
        <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "600" }}>
          All found
        </Text>
      </View>
    );
  }
  return onOffer ? <Button label="Offer cards" onPress={onOffer} /> : null;
}

export function FlareFeedCard({
  item,
  post,
  onOpenProfile,
  onLike,
  onOpenThread,
  onMessage,
  onEnterRoom,
  onOffer,
  onViewAll,
  onProgress,
  onOpenHunt,
}: {
  item: Hunt;
  post: PostRef;
  onOpenProfile: (playerId: string) => void;
  onLike: (liked: boolean) => Promise<unknown>;
  onOpenThread: () => void;
  /** Absent on your own post: there is nobody to message. */
  onMessage?: () => void;
  onEnterRoom: (code: string) => void;
  /** "Offer cards": the full list, in select mode. Never shown to the owner. */
  onOffer?: () => void;
  /** "View all 3": the full list, to read. */
  onViewAll?: () => void;
  /** "Update progress", on your own post. */
  onProgress?: () => void;
  /** "View hunt", when the post belongs to one. */
  onOpenHunt?: (huntId: string) => void;
}) {
  const direction = item.direction ?? "want";
  const lead = item.cards[0];
  const single = item.total === 1 && lead;
  const shelf = shelfFor(item.cards, post);
  const completed = item.completed ?? false;

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: radius.panel,
        padding: spacing(3),
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
                label={statusLabel(item)}
                detail={item.total > 1 ? cardsLabel(item.total) : null}
              />
            </View>
          </Tap>
        </View>
        {/* One line, not a stacked block: two muted facts with a dot. */}
        <View
          style={{ flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 0 }}
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
        </View>
      </View>

      {/* Which way it points and what they will do for it. Post-level,
          because they are true of every card in it. */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing(1.5) }}>
        <FlareTypeChip
          label={direction === "showcase" ? "Offering" : "Looking for"}
          primary
        />
        {item.acceptsTrade !== false ? <FlareTypeChip label="Trade" /> : null}
        {item.acceptsCash ? <FlareTypeChip label="Cash ok" /> : null}
      </View>

      {/* The card and what is asked of it. Several cards are the same
          row, swiped, with the next one peeking in. */}
      {single ? (
        <FlareCardSlide
          card={lead}
          direction={direction}
          post={post}
          siblings={shelf}
          position={0}
        />
      ) : (
        <FlareCarousel
          cards={item.cards}
          total={item.total}
          direction={direction}
          post={post}
          remainingCopies={item.remainingCopies}
          onViewAll={onViewAll}
        />
      )}

      {/* An offer with nothing left to give, said once. A want that is
          done says "All found" in its actions row below. */}
      {completed && item.direction === "showcase" ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(1.5) }}>
          <Ionicons name="checkmark-circle" size={16} color={colors.accent} />
          <Text style={{ color: colors.accent, fontSize: 14, fontWeight: "700" }}>
            {doneLabel("showcase")}
          </Text>
        </View>
      ) : null}

      {/* What they wrote with it, once, in the quiet colour. Nothing at
          all when they wrote nothing: no empty row. */}
      {item.note ? (
        <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>
          {item.note}
        </Text>
      ) : null}

      {/* The hunt this post is part of, and the door to it. */}
      {item.hunt ? (
        <Tap
          onPress={onOpenHunt ? () => onOpenHunt(item.hunt?.id ?? "") : undefined}
          accessibilityLabel={`View hunt ${item.hunt.name}`}
          style={{ flexDirection: "row", alignItems: "center", gap: spacing(1.5) }}
        >
          <Ionicons name="locate-outline" size={14} color={colors.accent} />
          <Text
            numberOfLines={1}
            style={{ color: colors.textSecondary, fontSize: 13, flexShrink: 1 }}
          >
            {item.hunt.name}
          </Text>
          {onOpenHunt ? (
            <Text style={{ color: colors.accent, fontSize: 13, fontWeight: "700" }}>
              · View hunt
            </Text>
          ) : null}
        </Tap>
      ) : null}

      <FlareActions
        yours={item.yours}
        direction={direction}
        completed={completed}
        onOffer={onOffer}
        onProgress={onProgress}
      />

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
