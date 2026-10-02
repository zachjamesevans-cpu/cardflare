import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
  useWindowDimensions,
  type GestureResponderHandlers,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { StackParams } from "../../App";
import { SheetBackdrop } from "../action-menu";
import {
  ApiError,
  addBinderCard,
  describeError,
  getBinder,
  openDirectThread,
  removeBinderCard,
  reorderBinder,
  saveBinder,
  serverMessage,
  type Binder,
  type BinderCard,
  type BinderSettingsPatch,
} from "../api";
import { BinderCover } from "../binder-cover";
import {
  BINDER_COVERS,
  BINDER_LAYOUTS,
  pocketsPerPage,
  type BinderLayout,
} from "../binder-covers";
import { CardPicker } from "../card-picker";
import { RemoteImage } from "../remote-image";
import { colors, gutter, radius, spacing } from "../theme";
import {
  Button,
  CardImage,
  ErrorLine,
  Loading,
  Muted,
  Tap,
  type ZoomCard,
} from "../ui";

/**
 * The trade binder, open: the website's /profile/binder and
 * /p/[playerId]/binder on one screen. No id means yours.
 *
 * The Have list, drawn like the thing it stands in for: pages of
 * pockets, two by two or three by three, turned with a swipe, dots
 * under them. A tap on a pocket is the card large, in the one viewer
 * every shelf uses, with nothing to offer: the binder is not
 * answerable yet, that is a later round.
 *
 * The owner adds cards through the card picker (the button under the
 * page, or the "+" in any empty pocket), takes one out or names the
 * front card with Edit on, holds a card to move it, and sets the
 * binder up in the strip at the foot: private or not, the layout, the
 * cover. Every write paints at once from what the server sends back
 * and then asks for the truth again behind it. A visitor gets the
 * chips when any of the cards are on their hunts, and one button,
 * Message.
 *
 * HOLD TO MOVE is the card tray's gesture (mobile/src/card-tray.tsx),
 * the founder's ask: "similar animations to how people can adjust
 * which order their flares are in when they post." The same three
 * rules keep it smooth here. The laid-out order never changes while a
 * finger is down: the card in hand is an overlay drawn over the page
 * from where it was picked up, its pocket kept as an invisible
 * placeholder, and the neighbours slide by a transform driven from
 * one spring-animated number, the pocket the card is heading for. The
 * pocket changes with a dead zone, so a card resting on a line does
 * not flicker between two. And the drop is one movement: the overlay
 * glides onto its pocket, and only when it has landed is the order
 * committed, in one render that swaps the overlay for the real pocket
 * in the same pixels.
 *
 * The page is a grid, so "the pocket the card is heading for" is the
 * one under the card's centre, and a neighbour making way slides to
 * the pocket before or after its own, which at the end of a row means
 * the next row. Holding at the page's left or right edge turns the
 * page and keeps the card in hand: on the new page the card has no
 * pocket of its own, so every pocket from the target on makes way
 * (coming from a later page) or every pocket up to it shuffles back
 * one, the first leaving for the page before (coming from an earlier
 * page), which is exactly what the committed order will look like.
 */

/** The ring round each pocket, the gap between them, the page's padding. */
const POCKET_RING = 2;
const POCKET_GAP = spacing(2);
const PAGE_PAD = spacing(3);

/* How far into a pocket a card's centre must be before that pocket is
   the one it is heading for: within this of the pocket's own centre,
   in pocket widths. Under a half, so a card resting on the line
   between two pockets stays where it was. */
const DEAD_ZONE = 0.4;
/* The strip at the page's left and right edge where a held card turns
   the page, and how long it has to wait there. */
const EDGE = 28;
const EDGE_HOLD_MS = 600;

/** Snappy, not rigid: the pick-up, and the neighbours making way. */
const SPRING = { damping: 20, stiffness: 240, mass: 0.6 } as const;
/** The drop: one glide onto the pocket, deterministic so it can be waited for. */
const DROP = { duration: 220, easing: Easing.out(Easing.cubic) } as const;

type Filter = "all" | "hunts";

/** What one page's grid measures, in points. */
interface Geometry {
  layout: BinderLayout;
  per: number;
  pageWidth: number;
  pocketWidth: number;
  pocketHeight: number;
  slotW: number;
  slotH: number;
}

const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, value));

/**
 * Where pocket `index` sits on its page. Out of range on purpose for
 * a neighbour leaving the page: -1 is off the left of the first row,
 * `per` is off the right of the last.
 */
function cellOf(index: number, layout: number, slotW: number, slotH: number) {
  "worklet";
  const per = layout * layout;
  const col = index < 0 ? -1 : index >= per ? layout : index % layout;
  const row = index < 0 ? 0 : index >= per ? layout - 1 : Math.floor(index / layout);
  return { x: PAGE_PAD + col * slotW, y: PAGE_PAD + row * slotH };
}

/** The list with the card at `from` now at `to`, the others shifted. */
function moved<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [card] = next.splice(from, 1);
  if (card === undefined) return list;
  next.splice(Math.min(to, next.length), 0, card);
  return next;
}

