import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { StackParams } from "../../App";
import {
  ApiError,
  describeError,
  getGames,
  getHunts,
  getMe,
  getNearbySettings,
  lastRoomGame,
  lastSearchGame,
  publishFlare,
  rememberSearchGame,
  searchCards,
  type CardHit,
  type FeedEntry,
  type Hunt,
  type Me,
  type NearbySettings,
} from "../api";
import { readCache, writeCache } from "../cache";
import { markFeedStale } from "../feed-refresh";
import { cardsLabel, copiesLabel } from "../flare-copy";
import { FlareFeedCard } from "../flare-feed-card";
import { GameSearchField } from "../game-chips";
import { ALL_GAMES, resolveGameScope, searchPlaceholder } from "../game-scope";
import { gameShortName, type GameSlug } from "../games";
import { useTabBarInset } from "../glass";
import { haveLocationPermission, requestCoords, type Coords } from "../location";
import { LOCAL_ENABLED } from "../local-enabled";
import { NearbyCard } from "../nearby";
import type { PostRef } from "../post-social";
import { RemoteImage } from "../remote-image";
import { Stepper } from "../stepper";
import { colors, gutter, radius, spacing } from "../theme";
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
} from "../ui";
import { Highlighted, Pill, Stats, leadArt, type PostTarget } from "./post-flare";

/**
 * The one composer: select cards, compose, preview, post.
 *
 * The old screen posted one card per press, which is why a deck of
 * fourteen was fourteen posts and the founder asked for "an option
 * when posting a flare to have it in the same one". This one holds a
 * tray of cards, each with its own printing and count, and posts them
 * as ONE Flare through `publishFlare`. Looking for or Offering is
 * decided once for the post; a caption is written once; a hunt is
 * named once.
 *
 * THE DRAFT SURVIVES. Everything typed is written to the cache as it
 * changes and read back on the next open, so a phone call between
 * picking cards and posting them costs nothing. Posting clears it.
 *
 * The preview IS the Feed's post component with the draft poured in,
 * so what is shown before posting is what will be shown after.
 */

/** A card in the tray, with what the poster decided about it. */
interface DraftItem {
  cardId: string;
  name: string;
  cardNumber: string;
  imageUrl: string | null;
  printings: { id: string; label: string | null; imageUrl: string | null }[];
  /** Null is any printing. */
  printingId: string | null;
  quantity: number;
}

type HuntChoice =
  { kind: "existing"; id: string } | { kind: "new"; name: string } | null;

/** What is saved between opens. Versioned so an older shape is dropped. */
interface Draft {
  v: 1;
  items: DraftItem[];
  intent: "want" | "showcase";
  caption: string;
  hunt: HuntChoice;
  acceptsTrade: boolean;
  acceptsCash: boolean;
}

const EMPTY: Draft = {
  v: 1,
  items: [],
  intent: "want",
  caption: "",
  hunt: null,
  acceptsTrade: true,
  acceptsCash: false,
};

const CAPTION_MAX = 280;

type Step = "select" | "compose" | "preview";

