import { HeaderButton } from "../header";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Switch,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  LinearTransition,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { StackParams } from "../../App";
import { SheetBackdrop } from "../action-menu";
import {
  ApiError,
  BINDER_NAME_MAX,
  binderOfferError,
  deleteBinder,
  describeError,
  getBinder,
  offerOnBinder,
  openDirectThread,
  placeBinderCard,
  removeBinderCard,
  saveBinder,
  serverMessage,
  type Binder,
  type BinderCard,
  type BinderSettingsPatch,
  type OfferItem,
  type OfferOutcome,
} from "../api";
import { BinderAddSheet } from "../binder-add-sheet";
import { BinderCover } from "../binder-cover";
import { BINDER_COVERS, BINDER_LAYOUT } from "../binder-covers";
import { BINDER_OFFER_COPY, binderOfferSentLine } from "../binder-offer-copy";
import { binderShareUrl } from "../config";
import { inYourOfferLine } from "../offer-copy";
import { OfferReviewSheet } from "../offer-review-sheet";
import { POCKETS_PER_PAGE, pageOf, pagesFor, placeInPockets } from "../pocket-math";
import {
  AddPocket,
  Copies,
  EmptyPocket,
  PAGE_PAD,
  PageDots,
  PageFrame,
  Pocket,
  POCKET_RING,
  SleeveLip,
  cellOf,
  geometryFor,
  pocketLabel,
  type Geometry,
} from "../pockets";
import { RemoteImage } from "../remote-image";
import { colors, gutter, radius, spacing } from "../theme";
import {
  AsyncButton,
  Body,
  Button,
  CardImage,
  ErrorLine,
  Input,
  Loading,
  Muted,
  Tap,
  type ZoomCard,
  type ZoomHave,
  type ZoomPicks,
} from "../ui";

/**
 * One binder, open: the website's /profile/binders/[binderId] and
 * /p/[playerId]/binders/[binderId] on one screen. No playerId means
 * yours; binderId is the binder's uuid.
 *
 * Every binder is one of the owner's own, named by them, with one
 * switch, Up for trade: on, it is public to signed-in players and its
 * cards are there to be traded (nearby matching and the room hear
 * about them); off, it is private and only the owner opens it. Pages
 * of nine pockets, three by three, turned with a swipe, dots under
 * them. A tap on a pocket is the card large, in the one viewer every
 * shelf uses.
 *
 * REAL POCKETS. A card sits in its own pocket (page 1 is 0 to 8, page
 * 2 is 9 to 17) and gaps stay gaps, the way a binder keeps a slot open
 * for a card still being chased. Pages are drawn with pageOf and
 * pagesFor from src/pocket-math.ts, the website's arithmetic word for
 * word. For the owner every empty pocket is a "+" for THAT pocket: the
 * founder, "Adding a card in a specific slot should put that exact
 * card there."
 *
 * SOMEBODY ELSE'S BINDER UP FOR TRADE IS ANSWERABLE, with the Flare
 * viewer's own stack. The founder: "Any card in a trade binder you
 * should be able to do the same stack as making an offer on their
 * trade cards - like scrolling through them with the same UI as
 * making an offer on someone's flares. Can then DM them about them."
 * So every card carries a ZoomHave whose verb is "want" ("I want this
 * card"), the picks live here so a close keeps them ("2 in your offer
 * · Review" under the pockets, as on a Feed card), and the review
 * sends them through POST /api/v1/binders/<id>/offer as one message
 * in the pair's conversation. Then "Sent to Mia. It's in your
 * messages." with Open chat. The owner's binder has none of it.
 *
 * SHARE is its own round button beside the line under the title, for
 * the owner and visitors alike, apart from the pencil in the header.
 * The founder: "Share button shouldn't be in same bubble as edit." The
 * link is the short one, www.cardflare.gg/b/<shareCode> (the id when
 * the binder has no code yet), which opens the binder on the website
 * for anyone and in the app for anyone who has it. A private binder has
 * no link to share: the owner is told to turn on Up for trade.
 *
 * ADDING is the Flare picker, adapted (src/binder-add-sheet.tsx):
 * several cards, several copies, a pasted list, "Add 3 cards to
 * binder", the batch starting at the "+" pocket tapped. The binder's
 * settings (its name, Up for trade, the cover, and Delete binder) are a
 * sheet behind the pencil in the header. Every write paints at once
 * from what the server sends back and then asks for the truth again
 * behind it. A visitor gets the chips when any of the cards are on
 * their hunts, and one button, Message.
 *
 * THE GRID is measured, never guessed, and it is drawn from
 * src/pockets.tsx: the page frame, the pocket, the "+" pocket and
 * the dots are the same ones a hunt's page draws, so the two can
 * never disagree about what a pocket is. The frame reports its width
 * through onLayout and the pocket is a third of what is left inside
 * the frame's padding and the two gaps, floored, so three always fit
 * on a row; the arithmetic and the reason for it are with the pocket.
 *
 * DRAG IS ONE TOUCH. The founder: "you have to hold it down to go into
 * edit mode, then press it again. I should be able to hold it down,
 * and without lifting finger start moving the cards around." So the
 * page frame carries one gesture-handler pan that activates after a
 * 300 ms hold: the card under the finger lifts with a haptic, grows a
 * touch with a shadow, and follows the same finger. The pocket under
 * the finger is where it will land, and the other cards slide there
 * and then as placeInPockets says (an empty pocket takes it; a full one
 * slides the run along to the next gap). Held at the left or right
 * edge for 600 ms, the page turns. A tap is still the card's own press
 * and opens the viewer; a quick swipe moves before the hold is up, so
 * the pan fails and the pager turns. Only the owner can drag.
 *
 * THE DROP paints at once (placeInPockets) and then PATCHes the pocket;
 * a refusal puts every card back where it was and says so.
 *
 * REMOVE is a drop too. While a card is in hand a dashed zone in the
 * danger colour appears under the page frame; it is measured with
 * onLayout against the same parent as the frame, so the finger, which
 * the gesture tracks in the frame's coordinates, can be asked whether
 * it is over it. Dropped there, the card leaves the binder and the
 * overlay fades out where it is instead of gliding home.
 */