export function BinderScreen({ playerId }: { playerId?: string }) {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const window = useWindowDimensions();
  const [binder, setBinder] = useState<Binder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const pager = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    try {
      const { binder: fresh } = await getBinder(playerId);
      setBinder(fresh);
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.code === "private"
          ? "private"
          : describeError(caught),
      );
    }
  }, [playerId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  /* The header names whose binder this is, once that is known. */
  useEffect(() => {
    if (!binder) return;
    navigation.setOptions({
      title: binder.yours ? "Your binder" : `${binder.ownerName}'s binder`,
    });
  }, [binder, navigation]);

  /*
   * Every write: paint what came back at once, then re-read. The
   * server's answer carries the whole binder, so the page is right
   * before the reload lands, and the reload is the confirmation.
   */
  const write = async (work: () => Promise<{ binder: Binder }>) => {
    setWriteError(null);
    try {
      const result = await work();
      setBinder(result.binder);
      void load();
    } catch (caught) {
      setWriteError(
        caught instanceof ApiError && caught.code === "at-cap"
          ? "Your binder is full. Two hundred cards is as many as it holds."
          : (serverMessage(caught) ?? `That did not save (${describeError(caught)}).`),
      );
      void load();
    }
  };

  const save = (patch: BinderSettingsPatch) => {
    /* The setting paints before the server answers; a refusal paints
       the truth back through the reload. */
    setBinder((current) => (current ? { ...current, ...patch } : current));
    void write(() => saveBinder(patch));
  };

  const yours = binder?.yours ?? false;
  const allCards = binder?.cards ?? [];
  const cards =
    filter === "hunts" ? allCards.filter((card) => card.onYourHunt) : allCards;
  const layout = binder?.layout ?? 3;
  const per = pocketsPerPage(layout);
  /*
   * The owner always has somewhere to put the next card: when the
   * last page is full (or there are no cards at all) one more page of
   * "+" pockets follows. A visitor sees only the pages with cards on
   * them, and never an empty page.
   */
  const pageCount = yours
    ? Math.ceil((cards.length + 1) / per)
    : Math.max(1, Math.ceil(cards.length / per));
  const at = Math.min(page, pageCount - 1);

  const pageWidth = window.width - 2 * gutter;
  const pocketWidth = (pageWidth - 2 * PAGE_PAD - (layout - 1) * POCKET_GAP) / layout;
  const pocketHeight = Math.round((pocketWidth * 88) / 63);
  const geometry: Geometry = {
    layout,
    per,
    pageWidth,
    pocketWidth,
    pocketHeight,
    slotW: pocketWidth + POCKET_GAP,
    slotH: pocketHeight + POCKET_GAP,
  };

  const turnTo = (index: number) => {
    const next = clamp(index, 0, pageCount - 1);
    setPage(next);
    pager.current?.scrollTo({ x: next * pageWidth, animated: true });
  };

  const onPagerEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
    setPage(clamp(index, 0, pageCount - 1));
  };

  const drag = useHoldToMove({
    enabled: yours,
    cards: allCards,
    geometry,
    page: at,
    pageCount,
    turnTo,
    onMove: (from, to) => {
      const next = moved(allCards, from, to);
      setBinder((current) => (current ? { ...current, cards: next } : current));
      void write(() => reorderBinder(next.map((card) => card.entryId)));
    },
  });

  if (!binder) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.canvas,
          paddingHorizontal: gutter,
          paddingVertical: spacing(4),
        }}
      >
        {error === "private" ? (
          <Muted>This binder is private.</Muted>
        ) : error ? (
          <Muted>{`This binder could not be opened (${error}).`}</Muted>
        ) : (
          <Loading />
        )}
      </View>
    );
  }

  /* The whole binder is one shelf in the viewer, so a swipe in the
     large view walks every card, not just this page's nine. */
  const shelf: ZoomCard[] = cards.map((card) => ({
    imageUrl: card.imageUrl,
    name: card.name,
    cardNumber: card.number,
    caption: card.printingLabel,
    note: card.note,
    direction: "showcase",
  }));

  const heldCard = drag.held
    ? allCards.find((card) => card.entryId === drag.held?.entryId)
    : undefined;

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.canvas }}
        /* A card in hand roams; the screen under it holds still. */
        scrollEnabled={!drag.held}
        contentContainerStyle={{
          paddingHorizontal: gutter,
          paddingVertical: spacing(3),
          gap: spacing(3),
        }}
      >
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
          {`${binder.count} ${binder.count === 1 ? "card" : "cards"} · Page ${at + 1} of ${pageCount}`}
        </Text>

        {/* The chips: a visitor whose hunts this binder answers can
            look at only those. The owner has no chips. */}
        {!yours && binder.onYourHunts > 0 ? (
          <View style={{ flexDirection: "row", gap: spacing(2) }}>
            <Chip
              label="All"
              on={filter === "all"}
              onPress={() => {
                setFilter("all");
                turnTo(0);
              }}
            />
            <Chip
              label="On your hunts"
              count={binder.onYourHunts}
              on={filter === "hunts"}
              onPress={() => {
                setFilter("hunts");
                turnTo(0);
              }}
            />
          </View>
        ) : null}

        {/* The pages, one screen wide each, turned with a swipe. The
            card in hand is drawn beside the pager, not in it, so the
            pager keeps clipping and paging like any other. */}
        <View style={{ width: pageWidth }}>
          <ScrollView
            ref={pager}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEnabled={!drag.held}
            onMomentumScrollEnd={onPagerEnd}
            style={{ width: pageWidth }}
          >
            {Array.from({ length: pageCount }, (_, index) => (
              <BinderPage
                key={index}
                geometry={geometry}
                cards={cards.slice(index * per, index * per + per)}
                shelfStart={index * per}
                shelf={shelf}
                yours={yours}
                editing={yours && editing}
                frontEntryId={binder.frontEntryId}
                drag={drag}
                /* Only the page under the card makes way. */
                dragging={drag.held !== null && index === at}
                onAdd={() => setAdding(true)}
                onRemove={(entryId) => {
                  setBinder((current) =>
                    current
                      ? {
                          ...current,
                          cards: current.cards.filter(
                            (card) => card.entryId !== entryId,
                          ),
                          count: Math.max(0, current.count - 1),
                          frontEntryId:
                            current.frontEntryId === entryId
                              ? null
                              : current.frontEntryId,
                        }
                      : current,
                  );
                  void write(() => removeBinderCard(entryId));
                }}
                onFront={(entryId) => save({ frontEntryId: entryId })}
              />
            ))}
          </ScrollView>

          {/* The card in hand, over the page, following the finger. */}
          {drag.held && heldCard ? (
            <HeldPocket
              card={heldCard}
              geometry={geometry}
              left={drag.held.x}
              top={drag.held.y}
              dragX={drag.dragX}
              dragY={drag.dragY}
              lift={drag.lift}
            />
          ) : null}
        </View>

        <PageDots at={at} of={pageCount} />

        {cards.length === 0 && !yours ? <Muted>Nothing to trade yet.</Muted> : null}

        {yours ? (
          <View style={{ gap: spacing(3) }}>
            {binder.count === 0 ? (
              <Muted>Cards you would trade. Add the ones you carry.</Muted>
            ) : null}
            <Button label="Add cards" onPress={() => setAdding(true)} />
            <Button
              label={editing ? "Done" : "Edit"}
              variant="secondary"
              onPress={() => setEditing((on) => !on)}
            />
            <ErrorLine message={writeError} />
            <BinderSettings binder={binder} onSave={save} />
          </View>
        ) : (
          <MessageOwner playerId={binder.ownerId} name={binder.ownerName} />
        )}
      </ScrollView>

      {yours ? (
        <AddCardsSheet
          visible={adding}
          onClose={() => setAdding(false)}
          onPick={(cardId, printingId) => {
            setAdding(false);
            setFilter("all");
            turnTo(0);
            void write(() => addBinderCard(cardId, printingId, 1));
          }}
        />
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Hold to move                                                        */
/* ------------------------------------------------------------------ */

/** A card in hand: which, where it came from, where its overlay starts. */
interface Held {
  entryId: string;
  /** The page it was picked up from, and its pocket there. */
  page: number;
  from: number;
  /** Where the overlay is drawn from, in the pager's coordinates. */
  x: number;
  y: number;
}

interface HoldToMove {
  held: Held | null;
  /** The pocket the card is heading for, spring-smoothed. */
  slot: SharedValue<number>;
  /** The pocket it left on the page under it: its own, or off-page. */
  from: SharedValue<number>;
  dragX: SharedValue<number>;
  dragY: SharedValue<number>;
  lift: SharedValue<number>;
  wobble: SharedValue<number>;
  /** The long press on a pocket: the card lifts and the page wiggles. */
  pickUp: (entryId: string) => void;
  /** The pan on a pocket, built once per card. */
  handlersFor: (entryId: string) => GestureResponderHandlers | undefined;
  /** A finger lifted before it ever moved: the card goes back down. */
  onTouchEnd: () => void;
}

/**
 * The gesture, all of it: the card tray's machinery with a grid under
 * it instead of a row, and a page turn at the edges.
 */
function useHoldToMove({
  enabled,
  cards,
  geometry,
  page,
  pageCount,
  turnTo,
  onMove,
}: {
  enabled: boolean;
  cards: BinderCard[];
  geometry: Geometry;
  page: number;
  pageCount: number;
  turnTo: (index: number) => void;
  /** Told once, when the card has landed: the card at `from` now sits at `to`. */
  onMove: (from: number, to: number) => void;
}): HoldToMove {
  const [held, setHeld] = useState<Held | null>(null);
  /*
   * Read at the moment of the question rather than captured when the
   * responder was built, so the touch that lifts the card can turn
   * into the drag without lifting the finger.
   */
  const heldRef = useRef(false);
  const grantedRef = useRef(false);
  const droppingRef = useRef(false);
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  const geometryRef = useRef(geometry);
  geometryRef.current = geometry;
  const pageRef = useRef(page);
  pageRef.current = page;
  const pageCountRef = useRef(pageCount);
  pageCountRef.current = pageCount;
  const turnToRef = useRef(turnTo);
  turnToRef.current = turnTo;
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const slot = useSharedValue(0);
  const from = useSharedValue(0);
  const lift = useSharedValue(0);
  const wobble = useSharedValue(0);

  /* The card in hand, as the handlers see it. */
  const source = useRef<{
    entryId: string;
    index: number;
    page: number;
    local: number;
  }>({ entryId: "", index: 0, page: 0, local: 0 });
  const targetPage = useRef(0);
  const slotNow = useRef(0);
  const overlay = useRef({ x: 0, y: 0 });
  /* Where the card's centre is, for re-aiming after a page turn. */
  const centre = useRef({ x: 0, y: 0 });
  /* Where the finger holds the card, for the edge zones. */
  const grab = useRef({ x: 0, y: 0 });
  const edgeZone = useRef(0);
  const edgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startWiggle = () => {
    wobble.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 110, easing: Easing.linear }),
        withTiming(-1, { duration: 220, easing: Easing.linear }),
        withTiming(0, { duration: 110, easing: Easing.linear }),
      ),
      -1,
    );
  };

  const stopWiggle = () => {
    cancelAnimation(wobble);
    wobble.value = withTiming(0, { duration: 140 });
  };

  const clearEdge = () => {
    if (edgeTimer.current) clearTimeout(edgeTimer.current);
    edgeTimer.current = null;
    edgeZone.current = 0;
  };

  useEffect(() => clearEdge, []);

  /* The pocket this page has for a card coming from elsewhere: before
     its first (an earlier page) or after its last (a later page). */
  const neutralFor = (pageIndex: number) => {
    if (source.current.page === pageIndex) return source.current.local;
    return source.current.page < pageIndex ? -1 : geometryRef.current.per;
  };

  /**
   * The pocket under the card's centre on the page under it, with the
   * dead zone, and the neighbours told to make way when it changes.
   */
  const aim = (cx: number, cy: number) => {
    const g = geometryRef.current;
    const onPage = clamp(
      cardsRef.current.length - targetPage.current * g.per,
      0,
      g.per,
    );
    const samePage = source.current.page === targetPage.current;
    /* Insert after the last card from another page; on its own page
       the card is already one of them. */
    const last = samePage ? onPage - 1 : onPage;

    const fx = (cx - PAGE_PAD - g.pocketWidth / 2) / g.slotW;
    const fy = (cy - PAGE_PAD - g.pocketHeight / 2) / g.slotH;
    const col = Math.round(fx);
    const row = Math.round(fy);
    const ccol = clamp(col, 0, g.layout - 1);
    const crow = clamp(row, 0, g.layout - 1);
    const wanted = clamp(crow * g.layout + ccol, 0, Math.max(0, last));
    if (wanted === slotNow.current) return;
    /* On the grid, the card has to be well inside the new pocket;
       off it, the nearest edge pocket is wanted at once. */
    if (col === ccol && Math.abs(fx - col) > DEAD_ZONE) return;
    if (row === crow && Math.abs(fy - row) > DEAD_ZONE) return;
    slotNow.current = wanted;
    slot.value = withSpring(wanted, SPRING);
    Haptics.selectionAsync().catch(() => {});
  };

  /** The page turns under the held card; the card keeps its place in hand. */
  const turnHeld = (direction: -1 | 1) => {
    edgeTimer.current = null;
    if (!heldRef.current || droppingRef.current) return;
    const next = targetPage.current + direction;
    if (next < 0 || next > pageCountRef.current - 1) return;
    targetPage.current = next;
    turnToRef.current(next);
    const neutral = neutralFor(next);
    from.value = neutral;
    slotNow.current = neutral;
    slot.value = neutral;
    aim(centre.current.x, centre.current.y);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    /* Still at the edge: the next page after the same wait. */
    edgeTimer.current = setTimeout(() => turnHeld(direction), EDGE_HOLD_MS);
  };

  const watchEdge = (fingerX: number) => {
    const g = geometryRef.current;
    const zone =
      fingerX < EDGE && targetPage.current > 0
        ? -1
        : fingerX > g.pageWidth - EDGE && targetPage.current < pageCountRef.current - 1
          ? 1
          : 0;
    if (zone === edgeZone.current) return;
    if (edgeTimer.current) clearTimeout(edgeTimer.current);
    edgeTimer.current = null;
    edgeZone.current = zone;
    if (zone !== 0) {
      edgeTimer.current = setTimeout(() => turnHeld(zone), EDGE_HOLD_MS);
    }
  };

  /*
   * The overlay has landed on its pocket: commit the order and take
   * the overlay away, in ONE render. The real pocket appears exactly
   * where the overlay was, so the swap is invisible.
   */
  const land = (fromIndex: number, toIndex: number) => {
    heldRef.current = false;
    grantedRef.current = false;
    droppingRef.current = false;
    stopWiggle();
    setHeld(null);
    if (fromIndex !== toIndex) onMoveRef.current(fromIndex, toIndex);
    dragX.value = 0;
    dragY.value = 0;
    lift.value = 0;
  };

  const release = () => {
    if (!heldRef.current || droppingRef.current) return;
    droppingRef.current = true;
    clearEdge();
    const g = geometryRef.current;
    const to = slotNow.current;
    const target = cellOf(to, g.layout, g.slotW, g.slotH);
    const toIndex = targetPage.current * g.per + to;
    /* Glide to where the pocket is laid out, then land. The three run
       the same clock, so they finish together. */
    lift.value = withTiming(0, DROP);
    dragY.value = withTiming(target.y - overlay.current.y, DROP);
    dragX.value = withTiming(target.x - overlay.current.x, DROP, (finished) => {
      if (finished) runOnJS(land)(source.current.index, toIndex);
    });
  };

  const pickUp = (entryId: string) => {
    if (!enabled || heldRef.current) return;
    const index = cardsRef.current.findIndex((card) => card.entryId === entryId);
    if (index < 0) return;
    const g = geometryRef.current;
    const sourcePage = Math.floor(index / g.per);
    const local = index % g.per;
    heldRef.current = true;
    grantedRef.current = false;
    droppingRef.current = false;
    source.current = { entryId, index, page: sourcePage, local };
    targetPage.current = sourcePage;
    slotNow.current = local;
    from.value = local;
    slot.value = local;
    dragX.value = 0;
    dragY.value = 0;
    lift.value = withSpring(1, SPRING);
    const cell = cellOf(local, g.layout, g.slotW, g.slotH);
    overlay.current = cell;
    centre.current = { x: cell.x + g.pocketWidth / 2, y: cell.y + g.pocketHeight / 2 };
    grab.current = { x: g.pocketWidth / 2, y: g.pocketHeight / 2 };
    startWiggle();
    setHeld({ entryId, page: sourcePage, from: local, x: cell.x, y: cell.y });
  };

  const responders = useMemo(
    () =>
      new Map(
        enabled
          ? cards.map((card) => [
              card.entryId,
              PanResponder.create({
                onStartShouldSetPanResponder: () => false,
                /* Captured, so the move is taken from the pocket's own
                   press (which opens the viewer) rather than asked for
                   after it has already decided the gesture was a tap. */
                onMoveShouldSetPanResponderCapture: (_e, g) =>
                  heldRef.current &&
                  !grantedRef.current &&
                  source.current.entryId === card.entryId &&
                  (Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2),
                onMoveShouldSetPanResponder: (_e, g) =>
                  heldRef.current &&
                  !grantedRef.current &&
                  source.current.entryId === card.entryId &&
                  (Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2),
                onPanResponderGrant: (event) => {
                  grantedRef.current = true;
                  grab.current = {
                    x: event.nativeEvent.locationX,
                    y: event.nativeEvent.locationY,
                  };
                },
                onPanResponderMove: (_e, g) => {
                  if (!heldRef.current || droppingRef.current) return;
                  /* Straight to shared values: no render, and the card
                     is under the finger on the very next frame. */
                  dragX.value = g.dx;
                  dragY.value = g.dy;
                  const geo = geometryRef.current;
                  const cx = overlay.current.x + geo.pocketWidth / 2 + g.dx;
                  const cy = overlay.current.y + geo.pocketHeight / 2 + g.dy;
                  centre.current = { x: cx, y: cy };
                  aim(cx, cy);
                  watchEdge(overlay.current.x + grab.current.x + g.dx);
                },
                /* Once the card is in hand, nobody else gets the touch:
                   the pager and the screen both scroll, and both would
                   ask for it back the moment the finger moved. */
                onPanResponderTerminationRequest: () => false,
                onShouldBlockNativeResponder: () => true,
                onPanResponderRelease: release,
                onPanResponderTerminate: release,
              }),
            ])
          : [],
      ),
    /* Built per card from the list only: a drag never has its handlers
       pulled out from under it, and they read live state from refs. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cards, enabled],
  );

  return {
    held,
    slot,
    from,
    dragX,
    dragY,
    lift,
    wobble,
    pickUp,
    handlersFor: (entryId) => responders.get(entryId)?.panHandlers,
    onTouchEnd: () => {
      /* Lifted but never dragged: the pan was never granted, so its
         release never fires. The touch itself says the finger is gone. */
      if (heldRef.current && !grantedRef.current) release();
    },
  };
}

