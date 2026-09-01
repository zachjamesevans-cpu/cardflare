import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";

import type { StackParams } from "../../App";
import {
  getLocal,
  listLocalThreads,
  openLocalThread,
  postAreaFlare,
  searchCards,
  setLocalRadius,
  storedAccessToken,
  type CardHit,
  type LocalFeed,
  type LocalFlare,
  type LocalThread,
} from "../api";
import {
  LOCAL_RADII,
  MESSAGE_MAX_LENGTH,
  agoLabel,
  milesLabel,
} from "../local-shared";
import { haveLocationPermission, requestCoords, type Coords } from "../location";
import { NearbyLocationAsk } from "../nearby-location-ask";
import { RemoteImage } from "../remote-image";
import { colors, spacing } from "../theme";
import { AsyncButton, Body, Button, Card, ErrorLine, Input, Muted, Tap, Title } from "../ui";

/**
 * Local — the tab that took Room's place in the bar.
 *
 * The founder's reframe: Room was a screen for four nights a month, and
 * the live room rides the Feed as a banner now. This slot goes to the
 * other twenty-six days: every Flare posted at a store near you, and
 * the conversations they start. "I have this" is the hinge — it opens a
 * thread tied to that exact card, and it is deliberately the ONLY way
 * to message anybody.
 *
 * Location follows the standing rules: a granted permission sends
 * coordinates that ride one request and are never stored; otherwise the
 * profile ZIP's centroid answers; with neither, the screen IS the ask.
 * Distance arrives as a number the server computed — no coordinate of
 * any store or player ever reaches the app.
 */

type Row =
  | { kind: "radius" }
  | { kind: "compose" }
  | { kind: "threads-heading" }
  | { kind: "thread"; thread: LocalThread }
  | { kind: "flares-heading" }
  | { kind: "flare"; flare: LocalFlare }
  | { kind: "empty" };

export function LocalScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();

  const [feed, setFeed] = useState<LocalFeed | null>(null);
  const [threads, setThreads] = useState<LocalThread[]>([]);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const load = useCallback(async (isCurrent: () => boolean = () => true) => {
    const token = await storedAccessToken();
    if (!isCurrent()) return;
    if (!token) {
      setSignedIn(false);
      return;
    }
    setSignedIn(true);

    /* A permission we already hold is used quietly; the screen never
       pops the system dialog on its own — the ask card does that. */
    let coords: Coords | null = null;
    if (await haveLocationPermission()) {
      const outcome = await requestCoords();
      if (outcome.status === "granted") coords = outcome.coords;
    }
    if (!isCurrent()) return;

    try {
      const [nextFeed, nextThreads] = await Promise.all([
        getLocal(coords),
        listLocalThreads(),
      ]);
      if (!isCurrent()) return;
      setFeed(nextFeed);
      setThreads(nextThreads.threads);
      setFailure(null);
    } catch {
      if (!isCurrent()) return;
      setFailure("Local could not load. Pull to try again.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let current = true;
      void load(() => current);
      return () => {
        current = false;
      };
    }, [load]),
  );

  const refresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  if (signedIn === false) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.canvas, padding: spacing(4) }}>
        <Card>
          <Title>Flares near you</Title>
          <Body>
            Local shows every Flare posted near you, and lets you message the poster
            when you have the card. Sign in and it lights up.
          </Body>
          <Button label="Sign in" onPress={() => navigation.navigate("SignIn")} />
        </Card>
      </View>
    );
  }

  if (feed && feed.source === "none") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.canvas, padding: spacing(4) }}>
        <Card>
          <Title>Flares near you</Title>
          <Body>
            Local shows every Flare posted near you, and you can message the poster
            when you have the card. It just needs to know roughly where you are,
            once.
          </Body>
          <NearbyLocationAsk onDone={() => void load()} intro={null} />
        </Card>
      </View>
    );
  }

  const rows: Row[] = [];
  if (feed) rows.push({ kind: "radius" }, { kind: "compose" });
  if (threads.length > 0) {
    rows.push({ kind: "threads-heading" });
    for (const thread of threads) rows.push({ kind: "thread", thread });
  }
  if (feed) {
    rows.push({ kind: "flares-heading" });
    if (feed.flares.length === 0) rows.push({ kind: "empty" });
    for (const flare of feed.flares) rows.push({ kind: "flare", flare });
  }

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.canvas }}
      contentContainerStyle={{ padding: spacing(4), gap: spacing(3) }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      data={rows}
      keyExtractor={(row, index) =>
        row.kind === "thread"
          ? row.thread.threadId
          : row.kind === "flare"
            ? row.flare.flareId
            : `${row.kind}-${index}`
      }
      ListHeaderComponent={failure ? <ErrorLine message={failure} /> : null}
      renderItem={({ item }) => {
        switch (item.kind) {
          case "radius":
            return <RadiusRow current={feed!.radius} onSaved={() => void load()} />;
          case "compose":
            return <ComposeArea onPosted={() => void load()} />;
          case "threads-heading":
            return <Heading text="Messages" />;
          case "thread":
            return (
              <ThreadRow
                thread={item.thread}
                onOpen={() =>
                  navigation.navigate("LocalThread", { threadId: item.thread.threadId })
                }
              />
            );
          case "flares-heading":
            return <Heading text="Wanted near you" />;
          case "empty":
            return (
              <Card>
                <Title>Nothing on the boards within {feed!.radius} miles</Title>
                <Body>
                  Post the card you are hunting and anyone nearby can answer.
                  Flares posted at a store near you land here too.
                </Body>
              </Card>
            );
          case "flare":
            return (
              <FlareRow
                flare={item.flare}
                onThreadOpened={(threadId) =>
                  navigation.navigate("LocalThread", { threadId })
                }
              />
            );
        }
      }}
    />
  );
}

