import type { PropsWithChildren } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";

import { colors, radius, spacing } from "./theme";

/** The handful of primitives every screen shares, in the site's skin. */

export function Card({ children }: PropsWithChildren) {
  return <View style={styles.card}>{children}</View>;
}

export function Title({ children }: PropsWithChildren) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Body({ children }: PropsWithChildren) {
  return <Text style={styles.body}>{children}</Text>;
}

export function Muted({ children }: PropsWithChildren) {
  return <Text style={styles.muted}>{children}</Text>;
}

export function Button({
  label,
  onPress,
  busy = false,
  variant = "primary",
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  variant?: "primary" | "secondary";
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [
        styles.button,
        variant === "secondary" && styles.buttonSecondary,
        (pressed || busy) && { opacity: 0.7 },
      ]}
    >
      {busy && (
        <ActivityIndicator
          size="small"
          color={variant === "primary" ? colors.accentContrast : colors.textPrimary}
        />
      )}
      <Text
        style={[
          styles.buttonLabel,
          variant === "secondary" && { color: colors.textPrimary },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function Input(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={colors.textMuted}
      style={styles.input}
      {...props}
    />
  );
}

export function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null;
  return <Text style={styles.error}>{message}</Text>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.panel,
    padding: spacing(4),
    gap: spacing(2),
  },
  title: { color: colors.textPrimary, fontSize: 18, fontWeight: "700" },
  body: { color: colors.textSecondary, fontSize: 15, lineHeight: 22 },
  muted: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing(2),
    backgroundColor: colors.accent,
    borderRadius: radius.control,
    paddingVertical: spacing(3),
    paddingHorizontal: spacing(5),
    minHeight: 48,
  },
  buttonSecondary: {
    backgroundColor: colors.elevated,
    borderColor: colors.border,
    borderWidth: 1,
  },
  buttonLabel: { color: colors.accentContrast, fontSize: 15, fontWeight: "700" },
  input: {
    backgroundColor: colors.canvas,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.control,
    color: colors.textPrimary,
    fontSize: 16,
    paddingVertical: spacing(3),
    paddingHorizontal: spacing(3.5),
    minHeight: 48,
  },
  error: { color: colors.danger, fontSize: 14 },
});