/* ------------------------------------------------------------------ */
/* The page and its pockets                                            */
/* ------------------------------------------------------------------ */

/**
 * One page: a grid of pockets. An empty pocket is a "+" for the owner
 * and plain black for anyone else.
 */
function BinderPage({
  geometry,
  cards,
  shelfStart,
  shelf,
  yours,
  editing,
  frontEntryId,
  drag,
  dragging,
  onAdd,
  onRemove,
  onFront,
}: {
  geometry: Geometry;
  cards: BinderCard[];
  /** Where this page's first card sits on the whole shelf. */
  shelfStart: number;
  shelf: ZoomCard[];
  yours: boolean;
  editing: boolean;
  frontEntryId: string | null;
  drag: HoldToMove;
  /** A card is in hand over this page: its pockets make way. */
  dragging: boolean;
  onAdd: () => void;
  onRemove: (entryId: string) => void;
  onFront: (entryId: string) => void;
}) {
  const { per, pageWidth, pocketWidth, pocketHeight } = geometry;

  return (
    <View
      style={{
        width: pageWidth,
        padding: PAGE_PAD,
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.elevated,
        flexDirection: "row",
        flexWrap: "wrap",
        gap: POCKET_GAP,
        /* A pocket making way for a card from another page slides
           off the edge, and stops there. */
        overflow: "hidden",
      }}
    >
      {Array.from({ length: per }, (_, index) => {
        const card = cards[index];
        if (!card) {
          return yours ? (
            <AddPocket
              key={`empty-${index}`}
              width={pocketWidth}
              height={pocketHeight}
              onPress={onAdd}
            />
          ) : (
            <EmptyPocket
              key={`empty-${index}`}
              width={pocketWidth}
              height={pocketHeight}
            />
          );
        }
        return (
          <Pocket
            key={card.entryId}
            card={card}
            index={index}
            geometry={geometry}
            shelf={shelf}
            position={shelfStart + index}
            yours={yours}
            editing={editing}
            isFront={frontEntryId === card.entryId}
            placeholder={drag.held?.entryId === card.entryId}
            dragging={dragging}
            handlers={drag.handlersFor(card.entryId)}
            slot={drag.slot}
            from={drag.from}
            wobble={drag.wobble}
            onPickUp={() => drag.pickUp(card.entryId)}
            onTouchEnd={drag.onTouchEnd}
            onRemove={() => onRemove(card.entryId)}
            onFront={() => onFront(card.entryId)}
          />
        );
      })}
    </View>
  );
}

