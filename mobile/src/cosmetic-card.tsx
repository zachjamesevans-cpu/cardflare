import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef } from "react";
import { Animated, Easing, Image, View } from "react-native";

import { getSkiaFoil } from "./foil";
import { colors } from "./theme";

/**
 * A showcased card, wearing what the player bought.
 *
 * The holo is real foil now: foil.tsx redraws the art on a Skia canvas
 * and runs the website's blend-mode recipe over it — color-dodge
 * spectra, screen washes, hard-light speculars. Skia ships in Expo Go
 * and in every dev-client/TestFlight build, so this is the normal path.
 * The translucent-gradient wash below survives as the fallback for a
 * binary without Skia, and for the shop's art-less preview tiles where
 * there is no image to dodge against.
 *
 * The frames are borders and translate exactly; the effects run the
 * same rhythm at the same durations as the web keyframes.
 */

const FRAME_COLOR: Record<string, string | null> = {
  plain: null,
  "ember-edge": "#ff8a3d",
  "lime-edge": colors.accent,
  /* The travellers cannot be travelling gradients on a border, so each
     takes the strongest stop of its web gradient and holds still. */
  "prism-edge": "#8c3cff",
  "frost-edge": "#6ec3ff",
  "rose-edge": "#ff6fb5",
  "gilded-edge": "#f0c24b",
  "molten-edge": "#ff5a1f",
  "galaxy-edge": "#6d4aff",
};

/*
 * The stops follow the REBUILT web foil (globals.css): Classic's
 * spectral columns, Prism's pastel bands, Galaxy's nebula. Still an
 * approximation - no blend modes here - but the same palette family,
 * so a card dressed on one client reads as the same card on the other.
 */
const HOLO_STOPS: Record<string, string[]> = {
  "none-holo": [],
  "classic-holo": [
    "rgba(154,64,224,0.30)",
    "rgba(64,105,229,0.30)",
    "rgba(43,180,168,0.30)",
    "rgba(96,190,66,0.30)",
    "rgba(235,205,60,0.30)",
    "rgba(227,60,60,0.30)",
  ],
  "prism-holo": [
    "rgba(240,150,145,0.32)",
    "rgba(120,190,250,0.32)",
    "rgba(250,190,120,0.32)",
    "rgba(110,240,190,0.32)",
    "rgba(245,140,225,0.32)",
    "rgba(120,235,240,0.32)",
  ],
  "galaxy-holo": [
    "rgba(30,15,70,0.80)",
    "rgba(100,55,215,0.55)",
    "rgba(210,35,150,0.45)",
    "rgba(12,6,32,0.85)",
  ],
};

export function CosmeticCard({
  imageUrl,
  width,
  frame,
  holo,
  effect,
}: {
  imageUrl: string | null;
  width: number;
  frame: string | null;
  holo: string | null;
  effect: string | null;
}) {
  /* The same 60:84 the website's thumbnails use, so a card is a card. */
  const height = Math.round((width * 84) / 60);

  const border = frame ? FRAME_COLOR[frame] : null;
  const stops = holo ? (HOLO_STOPS[holo] ?? []) : [];
  /* Skia is loaded on the first card that wants foil, never at app
     launch - see foil.tsx for why that ordering is load-bearing. */
  const wantsFoil =
    imageUrl !== null &&
    (holo === "classic-holo" || holo === "prism-holo" || holo === "galaxy-holo");
  const SkiaFoil = wantsFoil ? getSkiaFoil() : null;

  return (
    <View
      style={{
        width,
        height,
        borderRadius: 6,
        overflow: "hidden",
        backgroundColor: colors.elevated,
        borderWidth: border ? 2 : 1,
        borderColor: border ?? colors.border,
      }}
    >
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={{ width: "100%", height: "100%" }}
          resizeMode="cover"
        />
      ) : null}

      {SkiaFoil !== null && imageUrl !== null ? (
        <SkiaFoil
          imageUrl={imageUrl}
          width={width}
          height={height}
          holo={holo as "classic-holo" | "prism-holo" | "galaxy-holo"}
        />
      ) : (
        stops.length > 1 && (
          <LinearGradient
            colors={stops as [string, string, ...string[]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ position: "absolute", inset: 0 }}
            pointerEvents="none"
          />
        )
      )}

      {effect === "shimmer" && <Shimmer width={width} height={height} />}
      {effect === "pulse" && <Pulse />}
      {effect === "orbit" && <Orbit />}
    </View>
  );
}

/**
 * One highlight crossing slowly, with a long pause between.
 *
 * The pause is the point and it is the same 35%-then-wait shape as the
 * web keyframe: a highlight that never stops reads as a loading
 * skeleton, which is the opposite of "this player earned this".
 */
function Shimmer({ width, height }: { width: number; height: number }) {
  const travel = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(travel, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.delay(2900),
        Animated.timing(travel, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [travel]);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: -height * 0.2,
        bottom: -height * 0.2,
        width: width * 0.6,
        transform: [
          {
            translateX: travel.interpolate({
              inputRange: [0, 1],
              outputRange: [-width * 0.8, width * 1.2],
            }),
          },
          { rotate: "12deg" },
        ],
      }}
    >
      <LinearGradient
        colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.32)", "rgba(255,255,255,0)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ flex: 1 }}
      />
    </Animated.View>
  );
}

/** The frame breathes, once every four seconds. */
function Pulse() {
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glow, {
          toValue: 0,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [glow]);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        inset: 0,
        borderWidth: 3,
        borderColor: "rgba(255,255,255,0.45)",
        borderRadius: 6,
        opacity: glow,
      }}
    />
  );
}

/**
 * A light that circles the card.
 *
 * The web version rotates a conic gradient behind a ring mask, and
 * neither conic gradients nor masks exist here. This runs a short bright
 * segment around the four edges instead — same reading at a glance, and
 * the most expensive item in the shop still looks like it from across a
 * table.
 */
function Orbit() {
  const lap = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(lap, {
        toValue: 4,
        duration: 3200,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [lap]);

  /* One edge lit at a time, each fading in as the lap reaches it. */
  const edge = (index: number) =>
    lap.interpolate({
      inputRange: [index - 0.5, index, index + 0.5, index + 3.5, index + 4],
      outputRange: [0, 1, 0, 0, 1],
      extrapolate: "clamp",
    });

  const bar = {
    position: "absolute" as const,
    backgroundColor: colors.accent,
  };

  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[bar, { top: 0, left: 0, right: 0, height: 3, opacity: edge(0) }]}
      />
      <Animated.View
        pointerEvents="none"
        style={[bar, { top: 0, bottom: 0, right: 0, width: 3, opacity: edge(1) }]}
      />
      <Animated.View
        pointerEvents="none"
        style={[bar, { bottom: 0, left: 0, right: 0, height: 3, opacity: edge(2) }]}
      />
      <Animated.View
        pointerEvents="none"
        style={[bar, { top: 0, bottom: 0, left: 0, width: 3, opacity: edge(3) }]}
      />
    </>
  );
}
