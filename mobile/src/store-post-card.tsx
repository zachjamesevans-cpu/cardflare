import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useState } from "react";
import { Text, View } from "react-native";

import type { FeedEntry } from "./api";
import { agoFrom } from "./flare-feed-card";
import { PostSocialRow } from "./post-social";
import { RemoteImage } from "./remote-image";
import { colors, radius, spacing } from "./theme";
import { Button, Tap } from "./ui";
import { VerifiedMark } from "./verified-mark";

/**
 * A store's post on the Feed, drawn as the post a Flare is.
 *
 * The founder: "a store announcing 'OP-12 prerelease Saturday, 20
 * seats' as a Flare-shaped post to its followers. This is the thing
 * that makes following worth it." The website's card, drawn natively
 * (src/components/feed/store-post-card.tsx): the logo where the face
 * goes, the store's name with its Verified mark, "posted an update" in
 * the accent where a Flare says "is hunting", the time on the right.
 * Then the picture when there is one, the title, the words, and when
 * the post is about an event night, "I'll be there" with how many
 * already are. The heart and the bubble are the same ones every post
 * has.
 */

type StorePost = Extract<FeedEntry, { kind: "storePost" }>;

/** "Opens Friday, Oct 3, 7:00 PM", in the store's own clock. */
export function opensAtLabel(iso: string, timeZone: string): string {
  return `Opens ${new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso))}`;
}

/** "Saturday, Oct 4 · 12:00 PM": when the night is. */
export function eventDateLabel(iso: string, timeZone: string): string {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone,
  }).format(date);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(date);
  return `${day} · ${time}`;
}

export function goingLabel(count: number): string {
  return `${count} going`;
}

/** The logo, a rounded square, or the storefront glyph for a shop with none. */
export function StoreLogo({
  uri,
  size = 44,
}: {
  uri: string | null | undefined;
  size?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.27),
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.elevated,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {uri ? (
        <RemoteImage uri={uri} style={{ width: size, height: size }} />
      ) : (
        <MaterialCommunityIcons
          name="storefront-outline"
          size={Math.round(size * 0.5)}
          color={colors.textMuted}
        />
      )}
    </View>
  );
}

/** The header every store post wears, on the Feed and on its own screen. */
export function StorePostHeader({
  name,
  logoUrl,
  verified,
  postedAt,
  onOpenStore,
}: {
  name: string;
  logoUrl: string | null;
  verified: boolean;
  postedAt: string;
  onOpenStore: () => void;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing(3) }}>
      {/* The flex lives on this wrapper, not on the Tap; see flare-feed-card. */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Tap
          onPress={onOpenStore}
          accessibilityLabel={`Open ${name}`}
          style={{ flexDirection: "row", alignItems: "center", gap: spacing(2.5) }}
        >
          <StoreLogo uri={logoUrl} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: spacing(1.5) }}
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
                {name}
              </Text>
              {verified ? <VerifiedMark size={16} /> : null}
            </View>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: spacing(1.5) }}
            >
              <MaterialCommunityIcons
                name="bullhorn-outline"
                size={17}
                color={colors.accent}
              />
              <Text style={{ color: colors.accent, fontSize: 14, fontWeight: "600" }}>
                posted an update
              </Text>
            </View>
          </View>
        </Tap>
      </View>
      <Text style={{ color: colors.textMuted, fontSize: 13, flexShrink: 0 }}>
        {agoFrom(postedAt)}
      </Text>
    </View>
  );
}

/** The picture, the title and the words: what the store said. */
export function StorePostBody({
  title,
  body,
  imageUrl,
}: {
  title: string;
  body: string | null;
  imageUrl: string | null;
}) {
  return (
    <>
      {imageUrl ? (
        <RemoteImage
          uri={imageUrl}
          style={{
            width: "100%",
            aspectRatio: 16 / 9,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.elevated,
          }}
        />
      ) : null}
      <View style={{ gap: spacing(1) }}>
        <Text
          style={{
            color: colors.textPrimary,
            fontSize: 16,
            fontWeight: "700",
            lineHeight: 21,
          }}
        >
          {title}
        </Text>
        {body ? (
          <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>
            {body}
          </Text>
        ) : null}
      </View>
    </>
  );
}

export function StorePostCard({
  item,
  onOpenStore,
  onLike,
  onOpenThread,
  onRsvp,
}: {
  item: StorePost;
  onOpenStore: (storeId: string) => void;
  onLike: (liked: boolean) => Promise<unknown>;
  onOpenThread: () => void;
  /** "I'll be there": join the board under the account's own name. */
  onRsvp: (code: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [went, setWent] = useState(false);
  const going = item.going || went;

  const rsvp = async () => {
    if (!item.event || busy || going) return;
    setBusy(true);
    try {
      await onRsvp(item.event.code);
      setWent(true);
    } catch {
      // The Room tab shows the truthful state; nothing to add here.
    } finally {
      setBusy(false);
    }
  };

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
      <StorePostHeader
        name={item.storeName}
        logoUrl={item.logoUrl}
        verified={item.verified}
        postedAt={item.postedAt}
        onOpenStore={() => onOpenStore(item.storeId)}
      />

      <StorePostBody title={item.title} body={item.body} imageUrl={item.imageUrl} />

      {/* The event night it is about: "I'll be there" while the board is
          taking Flares, and when it will be until then. */}
      {item.event ? (
        <View
          style={{
            gap: spacing(2),
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.elevated,
            padding: spacing(3),
          }}
        >
          <View style={{ gap: 2 }}>
            <Text
              numberOfLines={1}
              style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "600" }}
            >
              {item.event.name}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="calendar-outline" size={13} color={colors.textMuted} />
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                {eventDateLabel(item.event.startsAt, item.event.timeZone)}
              </Text>
            </View>
          </View>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              flexWrap: "wrap",
              gap: spacing(3),
            }}
          >
            {item.event.open ? (
              <Button
                label={going ? "Going" : "I'll be there"}
                onPress={() => void rsvp()}
                busy={busy}
                disabled={going}
              />
            ) : (
              <Text
                style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "500" }}
              >
                {opensAtLabel(item.event.opensAt, item.event.timeZone)}
              </Text>
            )}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="people-outline" size={16} color={colors.textMuted} />
              <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
                {goingLabel(item.event.playersIn + (went && !item.going ? 1 : 0))}
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      <PostSocialRow
        likes={item.likes}
        liked={item.liked}
        comments={item.comments}
        onLike={onLike}
        onOpenThread={onOpenThread}
      />
    </View>
  );
}
