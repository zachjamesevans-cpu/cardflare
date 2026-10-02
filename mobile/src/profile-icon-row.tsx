import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";

import { colors, spacing } from "./theme";
import { Tap } from "./ui";

/**
 * The row of destinations under a profile's header: the app's half of
 * src/components/players/profile-icon-row.tsx, same stops, same
 * words, same order.
 *
 * The founder, on the old profile: it "feels cluttered and more like a
 * management dashboard than a social profile"; he wants "important
 * features represented as clear destinations/icons" with the deeper
 * information one tap in. So the hunts, the binders, the trades, the
 * Embers and the settings are each a round door here, and the panels
 * and cards that used to stack down the page live behind them.
 *
 * Your own profile has all five. Somebody else's has Hunts and
 * Binders: never their settings, their trades or their Embers.
 */

export type ProfileStop = "hunts" | "binders" | "trades" | "embers" | "settings";

const STOPS: Record<
  ProfileStop,
  { label: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  hunts: { label: "Hunts", icon: "locate-outline" },
  binders: { label: "Binders", icon: "book-outline" },
  trades: { label: "Trades", icon: "swap-horizontal-outline" },
  embers: { label: "Embers", icon: "flame-outline" },
  settings: { label: "Settings", icon: "settings-outline" },
};

const OWN: ProfileStop[] = ["hunts", "binders", "trades", "embers", "settings"];
const THEIRS: ProfileStop[] = ["hunts", "binders"];

/** The circle each stop sits in. */
const CIRCLE = 44;

export function ProfileIconRow({
  yours,
  onOpen,
}: {
  yours: boolean;
  onOpen: (stop: ProfileStop) => void;
}) {
  const stops = yours ? OWN : THEIRS;
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-evenly",
        alignItems: "flex-start",
        gap: spacing(2),
      }}
    >
      {stops.map((stop) => (
        <Tap
          key={stop}
          onPress={() => onOpen(stop)}
          accessibilityLabel={STOPS[stop].label}
          style={{ alignItems: "center", gap: spacing(1.5), minWidth: 56 }}
        >
          <View
            style={{
              width: CIRCLE,
              height: CIRCLE,
              borderRadius: CIRCLE / 2,
              backgroundColor: colors.elevated,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name={STOPS[stop].icon} size={20} color={colors.textPrimary} />
          </View>
          <Text
            style={{ color: colors.textSecondary, fontSize: 11, fontWeight: "600" }}
          >
            {STOPS[stop].label}
          </Text>
        </Tap>
      ))}
    </View>
  );
}