function EmptyPocket({ width, height }: { width: number; height: number }) {
  return (
    <View
      style={{
        width,
        height,
        borderRadius: 5,
        backgroundColor: colors.canvas,
        borderWidth: POCKET_RING,
        borderColor: "rgba(255,255,255,0.06)",
      }}
    />
  );
}

/**
 * An empty pocket on the owner's page is a way in: the founder,
 * "there should be a + on the open card areas in the binder to add a
 * card that way."
 */
function AddPocket({
  width,
  height,
  onPress,
}: {
  width: number;
  height: number;
  onPress: () => void;
}) {
  return (
    <Tap
      onPress={onPress}
      accessibilityLabel="Add cards"
      style={{
        width,
        height,
        borderRadius: 5,
        backgroundColor: colors.canvas,
        borderWidth: 1,
        borderStyle: "dashed",
        borderColor: colors.borderStrong,
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
      }}
    >
      <Text
        style={{
          color: colors.accent,
          fontSize: Math.min(28, Math.round(width / 3)),
          fontWeight: "300",
          lineHeight: Math.min(30, Math.round(width / 3) + 2),
        }}
      >
        +
      </Text>
      <Text style={{ color: colors.textSecondary, fontSize: 10, fontWeight: "600" }}>
        Add
      </Text>
    </Tap>
  );
}

