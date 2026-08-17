import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useState } from "react";
import { Image, Linking, ScrollView, Text, View } from "react-native";

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
import { Body, Button, Card, CardImage, Muted, Tap, Title } from "../ui";
import { PlayerAvatar } from "../player-avatar";
import { API_BASE } from "../config";
import { colors, spacing } from "../theme";

/**
 * The Feed tab — what is on, and who needs what you are holding.
 *
 * Scanning is not here. It used to be the card at the bottom of this
 * screen, and the founder cut it: "move the qr code scanner/code entry
 * to Room. No need to have that in the feed." Room is the tab you are
 * already opening when you are standing at a counter, and this one is
 * for reading. A signed-in player still gets their locals here — the
 * stores they actually go to, saved automatically on every join.
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

/**
 * What the two starter items say — the website's copy, word for word.
 *
 * Kept as data rather than two more branches below, because the pair are
 * the same card with different words in it and the shape is the
 * argument: a question, why it is worth answering, and one button.
 */
const STARTERS = {
  store: {
    icon: "map-marker-outline",
    headline: "Where do you play?",
    body: "Join your store's room once and it saves itself here, with its next board and who is hunting what. The code is on the counter.",
    label: "Enter a store code",
  },
  deck: {
    icon: "clipboard-list-outline",
    headline: "What are you hunting?",
    body: "Paste a deck list and every card in it becomes a want. Walk into any room and it offers to post the lot in one go.",
    label: "Paste a deck list",
  },
} as const;

/**
 * The mark is taller than it is wide — BRAND.md's one rule about it. It
 * is sized by height here and its width follows the artwork.
 */
const MARK_ASPECT = 60 / 72;

export function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
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
    navigation.navigate("Tabs", { screen: "Room" });
  };

  /*
   * Where a notice's button goes on a phone.
   *
   * The link is stored as a website path, because that is the one form
   * both platforms can read and the only form the database accepts. The
   * handful the app has a screen for are routed to it; anything else
   * opens the website, which is honest — the button always ends up
   * where its label said it would.
   */
  const follow = (href: string) => {
    if (href.startsWith("/e/")) {
      void enter(href.slice(3));
      return;
    }
    if (href === "/room") {
      navigation.navigate("Tabs", { screen: "Room" });
      return;
    }
    if (href === "/profile/settings") {
      navigation.navigate("Settings");
      return;
    }
    if (href === "/profile") {
      navigation.navigate("Tabs", { screen: "Profile" });
      return;
    }
    if (href === "/feed") {
      navigation.navigate("Tabs", { screen: "Feed" });
      return;
    }
    void Linking.openURL(`${API_BASE}${href}`).catch(() => {});
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
        item.kind === "announcement" ? (
          <Card key={`announcement-${index}`}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}
            >
              {/* The mark, not a face. There is no CardFlare player and
                  this is the item that has to look like it knows that. */}
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.elevated,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Image
                  source={require("../../assets/cardflare-mark.png")}
                  style={{ height: 20, width: 20 * MARK_ASPECT, resizeMode: "contain" }}
                />
              </View>
              <View style={{ flexShrink: 1 }}>
                <Title>{item.headline}</Title>
                <Muted>CardFlare</Muted>
              </View>
            </View>

            <Body>{item.body}</Body>

            {item.linkLabel && item.linkHref ? (
              <Button
                label={item.linkLabel}
                variant="secondary"
                onPress={() => follow(item.linkHref as string)}
              />
            ) : null}
          </Card>
        ) : item.kind === "start" ? (
          <Card key={`start-${index}`}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.elevated,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <MaterialCommunityIcons
                  name={STARTERS[item.topic].icon}
                  size={20}
                  color={colors.accent}
                />
              </View>
              <View style={{ flexShrink: 1 }}>
                <Title>{STARTERS[item.topic].headline}</Title>
              </View>
            </View>

            <Body>{STARTERS[item.topic].body}</Body>

            <Button
              label={STARTERS[item.topic].label}
              onPress={() =>
                item.topic === "store"
                  ? navigation.navigate("Tabs", { screen: "Room" })
                  : navigation.navigate("Settings")
              }
            />
          </Card>
        ) : item.kind === "traded" ? (
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
            {/* A local needs no address — you drive there. A room
                somewhere you have never been needs a place attached. */}
            <Muted>
              {item.yours || !item.city
                ? item.storeName
                : `${item.storeName} · ${item.city}`}
            </Muted>
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
