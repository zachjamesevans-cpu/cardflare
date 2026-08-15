import { LinearGradient } from "expo-linear-gradient";
import { useRef, useState } from "react";
import {
  Animated,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

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
 * app's shape, with the founder's staging: opening dims the whole
 * screen, the pack fills it, tearing reveals a paged carousel of
 * face-down cards with the RAREST always last. Tap flips a card;
 * holding a finger on one glows in its rarity's colour. Odds sit
 * behind a small "?" that fades a popup in, every item with its own
 * exact percent.
 */

const RARITY_COLOR: Record<string, string> = {
  common: colors.textSecondary,
  uncommon: "#7bd88a",
  rare: colors.frost,
  epic: colors.rose,
  legendary: colors.gold,
};

const RARITY_RANK: Record<string, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
};

/** Rarest LAST: the pack's crescendo. */
const riffled = (pulls: PackPull[]) =>
  [...pulls].sort((a, b) => (RARITY_RANK[a.rarity] ?? 0) - (RARITY_RANK[b.rarity] ?? 0));

/** The sealed wrapper: foil-ish sheen, crimped ends, the mark. */
export function PackArt({
  name,
  setNumber,
  width = 132,
}: {
  name: string;
  setNumber: number;
  width?: number;
}) {
  const height = Math.round(width * 1.44);
  const scale = width / 132;

  return (
    <View
      style={{
        width,
        height,
        borderRadius: 10 * scale,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: colors.borderStrong,
        backgroundColor: "#12182a",
        alignItems: "center",
        justifyContent: "center",
        gap: spacing(2) * scale,
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
      <View style={crimp(true)} />
      <View style={crimp(false)} />
      <Image
        source={require("../assets/cardflare-mark.png")}
        style={{ height: 72 * scale, width: 60 * scale, resizeMode: "contain" }}
      />
      <Text
        style={{
          color: colors.textPrimary,
          fontWeight: "700",
          letterSpacing: 1,
          fontSize: 14 * scale,
        }}
      >
        CardFlare
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: 11 * scale }}>
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
  onChanged: () => void;
}) {
  const [packs, setPacks] = useState(sealed);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [oddsOpen, setOddsOpen] = useState(false);
  const [opening, setOpening] = useState<
    null | { stage: "sealed" | "tearing" | "revealed"; pulls: PackPull[] }
  >(null);

  const mine = packs.filter((pack) => pack.series === series.id).length;

  const buy = () => {
    setBusy(true);
    setMessage(null);
    buyPack(series.id)
      .then((result) => {
        setPacks(result.packs);
        setMessage("Pack added. Tear it open when ready.");
        onChanged();
      })
      .catch((caught) =>
        setMessage(
          describeError(caught).includes("402")
            ? "Not enough Embers for a pack yet."
            : `That did not go through (${describeError(caught)}).`,
        ),
      )
      .finally(() => setBusy(false));
  };

  const tear = () => {
    const next = packs.find((pack) => pack.series === series.id);
    if (!next || !opening || opening.stage !== "sealed") return;
    setOpening({ stage: "tearing", pulls: [] });
    openPack(next.id)
      .then((result) => {
        setPacks(result.packs);
        setOpening({ stage: "revealed", pulls: riffled(result.pulls) });
        onChanged();
      })
      .catch((caught) => {
        setOpening(null);
        setMessage(`That pack could not be opened (${describeError(caught)}).`);
      });
  };

  return (
    <View style={{ gap: spacing(3) }}>
      {/*
       * Art and copy sit side by side; every CONTROL lives in one bar
       * underneath, spanning the whole panel. The founder's note on the
       * first cut was that it read as uneven, and it did: the buttons
       * were penned into the narrow column beside a tall pack, so Buy
       * was squeezed, Open ran to a different width, and the "?" circle
       * floated at a third height. One row, equal columns, one height.
       */}
      <View style={{ flexDirection: "row", gap: spacing(4) }}>
        <PackArt name={series.name} setNumber={series.setNumber} />

        <View style={{ flex: 1, justifyContent: "center", gap: spacing(2) }}>
          <Muted>
            {series.slots} cosmetics per pack, drawn the moment you open it.
            Duplicates come back as Embers, so no pull is ever nothing.
          </Muted>
          <Muted>
            {mine > 0
              ? `${mine} sealed, waiting to be torn open.`
              : "None sealed right now."}
          </Muted>
        </View>
      </View>

      <View style={{ flexDirection: "row", alignItems: "stretch", gap: spacing(2) }}>
        <View style={{ flex: 1 }}>
          <Button
            label={busy ? "Buying…" : `Buy · ${series.priceEmbers}`}
            busy={busy}
            onPress={buy}
          />
        </View>
        {mine > 0 && (
          <View style={{ flex: 1 }}>
            <Button
              label="Open one"
              variant="secondary"
              onPress={() => setOpening({ stage: "sealed", pulls: [] })}
            />
          </View>
        )}
        {/* The odds, behind a quiet "?" - square, so it matches the
            buttons' height instead of hovering at its own. */}
        <Tap
          onPress={() => setOddsOpen(true)}
          hitSlop={8}
          accessibilityLabel="What can be inside, and the exact odds"
          style={{
            width: 44,
            borderRadius: radius.control,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: colors.textMuted, fontWeight: "700" }}>?</Text>
        </Tap>
      </View>

      {message && <Muted>{message}</Muted>}

      {/* Odds popup, faded in. */}
      <Modal visible={oddsOpen} transparent animationType="fade" onRequestClose={() => setOddsOpen(false)}>
        <Pressable
          onPress={() => setOddsOpen(false)}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.8)",
            alignItems: "center",
            justifyContent: "center",
            padding: spacing(5),
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              width: "100%",
              maxWidth: 340,
              borderRadius: radius.card,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              padding: spacing(4),
              gap: spacing(2),
            }}
          >
            <Title>Exact odds, per slot</Title>
            {(series.oddsDetail ?? []).map((tier) => (
              <View key={tier.rarity} style={{ gap: 2 }}>
                <Text
                  style={{
                    color: RARITY_COLOR[tier.rarity] ?? colors.textSecondary,
                    fontWeight: "700",
                    fontSize: 13,
                    textTransform: "capitalize",
                  }}
                >
                  {tier.rarity}
                </Text>
                {tier.items.map((item) => (
                  <View
                    key={item.slug}
                    style={{ flexDirection: "row", justifyContent: "space-between" }}
                  >
                    <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                      {names[item.slug] ?? item.slug}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                      {item.percent}%
                    </Text>
                  </View>
                ))}
              </View>
            ))}
            <Muted>
              Three slots per pack, each rolled independently. No slot can repeat
              another in the same pack.
            </Muted>
          </Pressable>
        </Pressable>
      </Modal>

      {/* The full-screen ceremony. */}
      <Modal
        visible={opening !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setOpening(null)}
      >
        {opening && (
          <PackCeremony
            series={series}
            stage={opening.stage}
            pulls={opening.pulls}
            names={names}
            onTear={tear}
            onClose={() => setOpening(null)}
          />
        )}
      </Modal>
    </View>
  );
}