/** The sleeve lip: a thin highlight where the plastic folds. */
function SleeveLip() {
  return (
    <LinearGradient
      colors={["rgba(255,255,255,0.22)", "transparent"]}
      pointerEvents="none"
      style={{ position: "absolute", top: 0, left: 0, right: 0, height: "6%" }}
    />
  );
}

/** The copies, in a corner, when there is more than one. */
function Copies({ quantity }: { quantity: number }) {
  if (quantity <= 1) return null;
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 4,
        left: 4,
        borderRadius: 999,
        backgroundColor: "rgba(0,0,0,0.75)",
        paddingHorizontal: 5,
        paddingVertical: 1,
      }}
    >
      <Text style={{ color: colors.textPrimary, fontSize: 9, fontWeight: "700" }}>
        {`×${quantity}`}
      </Text>
    </View>
  );
}

/**
 * A card in its pocket: the picture in a black ring with the sleeve's
 * lip caught along the top, the copies in a corner when there is more
 * than one, and the lime strip at the foot when it is on the viewer's
 * hunts. With Edit on, the owner's two controls sit over it.
 *
 * Laid out where the page puts it, always; while a card is in the air
 * over this page it slides aside by a transform driven from the pocket
 * that card is heading for, and the picked-up card's own pocket stays
 * as an invisible placeholder so the page keeps its shape.
 */
