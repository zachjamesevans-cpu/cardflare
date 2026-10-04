import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMemo, useRef, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { StackParams } from "../App";
import { SheetBackdrop } from "./action-menu";
import {
  offerOnHunt,
  setFlareFound,
  setRequestFound,
  type Hunt,
  type HuntCard,
  type OfferItem,
  type OfferOutcome,
} from "./api";
import { POCKETS_PER_PAGE } from "./binder-covers";
import { printingLabel } from "./flare-copy";
import { huntRowLine } from "./hunt-copy";
import {
  HuntEditForm,
  HuntOfferFooter,
  HuntOfferReview,
  HuntProgress,
  UndoLine,
  foundOf,
  huntOfferSentLine,
  huntUrl,
  neededOf,
} from "./hunts-panel";
import { wantsLine } from "./offer-copy";
import {
  AddPocket,
  EmptyPocket,
  PageDots,
  PageFrame,
  POCKET_RING,
  Pocket,
  geometryFor,
  pocketLabel,
  type Geometry,
} from "./pockets";
import { RemoteImage } from "./remote-image";
import { Stepper } from "./stepper";
import { colors, radius, spacing } from "./theme";
import { useCopiesFound } from "./use-copies-found";
import {
  Button,
  CardImage,
  ErrorLine,
  Muted,
  Tap,
  Title,
  type ZoomCard,
  type ZoomHave,
  type ZoomPicks,
} from "./ui";

/**
 * One hunt, open: the app's half of
 * src/components/players/hunt-binder.tsx, drawn exactly like the open
 * binder (screens/binder.tsx) minus hold to move, because a hunt has
 * no order of its own.
 *
 * The founder: "Do you think the Hunts feature should just be binders
 * instead of lists? So it's all kinda the same language." So: the
 * crosshair and the name on top, the progress bar, then pages of nine
 * pockets, three by three, turned with a swipe, dots under them. A
 * pocket is a card the hunt wants, its art filling the pocket. When
 * every copy is found it dims and wears a small check; when more than
 * one copy is wanted and not all are found it wears a chip, found over
 * needed. One copy wanted and still open: nothing on it.
 *
 * Who owns it decides what a tap does. The OWNER taps a pocket and
 * gets "Update progress" for that one card, the stepper and the Undo
 * the rows used to carry, writing through the hunt's own progress
 * call; their empty pockets are "+" pockets into the composer with
 * the hunt chosen. A VISITOR taps a pocket and gets the card large in
 * the viewer with the Feed's pick controls, "I have this card" and
 * "Added to your offer", swiping along the hunt; the picks live here,
 * by request, and go through the hunt's one offer call from the
 * footer's review or the viewer's. A found card cannot be picked.
 * Their empty pockets stay empty.
 */