/**
 * Saying what you are hunting, from wherever you are.
 *
 * The founder's brief for Local was "should be intuitive", and every
 * decision here is a subtraction to earn that: no room to join, no code
 * to scan, no store to pick, no form. Type a name or a number, tap the
 * card, it is up. One copy, happy to trade, is the assumption — the
 * common case should cost two taps, and the uncommon one can be edited
 * from the row afterwards.
 *
 * This posts. It never publishes a saved want: a list kept at home is
 * private, and choosing to be visible is the whole difference.
 */
function ComposeArea({ onPosted }: { onPosted: () => void }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<CardHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  /* The same debounce the room's search uses: a card list is a network
     call and a name is typed a letter at a time. */
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setHits(null);
      return;
    }

    let current = true;
    const timer = setTimeout(() => {
      searchCards(trimmed)
        .then((result) => {
          if (current) setHits(result.cards);
        })
        .catch(() => {
          if (current) setHits([]);
        });
    }, 300);

    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query]);

  const post = async (card: CardHit) => {
    setBusy(true);
    setSaid(null);
    setFailed(false);

    try {
      const result = await postAreaFlare({ cardId: card.id });

      if (result.ok) {
        setQuery("");
        setHits(null);
        setSaid(`${card.name} is up. People near you can see it now.`);
        onPosted();
        return;
      }

      setFailed(true);
      setSaid(result.message ?? "Could not post that.");
    } catch (caught) {
      setFailed(true);
      setSaid(readablePostFailure(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <Title>What are you hunting?</Title>
      <Muted>
        Post it here and anyone near you can say they have it. No room needed.
      </Muted>

      <Input
        value={query}
        onChangeText={(next) => {
          setQuery(next);
          setSaid(null);
        }}
        placeholder="Card name or number"
        autoCorrect={false}
      />

      {said ? (
        <Text
          style={{ color: failed ? colors.danger : colors.accent, fontSize: 13 }}
        >
          {said}
        </Text>
      ) : null}

      {hits?.length === 0 && query.trim().length >= 2 ? (
        <Muted>Nothing by that name yet.</Muted>
      ) : null}

      {(hits ?? []).slice(0, 6).map((card) => (
        <Tap key={card.id} disabled={busy} onPress={() => void post(card)}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing(3),
              paddingVertical: spacing(2),
              borderTopWidth: 1,
              borderTopColor: colors.border,
            }}
          >
            {/* The base printing leads the row, the same rule the website
                uses for a card with many versions. */}
            <Thumb
              uri={
                (card.printings.find((p) => p.id === card.basePrintingId) ??
                  card.printings[0])?.imageUrl ?? null
              }
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                numberOfLines={1}
                style={{ color: colors.textPrimary, fontWeight: "700" }}
              >
                {card.name}
              </Text>
              <Text
                numberOfLines={1}
                style={{ color: colors.textMuted, fontSize: 12, fontFamily: "Menlo" }}
              >
                {card.cardNumber}
              </Text>
            </View>
            <Text style={{ color: colors.accent, fontWeight: "700", fontSize: 13 }}>
              Post
            </Text>
          </View>
        </Tap>
      ))}
    </Card>
  );
}

