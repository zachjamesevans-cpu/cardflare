import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { StackParams } from "../App";
import {
  addBinderCards,
  ApiError,
  type Binder,
  type BinderAddItem,
  type BinderCard,
  type BinderListEntry,
  type CardHit,
  friendlyError,
  getScanRights,
  previewBinderList,
  serverMessage,
} from "./api";
import {
  BINDER_ADD_COPY,
  BINDER_ADD_MAX,
  addToBinderLabel,
  inThisBinderLine,
  notFoundLine,
  unreadableLine,
} from "./binder-add-copy";
import { CardScanner } from "./card-scanner";
import { CardSelectSheet, lineKey, type PickedLine } from "./card-select";
import { leadArt } from "./flare-bits";
import { QuantityBadge } from "./quantity-badge";
import { RemoteImage } from "./remote-image";
import { READING_IN_BACKGROUND, SCAN_TITLE } from "./scan-copy";
import { NO_SCAN_RIGHTS, type ScanRights } from "./scan-flow";
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
 * - No tabs. The founder (2026-10-09): "all the tabs of 'scan' etc
 *   having 3 tabs seems redundant." The search first, as the menu's
 *   body; under its field, "Scan" with the camera, for a player the
 *   server lets scan (free singles up to ten a day, whole pages with
 *   Pro), and "Paste a list" as a small link.
 * - "Scan" opens the one scanner, full screen (src/card-scanner.tsx): a
 *   card is checked in the card viewer and "That's it" lands it in the
 *   same tray the search fills; a whole binder page is sent to be read
 *   in the background for Pro, and is the door to Pro for anyone else.
 *   Pages never touch the tray: "Done" comes back here with the tray as
 *   it was, and a line that the pages are being read, while the binder
 *   shows them waiting.
 * - "Paste a list": a deck list, looked up first, shown as art with
 *   names and tags, quantities editable, the lines that matched nothing
 *   said plainly, and the same button. "Search" goes back.
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
  onPagesSent,
}: {
  visible: boolean;
  binderId: string;
  /** What the binder holds now, for "×2 in this binder". */
  cards: BinderCard[];
  /** The pocket tapped: the first card goes here. Null puts them after the last card. */
  pocket: number | null;
  onClose: () => void;
  onAdded: (added: BinderAdded) => void;
  /** Whole pages sent to be read: the binder shows them waiting. */
  onPagesSent: () => void;
}) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const [mode, setMode] = useState<Mode>("search");
  const [lines, setLines] = useState<PickedLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* What this player may scan. Asked once with the binder, so the menu
     opens already knowing: nothing is drawn until the server has said,
     and nothing drawn then vanishes. */
  const [rights, setRights] = useState<ScanRights>(NO_SCAN_RIGHTS);
  const [scanning, setScanning] = useState(false);
  /* Pages went to be read from this menu: it says so under Scan. */
  const [pagesOut, setPagesOut] = useState(false);
  const [searchFor, setSearchFor] = useState<{ text: string } | null>(null);

  useEffect(() => {
    let live = true;
    void getScanRights()
      .then((given) => {
        if (live) setRights(given);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

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
    setPagesOut(false);
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
          : (serverMessage(caught) ?? `That did not save. ${friendlyError(caught)}`),
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
        serverMessage(caught) ?? `Could not look that up. ${friendlyError(caught)}`,
      );
    } finally {
      setLooking(false);
    }
  };

  /* Closing leaves the camera: the menu never reopens straight into it,
     so the camera is only ever asked for on a tap of "Scan". */
  const close = () => {
    setScanning(false);
    setPagesOut(false);
    onClose();
  };

  /* A scanned card into the tray: one copy, or one more of a line that
     is there already, exactly as a tap on a search result does. */
  const addScanned = (hit: CardHit, printingId: string | null) => {
    setError(null);
    setLines((current) => {
      const key = lineKey({ cardId: hit.id, printingId });
      if (current.some((line) => lineKey(line) === key)) {
        return current.map((line) =>
          lineKey(line) === key
            ? { ...line, quantity: Math.min(99, line.quantity + 1) }
            : line,
        );
      }
      const art = printingId
        ? (hit.printings.find((printing) => printing.id === printingId)?.imageUrl ??
          leadArt(hit))
        : leadArt(hit);
      return [
        ...current,
        {
          cardId: hit.id,
          name: hit.name,
          cardNumber: hit.cardNumber,
          imageUrl: art,
          printings: hit.printings,
          printingId,
          quantity: 1,
        },
      ];
    });
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

  /* Under the search field: "Scan", large, for a player the server lets
     scan, and "Paste a list" as a small link. The scanner itself, full
     screen, opens over the menu from here. */
  const belowSearch = (
    <View style={{ gap: spacing(2) }}>
      {rights.singles !== null ? (
        <Tap
          onPress={() => {
            setError(null);
            setScanning(true);
          }}
          accessibilityLabel={SCAN_TITLE}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: spacing(2),
            paddingVertical: spacing(3.5),
            borderRadius: radius.control,
            backgroundColor: colors.accent,
          }}
        >
          <Ionicons name="camera-outline" size={20} color={colors.accentContrast} />
          <Text
            style={{ color: colors.accentContrast, fontWeight: "700", fontSize: 16 }}
          >
            {SCAN_TITLE}
          </Text>
        </Tap>
      ) : null}
      <Tap
        onPress={() => {
          setMode("paste");
          setError(null);
        }}
        accessibilityLabel={BINDER_ADD_COPY.paste}
        hitSlop={8}
        style={{ alignSelf: "center" }}
      >
        <Text style={{ color: colors.textSecondary, fontWeight: "600", fontSize: 13 }}>
          {BINDER_ADD_COPY.paste}
        </Text>
      </Tap>
      <CardScanner
        visible={scanning}
        binderId={binderId}
        occupied={cards.map((card) => card.pocket)}
        rights={rights}
        onRights={setRights}
        onAdd={addScanned}
        onNotFound={(text) => setSearchFor({ text })}
        onGetPro={() => {
          close();
          navigation.navigate("Pro");
        }}
        onClose={(sent) => {
          setScanning(false);
          if (sent) {
            setPagesOut(true);
            onPagesSent();
          }
        }}
      />
    </View>
  );

  /* The pasted list's confirmation grid: three across, measured off the window. */
  const tile = Math.floor((window.width - 2 * gutter - 2 * spacing(2)) / 3);

  const pasteBody = (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ gap: spacing(3), paddingBottom: spacing(4) }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      {/* Back to the search, with the tray as it was. */}
      <Tap
        onPress={() => {
          setMode("search");
          setError(null);
        }}
        accessibilityLabel={BINDER_ADD_COPY.search}
        style={{ flexDirection: "row", alignItems: "center", gap: spacing(1) }}
      >
        <Ionicons name="chevron-back" size={16} color={colors.textSecondary} />
        <Text style={{ color: colors.textSecondary, fontWeight: "600", fontSize: 13 }}>
          {BINDER_ADD_COPY.search}
        </Text>
      </Tap>
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

  /* The foot: the tray of picked cards (search and scan), then the one
     button. */
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
      {mode !== "paste" && lines.length > 0 ? (
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
                hitSlop={12}
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
      {mode !== "paste" ? (
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
      onClose={close}
      title={BINDER_ADD_COPY.title}
      above={pagesOut ? <Muted>{READING_IN_BACKGROUND}</Muted> : undefined}
      body={mode === "paste" ? pasteBody : undefined}
      belowSearch={belowSearch}
      hitNote={hitNote}
      footer={footer}
      searchFor={searchFor}
    />
  );
}
