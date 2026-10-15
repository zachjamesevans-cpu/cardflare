import { Ionicons } from "@expo/vector-icons";
import { Image, Text, View, type ImageSourcePropType } from "react-native";
import Animated, { FadeIn, FadeInDown, FadeInRight, ZoomIn } from "react-native-reanimated";

import { FlareStatus } from "./flare-feed-card";
import { INTRO_IMAGES } from "./intro-art";
import {
  INTRO_ART,
  INTRO_HAS_IT,
  INTRO_PEOPLE,
  INTRO_YOU,
  introChat,
  type IntroCard,
  type IntroGame,
} from "./intro-copy";
import { colors, radius, spacing } from "./theme";
import { StateBand } from "./ui";

/**
 * The intro's three scenes: a small piece of the app on each card, in
 * place of the big icons. The founder: "the big screen that shows all
 * the big icons ... isn't enough. maybe a screenshot of the app or
 * something for each of those things", then "build it go" on drawing
 * them from the app's own pieces rather than screenshots, which go
 * stale. FlareStatus is the Feed's own status line and StateBand the
 * one FOUND band; the art is the game the player just picked.
 *
 * Each plays once as its card arrives - the cards slide into the rail,
 * the hand goes up, FOUND sweeps in - then holds.
 */

/** The scene's width: a phone's screen, small. */
const PANEL = 300;
const CARD_RATIO = 88 / 63;

export function IntroScene({ card, game }: { card: IntroCard["key"]; game: IntroGame }) {
  const art = INTRO_IMAGES[game];
  const names = INTRO_ART[game];
  return (
    <View
      style={{
        width: PANEL,
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        padding: spacing(3),
        gap: spacing(3),
        shadowColor: colors.accent,
        shadowOpacity: 0.18,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 0 },
      }}
    >
      {card === "post" ? <PostScene art={art} /> : null}
      {card === "nearby" ? <NearbyScene art={art[2]} /> : null}
      {card === "trade" ? <TradeScene art={art[2]} name={names[2]} /> : null}
    </View>
  );
}

function Art({ source, width }: { source: ImageSourcePropType; width: number }) {
  return (
    <Image
      source={source}
      style={{
        width,
        height: width * CARD_RATIO,
        borderRadius: radius.control / 2,
      }}
      resizeMode="cover"
    />
  );
}

function Face({ name, size = 30 }: { name: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.elevated,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: colors.textPrimary, fontWeight: "700", fontSize: size * 0.42 }}>
        {name.slice(0, 1)}
      </Text>
    </View>
  );
}

/* 1. A Flare going up: the Feed's corner + glowing, then your post. */
function PostScene({ art }: { art: readonly ImageSourcePropType[] }) {
  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Animated.View
          entering={ZoomIn.delay(150).springify()}
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            borderWidth: 2,
            borderColor: colors.accent,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: colors.accent,
            shadowOpacity: 0.8,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 0 },
          }}
        >
          <Ionicons name="add" size={22} color={colors.textPrimary} />
        </Animated.View>
        <Ionicons name="notifications-outline" size={20} color={colors.textMuted} />
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}>
        <Face name={INTRO_YOU} />
        <View style={{ gap: 2 }}>
          <Text style={{ color: colors.textPrimary, fontWeight: "700", fontSize: 15 }}>
            {INTRO_YOU}
          </Text>
          <FlareStatus />
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: spacing(2) }}>
        {art.map((source, index) => (
          <Animated.View key={index} entering={FadeInRight.delay(350 + index * 160)}>
            <Art source={source} width={82} />
          </Animated.View>
        ))}
      </View>
    </>
  );
}

/* 2. Players near you with the card: the nearest one's hand goes up. */
function NearbyScene({ art }: { art: ImageSourcePropType }) {
  return (
    <View style={{ flexDirection: "row", gap: spacing(3), alignItems: "center" }}>
      <Art source={art} width={96} />
      <View style={{ flex: 1, gap: spacing(2.5) }}>
        {INTRO_PEOPLE.map((person, index) => (
          <Animated.View
            key={person.name}
            entering={FadeInRight.delay(200 + index * 150)}
            style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}
          >
            <Face name={person.name} size={28} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, fontWeight: "700", fontSize: 14 }}>
                {person.name}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>{person.miles}</Text>
            </View>
            {index === 0 ? (
              <Animated.View
                entering={ZoomIn.delay(900).springify()}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 3,
                  paddingHorizontal: spacing(1.5),
                  paddingVertical: 2,
                  borderRadius: 999,
                  backgroundColor: colors.accent,
                }}
              >
                <Ionicons name="hand-left" size={12} color={colors.accentContrast} />
                <Text style={{ color: colors.accentContrast, fontSize: 11, fontWeight: "800" }}>
                  {INTRO_HAS_IT}
                </Text>
              </Animated.View>
            ) : null}
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

/* 3. Two messages, then the card is yours: FOUND, the app's own band. */
function TradeScene({ art, name }: { art: ImageSourcePropType; name: string }) {
  const [ask, answer] = introChat(name);
  return (
    <>
      <Animated.View
        entering={FadeInDown.delay(150)}
        style={{ flexDirection: "row", alignItems: "flex-end", gap: spacing(2) }}
      >
        <Face name={INTRO_PEOPLE[0].name} size={26} />
        <View
          style={{
            maxWidth: 210,
            paddingHorizontal: spacing(3),
            paddingVertical: spacing(2),
            borderRadius: 16,
            borderBottomLeftRadius: 4,
            backgroundColor: colors.elevated,
          }}
        >
          <Text style={{ color: colors.textPrimary, fontSize: 14 }}>{ask}</Text>
        </View>
      </Animated.View>
      <Animated.View
        entering={FadeInDown.delay(650)}
        style={{
          alignSelf: "flex-end",
          maxWidth: 210,
          paddingHorizontal: spacing(3),
          paddingVertical: spacing(2),
          borderRadius: 16,
          borderBottomRightRadius: 4,
          backgroundColor: colors.accent,
        }}
      >
        <Text style={{ color: colors.accentContrast, fontSize: 14, fontWeight: "600" }}>
          {answer}
        </Text>
      </Animated.View>
      <View style={{ alignItems: "center" }}>
        <View style={{ borderRadius: radius.control / 2, overflow: "hidden" }}>
          <Art source={art} width={92} />
          <Animated.View
            entering={FadeIn.delay(1200).duration(400)}
            style={{ position: "absolute", left: 0, right: 0, bottom: 0, top: 0 }}
          >
            <StateBand state="found" />
          </Animated.View>
        </View>
      </View>
    </>
  );
}
