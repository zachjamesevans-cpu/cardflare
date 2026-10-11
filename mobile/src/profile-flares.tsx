import { Ionicons } from "@expo/vector-icons";
import { useState, type ReactNode } from "react";
import { Text, View, useWindowDimensions } from "react-native";

import type { ProfileFlare } from "./api";
import { HeldRing } from "./held-ring";
import { QuantityBadge } from "./quantity-badge";
import { PROFILE_INSET } from "./profile-tabs";
import { colors, spacing } from "./theme";
import { Button, CardImage, type ZoomCard } from "./ui";

/**
 * A profile's Flares as a grid: the app's half of
 * src/components/players/profile-flares.tsx, same count line, same
 * tiles, same words.
 *
 * No heading of its own: the Flares tab in the strip above is the
 * heading. A small count line sits at the top, the same number the
 * header's Flares stat shows, and the grid under it is the whole
 * list, three across, newest first, except that a want in the
 * viewer's binder comes first and wears the green ring: a profile with
 * sixty Flares scrolls. Each tile is the one card viewer every shelf
 * uses. A want wears no label (the founder: "Delete the 'looking for'
 * part on all cards. Seems kinda redundant when they know it's for
 * flares."); a showcase keeps a small "Offering" chip at the foot, so
 * a mixed grid still tells the two apart. More than one copy is the
 * quantity tag in the top-left corner, the binder's. Nothing to offer on from here;
 * the Feed and the room are where a Flare is answered.
 */

/** The space between tiles, and how many sit across. */
/* A hairline between tiles, the way a social grid draws them. */
const GAP = 2;
const ACROSS = 3;

/**
 * The Flares a profile shows: the cards still being looked for. The
 * server sends offers in the same list; those are the TRADES binder's
 * business now, and found cards never arrive (they are Trades' history).
 */
export const stillWanted = (flares: ProfileFlare[] | null | undefined): ProfileFlare[] =>
  (flares ?? []).filter((flare) => flare.direction === "want");

/**
 * An empty profile tab, said with a next step rather than a dead end:
 * an icon, a line, a sentence, one action. The founder: "what do we do
 * about profiles who dont have flares? thinking of a CTA on their page".
 */
export function ProfileEmpty({
  icon,
  title,
  body,
  action,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <View
      style={{
        alignItems: "center",
        gap: spacing(2),
        paddingTop: spacing(8),
        paddingHorizontal: PROFILE_INSET + spacing(2),
      }}
    >
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: 26,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.elevated,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={icon} size={24} color={colors.accent} />
      </View>
      <Text
        style={{
          color: colors.textPrimary,
          fontSize: 17,
          fontWeight: "700",
          textAlign: "center",
        }}
      >
        {title}
      </Text>
      <Text
        style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20, textAlign: "center" }}
      >
        {body}
      </Text>
      {action ? <View style={{ alignSelf: "stretch", marginTop: spacing(2) }}>{action}</View> : null}
    </View>
  );
}

export function ProfileFlares({
  flares,
  yours,
  onPost,
  ownerName,
  following = false,
  onAsk,
  followButton,
}: {
  flares: ProfileFlare[];
  yours: boolean;
  /** The Flare tab, for the owner's empty state. */
  onPost?: () => void;
  /** Whose they are, for a visitor's empty state. */
  ownerName?: string;
  /** The visitor follows them: their next Flare reaches the Feed. */
  following?: boolean;
  /** "Ask what they're after": a message with the question already in it. */
  onAsk?: () => void;
  /** The Follow button, for a visitor who does not follow them yet. */
  followButton?: ReactNode;
}) {
  const window = useWindowDimensions();
  /* The grid is as wide as the pane it sits in, measured; until the
     measurement lands, the screen's whole width, since the pane runs
     edge to edge. */
  const [measured, setMeasured] = useState(0);
  const across = measured > 0 ? measured : window.width;
  const width = Math.floor((across - (ACROSS - 1) * GAP) / ACROSS);

  const shelf: ZoomCard[] = flares.map((flare) => ({
    imageUrl: flare.imageUrl,
    name: flare.cardName,
    cardNumber: flare.cardNumber,
    caption: flare.printingLabel,
    lookingFor: flare.quantity,
    direction: flare.direction === "want" ? "want" : "showcase",
    youHave: flare.match ? { kind: flare.match, count: 0 } : null,
  }));

  return (
    <View
      style={{ gap: spacing(3) }}
      onLayout={(event) => setMeasured(Math.floor(event.nativeEvent.layout.width))}
    >
      {/* No "41 Flares" line over the grid: the header's Flares number
          already says it. The founder: "notice how the text below flare
          icon? just delete that entirely". An empty profile says so in
          the pane instead. Words keep their distance from the edge; only
          the grid runs to it. */}
      {flares.length === 0 ? (
        yours ? (
          <ProfileEmpty
            icon="flame-outline"
            title="What are you hunting?"
            body="Post a Flare for a card you want, and players near you who have it can raise a hand."
            action={onPost ? <Button label="Post a Flare" onPress={onPost} /> : undefined}
          />
        ) : (
          <ProfileEmpty
            icon="flame-outline"
            title={`${ownerName ?? "They"} ${ownerName ? "isn’t" : "aren’t"} looking for anything right now.`}
            body={
              following
                ? "When they post a Flare, you’ll see it in your Following feed."
                : `Follow ${ownerName ?? "them"} to see their next Flare in your feed.`
            }
            action={
              following
                ? onAsk
                  ? <Button label="Ask what they’re after" variant="secondary" onPress={onAsk} />
                  : undefined
                : followButton
            }
          />
        )
      ) : (
        /* A grid the way a social profile draws one: three across, a
           hairline between tiles, nothing under them. Only an offer
           wears a chip at the foot. */
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: GAP }}>
          {flares.map((flare, index) => (
            <View key={flare.id} style={{ width }}>
              <CardImage
                imageUrl={flare.imageUrl}
                width={width}
                name={flare.cardName}
                cardNumber={flare.cardNumber}
                caption={flare.printingLabel}
                lookingFor={flare.quantity}
                direction={flare.direction === "want" ? "want" : "showcase"}
                youHave={flare.match ? { kind: flare.match, count: 0 } : null}
                siblings={shelf}
                position={index}
              />
              {/* A want in your binder. Inset, because the grid runs tile
                  to tile; the icon top right, because the copies tag owns
                  top left. */}
              <HeldRing match={flare.match} inset />
              <QuantityBadge
                quantity={flare.quantity}
                style={{ position: "absolute", top: 4, left: 4 }}
              />
              {/* Only an offer is labelled; a want is what a Flare is. */}
              {flare.direction === "want" ? null : (
                <View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    left: 4,
                    bottom: 4,
                    borderRadius: 4,
                    backgroundColor: colors.scrim,
                    paddingHorizontal: 4,
                    paddingVertical: 1,
                  }}
                >
                  <Text
                    maxFontSizeMultiplier={1.3}
                    style={{
                      color: colors.textSecondary,
                      fontSize: 11,
                      fontWeight: "700",
                    }}
                  >
                    Offering
                  </Text>
                </View>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
