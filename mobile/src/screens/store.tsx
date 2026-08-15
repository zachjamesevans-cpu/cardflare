import { Ionicons } from "@expo/vector-icons";
import { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  View,
} from "react-native";

import {
  buyCosmetic,
  getPacks,
  getProfile,
  type CosmeticItem,
  type EquipSlot,
  type Profile,
  type Wardrobe,
  type PackSeries,
  type SealedPack,
} from "../api";
import { CosmeticCard } from "../cosmetic-card";
import { packItemLabels } from "../pack-labels";
import { PackShopSection } from "../pack-shop";
import { FRAME_COLOR } from "../player-avatar";
import { Body, Card, Muted, Tap, Title } from "../ui";
import { colors, spacing } from "../theme";

/**
 * The Embers store, on its own screen — the website's /profile/store,
 * mirrored: the balance pill up top, then four shelves sold from
 * carousels of card-shaped tiles, each tile wearing exactly the one
 * item it sells. Same sections, same order, same words.
 *
 * One tap does everything: buy it if it is not yours, wear it if it is.
 * No confirmation step, because Embers cannot be bought with money.
 */
export function StoreScreen() {
  const [packSeries, setPackSeries] = useState<PackSeries[]>([]);
  const [sealed, setSealed] = useState<SealedPack[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [wardrobe, setWardrobe] = useState<Wardrobe | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await getProfile();
      setProfile(result.profile);
      setWardrobe(result.wardrobe);
      getPacks()
        .then((packs) => {
          setPackSeries(packs.series);
          setSealed(packs.packs);
        })
        .catch(() => {});
    } catch {
      setMessage("Could not load the store. Pull back and try again.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!profile || !wardrobe) {
    return (
      <ScrollView contentContainerStyle={{ padding: spacing(4) }}>
        {message ? <Muted>{message}</Muted> : <ActivityIndicator color={colors.accent} />}
      </ScrollView>
    );
  }

  const buy = (item: CosmeticItem, slot: EquipSlot) => {
    setBusy(item.slug + slot);
    setMessage(null);
    void buyCosmetic(item.slug, slot)
      .then(async () => {
        await load();
        setMessage(
          item.owned ? `${item.name} equipped.` : `${item.name} unlocked and equipped.`,
        );
      })
      .catch(() => setMessage("That did not go through. Try again in a moment."))
      .finally(() => setBusy(null));
  };

  return (
    <ScrollView contentContainerStyle={{ padding: spacing(4), gap: spacing(4) }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: spacing(2),
        }}
      >
        <Muted>Spend what you earned trading. Everything you buy is yours for good.</Muted>
      </View>

      {/* The balance pill: deliberately NOT the EmberBadge. That badge
          says "earned"; this is the one number that must never be
          mistaken for it. Same rule as the website. */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          alignSelf: "flex-end",
          gap: spacing(1.5),
          borderRadius: 999,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.elevated,
          paddingHorizontal: spacing(3),
          paddingVertical: spacing(1),
        }}
      >
        <Ionicons name="flame" size={14} color={colors.accent} />
        <Text style={{ color: colors.accent, fontWeight: "700", fontSize: 14 }}>
          {profile.embersBalance.toLocaleString()}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>to spend</Text>
      </View>

      <Card>
        <Title>CardFlare packs</Title>
        <Muted>
          Sealed packs of cosmetics, opened like the real thing. Every new
          account starts with one on the house.
        </Muted>
        {packSeries.map((series) => (
          <PackShopSection
            key={series.id}
            series={series}
            sealed={sealed}
            names={packItemLabels([
              ...wardrobe.avatarFrames.map((item) => ({ ...item, kind: "frame" })),
              ...wardrobe.cardFrames.map((item) => ({ ...item, kind: "frame" })),
              ...wardrobe.holos.map((item) => ({ ...item, kind: "holo" })),
              ...wardrobe.effects.map((item) => ({ ...item, kind: "effect" })),
            ])}
            onChanged={() => void load()}
          />
        ))}
      </Card>

      <Card>
        <Shelf
          title="Profile borders"
          blurb="The ring around your profile picture, in every room you join. Separate from your cards. Buying a border once unlocks it for both."
          items={wardrobe.avatarFrames}
          slot="avatarFrame"
          balance={profile.embersBalance}
          busy={busy}
          onBuy={buy}
        />
        <Shelf
          title="Card borders"
          blurb="The border your showcase cards wear unless you dress one differently. Tap a card on your profile to dress it on its own."
          items={wardrobe.cardFrames}
          slot="cardFrame"
          balance={profile.embersBalance}
          busy={busy}
          onBuy={buy}
        />
        <Shelf
          title="Holo patterns"
          blurb="How the light sits on the artwork. This is the default; each card can wear its own."
          items={wardrobe.holos}
          slot="holo"
          balance={profile.embersBalance}
          busy={busy}
          onBuy={buy}
        />
        <Shelf
          title="Effects"
          blurb="What moves, and how often. Worn by every card on your shelf."
          items={wardrobe.effects}
          slot="effect"
          balance={profile.embersBalance}
          busy={busy}
          onBuy={buy}
        />
      </Card>

      {message && <Muted>{message}</Muted>}
    </ScrollView>
  );
}

