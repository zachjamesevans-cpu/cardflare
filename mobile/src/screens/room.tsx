import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { StackParams } from "../../App";
import {
  ApiError,
  confirmTrade,
  getMe,
  getRoom,
  joinRoom,
  lastRoom,
  offerOnFlare,
  postFlare,
  removeFlare,
  setOpenToTrades,
  storedAccessToken,
  type Me,
  type RoomFlare,
  type RoomState,
} from "../api";
import { Body, Button, Card, ErrorLine, Input, Muted, Title } from "../ui";
import { colors, radius, spacing } from "../theme";

const POLL_MS = 20_000;

/**
 * The Room tab — the app's rendering of `/e/[code]`, at the website's
 * depth: the lobby with presence, the board grouped under whoever posted
 * (because "who do I go and talk to" is the actual question), offers
 * with a where-to-find-me note, open-to-trades, and a bottom action bar
 * that keeps Post a Flare one thumb away.
 */
export function RoomTab() {
  const [code, setCode] = useState<string | null>(null);
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();

  useFocusEffect(
    useCallback(() => {
      void lastRoom().then(setCode);
    }, []),
  );

  if (!code) {
    return (
      <View style={{ padding: spacing(4) }}>
        <Card>
          <Title>No room yet</Title>
          <Body>
            Scan a store&rsquo;s counter code from the Join tab and the room lives
            here.
          </Body>
          <Button label="Scan a code" onPress={() => navigation.navigate("Scan")} />
        </Card>
      </View>
    );
  }

  return <RoomScreen code={code} />;
}

