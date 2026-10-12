import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useLayoutEffect, useState } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { StackParams } from "../../App";
import { answerNearby, serverMessage } from "../api";
import { COMPOSER_MAX_LINES } from "../message-runs";
import { PlayerAvatar } from "../player-avatar";
import { colors, gutter, spacing } from "../theme";
import { AsyncButton, CardImage, ErrorLine, Input, Muted } from "../ui";

const COMPOSER_LINE = 20;

/**
 * A conversation that has not started yet: the person, the card it is
 * about, and the composer with the first line already written. The
 * founder: "pressing the message button should immediately open up a
 * message in someone's inbox ... autofilled with 'I have (card name).
 * Are you looking to trade for it?' ... people would further understand
 * what's happening if it goes into an inbox style view."
 *
 * Laid out the way a conversation is (screens/thread.tsx), so it reads
 * as Messages from the first frame. Nothing exists on the server until
 * Send - an empty conversation would land in the other person's
 * Messages with nothing in it - and Send swaps this screen for the real
 * one, so Back goes where it came from.
 */
export function NewMessageScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const route = useRoute<RouteProp<StackParams, "NewMessage">>();
  const { ask, withName, withPlayerId, withAvatarUrl, cardName, imageUrl, draft } =
    route.params;
  const [text, setText] = useState(draft);
  const [error, setError] = useState<string | null>(null);
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const first = withName.split(" ")[0];

  useLayoutEffect(() => {
    navigation.setOptions({ title: withName });
  }, [navigation, withName]);

  /* The home indicator's strip, left clear only while the keyboard is down. */
  const [keyboardUp, setKeyboardUp] = useState(false);
  useEffect(() => {
    const shown = Keyboard.addListener("keyboardWillShow", () => setKeyboardUp(true));
    const hidden = Keyboard.addListener("keyboardWillHide", () => setKeyboardUp(false));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  const send = async () => {
    const body = text.trim();
    if (!body) {
      setError("Write something first.");
      return;
    }
    setError(null);
    try {
      const result = await answerNearby(ask, body);
      if (result.ok && result.threadId) {
        navigation.replace("LocalThread", { threadId: result.threadId });
        return;
      }
      setError(result.message ?? "Could not send that.");
    } catch (caught) {
      setError(serverMessage(caught) ?? "Could not send that.");
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.canvas }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? headerHeight : 0}
    >
      {/* The card strip a conversation about a card has. */}
      <View
        style={{
          paddingHorizontal: gutter,
          paddingVertical: spacing(2),
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <Muted>About {cardName}</Muted>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: gutter,
          gap: spacing(3),
        }}
        keyboardShouldPersistTaps="handled"
      >
        <PlayerAvatar
          displayName={withName}
          seed={withPlayerId}
          avatarUrl={withAvatarUrl}
          size={64}
        />
        <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: "700" }}>
          {withName}
        </Text>
        <CardImage imageUrl={imageUrl} width={88} name={cardName} cardNumber="" />
        <Text
          style={{
            color: colors.textMuted,
            fontSize: 13,
            textAlign: "center",
            maxWidth: 260,
          }}
        >
          {`${first} is looking for this. Your message goes to them when you press Send.`}
        </Text>
      </ScrollView>

      <View
        style={{
          padding: spacing(3),
          paddingBottom: spacing(3) + (keyboardUp ? 0 : insets.bottom),
          gap: spacing(2),
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: spacing(2) }}>
          <View style={{ flex: 1 }}>
            <Input
              value={text}
              onChangeText={setText}
              multiline
              scrollEnabled
              placeholder="Message"
              accessibilityLabel={`Message to ${first}`}
              style={{
                lineHeight: COMPOSER_LINE,
                maxHeight: COMPOSER_MAX_LINES * COMPOSER_LINE + spacing(3) * 2 + 2,
              }}
            />
          </View>
          <AsyncButton label="Send" pendingLabel="Sending…" onPress={send} />
        </View>
        <ErrorLine message={error} />
      </View>
    </KeyboardAvoidingView>
  );
}
