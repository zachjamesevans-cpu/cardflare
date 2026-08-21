import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState, type PropsWithChildren } from "react";
import {
  ActivityIndicator,
  Animated,
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

import { RemoteImage } from "./remote-image";

import { youHaveLabel } from "./held-label";
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
  accessibilityLabel,
  children,
}: PropsWithChildren<{
  onPress?: () => void;
  disabled?: boolean;
  hitSlop?: number;
  style?: StyleProp<ViewStyle>;
  /** For taps whose only content is a glyph - a "?" names nothing. */
  accessibilityLabel?: string;
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
      accessibilityRole={accessibilityLabel ? "button" : undefined}
      accessibilityLabel={accessibilityLabel}
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
/**
 * One card as the large view draws it - the app's copy of the website's
 * `ZoomCard`, so a shelf can be handed over in one array.
 */
export interface ZoomCard {
  imageUrl: string | null;
  name: string;
  cardNumber: string;
  caption?: string | null;
  note?: string | null;
  lookingFor?: number | null;
  stillNeeds?: number | null;
  direction?: "want" | "showcase";
  pledges?: { name: string; quantity: number }[];
  terms?: string | null;
  youHave?: { kind: "exact" | "other-printing"; count: number } | null;
}

/**
 * How far a thumb travels before it stops being a tap.
 *
 * Forty points: a shaky thumb is still a tap, a flick is a flick. The
 * same number the website uses, and used by BOTH halves of the zoom's
 * gesture, which is the point of it being a constant - the two used to
 * be two literals and could have drifted into a gap where a drag was
 * neither a swipe nor a press.
 */
const SWIPE = 40;

export function CardImage({
  imageUrl: ownImageUrl,
  width,
  name: ownName,
  cardNumber: ownCardNumber,
  caption: ownCaption,
  note: ownNote,
  lookingFor: ownLookingFor,
  stillNeeds: ownStillNeeds,
  direction: ownDirection = "want",
  pledges: ownPledges = [],
  terms: ownTerms = null,
  youHave: ownYouHave = null,
  siblings,
  position = 0,
}: {
  imageUrl: string | null;
  width: number;
  name: string;
  cardNumber: string;
  /** The printing, so the large view says which version is being shown. */
  caption?: string | null;
  /** The Flare's note, shown in the large view under the number. */
  note?: string | null;
  /** How many the Flare asks for, said in words in the large view. */
  lookingFor?: number | null;
  /** Copies still unpledged, when hands are already up. */
  stillNeeds?: number | null;
  /**
   * Which way the Flare points. A player opening a card from the
   * "Letting go" section was told the owner was looking for it.
   */
  direction?: "want" | "showcase";
  /** Who has raised a hand, by name - "Kaito is bringing 3". */
  pledges?: { name: string; quantity: number }[];
  /** Trade, cash or either, when it is not the assumed plain trade. */
  terms?: string | null;
  /**
   * What the viewer's own binder says about this card, or null. On tap and
   * only on tap, the same rule the website follows: the ring on the tile is
   * the glance, this sentence is the answer to the question it raises.
   */
  youHave?: { kind: "exact" | "other-printing"; count: number } | null;
  /**
   * The rest of the shelf this card was opened from, so the viewer can be
   * swiped along it - the website's `siblings`, same idea and same shape.
   *
   * The founder: "once you click on someone's showcase, or cards they're
   * looking for, you can swipe between them without having to click out to
   * see the next card."
   */
  siblings?: ZoomCard[];
  /** Where on that shelf this thumbnail sits. */
  position?: number;
}) {
  const [open, setOpen] = useState(false);

  /* A shelf of one is no shelf: no arrows, no counter, nothing new. */
  const shelf = siblings && siblings.length > 1 ? siblings : null;
  const [at, setAt] = useState(position);
  const shown = shelf ? (shelf[at] ?? shelf[0]) : null;

  /* Everything below reads these, so the panel draws whichever card the
     shelf is on; the thumbnail keeps its own. */
  const imageUrl = shown ? shown.imageUrl : ownImageUrl;
  const name = shown ? shown.name : ownName;
  const cardNumber = shown ? shown.cardNumber : ownCardNumber;
  const caption = shown ? shown.caption : ownCaption;
  const note = shown ? shown.note : ownNote;
  const lookingFor = shown ? shown.lookingFor : ownLookingFor;
  const stillNeeds = shown ? shown.stillNeeds : ownStillNeeds;
  const direction = shown ? (shown.direction ?? "want") : ownDirection;
  const pledges = shown ? (shown.pledges ?? []) : ownPledges;
  const terms = shown ? (shown.terms ?? null) : ownTerms;
  const youHave = shown ? (shown.youHave ?? null) : ownYouHave;

  /*
   * A swipe ends in a press, and a press anywhere here closes.
   *
   * WHICH IS WHY THE FLAG IS SET WHILE THE THUMB IS STILL DOWN. The
   * first cut set it in `onTouchEnd` and read it in the Pressable's
   * `onPress`, which reads like it happens in that order and does not:
   * a press comes out of the responder system and a touch event comes
   * out of the touch system, and the responder plugin is dispatched
   * first. So every swipe closed the card - reported from a phone as
   * "swiping between card flares immediately closes the card" - and
   * left the flag set behind it, so the next tap refused to close.
   *
   * Setting it in `onTouchMove` takes the ordering out of it entirely.
   * By the time either handler runs, the thumb has already travelled
   * and the answer is already recorded.
   */
  const swiped = useRef(false);
  const touchFrom = useRef<number | null>(null);

  const go = (delta: number) => {
    if (!shelf) return;
    setAt((current) => (current + delta + shelf.length) % shelf.length);
  };
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

  if (!ownImageUrl) return <View style={frame} />;

  const large = Math.min(window.width - spacing(14), 380);

  return (
    <>
      <Tap
        onPress={() => {
          setAt(position);
          setOpen(true);
        }}
      >
        <RemoteImage uri={ownImageUrl} style={frame} />
      </Tap>

      <Modal visible={open} transparent animationType="none" onRequestClose={close}>
        <Animated.View style={[styles.zoomBackdrop, { opacity: fade }]}>
          <Pressable
            style={styles.zoomFill}
            onPress={() => {
              if (swiped.current) return;
              close();
            }}
            onTouchStart={(event) => {
              touchFrom.current = event.nativeEvent.pageX;
              swiped.current = false;
            }}
            onTouchMove={(event) => {
              const from = touchFrom.current;
              if (from === null) return;
              if (Math.abs(event.nativeEvent.pageX - from) >= SWIPE) {
                swiped.current = true;
              }
            }}
            onTouchEnd={(event) => {
              const from = touchFrom.current;
              touchFrom.current = null;
              if (from === null || !shelf) return;

              const travelled = event.nativeEvent.pageX - from;
              if (Math.abs(travelled) < SWIPE) return;

              go(travelled < 0 ? 1 : -1);
            }}
          >
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
                {/* Said in words here even though the tile draws it as a
                    stack, for anyone who cannot read the layers. Both
                    truths when hands are up: the ask, and the gap. */}
                {lookingFor != null ? (
                  <Text style={styles.zoomLooking}>
                    {direction === "showcase"
                      ? lookingFor === 1
                        ? "Letting this go"
                        : `Letting go of ${lookingFor}`
                      : `Looking for ${lookingFor}${
                          stillNeeds != null && stillNeeds !== lookingFor
                            ? stillNeeds === 0
                              ? " · all spoken for"
                              : ` · still needs ${stillNeeds}`
                            : ""
                        }`}
                  </Text>
                ) : null}
                {/* Who is bringing what - the founder's ask: tap the
                    card, see "Kaito is bringing 3". */}
                {pledges.map((pledge, index) => (
                  <Text
                    key={index}
                    style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}
                  >
                    <Text style={{ color: colors.textPrimary, fontWeight: "600" }}>
                      {pledge.name}
                    </Text>
                    {` is bringing ${pledge.quantity}`}
                  </Text>
                ))}
                {terms ? <Text style={styles.zoomLooking}>{terms}</Text> : null}
                {/* Your own binder's answer, in the same green the ring on
                    the tile is drawn in. Same three phrases as the web. */}
                {youHave ? (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: spacing(1),
                      marginTop: 2,
                    }}
                  >
                    <MaterialCommunityIcons
                      name={
                        youHave.kind === "exact"
                          ? "package-variant-closed-check"
                          : "layers-outline"
                      }
                      size={15}
                      color={colors.success}
                    />
                    <Text
                      style={{ color: colors.success, fontSize: 13, fontWeight: "600" }}
                    >
                      {youHaveLabel(youHave.kind, youHave.count)}
                    </Text>
                  </View>
                ) : null}
                {/* The tile has no room for the note; the zoom is where
                    it gets read. */}
                {note ? <Text style={styles.zoomNote}>{note}</Text> : null}

                {/* The swipe is the gesture and the one nobody can see;
                    this row says it exists, and is the whole feature for
                    anybody who does not think to try. */}
                {shelf ? (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginTop: spacing(2),
                    }}
                  >
                    <Tap onPress={() => go(-1)} hitSlop={12}>
                      <MaterialCommunityIcons
                        name="chevron-left"
                        size={26}
                        color={colors.textSecondary}
                      />
                    </Tap>
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                      {`${at + 1} of ${shelf.length}`}
                    </Text>
                    <Tap onPress={() => go(1)} hitSlop={12}>
                      <MaterialCommunityIcons
                        name="chevron-right"
                        size={26}
                        color={colors.textSecondary}
                      />
                    </Tap>
                  </View>
                ) : null}
              </View>
              {/* A sibling can be a card with no art of its own; the
                  panel shows the empty frame rather than a broken box. */}
              <RemoteImage
                uri={imageUrl}
                contentFit="contain"
                style={{
                  width: large,
                  height: Math.round((large * 88) / 63),
                  borderRadius: radius.control,
                  backgroundColor: colors.canvas,
                }}
              />
              <Text style={styles.muted}>Tap anywhere to close</Text>
            </Animated.View>
          </Pressable>
        </Animated.View>
      </Modal>
    </>
  );
}