function PackCeremony({
  series,
  stage,
  pulls,
  names,
  onTear,
  onClose,
}: {
  series: PackSeries;
  stage: "sealed" | "tearing" | "revealed";
  pulls: PackPull[];
  names: Record<string, string>;
  onTear: () => void;
  onClose: () => void;
}) {
  const window = useWindowDimensions();
  const cardWidth = Math.min(window.width * 0.66, 260);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.92)",
        alignItems: "center",
        justifyContent: "center",
        gap: spacing(5),
      }}
    >
      {stage !== "revealed" ? (
        <>
          <Tap onPress={onTear} disabled={stage === "tearing"}>
            <PackArt
              name={series.name}
              setNumber={series.setNumber}
              width={Math.min(window.width * 0.62, 250)}
            />
          </Tap>
          <Muted>{stage === "tearing" ? "Tearing…" : "Tap the pack to tear it open"}</Muted>
          <Tap onPress={onClose} hitSlop={12}>
            <Text style={{ color: colors.textMuted }}>Not yet</Text>
          </Tap>
        </>
      ) : (
        <>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ alignItems: "center" }}
          >
            {pulls.map((pull, index) => (
              <View
                key={`${pull.slug}-${index}`}
                style={{
                  width: window.width,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <FlipCard
                  pull={pull}
                  name={names[pull.slug] ?? pull.slug}
                  width={cardWidth}
                  last={index === pulls.length - 1}
                />
              </View>
            ))}
          </ScrollView>
          <Muted>
            Swipe through your pulls. Tap to flip, hold to see the rarity. The last
            one is your best.
          </Muted>
          <Button label="Done" variant="secondary" onPress={onClose} />
        </>
      )}
    </View>
  );
}

