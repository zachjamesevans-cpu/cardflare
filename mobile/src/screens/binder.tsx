import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Switch,
  Text,
  View,
  type GestureResponderHandlers,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import Animated, {
  Easing,
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
  addBinderCard,
  binderOfferError,
  deleteBinder,
  describeError,
  getBinder,
  offerOnBinder,
  openDirectThread,
  removeBinderCard,
  reorderBinder,
  saveBinder,
  serverMessage,
  type Binder,
  type BinderCard,
  type BinderSettingsPatch,
  type OfferItem,
  type OfferOutcome,
} from "../api";
import { BinderCover } from "../binder-cover";
import { BINDER_COVERS, BINDER_LAYOUT, POCKETS_PER_PAGE } from "../binder-covers";
import { BINDER_OFFER_COPY, binderOfferSentLine } from "../binder-offer-copy";
import { CardPicker } from "../card-picker";
import { binderShareUrl } from "../config";
import { inYourOfferLine } from "../offer-copy";
import { OfferReviewSheet } from "../offer-review-sheet";
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
 * SHARE, at the top: https://cardflare.gg/b/<id>, which opens the
 * binder on the website for anyone and in the app for anyone who has
 * it (App.tsx's linking routes `b/:binderId` here with nothing but the
 * id, and the server answers any binder by id, saying in `yours`
 * whether it is the viewer's). A private binder has no link to share:
 * the owner is told to turn on Up for trade.
 *
 * The owner adds cards through the card picker, opened from the "+"
 * in any empty pocket (the trailing page always has one), holds a
 * card to move it, and takes one out by dropping it on Remove, the
 * zone that appears under the page while a card is in hand. The
 * binder's settings (its name, Up for trade, the cover, and Delete
 * binder) are a sheet behind the pencil in the header. The founder
 * (2026-10-03) did not want the settings all the way at the bottom,
 * asked for "a small edit icon at the top", and called the Add cards
 * and Edit buttons "completely redundant". Every write
 * paints at once from what the server sends back and then asks for
 * the truth again behind it. A visitor gets the chips when any of the
 * cards are on their hunts, and one button, Message.
 *
 * THE GRID is measured, never guessed, and it is drawn from
 * src/pockets.tsx: the page frame, the pocket, the "+" pocket and
 * the dots are the same ones a hunt's page draws, so the two can
 * never disagree about what a pocket is. The frame reports its width
 * through onLayout and the pocket is a third of what is left inside
 * the frame's padding and the two gaps, floored, so three always fit
 * on a row; the arithmetic and the reason for it are with the pocket.
 *
 * HOLD TO MOVE is one card in the air and nothing else moving. A long
 * press lifts the held card as an overlay that follows the finger,
 * its pocket left as an empty dashed outline; the pocket under the
 * finger wears the accent ring. On release the order is committed in
 * one go and the grid re-lays out with a LayoutAnimation while the
 * overlay glides onto its pocket, then the real card takes over in
 * the same pixels. No wiggle, no neighbour sliding, no page turn
 * while a card is in hand: a card crosses pages by being dropped on
 * the last pocket of this one and carried over with the Next arrow.
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
/** The drop: one glide onto the pocket, the grid re-laying out under it on the same clock. */
const DROP = { duration: 200, easing: Easing.out(Easing.cubic) } as const;
/** How much the held card grows in hand. */
const LIFT_SCALE = 0.05;

/** Under the Up for trade switch, the create sheet's line word for word. */
const FOR_TRADE_LINE = "People nearby hunting one of these cards hear about it.";

type Filter = "all" | "hunts";

const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, value));

