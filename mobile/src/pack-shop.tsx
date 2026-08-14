import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import { Animated, Image, Modal, Pressable, Text, View } from "react-native";

import {
  buyPack,
  describeError,
  openPack,
  type PackPull,
  type PackSeries,
  type SealedPack,
} from "./api";
import { Button, Muted, Tap, Title } from "./ui";
import { colors, radius, spacing } from "./theme";

/**
 * The pack corner of the Embers store - the website's PackShop in the
 * app's shape: the sealed foil pack, the exact odds, buy with Embers,
 * and the tear-open reveal where three pulls flip in one by one.
 */

const RARITY_COLOR: Record<string, string> = {
  common: colors.textSecondary,
  uncommon: "#7bd88a",
  rare: colors.frost,
  epic: colors.rose,
  legendary: colors.gold,
};

/** The sealed wrapper: foil-ish sheen, crimped ends, the mark. */
export function PackArt({ name, setNumber }: { name: string; setNumber: number }) {
  return (
    <View
      style={{
        width: 132,
        height: 190,
        borderRadius: 10,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: colors.borderStrong,
        backgroundColor: "#12182a",
        alignItems: "center",
        justifyContent: "center",
        gap: spacing(2),
      }}
    >
      <LinearGradient
        colors={[
          "rgba(154,64,224,0.20)",
          "rgba(64,105,229,0.16)",
          "rgba(43,180,168,0.16)",
          "rgba(235,205,60,0.14)",
          "rgba(227,60,60,0.16)",
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />
      {/* The crimped ends that say "sealed". */}
      <View style={crimp(true)} />
      <View style={crimp(false)} />
      <Image
        source={require("../assets/cardflare-mark.png")}
        style={{ height: 72, width: 60, resizeMode: "contain" }}
      />
      <Text style={{ color: colors.textPrimary, fontWeight: "700", letterSpacing: 1 }}>
        CardFlare
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: 11 }}>
        {name} · Set {setNumber}
      </Text>
    </View>
  );
}

function crimp(top: boolean) {
  return {
    position: "absolute" as const,
    left: 0,
    right: 0,
    height: 10,
    ...(top ? { top: 0 } : { bottom: 0 }),
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: "rgba(255,255,255,0.12)",
    ...(top ? { borderBottomWidth: 1 } : { borderTopWidth: 1 }),
  };
}

