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
  answerThreadTrade,
  blockPlayer,
  proposeThreadTrade,
  readLocalThread,
  sendLocalMessage,
  THREAD_TRADE_QUANTITY_MAX,
  threadTradeFailureMessage,
  type LocalThreadMessage,
  type MeetSuggestion,
  type ThreadTrade,
} from "../api";
import {
  CardPicker,
  DirectionToggle,
  PickedCardRow,
  type PickedCard,
} from "../card-picker";
import { MESSAGE_MAX_LENGTH, agoLabel } from "../local-shared";
import { meetLine, suggestText } from "../meet";
import { ReportSheet, type ReportTarget } from "../report-sheet";
import { Stepper } from "../stepper";
import { Ionicons } from "@expo/vector-icons";
import { colors, gutter, spacing } from "../theme";
import { AsyncButton, Button, ErrorLine, Input, Loading, Muted, Tap } from "../ui";

/**
 * One conversation: about a Flare, a saved want, or, since a profile
 * grew a Message button, about nothing in particular. The header is
 * the person's name; the "About <card>" strip is drawn only when the
 * thread has a card, and a direct message never does.
 *
 * Loaded fresh on focus — reading is the receipt that marks the other
 * side's messages read and clears the inbox notice — and reloaded after
 * every send. No live socket in v1: a conversation about meeting at a
 * store moves at minutes, not milliseconds, and pull-to-refresh is the
 * honest version of realtime until there is one.
 *
 * "We traded" lives here too, since round 8. Either side says it, the
 * other side is asked, and the second tap pays both Embers under the
 * room's rules. The website's ThreadView draws the same three states
 * in the same words: the button and its form, "You said you traded",
 * and "<name> says you traded" with Yes and No.
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
  const [meet, setMeet] = useState<MeetSuggestion | null>(null);
  const [withPlayerId, setWithPlayerId] = useState<string | null>(null);
  /* Set once a block from this screen has landed. */
  const [blocked, setBlocked] = useState(false);
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
  /* "Report", beside Block: the conversation itself, so the
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

  const load = useCallback(
    async (isCurrent: () => boolean = () => true) => {
      try {
        const thread = await readLocalThread(threadId);
        if (!isCurrent()) return;
        if (!thread.ok) {
          navigation.goBack();
          return;
        }
        setMessages(thread.messages);
        setWithName(thread.withName);
        setCardName(thread.cardName);
        setMeet(thread.meet ?? null);
        setWithPlayerId(thread.withPlayerId ?? null);
        /* An older server does not say what the thread is about; one
           with a card name is read as a thread about that card. */
        setKind(thread.kind ?? (thread.cardName ? "flare" : "direct"));
        setTrade(thread.trade ?? null);
        navigation.setOptions({ title: thread.withName ?? "Conversation" });
      } catch {
        if (isCurrent()) setError("Could not load the conversation.");
      }
    },
    [threadId, navigation],
  );

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
    const body = draft.trim();
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
    } catch {
      setError("Could not send that.");
    }
  };

  /*
   * Block, where "End conversation" used to be. Conversations do not
   * end now, the way a DM does not; the block is how somebody is
   * stopped, with the profile's own words and the profile's confirm.
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
          gap: spacing(2),
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
        renderItem={({ item }) => (
          <View
            style={{
              maxWidth: "85%",
              alignSelf: item.yours ? "flex-end" : "flex-start",
              backgroundColor: item.yours ? colors.accent : colors.elevated,
              borderRadius: 12,
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
            <Text
              style={{
                color: item.yours ? colors.accentContrast : colors.textMuted,
                opacity: item.yours ? 0.7 : 1,
                fontSize: 10,
                marginTop: 2,
              }}
            >
              {agoLabel(item.sentAt)}
            </Text>
          </View>
        )}
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
        ) : (
          <>
            {/* Somewhere public to meet, suggested rather than asked for:
                a store, never an address. The website's chip. */}
            {meet ? (
              <View
                style={{
                  gap: spacing(2),
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: colors.border,
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
                  <Ionicons name="storefront-outline" size={16} color={colors.accent} />
                  <Text
                    style={{
                      color: colors.textPrimary,
                      fontWeight: "600",
                      fontSize: 13,
                    }}
                  >
                    Meet somewhere public
                  </Text>
                </View>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                  {meetLine(meet)}
                </Text>
                <View style={{ alignSelf: "flex-start" }}>
                  <Button
                    label={`Suggest ${meet.storeName}`}
                    variant="secondary"
                    onPress={() => setDraft((current) => suggestText(current, meet))}
                  />
                </View>
              </View>
            ) : null}
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
                <Input
                  value={draft}
                  onChangeText={setDraft}
                  multiline
                  maxLength={MESSAGE_MAX_LENGTH}
                  placeholder="Message"
                />
              </View>
              <AsyncButton label="Send" pendingLabel="Sending…" onPress={send} />
            </View>
            <ErrorLine message={error} />
            {/* The last trade this conversation settled, in one line. */}
            {settledLine ? <Muted>{settledLine}</Muted> : null}
            {/* "We traded", opened: the form sits where the button was.
                A Flare or a want names its card; a direct message asks
                for one, and which way it went. */}
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
            <View style={{ flexDirection: "row", gap: spacing(2) }}>
              {/* "We traded" leads the row, unless a trade is already
                  waiting on an answer or the form is open above. */}
              {!tradePending && !tradeOpen ? (
                <Button
                  label="We traded"
                  variant="secondary"
                  onPress={() => {
                    setTradeError(null);
                    setTradeOpen(true);
                  }}
                />
              ) : null}
              {withPlayerId ? (
                <Button label="Block" variant="secondary" onPress={block} />
              ) : null}
              <Button
                label="Report"
                variant="secondary"
                onPress={() => setReport({ kind: "thread", targetId: threadId })}
              />
            </View>
          </>
        )}
      </View>
      <ReportSheet target={report} onClose={() => setReport(null)} />
    </KeyboardAvoidingView>
  );
}
