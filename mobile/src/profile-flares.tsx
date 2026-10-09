import { useState } from "react";
import { Text, View, useWindowDimensions } from "react-native";

import type { ProfileFlare } from "./api";
import { HeldRing } from "./held-ring";
import { QuantityBadge } from "./quantity-badge";
import { PROFILE_INSET } from "./profile-tabs";
import { colors, spacing } from "./theme";
import { CardImage, Muted, Tap, type ZoomCard } from "./ui";

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

export function ProfileFlares({
  flares,
  yours,
  onPost,
}: {
  flares: ProfileFlare[];
  yours: boolean;
  /** The Flare tab, for the owner's empty state. */
  onPost?: () => void;
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
          <View style={{ gap: spacing(1), paddingHorizontal: PROFILE_INSET }}>
            <Muted>No Flares yet. Tap + on the Feed to post one.</Muted>
            {onPost ? (
              <Tap onPress={onPost} accessibilityLabel="Post a Flare">
                <Text style={{ color: colors.accent, fontSize: 13, fontWeight: "600" }}>
                  Post a Flare
                </Text>
              </Tap>
            ) : null}
          </View>
        ) : (
          <View style={{ paddingHorizontal: PROFILE_INSET }}>
            <Muted>No Flares yet.</Muted>
          </View>
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
              <HeldRing match={flare.match} inset corner="right" />
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
