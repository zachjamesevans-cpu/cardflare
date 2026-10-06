import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";

import type { StackParams, TabParams } from "../../App";
import {
  ApiError,
  describeError,
  getHunts,
  getMe,
  getNearbySettings,
  publishFlare,
  searchCards,
  setOpenToTrades,
  storedAccessToken,
  type FeedEntry,
  type Hunt,
  type Me,
  type NearbySettings,
} from "../api";
import { CardTray } from "../card-tray";
import { CardSelectSheet, lineKey, type PickedLine } from "../card-select";
import { cachedPlayerId, readCache, writeCache } from "../cache";
import { markFeedStale } from "../feed-refresh";
import { cardsLabel, copiesLabel } from "../flare-copy";
import { FlareFeedCard } from "../flare-feed-card";
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
import { Pill, type PostTarget } from "../flare-bits";

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
type DraftItem = PickedLine;

/** One line per printing: the picker's rule, src/card-select.tsx. */
const keyOf = lineKey;

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

/** The card a card page handed over with "Post a Flare for it". */
export type HandedCard = NonNullable<NonNullable<TabParams["Flare"]>["card"]>;

/**
 * THE HANDED CARD GOES FIRST. The founder (2026-10-05): "Searching a
 * card from the feed and clicking post a flare for it, doesn't
 * automatically put the card in the flare screen. Should autofill as
 * the first flare." A card not in the draft becomes its first line:
 * any printing, one copy, Looking for. A card already in it has its
 * line moved to the front and nothing else touched, so a draft somebody
 * built by hand is never rewritten by a tap on a card page.
 */
export function withCardFirst(draft: Draft, card: HandedCard, line?: DraftItem): Draft {
  const at = draft.items.findIndex((item) => item.cardId === card.cardId);
  if (at >= 0) {
    if (at === 0) return draft;
    const items = [...draft.items];
    const [moved] = items.splice(at, 1);
    return moved ? { ...draft, items: [moved, ...items] } : draft;
  }
  return {
    ...draft,
    intent: "want",
    items: [
      line ?? {
        cardId: card.cardId,
        name: card.name,
        cardNumber: card.cardNumber,
        imageUrl: card.imageUrl,
        /* Filled by a search as soon as it answers; until then, and if
           it never does, the line is any printing. */
        printings: [],
        printingId: null,
        quantity: 1,
      },
      ...draft.items,
    ],
  };
}

type Step = "select" | "compose" | "preview";