/**
 * A posting failure a player can read.
 *
 * `http-404` is the one worth translating, and it is not a bug: this app
 * build is newer than the server it is talking to. TestFlight and Vercel
 * ship on different clocks, so there is always a window where a screen
 * exists on the phone and its endpoint does not yet exist in the cloud.
 * "http-404" reads as broken; the truth is "not yet", and it fixes
 * itself. The same translation `NearbyLocationAsk` already makes.
 */
function readablePostFailure(caught: unknown): string {
  const raw = caught instanceof Error ? caught.message : "";

  if (raw === "http-404") {
    return "Posting from Local isn't live yet. Try again after the next update.";
  }
  if (raw === "network" || raw === "timeout") {
    return "No connection. Check your signal and try again.";
  }

  return "Could not post that.";
}

function Heading({ text }: { text: string }) {
  return (
    <Text
      style={{
        color: colors.textSecondary,
        fontSize: 12,
        fontWeight: "700",
        letterSpacing: 1,
        textTransform: "uppercase",
        marginTop: spacing(2),
      }}
    >
      {text}
    </Text>
  );
}

/** The distances Local offers, as chips. Saving reloads the list. */
function RadiusRow({ current, onSaved }: { current: number; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [chosen, setChosen] = useState(current);

  const choose = async (radius: number) => {
    if (busy || radius === chosen) return;
    setChosen(radius);
    setBusy(true);
    try {
      await setLocalRadius(radius);
      onSaved();
    } catch {
      setChosen(current);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}>
      <Muted>Within</Muted>
      {LOCAL_RADII.map((radius) => (
        <Tap
          key={radius}
          onPress={() => void choose(radius)}
          disabled={busy}
          style={{
            paddingHorizontal: spacing(3),
            paddingVertical: spacing(1),
            borderRadius: 999,
            borderWidth: 1,
            borderColor: chosen === radius ? colors.accent : colors.borderStrong,
            backgroundColor: chosen === radius ? colors.accent : "transparent",
          }}
        >
          <Text
            style={{
              fontSize: 13,
              fontWeight: "700",
              color: chosen === radius ? colors.accentContrast : colors.textSecondary,
            }}
          >
            {radius} mi
          </Text>
        </Tap>
      ))}
    </View>
  );
}

function Thumb({ uri }: { uri: string | null }) {
  return (
    <View
      style={{
        width: 48,
        aspectRatio: 60 / 84,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.elevated,
        overflow: "hidden",
      }}
    >
      {uri && <RemoteImage uri={uri} style={{ width: "100%", height: "100%" }} />}
    </View>
  );
}

function ThreadRow({ thread, onOpen }: { thread: LocalThread; onOpen: () => void }) {
  return (
    <Tap onPress={onOpen}>
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(3) }}>
          <Thumb uri={thread.imageUrl} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              style={{ color: colors.textPrimary, fontWeight: "700" }}
            >
              {thread.withName}
              <Text style={{ color: colors.textMuted, fontWeight: "400" }}>
                {"  ·  "}
                {thread.cardName}
              </Text>
            </Text>
            <Text
              numberOfLines={1}
              style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}
            >
              {thread.closed
                ? "Conversation ended"
                : (thread.lastMessagePreview ?? "")}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end", gap: spacing(1) }}>
            <Muted>{agoLabel(thread.lastMessageAt)}</Muted>
            {thread.unread > 0 && (
              <View
                style={{
                  minWidth: 20,
                  borderRadius: 999,
                  backgroundColor: colors.accent,
                  paddingHorizontal: 6,
                }}
              >
                <Text
                  style={{
                    color: colors.accentContrast,
                    fontSize: 12,
                    fontWeight: "800",
                    textAlign: "center",
                    lineHeight: 20,
                  }}
                >
                  {thread.unread}
                </Text>
              </View>
            )}
          </View>
        </View>
      </Card>
    </Tap>
  );
}

