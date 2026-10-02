import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { searchCards, type CardHit } from "./api";
import { colors, radius, spacing } from "./theme";
import { CardImage, Input, Loading, Muted, Tap } from "./ui";

/**
 * Picking one card by hand, and saying which way it went.
 *
 * Born in the Log a trade screen and lifted out when "We traded" in a
 * direct message needed the same two things: a search that ends on a
 * card (and its printing, when the card has several) and the row that
 * shows the choice with a "Change" link. One copy, so a conversation
 * and the trade log cannot drift on how a card is found.
 */

/** The card picked, with the printing when one was named. */
export interface PickedCard {
  hit: CardHit;
  printingId: string | null;
}

/**
 * A two-way toggle, "got" or "gave". The labels are the caller's: the
 * trade log says "I got a card", a conversation says "I got it".
 */
export function DirectionToggle({
  value,
  onChange,
  labels,
}: {
  value: "got" | "gave";
  onChange: (next: "got" | "gave") => void;
  labels: { got: string; gave: string };
}) {
  return (
    <View style={{ flexDirection: "row", gap: spacing(2) }}>
      {(
        [
          ["got", labels.got],
          ["gave", labels.gave],
        ] as const
      ).map(([key, label]) => {
        const on = value === key;
        return (
          <Tap
            key={key}
            onPress={() => onChange(key)}
            accessibilityLabel={label}
            style={{
              flex: 1,
              alignItems: "center",
              borderRadius: radius.control,
              borderWidth: 1,
              borderColor: on ? colors.accent : colors.border,
              backgroundColor: on ? colors.accent : colors.elevated,
              paddingVertical: spacing(2.5),
            }}
          >
            <Text
              style={{
                color: on ? colors.accentContrast : colors.textPrimary,
                fontWeight: "700",
                fontSize: 14,
              }}
            >
              {label}
            </Text>
          </Tap>
        );
      })}
    </View>
  );
}

/** The chosen card, as a row: art, name, number, printing, and "Change". */
export function PickedCardRow({
  card,
  onChange,
}: {
  card: PickedCard;
  onChange: () => void;
}) {
  const printing = card.printingId
    ? card.hit.printings.find((entry) => entry.id === card.printingId)
    : undefined;
  const imageUrl =
    printing?.imageUrl ??
    card.hit.printings.find((entry) => entry.id === card.hit.basePrintingId)
      ?.imageUrl ??
    card.hit.printings[0]?.imageUrl ??
    null;
  const label = printing ? (printing.label ?? "Standard printing") : "Any printing";

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing(2.5),
        borderRadius: radius.control,
        borderWidth: 1,
        borderColor: colors.accentMuted,
        backgroundColor: colors.elevated,
        padding: spacing(2),
      }}
    >
      <CardImage
        imageUrl={imageUrl}
        width={44}
        name={card.hit.name}
        cardNumber={card.hit.cardNumber}
        caption={label}
      />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text
          numberOfLines={1}
          style={{ color: colors.textPrimary, fontWeight: "700", fontSize: 14 }}
        >
          {card.hit.name}
        </Text>
        <Text
          numberOfLines={1}
          style={{ color: colors.textMuted, fontSize: 12, fontFamily: "Menlo" }}
        >
          {card.hit.cardNumber}
        </Text>
        <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: 12 }}>
          {label}
        </Text>
      </View>
      <Tap onPress={onChange} hitSlop={6} accessibilityLabel="Change card">
        <Text style={{ color: colors.accent, fontWeight: "700", fontSize: 13 }}>
          Change
        </Text>
      </Tap>
    </View>
  );
}

/**
 * The composer's search, cut down: type a name or a number, tap the
 * card. A card with several printings asks which, with "Any printing"
 * first, because most people naming a trade do not know and should
 * not have to.
 */