function Pocket({
  card,
  index,
  geometry,
  shelf,
  position,
  yours,
  editing,
  isFront,
  placeholder,
  dragging,
  handlers,
  slot,
  from,
  wobble,
  onPickUp,
  onTouchEnd,
  onRemove,
  onFront,
}: {
  card: BinderCard;
  /** This pocket's place on its page. */
  index: number;
  geometry: Geometry;
  shelf: ZoomCard[];
  position: number;
  yours: boolean;
  editing: boolean;
  isFront: boolean;
  placeholder: boolean;
  dragging: boolean;
  handlers: GestureResponderHandlers | undefined;
  slot: SharedValue<number>;
  from: SharedValue<number>;
  wobble: SharedValue<number>;
  onPickUp: () => void;
  onTouchEnd: () => void;
  onRemove: () => void;
  onFront: () => void;
}) {
  const { layout, pocketWidth: width, pocketHeight: height, slotW, slotH } = geometry;
  const big = layout === 2;

  const style = useAnimatedStyle(() => {
    /*
     * Making way. A pocket after the pick-up point slides to the
     * pocket before it once the card is heading for its pocket or
     * beyond; a pocket before it slides to the one after. `slot` is a
     * spring, so the slide is a glide and the pocket is exactly where
     * its new place will be laid out when it stops. At the end of a
     * row "the pocket before" is on the row above, and off the page
     * for the first and the last.
     */
    let shift = { x: 0, y: 0 };
    if (dragging && !placeholder) {
      const origin = from.value;
      const heading = slot.value;
      let toward = 0;
      let amount = 0;
      if (index > origin) {
        toward = -1;
        amount = Math.max(0, Math.min(1, heading - index + 1));
      } else if (index < origin) {
        toward = 1;
        amount = Math.max(0, Math.min(1, index + 1 - heading));
      }
      if (amount > 0) {
        const here = cellOf(index, layout, slotW, slotH);
        const there = cellOf(index + toward, layout, slotW, slotH);
        shift = { x: (there.x - here.x) * amount, y: (there.y - here.y) * amount };
      }
    }
    return {
      opacity: placeholder ? 0 : 1,
      transform: [
        { translateX: shift.x },
        { translateY: shift.y },
        { rotate: `${interpolate(wobble.value, [-1, 1], [-2.5, 2.5])}deg` },
      ],
    };
  });

  return (
    <Animated.View
      {...(handlers ?? {})}
      onTouchEnd={yours ? onTouchEnd : undefined}
      onTouchCancel={yours ? onTouchEnd : undefined}
      accessibilityLabel={`${card.name}, pocket ${index + 1} of ${layout * layout}${
        yours ? ", hold to move" : ""
      }`}
      style={[
        {
          width,
          height,
          borderRadius: 5,
          borderWidth: POCKET_RING,
          borderColor: colors.canvas,
          backgroundColor: colors.canvas,
          overflow: "hidden",
        },
        style,
      ]}
    >
      <CardImage
        imageUrl={card.imageUrl}
        width={width - 2 * POCKET_RING}
        name={card.name}
        cardNumber={card.number}
        caption={card.printingLabel}
        note={card.note}
        direction="showcase"
        siblings={shelf}
        position={position}
        onLongPress={yours ? onPickUp : undefined}
      />

      <SleeveLip />
      <Copies quantity={card.quantity} />

      {card.onYourHunt ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: colors.accent,
            paddingVertical: big ? 4 : 2,
            alignItems: "center",
          }}
        >
          <Text
            style={{
              color: colors.accentContrast,
              fontSize: big ? 10 : 8,
              fontWeight: "700",
              letterSpacing: 1,
            }}
          >
            ON YOUR HUNT
          </Text>
        </View>
      ) : null}

      {editing ? (
        <>
          <Tap
            onPress={onRemove}
            hitSlop={6}
            accessibilityLabel={`Remove ${card.name} from your binder`}
            style={{
              position: "absolute",
              top: 4,
              right: 4,
              width: 24,
              height: 24,
              borderRadius: 12,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(0,0,0,0.75)",
            }}
          >
            <Ionicons name="close" size={16} color={colors.textPrimary} />
          </Tap>
          <Tap
            onPress={onFront}
            hitSlop={4}
            accessibilityLabel={
              isFront
                ? `${card.name} is the front card`
                : `Make ${card.name} the front card`
            }
            style={{
              position: "absolute",
              left: 4,
              right: 4,
              bottom: 4,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: isFront ? colors.accent : colors.borderStrong,
              backgroundColor: isFront ? colors.accent : "rgba(0,0,0,0.75)",
              paddingVertical: 3,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                color: isFront ? colors.accentContrast : colors.textPrimary,
                fontSize: big ? 11 : 9,
                fontWeight: "700",
              }}
            >
              Front
            </Text>
          </Tap>
        </>
      ) : null}
    </Animated.View>
  );
}

