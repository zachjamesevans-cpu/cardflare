import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { Text, View } from "react-native";

import { DotsButton } from "./action-menu";
import type { FlareHistoryEntry, TradeHistoryEntry, TradeHistoryTotals } from "./api";
import { FLARE_OUTCOME_LABELS } from "./history-items";
import { PlayerAvatar } from "./player-avatar";
import { QuantityBadge } from "./quantity-badge";
import { RemoteImage } from "./remote-image";
import { colors, radius, spacing } from "./theme";
import { Button, Tap } from "./ui";

/**
 * The pieces of the trade history, shared by the card on the profile
 * and the screen so the two draw a trade the same way. The website's
 * src/components/trades/history.tsx, natively: one row is one card
 * and which way it went, the store and the day under it, the Embers
 * it paid at the end.
 */

/** "Fri, Sep 12", in the reader's own clock. */
export function dayOf(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

/** "Fri, Sep 12, 3:04 PM": an answer's moment, in the reader's clock. */
export function momentOf(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** "September 2026", the group heading. */
export function monthOf(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(
    new Date(iso),
  );
}

type IconName = ComponentProps<typeof Ionicons>["name"];

/**
 * What a row says under the detail line, with the glyph the website
 * draws beside it. A logged trade says so: it is the player's own
 * word, which nobody else confirmed and which paid nothing.
 */
function statusLine(trade: TradeHistoryEntry): { icon: IconName; text: string } | null {
  switch (trade.status) {
    case "pending":
      return { icon: "time-outline", text: "Waiting on the other side to confirm" };
    case "late":
      return { icon: "time-outline", text: "Not confirmed in time" };
    case "disputed":
      return {
        icon: "arrow-undo-outline",
        text: "Reversed. Its Embers were taken back.",
      };
    case "unnamed":
      return {
        icon: "help-circle-outline",
        text: "Nobody named, so it earned nothing",
      };
    case "logged":
      return { icon: "pencil-outline", text: "Logged by you" };
    default:
      return null;
  }
}

/** Written down by the player rather than confirmed in a room. */
export function isLogged(trade: TradeHistoryEntry): boolean {
  return trade.source === "logged" || trade.status === "logged";
}

const THUMB = 44;

export function TradeHistoryRow({
  trade,
  compact = false,
  last = false,
  onOpenPartner,
  onMore,
}: {
  trade: TradeHistoryEntry;
  /** On the profile card: no card number, one line of detail. */
  compact?: boolean;
  last?: boolean;
  /** The partner's profile, when the trade names an account. */
  onOpenPartner?: () => void;
  /** The three dots: a logged row's Remove. Room rows have none. */
  onMore?: () => void;
}) {
  const line = statusLine(trade);
  /* The logged line is what tells this row from a room's, so the
     profile's compact rows keep it; the rest of the status lines are
     the full page's business. */
  const showLine = line && (!compact || isLogged(trade));
  const partnerOpens = Boolean(onOpenPartner && trade.partnerPlayerId);
  /* Where: the store, or, for a trade both sides confirmed inside a
     conversation, the conversation. A conversation trade has no store. */
  const where = trade.source === "conversation" ? "In a conversation" : trade.storeName;
  const detail = [where, dayOf(trade.confirmedAt), compact ? null : trade.cardNumber]
    .filter(Boolean)
    .join(" · ");

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing(3),
        paddingVertical: spacing(3),
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.border,
      }}
    >
      <View
        style={{
          width: THUMB,
          height: Math.round((THUMB * 84) / 60),
          borderRadius: 5,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.elevated,
          overflow: "hidden",
        }}
      >
        {trade.imageUrl ? (
          <RemoteImage uri={trade.imageUrl} style={{ width: "100%", height: "100%" }} />
        ) : null}
        {/* How many changed hands: the binder's tag, on the card's
            corner, rather than a "×2" in the middle of the sentence. */}
        <QuantityBadge
          quantity={trade.quantity}
          style={{ position: "absolute", top: 2, left: 2 }}
        />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(1.5) }}>
          <Ionicons
            name={trade.got ? "arrow-down-outline" : "arrow-up-outline"}
            size={14}
            color={trade.got ? colors.accent : colors.textMuted}
          />
          <Text
            numberOfLines={2}
            style={{ color: colors.textPrimary, fontSize: 14, flex: 1 }}
          >
            {trade.got ? "Got " : "Gave "}
            <Text style={{ fontWeight: "700" }}>{trade.cardName}</Text>
            {trade.partnerName ? (
              <>
                {trade.got ? " from " : " to "}
                {/* A name with an account behind it opens the profile,
                    the website's link. */}
                <Text
                  style={{
                    fontWeight: "700",
                    color: partnerOpens ? colors.accent : colors.textPrimary,
                  }}
                  onPress={partnerOpens ? onOpenPartner : undefined}
                  accessibilityRole={partnerOpens ? "link" : undefined}
                >
                  {trade.partnerName}
                </Text>
              </>
            ) : null}
          </Text>
        </View>
        <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 12 }}>
          {detail}
        </Text>
        {showLine ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(1) }}>
            <Ionicons name={line.icon} size={12} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>{line.text}</Text>
          </View>
        ) : null}
        {trade.note && !compact ? (
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
            {trade.note}
          </Text>
        ) : null}
      </View>
      {/* A logged trade never paid anything, and a pill saying "0" on
          every one of them reads as a mark against it. Room trades keep
          theirs, zero included: there a zero means something. */}
      {isLogged(trade) ? null : (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 3,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: trade.embers > 0 ? colors.accentMuted : colors.border,
            backgroundColor: colors.elevated,
            paddingHorizontal: spacing(2),
            paddingVertical: 2,
          }}
        >
          <Ionicons
            name="flame"
            size={11}
            color={trade.embers > 0 ? colors.accent : colors.textMuted}
          />
          <Text
            style={{
              color: trade.embers > 0 ? colors.accent : colors.textMuted,
              fontSize: 12,
              fontWeight: "700",
            }}
          >
            {trade.embers > 0 ? `+${trade.embers}` : String(trade.embers)}
          </Text>
        </View>
      )}
      {onMore ? <DotsButton onPress={onMore} label="More about this trade" /> : null}
    </View>
  );
}

