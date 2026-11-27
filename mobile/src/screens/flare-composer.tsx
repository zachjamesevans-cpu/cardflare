import {
  AddingToHunt,
  type HuntChoice,
} from "../composer-sheets";
import { Frosted } from "../frosted";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cartSaved, onCartWritten } from "../flare-cart";
import { artFlared, cardFlared, useMyFlares } from "../my-flares";
import { Ionicons } from "@expo/vector-icons";
import { StackActions, useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { dismissSwipe } from "../swipe-delete";
import { SheetBackdrop } from "../action-menu";

import type { StackParams, TabParams } from "../../App";
import {
  ApiError,
  type FeedEntry,
  friendlyError,
  getHunts,
  getMe,
  getNearbySettings,
  type Hunt,
  type Me,
  type NearbySettings,
  publishFlare,
  searchCards,
  setOpenToTrades,
  storedAccessToken,
} from "../api";
import { CardTray } from "../card-tray";
import { lineKey, type PickedLine } from "../card-select";
import { cachedPlayerId, readCache, writeCache } from "../cache";
import { markFeedStale } from "../feed-refresh";
import { FlareFeedCard } from "../flare-feed-card";
import { useTabBarInset } from "../glass";
import { haveLocationPermission, requestCoords, type Coords } from "../location";
import { LOCAL_ENABLED } from "../local-enabled";
import { NearbyCard } from "../nearby";
import type { PostRef } from "../post-social";
import { postSummary } from "../post-summary";
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
 * The one composer: select cards, compose, post.
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
 *
 * THE PREVIEW IS OPTIONAL. It used to be a step every post walked
 * through; now the compose step posts on its own, and "Preview" under
 * it opens the same look at the post for anyone who wants one. Both
 * Post buttons run the one `post` below, which refuses to start while
 * it is already running, so a tap on each cannot make two posts.
 */

/** A card in the tray, with what the poster decided about it. */
type DraftItem = PickedLine;

/** One line per printing: the picker's rule, src/card-select.tsx. */
const keyOf = lineKey;

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
  /* The same card AND art: another art of it is a line of its own. */
  const printingId = card.printingId ?? null;
  const at = draft.items.findIndex(
    (item) => item.cardId === card.cardId && (item.printingId ?? null) === printingId,
  );
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
        printingId: card.printingId ?? null,
        quantity: 1,
      },
      ...draft.items,
    ],
  };
}


