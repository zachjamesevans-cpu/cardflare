import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Switch, Text, View } from "react-native";

import {
  getNearbySettings,
  openMatchThread,
  setNearbyMatching,
  type NearbyMatch,
  type NearbySettings,
} from "./api";
import { NearbyLocationAsk } from "./nearby-location-ask";
import { haveThisMessage, messageOpener } from "./nearby-shared";
import { PlayerAvatar } from "./player-avatar";
import { colors, spacing } from "./theme";
import { Button, CardImage, Card, ErrorLine } from "./ui";

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
            onDone={() => void load()}
          />
        </View>
      ) : null}

      <ErrorLine message={error} />
    </Card>
  );
}

/**
 * One nearby match on the Feed: who, which card, how far, two buttons.
 * "I have this" opens the conversation with the first message already
 * sent; "Message" opens it empty. Both land on the thread.
 */
export function MatchRow({
  match,
  onOpen,
}: {
  match: NearbyMatch;
  /** Navigates to the thread once it exists. */
  onOpen: (threadId: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = async (message: boolean) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await openMatchThread(
        match.ask,
        message ? messageOpener() : haveThisMessage(null),
      );
      if (!result.ok || !result.threadId) {
        setError(result.message ?? "Could not start the conversation.");
        return;
      }
      onOpen(result.threadId);
    } catch {
      setError("Could not start the conversation.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: spacing(2.5) }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(2.5) }}>
        <CardImage
          imageUrl={match.card.imageUrl}
          width={44}
          name={match.card.cardName}
          cardNumber={match.card.cardNumber}
          youHave={{ kind: match.card.match, count: 0 }}
        />
        <View
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "flex-start",
            gap: spacing(2),
          }}
        >
          <PlayerAvatar
            displayName={match.wanter.displayName}
            seed={match.wanter.playerId}
            avatarUrl={match.wanter.avatarUrl}
            frame={match.wanter.frame}
            ring={match.wanter.ring}
            aura={match.wanter.aura}
            ringArt={match.wanter.ringArt}
            auraArt={match.wanter.auraArt}
            size={28}
          />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 14, lineHeight: 19 }}>
              <Text style={{ fontWeight: "700" }}>{match.wanter.displayName}</Text>
              {" is looking for your "}
              <Text style={{ fontWeight: "700" }}>{match.card.cardName}</Text>
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Ionicons name="location-outline" size={12} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                {match.milesLabel}
                {match.card.match === "other-printing"
                  ? " · You have another printing"
                  : ""}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {match.threadId ? (
        <View style={{ alignSelf: "flex-start" }}>
          <Button
            label="Open the conversation"
            variant="secondary"
            onPress={() => onOpen(match.threadId ?? "")}
          />
        </View>
      ) : (
        <View style={{ flexDirection: "row", gap: spacing(2) }}>
          <View style={{ flex: 1 }}>
            <Button label="I have this" busy={busy} onPress={() => void open(false)} />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label={`Message ${match.wanter.displayName.split(" ")[0]}`}
              variant="secondary"
              disabled={busy}
              onPress={() => void open(true)}
            />
          </View>
        </View>
      )}

      <ErrorLine message={error} />
    </View>
  );
}
