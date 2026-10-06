import { HeaderButton } from "../header";
import { useHeaderHeight } from "@react-navigation/elements";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { StackParams } from "../../App";
import {
  ApiError,
  answerThreadTrade,
  blockPlayer,
  proposeThreadTrade,
  readLocalThread,
  sendLocalMessage,
  THREAD_TRADE_QUANTITY_MAX,
  threadTradeFailureMessage,
  type LocalThreadMessage,
  type ThreadTrade,
} from "../api";
import { cachedPlayerId, readCache, writeCache } from "../cache";

/** One read of a conversation, as the server sends it and the disk keeps it. */
type ThreadRead = Awaited<ReturnType<typeof readLocalThread>>;
import { ActionSheet, type ActionItem } from "../action-menu";
import {
  CardPicker,
  DirectionToggle,
  PickedCardRow,
  type PickedCard,
} from "../card-picker";
import { chatTimeLine } from "../chat-time";
import { MESSAGE_MAX_LENGTH } from "../local-shared";
import { COMPOSER_MAX_LINES, messageRuns, tidyMessage } from "../message-runs";
import { PlayerAvatar } from "../player-avatar";
import { RemoteImage } from "../remote-image";
import { ReportSheet, type ReportTarget } from "../report-sheet";
import { Stepper } from "../stepper";
import { Ionicons } from "@expo/vector-icons";
import { colors, gutter, spacing } from "../theme";
import { AsyncButton, ErrorLine, Input, Loading, Muted, Tap } from "../ui";

/**
 * One conversation: about a Flare, a saved want, or, since a profile
 * grew a Message button, about nothing in particular. The header is
 * Instagram's: the back chevron, their face, their name with the
 * @handle under it (both opening their profile), and a small "⋯" at
 * the right holding View profile, We traded, Report and Block. The
 * founder did not want Block and Report as massive buttons in the
 * chat. The "About <card>" strip is drawn only when the thread has a
 * card, and a direct message never does.
 *
 * Loaded fresh on focus — reading is the receipt that marks the other
 * side's messages read and clears the inbox notice — and reloaded after
 * every send. No live socket in v1: a conversation about meeting at a
 * store moves at minutes, not milliseconds, and pull-to-refresh is the
 * honest version of realtime until there is one.
 *
 * "We traded" lives here too, since round 8, opened from the "⋯" menu
 * since round 16. Either side says it, the other side is asked, and the
 * second tap pays both Embers under the room's rules. The website's
 * ThreadView draws the same three states in the same words: the form,
 * "You said you traded", and "<name> says you traded" with Yes and No.
 *
 * Messages are drawn the way messageRuns says (src/message-runs.ts,
 * the website's twin): their face once per run, beside its last
 * message, never your own; a run drawn close together; a time line
 * only at the start and after a pause.
 */
type ThreadKind = "flare" | "want" | "direct";

/** What a settled trade reads as, in one muted line, or null while open. */
function settledTradeLine(trade: ThreadTrade, withName: string): string | null {
  switch (trade.status) {
    case "confirmed":
      return `Traded ${trade.cardName}. Both confirmed.`;
    case "late":
      return `Traded ${trade.cardName}. ${withName} never confirmed.`;
    case "declined":
      return trade.saidByYou
        ? `${withName} said that trade did not happen.`
        : "You said that trade did not happen.";
    default:
      return null;
  }
}