export function CardPicker({
  onPick,
}: {
  onPick: (hit: CardHit, printingId: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<CardHit[]>([]);
  const [searching, setSearching] = useState(false);
  /* The hit whose printings are fanned out, waiting for a choice. */
  const [choosing, setChoosing] = useState<CardHit | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    let stale = false;
    const timer = setTimeout(() => {
      searchCards(trimmed)
        .then((result) => {
          if (!stale) setHits(result.cards);
        })
        .catch(() => {
          if (!stale) setHits([]);
        })
        .finally(() => {
          if (!stale) setSearching(false);
        });
    }, 300);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query]);

  const choose = (hit: CardHit) => {
    if (hit.printings.length > 1) {
      setChoosing(hit);
      return;
    }
    onPick(hit, hit.printings[0]?.id ?? null);
  };

  if (choosing) {
    return (
      <View style={{ gap: spacing(2) }}>
        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
          {`Which ${choosing.name}?`}
        </Text>
        <Tap
          onPress={() => onPick(choosing, null)}
          accessibilityLabel={`${choosing.name}, any printing`}
          style={pickRow}
        >
          <Text style={{ color: colors.textPrimary, fontSize: 14, flex: 1 }}>
            Any printing
          </Text>
        </Tap>
        {choosing.printings.map((printing) => {
          const label = printing.label ?? "Standard printing";
          return (
            <Tap
              key={printing.id}
              onPress={() => onPick(choosing, printing.id)}
              accessibilityLabel={`${choosing.name}, ${label}`}
              style={pickRow}
            >
              <CardImage
                imageUrl={printing.imageUrl}
                width={36}
                name={choosing.name}
                cardNumber={choosing.cardNumber}
                caption={label}
              />
              <Text style={{ color: colors.textPrimary, fontSize: 14, flex: 1 }}>
                {label}
              </Text>
            </Tap>
          );
        })}
        <Tap
          onPress={() => setChoosing(null)}
          accessibilityLabel="Back to the search"
          style={{ alignSelf: "flex-start", paddingVertical: spacing(1) }}
        >
          <Text style={{ color: colors.accent, fontWeight: "700", fontSize: 13 }}>
            Back
          </Text>
        </Tap>
      </View>
    );
  }

  return (
    <View style={{ gap: spacing(2) }}>
      <Input
        value={query}
        onChangeText={setQuery}
        placeholder="Search by name or number"
        autoCapitalize="none"
        autoCorrect={false}
      />
      {searching && hits.length === 0 ? <Loading /> : null}
      {query.trim().length >= 2 && hits.length === 0 && !searching ? (
        <Muted>Nothing yet. Keep typing, or check the number.</Muted>
      ) : null}
      {hits.slice(0, 8).map((hit) => {
        const lead =
          hit.printings.find((printing) => printing.id === hit.basePrintingId) ??
          hit.printings[0];
        return (
          <Tap
            key={hit.id}
            onPress={() => choose(hit)}
            accessibilityLabel={`Pick ${hit.name}, ${hit.cardNumber}`}
            style={pickRow}
          >
            <CardImage
              imageUrl={lead?.imageUrl ?? null}
              width={36}
              name={hit.name}
              cardNumber={hit.cardNumber}
              caption={lead?.label ?? null}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                numberOfLines={1}
                style={{ color: colors.textPrimary, fontWeight: "600", fontSize: 14 }}
              >
                {hit.name}
              </Text>
              <Text
                numberOfLines={1}
                style={{ color: colors.textMuted, fontSize: 12, fontFamily: "Menlo" }}
              >
                {hit.cardNumber}
                {hit.printings.length > 1
                  ? `  ·  ${hit.printings.length} versions`
                  : ""}
              </Text>
            </View>
          </Tap>
        );
      })}
    </View>
  );
}

/** One tappable row in a list of things to pick from. */
export const pickRow = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  gap: spacing(2.5),
  borderRadius: radius.control,
  borderWidth: 1,
  borderColor: colors.border,
  backgroundColor: colors.elevated,
  padding: spacing(2),
};
