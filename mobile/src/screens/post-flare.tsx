import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";

import type { StackParams } from "../../App";
import { ApiError, postFlare, searchCards, type CardHit } from "../api";
import { Body, Button, Card, CardImage, ErrorLine, Input, Muted, Tap, Title } from "../ui";
import { colors, radius, spacing } from "../theme";

/**
 * Posting a Flare, in two real screens: the search, and the picked
 * card. Two screens rather than one screen with two moods, because the
 * navigator's native back gesture — the previous screen sliding out
 * from underneath, exactly as the founder asked — only exists between
 * real screens. Two hand-rolled swipe attempts lost gesture fights
 * with the ScrollView on the actual device; the platform's own gesture
 * does not lose.
 *
 * Same ranked search, same server-side validation as the website's
 * picker, and the same look: card art beside every result (tap art for
 * a readable size), every printing its own full-width bar.
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
  /** Bumped by the Flare tab on a re-tap while focused: "different card". */
  resetSignal?: number;
}) {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<CardHit[]>([]);
  /** Which result's versions are unfolded — one at a time, like the website. */
  const [versionsFor, setVersionsFor] = useState<string | null>(null);

  // Re-tapping the Flare tab while already here means "different card":
  // wipe the typed search too. Arriving from another tab never resets —
  // the hub only bumps the counter when this tab was already focused.
  useEffect(() => {
    if (resetSignal) {
      setQuery("");
      setHits([]);
      setVersionsFor(null);
    }
  }, [resetSignal]);

  // Debounced search: a keystroke pause is the request, not every letter.
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

  const pick = (hit: CardHit, printingId: string | null) => {
    navigation.navigate("FlareCard", { code, hit, printingId });
  };

  return (
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
              onPress={() => pick(hit, null)}
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
             * a version here opens the card *with that printing*, so the
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
                  onPress={() => pick(hit, printing.id)}
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
  );
}

/**
 * The picked card — a real stack screen, so swiping back to the search
 * is the platform's own gesture with the search visible underneath.
 */
export function FlareCardScreen({
  code,
  hit,
  printingId: initialPrintingId,
}: {
  code: string;
  hit: CardHit;
  printingId: string | null;
}) {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const [printingId, setPrintingId] = useState<string | null>(initialPrintingId);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [posted, setPosted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // So the posted-beat navigation never fires into an unmounted screen.
  const backTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (backTimer.current) clearTimeout(backTimer.current);
    },
    [],
  );

  const submit = async () => {
    setBusy(true);
    setError(null);

    try {
      await postFlare(code, {
        cardId: hit.id,
        printingId,
        quantity,
        note: note.trim() || undefined,
      });

      // The confirmation happens on the button that was pressed —
      // "Posted ✓" and a success buzz — then the screen slides itself
      // back to the search, ready for the next card on the want list.
      setBusy(false);
      setPosted(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
      backTimer.current = setTimeout(() => {
        if (navigation.canGoBack()) navigation.goBack();
      }, 1200);
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
    <ScrollView contentContainerStyle={{ padding: spacing(4), gap: spacing(3) }}>
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(3) }}>
          <CardImage
            imageUrl={
              hit.printings.find((printing) => printing.id === printingId)
                ?.imageUrl ?? leadArt(hit)
            }
            width={64}
            name={hit.name}
            cardNumber={hit.cardNumber}
            caption={
              hit.printings.find((printing) => printing.id === printingId)
                ?.label ?? "Any printing"
            }
          />
          <View style={{ flex: 1 }}>
            <Muted>Posting a Flare for</Muted>
            <Title>{hit.name}</Title>
            <Muted>{hit.cardNumber}</Muted>
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
            ...hit.printings.map((printing) => ({
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
                  name={hit.name}
                  cardNumber={hit.cardNumber}
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
      </Card>
    </ScrollView>
  );
}
