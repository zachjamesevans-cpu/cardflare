import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Image, Text, View, type ImageSourcePropType } from "react-native";
import Animated, { FadeIn, FadeInDown, FadeInRight, ZoomIn } from "react-native-reanimated";

import { BinderCover } from "./binder-cover";
import type { BinderCoverId } from "./binder-covers";
import { FlareStatus } from "./flare-feed-card";
import { INTRO_IMAGES } from "./intro-art";
import {
  INTRO_ART,
  INTRO_BINDERS,
  INTRO_COMMENT,
  INTRO_COMMENT_COUNT,
  INTRO_LIKES,
  INTRO_OFFERED,
  INTRO_OFFER_SENT,
  INTRO_PEOPLE,
  INTRO_PRIVATE,
  INTRO_PUBLIC,
  INTRO_SHARE_LINK,
  INTRO_SHARE_MESSAGE,
  INTRO_WANT,
  INTRO_YOU,
  introChat,
  introShareTitle,
  type IntroCard,
  type IntroGame,
} from "./intro-copy";
import { colors, radius, spacing } from "./theme";
import { StateBand } from "./ui";

/**
 * The intro's scenes: a small piece of the app on each card, in place of
 * the big icons. The founder: "the big screen that shows all the big
 * icons ... isn't enough. maybe a screenshot of the app or something for
 * each of those things", then the five slides: "if you had to summarize
 * cardflare into the 4-5 most eye catching slides and features". Drawn
 * from the app's own pieces rather than screenshots, which go stale:
 * FlareStatus is the Feed's line, BinderCover the one binder, StateBand
 * the one FOUND band. The art is the game the player just picked.
 *
 * Each plays once as its card arrives, then holds. The website draws
 * the same (src/components/onboarding/intro-scenes.tsx).
 */

/** The scene's width: a phone's screen, small. */
const PANEL = 300;
const CARD_RATIO = 88 / 63;

export function IntroScene({
  card,
  game,
  handle,
}: {
  card: IntroCard["key"];
  game: IntroGame;
  /** The player's handle, for the share scene's link title. */
  handle?: string | null;
}) {
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
      {card === "binders" ? <BindersScene /> : null}
      {card === "share" ? <ShareScene art={art} handle={handle} /> : null}
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

/* 1. A Flare going up, and the followers' answer: the Feed's corner +
   glowing, your post, its likes and the first comment. */
function PostScene({ art }: { art: readonly ImageSourcePropType[] }) {
  return (
    <>
      <View
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}>
          <Face name={INTRO_YOU} size={28} />
          <View style={{ gap: 2 }}>
            <Text style={{ color: colors.textPrimary, fontWeight: "700", fontSize: 14 }}>
              {INTRO_YOU}
            </Text>
            <FlareStatus />
          </View>
        </View>
        <Animated.View
          entering={ZoomIn.delay(150).springify()}
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
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
          <Ionicons name="add" size={20} color={colors.textPrimary} />
        </Animated.View>
      </View>
      <View style={{ flexDirection: "row", gap: spacing(2) }}>
        {art.map((source, index) => (
          <Animated.View key={index} entering={FadeInRight.delay(300 + index * 140)}>
            <Art source={source} width={70} />
          </Animated.View>
        ))}
      </View>
      {/* The Feed's own marks: a filled heart and a speech bubble. */}
      <Animated.View
        entering={FadeIn.delay(800)}
        style={{ flexDirection: "row", alignItems: "center", gap: spacing(4) }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Ionicons name="heart" size={16} color={colors.accent} />
          <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "600" }}>
            {INTRO_LIKES}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Ionicons name="chatbubble-outline" size={15} color={colors.textSecondary} />
          <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "600" }}>
            {INTRO_COMMENT_COUNT}
          </Text>
        </View>
      </Animated.View>
      <Animated.View
        entering={FadeInDown.delay(1100)}
        style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing(2) }}
      >
        <Face name={INTRO_COMMENT.name} size={24} />
        <Text style={{ flex: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}>
          <Text style={{ color: colors.textPrimary, fontWeight: "700" }}>
            {INTRO_COMMENT.name}{" "}
          </Text>
          {INTRO_COMMENT.body}
        </Text>
      </Animated.View>
    </>
  );
}

/* 2. Players near you with it in a binder: the nearest one offers it. */
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
                  {INTRO_OFFERED}
                </Text>
              </Animated.View>
            ) : null}
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

