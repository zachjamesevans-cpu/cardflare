import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  ApiError,
  addBinderCards,
  describeError,
  previewBinderList,
  serverMessage,
  type Binder,
  type BinderAddItem,
  type BinderCard,
  type BinderListEntry,
  type CardHit,
} from "./api";
import {
  BINDER_ADD_COPY,
  BINDER_ADD_MAX,
  addToBinderLabel,
  inThisBinderLine,
  notFoundLine,
  unreadableLine,
} from "./binder-add-copy";
import { CardSelectSheet, lineKey, type PickedLine } from "./card-select";
import { QuantityBadge } from "./quantity-badge";
import { RemoteImage } from "./remote-image";
import { Stepper } from "./stepper";
import { colors, gutter, radius, spacing } from "./theme";
import { Button, ErrorLine, Input, Muted, Tap } from "./ui";

/**
 * The binder's add menu: the Flare picker, adapted. The founder:
 * "Binder should bring up same menu as posting flares - can select
 * multiple of one card, etc, to put into binder at mass. Basically
 * copy the full flare menu for grabbing a flare but adapt it to adding
 * to a binder."
 *
 * So it IS the Flare picker (src/card-select.tsx): the same search, the
 * same rows, tap for a card and tap again for another copy, the minus,
 * every version under its row. What the binder adds:
 *
 * - "×2 in this binder" under a result the binder already holds.
 * - The tray along the foot: every picked card, its copies as the
 *   small black quantity tag, a minus on each.
 * - One button, "Add 3 cards to binder", counting cards not copies.
 * - "Paste a list" beside Search: a deck list, looked up first, shown
 *   as art with names and tags, quantities editable, the lines that
 *   matched nothing said plainly, and the same button.
 *
 * Opened from a tapped "+" pocket, the batch starts AT that pocket:
 * the first card goes there, the rest into the next empty ones, which
 * is the server's rule (POST /api/v1/binders/<id>/cards { items,
 * pocket }). The website's menu is the same menu.
 */

/** What the server answered: the binder whole, its sentence, the first pocket filled. */
export interface BinderAdded {
  binder: Binder;
  message: string;
  firstPocket: number | null;
}

type Mode = "search" | "paste";

/** A pasted line, looked up, with the copies the owner settled on. */
type PastedLine = BinderListEntry & { key: string };

/** Two lines of the same card fold into one, so the batch never names a card twice. */
function folded(items: BinderAddItem[]): BinderAddItem[] {
  const byKey = new Map<string, BinderAddItem>();
  for (const item of items) {
    const key = lineKey(item);
    const had = byKey.get(key);
    byKey.set(
      key,
      had ? { ...had, quantity: Math.min(99, had.quantity + item.quantity) } : item,
    );
  }
  return [...byKey.values()].slice(0, BINDER_ADD_MAX);
}

