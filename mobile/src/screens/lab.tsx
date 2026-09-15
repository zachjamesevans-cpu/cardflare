import { useState } from "react";
import { ScrollView, Text, View } from "react-native";

import { FlareFeedCard } from "../flare-feed-card";
import { useTabBarInset } from "../glass";
import { colors, radius, spacing } from "../theme";
import { Body, Card, Muted, Tap, Title } from "../ui";
import type { FeedEntry } from "../api";

/**
 * THE LAB: every state of a Feed post, without needing the state.
 *
 * The founder: "also make me a test enviornment so I can test all of
 * these future features in app somehow."
 *
 * The problem it solves is the one this app keeps hitting. A post only
 * looks right when somebody has posted the right thing - a deck of
 * thirty, a showcase, a Flare with a note, one that somebody has already
 * answered - and arranging that in real data means posting real Flares
 * to a real board. So three glitches reached TestFlight that a single
 * screenshot would have caught, and the fix for each was found by
 * getting the data into that shape by hand.
 *
 * This screen carries the shapes instead. Every sample below is a real
 * `FeedEntry` handed to the real component, so what is drawn here is
 * what the Feed draws - not a mock of it. A design change that breaks
 * the deck pager breaks it here, in the row below the one that still
 * works, where the difference is obvious.
 *
 * IT IS NOT WIRED TO ANYTHING. Liking a sample post calls a handler that
 * does nothing; nothing here reaches the server. That is the point: the
 * Lab is for looking, and a screen that could post would be a screen
 * that could post by accident.
 *
 * Reached from Profile → Settings → "Design lab". It ships in the binary
 * rather than behind a build flag, because the founder is the person who
 * needs it and he is holding a TestFlight build, not a debug one.
 */

/** One post, with every field a Feed post can carry. */
function sample(over: Record<string, unknown>): FeedEntry {
  return {
    kind: "hunt",
    postId: "p1",
    likes: 0,
    comments: 0,
    liked: false,
    code: null,
    storeName: null,
    eventName: null,
    playerId: "player-1",
    displayName: "CHUNC",
    avatarUrl: null,
    frame: null,
    ring: null,
    aura: null,
    deckLabel: null,
    postedAt: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
    milesAway: 1.1,
    storeId: null,
    acceptsTrade: true,
    acceptsCash: false,
    note: null,
    offers: 0,
    total: 1,
    youCanAnswer: 0,
    cards: [
      {
        cardId: "c1",
        cardName: "Monkey.D.Luffy (010)",
        cardNumber: "EB02-010",
        imageUrl: null,
        match: null,
        flareId: "f1",
        state: "open",
        youOffered: false,
      },
    ],
    yours: false,
    ...over,
  } as unknown as FeedEntry;
}

/**
 * The cases, each one a thing that has gone wrong before or a thing
 * nobody has looked at yet. Add to this list rather than posting a real
 * Flare to see a new state.
 */
const CASES: { title: string; why: string; item: FeedEntry }[] = [
  {
    title: "A want, one card",
    why: "The ordinary post. Everything else is this plus something.",
    item: sample({}),
  },
  {
    title: "Yours",
    why: "Carries the YOUR FLARE pill. The name beside it collapsed to nothing once, because flex was on a Tap.",
    item: sample({ yours: true, postId: "p2" }),
  },
  {
    title: "A showcase",
    why: "Points the other way. Read 'is hunting' until direction existed.",
    item: sample({ direction: "showcase", postId: "p3" }),
  },
  {
    title: "A deck",
    why: "Becomes a pager. The rail it replaced did not scroll inside the Feed.",
    item: sample({
      postId: "p4",
      total: 4,
      deckLabel: "Red Luffy",
      cards: [1, 2, 3, 4].map((n) => ({
        cardId: `c${n}`,
        cardName: `Card number ${n}`,
        cardNumber: `OP0${n}-00${n}`,
        imageUrl: null,
        match: null,
        flareId: `f${n}`,
        state: "open",
        youOffered: false,
      })),
    }),
  },
  {
    title: "Answered",
    why: "One card dims, not the whole post - the founder's rule.",
    item: sample({
      postId: "p5",
      cards: [
        {
          cardId: "c1",
          cardName: "Monkey.D.Luffy (010)",
          cardNumber: "EB02-010",
          imageUrl: null,
          match: null,
          flareId: "f1",
          state: "offered",
          youOffered: false,
        },
      ],
      offers: 2,
    }),
  },
  {
    title: "Liked, with a thread",
    why: "The counts are the only part of a post that moves on its own.",
    item: sample({ postId: "p6", likes: 12, comments: 3, liked: true }),
  },
  {
    title: "With a note, and cash",
    why: "Two optional lines that push everything below them down.",
    item: sample({
      postId: "p7",
      note: "Looking for near mint only. Happy to meet at the shop on Friday.",
      acceptsCash: true,
    }),
  },
  {
    title: "On a board",
    why: "The only case with somewhere to go, so it ends in a button.",
    item: sample({
      postId: "p8",
      code: "ABCD",
      storeName: "Mox Valley Games",
      eventName: "Friday Night",
      milesAway: null,
    }),
  },
];

export function LabScreen() {
  const tabInset = useTabBarInset();
  const [only, setOnly] = useState<number | null>(null);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.canvas }}
      contentContainerStyle={{
        padding: spacing(4),
        gap: spacing(4),
        paddingBottom: spacing(4) + tabInset,
      }}
    >
      <Card>
        <Title>Design lab</Title>
        <Body>
          Every shape a Feed post can take, drawn by the real component with
          made-up data. Nothing here touches the server: tapping a heart moves
          nothing, and no Flare below exists.
        </Body>
        <Muted>
          Add a case in mobile/src/screens/lab.tsx rather than posting a real
          Flare to see a new state.
        </Muted>
      </Card>

      {/* Tapping a title isolates that one, which is how you look at a
          single post without the others arguing for your attention. */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing(2) }}>
        {CASES.map((example, index) => {
          const on = only === index;
          return (
            <Tap
              key={example.title}
              onPress={() => setOnly(on ? null : index)}
              style={{
                borderRadius: radius.control,
                borderWidth: 1,
                borderColor: on ? colors.accent : colors.border,
                backgroundColor: on ? "rgba(198,238,79,0.08)" : colors.surface,
                paddingHorizontal: spacing(3),
                paddingVertical: spacing(2),
              }}
            >
              <Text
                style={{
                  color: on ? colors.accent : colors.textSecondary,
                  fontSize: 13,
                  fontWeight: "700",
                }}
              >
                {example.title}
              </Text>
            </Tap>
          );
        })}
      </View>

      {CASES.filter((_, index) => only === null || only === index).map(
        (example) => (
          <View key={example.title} style={{ gap: spacing(2) }}>
            <View style={{ gap: 2 }}>
              <Text
                style={{
                  color: colors.textPrimary,
                  fontSize: 15,
                  fontWeight: "800",
                }}
              >
                {example.title}
              </Text>
              <Muted>{example.why}</Muted>
            </View>

            <FlareFeedCard
              item={example.item as never}
              post={{
                postId: (example.item as { postId: string }).postId,
                yours: false,
                /* Inert, like everything else here. */
                offer: async () => {},
              }}
              onOpenProfile={() => {}}
              /* Deliberately inert. The Lab is for looking; a screen that
                 could post is a screen that could post by accident. */
              onLike={async () => {}}
              onOpenThread={() => {}}
              onEnterRoom={() => {}}
            />
          </View>
        ),
      )}
    </ScrollView>
  );
}