export function FlareComposer({
  target,
  initialHuntId,
  resetSignal,
  onPosted,
  footer,
}: {
  target: PostTarget;
  /** The hunt to open into, from a profile's "Add cards". */
  initialHuntId?: string;
  /** Bumped by the Flare tab on a re-tap while focused. */
  resetSignal?: number;
  /** A post landed; the hub refreshes its list. */
  onPosted?: () => void;
  /** The Flare tab's saved requests, rendered under the composer. */
  footer?: React.ReactNode;
}) {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const tabInset = useTabBarInset();

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [previewing, setPreviewing] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posted, setPosted] = useState<{ postId: string | null } | null>(null);

  /* Who is posting: their face for the preview, their id for the draft. */
  const [me, setMe] = useState<Me | null>(null);
  const [draftKey, setDraftKey] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    getMe()
      .then((result) => {
        if (!live) return;
        setMe(result);
        setDraftKey(result.player.id);
      })
      .catch(() => {
        if (live) setDraftKey("guest");
      });
    return () => {
      live = false;
    };
  }, []);

  /*
   * THE DRAFT, read once the key is known and written on every change
   * after that. `restored` gates the writes so a blank first render
   * cannot overwrite what was saved before it is read.
   */
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    if (!draftKey) return;
    let live = true;
    void readCache<Draft>("composer", draftKey).then((saved) => {
      if (!live) return;
      if (saved && saved.v === 1 && Array.isArray(saved.items)) {
        /* What was typed since mount wins over what was saved before
           it; a hunt handed in by "Add cards" survives the restore. */
        setDraft((current) =>
          current.items.length > 0
            ? current
            : {
                ...saved,
                hunt: current.hunt ?? saved.hunt,
                intent: current.hunt ? "want" : saved.intent,
              },
        );
      }
      setRestored(true);
    });
    return () => {
      live = false;
    };
  }, [draftKey]);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!restored || !draftKey) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void writeCache("composer", draftKey, draft);
    }, 400);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [draft, restored, draftKey]);

  /* "Add cards" on a hunt arrives with its id: a want, into that hunt. */
  useEffect(() => {
    if (!initialHuntId) return;
    setDraft((current) => ({
      ...current,
      intent: "want",
      hunt: { kind: "existing", id: initialHuntId },
    }));
    setPosted(null);
    setPreviewing(false);
  }, [initialHuntId]);

  /* A re-tap on the tab while here: back to the top of the flow. */
  useEffect(() => {
    if (!resetSignal) return;
    setPreviewing(false);
    setEditing(null);
    setPicking(false);
  }, [resetSignal]);

  /* Their hunts, for "Add to a hunt". A guest has none. */
  const [hunts, setHunts] = useState<Hunt[]>([]);
  const [huntLimit, setHuntLimit] = useState<number | null>(null);
  const loadHunts = () =>
    getHunts()
      .then((result) => {
        setHunts(result.hunts);
        setHuntLimit(result.limit);
      })
      .catch(() => {});
  useEffect(() => {
    void loadHunts();
  }, []);

  /* Where the poster is, when already granted. Never asked for here. */
  const [at, setAt] = useState<Coords | null>(null);
  useEffect(() => {
    let live = true;
    void (async () => {
      if (!(await haveLocationPermission())) return;
      const outcome = await requestCoords();
      if (live && outcome.status === "granted") setAt(outcome.coords);
    })();
    return () => {
      live = false;
    };
  }, []);

  const patch = (change: Partial<Draft>) =>
    setDraft((current) => ({ ...current, ...change }));
  const setItems = (items: DraftItem[]) => patch({ items });

  const copies = draft.items.reduce((sum, item) => sum + item.quantity, 0);
  const step: Step = previewing
    ? "preview"
    : draft.items.length === 0
      ? "select"
      : "compose";
  const chosenHunt = draft.hunt;
  const huntName =
    chosenHunt?.kind === "new"
      ? chosenHunt.name
      : chosenHunt?.kind === "existing"
        ? (hunts.find((hunt) => hunt.id === chosenHunt.id)?.name ?? null)
        : null;

  const post = async () => {
    setError(null);
    try {
      const result = await publishFlare({
        code: target.kind === "room" ? target.code : undefined,
        intent: draft.intent,
        caption: draft.caption.trim() || null,
        items: draft.items.map((item) => ({
          cardId: item.cardId,
          printingId: item.printingId,
          quantity: item.quantity,
        })),
        hunt:
          draft.intent !== "want" || !draft.hunt
            ? null
            : draft.hunt.kind === "existing"
              ? { id: draft.hunt.id }
              : { name: draft.hunt.name.trim() },
        acceptsTrade: draft.acceptsTrade,
        acceptsCash: draft.acceptsCash,
        latitude: at?.latitude,
        longitude: at?.longitude,
      });
      if (!result.ok) {
        setError(
          result.error === "at-cap" || result.atCap
            ? "You have too many Flares up. Take one down first."
            : (result.message ?? "Could not post the Flare. Try again."),
        );
        return;
      }
      /* The Feed starts catching up now, not when it is next looked at. */
      markFeedStale();
      onPosted?.();
      void loadHunts();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
      setPosted({ postId: result.postId ?? null });
      setDraft(EMPTY);
      setPreviewing(false);
      setEditing(null);
      if (draftKey) void writeCache("composer", draftKey, EMPTY);
    } catch (caught) {
      const code = caught instanceof ApiError ? caught.code : "";
      setError(
        code === "at-cap"
          ? target.kind === "room"
            ? "You have hit the Flare cap for this room."
            : "You have too many Flares up. Take one down first."
          : code === "already-posted"
            ? "One of these cards is already up."
            : code === "not-migrated"
              ? "Posting isn't switched on yet. The server needs its latest update."
              : `Could not post the Flare (${describeError(caught)}). Try again.`,
      );
    }
  };

  return (
    <ScrollView
      contentContainerStyle={{
        paddingHorizontal: gutter,
        paddingVertical: spacing(4),
        gap: spacing(3),
        paddingBottom: spacing(4) + tabInset,
      }}
      keyboardShouldPersistTaps="handled"
    >
      {posted ? (
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}>
            <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
            <Title>Posted</Title>
          </View>
          <Body>
            {target.kind === "room"
              ? "It is up on the board. Your friends see it in the Feed too."
              : LOCAL_ENABLED
                ? "People near you see it, and so do your friends."
                : "Your friends see it in the Feed."}
          </Body>
          <Button
            label="See it in the Feed"
            onPress={() => navigation.navigate("Tabs", { screen: "Feed" })}
          />
          <Button
            label="New flare"
            variant="secondary"
            onPress={() => setPosted(null)}
          />
        </Card>
      ) : (
        <Card>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: spacing(2),
            }}
          >
            <Title>New flare</Title>
            {target.kind === "room" ? (
              <Muted>{`To room ${target.code}`}</Muted>
            ) : (
              <Muted>{LOCAL_ENABLED ? "To friends and nearby" : "To friends"}</Muted>
            )}
          </View>
          <StepStrip step={step} />

          {previewing ? (
            <FlareComposerPreview
              draft={draft}
              me={me}
              huntName={huntName}
              onBack={() => setPreviewing(false)}
              onPost={post}
              error={error}
            />
          ) : (
            <>
              <IntentControl
                value={draft.intent}
                onChange={(intent) =>
                  patch({ intent, hunt: intent === "want" ? draft.hunt : null })
                }
              />

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: spacing(2),
                }}
              >
                <Text style={{ color: colors.textPrimary, fontWeight: "700" }}>
                  Cards in this flare
                </Text>
                <Muted>
                  {draft.items.length > 0
                    ? `${cardsLabel(draft.items.length)} · ${copiesLabel(copies)}`
                    : "None yet"}
                </Muted>
              </View>

              <CardTray
                items={draft.items}
                editing={editing}
                onEdit={(cardId) => setEditing(editing === cardId ? null : cardId)}
                onAdd={() => setPicking(true)}
              />

              {editing ? (
                <CardEditor
                  item={draft.items.find((item) => item.cardId === editing) ?? null}
                  index={draft.items.findIndex((item) => item.cardId === editing)}
                  count={draft.items.length}
                  intent={draft.intent}
                  onChange={(next) =>
                    setItems(
                      draft.items.map((item) =>
                        item.cardId === next.cardId ? next : item,
                      ),
                    )
                  }
                  onMove={(delta) => {
                    const from = draft.items.findIndex(
                      (item) => item.cardId === editing,
                    );
                    const to = from + delta;
                    if (from < 0 || to < 0 || to >= draft.items.length) return;
                    const next = [...draft.items];
                    const [moved] = next.splice(from, 1);
                    if (moved) next.splice(to, 0, moved);
                    setItems(next);
                  }}
                  onCover={() => {
                    const item = draft.items.find((entry) => entry.cardId === editing);
                    if (!item) return;
                    setItems([item, ...draft.items.filter((entry) => entry !== item)]);
                  }}
                  onRemove={() => {
                    setItems(draft.items.filter((item) => item.cardId !== editing));
                    setEditing(null);
                  }}
                />
              ) : null}

              <Input
                value={draft.caption}
                onChangeText={(caption) => patch({ caption })}
                placeholder="Caption (optional)"
                maxLength={CAPTION_MAX}
                multiline
                style={{ minHeight: 64, textAlignVertical: "top" }}
              />

              <Body>Trade or cash?</Body>
              <View style={{ flexDirection: "row", gap: spacing(2) }}>
                {/* Never both off: a Flare nobody can answer is not a
                    Flare. The server enforces it too. */}
                <Pill
                  label="Trade"
                  active={draft.acceptsTrade}
                  disabled={draft.acceptsTrade && !draft.acceptsCash}
                  onPress={() => patch({ acceptsTrade: !draft.acceptsTrade })}
                />
                <Pill
                  label="Cash"
                  active={draft.acceptsCash}
                  disabled={draft.acceptsCash && !draft.acceptsTrade}
                  onPress={() => patch({ acceptsCash: !draft.acceptsCash })}
                />
              </View>

              {draft.intent === "want" && draftKey && draftKey !== "guest" ? (
                <HuntPicker
                  hunts={hunts}
                  limit={huntLimit}
                  value={draft.hunt}
                  onChange={(hunt) => patch({ hunt })}
                />
              ) : null}

              {draftKey && draftKey !== "guest" ? <NearbyRow /> : null}

              <ErrorLine message={error} />
              <Button
                label="Preview"
                disabled={draft.items.length === 0}
                onPress={() => {
                  setEditing(null);
                  setPreviewing(true);
                }}
              />
              {draft.items.length === 0 ? (
                <Muted>Add at least one card to preview the post.</Muted>
              ) : null}
            </>
          )}
        </Card>
      )}

      {footer}

      <CardPicker
        visible={picking}
        target={target}
        items={draft.items}
        onChange={setItems}
        onClose={() => setPicking(false)}
      />
    </ScrollView>
  );
}