/** Snappy, not rigid: the pick-up. */
const SPRING = { damping: 20, stiffness: 240, mass: 0.6 } as const;
/** The drop: one glide onto the pocket. */
const DROP = { duration: 200, easing: Easing.out(Easing.cubic) } as const;
/** How much the held card grows in hand. */
const LIFT_SCALE = 0.08;
/** How long a finger rests on a card before it lifts. */
const HOLD_MS = 300;
/** How long a held card rests at the page's edge before the page turns. */
const EDGE_TURN_MS = 600;
/** How close to the frame's side counts as the edge. */
const EDGE_WIDTH = 28;
/** The other cards making way, on the drop's clock. */
const SLIDE = LinearTransition.duration(DROP.duration);

/** Under the Up for trade switch, the create sheet's line word for word. */
const FOR_TRADE_LINE = "People nearby hunting one of these cards hear about it.";

type Filter = "all" | "hunts";

const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, value));

export function BinderScreen({
  playerId,
  binderId,
}: {
  playerId?: string;
  /** The binder's uuid. */
  binderId?: string;
}) {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const id = binderId || "";
  const [binder, setBinder] = useState<Binder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  /* What the last batch said: "Added 3 cards." */
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(0);
  /* The add menu, open on the pocket it was opened from; null while closed. */
  const [addAt, setAddAt] = useState<number | null>(null);
  /* The settings sheet, behind the pencil in the header. */
  const [settingsOpen, setSettingsOpen] = useState(false);
  /* The delete confirm, over the page. */
  const [deleting, setDeleting] = useState(false);
  /* The page frame's width, as laid out; nothing is drawn before it is known. */
  const [pageWidth, setPageWidth] = useState(0);
  const pager = useRef<ScrollView>(null);
  /* The offer being built on somebody's trade binder, entryId ->
     copies: here rather than in the viewer, so a close keeps it. */
  const [picks, setPicks] = useState<ZoomPicks>({});
  /* The review, opened from "N in your offer · Review". */
  const [reviewing, setReviewing] = useState(false);
  /* What the last send answered: the conversation Open chat goes to. */
  const lastSent = useRef<{ threadId: string } | null>(null);

  /* Another binder in the same screen (a share link opened over this
     one) starts with an empty offer. */
  useEffect(() => {
    setPicks({});
    setReviewing(false);
  }, [id]);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const { binder: fresh } = await getBinder(playerId, id);
      setBinder(fresh);
      setError(null);
    } catch (caught) {
      /* By id alone (a share link) a binder that is not up for trade
         is a plain 404, which reads the same as "private" here. */
      setError(
        caught instanceof ApiError &&
          (caught.code === "private" || caught.code === "not-found")
          ? "private"
          : describeError(caught),
      );
    }
  }, [id, playerId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  /* The header is the binder's name, once that is known: the name, or
     "<Name>'s <name>" on somebody else's. The website's page title
     says the same. The owner's header carries the pencil that opens
     the settings sheet, and nothing else: Share has its own button. */
  useEffect(() => {
    if (!binder) return;
    navigation.setOptions({
      title: binderTitle(binder),
      headerRight: binder.yours
        ? () => (
            <HeaderButton
              icon="pencil-outline"
              label="Binder settings"
              onPress={() => setSettingsOpen(true)}
            />
          )
        : undefined,
    });
  }, [binder, navigation]);

  /* Writes go to the binder's own id once it is known: a share link
     may have opened it by its short code. */
  const writeId = binder?.id ?? id;

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
    void write(() => saveBinder(patch, writeId));
  };

  /* The binder, gone with its cards. Back to wherever it was opened
     from: the list or the profile, both of which re-read on focus, so
     the circle and the row are gone by the time Back lands. */
  const remove = async () => {
    setWriteError(null);
    try {
      await deleteBinder(writeId);
      setDeleting(false);
      navigation.goBack();
    } catch (caught) {
      setDeleting(false);
      setWriteError(
        serverMessage(caught) ?? `Could not delete it (${describeError(caught)}).`,
      );
    }
  };

  /* The server says whose it is. A share link arrives with the id
     alone, so "no playerId" no longer means "mine". */
  const yours = binder?.yours ?? false;
  /* An offer is somebody else's binder, up for trade. The server
     answers only a signed-in player, so anyone looking is one. */
  const offering = Boolean(binder && !binder.yours && binder.forTrade);
  const allCards = useMemo(
    () => [...(binder?.cards ?? [])].sort((a, b) => a.pocket - b.pocket),
    [binder?.cards],
  );
  /* A visitor's "On your hunts" packs the matches page by page from
     the first pocket: gaps are the owner's, not a filter's. */
  const cards =
    filter === "hunts"
      ? allCards
          .filter((card) => card.onYourHunt)
          .map((card, index) => ({ ...card, pocket: index }))
      : allCards;

  const geometry = useMemo(() => geometryFor(pageWidth), [pageWidth]);

  /*
   * The drop, painted before the server answers: placeInPockets, the
   * database's own rule. A refusal puts every card back and says so.
   */
  const place = (entryId: string, pocket: number) => {
    const before = binder?.cards ?? [];
    const moving = before.find((card) => card.entryId === entryId);
    if (!moving || moving.pocket === pocket) return;
    const next = placeInPockets(before, entryId, pocket);
    setBinder((current) => (current ? { ...current, cards: next } : current));
    setWriteError(null);
    setNotice(null);
    void (async () => {
      try {
        const result = await placeBinderCard(writeId, entryId, pocket);
        setBinder(result.binder);
        void load();
      } catch (caught) {
        setBinder((current) => (current ? { ...current, cards: before } : current));
        Alert.alert(
          "That card did not move.",
          serverMessage(caught) ?? `Try again (${describeError(caught)}).`,
        );
        void load();
      }
    })();
  };

  const pageCountRef = useRef(1);
  const pageWidthRef = useRef(pageWidth);
  pageWidthRef.current = pageWidth;

  const turnTo = (index: number) => {
    const next = clamp(index, 0, pageCountRef.current - 1);
    setPage(next);
    pager.current?.scrollTo({ x: next * pageWidthRef.current, animated: true });
  };

  const drag = useDragToPocket({
    enabled: yours,
    cards: allCards,
    geometry,
    page,
    onTurn: (index) => {
      turnTo(index);
      Haptics.selectionAsync().catch(() => {});
    },
    pageCount: () => pageCountRef.current,
    onPlace: place,
    onRemove: (entryId) => {
      setBinder((current) =>
        current
          ? {
              ...current,
              cards: current.cards.filter((entry) => entry.entryId !== entryId),
              count: Math.max(0, current.count - 1),
            }
          : current,
      );
      void write(() => removeBinderCard(entryId, writeId));
    },
  });

  /*
   * What the pages show: the cards where they are, or, while a held
   * card hovers a pocket, where they would be if it dropped there. The
   * held card's own place is the dashed outline wherever it lands.
   */
  const shown =
    drag.held && drag.target !== null && !drag.overRemove
      ? placeInPockets(allCards, drag.held.entryId, drag.target)
      : cards;
  const pageCount = Math.max(pagesFor(cards, yours), pagesFor(shown, yours));
  pageCountRef.current = pageCount;
  const at = Math.min(page, pageCount - 1);

  const onPagerEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (pageWidth <= 0) return;
    const index = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
    setPage(clamp(index, 0, pageCount - 1));
  };

  /* Whole points: a fractional width would put a fraction of a point
     into every pocket, and the pager snaps by this number. The frame's
     place in its parent goes to the gesture, which measures the Remove
     zone against the same parent. */
  const onFrameLayout = (event: LayoutChangeEvent) => {
    drag.onFrameLayout(event);
    const width = Math.floor(event.nativeEvent.layout.width);
    if (width !== pageWidth) setPageWidth(width);
  };

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
        {!id ? (
          <Muted>This binder could not be opened.</Muted>
        ) : error === "private" ? (
          <Muted>This binder is private.</Muted>
        ) : error ? (
          <View style={{ gap: spacing(3) }}>
            <Muted>{`This binder could not be opened (${error}).`}</Muted>
            <AsyncButton
              label="Try again"
              pendingLabel="Retrying…"
              onPress={() => load()}
            />
          </View>
        ) : (
          <Loading />
        )}
      </View>
    );
  }

  /*
   * Share: the short link that opens this binder on the website or in
   * the app. Read from the live setting, so the switch flipped in the
   * sheet a moment ago is the one obeyed. A private binder has no
   * public link, so the owner is told how to give it one rather than
   * handed a link that opens for nobody.
   */
  const share = () => {
    if (!binder.forTrade) {
      Alert.alert("Turn on Up for trade to share this binder.");
      return;
    }
    const url = binderShareUrl(binder.shareCode ?? binder.id);
    void Share.share({ message: url, url }).catch(() => {});
  };

  /*
   * The send, for the viewer and for the review under the pockets
   * alike: every pick in one call, the entry standing where a Flare
   * stands in the Flare viewer. It answers what the review expects of
   * a Flare's door (everything taken, since the server takes all or
   * nothing) and keeps the conversation for Open chat.
   */
  const ownerName = binder.ownerName;
  const sendOffer = async (items: OfferItem[], note: string): Promise<OfferOutcome> => {
    const result = await offerOnBinder(
      writeId,
      items.map((item) => ({ entryId: item.flareId, quantity: item.quantity })),
      note.trim() || null,
    );
    lastSent.current = { threadId: result.threadId };
    return { offered: items.length, refused: [] };
  };
  /* Once the send has landed and whatever it was sent from is gone:
     the picks go, and the sentence the website says, with the way to
     the conversation it went into. */
  const afterSend = () => {
    setPicks({});
    const threadId = lastSent.current?.threadId;
    Alert.alert(binderOfferSentLine(ownerName), undefined, [
      ...(threadId
        ? [
            {
              text: "Open chat",
              onPress: () => navigation.navigate("LocalThread", { threadId }),
            },
          ]
        : []),
      { text: "OK", style: "cancel" as const },
    ]);
  };
  const haveOf = (card: BinderCard): ZoomHave | null =>
    offering
      ? {
          postId: binder.id,
          posterName: ownerName,
          flareId: card.entryId,
          name: card.name,
          state: "open",
          youOffered: false,
          remaining: card.quantity,
          onOffer: sendOffer,
          verb: "want",
          failure: binderOfferError,
          onSent: afterSend,
        }
      : null;
  const offer = offering ? { picks, onPicks: setPicks, haveOf } : null;

  /* The whole binder is one shelf in the viewer, in pocket order, so a
     swipe in the large view walks every card, not just this page's nine. */
  const shelf: ZoomCard[] = cards.map((card) => ({
    imageUrl: card.imageUrl,
    name: card.name,
    cardNumber: card.number,
    caption: card.printingLabel,
    note: card.note,
    direction: "showcase",
    have: haveOf(card),
  }));
  const shelfAt = new Map(cards.map((card, index) => [card.entryId, index]));
  const inOffer = Object.keys(picks).length;

  /* The held card rides with the gesture, not the list: after a drop
     on Remove it is already off the shelf while the overlay fades. */
  const heldCard = drag.held?.card;

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
        {/* What the switch means for this binder, in one line under
            the title, and Share in its own round button beside it. A
            visitor is never shown a private one. */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(3) }}>
          <View style={{ flex: 1, minWidth: 0, gap: spacing(1) }}>
            <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}>
              {binderLine(binder)}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>
              {`${binder.count} ${binder.count === 1 ? "card" : "cards"} · Page ${at + 1} of ${pageCount}`}
            </Text>
          </View>
          <ShareButton onPress={share} />
        </View>

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

        {/* The page frame: as wide as the screen's content, measured,
            and the pages inside it exactly that wide. The hold-and-drag
            gesture is on the frame, not on a pocket, so a page turn or
            the cards sliding under the finger never takes the gesture
            away. The card in hand is drawn beside the pager, not in
            it, so the pager keeps clipping and paging like any other. */}
        <GestureDetector gesture={drag.gesture}>
          <View onLayout={onFrameLayout} style={{ alignSelf: "stretch" }}>
            {pageWidth > 0 ? (
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
                    page={index}
                    geometry={geometry}
                    slots={pageOf(shown, index)}
                    shelf={shelf}
                    shelfAt={shelfAt}
                    yours={yours}
                    heldId={drag.held?.entryId ?? null}
                    landing={drag.target !== null && !drag.overRemove}
                    onAdd={(pocket) => {
                      setNotice(null);
                      setAddAt(pocket);
                    }}
                    offer={offer}
                  />
                ))}
              </ScrollView>
            ) : null}

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
                presence={drag.presence}
              />
            ) : null}
          </View>
        </GestureDetector>

        {/* Under the page frame, only while a card is in hand: drop it
            here and it leaves the binder. Measured against the same
            parent as the frame, so the gesture knows where it is. */}
        {drag.held ? (
          <RemoveZone over={drag.overRemove} onLayout={drag.onRemoveZoneLayout} />
        ) : null}

        <PageDots at={at} of={pageCount} />

        {/* "2 in your offer · Review": the picks stay in sight while
            the viewer is closed, and Review is the door straight to
            them. The Feed card's line, the same words. */}
        {offering && inOffer > 0 ? (
          <View
            style={{ flexDirection: "row", alignItems: "center", gap: spacing(1.5) }}
          >
            <Ionicons name="checkmark-circle" size={15} color={colors.accent} />
            <Text
              style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "600" }}
            >
              {inYourOfferLine(inOffer)}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>·</Text>
            <Tap
              onPress={() => setReviewing(true)}
              hitSlop={8}
              accessibilityLabel="Review your offer"
            >
              <Text style={{ color: colors.accent, fontSize: 13, fontWeight: "700" }}>
                Review
              </Text>
            </Tap>
          </View>
        ) : null}

        {cards.length === 0 && !yours ? <Muted>Nothing to trade yet.</Muted> : null}

        {yours ? (
          <View style={{ gap: spacing(3) }}>
            {binder.count === 0 ? (
              <Muted>Cards you would trade. Add the ones you carry.</Muted>
            ) : (
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                Hold a card to move it, or drop it on Remove.
              </Text>
            )}
            {notice ? (
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                {notice}
              </Text>
            ) : null}
            <ErrorLine message={writeError} />
          </View>
        ) : (
          <MessageOwner playerId={binder.ownerId} name={binder.ownerName} />
        )}
      </ScrollView>

      {/* The review from the line under the pockets: the viewer's own,
          with the binder's words, sending through the same door. */}
      {offering && reviewing && inOffer > 0 ? (
        <OfferReviewSheet
          postId={binder.id}
          posterName={ownerName}
          lines={Object.entries(picks).map(([entryId, quantity]) => {
            const card = allCards.find((entry) => entry.entryId === entryId);
            return {
              flareId: entryId,
              name: card?.name ?? "one card",
              imageUrl: card?.imageUrl ?? null,
              printingLabel: card?.printingLabel ?? null,
              quantity,
              max: card?.quantity ?? 1,
            };
          })}
          onChange={(entryId, quantity) => {
            const next = { ...picks };
            if (quantity <= 0) delete next[entryId];
            else next[entryId] = quantity;
            setPicks(next);
          }}
          send={sendOffer}
          sendLabel={BINDER_OFFER_COPY.send}
          notePlaceholder={BINDER_OFFER_COPY.notePlaceholder}
          failure={binderOfferError}
          onSent={() => {
            setReviewing(false);
            afterSend();
          }}
          onClose={() => setReviewing(false)}
        />
      ) : null}

      {/* The add menu: the Flare picker, adapted, the batch starting at
          the pocket tapped. What it adds paints at once, the page turns
          to the first card it put in, and the server's sentence says
          what happened. */}
      {yours ? (
        <BinderAddSheet
          visible={addAt !== null}
          binderId={writeId}
          cards={allCards}
          pocket={addAt}
          onClose={() => setAddAt(null)}
          onAdded={(added) => {
            setAddAt(null);
            setFilter("all");
            setBinder(added.binder);
            setWriteError(null);
            setNotice(added.message);
            if (added.firstPocket !== null) {
              turnTo(Math.floor(added.firstPocket / POCKETS_PER_PAGE));
            }
            void load();
          }}
        />
      ) : null}

      {yours ? (
        <BinderSettingsSheet
          visible={settingsOpen}
          binder={binder}
          error={writeError}
          onClose={() => setSettingsOpen(false)}
          onSave={save}
          onDelete={() => {
            /* One modal at a time: the sheet goes before the confirm
               comes, so iOS is never asked to present over a modal it
               is still presenting. */
            setSettingsOpen(false);
            setDeleting(true);
          }}
        />
      ) : null}

      {yours ? (
        <DeleteBinderConfirm
          binder={deleting ? binder : null}
          onKeep={() => setDeleting(false)}
          onDelete={() => void remove()}
        />
      ) : null}
    </>
  );
}

