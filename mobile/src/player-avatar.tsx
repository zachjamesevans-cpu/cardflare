import { useState } from "react";
import { Image, Text, View } from "react-native";

import { colors } from "./theme";

/**
 * A player's avatar in the app: their picture, or their initials.
 *
 * The website's `PlayerAvatar` in the shape React Native can express.
 * Same rules, same fallbacks: a guest has no picture, a player may not
 * have chosen one, a phone on shop wifi may fail to fetch one, and none
 * of those should leave a hole where somebody's face goes.
 *
 * The frame is the one bought with Embers. A ring drawn outside the
 * circle rather than a border on it, so equipping one never changes the
 * avatar's size and a roster stays on its grid.
 */

/** Mirrors FRAME_CLASS in the website's player-avatar.tsx. */
const FRAME_COLOR: Record<string, string | null> = {
  plain: null,
  "ember-edge": "#ff8a3d",
  "lime-edge": colors.accent,
  /* No travelling gradient here, for the same reason the showcase cards
     hold still: React Native has no animated gradient border. */
  "prism-edge": "#8c3cff",
};

/** Six hues, matching --color-avatar-N in the website's globals.css. */
const HUES = ["#8fd3ff", "#a8e6a1", "#ffc98f", "#d9b3ff", "#ffadad", "#7fe3d4"];

/** FNV-1a, the same stable hash the website uses to pick a hue. */
function hue(seed: string): string {
  let result = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    result ^= seed.charCodeAt(i);
    result = Math.imul(result, 0x01000193);
  }
  return HUES[(result >>> 0) % HUES.length];
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

  const ring = frame ? FRAME_COLOR[frame] : null;

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: ring ? 2 : 1,
        borderColor: ring ?? colors.border,
        backgroundColor: colors.elevated,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        opacity: dimmed ? 0.5 : 1,
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
}