/** Select cards, Compose, Preview: where you are in the three. */
function StepStrip({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "select", label: "Select cards" },
    { key: "compose", label: "Compose" },
    { key: "preview", label: "Preview" },
  ];
  const at = steps.findIndex((entry) => entry.key === step);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(1.5) }}>
      {steps.map((entry, index) => {
        const done = index < at;
        const now = index === at;
        return (
          <View
            key={entry.key}
            style={{ flexDirection: "row", alignItems: "center", gap: spacing(1.5) }}
          >
            <View
              style={{
                width: 18,
                height: 18,
                borderRadius: 9,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: now || done ? colors.accent : colors.elevated,
                borderWidth: 1,
                borderColor: now || done ? colors.accent : colors.border,
              }}
            >
              {done ? (
                <Ionicons name="checkmark" size={11} color={colors.accentContrast} />
              ) : (
                <Text
                  style={{
                    color: now ? colors.accentContrast : colors.textMuted,
                    fontSize: 10,
                    fontWeight: "700",
                  }}
                >
                  {index + 1}
                </Text>
              )}
            </View>
            <Text
              style={{
                color: now ? colors.textPrimary : colors.textMuted,
                fontSize: 12,
                fontWeight: now ? "700" : "500",
              }}
            >
              {entry.label}
            </Text>
            {index < steps.length - 1 ? (
              <Ionicons name="chevron-forward" size={11} color={colors.textMuted} />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/** Looking for | Offering, one answer for the whole post. */
function IntentControl({
  value,
  onChange,
}: {
  value: "want" | "showcase";
  onChange: (intent: "want" | "showcase") => void;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        borderRadius: radius.control,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.elevated,
        padding: 3,
      }}
    >
      {(
        [
          { key: "want", label: "Looking for" },
          { key: "showcase", label: "Offering" },
        ] as const
      ).map((option) => {
        const on = value === option.key;
        return (
          <Tap
            key={option.key}
            onPress={() => onChange(option.key)}
            accessibilityLabel={option.label}
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
                fontSize: 13,
                fontWeight: "700",
              }}
            >
              {option.label}
            </Text>
          </Tap>
        );
      })}
    </View>
  );
}

/** The thumbnails in order, the cover first, and the tile that adds. */
function CardTray({
  items,
  editing,
  onEdit,
  onAdd,
}: {
  items: DraftItem[];
  editing: string | null;
  onEdit: (cardId: string) => void;
  onAdd: () => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: spacing(2), paddingVertical: 2 }}
    >
      {items.map((item, index) => {
        const on = editing === item.cardId;
        return (
          <Tap
            key={item.cardId}
            onPress={() => onEdit(item.cardId)}
            accessibilityLabel={`${item.name}, ${index === 0 ? "cover" : `card ${index + 1}`}, ${copiesLabel(item.quantity)}`}
            style={{
              width: 64,
              height: 90,
              borderRadius: 8,
              borderWidth: on ? 2 : 1,
              borderColor: on ? colors.accent : colors.border,
              backgroundColor: colors.elevated,
              overflow: "hidden",
            }}
          >
            <RemoteImage uri={artFor(item)} style={{ width: "100%", height: "100%" }} />
            <View
              style={{
                position: "absolute",
                top: 3,
                left: 3,
                minWidth: 18,
                height: 18,
                borderRadius: 9,
                paddingHorizontal: 4,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: index === 0 ? colors.accent : colors.canvas,
              }}
            >
              <Text
                style={{
                  color: index === 0 ? colors.accentContrast : colors.textPrimary,
                  fontSize: 10,
                  fontWeight: "700",
                }}
              >
                {index + 1}
              </Text>
            </View>
            {item.quantity > 1 ? (
              <View
                style={{
                  position: "absolute",
                  bottom: 3,
                  right: 3,
                  borderRadius: 999,
                  paddingHorizontal: 5,
                  paddingVertical: 1,
                  backgroundColor: colors.canvas,
                }}
              >
                <Text
                  style={{ color: colors.textPrimary, fontSize: 10, fontWeight: "700" }}
                >
                  {`x${item.quantity}`}
                </Text>
              </View>
            ) : null}
          </Tap>
        );
      })}
      <Tap
        onPress={onAdd}
        accessibilityLabel="Add cards"
        style={{
          width: 64,
          height: 90,
          borderRadius: 8,
          borderWidth: 1,
          borderStyle: "dashed",
          borderColor: colors.borderStrong,
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
        }}
      >
        <Ionicons name="add" size={22} color={colors.accent} />
        <Text style={{ color: colors.textSecondary, fontSize: 10, fontWeight: "600" }}>
          Add cards
        </Text>
      </Tap>
    </ScrollView>
  );
}