/**
 * What a free player sees instead of rows: the shape of a list with
 * nothing in it, faded, so the wall reads as covering something. Drawn
 * from nothing - the server sent no rows to hide.
 */
export function LockedRows({ count }: { count: number }) {
  return (
    <View style={{ opacity: 0.35 }} pointerEvents="none">
      {Array.from({ length: count }, (_, index) => (
        <View
          key={index}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing(3),
            paddingVertical: spacing(3),
            borderBottomWidth: index === count - 1 ? 0 : 1,
            borderBottomColor: colors.border,
          }}
        >
          <View
            style={{
              width: THUMB,
              height: Math.round((THUMB * 84) / 60),
              borderRadius: 5,
              backgroundColor: colors.elevated,
            }}
          />
          <View style={{ flex: 1, gap: spacing(1.5) }}>
            <View
              style={{
                height: 14,
                width: "75%",
                borderRadius: 4,
                backgroundColor: colors.elevated,
              }}
            />
            <View
              style={{
                height: 12,
                width: "50%",
                borderRadius: 4,
                backgroundColor: colors.elevated,
              }}
            />
          </View>
          <View
            style={{
              height: 20,
              width: 48,
              borderRadius: 999,
              backgroundColor: colors.elevated,
            }}
          />
        </View>
      ))}
    </View>
  );
}

/** The Pro pitch over the faded rows. */
export function TradeHistoryWall({
  count,
  onGetPro,
}: {
  count: number;
  onGetPro: () => void;
}) {
  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: "center",
        justifyContent: "center",
        padding: spacing(2),
      }}
    >
      <View
        style={{
          width: "100%",
          maxWidth: 320,
          alignItems: "center",
          gap: spacing(3),
          borderRadius: radius.card,
          borderWidth: 1,
          borderColor: colors.accentMuted,
          backgroundColor: colors.surface,
          padding: spacing(5),
        }}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: colors.accentMuted,
            backgroundColor: colors.elevated,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="lock-closed-outline" size={20} color={colors.accent} />
        </View>
        <Text
          style={{
            color: colors.textPrimary,
            fontWeight: "700",
            fontSize: 16,
            textAlign: "center",
          }}
        >
          {count === 0
            ? "Your trades will be saved here"
            : count === 1
              ? "Your trade is saved"
              : `Your ${count} trades are saved`}
        </Text>
        <Text
          style={{ color: colors.textSecondary, fontSize: 14, textAlign: "center" }}
        >
          See every card you got and gave, who it was with, and the Embers it earned,
          with cardflare Pro.
        </Text>
        <Button label="Get cardflare Pro" onPress={onGetPro} />
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>$7.99 a month</Text>
      </View>
    </View>
  );
}

