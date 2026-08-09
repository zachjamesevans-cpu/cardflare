import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";

import { ApiError, postFlare, searchCards, type CardHit } from "../api";
import {
  Body,
  Button,
  Card,
  CardImage,
  ErrorLine,
  Input,
  Muted,
  Tap,
  Title,
} from "../ui";
import { colors, radius, spacing } from "../theme";

/**
 * Posting a Flare, all on one screen. Tapping a result unfolds it in
 * place — every version with its art ("Any printing" first), quantity,
 * note and the Post button, right inside the row. Founder-driven shape:
 * the whole card is the hitbox, the unfold is the same motion the old
 * versions dropdown made, and nothing navigates away, so there is no
 * second screen to swipe back from and no state to lose. Tapping the
 * card header again folds it shut.
 *
 * Same ranked search, same server-side validation, same row anatomy as
 * the website's picker — art, highlighted match, meta line, stats.
 */

/** The art a card leads with: the base printing, the website's rule. */
function leadArt(hit: CardHit): string | null {
  return (
    hit.printings.find((printing) => printing.id === hit.basePrintingId)
      ?.imageUrl ??
    hit.printings.find((printing) => printing.imageUrl)?.imageUrl ??
    null
  );
}

/** The website's search highlight: the matched part of a name lights up. */
function Highlighted({ text, term }: { text: string; term: string }) {
  const needle = term.trim().toLowerCase();
  const at = needle ? text.toLowerCase().indexOf(needle) : -1;
  if (at < 0) return <>{text}</>;

  return (
    <>
      {text.slice(0, at)}
      <Text style={{ backgroundColor: `${colors.accent}40` }}>
        {text.slice(at, at + needle.length)}
      </Text>
      {text.slice(at + needle.length)}
    </>
  );
}

/** The stats that apply differ by card type, so only present ones render. */
function Stats({ hit }: { hit: CardHit }) {
  const stats = [
    hit.cost !== null && { label: "Cost", value: hit.cost },
    hit.life !== null && { label: "Life", value: hit.life },
    hit.power !== null && { label: "Power", value: hit.power },
    hit.counter ? { label: "Counter", value: hit.counter } : false,
  ].filter(Boolean) as { label: string; value: number }[];

  if (stats.length === 0) return null;

  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: spacing(3) }}>
      {stats.map((stat) => (
        <Text key={stat.label} style={{ fontSize: 12 }}>
          <Text style={{ color: colors.textMuted }}>{stat.label} </Text>
          <Text style={{ color: colors.textSecondary }}>{stat.value}</Text>
        </Text>
      ))}
    </View>
  );
}

export function PostFlareScreen({
  code,
  resetSignal,
}: {
  code: string;
  /** Bumped by the Flare tab on a re-tap while focused: "different card". */
  resetSignal?: number;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<CardHit[]>([]);

  /** Which result is unfolded — one at a time; the form lives inside it. */
  const [expanded, setExpanded] = useState<string | null>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [posted, setPosted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // So the posted-beat fold-up never fires into an unmounted screen.
  const foldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (foldTimer.current) clearTimeout(foldTimer.current);
    },
    [],
  );

  // Re-tapping the Flare tab while already here means "different card":
  // wipe the typed search too. Arriving from another tab never resets —
  // the hub only bumps the counter when this tab was already focused.
  useEffect(() => {
    if (resetSignal) {
      setQuery("");
      setHits([]);
      setExpanded(null);
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

  /** Unfold a card with a fresh form, or fold it back up. */
  const toggle = (hit: CardHit) => {
    if (busy) return;
    if (expanded === hit.id) {
      setExpanded(null);
      return;
    }
    setExpanded(hit.id);
    setPrintingId(null);
    setQuantity(1);
    setNote("");
    setError(null);
    setPosted(false);
  };

  const submit = async (hit: CardHit) => {
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
      // "Posted ✓" and a success buzz — then the row folds itself up,
      // search intact, ready for the next card on the want list.
      setBusy(false);
      setPosted(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
      foldTimer.current = setTimeout(() => {
        setExpanded(null);
        setPosted(false);
      }, 1400);
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
        {hits.map((hit) => {
          const open = expanded === hit.id;

          return (
            <View
              key={hit.id}
              style={{
                borderColor: open ? `${colors.accent}80` : colors.border,
                borderWidth: 1,
                borderRadius: radius.control,
                padding: spacing(2),
                gap: spacing(2),
              }}
            >
              <Tap
                onPress={() => toggle(hit)}
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: spacing(3),
                }}
              >
                <CardImage
                  imageUrl={leadArt(hit)}
                  width={40}
                  name={hit.name}
                  cardNumber={hit.cardNumber}
                />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ color: colors.textPrimary, fontWeight: "700" }}>
                    <Highlighted text={hit.name} term={query} />
                  </Text>
                  {/* The website's quiet line: number, type, colours — and
                      the printing label when there is only one version. */}
                  <View
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      columnGap: spacing(2),
                    }}
                  >
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                      <Highlighted text={hit.cardNumber} term={query} />
                    </Text>
                    {[
                      hit.printings.length === 1
                        ? (hit.printings[0]?.label ?? null)
                        : null,
                      hit.cardType,
                      hit.colors.length > 0 ? hit.colors.join(" / ") : null,
                    ]
                      .filter((part): part is string => !!part)
                      .map((part) => (
                        <Text
                          key={part}
                          style={{ color: colors.textMuted, fontSize: 12 }}
                        >
                          {part}
                        </Text>
                      ))}
                  </View>
                  <Stats hit={hit} />
                  {!open && hit.printings.length > 1 && (
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                      {`${hit.printings.length} versions — alt arts and promos`}
                    </Text>
                  )}
                </View>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                  {open ? "▴" : "▾"}
                </Text>
              </Tap>

              {/*
               * The whole Flare form, unfolded in place: pick the version
               * (any by default), say how many, add a note, post. Tapping
               * the card header folds it back up.
               */}
              {open && (
                <>
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
                            printingId === option.id
                              ? colors.accent
                              : colors.border,
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
                        <Text
                          style={{
                            color: colors.textSecondary,
                            flex: 1,
                            fontSize: 13,
                          }}
                        >
                          {option.label}
                        </Text>
                      </Tap>
                    ))}
                  </View>

                  <Body>How many?</Body>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: spacing(3),
                    }}
                  >
                    <Button
                      label="−"
                      variant="secondary"
                      onPress={() => setQuantity((q) => Math.max(1, q - 1))}
                    />
                    <Text
                      style={{
                        color: colors.textPrimary,
                        fontSize: 20,
                        fontWeight: "700",
                      }}
                    >
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
                    label={
                      posted ? "Posted ✓" : busy ? "Posting…" : "Post the Flare"
                    }
                    onPress={() => void submit(hit)}
                    busy={busy}
                    disabled={busy || posted}
                  />
                </>
              )}
            </View>
          );
        })}
      </Card>
    </ScrollView>
  );
}