/** The art for a tray tile: the chosen printing's, else the lead's. */
function artFor(item: DraftItem): string | null {
  if (item.printingId) {
    const chosen = item.printings.find((printing) => printing.id === item.printingId);
    if (chosen?.imageUrl) return chosen.imageUrl;
  }
  return item.imageUrl;
}

/** One tray card, opened: printing, copies, order, remove. */
function CardEditor({
  item,
  index,
  count,
  intent,
  onChange,
  onMove,
  onCover,
  onRemove,
}: {
  item: DraftItem | null;
  index: number;
  count: number;
  intent: "want" | "showcase";
  onChange: (next: DraftItem) => void;
  onMove: (delta: -1 | 1) => void;
  onCover: () => void;
  onRemove: () => void;
}) {
  if (!item) return null;
  const options: { id: string | null; label: string }[] = [
    { id: null, label: "Any printing" },
    ...item.printings.map((printing) => ({
      id: printing.id,
      label: printing.label ?? "Standard printing",
    })),
  ];
  return (
    <View
      style={{
        gap: spacing(2.5),
        borderRadius: radius.control,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.elevated,
        padding: spacing(3),
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(3) }}>
        <CardImage
          imageUrl={artFor(item)}
          width={48}
          name={item.name}
          cardNumber={item.cardNumber}
          caption={
            item.printingId
              ? (item.printings.find((printing) => printing.id === item.printingId)
                  ?.label ?? null)
              : null
          }
        />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text
            numberOfLines={2}
            style={{ color: colors.textPrimary, fontWeight: "700", fontSize: 15 }}
          >
            {item.name}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            {`${item.cardNumber} · ${index === 0 ? "Cover" : `Card ${index + 1} of ${count}`}`}
          </Text>
        </View>
      </View>

      <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Printing</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing(1.5) }}
      >
        {options.map((option) => {
          const on = item.printingId === option.id;
          return (
            <Tap
              key={option.id ?? "any"}
              onPress={() => onChange({ ...item, printingId: option.id })}
              accessibilityLabel={option.label}
              style={{
                borderRadius: 999,
                borderWidth: 1,
                borderColor: on ? colors.accent : colors.borderStrong,
                backgroundColor: on ? colors.accent : "transparent",
                paddingHorizontal: spacing(3),
                paddingVertical: spacing(1),
              }}
            >
              <Text
                style={{
                  color: on ? colors.accentContrast : colors.textSecondary,
                  fontSize: 12,
                  fontWeight: "700",
                }}
              >
                {option.label}
              </Text>
            </Tap>
          );
        })}
      </ScrollView>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: spacing(2),
        }}
      >
        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
          {intent === "want" ? "Copies needed" : "Copies available"}
        </Text>
        <Stepper
          value={item.quantity}
          min={1}
          max={99}
          onChange={(quantity) => onChange({ ...item, quantity })}
          label={intent === "want" ? "copies needed" : "copies available"}
        />
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing(2) }}>
        {index > 0 ? <SmallAction label="Make cover" onPress={onCover} /> : null}
        {index > 0 ? (
          <SmallAction label="Move left" onPress={() => onMove(-1)} />
        ) : null}
        {index < count - 1 ? (
          <SmallAction label="Move right" onPress={() => onMove(1)} />
        ) : null}
        <SmallAction label="Remove" onPress={onRemove} danger />
      </View>
    </View>
  );
}

