import { useEffect, useRef, useState } from "react";
import { ScrollView, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  INTRO_CARDS,
  INTRO_LOOK,
  INTRO_NEXT,
  INTRO_POST,
  INTRO_SKIP,
  introGame,
  type IntroGame,
} from "./intro-copy";
import { getGames, getMe } from "./api";
import { IntroScene } from "./intro-scenes";
import { LAUNCH_BACKGROUND } from "./launch-view";
import { colors, spacing } from "./theme";
import { Button, Tap } from "./ui";

/**
 * The thirty seconds after signing up: three cards, then the one button
 * that matters. The founder: "a quick 30 second introduction to the app
 * when people first sign up - such as highlighting the post a flare
 * button, a quick 30 word summary or something."
 *
 * The words are shared with the website (intro-copy.ts). The last card
 * ends on "Post your first Flare", straight into the composer, or "Look
 * around first", which lands on the Feed with the + pointed at
 * (spotlight.tsx). Skip is on every card and does the same as the
 * second.
 *
 * Each card shows a scene of the app (intro-scenes.tsx), in the art of
 * the game the player picked a step before. The cards swipe both ways.
 */

export function Intro({
  onPost,
  onLook,
  game = "one-piece",
  handle = null,
}: {
  onPost: () => void;
  onLook: () => void;
  /** Whose art the scenes draw: introGame() of the games they play. */
  game?: IntroGame;
  /** Their handle, so the shared binder link reads as theirs. */
  handle?: string | null;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const pager = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  /*
   * How many pages have had their scene drawn. A scene mounts as its
   * page slides past halfway into view, so its animation plays as it
   * arrives - by swipe or by Next - and stays drawn after.
   */
  const [drawn, setDrawn] = useState(1);
  const last = index === INTRO_CARDS.length - 1;

  const follow = (x: number) => {
    const at = Math.max(0, Math.min(INTRO_CARDS.length - 1, Math.round(x / width)));
    setIndex(at);
    setDrawn((count) => Math.max(count, at + 1));
  };
  const go = (to: number) => pager.current?.scrollTo({ x: to * width, animated: true });

  return (
    <View
      style={{
        flex: 1,
        /* The first run's surface, as welcome.tsx draws it. */
        backgroundColor: LAUNCH_BACKGROUND,
        paddingTop: insets.top + spacing(3),
        paddingBottom: insets.bottom + spacing(4),
      }}
    >
      <View style={{ alignItems: "flex-end", minHeight: 32, paddingHorizontal: spacing(6) }}>
        {last ? null : (
          <Tap onPress={onLook} hitSlop={10} accessibilityLabel={INTRO_SKIP}>
            <Text style={{ color: colors.textMuted, fontSize: 15, fontWeight: "600" }}>
              {INTRO_SKIP}
            </Text>
          </Tap>
        )}
      </View>

      {/*
       * THE CARDS, SWIPED. The founder: "people should be able to swipe
       * between these screens on this page. like go back and forth."
       * One page per card, the screen's width each; Next scrolls the
       * same pager, so a tap and a swipe land in the same place.
       */}
      <ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        /* One card per swipe however hard it is flung: a long drag in
           testing carried from the first card straight to the third. */
        disableIntervalMomentum
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={(event) => follow(event.nativeEvent.contentOffset.x)}
        style={{ flex: 1 }}
      >
        {INTRO_CARDS.map((card, at) => (
          <View
            key={card.key}
            style={{
              width,
              paddingHorizontal: spacing(6),
              alignItems: "center",
              justifyContent: "center",
              gap: spacing(5),
            }}
          >
            {/* A fixed height, so the words do not jump when it draws. */}
            <View style={{ height: SCENE_HEIGHT, justifyContent: "center" }}>
              {at < drawn ? <IntroScene card={card.key} game={game} handle={handle} /> : null}
            </View>
            <View style={{ alignItems: "center", gap: spacing(2) }}>
              <Text
                style={{
                  color: colors.textPrimary,
                  fontSize: 28,
                  fontWeight: "800",
                  textAlign: "center",
                }}
              >
                {card.title}
              </Text>
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: 18,
                  lineHeight: 25,
                  textAlign: "center",
                }}
              >
                {card.body}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={{ paddingHorizontal: spacing(6) }}>
        {/* Where you are, three dots; each one goes there. */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "center",
            gap: spacing(2),
            marginBottom: spacing(5),
          }}
          accessibilityLabel={`${index + 1} of ${INTRO_CARDS.length}`}
        >
          {INTRO_CARDS.map((entry, at) => (
            <Tap
              key={entry.key}
              onPress={() => go(at)}
              hitSlop={8}
              accessibilityLabel={`${entry.title}, ${at + 1} of ${INTRO_CARDS.length}`}
            >
              <View
                style={{
                  width: at === index ? 22 : 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: at === index ? colors.accent : colors.borderStrong,
                }}
              />
            </Tap>
          ))}
        </View>

        {/*
         * THE SAME PLACE ON EVERY CARD. The founder: "on the final tab, the
         * little box at the bottom moves up to make room for first flare.
         * the 'post your first flare' button should be in same spot as the
         * next button ... so that it isn't disorienting." One button that
         * changes its words, and the line under it always kept, empty
         * until the last card fills it - so nothing above it moves.
         */}
        <View style={{ gap: spacing(2) }}>
          <Button
            label={last ? INTRO_POST : INTRO_NEXT}
            onPress={last ? onPost : () => go(index + 1)}
          />
          <View style={{ height: LOOK_ROW, justifyContent: "center" }}>
            {last ? (
              <Tap onPress={onLook} hitSlop={8}>
                <Text
                  style={{
                    color: colors.accent,
                    fontWeight: "600",
                    textAlign: "center",
                  }}
                >
                  {INTRO_LOOK}
                </Text>
              </Tap>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

/** The line under the button, kept on every card (see the button). */
const LOOK_ROW = 36;

/** Room for the tallest scene (intro-scenes.tsx), the trade. */
const SCENE_HEIGHT = 300;

/**
 * The intro again, from Settings -> Help: in the art of the games the
 * account plays, read once. One Piece until the answer lands, or if it
 * never does - the intro must not wait on the network to say hello.
 */
export function ReplayIntro({ onPost, onLook }: { onPost: () => void; onLook: () => void }) {
  const [game, setGame] = useState<IntroGame>("one-piece");
  const [handle, setHandle] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    getGames()
      .then((result) => {
        if (live) setGame(introGame(result.mine));
      })
      .catch(() => {});
    getMe()
      .then((me) => {
        if (live) setHandle(me.player.handle ?? null);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return <Intro game={game} handle={handle} onPost={onPost} onLook={onLook} />;
}