export function ThreadScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const route = useRoute<RouteProp<StackParams, "LocalThread">>();
  const { threadId } = route.params;

  const [messages, setMessages] = useState<LocalThreadMessage[] | null>(null);
  const [withName, setWithName] = useState<string | null>(null);
  const [cardName, setCardName] = useState<string | null>(null);
  const [withPlayerId, setWithPlayerId] = useState<string | null>(null);
  /* Their face, kept for the messages: drawn beside the last of each
     of their runs. */
  const [withAvatarUrl, setWithAvatarUrl] = useState<string | null>(null);
  /* The header's "⋯", open or not. */
  const [menuOpen, setMenuOpen] = useState(false);
  /* Set once a block from this screen has landed. */
  const [blocked, setBlocked] = useState(false);
  /* The server's word that a block stands between the two, either way
     round, or a send refused for one: the composer gives way to a
     plain line instead of a generic "Could not send that." */
  const [closed, setClosed] = useState(false);
  const [kind, setKind] = useState<ThreadKind>("direct");
  const [trade, setTrade] = useState<ThreadTrade | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  /* "We traded": the form, open or not, and what it holds. The card
     and the direction only matter on a direct message; a Flare or a
     want names its own card. */
  const [tradeOpen, setTradeOpen] = useState(false);
  const [tradeCard, setTradeCard] = useState<PickedCard | null>(null);
  const [tradeDirection, setTradeDirection] = useState<"got" | "gave">("got");
  const [tradeQuantity, setTradeQuantity] = useState(1);
  const [tradeError, setTradeError] = useState<string | null>(null);
  /* "Report", in the "⋯" menu: the conversation itself, so the
     admins can read it. The same sheet a post and a profile open. */
  const [report, setReport] = useState<ReportTarget | null>(null);
  const list = useRef<FlatList<LocalThreadMessage>>(null);

  /*
   * How far down the screen this view starts. KeyboardAvoidingView
   * measures its own frame with onLayout, which is RELATIVE TO ITS
   * PARENT, so a screen sitting under a navigation header reads its own
   * top as zero and pads the keyboard by exactly the header's height too
   * little. The offset is the correction, and it is the header's real
   * height — 88 was the pre-notch guess, and on every modern iPhone it
   * left the composer's last row buried under the keyboard.
   */
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();

  /* The home indicator's strip is ours to leave clear — but only while
     the keyboard is down, because the keyboard covers it itself and the
     inset would then read as a gap floating over the keys. */
  const [keyboardUp, setKeyboardUp] = useState(false);
  useEffect(() => {
    const shown = Keyboard.addListener("keyboardWillShow", () => {
      setKeyboardUp(true);
      /* The list loses height as the keyboard takes the bottom of the
         screen, and a FlatList keeps its offset — so the newest message
         slides in behind the composer unless it is followed down. */
      requestAnimationFrame(() => list.current?.scrollToEnd({ animated: true }));
    });
    const hidden = Keyboard.addListener("keyboardWillHide", () => setKeyboardUp(false));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  /* Set once a fresh read has painted, so a slow disk read never paints
     an older conversation over it. */
  const fresh = useRef(false);

  /*
   * The conversation as last seen, painted at once. The founder:
   * "messages takes a second to load too. please make sure that stays
   * cached". Each conversation is kept on disk by its id; the fresh read
   * lands over it, new messages and all.
   */
  useEffect(() => {
    let live = true;
    void (async () => {
      const playerId = await cachedPlayerId();
      if (!playerId) return;
      const cached = await readCache<ThreadRead>("thread", playerId, threadId);
      if (live && cached?.ok && !fresh.current) apply(cached);
    })();
    return () => {
      live = false;
    };
    // `apply` is stable for a thread; the read is once per thread.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  const load = useCallback(
    async (isCurrent: () => boolean = () => true) => {
      try {
        const thread = await readLocalThread(threadId);
        if (!isCurrent()) return;
        if (!thread.ok) {
          navigation.goBack();
          return;
        }
        fresh.current = true;
        apply(thread);
        const playerId = await cachedPlayerId();
        if (playerId) void writeCache("thread", playerId, thread, threadId);
      } catch {
        if (isCurrent()) setError("Could not load the conversation.");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [threadId, navigation],
  );

  /** Draws a conversation, fresh or from disk, the same way. */
  function apply(thread: ThreadRead) {
        setMessages(thread.messages);
        setWithName(thread.withName);
        setCardName(thread.cardName);
        setWithPlayerId(thread.withPlayerId ?? null);
        setWithAvatarUrl(thread.withAvatarUrl ?? null);
        /* An older server does not say what the thread is about; one
           with a card name is read as a thread about that card. */
        setKind(thread.kind ?? (thread.cardName ? "flare" : "direct"));
        setTrade(thread.trade ?? null);
        setClosed(thread.blocked ?? false);
        /* Instagram's header: their face, their name with the @handle
           under it, all of it opening their profile; the conversation
           is the person. The "⋯" at the right holds the rest. */
        const title = thread.withName ?? "Conversation";
        const otherId = thread.withPlayerId ?? null;
        const face = thread.withAvatarUrl ?? null;
        navigation.setOptions({
          title,
          headerTitle: () => (
            <ThreadHeader
              name={title}
              handle={thread.withHandle ?? null}
              playerId={otherId}
              avatarUrl={face}
              onOpen={
                otherId
                  ? () => navigation.navigate("PlayerProfile", { playerId: otherId })
                  : undefined
              }
            />
          ),
          headerRight: () => (
            <HeaderButton
              icon="ellipsis-horizontal"
              label="More"
              onPress={() => setMenuOpen(true)}
            />
          ),
        });
  }

  useFocusEffect(
    useCallback(() => {
      let current = true;
      void load(() => current);
      return () => {
        current = false;
      };
    }, [load]),
  );

  const send = async () => {
    /* Blank lines piled at either end go; nothing left, nothing sent. */
    const body = tidyMessage(draft);
    if (!body) return;
    setError(null);
    try {
      const result = await sendLocalMessage(threadId, body);
      if (!result.ok) {
        setError("Could not send that.");
        return;
      }
      setDraft("");
      await load();
      list.current?.scrollToEnd({ animated: true });
    } catch (caught) {
      /* A 409 "closed" is a block, either way round: say so plainly. */
      if (caught instanceof ApiError && caught.code === "closed") {
        setClosed(true);
        return;
      }
      setError("Could not send that.");
    }
  };

  /*
   * Block, in the "⋯" menu. Conversations do not end, the way a DM
   * does not; the block is how somebody is stopped, with the profile's
   * own words and the profile's confirm.
   */
  const block = () => {
    if (!withPlayerId) return;
    const name = withName ?? "them";
    Alert.alert(
      `Block ${name}?`,
      "You will not see their posts, and neither of you can message the other. They are not told.",
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: () => {
            void blockPlayer(withPlayerId)
              .then(() => setBlocked(true))
              .catch(() => setError("Could not block them. Try again in a moment."));
          },
        },
      ],
    );
  };

  const closeTradeForm = () => {
    setTradeOpen(false);
    setTradeCard(null);
    setTradeDirection("got");
    setTradeQuantity(1);
    setTradeError(null);
  };

  /* "Mark as traded": one side's word, waiting for the other's. */
  const markTraded = async () => {
    setTradeError(null);
    if (kind === "direct" && !tradeCard) {
      setTradeError("Pick a card from the list.");
      return;
    }
    try {
      await proposeThreadTrade(
        threadId,
        kind === "direct" && tradeCard
          ? {
              cardId: tradeCard.hit.id,
              printingId: tradeCard.printingId,
              quantity: tradeQuantity,
              got: tradeDirection === "got",
            }
          : { quantity: tradeQuantity },
      );
    } catch (caught) {
      setTradeError(threadTradeFailureMessage(caught));
      return;
    }
    closeTradeForm();
    await load();
  };

  /* The other side's answer. Yes is the second hand on the trade. */
  const answerTrade = async (yes: boolean) => {
    if (!trade) return;
    setTradeError(null);
    try {
      await answerThreadTrade(threadId, trade.id, yes ? "yes" : "no");
    } catch (caught) {
      setTradeError(threadTradeFailureMessage(caught));
      return;
    }
    await load();
  };

  const otherName = withName ?? "They";
  const tradePending = trade?.status === "pending";
  const settledLine =
    trade && !tradePending ? settledTradeLine(trade, otherName) : null;

  /* The header's "⋯": View profile, We traded, Report, Block. We traded
     goes while a trade waits on an answer or the form is already open;
     Block goes once it has landed, and with it the chance to trade. */
  const menuItems: ActionItem[] = [
    ...(withPlayerId
      ? [
          {
            key: "profile",
            label: "View profile",
            icon: "person-circle-outline" as const,
            onPress: () =>
              navigation.navigate("PlayerProfile", { playerId: withPlayerId }),
          },
        ]
      : []),
    ...(!blocked && !closed && !tradePending && !tradeOpen
      ? [
          {
            key: "traded",
            label: "We traded",
            icon: "swap-horizontal" as const,
            onPress: () => {
              setTradeError(null);
              setTradeOpen(true);
            },
          },
        ]
      : []),
    {
      key: "report",
      label: "Report",
      icon: "flag-outline" as const,
      onPress: () => setReport({ kind: "thread", targetId: threadId }),
    },
    ...(withPlayerId && !blocked
      ? [
          {
            key: "block",
            label: "Block",
            icon: "ban-outline" as const,
            onPress: block,
          },
        ]
      : []),
  ];

  const runs = messageRuns(messages ?? []);
  /* Line height of the composer's text, and the box's cap: five lines,
     then it scrolls inside rather than climbing up the screen. */
  const composerLine = 20;
  const composerMax = COMPOSER_MAX_LINES * composerLine + spacing(3) * 2 + 2;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.canvas }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? headerHeight : 0}
    >
      {/* The card, when there is one. A direct message has none and
          gets no strip rather than "About null". */}
      {cardName ? (
        <View
          style={{
            paddingHorizontal: gutter,
            paddingVertical: spacing(2),
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <Muted>About {cardName}</Muted>
        </View>
      ) : null}

      <FlatList
        ref={list}
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: gutter,
          paddingVertical: spacing(4),
        }}
        data={messages ?? []}
        keyExtractor={(message) => message.id}
        /* A conversation opens on its newest message, not its oldest.
           The website gets this from the page scrolling to its own end;
           a fixed-height list has to be told. */
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          messages === null ? (
            <Loading />
          ) : (
            <Text
              style={{
                color: colors.textMuted,
                textAlign: "center",
                paddingVertical: spacing(8),
              }}
            >
              No messages yet.
            </Text>
          )
        }
        renderItem={({ item, index }) => {
          const flags = runs[index] ?? {
            showTime: true,
            showFace: !item.yours,
            joinsNext: false,
          };
          const itemCards =
            item.cards && item.cards.length > 0
              ? item.cards
              : item.card
                ? [item.card]
                : [];
          return (
            <View style={{ marginBottom: flags.joinsNext ? 2 : spacing(3) }}>
              {/* A time line where the talk started or picked up again
                  after a pause, centred, the way Instagram stamps it. */}
              {flags.showTime ? (
                <Text
                  style={{
                    color: colors.textMuted,
                    fontSize: 11,
                    fontWeight: "600",
                    textAlign: "center",
                    marginBottom: spacing(2),
                  }}
                >
                  {chatTimeLine(item.sentAt)}
                </Text>
              ) : null}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "flex-end",
                  justifyContent: item.yours ? "flex-end" : "flex-start",
                  gap: spacing(2),
                }}
              >
                {/* Their face, once per run, beside its last message.
                    The slot is kept on the others so a run's bubbles
                    line up; your own face is never drawn. */}
                {!item.yours ? (
                  <View style={{ width: 24, height: 24 }}>
                    {flags.showFace ? (
                      <PlayerAvatar
                        displayName={withName ?? "Player"}
                        seed={withPlayerId ?? threadId}
                        avatarUrl={withAvatarUrl}
                        size={24}
                      />
                    ) : null}
                  </View>
                ) : null}
                <View
                  style={{
                    maxWidth: "80%",
                    alignItems: item.yours ? "flex-end" : "flex-start",
                    gap: spacing(1),
                  }}
                >
                  {/* The cards a message is about ("I have this", a nearby
                      match, an offer on a binder), on the sender's side just
                      above the words, so "I have this one" reads as being
                      about that card. An offer on a binder carries several:
                      each its own bubble, stacked. An older server sends
                      only `card`. */}
                  {itemCards.map((card, cardIndex) => (
                    <CardBubble
                      key={`${card.cardId}-${cardIndex}`}
                      card={card}
                      onOpen={(cardId) => navigation.navigate("Card", { cardId })}
                    />
                  ))}
                  <View
                    style={{
                      backgroundColor: item.yours ? colors.accent : colors.elevated,
                      borderRadius: 18,
                      paddingHorizontal: spacing(3),
                      paddingVertical: spacing(2),
                    }}
                  >
                    <Text
                      style={{
                        color: item.yours ? colors.accentContrast : colors.textPrimary,
                        fontSize: 15,
                      }}
                    >
                      {item.body}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          );
        }}
      />

      <View
        style={{
          padding: spacing(3),
          paddingBottom: spacing(3) + (keyboardUp ? 0 : insets.bottom),
          gap: spacing(2),
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}
      >
        {blocked ? (
          <Muted>Blocked. Neither of you can message the other.</Muted>
        ) : closed ? (
          <Muted>You can't message this person.</Muted>
        ) : (
          <>
            {/* The trade, when one is open: what you said, waiting on
                them, or what they said, waiting on you. The website's
                Handshake card. */}
            {trade && tradePending ? (
              <View
                style={{
                  gap: spacing(2),
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: colors.accentMuted,
                  backgroundColor: colors.elevated,
                  padding: spacing(3),
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing(2),
                  }}
                >
                  <Ionicons name="swap-horizontal" size={16} color={colors.accent} />
                  <Text
                    style={{
                      flex: 1,
                      color: colors.textPrimary,
                      fontWeight: "600",
                      fontSize: 13,
                    }}
                  >
                    {trade.saidByYou
                      ? `You said you traded ${trade.cardName}.`
                      : `${otherName} says you traded ${trade.cardName}.`}
                  </Text>
                </View>
                {trade.saidByYou ? (
                  <Muted>
                    Waiting for {otherName} to confirm. Then you both earn Embers.
                  </Muted>
                ) : (
                  <>
                    {trade.quantity > 1 ? (
                      <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                        {trade.quantity} copies
                      </Text>
                    ) : null}
                    <View style={{ flexDirection: "row", gap: spacing(2) }}>
                      <AsyncButton
                        label="Yes, we did"
                        pendingLabel="Confirming…"
                        onPress={() => answerTrade(true)}
                      />
                      <AsyncButton
                        label="No"
                        pendingLabel="No"
                        variant="secondary"
                        onPress={() => answerTrade(false)}
                      />
                    </View>
                    <Muted>Yes pays you both Embers.</Muted>
                  </>
                )}
                <ErrorLine message={tradeError} />
              </View>
            ) : null}
            <View
              style={{ flexDirection: "row", alignItems: "flex-end", gap: spacing(2) }}
            >
              <View style={{ flex: 1 }}>
                {/* Grows with what is typed up to five lines, then scrolls
                    inside: it used to climb the screen with every Return. */}
                <Input
                  value={draft}
                  onChangeText={setDraft}
                  multiline
                  scrollEnabled
                  maxLength={MESSAGE_MAX_LENGTH}
                  placeholder="Message"
                  style={{ lineHeight: composerLine, maxHeight: composerMax }}
                />
              </View>
              <AsyncButton label="Send" pendingLabel="Sending…" onPress={send} />
            </View>
            <ErrorLine message={error} />
            {/* The last trade this conversation settled, in one line. */}
            {settledLine ? <Muted>{settledLine}</Muted> : null}
            {/* "We traded", opened from the "⋯" menu: the form sits
                under the composer. A Flare or a want names its card; a
                direct message asks for one, and which way it went. */}
            {tradeOpen ? (
              <View
                style={{
                  gap: spacing(3),
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.elevated,
                  padding: spacing(3),
                }}
              >
                {kind === "direct" ? (
                  <>
                    {tradeCard ? (
                      <PickedCardRow
                        card={tradeCard}
                        onChange={() => setTradeCard(null)}
                      />
                    ) : (
                      <CardPicker
                        onPick={(hit, printingId) => setTradeCard({ hit, printingId })}
                      />
                    )}
                    <DirectionToggle
                      value={tradeDirection}
                      onChange={setTradeDirection}
                      labels={{ got: "I got it", gave: "I gave it" }}
                    />
                  </>
                ) : (
                  <Text
                    style={{
                      color: colors.textPrimary,
                      fontWeight: "600",
                      fontSize: 14,
                    }}
                  >
                    Traded: {cardName}
                  </Text>
                )}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Text
                    style={{
                      color: colors.textPrimary,
                      fontWeight: "700",
                      fontSize: 13,
                    }}
                  >
                    Copies
                  </Text>
                  <Stepper
                    value={tradeQuantity}
                    min={1}
                    max={THREAD_TRADE_QUANTITY_MAX}
                    onChange={setTradeQuantity}
                    label="copies"
                  />
                </View>
                <Muted>They confirm on their side and you both earn Embers.</Muted>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing(3),
                  }}
                >
                  <AsyncButton
                    label="Mark as traded"
                    pendingLabel="Marking…"
                    onPress={markTraded}
                  />
                  <Tap onPress={closeTradeForm} hitSlop={6} accessibilityLabel="Cancel">
                    <Text
                      style={{ color: colors.accent, fontWeight: "700", fontSize: 13 }}
                    >
                      Cancel
                    </Text>
                  </Tap>
                </View>
                <ErrorLine message={tradeError} />
              </View>
            ) : null}
          </>
        )}
      </View>
      <ActionSheet
        items={menuOpen ? menuItems : null}
        onClose={() => setMenuOpen(false)}
      />
      <ReportSheet target={report} onClose={() => setReport(null)} />
    </KeyboardAvoidingView>
  );
}