function SmallAction({
  label,
  onPress,
  danger = false,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Tap
      onPress={onPress}
      accessibilityLabel={label}
      style={{
        borderRadius: 999,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        paddingHorizontal: spacing(3),
        paddingVertical: spacing(1.5),
      }}
    >
      <Text
        style={{
          color: danger ? colors.danger : colors.textSecondary,
          fontSize: 12,
          fontWeight: "700",
        }}
      >
        {label}
      </Text>
    </Tap>
  );
}

/** "Add to a hunt": one of theirs, or a new one by name. Wants only. */
function HuntPicker({
  hunts,
  limit,
  value,
  onChange,
}: {
  hunts: Hunt[];
  limit: number | null;
  value: HuntChoice;
  onChange: (next: HuntChoice) => void;
}) {
  const [open, setOpen] = useState(value !== null);
  useEffect(() => {
    if (value) setOpen(true);
  }, [value]);
  const atLimit = limit !== null && hunts.length >= limit;

  if (!open) {
    return (
      <Tap
        onPress={() => setOpen(true)}
        accessibilityLabel="Add to a hunt"
        style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}
      >
        <Ionicons name="locate-outline" size={18} color={colors.accent} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textPrimary, fontWeight: "600" }}>
            Add to a hunt
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            Building a deck? Keep the cards together with what is found.
          </Text>
        </View>
        <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
      </Tap>
    );
  }

  return (
    <View style={{ gap: spacing(2) }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}>
        <Text style={{ color: colors.textPrimary, fontWeight: "700", flex: 1 }}>
          Add to a hunt
        </Text>
        <Tap
          accessibilityLabel="Not in a hunt"
          onPress={() => {
            onChange(null);
            setOpen(false);
          }}
        >
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>Clear</Text>
        </Tap>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing(1.5) }}
      >
        {hunts
          .filter((hunt): hunt is Hunt & { id: string } => Boolean(hunt.id))
          .map((hunt) => {
            const on = value?.kind === "existing" && value.id === hunt.id;
            return (
              <Tap
                key={hunt.id}
                onPress={() => onChange({ kind: "existing", id: hunt.id })}
                accessibilityLabel={hunt.name}
                style={{
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: on ? colors.accent : colors.borderStrong,
                  backgroundColor: on ? colors.accent : "transparent",
                  paddingHorizontal: spacing(3),
                  paddingVertical: spacing(1),
                }}
              >
                <Text
                  style={{
                    color: on ? colors.accentContrast : colors.textSecondary,
                    fontSize: 12,
                    fontWeight: "700",
                  }}
                >
                  {hunt.name}
                </Text>
              </Tap>
            );
          })}
        <Tap
          onPress={() =>
            onChange({ kind: "new", name: value?.kind === "new" ? value.name : "" })
          }
          disabled={atLimit}
          accessibilityLabel="New hunt"
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 3,
            borderRadius: 999,
            borderWidth: 1,
            borderStyle: "dashed",
            borderColor: value?.kind === "new" ? colors.accent : colors.borderStrong,
            paddingHorizontal: spacing(3),
            paddingVertical: spacing(1),
            opacity: atLimit ? 0.5 : 1,
          }}
        >
          <Ionicons name="add" size={12} color={colors.accent} />
          <Text
            style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "700" }}
          >
            New hunt
          </Text>
        </Tap>
      </ScrollView>
      {value?.kind === "new" ? (
        <Input
          value={value.name}
          onChangeText={(name) => onChange({ kind: "new", name })}
          placeholder={'Name it, like "Green Zoro"'}
          maxLength={40}
          autoCapitalize="words"
          autoFocus
        />
      ) : null}
      {atLimit ? (
        <Muted>{`You are at ${limit} hunts. Add to one of them, or finish one first.`}</Muted>
      ) : null}
      {value?.kind === "existing" ? (
        <Muted>Cards already on the hunt keep their copies; new cards are added.</Muted>
      ) : null}
    </View>
  );
}

