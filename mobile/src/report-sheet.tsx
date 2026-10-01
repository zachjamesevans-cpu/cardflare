import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";

import { SheetBackdrop } from "./action-menu";
import {
  ApiError,
  REPORT_REASONS,
  reportTarget,
  type ReportKind,
  type ReportReason,
} from "./api";
import { colors, radius, spacing } from "./theme";
import { AsyncButton, Button, ErrorLine, Input, Tap } from "./ui";

/**
 * The report sheet: one sheet for a profile, a post and a conversation,
 * the website's src/components/players/report-sheet.tsx as a Modal.
 *
 * A reason from the short list, a note if it helps, and Send. Nothing
 * automatic happens to the person reported; the note lands in the
 * admins' queue and is read by hand, which is why the words here
 * promise a look and nothing more.
 */
export interface ReportTarget {
  kind: ReportKind;
  targetId: string;
}

/** The note's ceiling, the server's `note: z.string().max(500)`. */
export const REPORT_NOTE_MAX = 500;

/** How long the thanks stays up before the sheet goes. */
const THANKS_MS = 1000;

/** The server's reason, in words a person can act on. */
function failureMessage(caught: unknown): string {
  if (caught instanceof ApiError) {
    if (caught.code === "not-found") return "That is gone already.";
    if (caught.code === "yourself") return "That is you.";
    if (caught.code === "unauthorized") return "Sign in to report.";
    if (caught.status === 429) return "Give it a minute and try again.";
  }
  return "Could not send the report. Try again in a moment.";
}

export function ReportSheet({
  target,
  onClose,
}: {
  /** Null while closed. */
  target: ReportTarget | null;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  /* A fresh form for every opening: last time's reason is not this
     time's. */
  useEffect(() => {
    if (target) {
      setReason(null);
      setNote("");
      setError(null);
      setSent(false);
    }
  }, [target]);

  /* The thanks shows for a second, then the sheet closes itself. */
  useEffect(() => {
    if (!sent) return;
    const timer = setTimeout(onClose, THANKS_MS);
    return () => clearTimeout(timer);
  }, [sent, onClose]);

  if (!target) return null;

  const send = async () => {
    if (!reason) return;
    setError(null);
    try {
      await reportTarget(
        target.kind,
        target.targetId,
        reason,
        note.trim() || undefined,
      );
      setSent(true);
    } catch (caught) {
      setError(failureMessage(caught));
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
            <Text
              style={{ color: colors.textPrimary, fontWeight: "700", fontSize: 16 }}
            >
              Report
            </Text>

            {sent ? (
              <Text style={{ color: colors.textSecondary, fontSize: 15 }}>
                Thanks. We will take a look.
              </Text>
            ) : (
              <>
                {/* The radio list: one reason, the website's four. */}
                <View style={{ gap: spacing(1) }}>
                  {REPORT_REASONS.map((option) => {
                    const on = reason === option.value;
                    return (
                      <Tap
                        key={option.value}
                        onPress={() => setReason(option.value)}
                        accessibilityLabel={
                          on ? `${option.label}, selected` : option.label
                        }
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: spacing(2.5),
                          borderRadius: radius.control,
                          borderWidth: 1,
                          borderColor: on ? colors.accent : colors.border,
                          backgroundColor: colors.elevated,
                          paddingHorizontal: spacing(3),
                          paddingVertical: spacing(2.5),
                        }}
                      >
                        <Ionicons
                          name={on ? "radio-button-on" : "radio-button-off"}
                          size={18}
                          color={on ? colors.accent : colors.textMuted}
                        />
                        <Text
                          style={{
                            color: colors.textPrimary,
                            fontSize: 15,
                            fontWeight: on ? "600" : "400",
                          }}
                        >
                          {option.label}
                        </Text>
                      </Tap>
                    );
                  })}
                </View>

                <Input
                  value={note}
                  onChangeText={setNote}
                  multiline
                  maxLength={REPORT_NOTE_MAX}
                  placeholder="Anything that helps us look (optional)"
                  accessibilityLabel="Anything that helps us look, optional"
                  style={{ minHeight: 72, textAlignVertical: "top" }}
                />

                <View style={{ flexDirection: "row", gap: spacing(2) }}>
                  <View style={{ flex: 1 }}>
                    <AsyncButton
                      label="Send report"
                      pendingLabel="Sending…"
                      disabled={!reason}
                      onPress={send}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button label="Cancel" variant="secondary" onPress={onClose} />
                  </View>
                </View>
                <ErrorLine message={error} />
              </>
            )}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
