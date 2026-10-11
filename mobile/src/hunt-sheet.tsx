import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SheetBackdrop } from "./action-menu";
import { createHunt, friendlyError, updateHunt, type Hunt } from "./api";
import { colors, radius, spacing } from "./theme";
import { AsyncButton, Button, ErrorLine, Input, SheetClose, Tap } from "./ui";

/**
 * Starting a hunt, changing one, or reading what one is - a sheet from
 * the bottom, as a new binder is.
 *
 * It was a bare name field that swapped in for the New hunt button, at
 * the top of the pane, with nothing saying what a hunt is. The founder:
 * "you click new hunt and a little text box pops up with no explanation
 * on what a hunt is. rethink this ui, perhaps... where it slides up from
 * the bottom. and gives a small explanation of what a hunt actually is."
 *
 * There is no Private: every hunt is public, the founder's "there is
 * zero reason to keep a hunt private - it's the whole point of a hunt".
 */

/** What a hunt is, in the sheet and behind "What's a hunt?". */
export const HUNT_EXPLAINER =
  "A hunt is a goal you’re collecting toward, like every Green Zoro printing or a full Ace alt-art set. Add the cards you need, tick them off as you find them, and post a Flare from it so players who have them can find you.";

/** Tap to fill the name: what a hunt is usually called. */
const EXAMPLES = ["Green Zoro", "Ace alt arts", "OP-09 set"];

const NAME_MAX = 40;
const NOTE_MAX = 280;

export type HuntSheetMode =
  | { kind: "new" }
  | { kind: "edit"; hunt: Hunt }
  | { kind: "about" };

export function HuntSheet({
  mode,
  onClose,
  onStarted,
  onSaved,
  onNew,
}: {
  mode: HuntSheetMode | null;
  onClose: () => void;
  /** A new hunt's id: open it, to add its cards. */
  onStarted?: (huntId: string) => void;
  /** An edit was saved. */
  onSaved?: () => void;
  /** From "What's a hunt?": start one. */
  onNew?: () => void;
}) {
  if (!mode) return null;
  return (
    <HuntSheetBody
      key={mode.kind === "edit" ? `edit-${mode.hunt.id}` : mode.kind}
      mode={mode}
      onClose={onClose}
      onStarted={onStarted}
      onSaved={onSaved}
      onNew={onNew}
    />
  );
}

function HuntSheetBody({
  mode,
  onClose,
  onStarted,
  onSaved,
  onNew,
}: {
  mode: HuntSheetMode;
  onClose: () => void;
  onStarted?: (huntId: string) => void;
  onSaved?: () => void;
  onNew?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const editing = mode.kind === "edit" ? mode.hunt : null;
  const [name, setName] = useState(editing?.name ?? "");
  const [note, setNote] = useState(editing?.description ?? "");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const trimmed = name.replace(/\s+/g, " ").trim();
    if (!trimmed) {
      setError("Give the hunt a name.");
      return;
    }
    setError(null);
    try {
      if (editing?.id) {
        await updateHunt(editing.id, { name: trimmed, description: note.trim() || null });
        onSaved?.();
        onClose();
      } else {
        const result = await createHunt({
          name: trimmed,
          description: note.trim() || null,
        });
        onClose();
        onStarted?.(result.huntId);
      }
    } catch (caught) {
      setError(
        `${editing ? "Could not save" : "Could not start the hunt"}. ${friendlyError(caught)}`,
      );
    }
  };

  const title =
    mode.kind === "about" ? "What’s a hunt?" : editing ? "Edit hunt" : "New hunt";

  return (
    /* Fade, not slide, as every sheet here: a sliding Modal carries its
       backdrop up with it. */
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
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}>
                {/* The crosshair the Hunts tab wears. */}
                <Ionicons name="locate-outline" size={18} color={colors.accent} />
                <Text style={{ color: colors.textPrimary, fontWeight: "700", fontSize: 16 }}>
                  {title}
                </Text>
              </View>
              <SheetClose onPress={onClose} />
            </View>

            {/* The explanation, wherever someone is about to start one or
                asked. Editing a hunt you made needs no lesson. */}
            {editing ? null : (
              <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>
                {HUNT_EXPLAINER}
              </Text>
            )}

            {mode.kind === "about" ? (
              onNew ? (
                <Button
                  label="Start a hunt"
                  onPress={() => {
                    onClose();
                    onNew();
                  }}
                />
              ) : null
            ) : (
              <>
                <View style={{ gap: spacing(2) }}>
                  <Input
                    value={name}
                    onChangeText={(text) => setName(text.slice(0, NAME_MAX))}
                    placeholder="Name it"
                    accessibilityLabel="Hunt name"
                    maxLength={NAME_MAX}
                    autoCapitalize="words"
                    autoFocus={!editing}
                  />
                  {/* A nudge for the blank field: tap one to use it. */}
                  {editing || name ? null : (
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing(2) }}>
                      {EXAMPLES.map((example) => (
                        <Tap
                          key={example}
                          onPress={() => setName(example)}
                          accessibilityLabel={`Name it ${example}`}
                          style={{
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: colors.border,
                            backgroundColor: colors.elevated,
                            paddingHorizontal: spacing(3),
                            paddingVertical: spacing(1.5),
                          }}
                        >
                          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                            {example}
                          </Text>
                        </Tap>
                      ))}
                    </View>
                  )}
                </View>
                <Input
                  value={note}
                  onChangeText={(text) => setNote(text.slice(0, NOTE_MAX))}
                  placeholder="What it’s for (optional)"
                  accessibilityLabel="What the hunt is for"
                  maxLength={NOTE_MAX}
                  multiline
                  style={{ minHeight: 64, textAlignVertical: "top" }}
                />
                <AsyncButton
                  label={editing ? "Save" : "Start hunt"}
                  pendingLabel={editing ? "Saving…" : "Starting…"}
                  onPress={submit}
                />
                <ErrorLine message={error} />
              </>
            )}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
