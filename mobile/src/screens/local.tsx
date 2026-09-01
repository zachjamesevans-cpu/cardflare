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
import { Highlighted, Pill, Stats, leadArt } from "./post-flare";
import { colors, radius, spacing } from "../theme";
import {
  AsyncButton,
  Body,
  Button,
  Card,
  CardImage,
  ErrorLine,
  Input,
  Muted,
  Tap,
  Title,
} from "../ui";

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
  /*
   * The coordinate this feed was read with, kept for as long as the tab
   * is mounted. Posting needs an origin too, and the profile ZIP is not
   * the only one Local accepts — reading it from a device and then being
   * told to go and type five digits before posting was a dead end of
   * exactly the kind this tab exists to remove. Never persisted.
   */
  const [at, setAt] = useState<Coords | null>(null);

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
    setAt(coords);

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
            return <ComposeArea at={at} onPosted={() => void load()} />;
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
function ComposeArea({
  at,
  onPosted,
}: {
  /** Where the reader is, when they granted it. Anchors the Flare. */
  at: Coords | null;
  onPosted: () => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<CardHit[] | null>(null);
  const [picked, setPicked] = useState<CardHit | null>(null);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  /* The one refusal that is not a fault: it has a fix, and the fix goes
     on this screen rather than in a sentence pointing somewhere else. */
  const [needsPostal, setNeedsPostal] = useState(false);

  /* The board's questions, in the board's order. */
  const [showcase, setShowcase] = useState(false);
  const [acceptsTrade, setAcceptsTrade] = useState(true);
  const [acceptsCash, setAcceptsCash] = useState(false);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");

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

  /** Opening a card resets its answers, so the last post cannot leak. */
  const choose = (card: CardHit) => {
    if (picked?.id === card.id) {
      setPicked(null);
      return;
    }
    setPicked(card);
    setShowcase(false);
    setAcceptsTrade(true);
    setAcceptsCash(false);
    setPrintingId(null);
    setQuantity(1);
    setNote("");
    setSaid(null);
  };

  const post = async (card: CardHit) => {
    setBusy(true);
    setSaid(null);
    setFailed(false);
    setNeedsPostal(false);

    try {
      const result = await postAreaFlare({
        cardId: card.id,
        printingId,
        quantity,
        note: note.trim() || null,
        intent: showcase ? "showcase" : "want",
        acceptsTrade,
        acceptsCash,
        latitude: at?.latitude,
        longitude: at?.longitude,
      });

      if (result.ok) {
        setQuery("");
        setHits(null);
        setPicked(null);
        setSaid(`${card.name} is up. People near you can see it now.`);
        onPosted();
        return;
      }

      setFailed(true);
      setSaid(result.message ?? "Could not post that.");
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "";
      setFailed(true);
      setNeedsPostal(code === "no-postal-code");
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
        <Text style={{ color: failed ? colors.danger : colors.accent, fontSize: 13 }}>
          {said}
        </Text>
      ) : null}

      {needsPostal ? (
        <NearbyLocationAsk
          intro={null}
          onDone={() => {
            setNeedsPostal(false);
            setFailed(false);
            setSaid("Thanks — tap Post again.");
            /* Reload the tab, which is what re-reads the coordinate this
               composer posts with. Without it the permission is granted
               and the next tap still posts with the stale nothing. */
            onPosted();
          }}
        />
      ) : null}

      {hits?.length === 0 && query.trim().length >= 2 ? (
        <Muted>Nothing by that name yet.</Muted>
      ) : null}

      {(hits ?? []).slice(0, 6).map((card) => (
        <View key={card.id}>
          {/*
           * The board's own result row, drawn by the board's own code.
           *
           * The founder: "when clicking a card or searching in local it
           * should match exactly what's in the normal flare room search —
           * such as the drop down for alt arts. same language across the
           * platform is very important to me." So this is not a row that
           * resembles Post a Flare's; it is the same art rule, the same
           * quiet meta line, the same stats, the same "N versions, alt
           * arts and promos", and the same chevron, from the same
           * helpers. A copy would have drifted the first time either was
           * touched.
           */}
          <Tap onPress={() => choose(card)}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                gap: spacing(3),
                paddingVertical: spacing(2),
                borderTopWidth: 1,
                borderTopColor: colors.border,
              }}
            >
              <CardImage
                imageUrl={leadArt(card)}
                width={40}
                name={card.name}
                cardNumber={card.cardNumber}
              />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ color: colors.textPrimary, fontWeight: "700" }}>
                  <Highlighted text={card.name} term={query} />
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    columnGap: spacing(2),
                  }}
                >
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                    <Highlighted text={card.cardNumber} term={query} />
                  </Text>
                  {[
                    card.printings.length === 1
                      ? (card.printings[0]?.label ?? null)
                      : null,
                    card.cardType,
                    card.colors.length > 0 ? card.colors.join(" / ") : null,
                  ]
                    .filter((part): part is string => !!part)
                    .map((part) => (
                      <Text
                        key={part}
                        style={{ color: colors.textMuted, fontSize: 12 }}
                      >
                        {part}
                      </Text>
                    ))}
                </View>
                <Stats hit={card} />
                {picked?.id !== card.id && card.printings.length > 1 && (
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                    {`${card.printings.length} versions, alt arts and promos`}
                  </Text>
                )}
              </View>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                {picked?.id === card.id ? "▴" : "▾"}
              </Text>
            </View>
          </Tap>

          {/*
           * The board's composer, opened inside the row that was tapped.
           *
           * Same sections, same order, same words as Post a Flare: a
           * Local that asked a different set of questions would teach two
           * products, and a Flare that cannot name an alternate art is
           * not the Flare somebody meant to post.
           */}
          {picked?.id === card.id ? (
            <View style={{ gap: spacing(2), paddingBottom: spacing(3) }}>
              <Body>Is this a card you want, or one you have?</Body>
              <View style={{ flexDirection: "row", gap: spacing(2) }}>
                <Pill
                  label="I want this"
                  active={!showcase}
                  onPress={() => setShowcase(false)}
                />
                <Pill
                  label="I have this"
                  active={showcase}
                  onPress={() => setShowcase(true)}
                />
              </View>

              <Body>Trade or cash?</Body>
              <View style={{ flexDirection: "row", gap: spacing(2) }}>
                {/* Never both off: a Flare nobody can answer is not a
                    Flare. The server enforces it too. */}
                <Pill
                  label="Trade"
                  active={acceptsTrade}
                  disabled={acceptsTrade && !acceptsCash}
                  onPress={() => setAcceptsTrade(!acceptsTrade)}
                />
                <Pill
                  label="Cash"
                  active={acceptsCash}
                  disabled={acceptsCash && !acceptsTrade}
                  onPress={() => setAcceptsCash(!acceptsCash)}
                />
              </View>

              <Body>Which printing?</Body>
              <View style={{ gap: spacing(2) }}>
                {[
                  { id: null as string | null, label: "Any printing", imageUrl: null },
                  ...card.printings.map((printing) => ({
                    id: printing.id as string | null,
                    label: printing.label ?? "Standard printing",
                    imageUrl: printing.imageUrl,
                  })),
                ].map((option) => (
                  <Tap
                    key={option.id ?? "any"}
                    onPress={() => setPrintingId(option.id)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: spacing(3),
                      backgroundColor: colors.elevated,
                      borderColor:
                        printingId === option.id ? colors.accent : colors.border,
                      borderWidth: printingId === option.id ? 2 : 1,
                      borderRadius: radius.control,
                      padding: spacing(2),
                    }}
                  >
                    {option.id !== null && (
                      <CardImage
                        imageUrl={option.imageUrl}
                        width={36}
                        name={card.name}
                        cardNumber={card.cardNumber}
                        caption={option.label}
                      />
                    )}
                    <Text
                      style={{ color: colors.textSecondary, flex: 1, fontSize: 13 }}
                    >
                      {option.label}
                    </Text>
                  </Tap>
                ))}
              </View>

              <Body>How many?</Body>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: spacing(3) }}
              >
                <Button
                  label="−"
                  variant="secondary"
                  onPress={() => setQuantity((q) => Math.max(1, q - 1))}
                />
                <Text
                  style={{
                    color: colors.textPrimary,
                    fontSize: 17,
                    fontWeight: "700",
                    minWidth: 24,
                    textAlign: "center",
                  }}
                >
                  {quantity}
                </Text>
                <Button
                  label="+"
                  variant="secondary"
                  onPress={() => setQuantity((q) => Math.min(20, q + 1))}
                />
              </View>

              <Input
                value={note}
                onChangeText={setNote}
                placeholder="Note (optional)"
                maxLength={280}
              />

              <AsyncButton
                label="Post the Flare"
                pendingLabel="Posting…"
                disabled={busy}
                onPress={() => post(card)}
              />
            </View>
          ) : null}
        </View>
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

  if (raw === "not-migrated") {
    return "Posting from Local isn't switched on yet. The server needs its latest update.";
  }
  if (raw === "no-postal-code") {
    return "Tell us roughly where you are and the card goes up.";
  }
  if (raw === "already-posted") {
    return "That card is already up.";
  }
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