/* 3. Your binders: three covers fanned out, named, one locked private. */
function BindersScene() {
  const tilt = [-8, 0, 8];
  return (
    <>
      <View
        style={{
          height: 150,
          flexDirection: "row",
          justifyContent: "center",
          alignItems: "flex-end",
        }}
      >
        {INTRO_BINDERS.map((binder, index) => (
          /* The entrance on the outside, the tilt on a view of its own:
             a layout animation overwrites the transform of the view it
             runs on (Reanimated says so, and the fan came out flat). */
          <Animated.View
            key={binder.name}
            entering={FadeInDown.delay(150 + index * 170).springify()}
            style={{ marginHorizontal: -14, zIndex: index === 1 ? 2 : 1 }}
          >
            <View
              style={{
                transform: [
                  { rotate: `${tilt[index]}deg` },
                  { translateY: index === 1 ? -10 : 0 },
                ],
              }}
            >
            <BinderCover cover={binder.cover as BinderCoverId} label={binder.name} size="sm" />
            {binder.private ? (
              <Animated.View
                entering={ZoomIn.delay(900).springify()}
                style={{
                  position: "absolute",
                  top: -8,
                  right: -8,
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: colors.elevated,
                  borderWidth: 1,
                  borderColor: colors.borderStrong,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="lock-closed" size={14} color={colors.textPrimary} />
              </Animated.View>
            ) : null}
            </View>
          </Animated.View>
        ))}
      </View>
      {/* The two choices a binder has: shown, or kept to yourself. */}
      <Animated.View
        entering={FadeIn.delay(1100)}
        style={{ flexDirection: "row", justifyContent: "center", gap: spacing(4) }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <Ionicons name="person-circle-outline" size={15} color={colors.accent} />
          <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "600" }}>
            {INTRO_PUBLIC}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <Ionicons name="lock-closed-outline" size={14} color={colors.textSecondary} />
          <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "600" }}>
            {INTRO_PRIVATE}
          </Text>
        </View>
      </Animated.View>
    </>
  );
}

/* 4. The trade binder's link, sent in a message; the friend who opens
   it wants a card, and the offer goes. */
function ShareScene({
  art,
  handle,
}: {
  art: readonly ImageSourcePropType[];
  handle?: string | null;
}) {
  const [sent, setSent] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSent(true), 1900);
    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      <Animated.View
        entering={FadeInDown.delay(150)}
        style={{
          alignSelf: "flex-end",
          width: 264,
          borderRadius: 16,
          borderBottomRightRadius: 4,
          backgroundColor: colors.accent,
          padding: spacing(1.5),
          gap: spacing(1.5),
        }}
      >
        <Text
          style={{
            color: colors.accentContrast,
            fontSize: 14,
            fontWeight: "600",
            paddingHorizontal: spacing(1.5),
            paddingTop: spacing(0.5),
          }}
        >
          {INTRO_SHARE_MESSAGE}
        </Text>
        {/* The link card a message draws for a binder link. */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing(2),
            padding: spacing(2),
            borderRadius: 12,
            backgroundColor: colors.surface,
          }}
        >
          <BinderCover cover={INTRO_BINDERS[0].cover as BinderCoverId} size="xs" plain />
          <View style={{ flex: 1, gap: 2 }}>
            <Text
              numberOfLines={1}
              style={{ color: colors.textPrimary, fontSize: 13, fontWeight: "700" }}
            >
              {introShareTitle(handle)}
            </Text>
            <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 11 }}>
              {INTRO_SHARE_LINK}
            </Text>
            <View style={{ flexDirection: "row", gap: 3, marginTop: 2 }}>
              {art.map((source, index) => (
                <Art key={index} source={source} width={18} />
              ))}
            </View>
          </View>
        </View>
      </Animated.View>

      {/* The friend's side: a card in the binder, and the binder page's
          own button. */}
      <Animated.View
        entering={FadeInDown.delay(800)}
        style={{ flexDirection: "row", alignItems: "center", gap: spacing(2.5) }}
      >
        <Face name={INTRO_PEOPLE[1].name} size={26} />
        <Art source={art[0]} width={44} />
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
            paddingHorizontal: spacing(2.5),
            paddingVertical: spacing(1.5),
            borderRadius: 999,
            borderWidth: 1,
            borderColor: colors.accent,
            backgroundColor: sent ? colors.accent : "transparent",
          }}
        >
          <Ionicons
            name={sent ? "checkmark" : "hand-left-outline"}
            size={13}
            color={sent ? colors.accentContrast : colors.accent}
          />
          <Text
            style={{
              color: sent ? colors.accentContrast : colors.accent,
              fontSize: 12,
              fontWeight: "800",
            }}
          >
            {sent ? INTRO_OFFER_SENT : INTRO_WANT}
          </Text>
        </View>
      </Animated.View>
    </>
  );
}

/* 5. Two messages, then the card is yours: FOUND, the app's own band. */
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