export function PackShopSection({
  series,
  sealed,
  names,
  onChanged,
}: {
  series: PackSeries;
  sealed: SealedPack[];
  names: Record<string, string>;
  /** Balance and wardrobe changed server-side; the screen reloads. */
  onChanged: () => void;
}) {
  const [packs, setPacks] = useState(sealed);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [oddsOpen, setOddsOpen] = useState(false);
  const [pulls, setPulls] = useState<PackPull[] | null>(null);

  useEffect(() => setPacks(sealed), [sealed]);

  const mine = packs.filter((pack) => pack.series === series.id).length;

  const buy = () => {
    setBusy("buy");
    setMessage(null);
    buyPack(series.id)
      .then((result) => {
        setPacks(result.packs);
        setMessage("Pack added. Tear it open when ready.");
        onChanged();
      })
      .catch((caught) =>
        setMessage(
          describeError(caught).includes("402") ||
            describeError(caught).includes("not-enough")
            ? "Not enough Embers for a pack yet."
            : `That did not go through (${describeError(caught)}).`,
        ),
      )
      .finally(() => setBusy(null));
  };

  const open = () => {
    const next = packs.find((pack) => pack.series === series.id);
    if (!next) return;
    setBusy("open");
    setMessage(null);
    openPack(next.id)
      .then((result) => {
        setPacks(result.packs);
        setPulls(result.pulls);
        onChanged();
      })
      .catch((caught) =>
        setMessage(`That pack could not be opened (${describeError(caught)}).`),
      )
      .finally(() => setBusy(null));
  };

  return (
    <View style={{ gap: spacing(3) }}>
      <View style={{ flexDirection: "row", gap: spacing(4) }}>
        <PackArt name={series.name} setNumber={series.setNumber} />

        <View style={{ flex: 1, gap: spacing(2) }}>
          <Muted>
            {series.slots} cosmetics per pack, drawn the moment you open it.
            Duplicates come back as Embers, so no pull is ever nothing.
          </Muted>
          <Button
            label={busy === "buy" ? "Buying…" : `Buy a pack · ${series.priceEmbers}`}
            disabled={busy !== null}
            onPress={buy}
          />
          {mine > 0 && (
            <Button
              label={busy === "open" ? "Opening…" : `Open one · ${mine} sealed`}
              variant="secondary"
              disabled={busy !== null}
              onPress={open}
            />
          )}
          {message && <Muted>{message}</Muted>}
        </View>
      </View>

      <Tap onPress={() => setOddsOpen((current) => !current)}>
        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
          {oddsOpen ? "Hide the odds" : "What can be inside, and the exact odds"}
        </Text>
      </Tap>

      {oddsOpen && (
        <View
          style={{
            gap: spacing(1.5),
            borderLeftWidth: 1,
            borderLeftColor: colors.border,
            paddingLeft: spacing(3),
          }}
        >
          {series.odds.map((tier) => (
            <Text key={tier.rarity} style={{ fontSize: 13, color: colors.textSecondary }}>
              <Text
                style={{
                  color: RARITY_COLOR[tier.rarity] ?? colors.textSecondary,
                  fontWeight: "700",
                  textTransform: "capitalize",
                }}
              >
                {tier.rarity}
              </Text>
              <Text style={{ color: colors.textMuted }}> {tier.percent}% per slot</Text>
              {" · "}
              {tier.slugs.map((slug) => names[slug] ?? slug).join(", ")}
            </Text>
          ))}
        </View>
      )}

      <RevealModal
        pulls={pulls}
        names={names}
        onClose={() => setPulls(null)}
      />
    </View>
  );
}

/** Three pulls flipping in, one after another, full screen. */
function RevealModal({
  pulls,
  names,
  onClose,
}: {
  pulls: PackPull[] | null;
  names: Record<string, string>;
  onClose: () => void;
}) {
  return (
    <Modal visible={pulls !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.88)",
          alignItems: "center",
          justifyContent: "center",
          gap: spacing(4),
          padding: spacing(4),
        }}
      >
        <Title>Your pulls</Title>
        <View style={{ flexDirection: "row", gap: spacing(3) }}>
          {(pulls ?? []).map((pull, index) => (
            <PullTile key={`${pull.slug}-${index}`} pull={pull} names={names} index={index} />
          ))}
        </View>
        <Muted>Everything you pulled is in your wardrobe now. Tap to close.</Muted>
      </Pressable>
    </Modal>
  );
}

function PullTile({
  pull,
  names,
  index,
}: {
  pull: PackPull;
  names: Record<string, string>;
  index: number;
}) {
  const pop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(pop, {
      toValue: 1,
      delay: 400 + index * 500,
      speed: 6,
      bounciness: 12,
      useNativeDriver: true,
    }).start();
  }, [pop, index]);

  return (
    <Animated.View
      style={{
        opacity: pop,
        transform: [
          { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
        ],
        width: 104,
        borderRadius: radius.control,
        borderWidth: 1,
        borderColor: RARITY_COLOR[pull.rarity] ?? colors.border,
        backgroundColor: colors.elevated,
        padding: spacing(3),
        alignItems: "center",
        gap: spacing(1),
      }}
    >
      <Text
        numberOfLines={2}
        style={{
          color: colors.textPrimary,
          fontWeight: "700",
          fontSize: 12,
          textAlign: "center",
        }}
      >
        {names[pull.slug] ?? pull.slug}
      </Text>
      <Text
        style={{
          color: RARITY_COLOR[pull.rarity] ?? colors.textMuted,
          fontSize: 11,
          textTransform: "capitalize",
        }}
      >
        {pull.rarity}
      </Text>
      {pull.duplicate && (
        <Text style={{ color: colors.textMuted, fontSize: 10, textAlign: "center" }}>
          Already yours: +{pull.embersInstead} Embers
        </Text>
      )}
    </Animated.View>
  );
}
