import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";

import {
  ApiError,
  confirmTrade,
  getRoom,
  joinRoom,
  offerOnFlare,
  type RoomState,
} from "../api";
import { Body, Button, Card, ErrorLine, Input, Muted, Title } from "../ui";
import { colors, spacing } from "../theme";

const POLL_MS = 20_000;

/**
 * The room — the app's rendering of `/e/[code]`. Join if not joined,
 * then the board: every Flare, who can be answered, who raised a hand.
 * Polled on the same cadence as the website's ticker; pull to refresh
 * for the impatient.
 */
export function RoomScreen({
  code,
  onPostFlare,
}: {
  code: string;
  onPostFlare: () => void;
}) {
  const [state, setState] = useState<RoomState | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setState(await getRoom(code));
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status === 404
          ? "That code does not point at a room."
          : "Could not reach the room. Pull to retry.",
      );
    }
  }, [code]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const join = async () => {
    setBusy(true);
    try {
      await joinRoom(code, name.trim() || undefined);
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.code === "not-open"
          ? "This room is not open right now."
          : "Could not join. Check the name and try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const act = async (work: () => Promise<unknown>) => {
    try {
      await work();
      await refresh();
    } catch {
      await refresh();
    }
  };

  if (!state) {
    return (
      <View style={{ padding: spacing(4) }}>
        <ErrorLine message={error} />
        {!error && <Muted>Loading the room…</Muted>}
      </View>
    );
  }

  if (state.state !== "room") {
    return (
      <View style={{ padding: spacing(4) }}>
        <Card>
          <Title>
            {state.state === "quiet" ? "Nothing on right now" : "Open this one on the website"}
          </Title>
          <Body>
            {state.state === "quiet"
              ? "This store is not running a room at the moment. Ask at the counter."
              : "Card shows and pre-open lobbies live on cardflare.gg for now — scan the same code there."}
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
              <Button label={busy ? "Joining…" : "Join the room"} onPress={() => void join()} busy={busy} />
            </>
          )}
        </Card>
      </ScrollView>
    );
  }

  const youId = state.you!.sessionId;
  const flares = state.flares ?? [];

  return (
    <ScrollView
      contentContainerStyle={{ padding: spacing(4), gap: spacing(3) }}
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
        <Muted>
          {`${state.participants?.length ?? 0} in the room · you're in as ${state.you!.displayName}`}
        </Muted>
      </Card>

      <Button label="Post a Flare" onPress={onPostFlare} />

      {flares.length === 0 && (
        <Card>
          <Body>No Flares yet. Post the first one and the room will see it.</Body>
        </Card>
      )}

      {flares.map((flare) => {
        const mine = flare.playerSessionId === youId;

        return (
          <Card key={flare.id}>
            <Muted>{mine ? "Your Flare" : (flare.displayName ?? "A player")}</Muted>
            <Title>
              {flare.cardName}
              {flare.quantity > 1 ? ` ×${flare.quantity}` : ""}
            </Title>
            <Muted>
              {`${flare.cardNumber} · ${flare.printingLabel ?? "Any printing"}`}
            </Muted>
            {flare.note && <Body>{flare.note}</Body>}

            {flare.match === "exact" && (
              <Text style={{ color: colors.accent, fontWeight: "700" }}>
                You have this
              </Text>
            )}
            {flare.match === "other-printing" && (
              <Text style={{ color: colors.accent }}>You have another printing</Text>
            )}
            {flare.counterMayHave && (
              <Muted>{`${room.storeName} may have this single — ask at the counter.`}</Muted>
            )}

            {flare.offers.map((offer) => (
              <View key={offer.responderSessionId} style={{ gap: spacing(1) }}>
                <Body>
                  {`${offer.displayName ?? "A player"} has this — go find them.`}
                  {offer.message ? ` “${offer.message}”` : ""}
                  {offer.present ? "" : " (away right now)"}
                </Body>
                {mine && (
                  <Button
                    label="We traded"
                    variant="secondary"
                    onPress={() =>
                      void act(() =>
                        confirmTrade(code, flare.id, offer.responderSessionId),
                      )
                    }
                  />
                )}
              </View>
            ))}

            {!mine && flare.match && (
              <Button
                label="Offer to trade"
                onPress={() => void act(() => offerOnFlare(code, flare.id))}
              />
            )}
          </Card>
        );
      })}
    </ScrollView>
  );
}
