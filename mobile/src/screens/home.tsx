import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";

import type { StackParams } from "../../App";
import {
  getFeed,
  type FeedItem,
  getMe,
  joinRoom,
  postFlare,
  rememberRoom,
  removeLocal,
  storedAccessToken,
  type Me,
} from "../api";
import { AsyncButton, Body, Button, Card, CardImage, Input, Muted, Tap, Title } from "../ui";
import { PlayerAvatar } from "../player-avatar";
import { colors, spacing } from "../theme";

/**
 * The Join tab — the front door, guest-first like the website: scan the
 * counter code or type it. A signed-in player also gets their locals —
 * the stores they actually go to, saved automatically on every join —
 * so the second visit never needs the QR code at all.
 */
/**
 * When the doors open, in the store's own clock — the website's `doorsAt`.
 *
 * A board days out needs a day and an hour and nothing else, and "open
 * since" is what the room's own formatter would say, which is true of an
 * event underway and wrong about every board this line is drawn for.
 */
function doorsAt(startsAt: string | null, timeZone: string): string {
  if (!startsAt) return "Taking Flares early";

  return `Doors ${new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(startsAt))}`;
}

export function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const [code, setCode] = useState("");
  const [me, setMe] = useState<Me | null>(null);
  /* What is on at the places you go, and who needs what you have. The
     website's Feed, from the same server answer. */
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [rsvping, setRsvping] = useState<string | null>(null);
  const locals = me?.locals ?? [];

  useFocusEffect(
    useCallback(() => {
      let live = true;

      void (async () => {
        if (!(await storedAccessToken())) {
          if (live) {
            setMe(null);
            setFeed([]);
          }
          return;
        }
        try {
          const fresh = await getMe();
          if (live) setMe(fresh);
        } catch {
          if (live) setMe(null);
        }

        /* Its own try: the feed is the screen's headline, but a feed that
           failed must not take the locals list down with it. */
        try {
          const fresh = await getFeed();
          if (live) setFeed(fresh.items);
        } catch {
          if (live) setFeed([]);
        }
      })();

      return () => {
        live = false;
      };
    }, []),
  );

  const enter = async (raw: string) => {
    await rememberRoom(raw.trim().toUpperCase());
    setCode("");
    navigation.navigate("Tabs", { screen: "Room" });
  };

  /*
   * "I'll be there", the app's way: join the early board under the
   * account's own name and post every saved want. Duplicates already on
   * the board are skipped by the server, so this is safe to repeat.
   */
  const rsvp = async (local: Me["locals"][number]) => {
    if (!me || !local.nextEventCode || rsvping) return;
    setRsvping(local.storeId);
    try {
      await joinRoom(local.nextEventCode, me.player.displayName);
      for (const want of me.wants) {
        await postFlare(local.nextEventCode, {
          cardId: want.cardId,
          printingId: want.printingId,
          quantity: want.quantity,
          note: want.note ?? undefined,
          deckLabel: want.deckLabel,
        }).catch(() => {});
      }
      await rememberRoom(local.nextEventCode);
      navigation.navigate("Tabs", { screen: "Room" });
    } catch {
      // The Room tab shows the truthful state; nothing to add here.
    } finally {
      setRsvping(null);
    }
  };

  const nextLine = (local: Me["locals"][number]) => {
    if (local.liveNow) return "A room is open right now";
    if (local.nextEventAt) {
      const day = new Date(local.nextEventAt).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
      return `Next: ${local.nextEventName} · ${day}`;
    }
    return "Tap to see what's happening";
  };

  return (
    <ScrollView contentContainerStyle={{ padding: spacing(4), gap: spacing(4) }}>
      {/*
       * The Feed leads. Everything here is derived - nobody posts to it -
       * so a pilot with six players still opens something worth reading.
       * The website's two item kinds, in the website's order: people
       * before places, because a board will still be there tomorrow and
       * somebody needing a card you are holding will not.
       */}
      {feed.map((item, index) =>
        item.kind === "traded" ? (
          <Card key={`traded-${index}`}>
            <Body>
              {`${item.requester} traded for ${item.cardName}${
                item.holder ? ` with ${item.holder}` : ""
              } at ${item.storeName}.`}
            </Body>
          </Card>
        ) : item.kind === "added" ? (
          <Card key={`added-${index}`}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}
            >
              <PlayerAvatar
                displayName={item.displayName}
                seed={item.playerId}
                avatarUrl={item.avatarUrl}
                frame={item.frame}
                ring={item.ring}
                size={40}
              />
              <View style={{ flexShrink: 1 }}>
                <Title>{item.displayName}</Title>
                <Muted>{`added ${item.total} ${
                  item.total === 1 ? "card" : "cards"
                } to their binder`}</Muted>
              </View>
            </View>

            <View style={{ flexDirection: "row", gap: spacing(2) }}>
              {item.cards.map((card) => (
                <CardImage
                  key={card.cardId}
                  imageUrl={card.imageUrl}
                  width={48}
                  name={card.cardName}
                  cardNumber={card.cardNumber}
                  /* Ringed only when it is on YOUR list, same as the web. */
                  youHave={card.onYourList ? { kind: "exact", count: 0 } : null}
                />
              ))}
            </View>

            {item.onYourListCount > 0 && (
              <Text style={{ color: colors.accent, fontWeight: "600" }}>
                {item.onYourListCount === 1
                  ? "One of these is on your want list"
                  : `${item.onYourListCount} of these are on your want list`}
              </Text>
            )}
          </Card>
        ) : item.kind === "suggest" ? (
          <Card key={`suggest-${index}`}>
            <Title>Worth following</Title>
            <Muted>Their binders answer what you&rsquo;re hunting.</Muted>
            {item.players.map((person) => (
              <Tap
                key={person.playerId}
                onPress={() =>
                  navigation.navigate("PlayerProfile", { playerId: person.playerId })
                }
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing(2),
                }}
              >
                <PlayerAvatar
                  displayName={person.displayName}
                  seed={person.playerId}
                  avatarUrl={person.avatarUrl}
                  size={36}
                />
                <View style={{ flexShrink: 1 }}>
                  <Text style={{ color: colors.textPrimary, fontWeight: "700" }}>
                    {person.displayName}
                  </Text>
                  {/* Always "wants": the list is plural even when the
                      overlap with it is one card. */}
                  <Muted>{`has ${person.answers} of your wants`}</Muted>
                </View>
              </Tap>
            ))}
          </Card>
        ) : item.kind === "hunt" ? (
          <Card key={`hunt-${index}`}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}
            >
              <PlayerAvatar
                displayName={item.displayName}
                seed={item.playerId}
                avatarUrl={item.avatarUrl}
                frame={item.frame}
                ring={item.ring}
                size={40}
              />
              <View style={{ flexShrink: 1 }}>
                <Title>{item.displayName}</Title>
                <Muted>
                  {`${
                    item.total === 1 ? "is hunting" : `is hunting ${item.total} cards`
                  }${item.deckLabel ? ` · ${item.deckLabel}` : ""} · ${item.eventName}`}
                </Muted>
              </View>
            </View>

            {/* One card reads as a card; a deck reads as a row of them.
                A player posting thirty cards is one thing that happened,
                not thirty — the founder's rule for the whole Feed. */}
            {item.total === 1 && item.cards[0] ? (
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}
              >
                <CardImage
                  imageUrl={item.cards[0].imageUrl}
                  width={56}
                  name={item.cards[0].cardName}
                  cardNumber={item.cards[0].cardNumber}
                  youHave={
                    item.cards[0].match
                      ? { kind: item.cards[0].match, count: 0 }
                      : undefined
                  }
                />
                <View style={{ flexShrink: 1 }}>
                  <Text style={{ color: colors.textPrimary, fontWeight: "700" }}>
                    {item.cards[0].cardName}
                  </Text>
                  <Muted>{item.cards[0].cardNumber}</Muted>
                  {item.cards[0].match ? (
                    <Text style={{ color: colors.accent, fontWeight: "600" }}>
                      {item.cards[0].match === "exact"
                        ? "You have this"
                        : "You have another printing"}
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : (
              <View style={{ gap: spacing(2) }}>
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing(2) }}
                >
                  {item.cards.map((card) => (
                    <CardImage
                      key={card.cardId}
                      imageUrl={card.imageUrl}
                      width={48}
                      name={card.cardName}
                      cardNumber={card.cardNumber}
                      youHave={card.match ? { kind: card.match, count: 0 } : undefined}
                    />
                  ))}
                  {item.total > item.cards.length ? (
                    <Muted>{`+${item.total - item.cards.length} more`}</Muted>
                  ) : null}
                </View>
                {item.youCanAnswer > 0 ? (
                  <Text style={{ color: colors.accent, fontWeight: "600" }}>
                    {`You can answer ${item.youCanAnswer} of ${item.total}`}
                  </Text>
                ) : null}
              </View>
            )}

            {/* Every item ends in a place and a time. */}
            <Button
              label={`Go to ${item.storeName}`}
              onPress={() => void enter(item.code)}
            />
          </Card>
        ) : (
          <Card key={`board-${index}`}>
            <Muted>{item.storeName}</Muted>
            <Title>{item.eventName}</Title>
            <Muted>{item.live ? "Open now" : doorsAt(item.startsAt, item.timeZone)}</Muted>

            {item.youCanAnswer > 0 && (
              <>
                <Text style={{ color: colors.accent, fontWeight: "600" }}>
                  {`You can answer ${item.youCanAnswer} ${
                    item.youCanAnswer === 1 ? "card" : "cards"
                  } on this board`}
                </Text>
                <View style={{ flexDirection: "row", gap: spacing(2) }}>
                  {item.sample.map((card) => (
                    <CardImage
                      key={card.cardId}
                      imageUrl={card.imageUrl}
                      width={48}
                      name={card.cardName}
                      cardNumber={card.cardNumber}
                      youHave={card.match ? { kind: card.match, count: 0 } : undefined}
                    />
                  ))}
                </View>
              </>
            )}

            <Button
              label={item.live ? "Go to the room" : "See the board"}
              variant="secondary"
              onPress={() => void enter(item.code)}
            />
          </Card>
        ),
      )}

      {locals.length > 0 && (
        <Card>
          <Title>Your locals</Title>
          <Muted>
            Saved automatically when you join signed in. Tap one to walk in, no
            QR needed.
          </Muted>
          {/* Divided rows, RSVP inside its own row - the web's list,
              exactly. The button carries the count so the tap never
              posts more than it said. */}
          <View>
            {locals.map((local, index) => (
              <View
                key={local.storeId}
                style={{
                  gap: spacing(2),
                  paddingVertical: spacing(3),
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: colors.border,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing(2),
                  }}
                >
                  <Tap
                    onPress={() => void enter(local.code)}
                    style={{ flex: 1, gap: 2 }}
                  >
                    <Text style={{ color: colors.textPrimary, fontWeight: "700" }}>
                      {local.name}
                    </Text>
                    <Text
                      style={{
                        color: local.liveNow ? colors.accent : colors.textMuted,
                        fontSize: 12,
                      }}
                    >
                      {nextLine(local)}
                    </Text>
                  </Tap>
                  <Tap
                    onPress={() => {
                      setMe((current) =>
                        current
                          ? {
                              ...current,
                              locals: current.locals.filter(
                                (entry) => entry.storeId !== local.storeId,
                              ),
                            }
                          : current,
                      );
                      void removeLocal(local.storeId).catch(() => {});
                    }}
                    hitSlop={8}
                  >
                    <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                      Remove
                    </Text>
                  </Tap>
                </View>

                {local.earlyOpen && local.nextEventCode && (
                  <Button
                    label={
                      rsvping === local.storeId
                        ? "Joining the board…"
                        : me && me.wants.length > 0
                          ? `I'll be there. Post my ${me.wants.length} ${
                              me.wants.length === 1 ? "Flare" : "Flares"
                            }`
                          : "I'll be there"
                    }
                    variant="secondary"
                    onPress={() => void rsvp(local)}
                    busy={rsvping === local.storeId}
                  />
                )}
              </View>
            ))}
          </View>
        </Card>
      )}

      {/* Below your stores now, not above them. The tab is Feed: what is
          on at the places you go leads, and scanning is the thing you
          reach for when you are standing in one. */}
      <Card>
        <Title>Join a room</Title>
        <Body>
          Scan the code on the store&rsquo;s counter, or type it if scanning is
          awkward. No account needed.
        </Body>

        <Button label="Scan a QR code" onPress={() => navigation.navigate("Scan")} />

        <View style={{ flexDirection: "row", gap: spacing(2) }}>
          <View style={{ flex: 1 }}>
            <Input
              value={code}
              onChangeText={setCode}
              placeholder="Or enter the code"
              autoCapitalize="characters"
              autoCorrect={false}
            />
          </View>
          <AsyncButton
            label="Go"
            pendingLabel="Opening…"
            variant="secondary"
            onPress={async () => {
              if (code.trim()) await enter(code);
            }}
          />
        </View>
      </Card>

      <Card>
        <Title>How it works</Title>
        <Body>
          Post a Flare for the card you&rsquo;re hunting. When somebody in the room
          has it, they raise a hand, and you go trade, in person, at the table.
        </Body>
      </Card>
    </ScrollView>
  );
}