function FlareRow({
  flare,
  onThreadOpened,
}: {
  flare: LocalFlare;
  onThreadOpened: (threadId: string) => void;
}) {
  const [composing, setComposing] = useState(false);

  const accepts =
    flare.acceptsTrade && flare.acceptsCash
      ? "trade or cash"
      : flare.acceptsCash
        ? "cash"
        : "trade";

  return (
    <Card>
      <View style={{ flexDirection: "row", gap: spacing(3) }}>
        <Thumb uri={flare.imageUrl} />

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={{ color: colors.textPrimary, fontWeight: "700" }}
          >
            {flare.cardName}
            {flare.quantity > 1 && (
              <Text style={{ color: colors.accent }}> ×{flare.quantity}</Text>
            )}
          </Text>
          <Text
            numberOfLines={1}
            style={{ color: colors.textMuted, fontSize: 12, fontFamily: "Menlo" }}
          >
            {flare.cardNumber}
            {flare.printingLabel ? ` · ${flare.printingLabel}` : ""}
          </Text>
          <Text
            numberOfLines={1}
            style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}
          >
            {flare.poster.name}
            {flare.isYours ? " (you)" : ""}
            {flare.storeName ? ` · ${flare.storeName}` : ""} ·{" "}
            {milesLabel(flare.miles)}
          </Text>
          {flare.note ? (
            <Text
              numberOfLines={2}
              style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}
            >
              {flare.note}
            </Text>
          ) : null}
          <Muted>
            {flare.intent === "showcase" ? "Trading away" : "Hunting"} · {accepts} ·{" "}
            {agoLabel(flare.postedAt)}
          </Muted>
        </View>
      </View>

      {flare.canMessage && !composing && (
        <Button label="I have this" onPress={() => setComposing(true)} />
      )}

      {composing && (
        <Composer
          flare={flare}
          onCancel={() => setComposing(false)}
          onOpened={onThreadOpened}
        />
      )}
    </Card>
  );
}

/** The first message. Sending it is what creates the conversation. */
function Composer({
  flare,
  onCancel,
  onOpened,
}: {
  flare: LocalFlare;
  onCancel: () => void;
  onOpened: (threadId: string) => void;
}) {
  const [body, setBody] = useState(`I have ${flare.cardName}. `);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setError(null);
    try {
      const result = await openLocalThread(flare.flareId, body.trim());
      if (result.ok && result.threadId) {
        onOpened(result.threadId);
        return;
      }
      setError(result.message ?? "Could not start the conversation.");
    } catch {
      setError("Could not start the conversation.");
    }
  };

  return (
    <View style={{ gap: spacing(2) }}>
      <Input
        value={body}
        onChangeText={setBody}
        multiline
        maxLength={MESSAGE_MAX_LENGTH}
        placeholder="Say what you have"
      />
      <View style={{ flexDirection: "row", gap: spacing(2) }}>
        <View style={{ flex: 1 }}>
          <AsyncButton label="Send" pendingLabel="Sending…" onPress={send} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="Cancel" variant="secondary" onPress={onCancel} />
        </View>
      </View>
      <ErrorLine message={error} />
      <Muted>
        Goes to {flare.poster.name} only. Meet at the store; never send money to
        somebody you have not met.
      </Muted>
    </View>
  );
}