export function HuntBinder({
  hunt,
  yours,
  ownerName,
  onAdd,
  onChanged,
  onOwner,
}: {
  /** The Hunt screen passes its HuntView, which already names the owner. */
  hunt: Hunt & { ownerName?: string };
  yours: boolean;
  ownerName?: string;
  /** Add cards to this hunt: the composer, with the hunt preselected. */
  onAdd?: (huntId: string) => void;
  /** Something was written; the owner of the hunt should re-read it. */
  onChanged?: () => void;
  /** The owner's name, on a visitor's header, opens their profile. */
  onOwner?: () => void;
}) {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const cards = hunt.cards ?? [];
  const owner = ownerName ?? hunt.ownerName ?? "them";

  /*
   * OPTIMISTIC COPIES. A change paints at once, keyed by request, and
   * the server's hunt replaces it on the reload `onChanged` triggers.
   * See use-copies-found.ts, which the Feed's progress sheet shares.
   */
  const copies = useCopiesFound({ reset: hunt, onChanged });
  const foundFor = (card: HuntCard): number =>
    copies.foundFor(card.requestId ?? card.cardId, foundOf(card));

  const write = (card: HuntCard, value: number) =>
    copies.write(
      {
        key: card.requestId ?? card.cardId,
        label: card.cardName,
        needed: neededOf(card),
        current: foundOf(card),
        /* By request when the server named one; by Flare on an older
           server that only knows the posted card. */
        save: (next) =>
          card.requestId
            ? setRequestFound(card.requestId, next)
            : card.flareId
              ? setFlareFound(card.flareId, next)
              : Promise.reject(new Error("not-saved")),
      },
      value,
    );

  const needed = cards.reduce((sum, card) => sum + neededOf(card), 0);
  const found = cards.reduce(
    (sum, card) => sum + Math.min(neededOf(card), foundFor(card)),
    0,
  );
  const totalNeeded =
    cards.length > 0 ? needed : (hunt.neededCopies ?? hunt.lookingCopies);
  const totalFound = cards.length > 0 ? found : (hunt.foundCopies ?? 0);

  /*
   * VISITOR PICKS: which cards they have, and how many of each, keyed
   * by REQUEST, held here so a swipe in the viewer or a closed viewer
   * keeps them. Every open card on a hunt can be answered, posted or
   * not: the server offers on a post where a Flare is live and sends
   * the rest to the owner as one message. A card with no request id
   * (an older server) is drawn but cannot be picked; a found card
   * cannot be picked.
   */
  const [picked, setPicked] = useState<ZoomPicks>({});
  const [reviewing, setReviewing] = useState(false);
  const [sent, setSent] = useState<{ text: string; threadId: string | null } | null>(
    null,
  );
  const setPick = (requestId: string, quantity: number) =>
    setPicked((current) => {
      const next = { ...current };
      if (quantity <= 0) delete next[requestId];
      else next[requestId] = quantity;
      return next;
    });
  const pickedCards = cards.filter((card) => card.requestId && picked[card.requestId]);
  const pickedCopies = pickedCards.reduce(
    (sum, card) => sum + (card.requestId ? (picked[card.requestId] ?? 0) : 0),
    0,
  );

  /*
   * The viewer's own review sends through the same door, by request:
   * the viewer keys a pick by what it calls a flareId, which here is
   * the request id. What comes back is said under the pages, as the
   * footer's review says it, and the hunt is re-read.
   */
  const sendFromViewer = async (
    items: OfferItem[],
    note: string,
  ): Promise<OfferOutcome> => {
    if (!hunt.id) throw new Error("not-saved");
    const outcome = await offerOnHunt(
      hunt.id,
      items.map((item) => ({ requestId: item.flareId, quantity: item.quantity })),
      note,
    );
    if (!outcome.ok) throw new Error(outcome.message);
    setSent(huntOfferSentLine(outcome, owner));
    setPicked({});
    onChanged?.();
    return {
      offered: outcome.offered + outcome.messaged,
      /* The server refuses by name; the viewer reads a name back off
         the id, so hand it the id where one is known. */
      refused: outcome.refused.map(
        (name) => cards.find((card) => card.cardName === name)?.requestId ?? name,
      ),
    };
  };

  const haveFor = (card: HuntCard): ZoomHave => ({
    postId: hunt.id ?? "",
    posterName: owner,
    flareId: card.requestId ?? card.cardId,
    name: card.cardName,
    state: "open",
    youOffered: false,
    remaining: Math.max(1, neededOf(card) - foundFor(card)),
    onOffer: sendFromViewer,
  });

  /* The whole hunt is one shelf in the viewer, so a swipe walks every
     card, not just this page's nine. Only a visitor opens it, and only
     an open card with a request behind it carries "I have this card". */
  const shelf: ZoomCard[] = cards.map((card) => {
    const done = foundFor(card) >= neededOf(card);
    return {
      imageUrl: card.imageUrl,
      name: card.cardName,
      cardNumber: card.cardNumber,
      caption: card.printingLabel ?? null,
      lookingFor: neededOf(card),
      stillNeeds: Math.max(0, neededOf(card) - foundFor(card)),
      youHave: null,
      have: yours || done || !card.requestId || !hunt.id ? null : haveFor(card),
    };
  });

  /* The owner's open pocket: the card the progress sheet is for. */
  const [open, setOpen] = useState<HuntCard | null>(null);
  const [editing, setEditing] = useState(false);

  /* The page frame's width, as laid out; nothing is drawn before it is known. */
  const [pageWidth, setPageWidth] = useState(0);
  const [page, setPage] = useState(0);
  const pager = useRef<ScrollView>(null);
  const geometry = useMemo(() => geometryFor(pageWidth), [pageWidth]);
  const per = POCKETS_PER_PAGE;
  /*
   * The owner always has somewhere to put the next card: when the
   * last page is full (or there are no cards at all) one more page of
   * "+" pockets follows. A visitor sees only the pages with cards on
   * them, and never an empty page past the first.
   */
  const pageCount = yours
    ? Math.ceil((cards.length + 1) / per)
    : Math.max(1, Math.ceil(cards.length / per));
  const at = Math.min(page, pageCount - 1);

  const onPagerEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (pageWidth <= 0) return;
    const index = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
    setPage(Math.max(0, Math.min(pageCount - 1, index)));
  };

  /* Whole points: a fractional width would put a fraction of a point
     into every pocket, and the pager snaps by this number. */
  const onFrameLayout = (event: LayoutChangeEvent) => {
    const width = Math.floor(event.nativeEvent.layout.width);
    if (width !== pageWidth) setPageWidth(width);
  };

  const share = () => {
    if (!hunt.id) return;
    const url = huntUrl(hunt.id);
    void Share.share(
      Platform.OS === "ios"
        ? { url, title: `${hunt.name} on cardflare` }
        : { message: url, title: `${hunt.name} on cardflare` },
    ).catch(() => {
      /* Dismissed. Nothing more to offer. */
    });
  };

  return (
    <View style={{ gap: spacing(3) }}>
      {/* The header: the crosshair, the name, the description or the
          row's line under it, and the owner's pencil and Share to the
          right. A visitor sees the owner's name, a link to their
          profile, and Share. */}
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing(2) }}>
        <Ionicons
          name="locate-outline"
          size={18}
          color={colors.accent}
          style={{ marginTop: 2 }}
        />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Title>{hunt.name}</Title>
          {hunt.description ? (
            <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}>
              {hunt.description}
            </Text>
          ) : (
            <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}>
              {huntRowLine(hunt.looking + hunt.found, hunt.looking)}
            </Text>
          )}
          {!yours ? (
            <Tap
              onPress={onOwner}
              accessibilityLabel={`${owner}'s profile`}
              hitSlop={6}
            >
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                <Text style={{ color: colors.textSecondary, fontWeight: "600" }}>
                  {owner}
                </Text>
                {"'s hunt"}
              </Text>
            </Tap>
          ) : null}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(3) }}>
          {yours && hunt.id ? (
            <Tap
              onPress={() => setEditing((value) => !value)}
              hitSlop={8}
              accessibilityLabel={editing ? "Cancel" : "Edit hunt"}
            >
              <Ionicons
                name={editing ? "close-outline" : "pencil-outline"}
                size={22}
                color={colors.textPrimary}
              />
            </Tap>
          ) : null}
          {hunt.id ? (
            <Tap onPress={share} hitSlop={8} accessibilityLabel="Share hunt">
              <Ionicons name="share-outline" size={22} color={colors.textPrimary} />
            </Tap>
          ) : null}
        </View>
      </View>

      {yours && editing && hunt.id ? (
        <HuntEditForm
          hunt={hunt}
          onSaved={() => {
            setEditing(false);
            onChanged?.();
          }}
        />
      ) : null}

      <HuntProgress found={totalFound} needed={totalNeeded} />

      {copies.undoLabel ? (
        <UndoLine label={copies.undoLabel} onUndo={copies.undoLast} />
      ) : null}

      {/* The page frame: as wide as the screen's content, measured,
          and the pages inside it exactly that wide. */}
      <View onLayout={onFrameLayout} style={{ alignSelf: "stretch" }}>
        {pageWidth > 0 ? (
          <ScrollView
            ref={pager}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onPagerEnd}
            style={{ width: pageWidth }}
          >
            {Array.from({ length: pageCount }, (_, index) => (
              <PageFrame key={index} geometry={geometry}>
                {Array.from({ length: per }, (_, slot) => {
                  const card = cards[index * per + slot];
                  if (!card) {
                    return yours ? (
                      <AddPocket
                        key={`empty-${slot}`}
                        width={geometry.pocketWidth}
                        height={geometry.pocketHeight}
                        onPress={() => {
                          if (hunt.id) onAdd?.(hunt.id);
                        }}
                      />
                    ) : (
                      <EmptyPocket
                        key={`empty-${slot}`}
                        width={geometry.pocketWidth}
                        height={geometry.pocketHeight}
                      />
                    );
                  }
                  return (
                    <HuntPocket
                      key={card.requestId ?? card.cardId}
                      card={card}
                      index={slot}
                      geometry={geometry}
                      found={foundFor(card)}
                      shelf={shelf}
                      position={index * per + slot}
                      owner={yours ? () => setOpen(card) : undefined}
                      picks={picked}
                      onPicks={setPicked}
                    />
                  );
                })}
              </PageFrame>
            ))}
          </ScrollView>
        ) : null}
      </View>

      <PageDots at={at} of={pageCount} />

      {cards.length === 0 ? (
        <Muted>
          {yours ? "Nothing on it yet. Add cards to start." : "Nothing on it yet."}
        </Muted>
      ) : null}

      <ErrorLine message={copies.error} />
      {sent ? (
        <View style={{ gap: spacing(2) }}>
          <Muted>{sent.text}</Muted>
          {sent.threadId ? (
            <View style={{ alignSelf: "flex-start" }}>
              <Button
                label="Open in Messages"
                variant="secondary"
                onPress={() => {
                  if (sent.threadId) {
                    navigation.navigate("LocalThread", { threadId: sent.threadId });
                  }
                }}
              />
            </View>
          ) : null}
        </View>
      ) : null}

      {!yours && pickedCards.length > 0 ? (
        <HuntOfferFooter
          cards={pickedCards.length}
          copies={pickedCopies}
          onContinue={() => setReviewing(true)}
        />
      ) : null}

      {!yours ? (
        <HuntOfferReview
          visible={reviewing}
          hunt={hunt}
          ownerName={owner}
          items={pickedCards.map((card) => ({
            card,
            quantity: card.requestId ? (picked[card.requestId] ?? 1) : 1,
          }))}
          onChange={setPick}
          onClose={() => setReviewing(false)}
          onSent={(outcome) => {
            setReviewing(false);
            setPicked({});
            setSent(outcome);
            onChanged?.();
          }}
        />
      ) : null}

      {yours ? (
        <HuntPocketSheet
          card={open}
          found={open ? foundFor(open) : 0}
          undoLabel={copies.undoLabel}
          onUndo={copies.undoLast}
          error={copies.error}
          onSet={(value) => {
            if (open) write(open, value);
          }}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </View>
  );
}

