import { useState } from "react";
import { Image, Text, View } from "react-native";

import { filmLayer } from "./avatar-geometry";
import { hasAuraArt, hasRingArt } from "./cosmetic-art-data";
import { WornAura, WornRing } from "./cosmetic-worn";

import { CosmeticFilm, type ArtFile } from "./cosmetic-film";
import { getFoilKit, travellingFrame } from "./foil";
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

/**
 * The catalogue avatar effects, as one colour each.
 *
 * The same gap the rings had, and closed the same way: the website draws
 * these in CSS - drifting hearts, rising sparks, falling snow - and a phone
 * has no CSS, so a player wearing one wore nothing in the app.
 *
 * One colour is a bigger loss here than it was for rings, because an effect
 * IS its movement. What the app draws is a soft halo in the effect's own
 * colour: enough to say "this player is wearing something", honest about
 * not being the animation. Particles need a Skia pass and a round of their
 * own, the same conclusion the multi-colour rings reached.
 *
 * Taken from the particle each effect scatters — the fill inside the SVG
 * the website inlines — so the halo is the colour of the thing that would
 * have been floating. `tests/unit/ring-colors.test.ts` fails when an effect
 * in the CSS has no colour here.
 */
export const AURA_COLOR: Record<string, string> = {
  "aura-hearts": "#ff8fb3",
  "aura-sakura": "#f7b6cf",
  "aura-sparks": "#ffb45e",
  "aura-stars": "#eef4ff",
  "aura-snow": "#dcecff",
  "aura-bubbles": "#bfe8ff",
  "aura-static": "#ffe36e",
  "aura-holo-shards": "#a9d5ff",
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
  aura = null,
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
  /**
   * The catalogue avatar effect they wear. Rides WITH a ring rather than
   * replacing it — the website's rule: the two slots mix and match.
   */
  aura?: string | null;
  /** A dropped-in avatar effect, which outranks the catalogue one. */
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
      ? hasRingArt(ring)
        ? null
        : (RING_COLOR[ring] ?? null)
      : frame
        ? (FRAME_COLOR[frame] ?? null)
        : null;

  /* The travelling frames animate only when they are the ring being
     worn; a catalogue ring on top of one replaces it outright. */
  const kit =
    !ringArt && !ring && frame && travellingFrame(frame) ? getFoilKit() : null;

  /*
   * The worn effect, as a halo in its own colour.
   *
   * The stand-in, and only for an aura Skia cannot draw yet. A dropped-in
   * file outranks it and so does real art; what is left is the two
   * hundred catalogue cosmetics still waiting their turn, where a soft
   * glow remains the honest version of a thing whose whole point is that
   * it moves.
   */
  const halo =
    !auraArt && aura && !hasAuraArt(aura) ? (AURA_COLOR[aura] ?? null) : null;

  const haloStyle = halo
    ? {
        shadowColor: halo,
        shadowOpacity: 0.9,
        shadowRadius: Math.max(4, Math.round(size * 0.22)),
        shadowOffset: { width: 0, height: 0 },
      }
    : null;

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
    const { box: film, offset } = filmLayer(size);

    return (
      <View
        style={{
          width: size,
          height: size,
          alignItems: "center",
          justifyContent: "center",
          opacity: dimmed ? 0.5 : 1,
          ...(haloStyle ?? {}),
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

  /*
   * The catalogue's own rings and auras, drawn rather than approximated.
   *
   * Reported from a phone: "animated cosmetics don't work in app still -
   * any of them. The holo patterns work for cards but all profile
   * cosmetics do not." Right, and never a bug — the app had no way to
   * draw a conic gradient or a keyframe, so a ring somebody spent Embers
   * on came out as the flat band below.
   *
   * Both return null for a slug they have no art for and on any device
   * where Skia will not load, so everything not yet ported keeps exactly
   * the stand-in it had.
   *
   * THE RING GOES UNDER THE FACE AND THE AURA GOES OVER IT, which is
   * the same order the website draws them in and the same order the
   * dropped-in-file branch above uses. A ring under a face is the
   * promise about not covering anybody's picture. An aura over it is
   * the difference between wearing something and, in the founder's
   * words off a real phone, hearts that are "behind the avatar".
   */
  const worn = hasRingArt(ring) || hasAuraArt(aura);

  if (worn) {
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
        <WornRing ring={hasRingArt(ring) ? ring : null} size={size} />
        {face}
        <WornAura aura={hasAuraArt(aura) ? aura : null} size={size} />
      </View>
    );
  }

  if (!band) {
    return <View style={[{ opacity: dimmed ? 0.5 : 1 }, haloStyle]}>{face}</View>;
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
        ...(haloStyle ?? {}),
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
