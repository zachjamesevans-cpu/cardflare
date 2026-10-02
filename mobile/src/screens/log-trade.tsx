import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";

import type { StackParams } from "../../App";
import {
  ApiError,
  describeError,
  getMe,
  logTrade,
  searchPlayersByName,
  type FoundPlayer,
} from "../api";
import {
  CardPicker,
  DirectionToggle,
  PickedCardRow,
  pickRow,
  type PickedCard,
} from "../card-picker";
import { formatHandle } from "../handle";
import { PlayerAvatar } from "../player-avatar";
import { Stepper } from "../stepper";
import { colors, gutter, radius, spacing } from "../theme";
import { AsyncButton, Card, ErrorLine, Input, Muted, Tap } from "../ui";

/**
 * Writing down a trade made off CardFlare: the website's "Log a trade"
 * sheet, as a screen.
 *
 * The founder: "allow me to enter my own trades. Like if I did
 * something off of CardFlare." A logged trade is the player's own
 * word: one card, which way it went, who with, where and when, and a
 * note. It earns no Embers, because nobody else confirmed it, and only
 * its author ever reads it.
 *
 * The limits mirror the website's logged trade schema (src/lib/trades)
 * by hand. The app cannot import across the boundary, and the server
 * holds the form to the real rules whatever this screen allows; these
 * only keep a long note from being typed and then refused.
 */
export const LOGGED_PARTNER_MAX = 60;
export const LOGGED_PLACE_MAX = 80;
export const LOGGED_NOTE_MAX = 140;
export const LOGGED_QUANTITY_MAX = 99;

/** Today as "YYYY-MM-DD" in the reader's own clock. */
export function todayISO(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Yesterday, the same way. */
function yesterdayISO(): string {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return todayISO(date);
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** What the server said, in words the form can show. */
function failureMessage(caught: unknown): string {
  if (caught instanceof ApiError) {
    /* A 400 carries the rule it broke as `error`, already written for
       the person: "Pick a card from the list.", "A trade cannot be in
       the future." */
    if (caught.status === 400) return caught.code;
    if (caught.status === 403 && caught.code === "locked") {
      return "Trade history is part of cardflare Pro.";
    }
  }
  return `Could not log that (${describeError(caught)}).`;
}

export function LogTradeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();

  const [direction, setDirection] = useState<"got" | "gave">("got");
  const [card, setCard] = useState<PickedCard | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [partnerName, setPartnerName] = useState("");
  const [partner, setPartner] = useState<FoundPlayer | null>(null);
  const [place, setPlace] = useState("");
  const [tradedOn, setTradedOn] = useState(todayISO());
  const [note, setNote] = useState("");
  const [updateHaveList, setUpdateHaveList] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* The stores the player follows, as chips under "Where". */
  const [stores, setStores] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    getMe()
      .then((me) => {
        if (live) setStores(me.locals.map((local) => local.name));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const submit = async () => {
    setError(null);
    if (!card) {
      setError("Pick a card from the list.");
      return;
    }
    if (!DAY.test(tradedOn.trim())) {
      setError("A date is needed, as YYYY-MM-DD.");
      return;
    }
    try {
      await logTrade({
        cardId: card.hit.id,
        printingId: card.printingId,
        quantity,
        direction,
        partnerPlayerId: partner?.playerId ?? null,
        partnerName: partnerName.trim() || null,
        place: place.trim() || null,
        tradedOn: tradedOn.trim(),
        note: note.trim() || null,
        updateHaveList,
      });
    } catch (caught) {
      setError(failureMessage(caught));
      return;
    }
    /* Back to the list, which reloads on focus and says "Logged." */
    navigation.navigate("TradeHistory", { logged: true });
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.canvas }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: gutter,
          paddingVertical: spacing(4),
          gap: spacing(3),
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* 1. Which way it went. */}
        <Card>
          <DirectionToggle
            value={direction}
            onChange={setDirection}
            labels={{ got: "I got a card", gave: "I gave a card" }}
          />
        </Card>

        {/* 2. The card. */}
        <Card>
          <FieldLabel text="Card" />
          {card ? (
            <PickedCardRow card={card} onChange={() => setCard(null)} />
          ) : (
            <CardPicker onPick={(hit, printingId) => setCard({ hit, printingId })} />
          )}
        </Card>

        {/* 3. How many. */}
        <Card>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <FieldLabel text="Copies" />
            <Stepper
              value={quantity}
              min={1}
              max={LOGGED_QUANTITY_MAX}
              onChange={setQuantity}
              label="copies"
            />
          </View>
        </Card>

        {/* 4. Who with: a typed name, or an account found by name. */}
        <Card>
          <FieldLabel text="Who with" />
          {/* Two fields used to sit here with nothing saying which to
              use. One line says it: a name is enough, an account is
              better. */}
          <Muted>
            Type their name, or find their account so the trade opens their profile.
          </Muted>
          <Input
            value={partnerName}
            onChangeText={setPartnerName}
            placeholder="Their name"
            maxLength={LOGGED_PARTNER_MAX}
            autoCapitalize="words"
          />
          {partner ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing(2.5),
                borderRadius: radius.control,
                borderWidth: 1,
                borderColor: colors.accentMuted,
                backgroundColor: colors.elevated,
                padding: spacing(2),
              }}
            >
              <PlayerAvatar
                displayName={partner.displayName}
                seed={partner.playerId}
                avatarUrl={partner.avatarUrl}
                frame={partner.frame}
                size={28}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  numberOfLines={1}
                  style={{ color: colors.textPrimary, fontWeight: "600" }}
                >
                  {partner.displayName}
                </Text>
                <Text
                  numberOfLines={1}
                  style={{ color: colors.textMuted, fontSize: 12 }}
                >
                  {formatHandle(partner.handle)}
                </Text>
              </View>
              <Tap
                onPress={() => setPartner(null)}
                hitSlop={8}
                accessibilityLabel={`Clear ${partner.displayName}`}
              >
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </Tap>
            </View>
          ) : (
            <PlayerPicker onPick={setPartner} />
          )}
        </Card>

        {/* 5. Where. */}
        <Card>
          <FieldLabel text="Where" />
          <Input
            value={place}
            onChangeText={setPlace}
            placeholder="A store, a kitchen table, a parking lot"
            maxLength={LOGGED_PLACE_MAX}
            autoCapitalize="words"
          />
          {stores.length > 0 ? (
            <ChipRow options={stores} current={place} onPick={setPlace} />
          ) : null}
        </Card>

        {/* 6. When. */}
        <Card>
          <FieldLabel text="When" />
          <Input
            value={tradedOn}
            onChangeText={setTradedOn}
            placeholder="YYYY-MM-DD"
            maxLength={10}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="numbers-and-punctuation"
          />
          <ChipRow
            options={["Today", "Yesterday"]}
            current={
              tradedOn === todayISO()
                ? "Today"
                : tradedOn === yesterdayISO()
                  ? "Yesterday"
                  : ""
            }
            onPick={(label) =>
              setTradedOn(label === "Today" ? todayISO() : yesterdayISO())
            }
          />
        </Card>

        {/* 7. A note. */}
        <Card>
          <FieldLabel text="Note" />
          <Input
            value={note}
            onChangeText={setNote}
            placeholder="Threw in a sleeve, cash on top, whatever you want to remember."
            maxLength={LOGGED_NOTE_MAX}
            multiline
            style={{ minHeight: 64, textAlignVertical: "top" }}
          />
        </Card>

        {/* 8. The Have list. */}
        <Card>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: spacing(3),
            }}
          >
            <Text
              style={{
                flex: 1,
                color: colors.textPrimary,
                fontWeight: "600",
                fontSize: 15,
              }}
            >
              Keep my Have list in step
            </Text>
            <Switch
              value={updateHaveList}
              onValueChange={setUpdateHaveList}
              trackColor={{ true: colors.accent, false: colors.borderStrong }}
              thumbColor={colors.textPrimary}
              accessibilityLabel="Keep my Have list in step"
            />
          </View>
          <Muted>
            A card you gave comes off your Have list. A card you got goes on it.
          </Muted>
        </Card>

        {/* 9. The word, and the button. */}
        <Muted>Logged trades earn no Embers. Nobody else confirmed them.</Muted>
        <AsyncButton label="Log it" pendingLabel="Logging…" onPress={submit} />
        <ErrorLine message={error} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function FieldLabel({ text }: { text: string }) {
  return (
    <Text style={{ color: colors.textPrimary, fontWeight: "700", fontSize: 13 }}>
      {text}
    </Text>
  );
}