/**
 * A card the hunt wants, in its pocket. Found: dimmed, with a small
 * accent check at the top right. More than one copy wanted and not
 * all found: a chip at the bottom right, found over needed. Otherwise
 * nothing on it. The owner's tap opens the progress sheet; a
 * visitor's opens the viewer, with the picks the hunt holds.
 */
function HuntPocket({
  card,
  index,
  geometry,
  found,
  shelf,
  position,
  owner,
  picks,
  onPicks,
}: {
  card: HuntCard;
  /** This pocket's place on its page. */
  index: number;
  geometry: Geometry;
  found: number;
  shelf: ZoomCard[];
  position: number;
  /** The owner's tap: the progress sheet. A visitor has none. */
  owner?: () => void;
  picks: ZoomPicks;
  onPicks: (picks: ZoomPicks) => void;
}) {
  const needed = neededOf(card);
  const done = found >= needed;
  const inner = geometry.pocketWidth - 2 * POCKET_RING;
  const innerHeight = Math.round((inner * 88) / 63);

  return (
    <Pocket
      geometry={geometry}
      accessibilityLabel={pocketLabel(card.cardName, index, done ? ", found" : "")}
      dimmed={done}
      corner={
        <>
          {done ? (
            <View
              pointerEvents="none"
              accessibilityLabel="All found"
              style={{
                position: "absolute",
                top: 4,
                right: 4,
                width: 18,
                height: 18,
                borderRadius: 9,
                backgroundColor: colors.accent,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="checkmark" size={12} color={colors.accentContrast} />
            </View>
          ) : null}
          {!done && needed > 1 ? (
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                bottom: 4,
                right: 4,
                borderRadius: 999,
                backgroundColor: "rgba(0,0,0,0.75)",
                paddingHorizontal: 5,
                paddingVertical: 1,
              }}
            >
              <Text
                style={{ color: colors.textPrimary, fontSize: 9, fontWeight: "700" }}
              >
                {`${found}/${needed}`}
              </Text>
            </View>
          ) : null}
        </>
      }
    >
      {owner ? (
        <Tap
          onPress={owner}
          accessibilityLabel={`Update progress on ${card.cardName}`}
          style={{ width: inner, height: innerHeight }}
        >
          <RemoteImage
            uri={card.imageUrl}
            contentFit="contain"
            style={{
              width: inner,
              height: innerHeight,
              borderRadius: radius.control / 2,
              backgroundColor: colors.canvas,
            }}
          />
        </Tap>
      ) : (
        <CardImage
          imageUrl={card.imageUrl}
          width={inner}
          name={card.cardName}
          cardNumber={card.cardNumber}
          caption={card.printingLabel ?? null}
          lookingFor={needed}
          stillNeeds={Math.max(0, needed - found)}
          siblings={shelf}
          position={position}
          have={shelf[position]?.have ?? null}
          picks={picks}
          onPicks={onPicks}
        />
      )}
    </Pocket>
  );
}

