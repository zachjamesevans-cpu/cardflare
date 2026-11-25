import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Image, Text, View } from "react-native";

import { FIRST_FLARE, FIRST_FLARE_CARDS, FIRST_FLARE_SECONDS } from "./first-flare";
import { Button } from "./ui";
import { colors, radius, spacing } from "./theme";

/** One card in the drifting strip, and the gap after it. */
const ART_W = 96;
const ART_H = Math.round((ART_W * 88) / 63);
const GAP = spacing(3);
/** One pass: the strip is drawn twice and slid by this, so it loops. */
const PASS = FIRST_FLARE_CARDS.length * (ART_W + GAP);

/**
 * The first-Flare starter (src/first-flare.ts): famous cards from every
 * game, dimmed, drifting behind the words, and one button into the
 * composer. The website's FirstFlareCard, the same words and cards. The
 * strip holds still for anyone with Reduce Motion on.
 */
export function FirstFlareCard({ onPost }: { onPost: () => void }) {
  const drift = useRef(new Animated.Value(0)).current;
  const [still, setStill] = useState(false);

  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (live) setStill(reduce);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (still) return;
    const loop = Animated.loop(
      Animated.timing(drift, {
        toValue: -PASS,
        duration: FIRST_FLARE_SECONDS * 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [drift, still]);

  const strip = [...FIRST_FLARE_CARDS, ...FIRST_FLARE_CARDS];

  return (
    <View
      style={{
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        overflow: "hidden",
      }}
    >
      <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}>
        <Animated.View
          style={{
            flexDirection: "row",
            gap: GAP,
            paddingHorizontal: GAP,
            paddingTop: spacing(3),
            opacity: 0.3,
            transform: [{ translateX: drift }],
          }}
        >
          {strip.map((card, index) => (
            <Image
              key={`${card.name}-${index}`}
              source={{ uri: card.imageUrl }}
              style={{ width: ART_W, height: ART_H, borderRadius: 6 }}
            />
          ))}
        </Animated.View>
        <LinearGradient
          colors={["rgba(0,0,0,0.15)", "rgba(0,0,0,0.75)", "rgba(0,0,0,0.92)"]}
          locations={[0, 0.55, 1]}
          style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
        />
      </View>

      <View style={{ minHeight: 230, justifyContent: "flex-end", padding: spacing(5), gap: spacing(3) }}>
        <Text accessibilityRole="header" style={{ color: colors.textPrimary, fontSize: 24, fontWeight: "800", letterSpacing: -0.3 }}>
          {FIRST_FLARE.headline}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 15, lineHeight: 21 }}>{FIRST_FLARE.body}</Text>
        <Button label={FIRST_FLARE.label} onPress={onPost} />
      </View>
    </View>
  );
}
