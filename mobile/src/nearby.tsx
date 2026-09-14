import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";

import {
  addHave,
  getGames,
  getHaves,
  getNearbySettings,
  lastSearchGame,
  rememberSearchGame,
  removeHave,
  searchCards,
  setHaveLocalTrade,
  openMatchThread,
  setNearbyMatching,
  type CardHit,
  type HaveEntry,
  type NearbyMatch,
  type NearbySettings,
} from "./api";
import { GameSearchField } from "./game-chips";
import { ALL_GAMES, resolveGameScope, searchPlaceholder } from "./game-scope";
import type { GameSlug } from "./games";
import { NearbyLocationAsk } from "./nearby-location-ask";
import { haveThisMessage, messageOpener } from "./nearby-shared";
import { PlayerAvatar } from "./player-avatar";
import { colors, radius, spacing } from "./theme";
import { Body, Button, CardImage, Card, ErrorLine, Muted, Tap, Title } from "./ui";

/**
 * Nearby matching on the Flare tab: the website's NearbyCard and
 * HaveListCard, natively.
 *
 * One switch for both directions, a ZIP asked for right here when
 * there is none, and the Have list with Trade locally on each row.
 * The list is the room's binder reached with no room; private to its
 * owner as it has always been.
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
            <Text style={{ color: colors.textPrimary, fontWeight: "600", fontSize: 15 }}>
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
        <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing(3) }}>
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

/** The Have list: add a card, mark it Trade locally, remove it. */
export function HaveList() {
  const [haves, setHaves] = useState<HaveEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setHaves((await getHaves()).haves);
    } catch {
      setHaves((current) => current ?? []);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const act = async (work: () => Promise<unknown>) => {
    setError(null);
    try {
      await work();
    } catch {
      setError("Could not change that right now.");
    }
    await load();
  };

  return (
    <Card>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: spacing(2),
        }}
      >
        <Title>Your Have list</Title>
        {haves ? (
          <Muted>{`${haves.length} ${haves.length === 1 ? "card" : "cards"}`}</Muted>
        ) : null}
      </View>

      {haves === null ? (
        <Muted>Loading…</Muted>
      ) : haves.length === 0 ? (
        <Body>
          Add the cards you would trade. Only you can see this list. Mark one Trade
          locally and people nearby hunting it are told they can answer you.
        </Body>
      ) : (
        <View>
          {haves.map((entry) => (
            <HaveRow
              key={entry.id}
              entry={entry}
              onToggle={(on) => act(() => setHaveLocalTrade(entry.id, on))}
              onRemove={() => act(() => removeHave(entry.id))}
            />
          ))}
        </View>
      )}

      <AddHave onAdded={() => void load()} />
      <ErrorLine message={error} />
    </Card>
  );
}

function HaveRow({
  entry,
  onToggle,
  onRemove,
}: {
  entry: HaveEntry;
  onToggle: (on: boolean) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [on, setOn] = useState(entry.localTrade);

  useEffect(() => setOn(entry.localTrade), [entry.localTrade]);

  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await work();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.row}>
      <View style={{ flexDirection: "row", gap: spacing(2), opacity: busy ? 0.6 : 1 }}>
        <CardImage
          imageUrl={entry.imageUrl}
          width={40}
          name={entry.cardName}
          cardNumber={entry.cardNumber}
          caption={entry.printingLabel ?? "Any printing"}
          note={entry.note}
        />
        <View style={{ flex: 1, gap: spacing(1) }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: spacing(2),
            }}
          >
            <Text style={styles.name} numberOfLines={2}>
              {entry.cardName}
              {entry.quantity > 1 ? ` ×${entry.quantity}` : ""}
            </Text>
            <Tap onPress={() => void run(onRemove)} disabled={busy} hitSlop={8}>
              <Text style={styles.removeLink}>Remove</Text>
            </Tap>
          </View>
          <Muted>{`${entry.cardNumber} · ${entry.printingLabel ?? "Any printing"}`}</Muted>
        </View>
        <View style={{ alignItems: "flex-end", gap: 2 }}>
          <Switch
            value={on}
            disabled={busy}
            onValueChange={(value) => {
              setOn(value);
              void run(() => onToggle(value));
            }}
            trackColor={{ false: colors.border, true: colors.accent }}
            thumbColor={on ? colors.accentContrast : colors.textMuted}
            accessibilityLabel="Trade locally"
          />
          <Text style={{ color: colors.textMuted, fontSize: 10 }}>Trade locally</Text>
        </View>
      </View>
    </View>
  );
}

/** The card search, the same one the showcase and the post form use. */
function AddHave({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<CardHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [playerGames, setPlayerGames] = useState<string[]>([]);
  const [remembered, setRemembered] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    let current = true;
    void lastSearchGame().then((value) => {
      if (current) setRemembered(value);
    });
    void getGames()
      .then((result) => {
        if (current) setPlayerGames(result.mine);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [open]);

  const scope = resolveGameScope({ playerGames, remembered });
  const scopedGame = scope.selected;
  const pickGame = (game: GameSlug | null) => {
    if (game === scopedGame) return;
    const value = game ?? ALL_GAMES;
    setRemembered(value);
    void rememberSearchGame(value);
    setQuery("");
    setHits([]);
  };

  useEffect(() => {
    if (query.trim().length < 2) {
      setHits([]);
      return;
    }
    const timer = setTimeout(() => {
      if (scopedGame && !scope.locked && remembered !== scopedGame) {
        setRemembered(scopedGame);
        void rememberSearchGame(scopedGame);
      }
      void searchCards(query.trim(), scopedGame)
        .then((result) => setHits(result.cards))
        .catch(() => setHits([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [query, scopedGame, scope.locked, remembered]);

  if (!open) {
    return <Button label="Add a card" variant="secondary" onPress={() => setOpen(true)} />;
  }

  const add = async (hit: CardHit) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await addHave(hit.id, hit.basePrintingId, 1);
      setQuery("");
      setHits([]);
      setOpen(false);
      onAdded();
    } catch {
      setError("Could not add that card. Your list may be full.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: spacing(2) }}>
      <GameSearchField
        scope={scope}
        playerGames={playerGames}
        onPick={pickGame}
        value={query}
        onChangeText={setQuery}
        autoFocus
        placeholder={searchPlaceholder(scopedGame)}
      />

      {hits.slice(0, 8).map((hit) => (
        <Tap
          key={hit.id}
          disabled={busy}
          onPress={() => void add(hit)}
          style={{
            borderRadius: radius.control,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.elevated,
            padding: spacing(3),
          }}
        >
          <Text style={{ color: colors.textPrimary, fontWeight: "600" }}>{hit.name}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>{hit.cardNumber}</Text>
        </Tap>
      ))}

      <ErrorLine message={error} />
      <Button label="Cancel" variant="secondary" onPress={() => setOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: spacing(2),
  },
  name: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
  },
  removeLink: {
    color: colors.textMuted,
    textDecorationLine: "underline",
    fontSize: 14,
  },
});

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
        <View style={{ flex: 1, flexDirection: "row", alignItems: "flex-start", gap: spacing(2) }}>
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
                {match.card.match === "other-printing" ? " · You have another printing" : ""}
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
