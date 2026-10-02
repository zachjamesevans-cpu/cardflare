import { useState } from "react";
import { Text, View, useWindowDimensions } from "react-native";

import type { ProfileFlare } from "./api";
import { colors, gutter, spacing } from "./theme";
import { CardImage, Muted, Tap, type ZoomCard } from "./ui";

/**
 * A profile's Flares as a grid: the app's half of
 * src/components/players/profile-flares.tsx, same count line, same
 * tiles, same words.
 *
 * No heading of its own: the Flares tab in the strip above is the
 * heading. A small count line sits at the top, the same number the
 * header's Flares stat shows, and the grid under it is the whole
 * list, three across, newest first: a profile with sixty Flares
 * scrolls. Each tile is the one card viewer every shelf uses, with a
 * tiny chip at the foot saying which way the Flare points. Nothing
 * to offer on from here; the Feed and the room are where a Flare is
 * answered.
 */

/** The space between tiles, and how many sit across. */
const GAP = spacing(2);
const ACROSS = 3;

/** "7 Flares", "1 Flare". */
export function flaresCountLine(count: number): string {
  return `${count} ${count === 1 ? "Flare" : "Flares"}`;
}

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
     measurement lands, the page's width inside its gutters. */
  const [measured, setMeasured] = useState(0);
  const across = measured > 0 ? measured : window.width - 2 * gutter;
  const width = Math.floor((across - (ACROSS - 1) * GAP) / ACROSS);

  const shelf: ZoomCard[] = flares.map((flare) => ({
    imageUrl: flare.imageUrl,
    name: flare.cardName,
    cardNumber: flare.cardNumber,
    caption: flare.printingLabel,
    lookingFor: flare.quantity,
    direction: flare.direction === "want" ? "want" : "showcase",
  }));

  return (
    <View
      style={{ gap: spacing(3) }}
      onLayout={(event) => setMeasured(Math.floor(event.nativeEvent.layout.width))}
    >
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>
        {flaresCountLine(flares.length)}
      </Text>

      {flares.length === 0 ? (
        yours ? (
          <View style={{ gap: spacing(1) }}>
            <Muted>No Flares up. Post one from the Flare tab.</Muted>
            {onPost ? (
              <Tap onPress={onPost} accessibilityLabel="Post a Flare">
                <Text style={{ color: colors.accent, fontSize: 13, fontWeight: "600" }}>
                  Post a Flare
                </Text>
              </Tap>
            ) : null}
          </View>
        ) : (
          <Muted>No Flares up.</Muted>
        )
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: GAP }}>
          {flares.map((flare, index) => (
            <View key={flare.id} style={{ width, gap: spacing(1) }}>
              <CardImage
                imageUrl={flare.imageUrl}
                width={width}
                name={flare.cardName}
                cardNumber={flare.cardNumber}
                caption={flare.printingLabel}
                lookingFor={flare.quantity}
                direction={flare.direction === "want" ? "want" : "showcase"}
                siblings={shelf}
                position={index}
              />
              {/* Which way it points, in the two words the whole product
                  uses for a Flare's direction. */}
              <View
                style={{
                  alignSelf: "flex-start",
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor:
                    flare.direction === "want" ? colors.accent : colors.border,
                  backgroundColor:
                    flare.direction === "want" ? colors.accent : colors.elevated,
                  paddingHorizontal: spacing(1.5),
                  paddingVertical: 1,
                }}
              >
                <Text
                  style={{
                    color:
                      flare.direction === "want"
                        ? colors.accentContrast
                        : colors.textSecondary,
                    fontSize: 9,
                    fontWeight: "700",
                  }}
                >
                  {flare.direction === "want" ? "Looking for" : "Offering"}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