/**
 * The card in hand: drawn over the page from the picked-up pocket's
 * place, moved only by the finger, lifted a little and ringed in the
 * accent. It never re-lays out, so it never jumps; on release it
 * glides onto its pocket and the page takes over.
 */
function HeldPocket({
  card,
  geometry,
  left,
  top,
  dragX,
  dragY,
  lift,
}: {
  card: BinderCard;
  geometry: Geometry;
  left: number;
  top: number;
  dragX: SharedValue<number>;
  dragY: SharedValue<number>;
  lift: SharedValue<number>;
}) {
  const { pocketWidth: width, pocketHeight: height } = geometry;
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: dragX.value },
      { translateY: dragY.value },
      { scale: 1 + 0.08 * lift.value },
    ],
    shadowOpacity: 0.5 * lift.value,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLabel={`${card.name}, in hand`}
      style={[
        {
          position: "absolute",
          left,
          top,
          width,
          height,
          borderRadius: 5,
          borderWidth: POCKET_RING,
          borderColor: colors.accent,
          backgroundColor: colors.canvas,
          overflow: "hidden",
          zIndex: 10,
          elevation: 10,
          shadowColor: colors.canvas,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 6 },
        },
        style,
      ]}
    >
      <RemoteImage
        uri={card.imageUrl}
        contentFit="contain"
        style={{
          width: width - 2 * POCKET_RING,
          height: Math.round(((width - 2 * POCKET_RING) * 88) / 63),
          borderRadius: radius.control / 2,
          backgroundColor: colors.canvas,
        }}
      />
      <SleeveLip />
      <Copies quantity={card.quantity} />
    </Animated.View>
  );
}

function PageDots({ at, of }: { at: number; of: number }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
      }}
    >
      {Array.from({ length: of }, (_, index) => (
        <View
          key={index}
          style={{
            height: 6,
            width: index === at ? 16 : 6,
            borderRadius: 3,
            backgroundColor: index === at ? colors.accent : colors.borderStrong,
          }}
        />
      ))}
    </View>
  );
}

