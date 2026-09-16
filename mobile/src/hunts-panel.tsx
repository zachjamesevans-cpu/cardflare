import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Modal, Platform, ScrollView, Share, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  createHunt,
  describeError,
  offerItemsOnPost,
  setFlareFound,
  setRequestFound,
  updateHunt,
  type Hunt,
  type HuntCard,
} from "./api";
import { API_BASE } from "./config";
import {
  cardsLabel,
  copiesLabel,
  needLabel,
  printingLabel,
  selectionLabel,
} from "./flare-copy";
import { RemoteImage } from "./remote-image";
import { Stepper } from "./stepper";
import { colors, radius, spacing } from "./theme";
import { useCopiesFound } from "./use-copies-found";
import {
  AsyncButton,
  Body,
  Button,
  Card,
  CardImage,
  ErrorLine,
  Input,
  Muted,
  Tap,
  Title,
  type ZoomCard,
} from "./ui";

/**
 * Somebody's hunts, on their profile. The app's half of
 * src/components/players/hunts-panel.tsx - same rows, same words, same
 * order, as everything on both platforms has to be.
 *
 * A HUNT IS PERSISTENT NOW. It used to be a label on some Flares, which
 * meant it existed only while those Flares did and could not be told
 * anything: no description, no privacy, no "I found two of the four".
 * It is a thing of its own on the server, with a list of requests
 * underneath, and this panel is the place it is read and kept.
 *
 * Collapsed, a hunt is one row: its name, a glimpse of its cards, and
 * what is left. Open, it is the list itself, as ROWS rather than a
 * carousel, because the numbers beside a card are the content here
 * and a rail hides them under a thumb.
 *
 * "Cards" and "copies" are two different numbers everywhere below. A
 * hunt of two cards can want five copies, and the copy never folds
 * one into the other.
 */

/** How many rows a profile shows before "See all". */
const ROWS_ON_PROFILE = 3;

