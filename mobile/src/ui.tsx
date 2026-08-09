import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState, type PropsWithChildren } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";

import { colors, radius, spacing } from "./theme";

/** The handful of primitives every screen shares, in the site's skin. */

/**
 * Every touchable in the app, and how touching feels.
 *
 * A finger landing squeezes the control down a hair, instantly; letting
 * go springs it back with a little overshoot, and the tap itself lands a
 * light haptic tick. That squeeze-and-pop is what makes a button read as
 * a physical thing rather than a picture of one — the founder named
 * Instagram as the reference, and this is the same recipe.
 *
 * The haptic fires on the completed tap, not on touch-down: a thumb
 * starting a scroll brushes controls constantly, and a phone that buzzes
 * while scrolling teaches people to stop trusting the buzz.
 */
export function Tap({
  onPress,
  disabled = false,
  hitSlop,
  style,
  children,
}: PropsWithChildren<{
  onPress?: () => void;
  disabled?: boolean;
  hitSlop?: number;
  style?: StyleProp<ViewStyle>;
}>) {
  const scale = useRef(new Animated.Value(1)).current;

  return (
    <Pressable
      onPress={() => {
        if (!onPress) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress();
      }}
      disabled={disabled}
      hitSlop={hitSlop}
      onPressIn={() => {
        Animated.spring(scale, {
          toValue: 0.95,
          speed: 60,
          bounciness: 0,
          useNativeDriver: true,
        }).start();
      }}
      onPressOut={() => {
        Animated.spring(scale, {
          toValue: 1,
          speed: 25,
          bounciness: 12,
          useNativeDriver: true,
        }).start();
      }}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

/**
 * Card art at trading-card proportions (63×88), sized by width — and,
 * like the website's thumbnails, tappable to see the card at a readable
 * size: name, number and version on top, tap anywhere to put it away.
 * A card without provider art gets an honest empty frame, and an empty
 * frame promises no bigger picture, so it does not open one.
 */
export function CardImage({
  imageUrl,
  width,
  name,
  cardNumber,
  caption,
}: {
  imageUrl: string | null;
  width: number;
  name: string;
  cardNumber: string;
  /** The printing, so the large view says which version is being shown. */
  caption?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const window = useWindowDimensions();

  /*
   * The zoom's fade is driven by hand, not by the Modal. The built-in
   * `animationType="fade"` tears the native modal down while the fade is
   * still finishing, and that teardown lands as a visible flash of the
   * screen behind — the founder felt it on device. So the modal itself
   * presents and dismisses with no animation at all: opening fades the
   * backdrop in ourselves, and closing fades it all the way out *first*,
   * only unmounting the modal once nothing is left to see.
   */
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (open) {
      Animated.timing(fade, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }).start();
    }
  }, [open, fade]);

  const close = () => {
    Animated.timing(fade, {
      toValue: 0,
      duration: 120,
      useNativeDriver: true,
    }).start(() => setOpen(false));
  };

  const frame = {
    width,
    height: Math.round((width * 88) / 63),
    borderRadius: radius.control / 2,
    backgroundColor: colors.canvas,
    borderColor: colors.border,
    borderWidth: 1,
  };

  if (!imageUrl) return <View style={frame} />;

  const large = Math.min(window.width - spacing(14), 380);

  return (
    <>
      <Tap onPress={() => setOpen(true)}>
        <Image source={{ uri: imageUrl }} style={frame} resizeMode="cover" />
      </Tap>

      <Modal visible={open} transparent animationType="none" onRequestClose={close}>
        <Animated.View style={[styles.zoomBackdrop, { opacity: fade }]}>
          <Pressable style={styles.zoomFill} onPress={close}>
            {/* A whisper of scale rides the fade, so the panel settles
                into place instead of just appearing. */}
            <Animated.View
              style={[
                styles.zoomPanel,
                {
                  transform: [
                    {
                      scale: fade.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.97, 1],
                      }),
                    },
                  ],
                },
              ]}
            >
              <View style={{ alignSelf: "stretch" }}>
                <Text style={styles.title} numberOfLines={1}>
                  {name}
                </Text>
                <Text style={styles.muted}>
                  {cardNumber}
                  {caption ? ` · ${caption}` : ""}
                </Text>
              </View>
              <Image
                source={{ uri: imageUrl }}
                style={{
                  width: large,
                  height: Math.round((large * 88) / 63),
                  borderRadius: radius.control,
                  backgroundColor: colors.canvas,
                }}
                resizeMode="contain"
              />
              <Text style={styles.muted}>Tap anywhere to close</Text>
            </Animated.View>
          </Pressable>
        </Animated.View>
      </Modal>
    </>
  );
}

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
  disabled = false,
  variant = "primary",
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  /** Inert without the spinner — e.g. while "Posted ✓" is on display. */
  disabled?: boolean;
  variant?: "primary" | "secondary";
}) {
  return (
    <Tap
      onPress={onPress}
      disabled={busy || disabled}
      style={[
        styles.button,
        variant === "secondary" && styles.buttonSecondary,
        busy && { opacity: 0.7 },
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
    </Tap>
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
  zoomBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
  },
  zoomFill: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing(5),
  },
  zoomPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.panel,
    padding: spacing(4),
    gap: spacing(3),
    alignItems: "center",
  },
});
