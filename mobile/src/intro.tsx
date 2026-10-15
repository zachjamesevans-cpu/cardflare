import { useEffect, useState } from "react";
import { Text, View } from "react-native";
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
import { getGames } from "./api";
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
 * the game the player picked a step before.
 */

export function Intro({
  onPost,
  onLook,
  game = "one-piece",
}: {
  onPost: () => void;
  onLook: () => void;
  /** Whose art the scenes draw: introGame() of the games they play. */
  game?: IntroGame;
}) {
  const [index, setIndex] = useState(0);
  const insets = useSafeAreaInsets();
  const card = INTRO_CARDS[index];
  const last = index === INTRO_CARDS.length - 1;

  return (
    <View
      style={{
        flex: 1,
        /* The first run's surface, as welcome.tsx draws it. */
        backgroundColor: LAUNCH_BACKGROUND,
        paddingTop: insets.top + spacing(3),
        paddingBottom: insets.bottom + spacing(4),
        paddingHorizontal: spacing(6),
      }}
    >
      <View style={{ alignItems: "flex-end", minHeight: 32 }}>
        {last ? null : (
          <Tap onPress={onLook} hitSlop={10} accessibilityLabel={INTRO_SKIP}>
            <Text style={{ color: colors.textMuted, fontSize: 15, fontWeight: "600" }}>
              {INTRO_SKIP}
            </Text>
          </Tap>
        )}
      </View>

      <View
        key={card.key}
        style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: spacing(5) }}
      >
        <IntroScene card={card.key} game={game} />
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

      {/* Where you are, three dots. */}
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
          <View
            key={entry.key}
            style={{
              width: at === index ? 22 : 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: at === index ? colors.accent : colors.borderStrong,
            }}
          />
        ))}
      </View>

      {last ? (
        <View style={{ gap: spacing(2) }}>
          <Button label={INTRO_POST} onPress={onPost} />
          <Tap onPress={onLook} hitSlop={8}>
            <Text
              style={{
                color: colors.accent,
                fontWeight: "600",
                textAlign: "center",
                paddingVertical: spacing(2),
              }}
            >
              {INTRO_LOOK}
            </Text>
          </Tap>
        </View>
      ) : (
        <Button label={INTRO_NEXT} onPress={() => setIndex(index + 1)} />
      )}
    </View>
  );
}

/**
 * The intro again, from Settings -> Help: in the art of the games the
 * account plays, read once. One Piece until the answer lands, or if it
 * never does - the intro must not wait on the network to say hello.
 */
export function ReplayIntro({ onPost, onLook }: { onPost: () => void; onLook: () => void }) {
  const [game, setGame] = useState<IntroGame>("one-piece");
  useEffect(() => {
    let live = true;
    getGames()
      .then((result) => {
        if (live) setGame(introGame(result.mine));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return <Intro game={game} onPost={onPost} onLook={onLook} />;
}