/** Face-down card: tap flips it, holding glows its rarity colour. */
function FlipCard({
  pull,
  name,
  width,
  last,
}: {
  pull: PackPull;
  name: string;
  width: number;
  last: boolean;
}) {
  const height = Math.round(width * 1.44);
  const flip = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const [flipped, setFlipped] = useState(false);

  const color = RARITY_COLOR[pull.rarity] ?? colors.textSecondary;

  const doFlip = () => {
    if (flipped) return;
    setFlipped(true);
    Animated.spring(flip, { toValue: 1, speed: 8, bounciness: 6, useNativeDriver: true }).start();
  };

  const front = flip.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });
  const back = flip.interpolate({ inputRange: [0, 1], outputRange: ["180deg", "360deg"] });

  return (
    <Pressable
      onPress={doFlip}
      onPressIn={() =>
        Animated.timing(glow, { toValue: 1, duration: 180, useNativeDriver: true }).start()
      }
      onPressOut={() =>
        Animated.timing(glow, { toValue: 0, duration: 250, useNativeDriver: true }).start()
      }
    >
      <View style={{ width, height }}>
        {/* The rarity halo, alive only under a held finger. */}
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: -10,
            left: -10,
            right: -10,
            bottom: -10,
            borderRadius: 18,
            borderWidth: 3,
            borderColor: color,
            opacity: glow,
            shadowColor: color,
            shadowOpacity: 0.9,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 0 },
          }}
        />

        {/* Face down. */}
        <Animated.View
          style={{
            position: "absolute",
            width,
            height,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.borderStrong,
            backgroundColor: "#141a2b",
            alignItems: "center",
            justifyContent: "center",
            gap: spacing(2),
            backfaceVisibility: "hidden",
            transform: [{ perspective: 1000 }, { rotateY: front }],
          }}
        >
          <Image
            source={require("../assets/cardflare-mark.png")}
            style={{ height: 90, width: 76, resizeMode: "contain", opacity: 0.8 }}
          />
          {last && <Muted>Your best pull waits here</Muted>}
          <Muted>Tap to flip</Muted>
        </Animated.View>

        {/* Face up. */}
        <Animated.View
          style={{
            position: "absolute",
            width,
            height,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: color,
            backgroundColor: colors.elevated,
            alignItems: "center",
            justifyContent: "center",
            gap: spacing(2),
            padding: spacing(3),
            backfaceVisibility: "hidden",
            transform: [{ perspective: 1000 }, { rotateY: back }],
          }}
        >
          <Text
            style={{
              color: colors.textPrimary,
              fontWeight: "700",
              fontSize: 18,
              textAlign: "center",
            }}
          >
            {name}
          </Text>
          <Text
            style={{
              color,
              fontSize: 14,
              fontWeight: "600",
              textTransform: "capitalize",
            }}
          >
            {pull.rarity}
          </Text>
          {pull.duplicate && (
            <Muted>Already yours: +{pull.embersInstead} Embers</Muted>
          )}
        </Animated.View>
      </View>
    </Pressable>
  );
}