export function HuntsPanel({
  hunts,
  limit,
  yours,
  onAdd,
  onTick,
  onChanged,
  onOpenHunt,
}: {
  hunts: Hunt[];
  limit?: number;
  yours?: boolean;
  /** Add cards to this hunt: the composer, with the hunt preselected. */
  onAdd?: (huntId: string) => void;
  /**
   * The old tick, from before a hunt counted copies. Kept in the
   * signature so an older caller still compiles; the rows write
   * copies through `setRequestFound` and never call it.
   */
  onTick?: (flareId: string, found: boolean) => Promise<void>;
  /** Something was written; the owner of the list should re-read it. */
  onChanged?: () => void;
  /** Open a hunt on its own screen. */
  onOpenHunt?: (huntId: string) => void;
}) {
  void onTick;
  /*
   * WHICH ROW IS OPEN, at most one. Five open hunts is five lists and
   * a scroll, which is the wall the rows exist to avoid. The first
   * opens itself so the panel is never a stack of closed lids.
   */
  /*
   * CLOSED UNTIL ASKED.
   *
   * The first folder used to open itself, on the argument that a panel
   * of closed lids shows nothing. The founder, opening somebody else's
   * profile: "it immediately unnests their top hunt holder. dont do
   * that."
   *
   * Right - a profile is a thing you glance at, and the top hunt
   * springing open makes one arbitrary folder the loudest thing on
   * somebody's page. Closed is also the only state that reads the same
   * whoever is looking.
   */
  const [open, setOpen] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const atLimit = typeof limit === "number" && hunts.length >= limit;
  const shown = showAll ? hunts : hunts.slice(0, ROWS_ON_PROFILE);

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give the hunt a name.");
      return;
    }
    setError(null);
    try {
      const result = await createHunt({ name: trimmed });
      setName("");
      setNaming(false);
      setOpen(result.huntId);
      onChanged?.();
    } catch (caught) {
      setError(`Could not start the hunt (${describeError(caught)}).`);
    }
  };

  return (
    <Card>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: spacing(2),
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}>
          <Ionicons name="locate-outline" size={16} color={colors.accent} />
          <Title>Hunts</Title>
        </View>
        {limit ? (
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            {hunts.length} of {limit}
          </Text>
        ) : null}
      </View>

      {hunts.length === 0 ? (
        <Body>
          {yours
            ? "A hunt is a list of cards you are collecting. Start one here, or name one when you post a Flare, and every card you add joins it with what is found and what is left."
            : "No hunts yet."}
        </Body>
      ) : (
        <View style={{ gap: spacing(2) }}>
          {shown.map((hunt) => (
            <HuntRow
              key={keyOf(hunt)}
              hunt={hunt}
              open={open === keyOf(hunt)}
              onToggle={() => setOpen(open === keyOf(hunt) ? null : keyOf(hunt))}
              yours={Boolean(yours)}
              onAdd={yours ? onAdd : undefined}
              onChanged={onChanged}
              onOpenHunt={onOpenHunt}
            />
          ))}
          {hunts.length > ROWS_ON_PROFILE ? (
            <Tap
              onPress={() => setShowAll((value) => !value)}
              accessibilityLabel={showAll ? "Show fewer hunts" : "See all hunts"}
              style={{ alignSelf: "center", paddingVertical: spacing(1) }}
            >
              <Text style={{ color: colors.accent, fontSize: 13, fontWeight: "600" }}>
                {showAll ? "Show fewer" : `See all ${hunts.length} hunts`}
              </Text>
            </Tap>
          ) : null}
        </View>
      )}

      {yours ? (
        naming ? (
          <View style={{ gap: spacing(2) }}>
            <Input
              value={name}
              onChangeText={setName}
              placeholder={'Name it, like "Green Zoro"'}
              maxLength={40}
              autoCapitalize="words"
              autoFocus
            />
            <View style={{ flexDirection: "row", gap: spacing(2) }}>
              <View style={{ flex: 1 }}>
                <AsyncButton
                  label="Start hunt"
                  pendingLabel="Starting…"
                  onPress={create}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label="Cancel"
                  variant="secondary"
                  onPress={() => {
                    setNaming(false);
                    setError(null);
                  }}
                />
              </View>
            </View>
            <ErrorLine message={error} />
          </View>
        ) : (
          <View style={{ gap: spacing(1) }}>
            <Button
              label="New hunt"
              variant="secondary"
              disabled={atLimit}
              onPress={() => setNaming(true)}
            />
            {atLimit ? (
              <Muted>{`You are at ${limit} hunts. Finish or remove one to start another.`}</Muted>
            ) : null}
          </View>
        )
      ) : null}
    </Card>
  );
}

/** An older server sends hunts without ids; the name still keys the row. */
function keyOf(hunt: Hunt | undefined): string | null {
  if (!hunt) return null;
  return hunt.id ?? hunt.name;
}

/**
 * One hunt, as a lid: name, three thumbnails, what is left. Tap to
 * open it in place.
 */
export function HuntRow({
  hunt,
  open,
  onToggle,
  yours,
  onAdd,
  onChanged,
  onOpenHunt,
}: {
  hunt: Hunt;
  open: boolean;
  onToggle: () => void;
  yours: boolean;
  onAdd?: (huntId: string) => void;
  onChanged?: () => void;
  onOpenHunt?: (huntId: string) => void;
}) {
  const cards = hunt.cards ?? [];
  const remaining = remainingCopies(hunt, cards);
  const preview = cards.filter((card) => card.imageUrl).slice(0, 3);

  return (
    <View
      style={{
        borderRadius: radius.control,
        borderWidth: 1,
        borderColor: open ? colors.accent : colors.border,
        backgroundColor: colors.elevated,
        overflow: "hidden",
      }}
    >
      <Tap
        onPress={onToggle}
        accessibilityLabel={`${hunt.name}, ${lookingLabel(hunt)}, ${open ? "open" : "closed"}`}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing(2.5),
          paddingHorizontal: spacing(3),
          paddingVertical: spacing(2.5),
        }}
      >
        {preview.length > 0 ? (
          <View
            style={{
              width: 28 + (preview.length - 1) * 12,
              height: 40,
              flexShrink: 0,
            }}
          >
            {preview.map((card, index) => (
              <View
                key={card.cardId}
                style={{
                  position: "absolute",
                  left: index * 12,
                  width: 28,
                  height: 40,
                  borderRadius: 4,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  overflow: "hidden",
                }}
              >
                <RemoteImage
                  uri={card.imageUrl}
                  style={{ width: "100%", height: "100%" }}
                />
              </View>
            ))}
          </View>
        ) : (
          <Ionicons name="layers-outline" size={22} color={colors.textMuted} />
        )}
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text
            numberOfLines={1}
            style={{ color: colors.textPrimary, fontWeight: "700", fontSize: 15 }}
          >
            {hunt.name}
          </Text>
          <Text
            style={{
              color: remaining > 0 ? colors.accent : colors.textMuted,
              fontSize: 12,
            }}
          >
            {remaining > 0
              ? `${copiesLabel(remaining)} left · ${cardsLabel(hunt.looking)}`
              : "All found"}
          </Text>
        </View>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={14}
          color={colors.textMuted}
        />
      </Tap>

      {open ? (
        <View style={{ paddingHorizontal: spacing(3), paddingBottom: spacing(3) }}>
          <HuntExpanded
            hunt={hunt}
            yours={yours}
            onAdd={onAdd}
            onChanged={onChanged}
            onOpenHunt={onOpenHunt}
          />
        </View>
      ) : null}
    </View>
  );
}