/** The list with the card at `from` now at `to`, the others shifted. */
function moved<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [card] = next.splice(from, 1);
  if (card === undefined) return list;
  next.splice(Math.min(to, next.length), 0, card);
  return next;
}

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
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(0);
  const [adding, setAdding] = useState(false);
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
     says the same. The owner's header also carries the pencil that
     opens the settings sheet, where the website's title row has it. */
  useEffect(() => {
    if (!binder) return;
    /*
     * Share, beside the pencil: the link that opens this binder on
     * the website or in the app. Read from the live setting, so the
     * switch flipped in the sheet a moment ago is the one obeyed. A
     * private binder has no public link, so the owner is told how to
     * give it one rather than handed a link that opens for nobody.
     */
    const share = () => {
      if (!binder.forTrade) {
        Alert.alert("Turn on Up for trade to share this binder.");
        return;
      }
      const url = binderShareUrl(binder.id);
      void Share.share({ message: url, url }).catch(() => {});
    };
    navigation.setOptions({
      title: binderTitle(binder),
      headerRight:
        binder.yours || binder.forTrade
          ? () => (
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: spacing(4) }}
              >
                <Tap onPress={share} hitSlop={8} accessibilityLabel="Share binder">
                  <Ionicons name="share-outline" size={22} color={colors.textPrimary} />
                </Tap>
                {binder.yours ? (
                  <Tap
                    onPress={() => setSettingsOpen(true)}
                    hitSlop={8}
                    accessibilityLabel="Binder settings"
                  >
                    <Ionicons
                      name="pencil-outline"
                      size={22}
                      color={colors.textPrimary}
                    />
                  </Tap>
                ) : null}
              </View>
            )
          : undefined,
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
    void write(() => saveBinder(patch, id));
  };

  /* The binder, gone with its cards. Back to wherever it was opened
     from: the list or the profile, both of which re-read on focus, so
     the circle and the row are gone by the time Back lands. */
  const remove = async () => {
    setWriteError(null);
    try {
      await deleteBinder(id);
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
  const allCards = binder?.cards ?? [];
  const cards =
    filter === "hunts" ? allCards.filter((card) => card.onYourHunt) : allCards;
  const per = POCKETS_PER_PAGE;
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

  const geometry = useMemo(() => geometryFor(pageWidth), [pageWidth]);

  const turnTo = (index: number) => {
    const next = clamp(index, 0, pageCount - 1);
    setPage(next);
    pager.current?.scrollTo({ x: next * pageWidth, animated: true });
  };

  const onPagerEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (pageWidth <= 0) return;
    const index = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
    setPage(clamp(index, 0, pageCount - 1));
  };

  const drag = useHoldToMove({
    enabled: yours,
    cards: allCards,
    geometry,
    onMove: (from, to) => {
      const next = moved(allCards, from, to);
      setBinder((current) => (current ? { ...current, cards: next } : current));
      void write(() =>
        reorderBinder(
          next.map((card) => card.entryId),
          id,
        ),
      );
    },
    onRemove: (index) => {
      const card = allCards[index];
      if (!card) return;
      setBinder((current) =>
        current
          ? {
              ...current,
              cards: current.cards.filter((entry) => entry.entryId !== card.entryId),
              count: Math.max(0, current.count - 1),
            }
          : current,
      );
      void write(() => removeBinderCard(card.entryId, id));
    },
  });

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
          <Muted>{`This binder could not be opened (${error}).`}</Muted>
        ) : (
          <Loading />
        )}
      </View>
    );
  }

  /* The whole binder is one shelf in the viewer, so a swipe in the
     large view walks every card, not just this page's nine. */
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
      id,
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

  const shelf: ZoomCard[] = cards.map((card) => ({
    imageUrl: card.imageUrl,
    name: card.name,
    cardNumber: card.number,
    caption: card.printingLabel,
    note: card.note,
    direction: "showcase",
    have: haveOf(card),
  }));
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
            the title. A visitor is never shown a private one. */}
        <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}>
          {binderLine(binder)}
        </Text>

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

        {/* The page frame: as wide as the screen's content, measured,
            and the pages inside it exactly that wide. The card in
            hand is drawn beside the pager, not in it, so the pager
            keeps clipping and paging like any other. */}
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
                  geometry={geometry}
                  cards={cards.slice(index * per, index * per + per)}
                  shelfStart={index * per}
                  shelf={shelf}
                  yours={yours}
                  drag={drag}
                  /* Only the page under the finger has a target pocket. */
                  target={drag.held && drag.held.page === index ? drag.target : null}
                  onAdd={() => setAdding(true)}
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

      {yours ? (
        <AddCardsSheet
          visible={adding}
          onClose={() => setAdding(false)}
          onPick={(cardId, printingId) => {
            setAdding(false);
            setFilter("all");
            turnTo(0);
            void write(() => addBinderCard(cardId, printingId, 1, id));
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
/* Hold to move                                                        */
/* ------------------------------------------------------------------ */

/** A card in hand: which, where it came from, where its overlay starts. */
interface Held {
  entryId: string;
  /** The card itself, kept so the overlay can fade out after a drop on Remove has taken it off the shelf. */
  card: BinderCard;
  /** Its place on the whole shelf, the page it is on, its pocket there. */
  index: number;
  page: number;
  local: number;
  /** Where the overlay is drawn from, in the page's coordinates. */
  x: number;
  y: number;
}

interface HoldToMove {
  held: Held | null;
  /** The pocket under the finger on the held card's page, or null off the grid. */
  target: number | null;
  /** The finger is over the Remove zone. */
  overRemove: boolean;
  dragX: SharedValue<number>;
  dragY: SharedValue<number>;
  lift: SharedValue<number>;
  /** The overlay's opacity: 1 in hand, fading to 0 on a drop on Remove. */
  presence: SharedValue<number>;
  /** The long press on a pocket: the card lifts. */
  pickUp: (entryId: string) => void;
  /** The pan on a pocket, built once per card. */
  handlersFor: (entryId: string) => GestureResponderHandlers | undefined;
  /** A finger lifted before it ever moved: the card goes back down. */
  onTouchEnd: () => void;
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
 * The gesture, all of it. Only the held card moves, as an overlay;
 * the grid underneath keeps its layout until the drop commits the
 * order. Every number the handlers need is read from a ref at the
 * moment of the question, so the touch that lifts the card can turn
 * into the drag without lifting the finger, and a re-render never
 * pulls the handlers out from under a gesture.
 */
function useHoldToMove({
  enabled,
  cards,
  geometry,
  onMove,
  onRemove,
}: {
  enabled: boolean;
  cards: BinderCard[];
  geometry: Geometry;
  /** Told once, on the drop: the card at `from` now sits at `to`. */
  onMove: (from: number, to: number) => void;
  /** Told once, on a drop on Remove: the card at `index` leaves the binder. */
  onRemove: (index: number) => void;
}): HoldToMove {
  const [held, setHeld] = useState<Held | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const [overRemove, setOverRemove] = useState(false);
  const heldRef = useRef(false);
  const grantedRef = useRef(false);
  const droppingRef = useRef(false);
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  const geometryRef = useRef(geometry);
  geometryRef.current = geometry;
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const onRemoveRef = useRef(onRemove);
  onRemoveRef.current = onRemove;

  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const lift = useSharedValue(0);
  const presence = useSharedValue(1);

  /* The card in hand, as the handlers see it. */
  const source = useRef<Held | null>(null);
  const targetRef = useRef<number | null>(null);
  const overRemoveRef = useRef(false);
  /* Where the finger holds the card, from the pocket's top-left. */
  const grab = useRef({ x: 0, y: 0 });
  /* The page frame and the Remove zone, both in the frame's parent's
     coordinates; the zone is null until it has been laid out. */
  const frameRef = useRef<Box>({ x: 0, y: 0, width: 0, height: 0 });
  const zoneRef = useRef<Box | null>(null);

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

  /**
   * The pocket under the finger: the column and row the finger is
   * in, a gap counting with the pocket to its left or above it, and
   * nothing when the finger is off the grid. Below the grid, the
   * Remove zone is asked whether the finger is over it.
   */
  const aim = (fingerX: number, fingerY: number) => {
    const g = geometryRef.current;
    const col = Math.floor((fingerX - PAGE_PAD) / g.slotW);
    const row = Math.floor((fingerY - PAGE_PAD) / g.slotH);
    const inside = col >= 0 && col < BINDER_LAYOUT && row >= 0 && row < BINDER_LAYOUT;
    const next = inside ? row * BINDER_LAYOUT + col : null;
    const over = !inside && overZone(fingerX, fingerY);
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

  /** The overlay has landed: the real pocket shows the card from here. */
  const land = () => {
    heldRef.current = false;
    grantedRef.current = false;
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

  /**
   * The drop. Over a pocket, the order is committed now and the grid
   * re-lays out with a layout animation, the overlay gliding onto the
   * pocket on the same clock; only when both have finished does the
   * overlay give way to the real card, in the same pixels. Off the
   * grid, or over its own pocket, the card glides home. Over Remove,
   * the card leaves the binder and the overlay fades out where it is.
   */
  const release = () => {
    const from = source.current;
    if (!from || !heldRef.current || droppingRef.current) return;
    droppingRef.current = true;
    const g = geometryRef.current;
    if (overRemoveRef.current) {
      overRemoveRef.current = false;
      targetRef.current = null;
      setTarget(null);
      setOverRemove(false);
      LayoutAnimation.configureNext(
        LayoutAnimation.create(
          DROP.duration,
          LayoutAnimation.Types.easeInEaseOut,
          LayoutAnimation.Properties.opacity,
        ),
      );
      onRemoveRef.current(from.index);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      lift.value = withTiming(0, DROP);
      presence.value = withTiming(0, DROP, (finished) => {
        if (finished) runOnJS(land)();
      });
      return;
    }
    const onPage = clamp(
      cardsRef.current.length - from.page * POCKETS_PER_PAGE,
      0,
      POCKETS_PER_PAGE,
    );
    /* A drop past the last card on the page lands after it. */
    const toLocal =
      targetRef.current === null ? from.local : Math.min(targetRef.current, onPage - 1);
    const toIndex = from.page * POCKETS_PER_PAGE + toLocal;
    const cell = cellOf(toLocal, g);
    if (toIndex !== from.index) {
      LayoutAnimation.configureNext(
        LayoutAnimation.create(
          DROP.duration,
          LayoutAnimation.Types.easeInEaseOut,
          LayoutAnimation.Properties.opacity,
        ),
      );
      onMoveRef.current(from.index, toIndex);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    targetRef.current = null;
    setTarget(null);
    lift.value = withTiming(0, DROP);
    dragY.value = withTiming(cell.y - from.y, DROP);
    dragX.value = withTiming(cell.x - from.x, DROP, (finished) => {
      if (finished) runOnJS(land)();
    });
  };

  const pickUp = (entryId: string) => {
    if (!enabled || heldRef.current) return;
    const index = cardsRef.current.findIndex((entry) => entry.entryId === entryId);
    const card = cardsRef.current[index];
    if (index < 0 || !card) return;
    const g = geometryRef.current;
    if (g.pocketWidth <= 0) return;
    const page = Math.floor(index / POCKETS_PER_PAGE);
    const local = index % POCKETS_PER_PAGE;
    const cell = cellOf(local, g);
    heldRef.current = true;
    grantedRef.current = false;
    droppingRef.current = false;
    targetRef.current = local;
    overRemoveRef.current = false;
    source.current = { entryId, card, index, page, local, x: cell.x, y: cell.y };
    grab.current = { x: g.pocketWidth / 2, y: g.pocketHeight / 2 };
    dragX.value = 0;
    dragY.value = 0;
    presence.value = 1;
    lift.value = withSpring(1, SPRING);
    setHeld(source.current);
    setTarget(local);
    setOverRemove(false);
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
                  source.current?.entryId === card.entryId &&
                  (Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2),
                onMoveShouldSetPanResponder: (_e, g) =>
                  heldRef.current &&
                  !grantedRef.current &&
                  source.current?.entryId === card.entryId &&
                  (Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2),
                onPanResponderGrant: (event) => {
                  grantedRef.current = true;
                  grab.current = {
                    x: event.nativeEvent.locationX,
                    y: event.nativeEvent.locationY,
                  };
                },
                onPanResponderMove: (_e, g) => {
                  const from = source.current;
                  if (!from || !heldRef.current || droppingRef.current) return;
                  /* Straight to shared values: no render, and the card
                     is under the finger on the very next frame. */
                  dragX.value = g.dx;
                  dragY.value = g.dy;
                  aim(from.x + grab.current.x + g.dx, from.y + grab.current.y + g.dy);
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
    target,
    overRemove,
    dragX,
    dragY,
    lift,
    presence,
    pickUp,
    handlersFor: (entryId) => responders.get(entryId)?.panHandlers,
    onTouchEnd: () => {
      /* Lifted but never dragged: the pan was never granted, so its
         release never fires. The touch itself says the finger is gone. */
      if (heldRef.current && !grantedRef.current) release();
    },
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
 * One page: a grid of nine pockets, three across. An empty pocket is
 * a "+" for the owner and plain black for anyone else. The frame and
 * the pockets are the shared ones in pockets.tsx; what is in each
 * pocket, and the hold to move, is this screen's.
 */
function BinderPage({
  geometry,
  cards,
  shelfStart,
  shelf,
  yours,
  drag,
  target,
  onAdd,
  offer,
}: {
  geometry: Geometry;
  cards: BinderCard[];
  /** Where this page's first card sits on the whole shelf. */
  shelfStart: number;
  shelf: ZoomCard[];
  yours: boolean;
  drag: HoldToMove;
  /** The pocket on this page under the held card, or null. */
  target: number | null;
  onAdd: () => void;
  /** The offer being built, on somebody's trade binder; null otherwise. */
  offer: BinderOffer | null;
}) {
  const { pocketWidth, pocketHeight } = geometry;

  return (
    <PageFrame geometry={geometry}>
      {Array.from({ length: POCKETS_PER_PAGE }, (_, index) => {
        const card = cards[index];
        if (!card) {
          return yours ? (
            <AddPocket
              key={`empty-${index}`}
              width={pocketWidth}
              height={pocketHeight}
              targeted={target === index}
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
          <BinderPocket
            key={card.entryId}
            card={card}
            index={index}
            geometry={geometry}
            shelf={shelf}
            position={shelfStart + index}
            yours={yours}
            placeholder={drag.held?.entryId === card.entryId}
            targeted={target === index}
            handlers={drag.handlersFor(card.entryId)}
            onPickUp={() => drag.pickUp(card.entryId)}
            onTouchEnd={drag.onTouchEnd}
            offer={offer}
          />
        );
      })}
    </PageFrame>
  );
}

/**
 * A card in its pocket: the shared Pocket (the black ring, the
 * sleeve's lip, the clipping, the dashed outline while its card is in
 * the air, the accent ring under a held card) with the picture in it,
 * the copies in a corner when there is more than one, and the lime
 * strip at the foot when it is on the viewer's hunts. The owner takes
 * it out by holding it and dropping it on Remove; nothing on the
 * pocket itself removes anything.
 *
 * The picture is told the width inside the ring and the pocket clips
 * the rest. The pan handlers live on the pocket's own view, so it is
 * the same view in every state and a gesture never loses its
 * responder.
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
  handlers,
  onPickUp,
  onTouchEnd,
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
  /** The held card is over it: the accent ring. */
  targeted: boolean;
  handlers: GestureResponderHandlers | undefined;
  onPickUp: () => void;
  onTouchEnd: () => void;
  offer: BinderOffer | null;
}) {
  const { pocketWidth: width } = geometry;

  return (
    <Pocket
      geometry={geometry}
      accessibilityLabel={pocketLabel(card.name, index, yours ? ", hold to move" : "")}
      placeholder={placeholder}
      targeted={targeted}
      handlers={handlers}
      onTouchEnd={yours ? onTouchEnd : undefined}
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
        onLongPress={yours ? onPickUp : undefined}
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
 * place, moved only by the finger, a touch larger, with a shadow and
 * the accent ring. It never re-lays out, so it never jumps; on release
 * it glides onto its pocket and the page takes over.
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