/** "Nearby matching · On · Change": the settings, folded until asked. */
function NearbyRow() {
  const [settings, setSettings] = useState<NearbySettings | null | undefined>(
    undefined,
  );
  const [open, setOpen] = useState(false);
  const load = () =>
    getNearbySettings()
      .then(setSettings)
      .catch(() => setSettings(null));
  useEffect(() => {
    void load();
  }, []);
  /* Folding the row back re-reads, so the word after the dot is true. */
  useEffect(() => {
    if (!open) void load();
  }, [open]);

  if (settings === null) return null;

  return (
    <View style={{ gap: spacing(2) }}>
      <Tap
        onPress={() => setOpen((value) => !value)}
        accessibilityLabel="Nearby matching settings"
        style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}
      >
        <Ionicons name="flame" size={16} color={colors.accent} />
        <Text style={{ color: colors.textPrimary, fontWeight: "600", flex: 1 }}>
          {`Nearby matching${settings ? ` · ${settings.enabled ? "On" : "Off"}` : ""}`}
        </Text>
        <Text style={{ color: colors.accent, fontSize: 13, fontWeight: "700" }}>
          {open ? "Done" : "Change"}
        </Text>
      </Tap>
      {open ? <NearbyCard /> : null}
    </View>
  );
}

/**
 * The post, before it is posted: the Feed's own component with the
 * draft poured into it. Handlers are no-ops; nothing here reaches a
 * server until "Post flare".
 */
