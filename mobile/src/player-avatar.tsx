import { useState } from "react";
import { Image, Text, View } from "react-native";

import { avatarHues, colors } from "./theme";

/**
 * A player's avatar in the app: their picture, or their initials.
 *
 * The website's `PlayerAvatar` in the shape React Native can express.
 * Same rules, same fallbacks: a guest has no picture, a player may not
 * have chosen one, a phone on shop wifi may fail to fetch one, and none
 * of those should leave a hole where somebody's face goes.
 *
 * The ring is the website's exact geometry, not a coloured border: a
 * 2px band of the frame's colour, then a 2px gap of canvas, then the
 * face. The web draws it with box-shadows; here it is two nested
 * circles, and the sizes work out identically. The travelling web
 * frames (Prism, Molten, Galaxy) hold still at their strongest stop,
 * because React Native has no animated gradient borders.
 */

/** Mirrors FRAME_CLASS in the website's player-avatar.tsx. Exported so
    the shop tiles can show the ring a frame buys before it is bought. */
export const FRAME_COLOR: Record<string, string | null> = {
  plain: null,
  "ember-edge": colors.ember,
  "lime-edge": colors.accent,
  "prism-edge": "#8c3cff",
  "frost-edge": colors.frost,
  "rose-edge": colors.rose,
  "gilded-edge": colors.gold,
  "molten-edge": "#ff5a1f",
  "galaxy-edge": colors.galaxy,
};

/** FNV-1a, the same stable hash the website uses to pick a hue. */
function hue(seed: string): string {
  let result = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    result ^= seed.charCodeAt(i);
    result = Math.imul(result, 0x01000193);
  }
  return avatarHues[(result >>> 0) % avatarHues.length];
}

function initials(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const picked = words.length === 1 ? [words[0]] : [words[0], words[words.length - 1]];
  return picked
    .map((word) => [...word][0] ?? "")
    .join("")
    .toUpperCase();
}

export function PlayerAvatar({
  displayName,
  seed,
  avatarUrl = null,
  frame = null,
  size = 32,
  dimmed = false,
}: {
  displayName: string;
  /** Stable per player, so the colour never changes under them. */
  seed: string;
  avatarUrl?: string | null;
  frame?: string | null;
  size?: number;
  /** Away players read as away, the same as on the website. */
  dimmed?: boolean;
}) {
  const [broken, setBroken] = useState(false);

  const ring = frame ? (FRAME_COLOR[frame] ?? null) : null;

  const face = (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.elevated,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {avatarUrl && !broken ? (
        <Image
          source={{ uri: avatarUrl }}
          onError={() => setBroken(true)}
          style={{ width: "100%", height: "100%" }}
          resizeMode="cover"
        />
      ) : (
        <Text
          style={{
            color: hue(seed),
            fontSize: Math.round(size * 0.38),
            fontWeight: "700",
          }}
        >
          {initials(displayName)}
        </Text>
      )}
    </View>
  );

  if (!ring) {
    return <View style={{ opacity: dimmed ? 0.5 : 1 }}>{face}</View>;
  }

  /* Ring, gap, face: 2px band + 2px canvas, the web's box-shadow made
     of nested circles. The outer circle is size + 8, matching the web's
     two 2px shadows on each side. */
  return (
    <View
      style={{
        width: size + 8,
        height: size + 8,
        borderRadius: (size + 8) / 2,
        borderWidth: 2,
        borderColor: ring,
        backgroundColor: colors.canvas,
        alignItems: "center",
        justifyContent: "center",
        opacity: dimmed ? 0.5 : 1,
      }}
    >
      {face}
    </View>
  );
}
