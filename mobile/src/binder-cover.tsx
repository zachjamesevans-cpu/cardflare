import { LinearGradient } from "expo-linear-gradient";
import { Text, View } from "react-native";

import { binderCover, type BinderCoverId } from "./binder-covers";
import { RemoteImage } from "./remote-image";
import { colors } from "./theme";

/**
 * A closed zip binder, seen from the front: the kind of binder people
 * actually carry to a trade night.
 *
 * The one place a cover is drawn in the app, the website's
 * `src/components/binder/binder-cover.tsx` matched piece for piece.
 * The profile panel, the binder screen and the cover swatches all
 * come here, so a cover looks the same wherever it sits.
 *
 * The founder, on the first version: "the binder shouldn't be modeled
 * after a 3 ring binder. I'm attaching a picture of a VaultX binder,
 * which is the most common binder and will be most recognizable." So
 * this is that binder: a matte body in the cover's bright colour, a
 * thin padded spine down the left with straight edges, large rounded
 * corners on the right and small ones on the left, a zipper running
 * along the top, the right side and the bottom with its pull at the
 * top-left where the zip starts, the front card slipped into a clear
 * sleeve on the cover, and the owner's name embossed low on the left.
 * No rings, no window, nothing shiny.
 *
 * Geometry, the same on both platforms: rounded 2 on the left and 10%
 * of the width on the right; the spine 5% wide; the zipper track inset
 * 4% from the top, right and bottom, 2 thick, dashed in the spine
 * colour at 70%; the pull 10% wide and 4% tall in the accent, on the
 * track just right of the spine; the card centred, top at 16%, 50%
 * wide, at a card's 63/88; the label at bottom 9%, left 8%.
 */

export type BinderCoverSize = "lg" | "sm" | "xs";

/* lg 232x300: the binder screen. sm 100x130: the profile panel.
   xs 58x76: lists and swatches. */
const BOX: Record<BinderCoverSize, { width: number; height: number }> = {
  lg: { width: 232, height: 300 },
  sm: { width: 100, height: 130 },
  xs: { width: 58, height: 76 },
};

const LABEL: Record<BinderCoverSize, number> = { lg: 12, sm: 7, xs: 5 };

/** The zipper's track and its pull, drawn in the spine colour at 70%
    and the accent. */
const TRACK = 2;

export function BinderCover({
  cover,
  frontImageUrl,
  label,
  size = "sm",
  plain = false,
}: {
  cover: BinderCoverId;
  /** The front card's picture, or null for an empty sleeve. */
  frontImageUrl: string | null;
  /** The owner's name, or nothing on a swatch. */
  label?: string | null;
  size?: BinderCoverSize;
  /** A swatch: the body, the spine and the zipper, no card and no label. */
  plain?: boolean;
}) {
  const { edge, spine } = binderCover(cover);
  const box = BOX[size];
  const rightRadius = Math.round(box.width * 0.1);
  const inset = Math.round(box.width * 0.04);
  const pull = {
    width: Math.round(box.width * 0.1),
    height: Math.max(3, Math.round(box.height * 0.04)),
  };
  const card = {
    width: Math.round(box.width * 0.5),
    height: Math.round((box.width * 0.5 * 88) / 63),
  };
  const track = {
    position: "absolute" as const,
    borderWidth: 1,
    borderStyle: "dashed" as const,
    borderColor: colors[spine],
    opacity: 0.7,
  };

  return (
    <View
      style={{
        width: box.width,
        height: box.height,
        borderTopLeftRadius: 2,
        borderBottomLeftRadius: 2,
        borderTopRightRadius: rightRadius,
        borderBottomRightRadius: rightRadius,
        overflow: "hidden",
        backgroundColor: colors[edge],
      }}
    >
      {/* The matte: a fine weave on the website, a 6% darkening here,
          so a flat colour still reads as fabric rather than paint. */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          backgroundColor: "rgba(0,0,0,0.06)",
        }}
      />

      {/* The spine: a thin padded strip, straight edges. */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          width: "5%",
          backgroundColor: colors[spine],
        }}
      />

      {/* The zipper: a dashed track along the top, the right side and
          the bottom. Three strips rather than one three-sided border,
          because iOS draws a dashed border only when every side has
          the same width. */}
      <View
        pointerEvents="none"
        style={{ ...track, top: inset, left: "5%", right: inset, height: TRACK }}
      />
      <View
        pointerEvents="none"
        style={{ ...track, top: inset, right: inset, bottom: inset, width: TRACK }}
      />
      <View
        pointerEvents="none"
        style={{ ...track, bottom: inset, left: "5%", right: inset, height: TRACK }}
      />
      {/* The pull, where the zip starts: on the track, just right of
          the spine. */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: inset + TRACK / 2 - pull.height / 2,
          left: "7%",
          width: pull.width,
          height: pull.height,
          borderRadius: pull.height / 2,
          backgroundColor: colors.accent,
        }}
      />

      {/* The front card in a clear sleeve, or the empty sleeve. */}
      {plain ? null : (
        <View
          style={{
            position: "absolute",
            top: "16%",
            left: (box.width - card.width) / 2,
            width: card.width,
            height: card.height,
            borderRadius: 4,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.25)",
            backgroundColor: "rgba(0,0,0,0.6)",
            overflow: "hidden",
          }}
        >
          {frontImageUrl ? (
            <RemoteImage
              uri={frontImageUrl}
              contentFit="cover"
              style={{ width: "100%", height: "100%" }}
            />
          ) : null}
          {/* The sleeve's gloss: a soft white sweep across the top-left. */}
          <LinearGradient
            colors={["rgba(255,255,255,0.18)", "rgba(255,255,255,0)"]}
            locations={[0, 0.45]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            pointerEvents="none"
            style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
          />
        </View>
      )}

      {/* The name, embossed: tone on tone, a hair of light beneath. */}
      {label && !plain ? (
        <Text
          numberOfLines={1}
          style={{
            position: "absolute",
            bottom: "9%",
            left: "8%",
            right: "8%",
            color: colors[spine],
            opacity: 0.85,
            fontSize: LABEL[size],
            fontWeight: "700",
            letterSpacing: 0.3,
            textShadowColor: "rgba(255,255,255,0.12)",
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 0,
          }}
        >
          {label}
        </Text>
      ) : null}
    </View>
  );
}
