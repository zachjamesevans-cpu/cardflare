import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import { useCallback, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Text,
  View,
} from "react-native";

import type { StackParams } from "../../App";
import {
  closeLocalThread,
  readLocalThread,
  sendLocalMessage,
  type LocalThreadMessage,
} from "../api";
import { MESSAGE_MAX_LENGTH, agoLabel } from "../local-shared";
import { colors, spacing } from "../theme";
import { AsyncButton, Button, ErrorLine, Input, Muted } from "../ui";

/**
 * One conversation about one Flare.
 *
 * Loaded fresh on focus — reading is the receipt that marks the other
 * side's messages read and clears the inbox notice — and reloaded after
 * every send. No live socket in v1: a conversation about meeting at a
 * store moves at minutes, not milliseconds, and pull-to-refresh is the
 * honest version of realtime until there is one.
 */
export function ThreadScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const route = useRoute<RouteProp<StackParams, "LocalThread">>();
  const { threadId } = route.params;

  const [messages, setMessages] = useState<LocalThreadMessage[] | null>(null);
  const [withName, setWithName] = useState<string | null>(null);
  const [cardName, setCardName] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const list = useRef<FlatList<LocalThreadMessage>>(null);

  const load = useCallback(
    async (isCurrent: () => boolean = () => true) => {
      try {
        const thread = await readLocalThread(threadId);
        if (!isCurrent()) return;
        if (!thread.ok) {
          navigation.goBack();
          return;
        }
        setMessages(thread.messages);
        setWithName(thread.withName);
        setCardName(thread.cardName);
        setClosed(thread.closed);
        navigation.setOptions({ title: thread.withName ?? "Conversation" });
      } catch {
        if (isCurrent()) setError("Could not load the conversation.");
      }
    },
    [threadId, navigation],
  );

  useFocusEffect(
    useCallback(() => {
      let current = true;
      void load(() => current);
      return () => {
        current = false;
      };
    }, [load]),
  );

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    setError(null);
    try {
      const result = await sendLocalMessage(threadId, body);
      if (!result.ok) {
        setError("Could not send that.");
        return;
      }
      setDraft("");
      await load();
      list.current?.scrollToEnd({ animated: true });
    } catch {
      setError("Could not send that.");
    }
  };

  const end = async () => {
    try {
      await closeLocalThread(threadId);
      setClosed(true);
    } catch {
      setError("Could not end the conversation.");
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.canvas }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
    >
      {cardName && (
        <View
          style={{
            paddingHorizontal: spacing(4),
            paddingVertical: spacing(2),
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <Muted>About {cardName}</Muted>
        </View>
      )}

      <FlatList
        ref={list}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing(4), gap: spacing(2) }}
        data={messages ?? []}
        keyExtractor={(message) => message.id}
        ListEmptyComponent={
          <Text
            style={{
              color: colors.textMuted,
              textAlign: "center",
              paddingVertical: spacing(8),
            }}
          >
            {messages === null ? "Loading…" : "No messages yet."}
          </Text>
        }
        renderItem={({ item }) => (
          <View
            style={{
              maxWidth: "85%",
              alignSelf: item.yours ? "flex-end" : "flex-start",
              backgroundColor: item.yours ? colors.accent : colors.elevated,
              borderRadius: 12,
              paddingHorizontal: spacing(3),
              paddingVertical: spacing(2),
            }}
          >
            <Text
              style={{
                color: item.yours ? colors.accentContrast : colors.textPrimary,
                fontSize: 15,
              }}
            >
              {item.body}
            </Text>
            <Text
              style={{
                color: item.yours ? colors.accentContrast : colors.textMuted,
                opacity: item.yours ? 0.7 : 1,
                fontSize: 10,
                marginTop: 2,
              }}
            >
              {agoLabel(item.sentAt)}
            </Text>
          </View>
        )}
      />

      <View
        style={{
          padding: spacing(3),
          gap: spacing(2),
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}
      >
        {closed ? (
          <Muted>This conversation was ended. Ended conversations stay ended.</Muted>
        ) : (
          <>
            <View
              style={{ flexDirection: "row", alignItems: "flex-end", gap: spacing(2) }}
            >
              <View style={{ flex: 1 }}>
                <Input
                  value={draft}
                  onChangeText={setDraft}
                  multiline
                  maxLength={MESSAGE_MAX_LENGTH}
                  placeholder="Message"
                />
              </View>
              <AsyncButton label="Send" pendingLabel="Sending…" onPress={send} />
            </View>
            <ErrorLine message={error} />
            <View style={{ alignSelf: "flex-start" }}>
              <Button label="End conversation" variant="secondary" onPress={() => void end()} />
            </View>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