function RoomScreen({ code }: { code: string }) {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const [state, setState] = useState<RoomState | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [wants, setWants] = useState<Me["wants"]>([]);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;

    try {
      const fresh = await getRoom(code);
      setState(fresh);
      setError(null);

      // The account's saved wants ride along so the room can offer to
      // re-post what is still outstanding — the whole point of signing in.
      if (fresh.joined && (await storedAccessToken())) {
        try {
          setWants((await getMe()).wants);
        } catch {
          setWants([]);
        }
      }
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status === 404
          ? "That code does not point at a room."
          : "Could not reach the room — check your connection and pull to retry.",
      );
    } finally {
      inFlight.current = false;
    }
  }, [code]);

  useEffect(() => {
    setState(null);
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      await joinRoom(code, name.trim() || undefined);
      await refresh();
    } catch (caught) {
      // The reason is named so a field report can say what actually failed.
      setError(
        caught instanceof ApiError
          ? caught.code === "not-open"
            ? "This room is not open right now."
            : caught.code === "timeout"
              ? "That took too long — check your connection and try again."
              : caught.code === "rate-limited"
                ? "Too many joins from here just now — wait a minute and try again."
                : `Could not join (${caught.code}). Try again.`
          : "Could not join. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  /** Every board action: do it, re-read the truth, never crash the screen. */
  const act = async (work: () => Promise<unknown>) => {
    try {
      await work();
    } catch {
      // The re-render shows the truthful state either way.
    }
    await refresh();
  };

  if (!state) {
    return (
      <View style={{ padding: spacing(4), gap: spacing(3) }}>
        <ErrorLine message={error} />
        {!error && <Muted>Loading the room…</Muted>}
        {error && <Button label="Try again" onPress={() => void refresh()} />}
      </View>
    );
  }

  /* A sleeping counter code: joining is what opens the walk-in room. */
  if (state.state === "lobby") {
    return (
      <ScrollView contentContainerStyle={{ padding: spacing(4), gap: spacing(4) }}>
        <Card>
          {state.store && <Muted>{state.store.name}</Muted>}
          <Title>Nothing on yet — start the room</Title>
          <Body>
            Trading is open here. Pick a name and you&rsquo;re in; the room opens
            with you.
          </Body>
          <ErrorLine message={error} />
          <Input
            value={name}
            onChangeText={setName}
            placeholder="Display name"
            autoCapitalize="words"
          />
          <Button
            label={busy ? "Joining…" : "Join"}
            onPress={() => void join()}
            busy={busy}
          />
        </Card>
      </ScrollView>
    );
  }

  if (state.state !== "room") {
    return (
      <View style={{ padding: spacing(4) }}>
        <Card>
          <Title>
            {state.state === "quiet"
              ? "Nothing on right now"
              : "Open this one on the website"}
          </Title>
          <Body>
            {state.state === "quiet"
              ? "This store is not running a room at the moment. Ask at the counter."
              : "Card shows live on cardflare.gg for now — scan the same code there."}
          </Body>
        </Card>
      </View>
    );
  }

  const room = state.room!;

  if (!state.joined) {
    return (
      <ScrollView contentContainerStyle={{ padding: spacing(4), gap: spacing(4) }}>
        <Card>
          <Muted>{room.storeName}</Muted>
          <Title>{room.name}</Title>
          {room.status !== "open" ? (
            <Body>This room is not open right now.</Body>
          ) : (
            <>
              <Body>Pick a name people in the room will recognise.</Body>
              <ErrorLine message={error} />
              <Input
                value={name}
                onChangeText={setName}
                placeholder="Display name"
                autoCapitalize="words"
              />
              <Button
                label={busy ? "Joining…" : "Join the room"}
                onPress={() => void join()}
                busy={busy}
              />
            </>
          )}
        </Card>
      </ScrollView>
    );
  }

  const youId = state.you!.sessionId;
  const participants = state.participants ?? [];
  const flares = state.flares ?? [];
  const youOpen = participants.some(
    (p) => p.playerSessionId === youId && p.openToTrades,
  );

  /* Outstanding = saved but not already my open Flare here, same rule as
     the website's re-post panel. */
  const myAsks = new Set(
    flares
      .filter((f) => f.playerSessionId === youId)
      .map((f) => `${f.cardId}:${f.printingId ?? ""}`),
  );
  const outstanding = wants.filter(
    (want) => !myAsks.has(`${want.cardId}:${want.printingId ?? ""}`),
  );

  /* The board groups under whoever posted, same as the website. */
  const groups = new Map<string, { name: string | null; flares: RoomFlare[] }>();
  for (const flare of flares) {
    const group = groups.get(flare.playerSessionId) ?? {
      name: flare.displayName,
      flares: [],
    };
    group.flares.push(flare);
    groups.set(flare.playerSessionId, group);
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ padding: spacing(4), gap: spacing(3), paddingBottom: spacing(24) }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.accent}
            onRefresh={() => {
              setRefreshing(true);
              void refresh().finally(() => setRefreshing(false));
            }}
          />
        }
      >
        <Card>
          <Muted>{room.storeName}</Muted>
          <Title>{room.name}</Title>
          <Muted>{`You're in as ${state.you!.displayName}`}</Muted>
        </Card>

        {outstanding.length > 0 && (
          <Card>
            <Title>Still hunting these from last time?</Title>
            <Body>
              {outstanding
                .map((w) =>
                  w.printingLabel ? `${w.cardName} (${w.printingLabel})` : w.cardName,
                )
                .join(" · ")}
            </Body>
            <Button
              label={`Post ${outstanding.length === 1 ? "it" : `all ${outstanding.length}`} to this room`}
              onPress={() =>
                void act(async () => {
                  for (const want of outstanding) {
                    await postFlare(code, {
                      cardId: want.cardId,
                      printingId: want.printingId,
                      quantity: want.quantity,
                      note: want.note ?? undefined,
                    }).catch(() => {});
                  }
                })
              }
            />
          </Card>
        )}

        {/* The lobby: who is here, present players first. */}
        <Card>
          <Title>{`In the room (${participants.length})`}</Title>
          <View style={styles.lobby}>
            {[...participants]
              .sort((a, b) => Number(b.present) - Number(a.present))
              .map((p) => (
                <View key={p.playerSessionId} style={styles.person}>
                  <View
                    style={[
                      styles.dot,
                      { backgroundColor: p.present ? colors.accent : colors.border },
                    ]}
                  />
                  <Text style={{ color: colors.textSecondary }} numberOfLines={1}>
                    {p.displayName ?? "A player"}
                    {p.playerSessionId === youId ? " (you)" : ""}
                    {p.openToTrades ? " · open to trades" : ""}
                  </Text>
                </View>
              ))}
          </View>
        </Card>

        {groups.size === 0 && (
          <Card>
            <Body>No Flares yet. Post the first one and the room will see it.</Body>
          </Card>
        )}

        {[...groups.entries()].map(([sessionId, group]) => {
          const mine = sessionId === youId;

          return (
            <Card key={sessionId}>
              <Title>
                {mine ? "Your Flares" : (group.name ?? "A player")}
              </Title>

              {group.flares.map((flare) => (
                <FlareRow
                  key={flare.id}
                  flare={flare}
                  mine={mine}
                  storeName={room.storeName}
                  onOffer={(message) =>
                    void act(() => offerOnFlare(code, flare.id, message))
                  }
                  onRemove={() => void act(() => removeFlare(code, flare.id))}
                  onTraded={(partner) =>
                    void act(() => confirmTrade(code, flare.id, partner))
                  }
                />
              ))}
            </Card>
          );
        })}
      </ScrollView>

      {/* The action bar: the two things a thumb reaches for in a room. */}
      <View style={styles.actionBar}>
        <View style={{ flex: 1 }}>
          <Button
            label="Post a Flare"
            onPress={() => navigation.navigate("PostFlare", { code })}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            label={youOpen ? "Open to trades ✓" : "I'm open to trades"}
            variant="secondary"
            onPress={() => void act(() => setOpenToTrades(code, !youOpen))}
          />
        </View>
      </View>
    </View>
  );
}