/**
 * "3 left", or "3 left · 5 copies" when somebody wants more than one of
 * something. The copies only show when they differ from the card count,
 * because "3 left · 3 copies" is the same fact twice.
 */
export function lookingLabel(hunt: Hunt): string {
  if (hunt.lookingCopies > hunt.looking) {
    return `${hunt.looking} left · ${hunt.lookingCopies} copies`;
  }
  return `${hunt.looking} left`;
}

/** Copies wanted for one card, from whichever field the server sent. */
const neededOf = (card: HuntCard): number =>
  Math.max(1, card.needed ?? card.quantity ?? 1);

/** Copies in hand for one card, before any local change. */
const foundOf = (card: HuntCard): number =>
  card.foundCopies ?? (card.found ? neededOf(card) : 0);

/** Copies still wanted across a hunt, from the cards when they came. */
function remainingCopies(hunt: Hunt, cards: HuntCard[]): number {
  if (typeof hunt.remainingCopies === "number") return hunt.remainingCopies;
  if (cards.length > 0) {
    return cards.reduce(
      (sum, card) => sum + Math.max(0, neededOf(card) - foundOf(card)),
      0,
    );
  }
  return hunt.lookingCopies;
}

/** A hunt's public address, the one Share hands out. */
export function huntUrl(huntId: string): string {
  return `${API_BASE}/hunts/${encodeURIComponent(huntId)}`;
}

/**
 * The open hunt: what it is, how far along it is, and the cards as
 * rows. Owners set copies; visitors pick what they have. Drawn inline
 * under a row on a profile and full-size on the Hunt screen, one
 * component, so the two never say different things.
 */