export function FlareComposer({
  target,
  initialHuntId,
  initialCard,
  resolveTarget,
  resetSignal,
  onPosted,
  footer,
  openToTrades = false,
}: {
  target: PostTarget;
  /** The hunt to open into, from a profile's "Add cards". */
  initialHuntId?: string;
  /** The card to open with as the first line, from a card page. */
  initialCard?: HandedCard;
  /**
   * Where the post really goes, asked at the moment of posting. The
   * Flare tab paints its last answer at once and decides again behind
   * it; posting waits for that decision rather than trusting the paint
   * (src/cache.ts, rule 3). Null is "nowhere to post", e.g. signed out.
   */
  resolveTarget?: () => Promise<PostTarget | null>;
  /** Bumped by the Flare tab on a re-tap while focused. */
  resetSignal?: number;
  /**
   * Whether the poster is open to trades in the room this posts to,
   * as the room last read it. Only a room target draws the toggle:
   * the Flare tab has no room to be open in.
   */
  openToTrades?: boolean;
  /** A post landed; the hub refreshes its list. */
  /**
   * Told what went up, so the list under the composer can show the
   * cards the instant the post lands rather than after a re-read. The
   * founder: "The second I hit post, it needs to be visible in flares."
   */
  onPosted?: (rows: Me["wants"]) => void;
  /** The Flare tab's Flares, rendered under the composer. */
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

  /*
   * "I'm open to trades" lives at the composer's foot now, not beside
   * Post a Flare on the room's bar: the founder wanted one button
   * there. The room hands over what it last read, this holds the tap
   * until the room's next poll reads the truth back.
   */
  const [open, setOpen] = useState(openToTrades);

  /* Who is posting: their face for the preview, their id for the draft. */
  const [me, setMe] = useState<Me | null>(null);
  const [draftKey, setDraftKey] = useState<string | null>(null);
  /* Whether the real answer has landed, so the paint never lands on it. */
  const meFresh = useRef(false);
  useEffect(() => {
    let live = true;
    getMe()
      .then((result) => {
        if (!live) return;
        meFresh.current = true;
        setMe(result);
        setDraftKey(result.player.id);
        void writeCache("composerMe", result.player.id, result);
      })
      .catch(() => {
        /* A painted account stays the key: the network blinking is not
           the same as being signed out. */
        if (live) setDraftKey((current) => current ?? "guest");
      });
    /*
     * The paint: last open's face and key, so the preview, the hunt
     * chooser and the saved draft are there at once instead of after
     * a round trip. Account-scoped like everything in cache.ts, and
     * only with a session, so a signed-out phone paints nothing.
     */
    void (async () => {
      if (!(await storedAccessToken())) return;
      const id = await cachedPlayerId();
      if (!id || !live) return;
      const cached = await readCache<Me>("composerMe", id);
      if (!cached || !live || meFresh.current || cached.player?.id !== id) return;
      setMe((current) => current ?? cached);
      setDraftKey((current) => current ?? id);
    })();
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
           it; a hunt handed in by "Add cards" survives the restore, and
           so does a card handed in by a card page: the saved lines
           stay, the handed card goes first. */
        setDraft((current) => {
          const card = handed.current;
          const handedLine = card
            ? current.items.find((item) => item.cardId === card.cardId)
            : undefined;
          const onlyHanded = handedLine !== undefined && current.items.length === 1;
          if (current.items.length > 0 && !onlyHanded) return current;
          const base: Draft = {
            ...saved,
            hunt: current.hunt ?? saved.hunt,
            intent: current.hunt ? "want" : saved.intent,
          };
          return card ? withCardFirst(base, card, handedLine) : base;
        });
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

  /*
   * "Post a Flare for it" on a card page arrives with the card: the
   * first line of the draft, on the compose step. The line goes in at
   * once with no printings, then the card search fills them in so the
   * printing picker still has something to offer; a search that fails
   * leaves it as any printing, which is a perfectly good Flare.
   */
  const handed = useRef<HandedCard | null>(null);
  useEffect(() => {
    if (!initialCard) return;
    handed.current = initialCard;
    setDraft((current) => withCardFirst(current, initialCard));
    setPosted(null);
    setPreviewing(false);
    setEditing(null);
    setPicking(false);

    let live = true;
    searchCards(initialCard.name)
      .then(({ cards }) => {
        const hit = cards.find((card) => card.id === initialCard.cardId);
        if (!live || !hit) return;
        setDraft((current) => ({
          ...current,
          items: current.items.map((item) =>
            item.cardId === hit.id && item.printings.length === 0
              ? { ...item, printings: hit.printings }
              : item,
          ),
        }));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [initialCard]);

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
  const huntsFresh = useRef(false);
  const loadHunts = () =>
    getHunts()
      .then(async (result) => {
        huntsFresh.current = true;
        setHunts(result.hunts);
        setHuntLimit(result.limit);
        const id = await cachedPlayerId();
        if (id) void writeCache("composerHunts", id, result);
      })
      .catch(() => {});
  useEffect(() => {
    void loadHunts();
    /* Last open's hunts, painted until the real ones land. */
    let live = true;
    void (async () => {
      if (!(await storedAccessToken())) return;
      const id = await cachedPlayerId();
      if (!id || !live) return;
      const cached = await readCache<{ hunts: Hunt[]; limit: number | null }>(
        "composerHunts",
        id,
      );
      if (!cached || !live || huntsFresh.current || !Array.isArray(cached.hunts))
        return;
      setHunts(cached.hunts);
      setHuntLimit(cached.limit ?? null);
    })();
    return () => {
      live = false;
    };
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
      /* The decided target, never a painted one. */
      const where = resolveTarget ? await resolveTarget() : target;
      if (!where) {
        setError("Could not post the Flare. Try again.");
        return;
      }
      const result = await publishFlare({
        code: where.kind === "room" ? where.code : undefined,
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
      onPosted?.(
        draft.items.map((item) => ({
          id: `just-posted:${keyOf(item)}`,
          cardId: item.cardId,
          direction: draft.intent === "want" ? "want" : "offering",
          cardName: item.name,
          cardNumber: item.cardNumber,
          printingId: item.printingId,
          printingLabel:
            item.printings.find((printing) => printing.id === item.printingId)?.label ??
            null,
          quantity: item.quantity,
          note: null,
          deckLabel: null,
          imageUrl: item.imageUrl,
          postedAt: null,
          postedBoards: [],
        })),
      );
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
            label="Post another Flare"
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
            <Title>Post a Flare</Title>
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
                items={draft.items.map((item) => ({
                  key: keyOf(item),
                  name: item.name,
                  imageUrl: artFor(item),
                  quantity: item.quantity,
                }))}
                editing={editing}
                onEdit={(key) => setEditing(editing === key ? null : key)}
                onAdd={() => setPicking(true)}
                /* Drag replaced "Move left"/"Move right"; the arithmetic
                   is the same splice those buttons did. */
                onReorder={(from, to) => {
                  const next = [...draft.items];
                  const [moved] = next.splice(from, 1);
                  if (moved) next.splice(to, 0, moved);
                  setItems(next);
                }}
              />

              {editing ? (
                <CardEditor
                  item={draft.items.find((item) => keyOf(item) === editing) ?? null}
                  index={draft.items.findIndex((item) => keyOf(item) === editing)}
                  count={draft.items.length}
                  intent={draft.intent}
                  onChange={(next) => {
                    /* A printing change re-keys the line; landing on a
                       line already there folds the two into one. */
                    const target = keyOf(next);
                    const twin = draft.items.find(
                      (item) => keyOf(item) === target && keyOf(item) !== editing,
                    );
                    if (twin) {
                      setItems(
                        draft.items
                          .filter((item) => keyOf(item) !== editing)
                          .map((item) =>
                            keyOf(item) === target
                              ? {
                                  ...item,
                                  quantity: Math.min(99, item.quantity + next.quantity),
                                }
                              : item,
                          ),
                      );
                    } else {
                      setItems(
                        draft.items.map((item) =>
                          keyOf(item) === editing ? next : item,
                        ),
                      );
                    }
                    setEditing(target);
                  }}
                  onCover={() => {
                    const item = draft.items.find((entry) => keyOf(entry) === editing);
                    if (!item) return;
                    setItems([item, ...draft.items.filter((entry) => entry !== item)]);
                  }}
                  onRemove={() => {
                    setItems(draft.items.filter((item) => keyOf(item) !== editing));
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

              {/* Nearby matching rides with Local: off the screen entirely
                  while Local is off, the same rule the website's form
                  follows. See src/local-enabled.ts. */}
              {LOCAL_ENABLED && draftKey && draftKey !== "guest" ? <NearbyRow /> : null}

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

      {/* Being open to trades is a fact about the person, not the
          post, so it sits under the composer rather than inside it,
          and stays once the Flare has gone up. */}
      {target.kind === "room" ? (
        <AsyncButton
          label={open ? "Open to trades ✓" : "I'm open to trades"}
          pendingLabel={open ? "Closing…" : "Opening…"}
          variant="secondary"
          onPress={async () => {
            await setOpenToTrades(target.code, !open);
            setOpen(!open);
          }}
        />
      ) : null}

      {footer}

      <CardSelectSheet
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
  onCover,
  onRemove,
}: {
  item: DraftItem | null;
  index: number;
  count: number;
  intent: "want" | "showcase";
  onChange: (next: DraftItem) => void;
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
        /* Your own post, not yet posted: nothing to pick, nowhere to keep it. */
        picks={{}}
        onPicks={() => undefined}
      />
      <ErrorLine message={error} />
      <AsyncButton label="Post flare" pendingLabel="Posting…" onPress={onPost} />
      <Button label="Back to editing" variant="secondary" onPress={onBack} />
    </View>
  );
}