/** One Flare on the board: the card, your match, its offers, its actions. */
function FlareRow({
  flare,
  mine,
  storeName,
  onOffer,
  onRemove,
  onTraded,
}: {
  flare: RoomFlare;
  mine: boolean;
  storeName: string;
  onOffer: (message?: string) => void;
  onRemove: () => void;
  onTraded: (partnerSessionId?: string) => void;
}) {
  const [offering, setOffering] = useState(false);
  const [message, setMessage] = useState("");

  return (
    <View style={styles.flare}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing(2) }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "700" }}>
            {flare.cardName}
            {flare.quantity > 1 ? ` ×${flare.quantity}` : ""}
          </Text>
          <Muted>
            {`${flare.cardNumber} · ${flare.printingLabel ?? "Any printing"}`}
          </Muted>
        </View>
        {mine && (
          <Text style={styles.removeLink} onPress={onRemove}>
            Remove
          </Text>
        )}
      </View>

      {flare.note && <Body>{flare.note}</Body>}

      {flare.match === "exact" && (
        <Text style={{ color: colors.accent, fontWeight: "700" }}>You have this</Text>
      )}
      {flare.match === "other-printing" && (
        <Text style={{ color: colors.accent }}>You have another printing</Text>
      )}
      {flare.counterMayHave && (
        <Muted>{`${storeName} may have this single — ask at the counter.`}</Muted>
      )}

      {flare.offers.map((offer) => (
        <View key={offer.responderSessionId} style={styles.offer}>
          <Body>
            {`${offer.displayName ?? "A player"} has this — go find them.`}
            {offer.message ? ` “${offer.message}”` : ""}
            {offer.present ? "" : " (away right now)"}
          </Body>
          {mine && (
            <Button
              label="We traded"
              variant="secondary"
              onPress={() => onTraded(offer.responderSessionId)}
            />
          )}
        </View>
      ))}

      {mine && flare.offers.length === 0 && (
        <Text style={styles.removeLink} onPress={() => onTraded(undefined)}>
          Traded it? Mark it done
        </Text>
      )}

      {!mine && flare.match && !offering && (
        <Button label="Offer to trade" onPress={() => setOffering(true)} />
      )}
      {!mine && flare.match && offering && (
        <View style={{ gap: spacing(2) }}>
          <Input
            value={message}
            onChangeText={setMessage}
            placeholder="Where to find you? (optional)"
            maxLength={80}
          />
          <Button
            label="Send the offer"
            onPress={() => {
              setOffering(false);
              onOffer(message.trim() || undefined);
            }}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  lobby: { gap: spacing(1.5) },
  person: { flexDirection: "row", alignItems: "center", gap: spacing(2) },
  dot: { width: 8, height: 8, borderRadius: 4 },
  flare: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing(3),
    gap: spacing(2),
  },
  offer: {
    backgroundColor: colors.elevated,
    borderRadius: radius.control,
    padding: spacing(3),
    gap: spacing(2),
  },
  removeLink: {
    color: colors.textMuted,
    textDecorationLine: "underline",
    fontSize: 14,
  },
  actionBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    gap: spacing(2),
    padding: spacing(3),
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