export function HuntExpanded({
  hunt,
  yours,
  onAdd,
  onChanged,
  onOpenHunt,
}: {
  hunt: Hunt;
  yours: boolean;
  onAdd?: (huntId: string) => void;
  onChanged?: () => void;
  /** Absent on the Hunt screen, which is already the whole thing. */
  onOpenHunt?: (huntId: string) => void;
}) {
  const cards = hunt.cards ?? [];

  /*
   * OPTIMISTIC COPIES. A change paints at once, keyed by request, and
   * the server's list replaces it on the reload `onChanged` triggers.
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

  const unfinished = cards.filter((card) => foundFor(card) < neededOf(card));
  const collected = cards.filter((card) => foundFor(card) >= neededOf(card));
  const [showCollected, setShowCollected] = useState(false);

  /* The shelf the zoom pages along: every card, open ones first. */
  const ordered = [...unfinished, ...collected];
  const shelf: ZoomCard[] = ordered.map((card) => ({
    imageUrl: card.imageUrl,
    name: card.cardName,
    cardNumber: card.cardNumber,
    caption: card.printingLabel ?? null,
    lookingFor: neededOf(card),
    stillNeeds: Math.max(0, neededOf(card) - foundFor(card)),
    youHave: null,
  }));

  /* VISITOR SELECTION: which cards they have, and how many of each. */
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [reviewing, setReviewing] = useState(false);
  const [offered, setOffered] = useState<string | null>(null);
  const pickedCards = unfinished.filter((card) => picked[card.cardId]);
  const pickedCopies = pickedCards.reduce(
    (sum, card) => sum + (picked[card.cardId] ?? 0),
    0,
  );

  const [editing, setEditing] = useState(false);

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
      {hunt.description ? (
        <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>
          {hunt.description}
        </Text>
      ) : null}

      {/* The chips and the icon actions, on one line that scrolls
          rather than wraps: a narrow phone with every owner action
          showing was three ragged rows. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing(2), alignItems: "center" }}
      >
        {hunt.visibility ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.borderStrong,
              paddingHorizontal: spacing(2.5),
              paddingVertical: 3,
            }}
          >
            <Ionicons
              name={
                hunt.visibility === "public" ? "earth-outline" : "lock-closed-outline"
              }
              size={12}
              color={colors.textSecondary}
            />
            <Text
              style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "600" }}
            >
              {hunt.visibility === "public" ? "Public" : "Private"}
            </Text>
          </View>
        ) : null}
        {hunt.id ? (
          <IconChip icon="share-outline" label="Share hunt" onPress={share} />
        ) : null}
        {yours && hunt.id ? (
          <IconChip
            icon={editing ? "close-outline" : "create-outline"}
            label={editing ? "Cancel" : "Edit"}
            onPress={() => setEditing((value) => !value)}
          />
        ) : null}
        {onOpenHunt && hunt.id ? (
          <IconChip
            icon="open-outline"
            label="Open"
            onPress={() => onOpenHunt(hunt.id ?? "")}
          />
        ) : null}
      </ScrollView>

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

      {cards.length === 0 ? (
        <Muted>
          {yours ? "Nothing on it yet. Add cards to start." : "Nothing on it yet."}
        </Muted>
      ) : null}

      <View style={{ gap: spacing(2) }}>
        {unfinished.map((card, index) => (
          <HuntCardRow
            key={card.cardId}
            card={card}
            found={foundFor(card)}
            shelf={shelf}
            position={index}
            owner={
              yours
                ? {
                    onSet: (value) => write(card, value),
                  }
                : undefined
            }
            visitor={
              !yours
                ? {
                    picked: picked[card.cardId] ?? 0,
                    onPick: (quantity) =>
                      setPicked((current) => {
                        const next = { ...current };
                        if (quantity <= 0) delete next[card.cardId];
                        else next[card.cardId] = quantity;
                        return next;
                      }),
                  }
                : undefined
            }
          />
        ))}
      </View>

      {collected.length > 0 ? (
        <View style={{ gap: spacing(2) }}>
          <Tap
            onPress={() => setShowCollected((value) => !value)}
            accessibilityLabel={`Collected, ${collected.length}, ${showCollected ? "open" : "closed"}`}
            style={{ flexDirection: "row", alignItems: "center", gap: spacing(1.5) }}
          >
            <Ionicons name="checkmark-circle" size={15} color={colors.accent} />
            <Text
              style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "600" }}
            >
              {`Collected (${collected.length})`}
            </Text>
            <Ionicons
              name={showCollected ? "chevron-up" : "chevron-down"}
              size={13}
              color={colors.textMuted}
            />
          </Tap>
          {showCollected
            ? collected.map((card, index) => (
                <HuntCardRow
                  key={card.cardId}
                  card={card}
                  found={foundFor(card)}
                  shelf={shelf}
                  position={unfinished.length + index}
                  owner={
                    yours && !card.tradedAway
                      ? { onReopen: () => write(card, neededOf(card) - 1) }
                      : undefined
                  }
                />
              ))
            : null}
        </View>
      ) : null}

      <ErrorLine message={copies.error} />
      {offered ? <Muted>{offered}</Muted> : null}

      {yours && onAdd && hunt.id ? (
        <Button
          label="Add cards"
          variant="secondary"
          onPress={() => onAdd(hunt.id ?? "")}
        />
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
          items={pickedCards.map((card) => ({
            card,
            quantity: picked[card.cardId] ?? 1,
          }))}
          onClose={() => setReviewing(false)}
          onSent={(note) => {
            setReviewing(false);
            setPicked({});
            setOffered(note);
            onChanged?.();
          }}
        />
      ) : null}
    </View>
  );
}

/** The line that offers to put the last change back, for a few seconds. */
export function UndoLine({ label, onUndo }: { label: string; onUndo: () => void }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing(2),
        borderRadius: radius.control,
        borderWidth: 1,
        borderColor: colors.accentMuted,
        backgroundColor: colors.surface,
        paddingHorizontal: spacing(3),
        paddingVertical: spacing(2),
      }}
    >
      <Text
        numberOfLines={1}
        style={{ color: colors.textSecondary, fontSize: 13, flex: 1 }}
      >
        {label}
      </Text>
      <Tap onPress={onUndo} hitSlop={6} accessibilityLabel="Undo the last change">
        <Text style={{ color: colors.accent, fontSize: 13, fontWeight: "700" }}>
          Undo
        </Text>
      </Tap>
    </View>
  );
}

