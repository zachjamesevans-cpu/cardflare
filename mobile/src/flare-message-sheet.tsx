import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, View } from "react-native";

import { openLocalThread } from "./api";
import { MESSAGE_MAX_LENGTH } from "./local-shared";
import { colors, radius, spacing } from "./theme";
import { AsyncButton, Button, ErrorLine, Input, Muted } from "./ui";

/**
 * The paper plane on a Flare: the first message to its poster.
 *
 * Sending it is what creates the conversation - the same call Local
 * makes, landing in the same thread screen - so the Feed never grows a
 * second messaging system. The box opens with a line already in it
 * naming the card, because "Hey" is a worse opener than "about your
 * Hody Jones".
 */
export interface MessageTarget {
  flareId: string;
  cardName: string;
  posterName: string;
}

export function FlareMessageSheet({
  target,
  onClose,
  onOpened,
}: {
  /** Null when closed. */
  target: MessageTarget | null;
  onClose: () => void;
  onOpened: (threadId: string) => void;
}) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (target) {
      setBody(`About your ${target.cardName}: `);
      setError(null);
    }
  }, [target]);

  if (!target) return null;

  const send = async () => {
    setError(null);
    try {
      const result = await openLocalThread(target.flareId, body.trim());
      if (result.ok && result.threadId) {
        onOpened(result.threadId);
        return;
      }
      setError(result.message ?? "Could not start the conversation.");
    } catch {
      setError("Could not start the conversation.");
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable
          onPress={onClose}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.75)",
            alignItems: "center",
            justifyContent: "center",
            padding: spacing(4),
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              alignSelf: "stretch",
              borderRadius: radius.card,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              padding: spacing(4),
              gap: spacing(3),
            }}
          >
            <Text style={{ color: colors.textPrimary, fontWeight: "700", fontSize: 16 }}>
              {`Message ${target.posterName}`}
            </Text>
            <Input
              value={body}
              onChangeText={setBody}
              multiline
              autoFocus
              maxLength={MESSAGE_MAX_LENGTH}
              placeholder="Say what you have, or ask"
              style={{ minHeight: 88, textAlignVertical: "top" }}
            />
            <View style={{ flexDirection: "row", gap: spacing(2) }}>
              <View style={{ flex: 1 }}>
                <AsyncButton label="Send" pendingLabel="Sending…" onPress={send} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Cancel" variant="secondary" onPress={onClose} />
              </View>
            </View>
            <ErrorLine message={error} />
            <Muted>
              {`Goes to ${target.posterName} only. Meet at the store; never send money to somebody you have not met.`}
            </Muted>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
