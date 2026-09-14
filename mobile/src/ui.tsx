import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState, type PropsWithChildren } from "react";
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  type ScrollViewProps,
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
/**
 * How much of each neighbour shows beside the card being read, and the
 * air between them. Small on purpose: the point is a hint that there is
 * more to the left and right, not a three-up gallery.
 */
/**
 * Hand touches to the cards immediately.
 *
 * iOS holds a touch back to decide whether it is the start of a scroll,
 * and a tap that ends inside that window never reaches the card at all -
 * which is exactly what happened: the dismiss did nothing until this was
 * set. Safe to turn off, because whether a gesture was a drag is
 * answered by the rail's own `onScrollBeginDrag`, not by whether the
 * press got cancelled.
 *
 * Spread through a cast because `delaysContentTouches` is not in React
 * Native 0.81's TypeScript surface for ScrollView. It is still read
 * natively - RCTScrollView.m - and the behaviour changed the moment it
 * was passed, so the prop is real and only the typing is missing.
 */
const IMMEDIATE_TOUCHES = {
  delaysContentTouches: false,
} as unknown as ScrollViewProps;

const PEEK_WIDTH = 26;
const PEEK_GAP = 8;

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
  /**
   * The offer this viewer can make on the card, or null when it is
   * their own, or a card on offer rather than a want. The website's
   * `ZoomCard.offer`, with the room's calls attached.
   */
  offer?: ZoomOffer | null;
}

export interface ZoomOffer {
  /** The board is open before the event: "I'll bring it", not "I got it". */
  early: boolean;
  /** How many the Flare asks for; more than one asks how many you have. */
  quantity: number;
  /** The viewer's standing offer, when they already raised a hand. */
  own: { quantity: number; message: string | null } | null;
  onOffer: (message?: string, quantity?: number) => Promise<void>;
  onWithdraw: () => Promise<void>;
}

/** The website's limit on the note that rides with an offer. */
const MAX_OFFER_MESSAGE = 80;

/**
 * The offer, inside the zoom.
 *
 * The founder, from a phone: the handshake under a tile "is a bit
 * small", and once the card is open at full size there should be "a
 * text field to message someone, offer, etc." The same three things
 * the website's row asks: where to find you, how many, and the button.
 * Wrapped in its own Pressable so a tap inside it does not reach the
 * backdrop, which closes the card.
 */