/** A small round-cornered action with a glyph and a word. */
function IconChip({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Tap
      onPress={onPress}
      accessibilityLabel={label}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        paddingHorizontal: spacing(2.5),
        paddingVertical: 3,
      }}
    >
      <Ionicons name={icon} size={12} color={colors.textSecondary} />
      <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "600" }}>
        {label}
      </Text>
    </Tap>
  );
}

/** "5 of 10 copies collected", and a slim bar saying the same. */
export function HuntProgress({ found, needed }: { found: number; needed: number }) {
  const share = needed > 0 ? Math.min(1, found / needed) : 0;
  return (
    <View style={{ gap: spacing(1.5) }}>
      <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
        {`${found} of ${copiesLabel(needed)} collected`}
      </Text>
      <View
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: needed, now: found }}
        style={{
          height: 6,
          borderRadius: 3,
          backgroundColor: colors.elevated,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            width: `${Math.round(share * 100)}%`,
            height: "100%",
            backgroundColor: colors.accent,
          }}
        />
      </View>
    </View>
  );
}

/**
 * One card on a hunt: thumbnail, name, the printing asked for, and the
 * count. Owners get "+1 found" and a stepper; visitors get "I have
 * this" and, once selected, how many.
 */
export function HuntCardRow({
  card,
  found,
  shelf,
  position,
  owner,
  visitor,
}: {
  card: HuntCard;
  found: number;
  shelf: ZoomCard[];
  position: number;
  owner?: { onSet?: (value: number) => void; onReopen?: () => void };
  visitor?: { picked: number; onPick: (quantity: number) => void };
}) {
  const needed = neededOf(card);
  const remaining = Math.max(0, needed - found);
  const done = remaining === 0;
  const postable = Boolean(card.flareId && card.postId);
  const selected = (visitor?.picked ?? 0) > 0;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing(2.5),
        borderRadius: radius.control,
        borderWidth: 1,
        borderColor: selected ? colors.accent : colors.border,
        backgroundColor: colors.surface,
        padding: spacing(2),
        opacity: done && !owner?.onReopen ? 0.7 : 1,
      }}
    >
      <CardImage
        imageUrl={card.imageUrl}
        width={44}
        name={card.cardName}
        cardNumber={card.cardNumber}
        caption={card.printingLabel ?? null}
        state={card.found ? "found" : "open"}
        siblings={shelf}
        position={position}
      />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text
          numberOfLines={1}
          style={{ color: colors.textPrimary, fontWeight: "700", fontSize: 14 }}
        >
          {card.cardName}
        </Text>
        <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 12 }}>
          {printingLabel(card.printingLabel)}
        </Text>
        <Text
          style={{
            color: done ? colors.textMuted : colors.accent,
            fontSize: 12,
            fontWeight: "600",
          }}
        >
          {`${found} of ${needed} found${done ? "" : ` · ${needLabel(remaining)}`}`}
        </Text>
        {visitor && !postable && !done ? (
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>Not posted yet</Text>
        ) : null}
        {card.tradedAway ? (
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>Traded here</Text>
        ) : null}
      </View>

      {owner?.onSet && !done ? (
        <View style={{ alignItems: "flex-end", gap: spacing(1.5) }}>
          <Tap
            onPress={() => owner.onSet?.(found + 1)}
            accessibilityLabel={`One more ${card.cardName} found`}
            style={{
              borderRadius: 999,
              backgroundColor: colors.accent,
              paddingHorizontal: spacing(2.5),
              paddingVertical: 4,
            }}
          >
            <Text
              style={{ color: colors.accentContrast, fontSize: 12, fontWeight: "700" }}
            >
              +1 found
            </Text>
          </Tap>
          <Stepper
            value={found}
            min={0}
            max={needed}
            onChange={(value) => owner.onSet?.(value)}
            label={`copies of ${card.cardName} found`}
          />
        </View>
      ) : null}

      {owner?.onReopen ? (
        <Tap
          onPress={owner.onReopen}
          accessibilityLabel={`Reopen ${card.cardName}`}
          style={{
            borderRadius: 999,
            borderWidth: 1,
            borderColor: colors.border,
            paddingHorizontal: spacing(2.5),
            paddingVertical: 4,
          }}
        >
          <Text
            style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "700" }}
          >
            Reopen
          </Text>
        </Tap>
      ) : null}

      {visitor && postable && !done ? (
        <View style={{ alignItems: "flex-end", gap: spacing(1.5) }}>
          <Tap
            onPress={() => visitor.onPick(selected ? 0 : 1)}
            accessibilityLabel={
              selected ? `Unselect ${card.cardName}` : `I have ${card.cardName}`
            }
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: selected ? colors.accent : colors.borderStrong,
              backgroundColor: selected ? colors.accent : "transparent",
              paddingHorizontal: spacing(2.5),
              paddingVertical: 4,
            }}
          >
            <Ionicons
              name={selected ? "checkmark" : "hand-right-outline"}
              size={12}
              color={selected ? colors.accentContrast : colors.textSecondary}
            />
            <Text
              style={{
                color: selected ? colors.accentContrast : colors.textSecondary,
                fontSize: 12,
                fontWeight: "700",
              }}
            >
              I have this
            </Text>
          </Tap>
          {selected ? (
            <Stepper
              value={visitor.picked}
              min={1}
              max={remaining}
              onChange={visitor.onPick}
              label={`copies of ${card.cardName} you have`}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** The bar under a visitor's selection: what is picked, and the door on. */
export function HuntOfferFooter({
  cards,
  copies,
  onContinue,
}: {
  cards: number;
  copies: number;
  onContinue: () => void;
}) {
  return (
    <View
      style={{
        gap: spacing(2),
        borderRadius: radius.control,
        borderWidth: 1,
        borderColor: colors.accentMuted,
        backgroundColor: colors.surface,
        padding: spacing(3),
      }}
    >
      <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: "600" }}>
        {selectionLabel(cards, copies)}
      </Text>
      <Button label="Continue to offer" onPress={onContinue} />
    </View>
  );
}

