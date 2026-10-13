import { useState } from "react";
import { Text, View } from "react-native";

import { ApiError, buyDailyOffer, type DailyShelf } from "./api";
import { CosmeticPreview } from "./screens/customize";
import { colors, radius, spacing } from "./theme";
import { Card, Muted, Tap, Title } from "./ui";

/**
 * Today's shop: a few cosmetics on the shelf, changing at midnight UTC
 * (the server's lib/players/daily-shop-rules.ts). Buying is Pro, like
 * the rest of the shop; a free player gets the door to Pro instead. The
 * website's DailyShop (src/components/players/daily-shop.tsx) is the
 * same shelf.
 */

const REFUSALS: Record<string, string> = {
  "not-today": "That one has left the shelf. Have a look at today's.",
  "not-pro": "Buying cosmetics is part of cardflare Pro.",
  locked: "That one unlocks with more lifetime Embers.",
  "too-expensive": "Not enough Embers for that one yet.",
};

function hoursUntil(iso: string): number {
  return Math.max(1, Math.ceil((Date.parse(iso) - Date.now()) / 3_600_000));
}

export function DailyShop({
  shelf: initial,
  pro,
  onPro,
  onBought,
}: {
  shelf: DailyShelf;
  pro: boolean;
  onPro: () => void;
  /** Something was bought: the balance and the wardrobe should re-read. */
  onBought: () => void;
}) {
  const [shelf, setShelf] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (shelf.offers.length === 0) return null;

  const buy = (slug: string, name: string) => {
    setBusy(slug);
    setMessage(null);
    buyDailyOffer(slug)
      .then((result) => {
        setShelf(result.shelf);
        setMessage(`${name} is yours, and you are wearing it.`);
        onBought();
      })
      .catch((caught) =>
        setMessage(
          (caught instanceof ApiError && REFUSALS[caught.code]) ||
            "That did not go through. Try again.",
        ),
      )
      .finally(() => setBusy(null));
  };

  return (
    <Card>
      <View
        style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}
      >
        <Title>{"Today's shop"}</Title>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
          {`New in ${hoursUntil(shelf.resetsAt)}h`}
        </Text>
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing(2) }}>
        {shelf.offers.map((offer) => (
          <View
            key={offer.slug}
            style={{
              width: "48%",
              flexGrow: 1,
              gap: spacing(2),
              padding: spacing(3),
              borderRadius: radius.control,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.elevated,
            }}
          >
            <View style={{ height: 96, alignItems: "center", justifyContent: "center" }}>
              <CosmeticPreview kind={offer.kind} slug={offer.slug} />
            </View>
            <Text
              numberOfLines={1}
              style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "700" }}
            >
              {offer.name}
            </Text>
            {offer.owned ? (
              <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "700" }}>
                Yours
              </Text>
            ) : (
              <Tap
                onPress={() => (pro ? buy(offer.slug, offer.name) : onPro())}
                disabled={busy !== null}
                accessibilityLabel={
                  pro ? `Buy ${offer.name} for ${offer.costEmbers} Embers` : "See Pro"
                }
                style={{
                  alignItems: "center",
                  paddingVertical: spacing(1.5),
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: pro ? `${colors.accent}66` : colors.border,
                  backgroundColor: pro ? colors.accentTint : "transparent",
                }}
              >
                <Text
                  style={{
                    color: pro ? colors.accent : colors.textSecondary,
                    fontSize: 12,
                    fontWeight: "700",
                  }}
                >
                  {busy === offer.slug
                    ? "Buying…"
                    : pro
                      ? `${offer.costEmbers} Embers`
                      : `Pro · ${offer.costEmbers}`}
                </Text>
              </Tap>
            )}
          </View>
        ))}
      </View>

      {message ? <Muted>{message}</Muted> : null}
    </Card>
  );
}