function ZoomOfferForm({ offer }: { offer: ZoomOffer }) {
  const [message, setMessage] = useState("");
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);

  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await work();
    } finally {
      setBusy(false);
    }
  };

  if (offer.own) {
    return (
      <Pressable onPress={() => undefined} style={styles.zoomOfferOn}>
        <Text style={{ color: colors.textSecondary, fontSize: 13, flexShrink: 1 }}>
          <Text style={{ color: colors.accent, fontWeight: "600" }}>
            {offer.early ? "You've got them. " : "You offered. "}
          </Text>
          {offer.own.quantity > 1 ? `You said ${offer.own.quantity} copies. ` : ""}
          {offer.own.message
            ? `They were told: \u201c${offer.own.message}\u201d`
            : "They can see your name, so keep an eye out."}
        </Text>
        <Tap onPress={() => void run(offer.onWithdraw)} disabled={busy} hitSlop={6}>
          <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: "600" }}>
            {busy ? "Withdrawing…" : "Withdraw"}
          </Text>
        </Tap>
      </Pressable>
    );
  }

  return (
    <Pressable onPress={() => undefined} style={styles.zoomOffer}>
      <Input
        value={message}
        onChangeText={setMessage}
        placeholder="Where to find you? (optional)"
        maxLength={MAX_OFFER_MESSAGE}
        returnKeyType="done"
      />
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}>
        {offer.quantity > 1 ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(1) }}>
            <Tap
              onPress={() => setCount((current) => Math.max(1, current - 1))}
              hitSlop={6}
              style={styles.zoomStep}
            >
              <Text style={styles.zoomStepGlyph}>−</Text>
            </Tap>
            <Text
              style={{
                color: colors.textPrimary,
                fontWeight: "700",
                minWidth: 18,
                textAlign: "center",
              }}
            >
              {count}
            </Text>
            <Tap
              onPress={() => setCount((current) => Math.min(offer.quantity, current + 1))}
              hitSlop={6}
              style={styles.zoomStep}
            >
              <Text style={styles.zoomStepGlyph}>+</Text>
            </Tap>
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <Button
            label={busy ? "Offering…" : offer.early ? "I'll bring it" : "I got it"}
            busy={busy}
            onPress={() =>
              void run(() =>
                offer.onOffer(
                  message.trim() || undefined,
                  offer.quantity > 1 ? count : undefined,
                ),
              )
            }
          />
        </View>
      </View>
    </Pressable>
  );
}


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
  offer: ownOffer = null,
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
  /** The offer form, for another player's want. See `ZoomCard.offer`. */
  offer?: ZoomOffer | null;
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

  /*
   * Did this gesture scroll the rail?
   *
   * The founder wants both: "make it so that you can still tap anywhere
   * to close that screen. even though ther's a swipe thing now." A tap
   * on the card should dismiss, a drag on the same card should turn the
   * page, and React Native does NOT cancel the press for us here -
   * wrapping each card in a Pressable and trusting that closed the zoom
   * on every swipe, measured on the simulator.
   *
   * So the RAIL says whether it moved. `onScrollBeginDrag` only fires
   * when a finger actually drags it, so a press that arrives with this
   * still false was a tap and nothing else.
   */
  const scrolled = useRef(false);
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
  const offer = shown ? (shown.offer ?? null) : ownOffer;


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

  /*
   * With neighbours showing, the hero gives up the width they occupy.
   *
   * That is the whole trade the founder asked for - "you should be able
   * to see the card to the left of it, and the right of" - and on a
   * phone there is no version of it that keeps the hero at full width.
   * PEEK is deliberately small: enough card to recognise as a card,
   * little enough that the one being read still dominates.
   */
  const hero = shelf ? large - 2 * (PEEK_WIDTH + PEEK_GAP) : large;


  /*
   * THE SHELF IS A PAGER, not a slideshow.
   *
   * It used to read the thumb's travel itself and swap `at` when the
   * distance crossed a threshold, so the card CHANGED rather than moved
   * - the founder: "i think you should actually be able to swipe
   * between them. and it's like a smooth animation... right now it just
   * fades to each different card."
   *
   * A horizontal ScrollView does the whole thing natively: the cards
   * follow the finger, they rubber-band at the ends, and momentum lands
   * them on a card instead of nearest-neighbour-ing them. `page` is the
   * distance between two cards' left edges, which is what snapping is
   * measured in, and the side padding is what lets the FIRST and LAST
   * card sit centred with their neighbour showing beside them.
   */
  const page = hero + PEEK_GAP;
  const sidePad = (large - hero) / 2;


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
          {/*
           * THE CLOSER SITS BEHIND, IT DOES NOT WRAP.
           *
           * It used to be a Pressable around the whole modal, and that
           * is what stopped the card rail working: a Pressable claims
           * the touch when a finger lands, so the horizontal ScrollView
           * inside it was never handed the pan and the cards did not
           * move a pixel - measured, not guessed, by shooting a frame
           * mid-drag with the finger still down and finding it identical
           * to the frame at rest.
           *
           * Behind and absolutely filled, the rail owns its own gesture
           * and a tap anywhere off the panel still closes. `box-none` on
           * the layer above lets those taps through to it.
           */}
          <Pressable style={StyleSheet.absoluteFill} onPress={close} />
          <View style={styles.zoomFill} pointerEvents="box-none">
            {/* A whisper of scale rides the fade, so the panel settles
                into place instead of just appearing. The keyboard, when
                the offer's field wakes it, pushes the panel up. */}
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "position" : undefined}
              pointerEvents="box-none"
            >
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
              <Pressable style={{ alignSelf: "stretch" }} onPress={close}>
                {/* Centred over the card they name. The founder: "center
                    the text. so, for example, fire first and op15-020
                    should be centered on that screen." Only these two -
                    a note runs to several lines and centred prose is
                    harder to read than the tidiness is worth. */}
                <Text
                  style={[styles.title, { textAlign: "center" }]}
                  numberOfLines={1}
                >
                  {name}
                </Text>
                <Text style={[styles.muted, { textAlign: "center" }]}>
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

                {/*
                  * NOTHING BUT THE CARDS.
                  *
                  * There was a counter here reading "2 of 6" between two
                  * chevrons. The counter went first - "i dont think the
                  * '2 of 6' thing is necessary when viewing a full size
                  * card... you should be able to see the card to the
                  * left of it, and the right of, so it contextually
                  * tells you that you can swipe" - and the chevrons
                  * followed: "i still would like to be able to remove
                  * the 'arrows' when looking at cards up top. no need to
                  * have those. then remove the vertical space that is
                  * dead space."
                  *
                  * Both were explaining a gesture that now explains
                  * itself. The rail below tracks the finger and the
                  * neighbours are visible at both edges, so a control
                  * that did the same job in words was a row of chrome
                  * between the title and the art.
                  */}

                {/* Keyed on the shelf position, so a half-typed note does
                    not ride along to the next card. */}
                {offer ? <ZoomOfferForm key={shelf ? at : "own"} offer={offer} /> : null}
              </Pressable>
              {/*
                * The card, with its neighbours showing at the edges.
                *
                * A sibling can be a card with no art of its own; the
                * panel shows the empty frame rather than a broken box.
                *
                * Each neighbour is drawn at the SAME size as the hero
                * inside a narrow window that clips it, so what peeks out
                * is a real card edge at the right scale rather than a
                * squashed thumbnail. The left one is pushed over so its
                * RIGHT edge is the part that shows, which is the edge
                * that would come into view if you pulled it across.
                */}
              {shelf ? (
                /*
                 * THE RAIL LIVES IN A BOX OF EXACTLY ONE CARD.
                 *
                 * A horizontal ScrollView does not take a height from
                 * its own style here - it grew to 665pt inside a panel
                 * that should have been 566, which stretched the panel
                 * to the full height of the screen and pushed the title
                 * up under the dynamic island. The founder: "it should
                 * not take up the whole screen... it didn't have this
                 * issue like 30 mins ago." Measured off the screenshot,
                 * not guessed: the panel came back 831pt on an 874pt
                 * screen.
                 *
                 * A parent with a fixed width and height is not
                 * negotiable, and `flex: 1` inside it makes the rail
                 * fill exactly that and no more.
                 */
                <View
                  style={{
                    width: large,
                    height: Math.round((hero * 88) / 63),
                  }}
                >
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  /* Snap to a CARD, not to a screen: the viewport is
                     wider than a card, because the neighbours live in
                     the margins either side of it. */
                  {...IMMEDIATE_TOUCHES}
                  onScrollBeginDrag={() => {
                    scrolled.current = true;
                  }}
                  /* Cleared a beat after the gesture settles, so the
                     press that ends a swipe still sees it. */
                  onScrollEndDrag={() => {
                    setTimeout(() => {
                      scrolled.current = false;
                    }, 80);
                  }}
                  snapToInterval={page}
                  snapToAlignment="start"
                  decelerationRate="fast"
                  disableIntervalMomentum
                  contentOffset={{ x: position * page, y: 0 }}
                  /*
                   * BOTH dimensions, explicitly.
                   *
                   * A horizontal ScrollView with no height does not size
                   * itself to its cards - it takes the room that is
                   * going, which made the panel taller than its own
                   * content and pushed the title up off the top of the
                   * screen. The founder saw it as "it like clips into
                   * the top now."
                   */
                  style={{ flex: 1 }}
                  contentContainerStyle={{
                    paddingHorizontal: sidePad,
                    gap: PEEK_GAP,
                    alignItems: "center",
                  }}
                  /* The panel above follows the card you LANDED on, and
                     only once you have landed - retitling it mid-drag
                     reads as the text flickering. */
                  onMomentumScrollEnd={(event) => {
                    const landed = Math.round(
                      event.nativeEvent.contentOffset.x / page,
                    );
                    if (landed >= 0 && landed < shelf.length) setAt(landed);
                    scrolled.current = false;
                  }}
                >
                  {shelf.map((card, index) => (
                    /*
                     * A tap on the card closes; a drag on it scrolls.
                     * Both, from the same finger, because React Native
                     * cancels a press the moment the ScrollView under it
                     * claims the gesture - which is why the dismiss can
                     * live INSIDE the rail without being the thing that
                     * broke it when it was wrapped around the outside.
                     */
                    <Pressable
                      key={`${card.cardNumber}-${index}`}
                      onPress={() => {
                        if (scrolled.current) return;
                        close();
                      }}
                    >
                      <RemoteImage
                        uri={card.imageUrl}
                        contentFit="contain"
                        style={{
                          width: hero,
                          height: Math.round((hero * 88) / 63),
                          borderRadius: radius.control,
                          backgroundColor: colors.canvas,
                        }}
                      />
                    </Pressable>
                  ))}
                </ScrollView>
                </View>
              ) : (
                <Pressable onPress={close}>
                  <RemoteImage
                    uri={imageUrl}
                    contentFit="contain"
                    style={{
                      width: hero,
                      height: Math.round((hero * 88) / 63),
                      borderRadius: radius.control,
                      backgroundColor: colors.canvas,
                    }}
                  />
                </Pressable>
              )}
              <Tap onPress={close} hitSlop={8}>
                <Text style={styles.muted}>Tap anywhere to close</Text>
              </Tap>
            </Animated.View>
            </KeyboardAvoidingView>
          </View>
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
      {...props}
      /*
       * After the spread and merged, never before it. A caller that
       * only wants a taller box — the deck-list paste field asks for
       * minHeight and top-aligned text — used to replace this whole
       * style, and the field lost its border, its background and its
       * padding: a placeholder floating on the card with nothing round
       * it. HandleInput has always done it this way; now so does this.
       */
      style={[styles.input, props.style]}
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
  zoomOffer: {
    alignSelf: "stretch",
    gap: spacing(2),
    marginTop: spacing(2),
    padding: spacing(2),
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
  },
  zoomOfferOn: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(2),
    marginTop: spacing(2),
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2),
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.accentMuted,
    backgroundColor: colors.elevated,
  },
  zoomStep: {
    width: 32,
    height: 32,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  zoomStepGlyph: { color: colors.textPrimary, fontSize: 18, fontWeight: "700" },
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