export function FlareComposer({
  target,
  initialHuntId,
  huntSignal,
  initialCard,
  resolveTarget,
  resetSignal,
  onPosted,
  footer,
  openToTrades = false,
}: {
  target: PostTarget;
  /** The hunt to open into, from a hunt's "+". */
  initialHuntId?: string;
  /** Bumped on every "+", so the same hunt twice still opens into it. */
  huntSignal?: number;
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
  onPosted?: (rows: Me["wants"], complete: boolean, summary?: string | null) => boolean | void;
  /** The Flare tab's Flares, rendered under the composer. */
  footer?: React.ReactNode;
}) {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  /* Opened as the Compose sheet, fitted to its contents (App.tsx). */
  const inSheet = useRoute().name === "Compose";
  const insets = useSafeAreaInsets();
  const tabInset = useTabBarInset();

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [previewing, setPreviewing] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  /* For the flame on a card already on your Flares (my-flares.ts). */
  useMyFlares();
  /* The card row is being rearranged: the page holds still (card-tray.tsx). */
  const [rearranging, setRearranging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posted, setPosted] = useState<{
    postId: string | null;
    /** "Posted 18 of 20 · 2 were already up", or null when all went up. */
    summary: string | null;
  } | null>(null);

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
           it, and so does a card handed in by a card page: the saved
           lines stay, the handed card goes first. A hunt is never
           restored: it comes only from the "+" this was opened from
           (AddingToHunt), so a post cannot slip into one chosen on an
           earlier visit. */
        setDraft((current) => {
          const card = handed.current;
          const handedLine = card
            ? current.items.find(
                (item) =>
                  keyOf(item) ===
                  lineKey({ cardId: card.cardId, printingId: card.printingId ?? null }),
              )
            : undefined;
          const onlyHanded = handedLine !== undefined && current.items.length === 1;
          if (current.items.length > 0 && !onlyHanded) return current;
          const base: Draft = {
            ...saved,
            hunt: current.hunt,
            /* Always a want now: offering lives in trade binders. */
            intent: "want",
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
      /* The cart's count is the draft's (flare-cart.ts). */
      cartSaved(draft.items);
    }, 400);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [draft, restored, draftKey]);

  /*
   * "Add cards" is the Search screen, the same one as the tab: the art
   * first, and each card's own + (tap again for another copy). The
   * founder (2026-11-27), of the old stacked list: "should we make them
   * the same?" The draft is written first so the + adds to what is on
   * screen, and what it adds comes back here as it lands.
   */
  const addCards = async () => {
    if (draftKey) {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      await writeCache("composer", draftKey, draft);
      cartSaved(draft.items);
    }
    navigation.dispatch(StackActions.push("AddCards"));
  };
  useEffect(
    () =>
      onCartWritten((items) => {
        setDraft((current) => ({ ...current, items }));
        setPosted(null);
        setPreviewing(false);
      }),
    [],
  );

  /* A hunt's "+" arrives with its id: a want, into that hunt. */
  useEffect(() => {
    if (!initialHuntId) return;
    setDraft((current) => ({
      ...current,
      intent: "want",
      hunt: { kind: "existing", id: initialHuntId },
    }));
    setPosted(null);
    setPreviewing(false);
  }, [initialHuntId, huntSignal]);

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
  }, [resetSignal]);

  /* Their hunts, for the name on "Adding to". A guest has none. */
  const [hunts, setHunts] = useState<Hunt[]>([]);
  const huntsFresh = useRef(false);
  const loadHunts = () =>
    getHunts()
      .then(async (result) => {
        huntsFresh.current = true;
        setHunts(result.hunts);
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

  const chosenHunt = draft.hunt;
  const huntName =
    chosenHunt?.kind === "existing"
      ? (hunts.find((hunt) => hunt.id === chosenHunt.id)?.name ?? null)
      : null;

  /*
   * ONE POST AT A TIME. There are two Post buttons now, the compose
   * step's and the preview's, and each AsyncButton only knows about its
   * own tap. The ref is what stops a tap on one, then Preview, then a
   * tap on the other from sending the same Flare twice; the state is
   * what holds Preview off while the post is in the air.
   */
  const postRunning = useRef(false);
  const [posting, setPosting] = useState(false);

  const post = async () => {
    if (postRunning.current || draft.items.length === 0) return;
    postRunning.current = true;
    setPosting(true);
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
          cardNote: item.cardNote?.trim() || null,
        })),
        hunt: draft.hunt?.kind === "existing" ? { id: draft.hunt.id } : null,
        /* No "Trade or cash" choice any more: the founder, "people can type
           that on their own. it will free up space." Every post is the plain
           default, open to trade, and a draft saved before still posts that. */
        acceptsTrade: true,
        acceptsCash: false,
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
      /* Only the cards that went up are drawn as posted. An older server
         that does not name them posted all or nothing. */
      const wentUp = result.postedCardIds ? new Set(result.postedCardIds) : null;
      const postedItems = wentUp
        ? draft.items.filter((item) => wentUp.has(item.cardId))
        : draft.items;
      /* Every card went up (or an older server, which posts all or
         nothing): the screen around may leave for the Feed at once. */
      const complete =
        result.total === undefined ||
        result.posted === undefined ||
        result.posted === result.total;
      const left = onPosted?.(
        postedItems.map((item) => ({
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
        complete,
        /* "2 of 3 went up": said on the Feed, where the post lands. */
        !complete && result.total !== undefined && result.posted !== undefined
          ? postSummary({
              total: result.total,
              posted: result.posted,
              alreadyUp: result.alreadyUp,
              failed: result.failed,
              atCap: result.atCap,
            })
          : null,
      );
      void loadHunts();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
      /* Gone to the Feed: no "Posted" panel behind it. The founder
         (2026-11-25): "when you post a flare, it should immediately
         automatically take you to the main feed with your flare there". */
      if (!left) setPosted({
        postId: result.postId ?? null,
        summary:
          result.total !== undefined && result.posted !== undefined
            ? postSummary({
                total: result.total,
                posted: result.posted,
                alreadyUp: result.alreadyUp,
                failed: result.failed,
                atCap: result.atCap,
              })
            : null,
      });
      setDraft(EMPTY);
      setPreviewing(false);
      setEditing(null);
      if (draftKey) void writeCache("composer", draftKey, EMPTY);
      cartSaved([]);
    } catch (caught) {
      const code = caught instanceof ApiError ? caught.code : "";
      setError(
        code === "at-cap"
          ? target.kind === "room"
            ? "You have as many Flares up in this room as it allows. Take one down first."
            : "You have too many Flares up. Take one down first."
          : code === "already-posted"
            ? "One of these cards is already up."
            : code === "hunt-name"
              ? "Name your hunt."
              : code === "objectionable"
                ? "That has words cardflare doesn't allow. Please change it."
              : code === "not-migrated"
                ? "Posting isn't switched on yet. The server needs its latest update."
                : `Could not post the Flare. ${friendlyError(caught)}`,
      );
    } finally {
      postRunning.current = false;
      setPosting(false);
    }
  };

  return (
    <ScrollView
      /* In the fitted sheet: exactly its contents' height, so the sheet
         sizes to it. Stacked over a card's sheet it otherwise took a
         shorter frame than the sheet and the foot was cut off. */
      style={inSheet ? { backgroundColor: "transparent", flexGrow: 0 } : undefined}
      scrollEnabled={!rearranging}
      contentContainerStyle={{
        paddingHorizontal: gutter,
        paddingVertical: spacing(4),
        gap: spacing(3),
        /* As a sheet (Compose) there is no tab bar under it, only the
           home indicator; as the tab, clear of the floating bar. */
        paddingBottom: spacing(4) + (inSheet ? insets.bottom : tabInset),
      }}
      keyboardShouldPersistTaps="handled"
      /* A touch anywhere, or a scroll, closes a Delete left showing on
         the Flares list (swipe-delete.tsx). */
      onTouchStart={(event) =>
        dismissSwipe(event.nativeEvent.pageX, event.nativeEvent.pageY)
      }
      onScrollBeginDrag={() => dismissSwipe()}
    >
      {/* The sheet's frosted glass, behind its contents (frosted.tsx).
          Inside the scroll, not around it: the fitted sheet measures the
          scroll view itself. Absolute, so it takes no place in the gap. */}
      {/* Run on past the contents, so the sheet's last strip under
          Preview is glass too. */}
      {inSheet ? <Frosted style={{ bottom: -600 }} /> : null}
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
          {posted.summary ? <Muted>{posted.summary}</Muted> : null}
          {/* No "See it in the Feed": a post goes to the Feed on its own
              (hub.tsx). The founder: "there is ZERO reason to have a 'see
              it in the feed' button". */}
          <Button
            label="Post another Flare"
            variant="secondary"
            onPress={() => setPosted(null)}
          />
        </Card>
      ) : (
        /* In the sheet the card's own box goes: its contents stand on
           the sheet's frosted glass (frosted.tsx). As the tab, a card. */
        <Card style={inSheet ? sheetCard : undefined}>
          {/*
           * No title, no "To friends", no steps and no "Cards in this
           * flare · 5 cards": the founder (2026-11-25), "this screen also
           * has too much text ... all of this information is conveyed
           * contextually". The bar above already says Post a Flare. Only
           * a room is named, since a Flare there goes on its board.
           */}
          {target.kind === "room" ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(1.5) }}>
              <Ionicons name="storefront-outline" size={14} color={colors.textSecondary} />
              <Muted>{`In room ${target.code}`}</Muted>
            </View>
          ) : null}

          {previewing ? (
            <FlareComposerPreview
              draft={draft}
              me={me}
              huntName={huntName}
              onBack={() => setPreviewing(false)}
              onPost={post}
              posting={posting}
              error={error}
            />
          ) : (
            <>
              {/* No hunt picker: a hunt is built from its own screen,
                  whose "+" opens this with the hunt set (AddingToHunt
                  says why). */}
              {draft.hunt?.kind === "existing" ? (
                <AddingToHunt name={huntName} onLeave={() => patch({ hunt: null })} />
              ) : null}

              {/* A whole deck at once, from the paste that used to live in
                  Settings. Only on an empty want: once cards are in, the
                  tray is the way. */}
              {draft.items.length === 0 && draft.intent === "want" ? (
                <Tap
                  accessibilityLabel="Paste a deck list"
                  onPress={() => navigation.navigate("DeckPaste")}
                >
                  <Text
                    style={{ color: colors.accent, fontWeight: "600", fontSize: 13 }}
                  >
                    Have a whole deck? Paste the list →
                  </Text>
                </Tap>
              ) : null}

              <CardTray
                items={draft.items.map((item) => ({
                  key: keyOf(item),
                  name: item.name,
                  imageUrl: artFor(item),
                  quantity: item.quantity,
                  /* Already out: the same card, and the same art or any. */
                  flared: item.printingId
                    ? artFlared(item.cardId, [item.printingId])
                    : cardFlared(item.cardId),
                }))}
                editing={editing}
                onEdit={(key) => setEditing(editing === key ? null : key)}
                onAdd={() => void addCards()}
                /* Drag replaced "Move left"/"Move right"; the arithmetic
                   is the same splice those buttons did. */
                onReorder={(from, to) => {
                  const next = [...draft.items];
                  const [moved] = next.splice(from, 1);
                  if (moved) next.splice(to, 0, moved);
                  setItems(next);
                }}
                /* Pulled out of the row: gone. It replaced the editor's
                   Remove button (card-tray.tsx). */
                onRearrange={setRearranging}
                onRemove={(index) => {
                  const gone = draft.items[index];
                  setItems(draft.items.filter((_, at) => at !== index));
                  if (gone && editing === keyOf(gone)) setEditing(null);
                }}
              />

              {editing && draft.items.some((item) => keyOf(item) === editing) ? (
                <CardOverlay onClose={() => setEditing(null)}>
                  {/* Swipe between the cards in this flare without
                      closing: the founder, "you should be able to swipe
                      between the cards so you don't have to tap out to go
                      to next card." Remounted when the order changes, so
                      it always opens on the card being edited. */}
                  <CardPager
                    key={draft.items.map(keyOf).join("|")}
                    count={draft.items.length}
                    index={draft.items.findIndex((item) => keyOf(item) === editing)}
                    onIndex={(index) => setEditing(keyOf(draft.items[index]))}
                    renderPage={(index) => {
                      const item = draft.items[index];
                      const key = keyOf(item);
                      return (
                        <CardEditor
                          onDone={() => setEditing(null)}
                          item={item}
                          intent={draft.intent}
                          onChange={(next) => {
                            /* A printing change re-keys the line; landing on
                               a line already there folds the two into one. */
                            const target = keyOf(next);
                            const twin = draft.items.find(
                              (entry) =>
                                keyOf(entry) === target && keyOf(entry) !== key,
                            );
                            if (twin) {
                              setItems(
                                draft.items
                                  .filter((entry) => keyOf(entry) !== key)
                                  .map((entry) =>
                                    keyOf(entry) === target
                                      ? {
                                          ...entry,
                                          quantity: Math.min(
                                            99,
                                            entry.quantity + next.quantity,
                                          ),
                                          /* Folding keeps a note: the twin's,
                                             or this one's. */
                                          cardNote: entry.cardNote || next.cardNote,
                                        }
                                      : entry,
                                  ),
                              );
                            } else {
                              setItems(
                                draft.items.map((entry) =>
                                  keyOf(entry) === key ? next : entry,
                                ),
                              );
                            }
                            setEditing(target);
                          }}
                        />
                      );
                    }}
                  />
                </CardOverlay>
              ) : null}

              <Input
                value={draft.caption}
                onChangeText={(caption) => patch({ caption })}
                placeholder="Caption (optional)"
                maxLength={CAPTION_MAX}
                multiline
                style={{ minHeight: 64, textAlignVertical: "top" }}
              />

              {/* Nearby matching rides with Local: off the screen entirely
                  while Local is off, the same rule the website's form
                  follows. See src/local-enabled.ts. */}
              {LOCAL_ENABLED && draftKey && draftKey !== "guest" ? <NearbyRow /> : null}

              <ErrorLine message={error} />
              {/* Post first, the one thing this screen is for; Preview
                  second and optional. The website's compose step has
                  the same two, in the same order, saying the same words. */}
              <AsyncButton
                label="Post flare"
                pendingLabel="Posting…"
                disabled={draft.items.length === 0 || posting}
                onPress={post}
              />
              <Button
                label="Preview"
                variant="secondary"
                disabled={draft.items.length === 0 || posting}
                onPress={() => {
                  setEditing(null);
                  setPreviewing(true);
                }}
              />
              {draft.items.length === 0 ? (
                <Muted>Add at least one card to post.</Muted>
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

    </ScrollView>
  );
}

/** Looking for | Offering, one answer for the whole post. */
/** The art for a tray tile: the chosen printing's, else the lead's. */
function artFor(item: DraftItem): string | null {
  if (item.printingId) {
    const chosen = item.printings.find((printing) => printing.id === item.printingId);
    if (chosen?.imageUrl) return chosen.imageUrl;
  }
  return item.imageUrl;
}

/**
 * One tray card, opened, kept to what a line needs: the founder, "it is
 * ALL over the place ... so much info", then "just the swipe is needed
 * on this screen". The art, large, with its name and art under it, and
 * how many copies; Done. Swipe to the next card. Each art is its own
 * card already (it came in as the art it was flared from), so there is
 * nothing to pick here. Order and removing live in the row: drag a card
 * to the front to make it the cover, onto the bin to remove it.
 */
function CardEditor({
  item,
  intent,
  onChange,
  onDone,
}: {
  item: DraftItem | null;
  intent: "want" | "showcase";
  onChange: (next: DraftItem) => void;
  onDone: () => void;
}) {
  if (!item) return null;

  /* One choice per picture: a foil and a normal sharing an image are
     one art (as on the card sheet's carousel). */
  const arts: { imageUrl: string; label: string; printingId: string }[] = [];
  for (const printing of item.printings) {
    if (!printing.imageUrl || arts.some((art) => art.imageUrl === printing.imageUrl)) continue;
    arts.push({
      imageUrl: printing.imageUrl,
      label: artName(printing.label),
      printingId: printing.id,
    });
  }
  const chosen = item.printingId
    ? item.printings.find((printing) => printing.id === item.printingId)
    : undefined;

  return (
    <View style={{ gap: spacing(4) }}>
      <View style={{ alignItems: "center", gap: spacing(2) }}>
        <CardImage
          imageUrl={artFor(item)}
          width={160}
          name={item.name}
          cardNumber={item.cardNumber}
        />
        <View style={{ alignItems: "center", gap: 2 }}>
          <Text
            numberOfLines={1}
            style={{ color: colors.textPrimary, fontWeight: "800", fontSize: 17 }}
          >
            {item.name}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>
            {[item.cardNumber, chosen ? artName(chosen.label) : arts.length > 1 ? "Any art" : null]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        </View>
      </View>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: spacing(2),
        }}
      >
        <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "600" }}>
          {intent === "want" ? "Copies" : "Copies available"}
        </Text>
        <Stepper
          value={item.quantity}
          min={1}
          max={99}
          onChange={(quantity) => onChange({ ...item, quantity })}
          label={intent === "want" ? "copies needed" : "copies available"}
        />
      </View>

      <Button label="Done" onPress={onDone} />
    </View>
  );
}

