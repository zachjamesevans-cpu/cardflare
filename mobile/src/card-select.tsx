import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  getGames,
  lastRoomGame,
  lastSearchGame,
  rememberSearchGame,
  searchCards,
  type CardHit,
} from "./api";
import { Highlighted, Stats, leadArt, type PostTarget } from "./flare-bits";
import { GameSearchField } from "./game-chips";
import { ALL_GAMES, resolveGameScope, searchPlaceholder } from "./game-scope";
import { gameShortName, type GameSlug } from "./games";
import { QuantityBadge } from "./quantity-badge";
import { SwipeToClose } from "./sheet-swipe";
import { colors, gutter, radius, spacing } from "./theme";
import { Button, CardImage, Loading, Muted, SheetClose, Tap, Title } from "./ui";

/**
 * The Flare picker, on its own: search, results, tap to add, tap again
 * for another copy, a minus to take one away, every version of a card
 * under its row. Lifted out of the Flare composer whole so the binder's
 * add menu can BE it rather than look like it. The founder: "Binder
 * should bring up same menu as posting flares - can select multiple of
 * one card, etc, to put into binder at mass. Basically copy the full
 * flare menu for grabbing a flare but adapt it to adding to a binder."
 *
 * The Flare composer passes nothing but the lines and draws exactly
 * what it drew before. The binder adds what is its own through five
 * doors and nothing else: a line under the heading (pages being read),
 * a row under the search field (Scan, and the Paste a list link), a
 * body in place of the search (the pasted list), a note under a result
 * ("×2 in this binder"), and a footer in place of Done (its tray and
 * "Add 3 cards to binder").
 */

/** A picked card, with its printing and how many copies. */
export interface PickedLine {
  cardId: string;
  name: string;
  cardNumber: string;
  imageUrl: string | null;
  printings: { id: string; label: string | null; imageUrl: string | null }[];
  /** Null is any printing. */
  printingId: string | null;
  quantity: number;
}

/**
 * ONE LINE PER PRINTING. A line is one card in one printing (null being
 * any), so tapping an alternate art adds a line of its own instead of
 * folding into the card's. The founder: "if I keep tapping a bunch of
 * cards, whichever the final card is that's the quantity of that card.
 * Math is wrong." Same rule as the website's draft.
 */
export function lineKey(item: { cardId: string; printingId: string | null }): string {
  return `${item.cardId}::${item.printingId ?? "any"}`;
}

/**
 * The search the old composer had, as a hook, so the picker is a list
 * and not a second copy of the scope rules: the room's game locks it;
 * otherwise the chip last tapped, else the first game from sign-up.
 */
