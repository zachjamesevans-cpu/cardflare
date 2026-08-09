import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { ApiError, postFlare, searchCards, type CardHit } from "../api";
import { Body, Button, Card, CardImage, ErrorLine, Input, Muted, Tap, Title } from "../ui";
import { colors, radius, spacing } from "../theme";

/**
 * Posting a Flare from the app: search the catalog, pick a card, say
 * which printing (any, by default — which is what most requests mean),
 * how many, and an optional note. The same ranked search and the same
 * server-side validation as the website's picker — and the same *look*:
 * card art beside every result (tap any of it for a readable size),
 * every printing shown with its own art so an alternate is chosen by
 * eye, exactly as the website's list does.
 */

/** The art a card leads with: its first pictured printing. */
function leadArt(hit: CardHit): string | null {
  return hit.printings.find((printing) => printing.imageUrl)?.imageUrl ?? null;
}
export function PostFlareScreen({
  code,
  resetSignal,
}: {
  code: string;
  /** Bumped by the host (the Flare tab on re-tap) to pop back to search. */
  resetSignal?: number;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<CardHit[]>([]);
  /** Which result's versions are unfolded — one at a time, like the website. */
  const [versionsFor, setVersionsFor] = useState<string | null>(null);
  const [picked, setPicked] = useState<CardHit | null>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [posted, setPosted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // So the posted-state reset never fires into an unmounted screen.
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  // Tapping the Flare tab means "different card": back to a blank
  // search, typed text and all. The tab bumps the counter; the value
  // is noise.
  useEffect(() => {
    if (resetSignal !== undefined) {
      setPicked(null);
      setPrintingId(null);
      setQuery("");
      setHits([]);
      setVersionsFor(null);
    }
  }, [resetSignal]);

  /*
   * Swipe back from the picked card to the search — by hand, because
   * both halves are one screen, so the navigator's back gesture has
   * nothing to pop. A drag starting at the left edge carries the card
   * step with the finger; past the threshold it slides off and the
   * search returns, short of it it springs back. Locked while a post
   * is in flight or the "Posted ✓" beat is showing.
   *
   * Claimed in the CAPTURE phase, on the container wrapping the
   * ScrollView: the scroll view competes for every drag and was winning
   * before the child handler got a look — capture is checked parent-
   * first, so an edge-started, clearly horizontal drag is ours before
   * the scroll or any button hears about it.
   */
  const slide = useRef(new Animated.Value(0)).current;
  const swipeLocked = useRef(false);
  swipeLocked.current = busy || posted || picked === null;

  const backSwipe = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_event, gesture) =>
        !swipeLocked.current &&
        gesture.x0 < 100 &&
        gesture.dx > 12 &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
      onPanResponderMove: (_event, gesture) => {
        slide.setValue(Math.max(0, gesture.dx));
      },
      onPanResponderRelease: (_event, gesture) => {
        if (gesture.dx > 90) {
          Animated.timing(slide, {
            toValue: Dimensions.get("window").width,
            duration: 160,
            useNativeDriver: true,
          }).start(() => {
            setPicked(null);
            setPrintingId(null);
            slide.setValue(0);
          });
        } else {
          Animated.spring(slide, {
            toValue: 0,
            bounciness: 4,
            useNativeDriver: true,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(slide, {
          toValue: 0,
          bounciness: 4,
          useNativeDriver: true,
        }).start();
      },
    }),
  ).current;

  // Debounced search: a keystroke pause is the request, not every letter.
  // Results deliberately survive picking a card — the search screen stays
  // mounted underneath, so the back-swipe reveals it exactly as it was.
  useEffect(() => {
    if (query.trim().length < 2) {
      setHits([]);
      return;
    }

    const timer = setTimeout(() => {
      void searchCards(query.trim())
        .then((result) => setHits(result.cards))
        .catch(() => setHits([]));
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const submit = async () => {
    if (!picked) return;
    setBusy(true);
    setError(null);

    try {
      await postFlare(code, {
        cardId: picked.id,
        printingId,
        quantity,
        note: note.trim() || undefined,
      });

      /*
       * The confirmation happens here, on the button that was pressed —
       * "Posted ✓" and a success buzz — instead of yanking the player to
       * the Room tab to go find their own card on the board. A breath
       * later the form clears itself, ready for the next card, which is
       * what someone working down a want list actually does next.
       */
      setBusy(false);
      setPosted(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
      resetTimer.current = setTimeout(() => {
        setPosted(false);
        setPicked(null);
        setPrintingId(null);
        setQuantity(1);
        setNote("");
        setQuery("");
      }, 1600);
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.code === "at-cap"
          ? "You have hit the Flare cap for this room."
          : "Could not post the Flare. Try again.",
      );
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1 }} {...backSwipe.panHandlers}>
      {/* The search screen never unmounts: it is the surface the picked
          card slides over, so a slow back-swipe reveals it live — query,
          results and unfolded versions exactly as they were left. */}
      <ScrollView contentContainerStyle={{ padding: spacing(4), gap: spacing(3) }}>
        <Card>
          <Title>What are you hunting?</Title>
          <Input
            value={query}
            onChangeText={setQuery}
            placeholder="Card name or number"
            autoFocus
            autoCorrect={false}
          />
          {query.trim().length >= 2 && hits.length === 0 && (
            <Muted>Nothing yet — keep typing, or check the number.</Muted>
          )}
          {hits.map((hit) => (
            <View
              key={hit.id}
              style={{
                borderColor: colors.border,
                borderWidth: 1,
                borderRadius: radius.control,
                padding: spacing(2),
                gap: spacing(2),
              }}
            >
              <Tap
                onPress={() => {
                  setPicked(hit);
                  setPrintingId(null);
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing(3),
                }}
              >
                <CardImage
                  imageUrl={leadArt(hit)}
                  width={40}
                  name={hit.name}
                  cardNumber={hit.cardNumber}
                />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: colors.textPrimary, fontWeight: "700" }}>
                    {hit.name}
                  </Text>
                  <Muted>{hit.cardNumber}</Muted>
                </View>
              </Tap>

              {/*
               * The website's versions list, on a tap: which physical card —
               * base art, alt art, SP, promo — with its own artwork. Picking
               * a version here selects the card *with that printing*, so the
               * alt-art hunter never chooses twice.
               */}
              <Tap
                onPress={() =>
                  setVersionsFor(versionsFor === hit.id ? null : hit.id)
                }
                hitSlop={8}
              >
                <Text style={{ color: colors.accent, fontSize: 13 }}>
                  {versionsFor === hit.id
                    ? "Hide versions"
                    : hit.printings.length === 1
                      ? "Show version ▾"
                      : `Show ${hit.printings.length} versions ▾`}
                </Text>
              </Tap>

              {versionsFor === hit.id &&
                hit.printings.map((printing) => (
                  <Tap
                    key={printing.id}
                    onPress={() => {
                      setPicked(hit);
                      setPrintingId(printing.id);
                    }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: spacing(3),
                      backgroundColor: colors.elevated,
                      borderColor: colors.border,
                      borderWidth: 1,
                      borderRadius: radius.control,
                      padding: spacing(2),
                    }}
                  >
                    <CardImage
                      imageUrl={printing.imageUrl}
                      width={36}
                      name={hit.name}
                      cardNumber={hit.cardNumber}
                      caption={printing.label ?? "Standard printing"}
                    />
                    <Text
                      style={{ color: colors.textSecondary, flex: 1, fontSize: 13 }}
                    >
                      {printing.label ?? "Standard printing"}
                    </Text>
                  </Tap>
                ))}
            </View>
          ))}
        </Card>
      </ScrollView>

      {picked && (
        <Animated.View
          style={[
            StyleSheet.absoluteFillObject,
            {
              backgroundColor: colors.canvas,
              transform: [{ translateX: slide }],
              shadowColor: "#000",
              shadowOffset: { width: -4, height: 0 },
              shadowOpacity: 0.35,
              shadowRadius: 10,
              elevation: 8,
            },
          ]}
        >
        <ScrollView contentContainerStyle={{ padding: spacing(4), gap: spacing(3) }}>
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(3) }}>
            <CardImage
              imageUrl={
                picked.printings.find((printing) => printing.id === printingId)
                  ?.imageUrl ?? leadArt(picked)
              }
              width={64}
              name={picked.name}
              cardNumber={picked.cardNumber}
              caption={
                picked.printings.find((printing) => printing.id === printingId)
                  ?.label ?? "Any printing"
              }
            />
            <View style={{ flex: 1 }}>
              <Muted>Posting a Flare for</Muted>
              <Title>{picked.name}</Title>
              <Muted>{picked.cardNumber}</Muted>
            </View>
          </View>

          <Body>Which printing?</Body>
          <View style={{ gap: spacing(2) }}>
            {[
              {
                id: null as string | null,
                label: "Any printing",
                imageUrl: null as string | null,
              },
              ...picked.printings.map((printing) => ({
                id: printing.id as string | null,
                label: printing.label ?? "Standard printing",
                imageUrl: printing.imageUrl,
              })),
            ].map((option) => (
              <Tap
                key={option.id ?? "any"}
                onPress={() => setPrintingId(option.id)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing(3),
                  backgroundColor: colors.elevated,
                  borderColor:
                    printingId === option.id ? colors.accent : colors.border,
                  borderWidth: printingId === option.id ? 2 : 1,
                  borderRadius: radius.control,
                  padding: spacing(2),
                }}
              >
                {option.id !== null && (
                  <CardImage
                    imageUrl={option.imageUrl}
                    width={36}
                    name={picked.name}
                    cardNumber={picked.cardNumber}
                    caption={option.label}
                  />
                )}
                <Text style={{ color: colors.textSecondary, flex: 1, fontSize: 13 }}>
                  {option.label}
                </Text>
              </Tap>
            ))}
          </View>

          <Body>How many?</Body>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(3) }}>
            <Button
              label="−"
              variant="secondary"
              onPress={() => setQuantity((q) => Math.max(1, q - 1))}
            />
            <Text style={{ color: colors.textPrimary, fontSize: 20, fontWeight: "700" }}>
              {quantity}
            </Text>
            <Button
              label="+"
              variant="secondary"
              onPress={() => setQuantity((q) => Math.min(99, q + 1))}
            />
          </View>

          <Input
            value={note}
            onChangeText={setNote}
            placeholder="Note for the room (optional)"
            maxLength={120}
          />

          <ErrorLine message={error} />

          <Button
            label={posted ? "Posted ✓" : busy ? "Posting…" : "Post the Flare"}
            onPress={() => void submit()}
            busy={busy}
            disabled={busy || posted}
          />
          <Button
            label="Pick a different card"
            variant="secondary"
            onPress={() => setPicked(null)}
            disabled={busy || posted}
          />
        </Card>
        </ScrollView>
        </Animated.View>
      )}
    </View>
  );
}