/**
 * A printing's art in a word or two, the card sheet's names: "Alt Art",
 * "Foil", "Third Anniversary". The search's label is the whole line
 * ("OP12 · Super Rare · Alt Art · Super Rare · altArt"); its last piece
 * is the art's own name when it has one.
 */
export function artName(label: string | null): string {
  /* Already a name ("Alt Art", from a card sheet's carousel). */
  if (label && !label.includes("·") && /^[A-Z]/.test(label)) return label;
  const last = (label ?? "").split("·").pop()?.trim() ?? "";
  if (!/^[a-z][A-Za-z0-9]*$/.test(last)) return "Standard";
  return last.replace(/([a-z])([A-Z0-9])/g, "$1 $2").replace(/^./, (first) => first.toUpperCase());
}


/**
 * The cards in this flare, side by side in the overlay, one page each:
 * swipe to the next without closing. Dots under them say where you are.
 */
function CardPager({
  count,
  index,
  onIndex,
  renderPage,
}: {
  count: number;
  index: number;
  onIndex: (index: number) => void;
  renderPage: (index: number) => ReactNode;
}) {
  const { width } = useWindowDimensions();
  /* The overlay's panel: the window less its margins and its border. */
  const page = width - spacing(4) * 2 - 2;
  const [at, setAt] = useState(index);
  const rail = useRef<ScrollView>(null);
  /* Only a swipe the player made moves the card; the jump to the
     opening card below is not one, and must not report page 0. */
  const dragged = useRef(false);
  return (
    <View>
      <ScrollView
        ref={rail}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        /* Open on the card that was tapped, once there is a width to
           scroll by: contentOffset alone is dropped before layout. */
        onLayout={() => rail.current?.scrollTo({ x: index * page, animated: false })}
        onScrollBeginDrag={() => {
          dragged.current = true;
        }}
        onMomentumScrollEnd={(event) => {
          if (!dragged.current) return;
          dragged.current = false;
          const next = Math.round(event.nativeEvent.contentOffset.x / page);
          if (next < 0 || next >= count || next === at) return;
          setAt(next);
          onIndex(next);
        }}
      >
        {Array.from({ length: count }, (_, page_) => (
          <View key={page_} style={{ width: page, padding: spacing(4) }}>
            {renderPage(page_)}
          </View>
        ))}
      </ScrollView>
      {count > 1 ? (
        <View
          accessibilityLabel={`Card ${at + 1} of ${count}`}
          style={{
            flexDirection: "row",
            justifyContent: "center",
            gap: spacing(1.5),
            paddingBottom: spacing(4),
          }}
        >
          {Array.from({ length: count }, (_, dot) => (
            <View
              key={dot}
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: dot === at ? colors.accent : colors.borderStrong,
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * A card being edited, lifted out of the form: the page fades and blurs
 * behind it, and the card's own choices - printing, copies, its note,
 * cover, remove - are all here and nowhere else. The founder: "if you
 * click on the card itself, it like fades into an overlay and blurs the
 * background behind it ... in there is where you'll change quantity,
 * printing, etc. because currently, having a text box, then another
 * text box right below is quite confusing." The editor used to open
 * inline above the caption. The website's composer does the same in
 * its sheet.
 */
function CardOverlay({
  onClose,
  children,
}: {
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <SheetBackdrop />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable
          onPress={onClose}
          style={{ flex: 1, justifyContent: "center", padding: spacing(4) }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              maxHeight: "90%",
              borderRadius: radius.card,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              overflow: "hidden",
            }}
          >
            <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
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
  posting,
  error,
}: {
  draft: Draft;
  me: Me | null;
  huntName: string | null;
  onBack: () => void;
  onPost: () => Promise<void>;
  /** The post is in the air, whichever Post button sent it. */
  posting: boolean;
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
    acceptsTrade: true,
    acceptsCash: false,
    note: draft.caption.trim() || null,
    offers: 0,
    hunt:
      draft.intent === "want" && huntName
        ? {
            id: draft.hunt?.id ?? "preview",
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
      cardNote: entry.cardNote?.trim() || null,
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
        /* Your own post, not yet posted: nothing to pick, nowhere to keep it. */
        picks={{}}
        onPicks={() => undefined}
      />
      <ErrorLine message={error} />
      {/* Post first, then the way back: the order the compose step and
          the website's preview both use. Both wait while a post is in
          the air, as the website's do. */}
      <AsyncButton
        label="Post flare"
        pendingLabel="Posting…"
        disabled={posting}
        onPress={onPost}
      />
      <Button
        label="Back to editing"
        variant="secondary"
        disabled={posting}
        onPress={onBack}
      />
    </View>
  );
}

/** The composer's card, in the sheet: no fill, no border, no padding. */
const sheetCard = {
  backgroundColor: "transparent",
  borderWidth: 0,
  paddingHorizontal: 0,
} as const;