const TILE = 56;

/** One section of the shop: title, blurb, and a rail of card tiles. */
function Shelf({
  title,
  blurb,
  items,
  slot,
  balance,
  busy,
  onBuy,
}: {
  title: string;
  blurb: string;
  items: CosmeticItem[];
  slot: EquipSlot;
  balance: number;
  busy: string | null;
  onBuy: (item: CosmeticItem, slot: EquipSlot) => void;
}) {
  return (
    <View style={{ gap: spacing(2), marginBottom: spacing(3) }}>
      <Title>{title}</Title>
      <Body>{blurb}</Body>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing(2), paddingVertical: spacing(1) }}
      >
        {items.map((item) => {
          const locked = item.lockedUntil !== null && !item.owned;
          const affordable = item.owned || (!locked && balance >= item.cost);
          const pending = busy === item.slug + slot;

          return (
            <Tap
              key={item.slug}
              disabled={pending || item.equipped || !affordable}
              onPress={() => onBuy(item, slot)}
              style={{ width: TILE, gap: spacing(1), opacity: affordable ? 1 : 0.6 }}
            >
              <View>
                {slot === "avatarFrame" ? (
                  /* Profile borders ring a circle, because that is what
                     they dress. The card-shaped canvas keeps the rail
                     aligned with every other shelf. */
                  <View
                    style={{
                      width: TILE,
                      height: Math.round((TILE * 84) / 60),
                      borderRadius: 6,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.elevated,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <View
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 15,
                        borderWidth: 2,
                        borderColor: FRAME_COLOR[item.slug] ?? colors.border,
                        backgroundColor: colors.canvas,
                      }}
                    />
                  </View>
                ) : (
                  <CosmeticCard
                    imageUrl={null}
                    width={TILE}
                    frame={item.kind === "frame" ? item.slug : null}
                    holo={item.kind === "holo" ? item.slug : null}
                    effect={item.kind === "effect" ? item.slug : null}
                  />
                )}

                {pending && (
                  <View
                    style={{
                      position: "absolute",
                      inset: 0,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: "rgba(14, 17, 22, 0.7)",
                      borderRadius: 6,
                    }}
                  >
                    <ActivityIndicator size="small" color={colors.accent} />
                  </View>
                )}

                {item.equipped && !pending && (
                  <View
                    style={{
                      position: "absolute",
                      right: 2,
                      bottom: 2,
                      borderRadius: 999,
                      backgroundColor: colors.accent,
                      padding: 2,
                    }}
                  >
                    <Ionicons name="checkmark" size={10} color={colors.accentContrast} />
                  </View>
                )}

                {locked && !pending && (
                  <View
                    style={{
                      position: "absolute",
                      right: 2,
                      bottom: 2,
                      borderRadius: 999,
                      backgroundColor: "rgba(21, 26, 33, 0.9)",
                      padding: 3,
                    }}
                  >
                    <Ionicons name="lock-closed" size={10} color={colors.textMuted} />
                  </View>
                )}
              </View>

              <Text
                numberOfLines={1}
                style={{ color: colors.textPrimary, fontSize: 11, fontWeight: "600" }}
              >
                {item.name}
              </Text>

              {item.equipped ? (
                <Text style={{ color: colors.accent, fontSize: 10, fontWeight: "600" }}>
                  Equipped
                </Text>
              ) : item.owned ? (
                <Text style={{ color: colors.textSecondary, fontSize: 10 }}>
                  Tap to wear
                </Text>
              ) : locked ? (
                <Text style={{ color: colors.textMuted, fontSize: 10 }}>
                  {`Needs ${item.lockedUntil?.toLocaleString()} earned`}
                </Text>
              ) : (
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 2 }}
                >
                  <Ionicons
                    name="flame"
                    size={9}
                    color={affordable ? colors.accent : colors.textMuted}
                  />
                  <Text
                    style={{
                      color: affordable ? colors.accent : colors.textMuted,
                      fontSize: 10,
                      fontWeight: "600",
                      fontVariant: ["tabular-nums"],
                    }}
                  >
                    {item.cost.toLocaleString()}
                  </Text>
                </View>
              )}
            </Tap>
          );
        })}
      </ScrollView>
    </View>
  );
}