/**
 * The review before an offer goes: the list, a note, one button.
 *
 * A hunt's cards can have been posted in different Flares, and an
 * offer is made on a post. So the selection is grouped by the post
 * each card went up in and sent once per post; the note rides with
 * every group, because the person reading it is the same either way.
 */
function HuntOfferReview({
  visible,
  hunt,
  items,
  onClose,
  onSent,
}: {
  visible: boolean;
  hunt: Hunt;
  items: { card: HuntCard; quantity: number }[];
  onClose: () => void;
  onSent: (note: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setError(null);
    const byPost = new Map<string, { flareId: string; quantity: number }[]>();
    for (const { card, quantity } of items) {
      if (!card.postId || !card.flareId) continue;
      const list = byPost.get(card.postId) ?? [];
      list.push({ flareId: card.flareId, quantity });
      byPost.set(card.postId, list);
    }
    if (byPost.size === 0) {
      setError("None of these cards is posted yet.");
      return;
    }
    let offered = 0;
    const refused: string[] = [];
    try {
      for (const [postId, list] of byPost) {
        const result = await offerItemsOnPost(postId, list, message.trim());
        offered += result.offered ?? list.length;
        for (const flareId of result.refused ?? []) {
          const card = items.find((item) => item.card.flareId === flareId)?.card;
          refused.push(card?.cardName ?? "one card");
        }
      }
    } catch (caught) {
      setError(`That did not send (${describeError(caught)}). Try again.`);
      return;
    }
    setMessage("");
    onSent(
      refused.length > 0
        ? `Offered ${cardsLabel(offered)}. Not taken: ${refused.join(", ")}.`
        : `Offered ${cardsLabel(offered)} on ${hunt.name}.`,
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.75)",
          justifyContent: "flex-end",
        }}
      >
        <View
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.panel,
            borderTopRightRadius: radius.panel,
            borderWidth: 1,
            borderColor: colors.border,
            padding: spacing(4),
            paddingBottom: spacing(4) + insets.bottom,
            gap: spacing(3),
            maxHeight: "85%",
          }}
        >
          <Title>Your offer</Title>
          <ScrollView
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ gap: spacing(2) }}
          >
            {items.map(({ card, quantity }) => (
              <View
                key={card.cardId}
                style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}
              >
                <Text
                  numberOfLines={1}
                  style={{ color: colors.textPrimary, fontSize: 14, flex: 1 }}
                >
                  {card.cardName}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                  {copiesLabel(quantity)}
                </Text>
              </View>
            ))}
          </ScrollView>
          <Input
            value={message}
            onChangeText={setMessage}
            placeholder="A note, like where you will be (optional)"
            maxLength={280}
            multiline
            style={{ minHeight: 64, textAlignVertical: "top" }}
          />
          <View style={{ flexDirection: "row", gap: spacing(2) }}>
            <View style={{ flex: 1 }}>
              <AsyncButton label="Send offer" pendingLabel="Sending…" onPress={send} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Back" variant="secondary" onPress={onClose} />
            </View>
          </View>
          <ErrorLine message={error} />
        </View>
      </View>
    </Modal>
  );
}

