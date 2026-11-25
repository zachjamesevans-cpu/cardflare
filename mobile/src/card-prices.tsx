import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Animated, Text, View } from "react-native";

import type { CardPrices } from "./api";
import { loadCardPrices, peekCardPrices, savedCardPrices } from "./price-cache";
import { Tap } from "./ui";
import { colors, spacing } from "./theme";

/**
 * MARKET PRICE, on the app's card sheet, kept quiet: the founder
 * (2026-11-25), "kind of too much info ... cleaner overall." The price
 * of the art on show (the carousel names the printing, so no chips
 * repeat it) large with the week's move, the range in one muted line,
 * and every condition and grade folded under "All prices". No box.
 * Chips come back only when the art on show has two priced printings.
 * The website's panel is the same (src/components/cards/card-prices.tsx).
 * Loaded after the card, so the screen never waits on it.
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

export const PRICE_SOURCE = "Prices from Scrydex";

function updatedLabel(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}

export function CardPricesPanel({
  cardId,
  variants,
  onPick,
}: {
  cardId: string;
  /** The art the carousel shows: its printing is the one priced. */
  variants?: string[];
  /** A chip tapped: the carousel slides to that printing's art. */
  onPick?: (variant: string) => void;
}) {
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

  /* Follow the carousel: the printing of the art on show. */
  const showing = variants?.join("|") ?? "";
  useEffect(() => {
    if (!prices || prices.state !== "ok" || !showing) return;
    const wanted = showing.split("|");
    const index = prices.printings.findIndex((printing) => wanted.includes(printing.variant));
    if (index >= 0) setAt(index);
  }, [prices, showing]);

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
          <Panel
            prices={prices}
            showing={showing ? showing.split("|") : null}
            at={Math.min(at, prices.printings.length - 1)}
            onPick={(index) => {
              setAt(index);
              const variant = prices.printings[index]?.variant;
              if (variant) onPick?.(variant);
            }}
          />
        </Animated.View>
      )}
    </View>
  );
}

function Panel({
  prices,
  showing,
  at,
  onPick,
}: {
  prices: Extract<CardPrices, { state: "ok" }>;
  /** The variants of the art on show, or null when there is no carousel. */
  showing: string[] | null;
  at: number;
  onPick: (index: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const printing = prices.printings[at];
  const choices = prices.printings
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => !showing || showing.includes(entry.variant));
  const top = printing.graded[0];
  const headline =
    printing.market !== null
      ? { value: printing.market, caption: null }
      : { value: top?.market ?? 0, caption: top ? `${top.company} ${top.grade}` : null };
  const change = formatChange(printing.change7);
  const up = (printing.change7 ?? 0) > 0;
  const range =
    printing.low !== null && printing.high !== null
      ? `${formatPrice(printing.low, printing.currency)} – ${formatPrice(printing.high, printing.currency)}`
      : null;
  const more = printing.conditions.length > 1 || printing.graded.length > 0;

  return (
    <>
      {choices.length > 1 ? (
        <View style={{ flexDirection: "row", gap: 6 }}>
          {choices.map(({ entry, index }) => {
            const on = index === at;
            return (
              <Tap
                key={entry.variant}
                onPress={() => onPick(index)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={entry.label}
                style={{
                  paddingHorizontal: spacing(3),
                  paddingVertical: 5,
                  borderRadius: 999,
                  backgroundColor: on ? colors.textPrimary : colors.elevated,
                }}
              >
                <Text style={{ color: on ? colors.canvas : colors.textSecondary, fontSize: 12, fontWeight: "700" }}>
                  {entry.label}
                </Text>
              </Tap>
            );
          })}
        </View>
      ) : null}

      <View style={{ gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing(2.5) }}>
          <Text style={{ color: colors.textPrimary, fontSize: 32, fontWeight: "800", letterSpacing: -0.5 }}>
            {formatPrice(headline.value, printing.currency)}
          </Text>
          {headline.caption ? (
            <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "600" }}>
              {headline.caption}
            </Text>
          ) : null}
          {change ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Ionicons name={up ? "trending-up" : "trending-down"} size={15} color={up ? colors.accent : colors.danger} />
              <Text style={{ color: up ? colors.accent : colors.danger, fontSize: 14, fontWeight: "800" }}>
                {change}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 14, fontWeight: "600" }}>7d</Text>
            </View>
          ) : null}
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>
          {[printing.market !== null ? "Near mint" : "No ungraded sales", range].filter(Boolean).join(" · ")}
        </Text>
      </View>

      {more ? (
        <View style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
          <Tap
            onPress={() => setOpen((was) => !was)}
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing(3) }}
          >
            <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "600" }}>All prices</Text>
            <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.textSecondary} />
          </Tap>
          {open ? (
            <View style={{ gap: spacing(4), paddingBottom: spacing(3) }}>
              {printing.conditions.length > 1 ? (
                <PriceList label="By condition">
                  {printing.conditions.map((entry) => (
                    <PriceRow key={entry.condition} name={entry.condition} value={formatPrice(entry.market, printing.currency)} />
                  ))}
                </PriceList>
              ) : null}
              {printing.graded.length > 0 ? (
                <PriceList label="Graded">
                  {printing.graded.map((entry) => (
                    <PriceRow
                      key={`${entry.company}-${entry.grade}`}
                      name={`${entry.company} ${entry.grade}`}
                      value={formatPrice(entry.market, printing.currency)}
                    />
                  ))}
                </PriceList>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      <Text
        style={{
          color: colors.textMuted,
          fontSize: 12,
          ...(more ? {} : { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing(3) }),
        }}
      >
        {`${PRICE_SOURCE} · updated ${updatedLabel(prices.fetchedAt)}`}
      </Text>
    </>
  );
}

/**
 * While prices load: the panel's own shape - the price, the range, the
 * "All prices" row - so nothing below it moves when the figures land.
 */
function PricesSkeleton() {
  const bar = (width: number, height: number) => (
    <View style={{ width, height, borderRadius: 6, backgroundColor: colors.elevated }} />
  );
  return (
    <View style={{ gap: spacing(2) }} accessibilityLabel="Loading prices">
      <View style={{ gap: spacing(1.5) }}>
        {bar(130, 38)}
        {bar(180, 16)}
      </View>
      <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: spacing(3) }}>
        {bar(80, 16)}
      </View>
      {bar(190, 12)}
    </View>
  );
}

/** Each condition or grade: a two-column list, name left, price right. */
function PriceList({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing(1) }}>
      <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.3, textTransform: "uppercase" }}>
        {label}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: spacing(6) }}>{children}</View>
    </View>
  );
}

function PriceRow({ name, value }: { name: string; value: string }) {
  return (
    <View
      style={{
        /* Half the row less half the gap: two columns, a lone one too. */
        width: "46%",
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "baseline",
        paddingVertical: 5,
      }}
    >
      <Text style={{ color: colors.textSecondary, fontSize: 14 }}>{name}</Text>
      <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "700" }}>{value}</Text>
    </View>
  );
}
