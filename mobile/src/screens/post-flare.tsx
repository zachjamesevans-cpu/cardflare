import { useEffect, useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";

import { ApiError, postFlare, searchCards, type CardHit } from "../api";
import { Body, Button, Card, ErrorLine, Input, Muted, Title } from "../ui";
import { colors, radius, spacing } from "../theme";

/**
 * Posting a Flare from the app: search the catalog, pick a card, say
 * which printing (any, by default — which is what most requests mean),
 * how many, and an optional note. The same ranked search and the same
 * server-side validation as the website's picker — and the same *look*:
 * card art beside every result, every printing shown with its own art
 * so an alternate is chosen by eye, exactly as the website's list does.
 */

/**
 * The catalog's art, at trading-card proportions (63×88mm), sized by
 * width. Cards without a provider image get an honest empty frame —
 * never someone else's artwork.
 */
function Art({ imageUrl, width }: { imageUrl: string | null; width: number }) {
  const frame = {
    width,
    height: Math.round((width * 88) / 63),
    borderRadius: radius.control / 2,
    backgroundColor: colors.canvas,
    borderColor: colors.border,
    borderWidth: 1,
  };

  if (!imageUrl) return <View style={frame} />;
  return <Image source={{ uri: imageUrl }} style={frame} resizeMode="cover" />;
}

/** The art a card leads with: its first pictured printing. */
function leadArt(hit: CardHit): string | null {
  return hit.printings.find((printing) => printing.imageUrl)?.imageUrl ?? null;
}
export function PostFlareScreen({
  code,
  onPosted,
}: {
  code: string;
  onPosted: () => void;
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
  const [error, setError] = useState<string | null>(null);

  // Debounced search: a keystroke pause is the request, not every letter.
  useEffect(() => {
    if (picked || query.trim().length < 2) {
      setHits([]);
      return;
    }

    const timer = setTimeout(() => {
      void searchCards(query.trim())
        .then((result) => setHits(result.cards))
        .catch(() => setHits([]));
    }, 300);

    return () => clearTimeout(timer);
  }, [query, picked]);

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
      onPosted();
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
      {!picked ? (
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
              <Pressable
                onPress={() => {
                  setPicked(hit);
                  setPrintingId(null);
                }}
                style={({ pressed }) => ({
                  flexDirection: "row" as const,
                  alignItems: "center" as const,
                  gap: spacing(3),
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Art imageUrl={leadArt(hit)} width={40} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: colors.textPrimary, fontWeight: "700" }}>
                    {hit.name}
                  </Text>
                  <Muted>{hit.cardNumber}</Muted>
                </View>
              </Pressable>

              {/*
               * The website's versions list, on a tap: which physical card —
               * base art, alt art, SP, promo — with its own artwork. Picking
               * a version here selects the card *with that printing*, so the
               * alt-art hunter never chooses twice.
               */}
              <Pressable
                onPress={() =>
                  setVersionsFor(versionsFor === hit.id ? null : hit.id)
                }
              >
                <Text style={{ color: colors.accent, fontSize: 13 }}>
                  {versionsFor === hit.id
                    ? "Hide versions"
                    : hit.printings.length === 1
                      ? "Show version ▾"
                      : `Show ${hit.printings.length} versions ▾`}
                </Text>
              </Pressable>

              {versionsFor === hit.id &&
                hit.printings.map((printing) => (
                  <Pressable
                    key={printing.id}
                    onPress={() => {
                      setPicked(hit);
                      setPrintingId(printing.id);
                    }}
                    style={({ pressed }) => ({
                      flexDirection: "row" as const,
                      alignItems: "center" as const,
                      gap: spacing(3),
                      borderColor: colors.border,
                      borderWidth: 1,
                      borderRadius: radius.control,
                      padding: spacing(2),
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <Art imageUrl={printing.imageUrl} width={36} />
                    <Text
                      style={{ color: colors.textSecondary, flex: 1, fontSize: 13 }}
                    >
                      {printing.label ?? "Standard printing"}
                    </Text>
                  </Pressable>
                ))}
            </View>
          ))}
        </Card>
      ) : (
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(3) }}>
            <Art
              imageUrl={
                picked.printings.find((printing) => printing.id === printingId)
                  ?.imageUrl ?? leadArt(picked)
              }
              width={64}
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
              <Pressable
                key={option.id ?? "any"}
                onPress={() => setPrintingId(option.id)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing(3),
                  borderColor:
                    printingId === option.id ? colors.accent : colors.border,
                  borderWidth: printingId === option.id ? 2 : 1,
                  borderRadius: radius.control,
                  padding: spacing(2),
                }}
              >
                {option.id !== null && <Art imageUrl={option.imageUrl} width={36} />}
                <Text style={{ color: colors.textPrimary, flex: 1 }}>
                  {option.label}
                </Text>
              </Pressable>
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
            label={busy ? "Posting…" : "Post the Flare"}
            onPress={() => void submit()}
            busy={busy}
          />
          <Button
            label="Pick a different card"
            variant="secondary"
            onPress={() => setPicked(null)}
          />
        </Card>
      )}
    </ScrollView>
  );
}
