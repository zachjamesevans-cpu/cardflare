import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import type { StackParams } from "../App";
import { ApiError, setGoing, storedAccessToken, type GoingAnswer } from "./api";
import { markFeedStale } from "./feed-refresh";
import { GOING, YOURE_GOING, goingLine } from "./going-copy";
import { Tap } from "./ui";
import { colors, radius, spacing } from "./theme";

/**
 * Going, or You're going: the one button for a night, wherever a night
 * is drawn. The website's going-button.tsx in the app's shape, the
 * same two words.
 *
 * The founder's design, in his words back to him: "One tap, Going,
 * puts you on the roster with your Flares and trade binders." So one
 * tap it is. The button flips the moment it is tapped and the server
 * confirms; a refused write paints the truth back, so a tap at a
 * counter on bad wifi reads as done rather than stuck and a tap the
 * server would not take never leaves a lie on the screen.
 *
 * Off: primary, the accent fill, "Going". On: secondary with the
 * check, "You're going". Tapping again is Not going.
 *
 * A guest's tap opens the sign-in door instead: Going needs an
 * account, because the roster is accounts and their binders. The
 * button decides that itself from the keychain so no screen has to
 * remember to, and a stale answer from the server cannot draw a
 * button that then refuses.
 *
 * `goingCount` beside it is the "{n} going" line, drawn through
 * `goingLine` so the three forms cannot drift from the website's.
 */
export function GoingButton({
  eventId,
  youGoing,
  goingCount,
  onSettled,
  withCount = true,
  size = "full",
}: {
  eventId: string;
  /** What the server last said about this viewer. */
  youGoing: boolean;
  /** How many have said Going, the server's number. */
  goingCount: number;
  /** The server's answer, once it has one: a room re-reads on it. */
  onSettled?: (answer: GoingAnswer) => void;
  /** Draw "{n} going" beside the button. */
  withCount?: boolean;
  /** `chip` sits in a list row; `full` is a card's button. */
  size?: "full" | "chip";
}) {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const [going, setGoingState] = useState(youGoing);
  const [count, setCount] = useState(goingCount);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);

  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  /* The server's truth, when a poll brings a newer one and no tap is
     in flight to argue with it. */
  useEffect(() => {
    if (busy) return;
    setGoingState(youGoing);
    setCount(goingCount);
  }, [busy, youGoing, goingCount]);

  const toggle = async () => {
    if (busy) return;
    if (!(await storedAccessToken())) {
      navigation.navigate("SignIn");
      return;
    }

    const next = !going;
    const before = { going, count };
    /* Flipped at once, the count with it, so the tap is seen. */
    setGoingState(next);
    setCount(Math.max(0, count + (next ? 1 : -1)));
    setBusy(true);
    try {
      const answer = await setGoing(eventId, next);
      if (!alive.current) return;
      setGoingState(answer.youGoing);
      setCount(answer.goingCount);
      /* A night you are going to is a Feed item from then on. */
      markFeedStale();
      onSettled?.(answer);
    } catch (caught) {
      if (!alive.current) return;
      setGoingState(before.going);
      setCount(before.count);
      /* The one refusal with a door: an account the server does not
         see is a sign-in that lapsed. */
      if (caught instanceof ApiError && caught.code === "no-account") {
        navigation.navigate("SignIn");
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const chip = size === "chip";

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing(3),
        alignSelf: chip ? "flex-start" : "stretch",
      }}
    >
      <Tap
        disabled={busy}
        onPress={() => void toggle()}
        accessibilityLabel={going ? YOURE_GOING : GOING}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: spacing(2),
          flex: chip ? undefined : 1,
          borderRadius: chip ? 999 : radius.control,
          borderWidth: 1,
          borderColor: going ? colors.border : colors.accent,
          backgroundColor: going ? colors.elevated : colors.accent,
          paddingHorizontal: chip ? spacing(3) : spacing(5),
          paddingVertical: chip ? spacing(1.5) : spacing(3),
          minHeight: chip ? undefined : 48,
          opacity: busy ? 0.7 : 1,
        }}
      >
        {busy ? (
          <ActivityIndicator
            size="small"
            color={going ? colors.textPrimary : colors.accentContrast}
          />
        ) : going ? (
          <Ionicons name="checkmark" size={chip ? 14 : 18} color={colors.textPrimary} />
        ) : null}
        <Text
          style={{
            color: going ? colors.textPrimary : colors.accentContrast,
            fontWeight: "700",
            fontSize: chip ? 13 : 15,
          }}
        >
          {going ? YOURE_GOING : GOING}
        </Text>
      </Tap>
      {withCount ? (
        <Text style={{ color: colors.textMuted, fontSize: chip ? 13 : 14 }}>
          {goingLine(count)}
        </Text>
      ) : null}
    </View>
  );
}