/** Name, description, who can see it. Saved as one patch. */
function HuntEditForm({ hunt, onSaved }: { hunt: Hunt; onSaved: () => void }) {
  const [name, setName] = useState(hunt.name);
  const [description, setDescription] = useState(hunt.description ?? "");
  const [visibility, setVisibility] = useState<"public" | "private">(
    hunt.visibility ?? "public",
  );
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!hunt.id) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("A hunt needs a name.");
      return;
    }
    setError(null);
    try {
      await updateHunt(hunt.id, {
        name: trimmed,
        description: description.trim() || null,
        visibility,
      });
      onSaved();
    } catch (caught) {
      setError(`Could not save (${describeError(caught)}).`);
    }
  };

  return (
    <View
      style={{
        gap: spacing(2),
        borderRadius: radius.control,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        padding: spacing(3),
      }}
    >
      <Input value={name} onChangeText={setName} placeholder="Name" maxLength={40} />
      <Input
        value={description}
        onChangeText={setDescription}
        placeholder="What this hunt is for (optional)"
        maxLength={280}
        multiline
        style={{ minHeight: 64, textAlignVertical: "top" }}
      />
      <View style={{ flexDirection: "row", gap: spacing(2) }}>
        {(["public", "private"] as const).map((option) => {
          const on = visibility === option;
          return (
            <Tap
              key={option}
              onPress={() => setVisibility(option)}
              accessibilityLabel={option === "public" ? "Public" : "Private"}
              style={{
                flex: 1,
                alignItems: "center",
                paddingVertical: spacing(2),
                borderRadius: radius.control,
                borderWidth: on ? 2 : 1,
                borderColor: on ? colors.accent : colors.border,
                backgroundColor: colors.elevated,
              }}
            >
              <Text
                style={{
                  color: on ? colors.textPrimary : colors.textMuted,
                  fontSize: 13,
                  fontWeight: on ? "700" : "500",
                }}
              >
                {option === "public" ? "Public" : "Private"}
              </Text>
            </Tap>
          );
        })}
      </View>
      <AsyncButton label="Save" pendingLabel="Saving…" onPress={save} />
      <ErrorLine message={error} />
    </View>
  );
}