/**
 * Share, on its own: a round button, never in the header's bubble with
 * the pencil. For the owner and for anyone looking.
 */
function ShareButton({ onPress }: { onPress: () => void }) {
  return (
    <Tap
      onPress={onPress}
      hitSlop={6}
      accessibilityLabel="Share binder"
      style={{
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons name="share-outline" size={20} color={colors.textPrimary} />
    </Tap>
  );
}

/**
 * The offer on somebody's trade binder, as a pocket needs it: the
 * picks the screen holds, and the card's door into the viewer.
 */
interface BinderOffer {
  picks: ZoomPicks;
  onPicks: (picks: ZoomPicks) => void;
  haveOf: (card: BinderCard) => ZoomHave | null;
}

/**
 * The name for the owner; "<Name>'s <name>" for anyone else. The
 * website's page title, word for word.
 */
function binderTitle(binder: Binder): string {
  return binder.yours ? binder.name : `${binder.ownerName}'s ${binder.name}`;
}

/** The line under the title: what Up for trade means for this one. */
function binderLine(binder: Binder): string {
  if (binder.forTrade) {
    return binder.yours
      ? "Up for trade. Somebody nearby hunting one of these hears about it."
      : `Cards ${binder.ownerName} will trade.`;
  }
  return "Private. Only you can open it.";
}

/* ------------------------------------------------------------------ */
/* Hold and drag                                                       */
/* ------------------------------------------------------------------ */

/** A card in hand: which, where it came from, where its overlay starts. */
interface Held {
  entryId: string;
  /** The card itself, kept so the overlay can fade out after a drop on Remove has taken it off the shelf. */
  card: BinderCard;
  /** Its pocket when it was picked up, and the page that pocket is on. */
  from: number;
  page: number;
  /** Where the overlay is drawn from, in the frame's coordinates. */
  x: number;
  y: number;
}

interface DragToPocket {
  held: Held | null;
  /** The pocket, in the whole binder, the held card would land in; null off the grid. */
  target: number | null;
  /** The finger is over the Remove zone. */
  overRemove: boolean;
  dragX: SharedValue<number>;
  dragY: SharedValue<number>;
  lift: SharedValue<number>;
  /** The overlay's opacity: 1 in hand, fading to 0 on a drop on Remove. */
  presence: SharedValue<number>;
  /** The one gesture, on the page frame. */
  gesture: ReturnType<typeof Gesture.Pan>;
  /** The page frame's place in its parent, so the zone can be put in its coordinates. */
  onFrameLayout: (event: LayoutChangeEvent) => void;
  /** The Remove zone's place in the frame's parent. */
  onRemoveZoneLayout: (event: LayoutChangeEvent) => void;
}

/** A rectangle in a parent's coordinates, as onLayout reports one. */
interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The gesture, all of it: one pan from react-native-gesture-handler on
 * the page frame, activating after HOLD_MS with the finger still. The
 * pan's own events carry the finger in the frame's coordinates, so the
 * card under it, the pocket it is over and the Remove zone are all
 * asked in one coordinate system. The shared values move the overlay
 * on the UI thread; everything that decides something runs on the JS
 * thread through runOnJS and reads live state from refs, so the
 * gesture, built once, never holds a stale idea of the binder.
 */
function useDragToPocket({
  enabled,
  cards,
  geometry,
  page,
  pageCount,
  onTurn,
  onPlace,
  onRemove,
}: {
  enabled: boolean;
  /** Every card, by pocket. */
  cards: BinderCard[];
  geometry: Geometry;
  /** The page open now. */
  page: number;
  pageCount: () => number;
  /** Turn to this page: a held card resting at the edge. */
  onTurn: (page: number) => void;
  /** Told once, on the drop: this card goes in this pocket. */
  onPlace: (entryId: string, pocket: number) => void;
  /** Told once, on a drop on Remove: this card leaves the binder. */
  onRemove: (entryId: string) => void;
}): DragToPocket {
  const [held, setHeld] = useState<Held | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const [overRemove, setOverRemove] = useState(false);

  /* Live state, read by the handlers at the moment of the question. */
  const live = useRef({ cards, geometry, page, pageCount, onTurn, onPlace, onRemove });
  live.current = { cards, geometry, page, pageCount, onTurn, onPlace, onRemove };

  /* Only the owner, and read live: the gesture is built once. */
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const lift = useSharedValue(0);
  const presence = useSharedValue(1);

  /* The card in hand, as the handlers see it. */
  const source = useRef<Held | null>(null);
  const targetRef = useRef<number | null>(null);
  const overRemoveRef = useRef(false);
  const droppingRef = useRef(false);
  /* The page the finger is on now: a held card can turn it. */
  const pageRef = useRef(page);
  /* The last finger, so a page turn can re-aim without a move. */
  const finger = useRef({ x: 0, y: 0 });
  /* The edge being rested on, and the timer that turns the page. */
  const edge = useRef<-1 | 0 | 1>(0);
  const edgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* The page frame and the Remove zone, both in the frame's parent's
     coordinates; the zone is null until it has been laid out. */
  const frameRef = useRef<Box>({ x: 0, y: 0, width: 0, height: 0 });
  const zoneRef = useRef<Box | null>(null);

  const stopEdge = () => {
    if (edgeTimer.current) clearTimeout(edgeTimer.current);
    edgeTimer.current = null;
    edge.current = 0;
  };
  useEffect(() => stopEdge, []);

  /** Whether a finger at (x, y), in the frame's coordinates, is over the Remove zone. */
  const overZone = (fingerX: number, fingerY: number) => {
    const zone = zoneRef.current;
    if (!zone) return false;
    const frame = frameRef.current;
    const left = zone.x - frame.x;
    const top = zone.y - frame.y;
    return (
      fingerX >= left &&
      fingerX <= left + zone.width &&
      fingerY >= top &&
      fingerY <= top + zone.height
    );
  };

  /** The pocket on the open page under (x, y), within the page (0 to 8), or null off the grid. */
  const pocketAt = (fingerX: number, fingerY: number): number | null => {
    const g = live.current.geometry;
    if (g.slotW <= 0 || g.slotH <= 0) return null;
    const col = Math.floor((fingerX - PAGE_PAD) / g.slotW);
    const row = Math.floor((fingerY - PAGE_PAD) / g.slotH);
    const inside = col >= 0 && col < BINDER_LAYOUT && row >= 0 && row < BINDER_LAYOUT;
    return inside ? row * BINDER_LAYOUT + col : null;
  };

  /**
   * The pocket under the finger, across the whole binder; below the
   * grid, the Remove zone is asked. A change ticks.
   */
  const aim = (fingerX: number, fingerY: number) => {
    const local = pocketAt(fingerX, fingerY);
    const next = local === null ? null : pageRef.current * POCKETS_PER_PAGE + local;
    const over = local === null && overZone(fingerX, fingerY);
    if (over !== overRemoveRef.current) {
      overRemoveRef.current = over;
      setOverRemove(over);
      if (over) Haptics.selectionAsync().catch(() => {});
    }
    if (next === targetRef.current) return;
    targetRef.current = next;
    setTarget(next);
    if (next !== null) Haptics.selectionAsync().catch(() => {});
  };

  /**
   * Resting at the left or right edge of the frame turns the page
   * after EDGE_TURN_MS, and keeps turning while the finger stays.
   */
  const watchEdge = (fingerX: number, fingerY: number) => {
    const width = frameRef.current.width;
    const onFrame = fingerY >= 0 && fingerY <= frameRef.current.height;
    const side: -1 | 0 | 1 =
      !onFrame || width <= 0
        ? 0
        : fingerX < EDGE_WIDTH
          ? -1
          : fingerX > width - EDGE_WIDTH
            ? 1
            : 0;
    if (side === edge.current) return;
    stopEdge();
    edge.current = side;
    if (side === 0) return;
    const turn = () => {
      const next = pageRef.current + side;
      if (next < 0 || next >= live.current.pageCount()) {
        stopEdge();
        return;
      }
      pageRef.current = next;
      live.current.onTurn(next);
      aim(finger.current.x, finger.current.y);
      edgeTimer.current = setTimeout(turn, EDGE_TURN_MS);
    };
    edgeTimer.current = setTimeout(turn, EDGE_TURN_MS);
  };

  /** The overlay has landed: the real pocket shows the card from here. */
  const land = () => {
    source.current = null;
    droppingRef.current = false;
    targetRef.current = null;
    overRemoveRef.current = false;
    zoneRef.current = null;
    setHeld(null);
    setTarget(null);
    setOverRemove(false);
    dragX.value = 0;
    dragY.value = 0;
    lift.value = 0;
    presence.value = 1;
  };

  /** The hold has lasted: the card under the finger lifts, with a firm tick. */
  const pickUp = (fingerX: number, fingerY: number) => {
    if (!enabledRef.current || source.current) return;
    const local = pocketAt(fingerX, fingerY);
    if (local === null) return;
    pageRef.current = clamp(live.current.page, 0, live.current.pageCount() - 1);
    const pocket = pageRef.current * POCKETS_PER_PAGE + local;
    const card = live.current.cards.find((entry) => entry.pocket === pocket);
    if (!card) return;
    const cell = cellOf(local, live.current.geometry);
    droppingRef.current = false;
    targetRef.current = pocket;
    overRemoveRef.current = false;
    finger.current = { x: fingerX, y: fingerY };
    source.current = {
      entryId: card.entryId,
      card,
      from: pocket,
      page: pageRef.current,
      x: cell.x,
      y: cell.y,
    };
    dragX.value = 0;
    dragY.value = 0;
    presence.value = 1;
    lift.value = withSpring(1, SPRING);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setHeld(source.current);
    setTarget(pocket);
    setOverRemove(false);
  };

  /** The same finger, moving: aim, and watch the edges. */
  const moveTo = (fingerX: number, fingerY: number) => {
    if (!source.current || droppingRef.current) return;
    finger.current = { x: fingerX, y: fingerY };
    aim(fingerX, fingerY);
    watchEdge(fingerX, fingerY);
  };

  /**
   * The drop. Over a pocket, the screen paints placeInPockets at once
   * and the overlay glides onto the pocket; over Remove, the card
   * leaves the binder and the overlay fades out where it is; off the
   * grid, the card goes home, to its own page if the page had turned.
   */
  const release = () => {
    stopEdge();
    const from = source.current;
    if (!from || droppingRef.current) return;
    droppingRef.current = true;
    const g = live.current.geometry;
    if (overRemoveRef.current) {
      overRemoveRef.current = false;
      targetRef.current = null;
      setTarget(null);
      setOverRemove(false);
      live.current.onRemove(from.entryId);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      lift.value = withTiming(0, DROP);
      presence.value = withTiming(0, DROP, (finished) => {
        if (finished) runOnJS(land)();
      });
      return;
    }
    const to = targetRef.current;
    let local = from.from % POCKETS_PER_PAGE;
    if (to !== null) {
      local = to % POCKETS_PER_PAGE;
      if (to !== from.from) {
        live.current.onPlace(from.entryId, to);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
    } else if (pageRef.current !== from.page) {
      pageRef.current = from.page;
      live.current.onTurn(from.page);
    }
    targetRef.current = null;
    setTarget(null);
    const cell = cellOf(local, g);
    lift.value = withTiming(0, DROP);
    dragY.value = withTiming(cell.y - from.y, DROP);
    dragX.value = withTiming(cell.x - from.x, DROP, (finished) => {
      if (finished) runOnJS(land)();
    });
  };

  /* Stable doors for the worklets, which keep what they were built with. */
  const doors = useRef({ pickUp, moveTo, release });
  doors.current = { pickUp, moveTo, release };
  const onPickUp = useCallback(
    (x: number, y: number) => doors.current.pickUp(x, y),
    [],
  );
  const onMove = useCallback((x: number, y: number) => doors.current.moveTo(x, y), []);
  const onRelease = useCallback(() => doors.current.release(), []);

  /*
   * The one touch. Pan, activating after the hold with the finger
   * still: a finger that moves sooner is a swipe, so the pan fails and
   * the pager (or the screen) has it. On activation the gesture
   * handler cancels the card's own press, so a drag never opens the
   * viewer; a tap ends before the hold and is the card's press.
   */
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled)
        .activateAfterLongPress(HOLD_MS)
        .onStart((event) => {
          "worklet";
          runOnJS(onPickUp)(event.x, event.y);
        })
        .onUpdate((event) => {
          "worklet";
          dragX.value = event.translationX;
          dragY.value = event.translationY;
          runOnJS(onMove)(event.x, event.y);
        })
        .onEnd(() => {
          "worklet";
          runOnJS(onRelease)();
        }),
    [enabled, dragX, dragY, onPickUp, onMove, onRelease],
  );

  return {
    held,
    target,
    overRemove,
    dragX,
    dragY,
    lift,
    presence,
    gesture,
    onFrameLayout: (event) => {
      frameRef.current = event.nativeEvent.layout;
    },
    onRemoveZoneLayout: (event) => {
      zoneRef.current = event.nativeEvent.layout;
    },
  };
}

/* ------------------------------------------------------------------ */
/* The page and its pockets                                            */
/* ------------------------------------------------------------------ */

/**
 * One page: nine real pockets, three across, from pageOf. An empty
 * pocket is a "+" for THAT pocket for the owner and plain black for
 * anyone else. Every pocket slides to its new place (SLIDE) when a held
 * card makes the others make way. The frame and the pockets are the
 * shared ones in pockets.tsx; what is in each pocket is this screen's.
 */
function BinderPage({
  page,
  geometry,
  slots,
  shelf,
  shelfAt,
  yours,
  heldId,
  landing,
  onAdd,
  offer,
}: {
  page: number;
  geometry: Geometry;
  /** This page's nine pockets, gaps as undefined. */
  slots: (BinderCard | undefined)[];
  shelf: ZoomCard[];
  /** Each card's place on the whole shelf. */
  shelfAt: Map<string, number>;
  yours: boolean;
  /** The card in hand, drawn here as the dashed outline of where it is or will be. */
  heldId: string | null;
  /** The held card is over a pocket: its outline wears the accent ring. */
  landing: boolean;
  /** The "+" in an empty pocket: the add menu, for that pocket. */
  onAdd: (pocket: number) => void;
  /** The offer being built, on somebody's trade binder; null otherwise. */
  offer: BinderOffer | null;
}) {
  const { pocketWidth, pocketHeight } = geometry;

  return (
    <PageFrame geometry={geometry}>
      {slots.map((card, index) => {
        const pocket = page * POCKETS_PER_PAGE + index;
        if (!card) {
          return (
            <Animated.View key={`empty-${pocket}`} layout={SLIDE}>
              {yours ? (
                <AddPocket
                  width={pocketWidth}
                  height={pocketHeight}
                  onPress={() => onAdd(pocket)}
                />
              ) : (
                <EmptyPocket width={pocketWidth} height={pocketHeight} />
              )}
            </Animated.View>
          );
        }
        const placeholder = heldId === card.entryId;
        return (
          <Animated.View key={card.entryId} layout={SLIDE}>
            <BinderPocket
              card={card}
              index={index}
              geometry={geometry}
              shelf={shelf}
              position={shelfAt.get(card.entryId) ?? 0}
              yours={yours}
              placeholder={placeholder}
              targeted={placeholder && landing}
              offer={offer}
            />
          </Animated.View>
        );
      })}
    </PageFrame>
  );
}

/**
 * A card in its pocket: the shared Pocket (the black ring, the
 * sleeve's lip, the clipping, the dashed outline while its card is in
 * the air, the accent ring where a held card will land) with the
 * picture in it, the copies as the quantity tag in a corner when there
 * is more than one, and the lime strip at the foot when it is on the
 * viewer's hunts. The owner moves it by holding it and takes it out by
 * dropping it on Remove; nothing on the pocket itself does either.
 *
 * The picture is told the width inside the ring and the pocket clips
 * the rest. A tap is the picture's own press: the card large.
 */
function BinderPocket({
  card,
  index,
  geometry,
  shelf,
  position,
  yours,
  placeholder,
  targeted,
  offer,
}: {
  card: BinderCard;
  /** This pocket's place on its page. */
  index: number;
  geometry: Geometry;
  shelf: ZoomCard[];
  position: number;
  yours: boolean;
  /** Its card is in the air: an empty dashed outline. */
  placeholder: boolean;
  /** The held card will land here: the accent ring. */
  targeted: boolean;
  offer: BinderOffer | null;
}) {
  const { pocketWidth: width } = geometry;

  return (
    <Pocket
      geometry={geometry}
      accessibilityLabel={pocketLabel(card.name, index, yours ? ", hold to move" : "")}
      placeholder={placeholder}
      targeted={targeted}
      corner={
        <>
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
                paddingVertical: 2,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  color: colors.accentContrast,
                  fontSize: 8,
                  fontWeight: "700",
                  letterSpacing: 1,
                }}
              >
                ON YOUR HUNT
              </Text>
            </View>
          ) : null}
        </>
      }
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
        have={offer ? offer.haveOf(card) : null}
        picks={offer?.picks}
        onPicks={offer?.onPicks}
      />
    </Pocket>
  );
}