export function FlareComposerPreview({
  draft,
  me,
  huntName,
  onBack,
  onPost,
  error,
}: {
  draft: Draft;
  me: Me | null;
  huntName: string | null;
  onBack: () => void;
  onPost: () => Promise<void>;
  error: string | null;
}) {
  const copies = draft.items.reduce((sum, item) => sum + item.quantity, 0);
  const item: Extract<FeedEntry, { kind: "hunt" }> = {
    kind: "hunt",
    postId: "preview",
    likes: 0,
    comments: 0,
    liked: false,
    code: "",
    storeName: "",
    eventName: "",
    playerId: me?.player.id ?? "you",
    displayName: me?.player.displayName ?? "You",
    avatarUrl: me?.player.avatarUrl ?? null,
    frame: null,
    ring: null,
    direction: draft.intent,
    deckLabel: huntName,
    postedAt: new Date().toISOString(),
    acceptsTrade: draft.acceptsTrade,
    acceptsCash: draft.acceptsCash,
    note: draft.caption.trim() || null,
    offers: 0,
    hunt:
      draft.intent === "want" && huntName
        ? {
            id: draft.hunt?.kind === "existing" ? draft.hunt.id : "new",
            name: huntName,
          }
        : null,
    remainingCopies: copies,
    completed: false,
    cards: draft.items.map((entry) => ({
      cardId: entry.cardId,
      cardName: entry.name,
      cardNumber: entry.cardNumber,
      imageUrl: artFor(entry),
      match: null,
      state: "open",
      youOffered: false,
      printingId: entry.printingId,
      printingLabel: entry.printingId
        ? (entry.printings.find((printing) => printing.id === entry.printingId)
            ?.label ?? null)
        : null,
      quantity: entry.quantity,
      remaining: entry.quantity,
    })),
    total: draft.items.length,
    youCanAnswer: 0,
    yours: true,
  };
  const post: PostRef = {
    postId: "preview",
    yours: true,
    offer: async () => undefined,
  };

  return (
    <View style={{ gap: spacing(3) }}>
      <Muted>This is how it will look in the Feed.</Muted>
      <FlareFeedCard
        item={item}
        post={post}
        onOpenProfile={() => undefined}
        onLike={async () => undefined}
        onOpenThread={() => undefined}
        onEnterRoom={() => undefined}
      />
      <ErrorLine message={error} />
      <AsyncButton label="Post flare" pendingLabel="Posting…" onPress={onPost} />
      <Button label="Back to editing" variant="secondary" onPress={onBack} />
    </View>
  );
}

/**
 * The search the old composer had, as a hook, so the picker is a list
 * and not a second copy of the scope rules: the room's game locks it;
 * otherwise the chip last tapped, else the first game from sign-up.
 */
