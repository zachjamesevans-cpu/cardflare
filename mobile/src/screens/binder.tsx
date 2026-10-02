import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
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
 * The owner adds cards through the card picker, takes one out or
 * names the front card with Edit on, and sets the binder up in the
 * strip at the foot: public or not, the layout, the cover. Every
 * write paints at once from what the server sends back and then asks
 * for the truth again behind it. A visitor gets the chips when any of
 * the cards are on their hunts, and one button, Message.
 */

/** The ring round each pocket, the gap between them, the page's padding. */
const POCKET_RING = 2;
const POCKET_GAP = spacing(2);
const PAGE_PAD = spacing(3);

type Filter = "all" | "hunts";

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

  const yours = binder.yours;
  const cards =
    filter === "hunts" ? binder.cards.filter((card) => card.onYourHunt) : binder.cards;
  const layout = binder.layout;
  const per = pocketsPerPage(layout);
  const pageCount = Math.max(1, Math.ceil(cards.length / per));
  const at = Math.min(page, pageCount - 1);

  const pageWidth = window.width - 2 * gutter;
  const pocketWidth = (pageWidth - 2 * PAGE_PAD - (layout - 1) * POCKET_GAP) / layout;

  const turnTo = (index: number) => {
    const next = Math.max(0, Math.min(pageCount - 1, index));
    setPage(next);
    pager.current?.scrollTo({ x: next * pageWidth, animated: true });
  };

  const onPagerEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
    setPage(Math.max(0, Math.min(pageCount - 1, index)));
  };

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

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.canvas }}
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

        {/* The pages, one screen wide each, turned with a swipe. */}
        <ScrollView
          ref={pager}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onPagerEnd}
          style={{ width: pageWidth }}
        >
          {Array.from({ length: pageCount }, (_, index) => (
            <BinderPage
              key={index}
              width={pageWidth}
              layout={layout}
              pocketWidth={pocketWidth}
              cards={cards.slice(index * per, index * per + per)}
              shelfStart={index * per}
              shelf={shelf}
              editing={yours && editing}
              frontEntryId={binder.frontEntryId}
              onRemove={(entryId) => {
                setBinder((current) =>
                  current
                    ? {
                        ...current,
                        cards: current.cards.filter((card) => card.entryId !== entryId),
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

/** One page: a grid of pockets, the empty ones drawn as empty pockets. */
function BinderPage({
  width,
  layout,
  pocketWidth,
  cards,
  shelfStart,
  shelf,
  editing,
  frontEntryId,
  onRemove,
  onFront,
}: {
  width: number;
  layout: BinderLayout;
  pocketWidth: number;
  cards: BinderCard[];
  /** Where this page's first card sits on the whole shelf. */
  shelfStart: number;
  shelf: ZoomCard[];
  editing: boolean;
  frontEntryId: string | null;
  onRemove: (entryId: string) => void;
  onFront: (entryId: string) => void;
}) {
  const pocketHeight = Math.round((pocketWidth * 88) / 63);
  const per = pocketsPerPage(layout);

  return (
    <View
      style={{
        width,
        padding: PAGE_PAD,
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.elevated,
        flexDirection: "row",
        flexWrap: "wrap",
        gap: POCKET_GAP,
      }}
    >
      {Array.from({ length: per }, (_, index) => {
        const card = cards[index];
        if (!card) {
          return (
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
            width={pocketWidth}
            height={pocketHeight}
            big={layout === 2}
            shelf={shelf}
            position={shelfStart + index}
            editing={editing}
            isFront={frontEntryId === card.entryId}
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
 * A card in its pocket: the picture in a black ring with the sleeve's
 * lip caught along the top, the copies in a corner when there is more
 * than one, and the lime strip at the foot when it is on the viewer's
 * hunts. With Edit on, the owner's two controls sit over it.
 */
function Pocket({
  card,
  width,
  height,
  big,
  shelf,
  position,
  editing,
  isFront,
  onRemove,
  onFront,
}: {
  card: BinderCard;
  width: number;
  height: number;
  big: boolean;
  shelf: ZoomCard[];
  position: number;
  editing: boolean;
  isFront: boolean;
  onRemove: () => void;
  onFront: () => void;
}) {
  return (
    <View
      style={{
        width,
        height,
        borderRadius: 5,
        borderWidth: POCKET_RING,
        borderColor: colors.canvas,
        backgroundColor: colors.canvas,
        overflow: "hidden",
      }}
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
      />

      {/* The sleeve lip: a thin highlight where the plastic folds. */}
      <LinearGradient
        colors={["rgba(255,255,255,0.22)", "transparent"]}
        pointerEvents="none"
        style={{ position: "absolute", top: 0, left: 0, right: 0, height: "6%" }}
      />

      {card.quantity > 1 ? (
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
            {`×${card.quantity}`}
          </Text>
        </View>
      ) : null}

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
    </View>
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
 * The strip at the foot of your own binder: public or not, the
 * layout, the cover. Every change saves at once and paints at once.
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
            Public
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            {binder.isPublic ? "Anyone on cardflare can open it" : "Only you"}
          </Text>
        </View>
        <Switch
          value={binder.isPublic}
          onValueChange={(next) => onSave({ isPublic: next })}
          trackColor={{ true: colors.accent, false: colors.borderStrong }}
          thumbColor={colors.textPrimary}
          accessibilityLabel="Public"
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
