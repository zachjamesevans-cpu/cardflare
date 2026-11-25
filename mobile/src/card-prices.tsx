import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Animated, ScrollView, Text, View } from "react-native";

import type { CardPrices } from "./api";
import { loadCardPrices, peekCardPrices, savedCardPrices } from "./price-cache";
import { Tap } from "./ui";
import { colors, radius, spacing } from "./theme";

/**
 * MARKET PRICE, on the app's card screen: the website's panel
 * (src/components/cards/card-prices.tsx), the same order and words.
 * One printing at a time - its near-mint price large with the week's
 * move beside it, the range under it, then the other conditions and
 * the top graded prices as small chips. Loaded after the card, so the
 * screen never waits on it.
 */

/** "$6.13". The website's formatPrice. */
export function formatPrice(value: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** "+2.9%", "−2.9%", or null. The website's formatChange. */
export function formatChange(percent: number | null): string | null {
  if (percent === null || Math.abs(percent) < 0.05) return null;
  return `${percent > 0 ? "+" : "−"}${Math.abs(percent).toFixed(1)}%`;
}

export const PRICE_SOURCE = "Market prices from Scrydex, for reference.";

function updatedLabel(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}

export function CardPricesPanel({ cardId }: { cardId: string }) {
  /* Prices already in hand draw in the first frame; otherwise the copy
     on the phone, then the server's answer (src/price-cache.ts). */
  const [prices, setPrices] = useState<CardPrices | null>(() => peekCardPrices(cardId));
  const [at, setAt] = useState(0);
  /* Faded in only when they arrive after the screen did; prices that
     were already here simply appear with it. */
  const fade = useRef(new Animated.Value(prices ? 1 : 0)).current;

  useEffect(() => {
    let live = true;
    const show = (next: CardPrices, animate: boolean) => {
      if (!live) return;
      setPrices(next);
      if (animate) {
        Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
      } else fade.setValue(1);
    };
    const now = peekCardPrices(cardId);
    setAt(0);
    if (now) show(now, false);
    else {
      setPrices(null);
      fade.setValue(0);
      void savedCardPrices(cardId).then((saved) => {
        if (saved && live) show(saved, false);
      });
    }
    void loadCardPrices(cardId).then((fresh) => show(fresh, !now));
    return () => {
      live = false;
    };
  }, [cardId, fade]);

  return (
    <View style={{ gap: spacing(2) }}>
      <Text
        accessibilityRole="header"
        style={{
          color: colors.textMuted,
          fontSize: 12,
          fontWeight: "700",
          letterSpacing: 1.6,
          textTransform: "uppercase",
        }}
      >
        Market price
      </Text>
      {prices === null ? (
        <PricesSkeleton />
      ) : prices.state !== "ok" ? (
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>
          {prices.state === "none"
            ? "No market price for this card yet."
            : "Prices aren't available right now."}
        </Text>
      ) : (
        <Animated.View style={{ opacity: fade, gap: spacing(2) }}>
          <Panel prices={prices} at={Math.min(at, prices.printings.length - 1)} onPick={setAt} />
        </Animated.View>
      )}
    </View>
  );
}

function Panel({
  prices,
  at,
  onPick,
}: {
  prices: Extract<CardPrices, { state: "ok" }>;
  at: number;
  onPick: (index: number) => void;
}) {
  const printing = prices.printings[at];
  const top = printing.graded[0];
  const headline =
    printing.market !== null
      ? { value: printing.market, caption: null }
      : { value: top?.market ?? 0, caption: top ? `${top.company} ${top.grade}` : null };
  const change = formatChange(printing.change7);
  const up = (printing.change7 ?? 0) > 0;

  return (
    <>
      {prices.printings.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing(2) }}>
          {prices.printings.map((entry, index) => {
            const on = index === at;
            return (
              <Tap
                key={entry.variant}
                onPress={() => onPick(index)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={entry.label}
                style={{
                  height: 34,
                  justifyContent: "center",
                  paddingHorizontal: spacing(3.5),
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: on ? colors.accent : colors.border,
                  backgroundColor: on ? colors.accent : colors.surface,
                }}
              >
                <Text style={{ color: on ? colors.accentContrast : colors.textPrimary, fontSize: 14, fontWeight: "700" }}>
                  {entry.label}
                </Text>
              </Tap>
            );
          })}
        </ScrollView>
      ) : null}

      <View style={box()}>
        <View style={{ flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", gap: spacing(2.5) }}>
          <Text style={{ color: colors.textPrimary, fontSize: 32, fontWeight: "800", letterSpacing: -0.5 }}>
            {formatPrice(headline.value, printing.currency)}
          </Text>
          {headline.caption ? (
            <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "600" }}>
              {headline.caption}
            </Text>
          ) : null}
          {change ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                paddingHorizontal: spacing(2),
                paddingVertical: 3,
                borderRadius: 999,
                backgroundColor: up ? colors.accentTint : "rgba(255,143,143,0.15)",
              }}
            >
              <Ionicons name={up ? "trending-up" : "trending-down"} size={13} color={up ? colors.accent : colors.danger} />
              <Text style={{ color: up ? colors.accent : colors.danger, fontSize: 12, fontWeight: "800" }}>
                {`${change} · 7d`}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
          {[
            printing.market !== null ? "Near mint" : "No ungraded sales",
            printing.low !== null ? `Low ${formatPrice(printing.low, printing.currency)}` : null,
            printing.high !== null ? `High ${formatPrice(printing.high, printing.currency)}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Text>

        {printing.conditions.length > 1 ? (
          <Chips label="By condition">
            {printing.conditions.map((entry) => (
              <Chip key={entry.condition} name={entry.condition} value={formatPrice(entry.market, printing.currency)} />
            ))}
          </Chips>
        ) : null}
        {printing.graded.length > 0 ? (
          <Chips label="Graded">
            {printing.graded.map((entry) => (
              <Chip
                key={`${entry.company}-${entry.grade}`}
                name={`${entry.company} ${entry.grade}`}
                value={formatPrice(entry.market, printing.currency)}
              />
            ))}
          </Chips>
        ) : null}
      </View>

      <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 17 }}>
        {`${PRICE_SOURCE} Updated ${updatedLabel(prices.fetchedAt)}.`}
      </Text>
    </>
  );
}

/**
 * While prices load: the panel's own shape and size - the chips, the
 * price, the range, two rows of chips - so nothing below it moves when
 * the figures land.
 */
function PricesSkeleton() {
  const bar = (width: number, height: number) => (
    <View style={{ width, height, borderRadius: 6, backgroundColor: colors.elevated }} />
  );
  const pills = (count: number) => (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing(2) }}>
      {Array.from({ length: count }, (_, index) => (
        <View
          key={index}
          style={{ width: 82, height: 30, borderRadius: 999, backgroundColor: colors.elevated }}
        />
      ))}
    </View>
  );
  return (
    <View style={{ gap: spacing(2) }} accessibilityLabel="Loading prices">
      <View style={{ flexDirection: "row", gap: spacing(2) }}>
        {[70, 92, 120].map((width) => (
          <View
            key={width}
            style={{ width, height: 34, borderRadius: 999, backgroundColor: colors.elevated }}
          />
        ))}
      </View>
      <View style={box()}>
        {bar(130, 38)}
        {bar(220, 16)}
        <View style={{ gap: spacing(1.5), borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing(3) }}>
          {bar(90, 11)}
          {pills(4)}
        </View>
        <View style={{ gap: spacing(1.5), borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing(3) }}>
          {bar(60, 11)}
          {pills(4)}
        </View>
      </View>
      {bar(260, 12)}
    </View>
  );
}

function Chips({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing(1.5), borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing(3) }}>
      <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.3, textTransform: "uppercase" }}>
        {label}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing(2) }}>{children}</View>
    </View>
  );
}

function Chip({ name, value }: { name: string; value: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "baseline",
        gap: 6,
        paddingHorizontal: spacing(2.5),
        paddingVertical: 5,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
      }}
    >
      <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "600" }}>{name}</Text>
      <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "800" }}>{value}</Text>
    </View>
  );
}

const box = () => ({
  gap: spacing(3),
  padding: spacing(4),
  borderRadius: radius.control,
  borderWidth: 1,
  borderColor: colors.border,
  backgroundColor: colors.surface,
});