export function Card({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.card, style]}>{children}</View>;
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

/**
 * A Button that works out its own pending state from the work it starts.
 *
 * The founder's report: "when clicking 'post all'... it kinda just
 * stalls there. The button should give you immediate feedback... so
 * people don't feel they have to click it multiple times." Every button
 * that reaches the network needed the same three lines of state, and
 * three lines copied nine times is three lines forgotten on the tenth.
 *
 * Hand it an async onPress: it disables, shows the spinner and the
 * pending label until the promise settles, and refuses re-entry while
 * in flight. Unmount-safe, because a room can navigate away mid-post.
 */
export function AsyncButton({
  label,
  pendingLabel,
  onPress,
  disabled = false,
  variant = "primary",
}: {
  label: string;
  /** What it says while working. "Posting…" beats a bare spinner. */
  pendingLabel: string;
  onPress: () => Promise<unknown>;
  disabled?: boolean;
  variant?: "primary" | "secondary";
}) {
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  const running = useRef(false);

  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  return (
    <Button
      label={busy ? pendingLabel : label}
      busy={busy}
      disabled={disabled}
      variant={variant}
      onPress={() => {
        if (running.current) return;
        running.current = true;
        setBusy(true);
        void Promise.resolve(onPress())
          .catch(() => {
            // The screen's own error line is the truthful report; a
            // button must not be the thing that swallows a page.
          })
          .finally(() => {
            running.current = false;
            if (alive.current) setBusy(false);
          });
      }}
    />
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

/**
 * A handle field: an input with the at-sign drawn inside it.
 *
 * Inside rather than beside, so this input keeps the same left edge as
 * whatever name field sits above it. A prefix outside the box pushes the
 * text in by its own width, and a ragged left edge on a two-field form
 * is exactly the "all over the place" the founder has called out.
 */
export function HandleInput(props: TextInputProps) {
  return (
    <View style={{ justifyContent: "center" }}>
      <Text style={styles.handlePrefix}>@</Text>
      <TextInput
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        {...props}
        style={[styles.input, styles.handleInput]}
      />
    </View>
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
    borderRadius: radius.card,
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
  /* Room for the at-sign, which is drawn over this padding. */
  handleInput: { paddingLeft: spacing(7) },
  handlePrefix: {
    position: "absolute",
    left: spacing(3.5),
    color: colors.textMuted,
    fontSize: 16,
    zIndex: 1,
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
    borderRadius: radius.card,
    padding: spacing(4),
    gap: spacing(3),
    alignItems: "center",
  },
  zoomNote: {
    color: colors.textSecondary,
    fontSize: 13,
    fontStyle: "italic",
    marginTop: spacing(1),
  },
  zoomLooking: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: "600",
    marginTop: spacing(1),
  },
});