export function useCardSearch(target: PostTarget) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<CardHit[]>([]);
  /* True from the keystroke until the answer lands, debounce included,
     so the screen never sits still while it works. The founder: "just
     a frozen screen basically for a second or two." */
  const [searching, setSearching] = useState(false);
  const [roomGame, setRoomGame] = useState<string | null>(null);
  const [playerGames, setPlayerGames] = useState<string[]>([]);
  const [remembered, setRemembered] = useState<string | null>(null);

  useEffect(() => {
    if (target.kind !== "room") return;
    let live = true;
    void lastRoomGame().then((game) => {
      if (live) setRoomGame(game);
    });
    return () => {
      live = false;
    };
  }, [target.kind]);

  useEffect(() => {
    let live = true;
    void lastSearchGame().then((value) => {
      if (live) setRemembered(value);
    });
    void getGames()
      .then((result) => {
        if (live) setPlayerGames(result.mine);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const scope = resolveGameScope({
    roomGame: target.kind === "room" ? roomGame : null,
    playerGames,
    remembered,
  });
  const scopedGame = scope.selected;

  const pickGame = (game: GameSlug | null) => {
    if (game === scopedGame) return;
    const value = game ?? ALL_GAMES;
    setRemembered(value);
    void rememberSearchGame(value);
    setQuery("");
    setHits([]);
  };

  /*
   * Read through a ref inside the search, not as a dependency of it. The
   * search itself remembers the game it ran in, and with `remembered` in
   * the dependency list that write re-ran the effect: the first answer
   * was thrown away as stale and the same query went out a second time,
   * 300ms later, on every first search in a game.
   */
  const rememberedRef = useRef(remembered);
  rememberedRef.current = remembered;

  useEffect(() => {
    if (query.trim().length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    let stale = false;
    const timer = setTimeout(() => {
      if (scopedGame && !scope.locked && rememberedRef.current !== scopedGame) {
        setRemembered(scopedGame);
        void rememberSearchGame(scopedGame);
      }
      void searchCards(query.trim(), scopedGame)
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
  }, [query, scopedGame, scope.locked]);

  return { query, setQuery, hits, searching, scope, scopedGame, playerGames, pickGame };
}

/**
 * Picking several cards: the same search, with the selection kept
 * while you type. A picked card shows its order number; picking it
 * again adds a copy rather than a second row. "Done" goes back to the
 * tray with everything chosen.
 */
/**
 * How many copies are in, as the badge, with a minus beside it. The
 * founder: "Should now just have a 1, 2, 3, etc… when clicking these
 * cards whether base rarity or not... also a way to lessen your
 * quantity of cards."
 */
export function PickCount({
  count,
  name,
  onLess,
}: {
  count: number;
  name: string;
  onLess: () => void;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(1.5) }}>
      <Tap
        onPress={onLess}
        hitSlop={10}
        accessibilityLabel={`One fewer ${name}`}
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="remove" size={14} color={colors.textSecondary} />
      </Tap>
      {/* The picked result's count is the one quantity tag, "×1"
          included: here it says "picked" as much as how many. */}
      <QuantityBadge
        quantity={count}
        size="md"
        always
        style={{ alignSelf: "center" }}
      />
    </View>
  );
}

/**
 * Lines, or one card. The Flare composer and the binder keep lines:
 * tap to add, tap again for another copy. The scan check wants one card
 * and nothing else. The founder: "when you click a card, it doesn't add
 * a '1' to it, then counts up. it's just one card, so adding the card
 * should close that screen." So `onPickOne` takes the card tapped (and
 * the version, when a version was tapped) and the sheet closes; there
 * are no lines, so no count, no minus and no tray. Everything else is
 * the same sheet.
 */
type Picking =
  | {
      items: PickedLine[];
      onChange: (items: PickedLine[]) => void;
      onPickOne?: undefined;
    }
  | {
      onPickOne: (hit: CardHit, printingId: string | null) => void;
      items?: undefined;
      onChange?: undefined;
    };

export function CardSelectSheet({
  visible,
  target,
  items: lines,
  onChange,
  onPickOne,
  onClose,
  title = "Select cards",
  above,
  body,
  belowSearch,
  hitNote,
  footer: given,
  searchFor = null,
}: Picking & {
  visible: boolean;
  target: PostTarget;
  onClose: () => void;
  /** The heading; the Flare's "Select cards" unless told otherwise. */
  title?: string;
  /** Drawn under the heading: the binder's line that pages are being read. */
  above?: ReactNode;
  /** Drawn instead of the search and its results: the binder's pasted list. */
  body?: ReactNode;
  /** Drawn between the search field and its results: the binder's Scan and Paste a list. */
  belowSearch?: ReactNode;
  /** A line under a result's stats: the binder's "×2 in this binder". */
  hitNote?: (hit: CardHit) => ReactNode;
  /** Drawn instead of the summary and Done: the binder's tray and Add button. */
  footer?: ReactNode;
  /**
   * Words to put in the search, each time a new one arrives: the
   * binder's scanner, when it read a card the catalogue could not find.
   */
  searchFor?: { text: string } | null;
}) {
  const insets = useSafeAreaInsets();
  const search = useCardSearch(target);
  const { setQuery } = search;
  /* One card: no lines, so no PickCount, and in place of the tray and
     Done only the room the home indicator needs. */
  const items: PickedLine[] = onPickOne ? [] : (lines ?? []);
  const footer = onPickOne ? <View style={{ height: insets.bottom }} /> : given;

  useEffect(() => {
    if (searchFor) setQuery(searchFor.text);
  }, [searchFor, setQuery]);

  /*
   * A printing named here is the exact art asked for; the row's own
   * tap takes any printing, as it always did. The founder: "Should
   * have a way to click the alt arts from this screen."
   */
  const pick = (hit: CardHit, printingId: string | null = null) => {
    if (onPickOne) {
      onPickOne(hit, printingId);
      onClose();
      return;
    }
    const art = printingId
      ? (hit.printings.find((printing) => printing.id === printingId)?.imageUrl ??
        leadArt(hit))
      : leadArt(hit);
    const key = lineKey({ cardId: hit.id, printingId });
    const index = items.findIndex((item) => lineKey(item) === key);
    if (index >= 0) {
      onChange?.(
        items.map((item, at) =>
          at === index ? { ...item, quantity: Math.min(99, item.quantity + 1) } : item,
        ),
      );
      return;
    }
    onChange?.([
      ...items,
      {
        cardId: hit.id,
        name: hit.name,
        cardNumber: hit.cardNumber,
        imageUrl: art,
        printings: hit.printings,
        printingId,
        quantity: 1,
      },
    ]);
  };

  /* One fewer copy, and gone at none. The founder: "a way to lessen
     your quantity of cards." */
  const unpick = (hit: CardHit, printingId: string | null = null) => {
    const key = lineKey({ cardId: hit.id, printingId });
    onChange?.(
      items.flatMap((item) => {
        if (lineKey(item) !== key) return [item];
        return item.quantity > 1 ? [{ ...item, quantity: item.quantity - 1 }] : [];
      }),
    );
  };

  /* Which row has its printings fanned out, one at a time. */
  const [fanned, setFanned] = useState<string | null>(null);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      {/* Left edge or a pull down from the title row closes it, the same
          as every other sheet (src/sheet-swipe.tsx). The strip is the
          status bar, the padding and the title row, and stops short of
          the search field so a drag on the field is never a close. */}
      <SwipeToClose
        onClose={onClose}
        pullZone={insets.top + spacing(3) + 40}
        style={{
          flex: 1,
          backgroundColor: colors.canvas,
          paddingTop: insets.top + spacing(3),
          paddingHorizontal: gutter,
          gap: spacing(3),
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: spacing(2),
          }}
        >
          <Title>{title}</Title>
          <SheetClose onPress={onClose} />
        </View>
        {above}
        {body ?? (
          <>
            <GameSearchField
              scope={search.scope}
              playerGames={search.playerGames}
              onPick={search.pickGame}
              value={search.query}
              onChangeText={search.setQuery}
              placeholder={searchPlaceholder(search.scopedGame)}
              autoFocus
            />
            {belowSearch}
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ gap: spacing(2), paddingBottom: spacing(4) }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
              {search.searching && search.hits.length === 0 ? <Loading /> : null}
              {search.query.trim().length >= 2 &&
              search.hits.length === 0 &&
              !search.searching ? (
                <Muted>
                  {search.scopedGame && !search.scope.locked
                    ? `No ${gameShortName(search.scopedGame)} cards yet. Keep typing, check the number, or try All games.`
                    : "Nothing yet. Keep typing, or check the number."}
                </Muted>
              ) : null}
              {search.query.trim().length < 2 && items.length === 0 ? (
                <Muted>
                  {onPickOne
                    ? "Search by name or number. Tap a card to add it."
                    : "Search by name or number. Tap a card to add it; tap again for another copy."}
                </Muted>
              ) : null}
              {search.hits.map((hit) => {
                /* The card's own line is the any-printing one; a version
                   has a line of its own, badged down in the list. */
                const anyLine = items.find(
                  (item) => item.cardId === hit.id && !item.printingId,
                );
                const chosen = items.some((item) => item.cardId === hit.id);
                const many = hit.printings.length > 1;
                const open = fanned === hit.id;
                return (
                  <View
                    key={hit.id}
                    style={{
                      borderColor: chosen ? colors.accent : colors.border,
                      borderWidth: 1,
                      borderRadius: radius.control,
                      backgroundColor: colors.surface,
                    }}
                  >
                    <Tap
                      onPress={() => pick(hit)}
                      accessibilityLabel={
                        chosen ? `${hit.name}, picked, add a copy` : `Add ${hit.name}`
                      }
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: spacing(3),
                        padding: spacing(2),
                      }}
                    >
                      <CardImage
                        imageUrl={leadArt(hit)}
                        width={40}
                        name={hit.name}
                        cardNumber={hit.cardNumber}
                      />
                      <View style={{ flex: 1, gap: 3 }}>
                        <Text style={{ color: colors.textPrimary, fontWeight: "700" }}>
                          <Highlighted text={hit.name} term={search.query} />
                        </Text>
                        <View
                          style={{
                            flexDirection: "row",
                            flexWrap: "wrap",
                            columnGap: spacing(2),
                          }}
                        >
                          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                            <Highlighted text={hit.cardNumber} term={search.query} />
                          </Text>
                          {!many && hit.printings[0]?.label ? (
                            <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                              {hit.printings[0].label}
                            </Text>
                          ) : null}
                          {hit.cardType ? (
                            <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                              {hit.cardType}
                            </Text>
                          ) : null}
                        </View>
                        <Stats hit={hit} />
                        {hitNote ? hitNote(hit) : null}
                      </View>
                      {anyLine ? (
                        <PickCount
                          count={anyLine.quantity}
                          name={hit.name}
                          onLess={() => unpick(hit)}
                        />
                      ) : (
                        <Ionicons
                          name="add-circle-outline"
                          size={22}
                          color={colors.textSecondary}
                        />
                      )}
                    </Tap>
                    {/* The website's "versions" bar, word for word: a door
                        under the row, and behind it every printing as its
                        own line. Tap the label to ask for that exact one;
                        the badge lands on the version tapped, not on the
                        card above it. The thumbnail opens full size. */}
                    {many ? (
                      <View
                        style={{ borderTopWidth: 1, borderTopColor: colors.border }}
                      >
                        <Tap
                          onPress={() => setFanned(open ? null : hit.id)}
                          accessibilityLabel={
                            open
                              ? `Hide the versions of ${hit.name}`
                              : `Show the ${hit.printings.length} versions of ${hit.name}`
                          }
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: spacing(2),
                            paddingHorizontal: spacing(3),
                            paddingVertical: spacing(2.5),
                          }}
                        >
                          <Ionicons
                            name={open ? "chevron-down" : "chevron-forward"}
                            size={16}
                            color={colors.accent}
                          />
                          <Text
                            style={{
                              color: colors.textSecondary,
                              fontSize: 14,
                              fontWeight: "600",
                            }}
                          >
                            {`${hit.printings.length} versions, alt arts and promos`}
                          </Text>
                        </Tap>
                        {open ? (
                          <View
                            style={{
                              borderTopWidth: 1,
                              borderTopColor: colors.border,
                              padding: spacing(3),
                              gap: spacing(2),
                            }}
                          >
                            <Muted>
                              Tap a version to ask for that exact one, or the card above
                              to take any printing. Tap any picture to see it full size.
                            </Muted>
                            {hit.printings.map((printing) => {
                              const line = items.find(
                                (item) =>
                                  item.cardId === hit.id &&
                                  item.printingId === printing.id,
                              );
                              const exact = Boolean(line);
                              const label = printing.label ?? "Standard printing";
                              return (
                                <View
                                  key={printing.id}
                                  style={{
                                    flexDirection: "row",
                                    alignItems: "center",
                                    gap: spacing(2.5),
                                    borderWidth: 1,
                                    borderColor: exact ? colors.accent : colors.border,
                                    borderRadius: radius.control,
                                    backgroundColor: colors.elevated,
                                    padding: spacing(1.5),
                                  }}
                                >
                                  <CardImage
                                    imageUrl={printing.imageUrl}
                                    width={36}
                                    name={hit.name}
                                    cardNumber={hit.cardNumber}
                                    caption={label}
                                  />
                                  <Tap
                                    onPress={() => pick(hit, printing.id)}
                                    accessibilityLabel={`Add ${hit.name}, ${label}`}
                                    style={{ flex: 1, paddingVertical: spacing(1) }}
                                  >
                                    <Text
                                      style={{
                                        color: exact
                                          ? colors.textPrimary
                                          : colors.textSecondary,
                                        fontSize: 13,
                                        lineHeight: 18,
                                      }}
                                    >
                                      {label}
                                    </Text>
                                  </Tap>
                                  {line ? (
                                    <PickCount
                                      count={line.quantity}
                                      name={hit.name}
                                      onLess={() => unpick(hit, printing.id)}
                                    />
                                  ) : null}
                                </View>
                              );
                            })}
                          </View>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </ScrollView>
          </>
        )}
        {footer ?? (
          <View
            style={{
              paddingTop: spacing(2),
              paddingBottom: spacing(3) + insets.bottom,
              borderTopWidth: 1,
              borderTopColor: colors.border,
              gap: spacing(1.5),
            }}
          >
            {items.length > 0 ? (
              <Muted>
                {items
                  .map(
                    (item) =>
                      `${item.name}${item.quantity > 1 ? ` ×${item.quantity}` : ""}`,
                  )
                  .join(", ")}
              </Muted>
            ) : null}
            <Button label={`Done (${items.length})`} onPress={onClose} />
          </View>
        )}
      </SwipeToClose>
    </Modal>
  );
}
