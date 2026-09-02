import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";

import type { StackParams } from "../../App";
import {
  getLocal,
  listLocalThreads,
  openLocalThread,
  setLocalRadius,
  storedAccessToken,
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
  type ZoomCard,
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
  | { kind: "threads-heading" }
  | { kind: "thread"; thread: LocalThread }
  | { kind: "flares-heading" }
  | { kind: "flare"; flare: LocalFlare }
  | { kind: "group"; flares: LocalFlare[] }
  | { kind: "empty" }
  | { kind: "no-threads" };

export function LocalScreen({
  threadsOnly = false,
}: {
  /** Local switched off: the conversations people already had, and
      nothing near-you at all. See src/local-enabled.ts. */
  threadsOnly?: boolean;
}) {
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
    if (!threadsOnly && (await haveLocationPermission())) {
      const outcome = await requestCoords();
      if (outcome.status === "granted") coords = outcome.coords;
    }
    if (!isCurrent()) return;
    setAt(coords);

    try {
      const [nextFeed, nextThreads] = await Promise.all([
        threadsOnly ? null : getLocal(coords),
        listLocalThreads(),
      ]);
      if (!isCurrent()) return;
      setFeed(nextFeed);
      setThreads(nextThreads.threads);
      setFailure(null);
    } catch {
      if (!isCurrent()) return;
      setFailure(
        threadsOnly
          ? "Messages could not load. Pull to try again."
          : "Local could not load. Pull to try again.",
      );
    }
  }, [threadsOnly]);

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
          <Title>{threadsOnly ? "Messages" : "Flares near you"}</Title>
          <Body>
            {threadsOnly
              ? "Your conversations about cards live here. Sign in to read them."
              : "Local shows every Flare posted near you, and lets you message the poster when you have the card. Sign in and it lights up."}
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
  if (feed) rows.push({ kind: "radius" });
  if (threads.length > 0) {
    if (!threadsOnly) rows.push({ kind: "threads-heading" });
    for (const thread of threads) rows.push({ kind: "thread", thread });
  } else if (threadsOnly && signedIn) {
    rows.push({ kind: "no-threads" });
  }
  if (feed) {
    rows.push({ kind: "flares-heading" });
    if (feed.flares.length === 0) rows.push({ kind: "empty" });

    /*
     * Cards posted together stay together.
     *
     * The board has grouped a pasted deck under one folder since
     * `posted_batch` arrived — "decks posted in one paste group together,
     * not thirty loose rows" — and Local now carries the same batch id,
     * so it can do the same thing rather than scrolling somebody's whole
     * deck past everybody nearby one card at a time.
     */
    const seen = new Set<string>();
    for (const flare of feed.flares) {
      if (!flare.batchId) {
        rows.push({ kind: "flare", flare });
        continue;
      }
      if (seen.has(flare.batchId)) continue;
      seen.add(flare.batchId);

      const group = feed.flares.filter((other) => other.batchId === flare.batchId);
      if (group.length === 1) rows.push({ kind: "flare", flare });
      else rows.push({ kind: "group", flares: group });
    }
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
          case "threads-heading":
            return <Heading text="Messages" />;
          case "no-threads":
            return (
              <Card>
                <Title>No conversations yet</Title>
                <Body>
                  When somebody answers one of your Flares, the conversation lands
                  here.
                </Body>
              </Card>
            );
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
          case "group":
            return (
              <FlareGroup
                flares={item.flares}
                onThreadOpened={(threadId) =>
                  navigation.navigate("LocalThread", { threadId })
                }
              />
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

/**
 * Several cards posted in one act, shown as one post.
 *
 * The founder asked for it and the board already had it: a deck put up
 * together reads as one thing with its cards inside, not as thirty
 * separate rows between other people's. The header carries what the
 * whole group has in common — who, where, how far, when — so each card
 * underneath is just the card.
 *
 * Every image opens the same zoom the rest of the app uses, with the
 * group as its shelf, so a swipe walks the deck.
 */
function FlareGroup({
  flares,
  onThreadOpened,
}: {
  flares: LocalFlare[];
  onThreadOpened: (threadId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const lead = flares[0];
  if (!lead) return null;

  const shelf: ZoomCard[] = flares.map((flare) => ({
    imageUrl: flare.imageUrl,
    name: flare.cardName,
    cardNumber: flare.cardNumber,
    caption: flare.printingLabel,
    note: flare.note,
    lookingFor: flare.quantity,
    direction: flare.intent === "showcase" ? "showcase" : "want",
  }));

  return (
    <Card>
      <Tap onPress={() => setOpen((was) => !was)}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              style={{ color: colors.textPrimary, fontWeight: "700" }}
            >
              {lead.deckLabel?.trim() || `${flares.length} cards`}
            </Text>
            <Text
              numberOfLines={1}
              style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}
            >
              {lead.poster.name}
              {lead.isYours ? " (you)" : ""}
              {lead.storeName ? ` · ${lead.storeName}` : ""} · {milesLabel(lead.miles)} ·{" "}
              {agoLabel(lead.postedAt)}
            </Text>
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>
            {open ? "▴" : `${flares.length} ▾`}
          </Text>
        </View>
      </Tap>

      {/* The faces, always — a group nobody can see into is a headline
          with no story. Tapping one opens the zoom on the whole deck. */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing(2) }}>
        {flares.map((flare, index) => (
          <CardImage
            key={flare.flareId}
            imageUrl={flare.imageUrl}
            width={48}
            name={flare.cardName}
            cardNumber={flare.cardNumber}
            caption={flare.printingLabel}
            note={flare.note}
            lookingFor={flare.quantity}
            direction={flare.intent === "showcase" ? "showcase" : "want"}
            siblings={shelf}
            position={index}
          />
        ))}
      </View>

      {open
        ? flares.map((flare) => (
            <FlareRow
              key={flare.flareId}
              flare={flare}
              onThreadOpened={onThreadOpened}
            />
          ))
        : null}
    </Card>
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
        {/* The same zoom the rest of the app uses — the founder: "should
            be able to click the images in local to do the same zoom view
            that we have throughout the rest of the app." A flat thumbnail
            here was the one card face in the product that did nothing
            when tapped. */}
        <CardImage
          imageUrl={flare.imageUrl}
          width={48}
          name={flare.cardName}
          cardNumber={flare.cardNumber}
          caption={flare.printingLabel}
          note={flare.note}
          lookingFor={flare.quantity}
          direction={flare.intent === "showcase" ? "showcase" : "want"}
        />

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