/** Small pills that fill the field above them. */
function ChipRow({
  options,
  current,
  onPick,
}: {
  options: string[];
  current: string;
  onPick: (value: string) => void;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing(2) }}>
      {options.map((option) => {
        const on = current === option;
        return (
          <Tap
            key={option}
            onPress={() => onPick(option)}
            accessibilityLabel={option}
            style={{
              paddingHorizontal: spacing(3),
              paddingVertical: spacing(1),
              borderRadius: 999,
              borderWidth: 1,
              borderColor: on ? colors.accent : colors.borderStrong,
              backgroundColor: on ? colors.accent : "transparent",
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                fontSize: 13,
                fontWeight: "700",
                color: on ? colors.accentContrast : colors.textSecondary,
              }}
            >
              {option}
            </Text>
          </Tap>
        );
      })}
    </View>
  );
}

/** "Find on CardFlare": the player search, picking one person. */
function PlayerPicker({ onPick }: { onPick: (player: FoundPlayer) => void }) {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<FoundPlayer[] | null>(null);

  /* Debounced, and guarded against answers landing out of order. */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(0);

  const searchFor = (text: string) => {
    if (timer.current) clearTimeout(timer.current);
    const trimmed = text.trim();
    if (trimmed.length < 2) {
      setFound(null);
      return;
    }
    const request = ++latest.current;
    timer.current = setTimeout(() => {
      searchPlayersByName(trimmed)
        .then((result) => {
          if (latest.current === request) setFound(result.players);
        })
        .catch(() => {});
    }, 300);
  };

  return (
    <View style={{ gap: spacing(2) }}>
      <Input
        value={query}
        onChangeText={(text) => {
          setQuery(text);
          searchFor(text);
        }}
        placeholder="Find on CardFlare"
        autoCapitalize="none"
        autoCorrect={false}
      />
      {found !== null ? (
        found.length === 0 ? (
          <Muted>Nobody by that name yet.</Muted>
        ) : (
          found.slice(0, 6).map((person) => (
            <Tap
              key={person.playerId}
              onPress={() => {
                onPick(person);
                setQuery("");
                setFound(null);
              }}
              accessibilityLabel={`Pick ${person.displayName}`}
              style={pickRow}
            >
              <PlayerAvatar
                displayName={person.displayName}
                seed={person.playerId}
                avatarUrl={person.avatarUrl}
                frame={person.frame}
                size={28}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  numberOfLines={1}
                  style={{ color: colors.textPrimary, fontWeight: "600" }}
                >
                  {person.displayName}
                </Text>
                <Text
                  numberOfLines={1}
                  style={{ color: colors.textMuted, fontSize: 12 }}
                >
                  {formatHandle(person.handle)}
                </Text>
              </View>
            </Tap>
          ))
        )
      ) : null}
    </View>
  );
}
