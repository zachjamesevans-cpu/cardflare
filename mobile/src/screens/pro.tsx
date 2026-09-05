import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, ScrollView, Text, View } from "react-native";

import type { StackParams } from "../../App";
import { getProfile } from "../api";
import { API_BASE } from "../config";
import { PRO_PRICE_FALLBACK, buyPro, proPrice, restorePro, syncOwnedPro } from "../pro";
import { AsyncButton, Card, Muted, Tap } from "../ui";
import { colors, radius, spacing } from "../theme";

/**
 * The Pro paywall — the one place the subscription is sold.
 *
 * Every path that hits the Pro wall (tapping a cosmetic, the GIF
 * button, the profile's own upgrade row) lands here, so the pitch,
 * the price and the small print live in exactly one screen.
 *
 * The benefits list matches the website's pricing card word for word,
 * per the parity rule. The price comes from the App Store so it is
 * right in every storefront currency; $7.99 only stands in until the
 * store answers.
 *
 * App Review requires the auto-renewal terms and working links to the
 * terms of use and privacy policy on any subscription screen — that is
 * the small print at the bottom, and it opens the site's real pages.
 */

const BENEFITS: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [
  {
    icon: "sparkles",
    text: "Wear cosmetics: rings, auras, card borders, titles",
  },
  {
    icon: "film-outline",
    text: "Animated everything, including GIF profile pictures",
  },
  {
    icon: "sync-outline",
    text: "Your look follows you on web and app",
  },
];

export function ProScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();

  const [playerId, setPlayerId] = useState<string | null>(null);
  const [pro, setPro] = useState(false);
  const [price, setPrice] = useState(PRO_PRICE_FALLBACK);
  const [message, setMessage] = useState<string | null>(null);

  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  /* Who is buying, and whether they already did. Refreshed on focus so
     coming back after a purchase elsewhere shows the truth. */
  useFocusEffect(
    useCallback(() => {
      void (async () => {
        try {
          const result = await getProfile();
          if (!alive.current) return;
          setPlayerId(result.profile.playerId);
          setPro(result.profile.pro ?? false);
          /* Not Pro on the server, but maybe Pro on the phone: a paid
             transaction the confirm step dropped. Finish it here. */
          if (!result.profile.pro && (await syncOwnedPro()) && alive.current) {
            setPro(true);
          }
        } catch {
          /* The screen still pitches; the button will say sign in. */
        }
      })();
    }, []),
  );

  useEffect(() => {
    void proPrice().then((found) => {
      if (alive.current) setPrice(found);
    });
  }, []);

  const subscribe = async () => {
    if (!playerId) {
      setMessage("Sign in first, so Pro knows whose look to unlock.");
      return;
    }
    setMessage(null);
    const outcome = await buyPro(playerId);
    if (!alive.current) return;

    if (outcome.kind === "pro") {
      setPro(true);
      setMessage(null);
      return;
    }
    if (outcome.kind === "cancelled") return;
    if (outcome.kind === "pending") {
      setMessage(
        "Waiting for approval. Once it is approved, open this screen again and Pro will be on.",
      );
      return;
    }
    if (outcome.kind === "unconfirmed") {
      setMessage(
        "Your purchase went through but we could not confirm it yet. Tap Restore purchases in a moment; nothing is lost.",
      );
      return;
    }
    if (outcome.kind === "unavailable") {
      setMessage(
        "The App Store is not available right now. Update the app or try again later.",
      );
      return;
    }
    setMessage(`That purchase did not go through: ${outcome.message}`);
  };

  const restore = async () => {
    setMessage(null);
    const outcome = await restorePro();
    if (!alive.current) return;

    if (outcome.kind === "pro") {
      setPro(true);
      setMessage("Pro restored. Welcome back.");
      return;
    }
    if (outcome.kind === "none") {
      setMessage("No Pro subscription found on this Apple ID.");
      return;
    }
    if (outcome.kind === "unavailable") {
      setMessage(
        "The App Store is not available right now. Update the app or try again later.",
      );
      return;
    }
    setMessage(`Restore did not finish: ${outcome.message}`);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.canvas }}
      contentContainerStyle={{ padding: spacing(4), gap: spacing(4) }}
    >
      <View style={{ gap: spacing(1) }}>
        <Text style={{ color: colors.accent, fontSize: 13, fontWeight: "700" }}>
          CARDFLARE PRO
        </Text>
        <Text style={{ color: colors.textPrimary, fontSize: 24, fontWeight: "800" }}>
          Wear your collection.
        </Text>
        <Muted>
          Free accounts change their profile picture. Pro wears everything: every
          ring, aura, border and title you own, moving, on both your profiles.
        </Muted>
      </View>

      <Card style={{ gap: spacing(3) }}>
        {BENEFITS.map((benefit) => (
          <View
            key={benefit.text}
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              gap: spacing(2.5),
            }}
          >
            <Ionicons name={benefit.icon} size={18} color={colors.accent} />
            <Text
              style={{
                color: colors.textPrimary,
                fontSize: 14,
                fontWeight: "600",
                flex: 1,
              }}
            >
              {benefit.text}
            </Text>
          </View>
        ))}

        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.border,
            paddingTop: spacing(3),
            gap: spacing(2),
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
            <Text
              style={{ color: colors.textPrimary, fontSize: 28, fontWeight: "800" }}
            >
              {price}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 14 }}>/month</Text>
          </View>

          {pro ? (
            <View
              style={{
                borderRadius: radius.control,
                borderWidth: 1,
                borderColor: colors.accent,
                backgroundColor: "rgba(198,238,79,0.12)",
                padding: spacing(3),
                flexDirection: "row",
                alignItems: "center",
                gap: spacing(2),
              }}
            >
              <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
              <Text style={{ color: colors.accent, fontSize: 14, fontWeight: "700" }}>
                You are Pro. Go get dressed.
              </Text>
            </View>
          ) : (
            <AsyncButton
              label="Subscribe to Pro"
              pendingLabel="Opening the App Store…"
              onPress={subscribe}
            />
          )}

          {pro && (
            <AsyncButton
              label="Open Customize"
              pendingLabel="Opening…"
              variant="secondary"
              onPress={async () =>
                navigation.navigate("Customize", { area: "profile" })
              }
            />
          )}
        </View>
      </Card>

      {message && <Muted>{message}</Muted>}

      {!pro && (
        <AsyncButton
          label="Restore purchases"
          pendingLabel="Checking with the App Store…"
          variant="secondary"
          onPress={restore}
        />
      )}

      {/* The small print App Review reads for: renewal terms and live
          links to the real terms and privacy pages. */}
      <View style={{ gap: spacing(2) }}>
        <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 17 }}>
          {price}/month, billed through your Apple ID. The subscription renews
          automatically each month until cancelled. Cancel anytime in your iPhone's
          Settings, at least 24 hours before the period ends. If Pro lapses, your
          equipped cosmetics stop showing but stay saved for when you return.
        </Text>
        <View style={{ flexDirection: "row", gap: spacing(4) }}>
          <Tap
            onPress={() => void Linking.openURL(`${API_BASE}/terms`)}
            accessibilityLabel="Terms of use"
            hitSlop={8}
          >
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
              Terms of use
            </Text>
          </Tap>
          <Tap
            onPress={() => void Linking.openURL(`${API_BASE}/privacy`)}
            accessibilityLabel="Privacy policy"
            hitSlop={8}
          >
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
              Privacy policy
            </Text>
          </Tap>
        </View>
      </View>
    </ScrollView>
  );
}