function useCardSearch(target: PostTarget) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<CardHit[]>([]);
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

  useEffect(() => {
    if (query.trim().length < 2) {
      setHits([]);
      return;
    }
    const timer = setTimeout(() => {
      if (scopedGame && !scope.locked && remembered !== scopedGame) {
        setRemembered(scopedGame);
        void rememberSearchGame(scopedGame);
      }
      void searchCards(query.trim(), scopedGame)
        .then((result) => setHits(result.cards))
        .catch(() => setHits([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [query, scopedGame, scope.locked, remembered]);

  return { query, setQuery, hits, scope, scopedGame, playerGames, pickGame };
}

/**
 * Picking several cards: the same search, with the selection kept
 * while you type. A picked card shows its order number; picking it
 * again adds a copy rather than a second row. "Done" goes back to the
 * tray with everything chosen.
 */
export function CardPicker({
  visible,
  target,
  items,
  onChange,
  onClose,
}: {
  visible: boolean;
  target: PostTarget;
  items: DraftItem[];
  onChange: (items: DraftItem[]) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const search = useCardSearch(target);

  const pick = (hit: CardHit) => {
    const index = items.findIndex((item) => item.cardId === hit.id);
    if (index >= 0) {
      onChange(
        items.map((item, at) =>
          at === index ? { ...item, quantity: Math.min(99, item.quantity + 1) } : item,
        ),
      );
      return;
    }
    onChange([
      ...items,
      {
        cardId: hit.id,
        name: hit.name,
        cardNumber: hit.cardNumber,
        imageUrl: leadArt(hit),
        printings: hit.printings,
        printingId: null,
        quantity: 1,
      },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View
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
          <Title>Select cards</Title>
          <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Close">
            <Ionicons name="close" size={24} color={colors.textSecondary} />
          </Pressable>
        </View>
        <GameSearchField
          scope={search.scope}
          playerGames={search.playerGames}
          onPick={search.pickGame}
          value={search.query}
          onChangeText={search.setQuery}
          placeholder={searchPlaceholder(search.scopedGame)}
          autoFocus
        />
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ gap: spacing(2), paddingBottom: spacing(4) }}
          keyboardShouldPersistTaps="handled"
        >
          {search.query.trim().length >= 2 && search.hits.length === 0 ? (
            <Muted>
              {search.scopedGame && !search.scope.locked
                ? `No ${gameShortName(search.scopedGame)} cards yet. Keep typing, check the number, or try All games.`
                : "Nothing yet. Keep typing, or check the number."}
            </Muted>
          ) : null}
          {search.query.trim().length < 2 && items.length === 0 ? (
            <Muted>
              Search by name or number. Tap a card to add it; tap again for another
              copy.
            </Muted>
          ) : null}
          {search.hits.map((hit) => {
            const index = items.findIndex((item) => item.cardId === hit.id);
            const chosen = index >= 0 ? items[index] : null;
            return (
              <Tap
                key={hit.id}
                onPress={() => pick(hit)}
                accessibilityLabel={
                  chosen ? `${hit.name}, picked, add a copy` : `Add ${hit.name}`
                }
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing(3),
                  borderColor: chosen ? colors.accent : colors.border,
                  borderWidth: 1,
                  borderRadius: radius.control,
                  backgroundColor: colors.surface,
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
                    {[
                      hit.printings.length === 1
                        ? (hit.printings[0]?.label ?? null)
                        : `${hit.printings.length} printings`,
                      hit.cardType,
                    ]
                      .filter((part): part is string => !!part)
                      .map((part) => (
                        <Text
                          key={part}
                          style={{ color: colors.textMuted, fontSize: 12 }}
                        >
                          {part}
                        </Text>
                      ))}
                  </View>
                  <Stats hit={hit} />
                </View>
                {chosen ? (
                  <View style={{ alignItems: "center", gap: 2 }}>
                    <View
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 12,
                        backgroundColor: colors.accent,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text
                        style={{
                          color: colors.accentContrast,
                          fontSize: 12,
                          fontWeight: "800",
                        }}
                      >
                        {index + 1}
                      </Text>
                    </View>
                    <Text style={{ color: colors.textMuted, fontSize: 10 }}>
                      {`x${chosen.quantity}`}
                    </Text>
                  </View>
                ) : (
                  <Ionicons
                    name="add-circle-outline"
                    size={22}
                    color={colors.textSecondary}
                  />
                )}
              </Tap>
            );
          })}
        </ScrollView>
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
                    `${item.name}${item.quantity > 1 ? ` x${item.quantity}` : ""}`,
                )
                .join(", ")}
            </Muted>
          ) : null}
          <Button label={`Done (${items.length})`} onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}