/**
 * The drop that takes a card out: a dashed outline in the danger
 * colour under the page, drawn only while a card is in hand. Under
 * the finger it fills in, so the hand knows before it lets go. Its
 * layout is reported to the gesture, which reads it against the page
 * frame's own.
 */
function RemoveZone({
  over,
  onLayout,
}: {
  /** The held card is over it. */
  over: boolean;
  onLayout: (event: LayoutChangeEvent) => void;
}) {
  return (
    <View
      onLayout={onLayout}
      accessibilityLabel="Remove from binder"
      style={{
        alignSelf: "stretch",
        borderRadius: radius.card,
        borderWidth: over ? POCKET_RING : 1,
        borderStyle: over ? "solid" : "dashed",
        borderColor: colors.danger,
        backgroundColor: over ? colors.elevated : colors.canvas,
        paddingVertical: spacing(4),
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: spacing(2),
      }}
    >
      <Ionicons name="trash-outline" size={18} color={colors.danger} />
      <Text style={{ color: colors.danger, fontWeight: "700", fontSize: 14 }}>
        Remove
      </Text>
    </View>
  );
}

/**
 * The card in hand: drawn over the page from the picked-up pocket's
 * place, moved only by the finger, larger by LIFT_SCALE, with a shadow
 * and the accent ring. It never re-lays out, so it never jumps; on
 * release it glides onto its pocket and the page takes over.
 */