export function BinderAddSheet({
  visible,
  binderId,
  cards,
  pocket,
  onClose,
  onAdded,
}: {
  visible: boolean;
  binderId: string;
  /** What the binder holds now, for "×2 in this binder". */
  cards: BinderCard[];
  /** The pocket tapped: the first card goes here. Null puts them after the last card. */
  pocket: number | null;
  onClose: () => void;
  onAdded: (added: BinderAdded) => void;
}) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const [mode, setMode] = useState<Mode>("search");
  const [lines, setLines] = useState<PickedLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* The pasted list: the text, then what it looked up to. */
  const [text, setText] = useState("");
  const [looking, setLooking] = useState(false);
  const [pasted, setPasted] = useState<{
    lines: PastedLine[];
    unreadable: string[];
  } | null>(null);

  /* Copies the binder holds of each card, every printing counted. */
  const held = useMemo(() => {
    const copies = new Map<string, number>();
    for (const card of cards) {
      copies.set(card.cardId, (copies.get(card.cardId) ?? 0) + card.quantity);
    }
    return copies;
  }, [cards]);

  const matched = (pasted?.lines ?? []).filter(
    (line) => line.cardId !== null && line.quantity > 0,
  );

  /* After a batch has gone in: an empty menu for next time. */
  const reset = () => {
    setLines([]);
    setText("");
    setPasted(null);
    setMode("search");
    setError(null);
  };

  const send = async (items: BinderAddItem[]) => {
    if (busy) return;
    if (items.length === 0) {
      setError(BINDER_ADD_COPY.pickFirst);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await addBinderCards(binderId, folded(items), pocket);
      reset();
      onAdded(result);
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.code === "at-cap"
          ? "Your binder is full. Two hundred cards is as many as it holds."
          : (serverMessage(caught) ?? `That did not save (${describeError(caught)}).`),
      );
    } finally {
      setBusy(false);
    }
  };

  const lookUp = async () => {
    if (looking || !text.trim()) return;
    setLooking(true);
    setError(null);
    try {
      const result = await previewBinderList(text);
      setPasted({
        lines: result.entries.map((entry, index) => ({
          ...entry,
          key: `${index}:${entry.cardNumber}`,
        })),
        unreadable: result.unreadable,
      });
    } catch (caught) {
      setError(
        serverMessage(caught) ?? `Could not look that up (${describeError(caught)}).`,
      );
    } finally {
      setLooking(false);
    }
  };

  /* One fewer copy of a picked line, gone at none: the picker's minus. */
  const less = (key: string) =>
    setLines((current) =>
      current.flatMap((line) => {
        if (lineKey(line) !== key) return [line];
        return line.quantity > 1 ? [{ ...line, quantity: line.quantity - 1 }] : [];
      }),
    );

  const hitNote = (hit: CardHit) => {
    const copies = held.get(hit.id) ?? 0;
    if (copies <= 0) return null;
    return (
      <View
        accessibilityLabel={inThisBinderLine(copies)}
        style={{ flexDirection: "row", alignItems: "center", gap: spacing(1) }}
      >
        <QuantityBadge quantity={copies} />
        <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "600" }}>
          {copies > 1 ? "in this binder" : "In this binder"}
        </Text>
      </View>
    );
  };

  /* Search or Paste a list, the website's two tabs. */
  const switcher = (
    <View
      style={{
        flexDirection: "row",
        borderRadius: radius.control,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        padding: 3,
        gap: 3,
      }}
    >
      {(
        [
          ["search", BINDER_ADD_COPY.search],
          ["paste", BINDER_ADD_COPY.paste],
        ] as const
      ).map(([value, label]) => {
        const on = mode === value;
        return (
          <Tap
            key={value}
            onPress={() => {
              setMode(value);
              setError(null);
            }}
            accessibilityLabel={label}
            style={{
              flex: 1,
              alignItems: "center",
              paddingVertical: spacing(2),
              borderRadius: radius.control - 3,
              backgroundColor: on ? colors.accent : "transparent",
            }}
          >
            <Text
              style={{
                color: on ? colors.accentContrast : colors.textSecondary,
                fontWeight: "700",
                fontSize: 13,
              }}
            >
              {label}
            </Text>
          </Tap>
        );
      })}
    </View>
  );

  /* The pasted list's confirmation grid: three across, measured off the window. */
  const tile = Math.floor((window.width - 2 * gutter - 2 * spacing(2)) / 3);

  const pasteBody = (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ gap: spacing(3), paddingBottom: spacing(4) }}
      keyboardShouldPersistTaps="handled"
    >
      {pasted === null ? (
        <>
          <Muted>{BINDER_ADD_COPY.pasteHint}</Muted>
          <Input
            value={text}
            onChangeText={setText}
            placeholder={BINDER_ADD_COPY.pastePlaceholder}
            multiline
            autoCapitalize="characters"
            autoCorrect={false}
            accessibilityLabel="Card list"
            style={{ minHeight: 160, textAlignVertical: "top" }}
          />
          <Button
            label={BINDER_ADD_COPY.lookUp}
            variant="secondary"
            busy={looking}
            disabled={!text.trim()}
            onPress={() => void lookUp()}
          />
        </>
      ) : (
        <>
          <Tap
            onPress={() => setPasted(null)}
            accessibilityLabel={BINDER_ADD_COPY.editList}
            style={{ flexDirection: "row", alignItems: "center", gap: spacing(1) }}
          >
            <Ionicons name="chevron-back" size={16} color={colors.accent} />
            <Text style={{ color: colors.accent, fontWeight: "700", fontSize: 13 }}>
              {BINDER_ADD_COPY.editList}
            </Text>
          </Tap>

          {pasted.lines.some((line) => line.cardId !== null) ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing(2) }}>
              {pasted.lines
                .filter((line) => line.cardId !== null)
                .map((line) => (
                  <View
                    key={line.key}
                    style={{
                      width: tile,
                      gap: spacing(1),
                      opacity: line.quantity > 0 ? 1 : 0.5,
                    }}
                  >
                    <View>
                      <RemoteImage
                        uri={line.imageUrl}
                        contentFit="contain"
                        accessibilityLabel={line.name ?? line.cardNumber}
                        style={{
                          width: tile,
                          height: Math.round((tile * 88) / 63),
                          borderRadius: radius.control / 2,
                          backgroundColor: colors.elevated,
                        }}
                      />
                      <QuantityBadge
                        quantity={line.quantity}
                        style={{ position: "absolute", top: 4, left: 4 }}
                      />
                    </View>
                    <Text
                      numberOfLines={1}
                      style={{
                        color: colors.textPrimary,
                        fontSize: 12,
                        fontWeight: "600",
                      }}
                    >
                      {line.name ?? line.cardNumber}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                      {line.cardNumber}
                    </Text>
                    <Stepper
                      value={line.quantity}
                      min={0}
                      max={99}
                      label={`copies of ${line.name ?? line.cardNumber}`}
                      onChange={(quantity) =>
                        setPasted((current) =>
                          current
                            ? {
                                ...current,
                                lines: current.lines.map((entry) =>
                                  entry.key === line.key
                                    ? { ...entry, quantity }
                                    : entry,
                                ),
                              }
                            : current,
                        )
                      }
                    />
                  </View>
                ))}
            </View>
          ) : (
            <Muted>{BINDER_ADD_COPY.nothingFound}</Muted>
          )}

          {pasted.lines
            .filter((line) => line.cardId === null)
            .map((line) => (
              <Text
                key={line.key}
                style={{ color: colors.textSecondary, fontSize: 13 }}
              >
                {notFoundLine(line.cardNumber)}
              </Text>
            ))}
          {pasted.unreadable.map((line, index) => (
            <Text
              key={`unreadable-${index}`}
              style={{ color: colors.textSecondary, fontSize: 13 }}
            >
              {unreadableLine(line)}
            </Text>
          ))}
        </>
      )}
    </ScrollView>
  );

  /* The foot: the tray of picked cards (search), then the one button. */
  const footer = (
    <View
      style={{
        paddingTop: spacing(2),
        paddingBottom: spacing(3) + insets.bottom,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        gap: spacing(2),
      }}
    >
      {mode === "search" && lines.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: spacing(2), paddingTop: 6, paddingRight: 6 }}
        >
          {lines.map((line) => (
            <View key={lineKey(line)} style={{ width: 48 }}>
              <RemoteImage
                uri={line.imageUrl}
                contentFit="contain"
                accessibilityLabel={line.name}
                style={{
                  width: 48,
                  height: 67,
                  borderRadius: radius.control / 2,
                  backgroundColor: colors.elevated,
                }}
              />
              <QuantityBadge
                quantity={line.quantity}
                style={{ position: "absolute", top: 3, left: 3 }}
              />
              <Tap
                onPress={() => less(lineKey(line))}
                hitSlop={6}
                accessibilityLabel={`One fewer ${line.name}`}
                style={{
                  position: "absolute",
                  top: -6,
                  right: -6,
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="remove" size={12} color={colors.textSecondary} />
              </Tap>
            </View>
          ))}
        </ScrollView>
      ) : null}
      <ErrorLine message={error} />
      {mode === "search" ? (
        <Button
          label={addToBinderLabel(lines.length)}
          busy={busy}
          disabled={lines.length === 0}
          onPress={() =>
            void send(
              lines.map((line) => ({
                cardId: line.cardId,
                printingId: line.printingId,
                quantity: line.quantity,
              })),
            )
          }
        />
      ) : (
        <Button
          label={addToBinderLabel(matched.length)}
          busy={busy}
          disabled={matched.length === 0}
          onPress={() =>
            void send(
              matched.map((line) => ({
                cardId: line.cardId as string,
                printingId: null,
                quantity: line.quantity,
              })),
            )
          }
        />
      )}
    </View>
  );

  return (
    <CardSelectSheet
      visible={visible}
      target={{ kind: "list" }}
      items={lines}
      onChange={setLines}
      onClose={onClose}
      title={BINDER_ADD_COPY.title}
      above={switcher}
      body={mode === "paste" ? pasteBody : undefined}
      hitNote={hitNote}
      footer={footer}
    />
  );
}