/** Three numbers over the list: trades, got, gave. */
export function TradeHistoryTotalsRow({ totals }: { totals: TradeHistoryTotals }) {
  const cells: [number, string][] = [
    [totals.trades, totals.trades === 1 ? "trade" : "trades"],
    [totals.got, "got"],
    [totals.gave, "gave"],
  ];
  return (
    <View style={{ flexDirection: "row", gap: spacing(2) }}>
      {cells.map(([value, label]) => (
        <View
          key={label}
          style={{
            flex: 1,
            alignItems: "center",
            borderRadius: radius.control,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.elevated,
            paddingVertical: spacing(2),
          }}
        >
          <Text style={{ color: colors.textPrimary, fontWeight: "700", fontSize: 18 }}>
            {value}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * A past Flare, in History.
 *
 * The founder, looking at greyed-out FOUND rows on the Flare tab: "past
 * flares should live somewhere, or a flare history of sorts... it could
 * be cool to see a log of who answered the flare, date and time etc."
 * So the row is the card (its art, its name, how many), how it ended,
 * when it went up and when it stopped, and everyone who answered it:
 * their face, their name, when, and how many they could bring. Each
 * answer opens your conversation with them when there is one. The
 * website's src/components/trades/flare-history-row.tsx draws the same
 * row with the same words.
 */
export function FlareHistoryRow({
  flare,
  last = false,
  onOpenCard,
  onOpenThread,
}: {
  flare: FlareHistoryEntry;
  last?: boolean;
  onOpenCard: (cardId: string) => void;
  onOpenThread: (threadId: string) => void;
}) {
  const takenDown = flare.outcome === "taken-down";
  const dates = [
    flare.direction === "showcase" ? "Offering" : null,
    `Posted ${dayOf(flare.postedAt)}`,
    `Ended ${dayOf(flare.endedAt)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: spacing(3),
        paddingVertical: spacing(3),
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.border,
      }}
    >
      <View
        style={{
          width: THUMB,
          height: Math.round((THUMB * 84) / 60),
          borderRadius: 5,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.elevated,
          overflow: "hidden",
        }}
      >
        {flare.imageUrl ? (
          <RemoteImage uri={flare.imageUrl} style={{ width: "100%", height: "100%" }} />
        ) : null}
        <QuantityBadge
          quantity={flare.quantity}
          style={{ position: "absolute", top: 2, left: 2 }}
        />
      </View>

      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}>
          <Tap
            onPress={() => onOpenCard(flare.cardId)}
            accessibilityLabel={`Open ${flare.cardName}`}
            style={{ flexShrink: 1, minWidth: 0 }}
          >
            <Text
              numberOfLines={1}
              style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "700" }}
            >
              {flare.cardName}
            </Text>
          </Tap>
          <View
            style={{
              borderRadius: 999,
              borderWidth: 1,
              borderColor: takenDown ? colors.border : colors.accentMuted,
              paddingHorizontal: spacing(2),
              paddingVertical: 2,
            }}
          >
            <Text
              style={{
                color: takenDown ? colors.textMuted : colors.accent,
                fontSize: 11,
                fontWeight: "700",
              }}
            >
              {FLARE_OUTCOME_LABELS[flare.outcome]}
            </Text>
          </View>
        </View>
        <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 12 }}>
          {dates}
        </Text>

        {/* Who answered: face, name, when, and how many they could
            bring. A tap opens your conversation with them. */}
        {flare.responders.length > 0 ? (
          <View
            style={{ marginTop: spacing(1.5), gap: spacing(1) }}
            accessibilityLabel="Who answered"
          >
            {flare.responders.map((responder, index) => {
              const inner = (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing(2),
                    minWidth: 0,
                  }}
                >
                  <PlayerAvatar
                    displayName={responder.name}
                    seed={responder.playerId ?? `${flare.flareId}-${index}`}
                    avatarUrl={responder.avatarUrl}
                    size={24}
                  />
                  <Text
                    numberOfLines={1}
                    style={{ flexShrink: 1, color: colors.textSecondary, fontSize: 12 }}
                  >
                    <Text style={{ color: colors.textPrimary, fontWeight: "700" }}>
                      {responder.name}
                    </Text>
                    {` · ${momentOf(responder.at)}`}
                  </Text>
                  <QuantityBadge quantity={responder.quantity} />
                </View>
              );
              const key = `${responder.playerId ?? "guest"}-${index}`;
              const threadId = responder.threadId;
              return threadId ? (
                <Tap
                  key={key}
                  onPress={() => onOpenThread(threadId)}
                  accessibilityLabel={`Open your conversation with ${responder.name}`}
                >
                  {inner}
                </Tap>
              ) : (
                <View key={key}>{inner}</View>
              );
            })}
          </View>
        ) : null}
      </View>
    </View>
  );
}