/**
 * "Update progress" for one card, the owner's tap on a pocket: the
 * art down the left (the round 16b shape, 88 x 123), the name, the
 * number and printing, how many are found, and the one Stepper,
 * writing through the hunt's own progress call with the Undo line
 * the rows used to carry. A card that came through a trade here
 * cannot be stepped back: a trade is a thing that happened between
 * two people.
 *
 * There is no "Remove from hunt" here because the server has no such
 * action; the founder: "If they're added to a hunt, they stay there."
 */
function HuntPocketSheet({
  card,
  found,
  undoLabel,
  onUndo,
  error,
  onSet,
  onClose,
}: {
  /** Null while closed. */
  card: HuntCard | null;
  found: number;
  undoLabel: string | null;
  onUndo: () => void;
  error: string | null;
  onSet: (value: number) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  if (!card) return null;
  const needed = neededOf(card);
  const remaining = Math.max(0, needed - found);
  const done = remaining === 0;

  return (
    /* Fade, not slide: see SheetBackdrop for the black wall this replaces. */
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <SheetBackdrop />
      <Pressable onPress={onClose} style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable
          onPress={() => undefined}
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.panel,
            borderTopRightRadius: radius.panel,
            borderWidth: 1,
            borderColor: colors.border,
            padding: spacing(4),
            paddingBottom: spacing(4) + insets.bottom,
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
            <Title>{done ? "All found" : "Update progress"}</Title>
            <Tap onPress={onClose} hitSlop={8} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Tap>
          </View>

          {/* The art down the left, one aligned column beside it: the
              round 16b row, so the sheet reads like the Feed's. */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "stretch",
              gap: spacing(3),
              borderRadius: radius.control,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.elevated,
              padding: spacing(3),
            }}
          >
            {/* 88 wide draws the 88 x 123 frame; a tap still opens the viewer. */}
            <CardImage
              imageUrl={card.imageUrl}
              width={88}
              name={card.cardName}
              cardNumber={card.cardNumber}
              caption={card.printingLabel ?? null}
              state={done ? "found" : "open"}
            />
            <View style={{ flex: 1, minWidth: 0, gap: spacing(1.5) }}>
              <Text
                numberOfLines={1}
                style={{ color: colors.textPrimary, fontWeight: "600", fontSize: 14 }}
              >
                {card.cardName}
              </Text>
              {/* One meta line: the number and printing, the count, the want line. */}
              <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 12 }}>
                {`${card.cardNumber} · ${printingLabel(card.printingLabel)}`}
              </Text>
              <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 12 }}>
                <Text style={{ color: colors.textSecondary }}>
                  {`${found} of ${needed} found`}
                </Text>
                {" · "}
                <Text
                  style={{
                    color: done ? colors.textMuted : colors.accent,
                    fontWeight: "600",
                  }}
                >
                  {wantsLine(needed, remaining)}
                </Text>
              </Text>
              {card.tradedAway ? (
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  Traded here
                </Text>
              ) : null}
              <View style={{ marginTop: "auto" }}>
                <Stepper
                  value={found}
                  min={0}
                  max={needed}
                  onChange={(value) => onSet(value)}
                  label={`copies of ${card.cardName} found`}
                  disabled={Boolean(card.tradedAway)}
                />
              </View>
            </View>
          </View>

          {undoLabel ? <UndoLine label={undoLabel} onUndo={onUndo} /> : null}
          <ErrorLine message={error} />
          <Button label="Done" variant="secondary" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