function HeldPocket({
  card,
  geometry,
  left,
  top,
  dragX,
  dragY,
  lift,
  presence,
}: {
  card: BinderCard;
  geometry: Geometry;
  left: number;
  top: number;
  dragX: SharedValue<number>;
  dragY: SharedValue<number>;
  lift: SharedValue<number>;
  /** 1 in hand; fades to 0 after a drop on Remove. */
  presence: SharedValue<number>;
}) {
  const { pocketWidth: width, pocketHeight: height } = geometry;
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: dragX.value },
      { translateY: dragY.value },
      { scale: 1 + LIFT_SCALE * lift.value },
    ],
    shadowOpacity: 0.5 * lift.value,
    opacity: presence.value,
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
          zIndex: 10,
          elevation: 10,
          shadowColor: colors.canvas,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 8 },
        },
        style,
      ]}
    >
      {/* The shadow is the outer view's; the clipping is this one's,
          so the clip never cuts the shadow off. */}
      <View
        style={{
          flex: 1,
          borderRadius: 5,
          borderWidth: POCKET_RING,
          borderColor: colors.accent,
          backgroundColor: colors.canvas,
          overflow: "hidden",
        }}
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
      </View>
    </Animated.View>
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
 * Your own binder's settings, in a sheet behind the pencil in the
 * header: the website's Binder settings sheet, the same fields in
 * the same order. Nothing in it needs a Save button, so it has none.
 */
