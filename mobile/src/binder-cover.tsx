import { LinearGradient } from "expo-linear-gradient";
import { Text, View } from "react-native";

import { binderCover, type BinderCoverId } from "./binder-covers";
import { RemoteImage } from "./remote-image";
import { colors } from "./theme";

/**
 * A closed binder, seen from the front: the spine on the left, the
 * front card in a window, a label along the bottom.
 *
 * The one place a cover is drawn in the app, the website's
 * `src/components/binder/binder-cover.tsx` matched piece for piece.
 * The profile panel, the binder screen and the cover swatches all
 * come here, so a cover looks the same wherever it sits. The founder,
 * starting the binder: "I'm down for the front being a card... a few
 * simple color change options, no animated stuff yet." So a cover is
 * two brand colours, dark at the spine and bright at the edge, and
 * nothing moves.
 *
 * Geometry, the same on both platforms: rounded 4 on the left and 12
 * on the right; a spine strip 9% wide, black at 45%; three ring dots
 * on the spine's edge at 18%, 49% and 80%; the window at left 22%,
 * top 11%, 56% wide and 58% tall; the label at bottom 8%.
 */

export type BinderCoverSize = "lg" | "sm" | "xs";

/* lg 232x300: the binder screen. sm 100x130: the profile panel.
   xs 58x76: lists and swatches. */
const BOX: Record<BinderCoverSize, { width: number; height: number }> = {
  lg: { width: 232, height: 300 },
  sm: { width: 100, height: 130 },
  xs: { width: 58, height: 76 },
};

const DOT: Record<BinderCoverSize, number> = { lg: 10, sm: 8, xs: 6 };

const LABEL: Record<BinderCoverSize, { fontSize: number; paddingVertical: number }> = {
  lg: { fontSize: 11, paddingVertical: 6 },
  sm: { fontSize: 7, paddingVertical: 2 },
  xs: { fontSize: 5, paddingVertical: 1 },
};

export function BinderCover({
  cover,
  frontImageUrl,
  label,
  size = "sm",
  plain = false,
}: {
  cover: BinderCoverId;
  /** The front card's picture, or null for an empty window. */
  frontImageUrl: string | null;
  /** "CHUNC's binder", "Your binder", or nothing on a swatch. */
  label?: string | null;
  size?: BinderCoverSize;
  /** A swatch: the colours and the rings, no window and no label. */
  plain?: boolean;
}) {
  const { edge, spine } = binderCover(cover);
  const box = BOX[size];
  const dot = DOT[size];

  return (
    <View
      style={{
        width: box.width,
        height: box.height,
        borderTopLeftRadius: 4,
        borderBottomLeftRadius: 4,
        borderTopRightRadius: 12,
        borderBottomRightRadius: 12,
        overflow: "hidden",
        backgroundColor: colors[spine],
      }}
    >
      <LinearGradient
        colors={[colors[spine], colors[edge]]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
      />
      {/* A soft sheen, so a flat colour still reads as a cover. */}
      <LinearGradient
        colors={["rgba(255,255,255,0.18)", "transparent", "rgba(0,0,0,0.25)"]}
        locations={[0, 0.4, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        pointerEvents="none"
        style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
      />

      {/* The spine: darker, with the three rings showing at its edge. */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          width: "9%",
          backgroundColor: "rgba(0,0,0,0.45)",
        }}
      >
        {(["18%", "49%", "80%"] as const).map((top) => (
          <View
            key={top}
            style={{
              position: "absolute",
              top,
              right: -(dot / 4),
              width: dot,
              height: dot,
              borderRadius: dot / 2,
              backgroundColor: colors.elevated,
              borderWidth: 1,
              borderColor: colors.borderStrong,
            }}
          />
        ))}
      </View>

      {/* The window: the front card, or an empty pane. */}
      {plain ? null : (
        <View
          style={{
            position: "absolute",
            top: "11%",
            left: "22%",
            width: "56%",
            height: "58%",
            borderRadius: 6,
            borderWidth: 2,
            borderColor: "rgba(0,0,0,0.5)",
            backgroundColor: "rgba(0,0,0,0.7)",
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
        </View>
      )}

      {label && !plain ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            bottom: "8%",
            left: "22%",
            right: "8%",
            borderRadius: 4,
            backgroundColor: "rgba(0,0,0,0.8)",
            paddingHorizontal: 3,
            paddingVertical: LABEL[size].paddingVertical,
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              color: colors.textPrimary,
              fontSize: LABEL[size].fontSize,
              fontWeight: "700",
              letterSpacing: 0.5,
              textAlign: "center",
              textTransform: "uppercase",
            }}
          >
            {label}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
