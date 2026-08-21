import { Modal, Pressable, Text, useWindowDimensions, View } from "react-native";

import { RemoteImage } from "./remote-image";

import { CosmeticCard } from "./cosmetic-card";
import { LinearGradient } from "expo-linear-gradient";

import { colors, spacing } from "./theme";

/** What the zoom shows: a showcase entry and the dressing it wears. */
export type ZoomedCard = {
  /** The catalogue border worn on the owner's cards, when one is. */
  border?: string | null;
  name: string;
  imageUrl: string | null;
  frame: string | null;
  holo: string | null;
  effect: string | null;
};

/**
 * A showcase card, full screen — the same tap-to-open, tap-anywhere-
 * to-close contract as every other card viewer in the product. The
 * card keeps its dressing at size: foil, frame and effect all render
 * through the same CosmeticCard the thumbnail used, so what zooms is
 * exactly what was tapped.
 */
export function ShowcaseZoom({
  card,
  onClose,
}: {
  /** Null when closed. */
  card: ZoomedCard | null;
  onClose: () => void;
}) {
  const window = useWindowDimensions();
  const width = Math.min(window.width - spacing(12), 340);

  return (
    <Modal
      visible={card !== null}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.85)",
          alignItems: "center",
          justifyContent: "center",
          gap: spacing(3),
          padding: spacing(4),
        }}
      >
        {card && (
          <>
            <CosmeticCard
              imageUrl={card.imageUrl}
              width={width}
              frame={card.frame}
              holo={card.holo}
              effect={card.effect}
              border={card.border ?? null}
            />
            <Text style={{ color: colors.textSecondary, fontSize: 15 }}>
              {card.name}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>
              Tap anywhere to close
            </Text>
          </>
        )}
      </Pressable>
    </Modal>
  );
}

/**
 * The cover banner a profile block wears, or the quiet default. Shared
 * by the full profile and the popup so "has no cover yet" looks the
 * same everywhere: the plain elevated block, never a broken image.
 */
export function CoverBanner({
  coverUrl,
  height,
  blur = 0,
  fade = false,
}: {
  coverUrl: string | null;
  height: number;
  blur?: number;
  /**
   * Dissolve into the card instead of stopping at an edge.
   *
   * The founder's redesign, with a mockup: the art carries down past
   * the name and the badge and fades out, rather than ending at a hard
   * seam across the picture's middle. The web does this with a
   * gradient over the lower two thirds; this is the same shape in
   * Skia-free React Native, so the two platforms match.
   */
  fade?: boolean;
}) {
  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        overflow: "hidden",
        backgroundColor: colors.elevated,
      }}
      pointerEvents="none"
    >
      {coverUrl ? (
        <RemoteImage
          uri={coverUrl}
          blurRadius={blur}
          style={{ width: "100%", height: "100%" }}
          /* Top-anchored, so a face or a logo in the upper half of
             somebody's banner survives the crop. */
          contentPosition="top"
        />
      ) : null}
      {/* A quiet darkening so light covers never wash out the text. */}
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0,0,0,0.25)",
        }}
      />
      {fade ? (
        /*
         * Ends on the card's own colour, not on transparent: a fade
         * that finishes anywhere else stops in a visible band instead
         * of dissolving.
         */
        <LinearGradient
          colors={["transparent", `${colors.surface}CC`, colors.surface]}
          locations={[0, 0.55, 1]}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: Math.round(height * 0.66),
          }}
        />
      ) : null}
    </View>
  );
}
