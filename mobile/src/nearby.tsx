import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Switch, Text, View } from "react-native";

import { getNearbySettings, setNearbyMatching, type NearbySettings } from "./api";
import { NearbyLocationAsk } from "./nearby-location-ask";
import { colors, spacing } from "./theme";
import { Card, ErrorLine } from "./ui";

/**
 * Nearby matching inside the Flare composer: the website's NearbyCard,
 * natively. One switch for both directions, and a ZIP asked for right
 * here when there is none.
 */
export function NearbyCard() {
  const [settings, setSettings] = useState<NearbySettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    getNearbySettings()
      .then(setSettings)
      .catch(() => {});

  useEffect(() => {
    void load();
  }, []);

  const flip = async (enabled: boolean) => {
    if (!settings) return;
    setSettings({ ...settings, enabled });
    setError(null);
    try {
      setSettings(await setNearbyMatching(enabled));
    } catch {
      setSettings({ ...settings, enabled: !enabled });
      setError("Could not change that right now.");
    }
  };

  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(3) }}>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}>
            <Ionicons name="flame" size={16} color={colors.accent} />
            <Text
              style={{ color: colors.textPrimary, fontWeight: "600", fontSize: 15 }}
            >
              Nearby matching
            </Text>
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17 }}>
            Match your Flares with cards people near you will trade, and theirs with
            yours. Only the two of you ever see a match.
          </Text>
        </View>
        <Switch
          value={settings?.enabled ?? false}
          disabled={settings === null}
          onValueChange={(value) => void flip(value)}
          trackColor={{ false: colors.border, true: colors.accent }}
          thumbColor={settings?.enabled ? colors.accentContrast : colors.textMuted}
          accessibilityLabel="Nearby matching"
        />
      </View>

      {settings?.enabled && !settings.postalCode ? (
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.border,
            paddingTop: spacing(3),
          }}
        >
          <NearbyLocationAsk
            intro="Nearby needs to know roughly where you are. Just the ZIP."
            keepAsZip
            onDone={() => void load()}
          />
        </View>
      ) : null}

      <ErrorLine message={error} />
    </Card>
  );
}
