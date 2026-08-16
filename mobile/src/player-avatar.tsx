import { useState } from "react";
import { Image, Text, View } from "react-native";

import { CosmeticFilm, type ArtFile } from "./cosmetic-film";
import { getFoilKit, travellingFrame } from "./foil";
import { avatarHues, colors } from "./theme";

/**
 * How much wider than the avatar a worn art file is drawn.
 *
 * The website's `.cfx-ring-film`, in a number: art is authored in a 400
 * box with the picture filling out to radius 148, so a film of
 * 400/296 of the avatar puts the band's inner edge exactly on the
 * avatar's edge. Same constant, same result on both platforms.
 */
const FILM_SCALE = 400 / 296;

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
 * circles, and the sizes work out identically. The travelling frames
 * (Prism, Molten, Galaxy) travel here too: a Skia gradient band slides
 * around the ring at the web's own periods, over a static base colour
 * that stands in wherever Skia is not in the binary.
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

/**
 * The catalogue rings, as one colour each.
 *
 * The website draws these in CSS - a conic gradient band per slug in
 * `src/app/cosmetic-art.css` - and CSS is exactly what a phone does not
 * have, so twenty-five rings a player could buy and wear were invisible
 * in the app while dropped-in file art rendered fine.
 *
 * One colour is a real loss on the rings whose whole idea is that they
 * are several: Rainbow, Pixel, Retro Arcade and Glitch each come down to
 * whichever stop was most vivid. It is still the difference between
 * wearing something and wearing nothing, and the honest version needs a
 * sweep gradient per ring - the machinery for that already exists in
 * foil.tsx for the travelling frames, and it is a round of its own.
 *
 * Picked from `--cfa-band` by rule rather than by taste: the most vivid
 * stop, falling back to the lightest when a ring is a monochrome. Regenerate
 * with the same rule if the catalogue grows; `tests/unit/ring-colors.test.ts`
 * fails when a ring in the CSS has no colour here.
 */
export const RING_COLOR: Record<string, string> = {
  "ring-inferno": "#ffb03a",
  "ring-frozen": "#6db7e8",
  "ring-electric": "#4f46e5",
  "ring-galaxy": "#7b5cd6",
  "ring-gold-foil": "#f0c24b",
  "ring-rainbow-foil": "#ffb44d",
  "ring-manga": "#f4f6f8",
  "ring-pixel": "#5eb9ff",
  "ring-glitch": "#ef3ef0",
  "ring-vaporwave": "#b967ff",
  "ring-aurora": "#7ee8c7",
  "ring-ember": "#ff7a2f",
  "ring-smoke": "#6b7280",
  "ring-water": "#9fd8f5",
  "ring-sakura": "#f39ec2",
  "ring-heart": "#e05587",
  "ring-crown": "#d9a92f",
  "ring-starfield": "#17223e",
  "ring-meteor": "#9db8ff",
  "ring-diamond": "#f8fbff",
  "ring-black-flame": "#4a1d6e",
  "ring-white-flame": "#bcd6ea",
  "ring-retro-arcade": "#ff3355",
  "ring-crt": "#2fbf6b",
  "ring-prestige": "#f0c24b",
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
  ring = null,
  ringArt = null,
  auraArt = null,
  size = 32,
  dimmed = false,
}: {
  displayName: string;
  /** Stable per player, so the colour never changes under them. */
  seed: string;
  avatarUrl?: string | null;
  frame?: string | null;
  /**
   * The catalogue ring they wear, worn INSTEAD of the legacy frame when
   * both are set - the website's rule: two rings around one picture is
   * clutter, and the newer choice is the one they made last.
   */
  ring?: string | null;
  /**
   * A dropped-in profile border, when the player wears one. Outranks
   * both of the above for the same reason, and for the same reason the
   * website gives it.
   */
  ringArt?: ArtFile | null;
  /** An avatar effect, which rides with whatever ring is worn. */
  auraArt?: ArtFile | null;
  size?: number;
  /** Away players read as away, the same as on the website. */
  dimmed?: boolean;
}) {
  const [broken, setBroken] = useState(false);

  /*
   * One band, and the newest choice wins: a dropped-in file beats a
   * catalogue ring beats a legacy frame. Same order as the website's.
   */
  const band = ringArt
    ? null
    : ring
      ? (RING_COLOR[ring] ?? null)
      : frame
        ? (FRAME_COLOR[frame] ?? null)
        : null;

  /* The travelling frames animate only when they are the ring being
     worn; a catalogue ring on top of one replaces it outright. */
  const kit =
    !ringArt && !ring && frame && travellingFrame(frame) ? getFoilKit() : null;

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

  /*
   * A worn art file, drawn UNDER the picture rather than over it.
   *
   * The website masks the picture's circle out of the film so a ring
   * can never sit on somebody's face - "please don't ever do that
   * again with these". React Native has no CSS mask, so the same
   * promise is kept by z-order: the face is opaque and drawn last, so
   * nothing the file paints inside the circle is ever visible. The
   * aura goes over the top, because floating around the picture is
   * exactly what an aura is for.
   */
  if (ringArt || auraArt) {
    const film = Math.round(size * FILM_SCALE);
    const offset = Math.round((film - size) / 2);

    return (
      <View
        style={{
          width: size,
          height: size,
          alignItems: "center",
          justifyContent: "center",
          opacity: dimmed ? 0.5 : 1,
        }}
      >
        {ringArt && (
          <View style={{ position: "absolute", top: -offset, left: -offset }}>
            <CosmeticFilm art={ringArt} size={film} />
          </View>
        )}
        {face}
        {auraArt && (
          <View
            pointerEvents="none"
            style={{ position: "absolute", top: -offset, left: -offset }}
          >
            <CosmeticFilm art={auraArt} size={film} />
          </View>
        )}
      </View>
    );
  }

  if (!band) {
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
        borderColor: band,
        backgroundColor: colors.canvas,
        alignItems: "center",
        justifyContent: "center",
        opacity: dimmed ? 0.5 : 1,
      }}
    >
      {face}
      {kit !== null && frame !== null && (
        <View
          pointerEvents="none"
          /* Absolute children measure from inside the 2px border; the
             negative offsets put the canvas back over the border-box so
             the animated band lands exactly on the static ring. */
          style={{
            position: "absolute",
            top: -2,
            left: -2,
            width: size + 8,
            height: size + 8,
          }}
        >
          <kit.AvatarRing size={size + 8} slug={frame} />
        </View>
      )}
    </View>
  );
}