function BinderSettingsSheet({
  visible,
  binder,
  error,
  onClose,
  onSave,
  onDelete,
}: {
  visible: boolean;
  binder: Binder;
  /** The last write that did not save, shown in the sheet too. */
  error: string | null;
  onClose: () => void;
  onSave: (patch: BinderSettingsPatch) => void;
  /** The delete confirm. */
  onDelete: () => void;
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
                Binder settings
              </Text>
              <Tap onPress={onClose} accessibilityLabel="Close">
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </Tap>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              <BinderSettings binder={binder} onSave={onSave} onDelete={onDelete} />
              <ErrorLine message={error} />
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/**
 * The settings themselves: the binder's name, Up for trade, the
 * cover, and Delete binder at the bottom. Every change saves at once
 * and paints at once; the name saves when the field is left or
 * Return is pressed. Every binder has all four: there is no binder
 * that cannot be renamed or deleted, and deleting the last one leaves
 * the profile with "+" alone.
 *
 * The one switch says Up for trade, and on means public and tradable.
 * The founder: "a toggle to enable it as a public / trade binder.
 * Anything that's public is up for trade."
 */
function BinderSettings({
  binder,
  onSave,
  onDelete,
}: {
  binder: Binder;
  onSave: (patch: BinderSettingsPatch) => void;
  /** The delete confirm. */
  onDelete: () => void;
}) {
  /* The name as typed; what is saved is the trimmed, non-empty one. */
  const [name, setName] = useState(binder.name);
  useEffect(() => {
    setName(binder.name);
  }, [binder.name]);
  const saveName = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setName(binder.name);
      return;
    }
    if (trimmed !== binder.name) onSave({ name: trimmed });
  };

  return (
    <View style={{ gap: spacing(3) }}>
      <View style={{ gap: spacing(2) }}>
        <Text style={{ color: colors.textPrimary, fontWeight: "700", fontSize: 13 }}>
          Name
        </Text>
        <Input
          value={name}
          onChangeText={(text) => setName(text.slice(0, BINDER_NAME_MAX))}
          onBlur={saveName}
          onSubmitEditing={saveName}
          returnKeyType="done"
          maxLength={BINDER_NAME_MAX}
          autoCapitalize="words"
          accessibilityLabel="Binder name"
        />
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(3) }}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={{ color: colors.textPrimary, fontWeight: "600", fontSize: 15 }}>
            Up for trade
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            {FOR_TRADE_LINE}
          </Text>
        </View>
        <Switch
          value={binder.forTrade}
          onValueChange={(next) => onSave({ forTrade: next })}
          trackColor={{ true: colors.accent, false: colors.borderStrong }}
          thumbColor={colors.textPrimary}
          accessibilityLabel="Up for trade"
        />
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
                    <BinderCover cover={cover.id} size="xs" plain />
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

      <Tap
        onPress={onDelete}
        accessibilityLabel="Delete binder"
        style={{ alignSelf: "flex-start", paddingVertical: spacing(1) }}
      >
        <Text style={{ color: colors.danger, fontWeight: "600", fontSize: 14 }}>
          Delete binder
        </Text>
      </Tap>
    </View>
  );
}

/**
 * The second step of a delete, in the website's words: the name, how
 * many cards go with it, Keep and Delete.
 */
function DeleteBinderConfirm({
  binder,
  onKeep,
  onDelete,
}: {
  /** Null while closed. */
  binder: Binder | null;
  onKeep: () => void;
  onDelete: () => void;
}) {
  if (!binder) return null;
  const line = `Delete ${binder.name}? Its ${binder.count} ${
    binder.count === 1 ? "card leaves" : "cards leave"
  } with it.`;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onKeep}>
      <SheetBackdrop />
      <Pressable
        onPress={onKeep}
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: spacing(4),
        }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            alignSelf: "stretch",
            borderRadius: radius.card,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            padding: spacing(4),
            gap: spacing(3),
          }}
        >
          <Text style={{ color: colors.textPrimary, fontWeight: "700", fontSize: 16 }}>
            Delete binder
          </Text>
          <Body>{line}</Body>
          <View style={{ flexDirection: "row", gap: spacing(2) }}>
            <View style={{ flex: 1 }}>
              <Button label="Keep" variant="secondary" onPress={onKeep} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Delete" onPress={onDelete} />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
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