/**
 * The header, Instagram's: their face, their name with the @handle
 * under it, and a tap on any of it opens their profile.
 */
function ThreadHeader({
  name,
  handle,
  playerId,
  avatarUrl,
  onOpen,
}: {
  name: string;
  handle: string | null;
  playerId: string | null;
  avatarUrl: string | null;
  onOpen?: () => void;
}) {
  const row = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}>
      {playerId ? (
        <PlayerAvatar
          displayName={name}
          seed={playerId}
          avatarUrl={avatarUrl}
          size={32}
        />
      ) : null}
      <View style={{ flexShrink: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{
            color: colors.textPrimary,
            fontSize: 16,
            fontWeight: "600",
          }}
        >
          {name}
        </Text>
        {handle ? (
          <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 12 }}>
            @{handle}
          </Text>
        ) : null}
      </View>
    </View>
  );
  if (!onOpen) return row;
  return (
    <Tap onPress={onOpen} accessibilityLabel={`Open ${name}'s profile`}>
      {row}
    </Tap>
  );
}

/** The card a message carries, small, opening the card's page. */
function CardBubble({
  card,
  onOpen,
}: {
  card: NonNullable<LocalThreadMessage["card"]>;
  onOpen: (cardId: string) => void;
}) {
  return (
    <Tap onPress={() => onOpen(card.cardId)} accessibilityLabel={`Open ${card.name}`}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing(2),
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.elevated,
          padding: spacing(2),
        }}
      >
        <View
          style={{
            width: 44,
            aspectRatio: 60 / 84,
            borderRadius: 4,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.elevated,
            overflow: "hidden",
          }}
        >
          {card.imageUrl ? (
            <RemoteImage
              uri={card.imageUrl}
              style={{ width: "100%", height: "100%" }}
            />
          ) : null}
        </View>
        <View style={{ flexShrink: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={{ color: colors.textPrimary, fontWeight: "600", fontSize: 14 }}
          >
            {card.name}
          </Text>
          <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 12 }}>
            {card.number}
          </Text>
        </View>
      </View>
    </Tap>
  );
}
