import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SheetBackdrop } from "./action-menu";
import {
  ApiError,
  BINDER_NAME_MAX,
  createBinder,
  describeError,
  serverMessage,
} from "./api";
import { BinderCover } from "./binder-cover";
import {
  BINDER_COVERS,
  DEFAULT_BINDER_COVER,
  type BinderCoverId,
} from "./binder-covers";
import { colors, radius, spacing } from "./theme";
import { AsyncButton, ErrorLine, Input, Tap } from "./ui";

/**
 * Starting a custom binder: the app's half of
 * src/components/binder/create-binder.tsx, same field, same swatches,
 * same button. A name (up to forty characters), one of the seven
 * covers, and Create. The binder opens as soon as it exists; the
 * caller gets its id and goes there.
 */
export function CreateBinderSheet({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  /** The new binder's id, once the server has it. */
  onCreated: (binderId: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [cover, setCover] = useState<BinderCoverId>(DEFAULT_BINDER_COVER);
  const [error, setError] = useState<string | null>(null);

  if (!visible) return null;

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give the binder a name.");
      return;
    }
    setError(null);
    try {
      const { binder } = await createBinder({ name: trimmed, cover });
      setName("");
      setCover(DEFAULT_BINDER_COVER);
      onCreated(binder.id);
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.code === "at-cap"
          ? "You have twenty binders already. Delete one to start another."
          : (serverMessage(caught) ??
              `Could not start the binder (${describeError(caught)}).`),
      );
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <SheetBackdrop />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable
          onPress={onClose}
          style={{
            flex: 1,
            justifyContent: "flex-end",
            padding: spacing(3),
            paddingBottom: Math.max(spacing(3), insets.bottom),
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              maxHeight: "85%",
              borderRadius: radius.card,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              padding: spacing(4),
              gap: spacing(3),
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: spacing(3),
              }}
            >
              <Text
                style={{ color: colors.textPrimary, fontWeight: "700", fontSize: 16 }}
              >
                New binder
              </Text>
              <Tap onPress={onClose} accessibilityLabel="Close">
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </Tap>
            </View>

            <Input
              value={name}
              onChangeText={(text) => setName(text.slice(0, BINDER_NAME_MAX))}
              placeholder={'Name it, like "One Piece" or "Grails"'}
              maxLength={BINDER_NAME_MAX}
              autoCapitalize="words"
              autoFocus
              accessibilityLabel="Binder name"
            />

            <View style={{ gap: spacing(2) }}>
              <Text
                style={{ color: colors.textPrimary, fontWeight: "700", fontSize: 13 }}
              >
                Cover
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <View style={{ flexDirection: "row", gap: spacing(3) }}>
                  {BINDER_COVERS.map((option) => {
                    const on = cover === option.id;
                    return (
                      <Tap
                        key={option.id}
                        onPress={() => setCover(option.id)}
                        accessibilityLabel={`${option.name} cover`}
                        style={{ alignItems: "center", gap: spacing(1) }}
                      >
                        <View
                          style={{
                            padding: 2,
                            borderRadius: 8,
                            borderWidth: 2,
                            borderColor: on ? colors.accent : "transparent",
                          }}
                        >
                          <BinderCover
                            cover={option.id}
                            frontImageUrl={null}
                            size="xs"
                            plain
                          />
                        </View>
                        <Text
                          style={{
                            color: on ? colors.textPrimary : colors.textSecondary,
                            fontWeight: on ? "700" : "400",
                            fontSize: 11,
                          }}
                        >
                          {option.name}
                        </Text>
                      </Tap>
                    );
                  })}
                </View>
              </ScrollView>
            </View>

            <AsyncButton label="Create" pendingLabel="Creating…" onPress={create} />
            <ErrorLine message={error} />
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
