import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef } from "react";
import { Animated, Easing, Image, View } from "react-native";

import { colors } from "./theme";

/**
 * A showcased card, wearing what the player bought.
 *
 * Worth being plain about what this is: an approximation of the
 * website's treatment, not the same thing. The web version leans on CSS
 * blend modes — `overlay` for the body of a rainbow and `color-dodge`
 * for the specular pass — and React Native has no blend modes at all.
 * What is here instead is layered translucent gradients, which reads as
 * a sheen rather than as true foil.
 *
 * So the app is deliberately a little quieter than the site on the same
 * card. The alternative was a native module or a WebView per card, and
 * neither is worth it for ornament on nine cards.
 *
 * What IS exact: the frames, which are borders and translate perfectly,
 * and the motion, which is the same rhythm at the same durations.
 */

const FRAME_COLOR: Record<string, string | null> = {
  plain: null,
  "ember-edge": "#ff8a3d",
  "lime-edge": colors.accent,
  /* Prism cannot be a travelling gradient on a border, so it takes the
     middle stop of the web gradient and holds still. */
  "prism-edge": "#8c3cff",
};

/** The stops each holo washes over the artwork, at the alpha RN can do. */
const HOLO_STOPS: Record<string, string[]> = {
  "none-holo": [],
  "classic-holo": [
    "rgba(0,200,255,0.30)",
    "rgba(255,0,170,0.30)",
    "rgba(140,60,255,0.30)",
    "rgba(120,255,60,0.30)",
    "rgba(255,200,0,0.30)",
  ],
  "prism-holo": [
    "rgba(0,220,255,0.34)",
    "rgba(255,0,170,0.34)",
    "rgba(140,60,255,0.34)",
    "rgba(0,220,255,0.34)",
  ],
  "galaxy-holo": [
    "rgba(26,11,61,0.72)",
    "rgba(109,74,255,0.5)",
    "rgba(255,0,170,0.35)",
    "rgba(9,4,24,0.75)",
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

      {stops.length > 1 && (
        <LinearGradient
          colors={stops as [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: "absolute", inset: 0 }}
          pointerEvents="none"
        />
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