function Chip({
  label,
  count,
  on,
  onPress,
}: {
  label: string;
  count?: number;
  on: boolean;
  onPress: () => void;
}) {
  return (
    <Tap
      onPress={onPress}
      accessibilityLabel={count === undefined ? label : `${label} ${count}`}
      style={{
        borderRadius: 999,
        borderWidth: 1,
        borderColor: on ? colors.accent : colors.border,
        backgroundColor: on ? colors.accent : colors.surface,
        paddingHorizontal: spacing(3),
        paddingVertical: spacing(1),
      }}
    >
      <Text
        style={{
          color: on ? colors.accentContrast : colors.textSecondary,
          fontWeight: "600",
          fontSize: 12,
        }}
      >
        {label}
        {count === undefined ? "" : ` ${count}`}
      </Text>
    </Tap>
  );
}

/**
 * The strip at the foot of your own binder: private or not, the
 * layout, the cover. Every change saves at once and paints at once.
 *
 * The switch says Private, and on means private. The founder: "the
 * toggle for public is kinda weird. should be a toggle for 'private'
 * if anything. so if the toggle is on, it is a private binder." The
 * server still keeps `isPublic`; the switch writes its opposite.
 */
function BinderSettings({
  binder,
  onSave,
}: {
  binder: Binder;
  onSave: (patch: BinderSettingsPatch) => void;
}) {
  return (
    <View
      style={{
        gap: spacing(3),
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        padding: spacing(4),
      }}
    >
      <Text style={{ color: colors.textPrimary, fontWeight: "700", fontSize: 16 }}>
        Binder
      </Text>

      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(3) }}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={{ color: colors.textPrimary, fontWeight: "600", fontSize: 15 }}>
            Private
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            {binder.isPublic
              ? "Anyone on cardflare can open it"
              : "Only you can open it"}
          </Text>
        </View>
        <Switch
          value={!binder.isPublic}
          onValueChange={(next) => onSave({ isPublic: !next })}
          trackColor={{ true: colors.accent, false: colors.borderStrong }}
          thumbColor={colors.textPrimary}
          accessibilityLabel="Private"
        />
      </View>

      <View style={{ gap: spacing(2) }}>
        <Text style={{ color: colors.textPrimary, fontWeight: "700", fontSize: 13 }}>
          Layout
        </Text>
        <View style={{ flexDirection: "row", gap: spacing(2) }}>
          {BINDER_LAYOUTS.map((layout) => (
            <Chip
              key={layout}
              label={layout === 2 ? "2 × 2" : "3 × 3"}
              on={binder.layout === layout}
              onPress={() => {
                if (binder.layout !== layout) onSave({ layout });
              }}
            />
          ))}
        </View>
      </View>

      <View style={{ gap: spacing(2) }}>
        <Text style={{ color: colors.textPrimary, fontWeight: "700", fontSize: 13 }}>
          Cover
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: "row", gap: spacing(3) }}>
            {BINDER_COVERS.map((cover) => {
              const on = binder.cover === cover.id;
              return (
                <Tap
                  key={cover.id}
                  onPress={() => {
                    if (!on) onSave({ cover: cover.id });
                  }}
                  accessibilityLabel={`${cover.name} cover`}
                  style={{ alignItems: "center", gap: spacing(1) }}
                >
                  <View
                    style={{
                      padding: 2,
                      borderRadius: 8,
                      borderWidth: 2,
                      borderColor: on ? colors.accent : "transparent",
                    }}
                  >
                    <BinderCover
                      cover={cover.id}
                      frontImageUrl={null}
                      size="xs"
                      plain
                    />
                  </View>
                  <Text
                    style={{
                      color: on ? colors.textPrimary : colors.textSecondary,
                      fontWeight: on ? "700" : "400",
                      fontSize: 11,
                    }}
                  >
                    {cover.name}
                  </Text>
                </Tap>
              );
            })}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

/** The one thing a visitor can do from a binder this round. */
function MessageOwner({ playerId, name }: { playerId: string; name: string }) {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const message = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await openDirectThread(playerId);
      if (result.ok && result.threadId) {
        navigation.navigate("LocalThread", { threadId: result.threadId });
        return;
      }
      setError(result.message ?? "Could not start the conversation.");
    } catch (caught) {
      setError(serverMessage(caught) ?? "Could not start the conversation.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: spacing(2) }}>
      <Button
        label={`Message ${name}`}
        variant="secondary"
        busy={busy}
        onPress={() => void message()}
      />
      <ErrorLine message={error} />
    </View>
  );
}

/** The card search in a sheet; picking a card adds it with one copy. */
function AddCardsSheet({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (cardId: string, printingId: string | null) => void;
}) {
  const insets = useSafeAreaInsets();
  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <SheetBackdrop />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable
          onPress={onClose}
          style={{
            flex: 1,
            justifyContent: "flex-end",
            padding: spacing(3),
            paddingBottom: Math.max(spacing(3), insets.bottom),
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              maxHeight: "85%",
              borderRadius: radius.card,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              padding: spacing(4),
              gap: spacing(3),
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: spacing(3),
              }}
            >
              <Text
                style={{ color: colors.textPrimary, fontWeight: "700", fontSize: 16 }}
              >
                Add cards
              </Text>
              <Tap onPress={onClose} accessibilityLabel="Close">
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </Tap>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              <CardPicker onPick={(hit, printingId) => onPick(hit.id, printingId)} />
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
