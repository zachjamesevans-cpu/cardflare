import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScrollView, Text, View } from "react-native";

import type { StackParams } from "../../App";
import { demoOn, setDemoMode } from "../demo/demo-mode";
import { DEMO_CARDS } from "../demo/demo-cards";
import { PEOPLE } from "../demo/demo-people";
import { answerDraft } from "../nearby-shared";
import { huntId, postId } from "../demo/demo-world";
import { queueProfileTour } from "../profile-tour";
import { colors, gutter, spacing } from "../theme";
import { Body, Button, Card, Muted, Tap, Title } from "../ui";

type Nav = NativeStackNavigationProp<StackParams>;

/**
 * The shot list: every screen the App Store set and the socials are
 * shot from, one tap away and already staged. Development builds only,
 * like demo mode itself (src/demo/demo-mode.ts).
 *
 * Each row says what to tap once it is open, where the shot is a
 * moment rather than a screen - the card viewer, a trade being
 * confirmed - so whoever holds the phone does the one tap and says
 * "shoot".
 */
interface Shot {
  title: string;
  tip: string;
  go: (nav: Nav) => void;
}

export const SHOTS: Shot[] = [
  {
    title: "1. The Feed",
    tip: "Hunts, held cards ringed in green, likes and comments.",
    go: (nav) => nav.navigate("Tabs", { screen: "Feed", params: { tab: "following" } }),
  },
  {
    title: "2. You have this",
    tip: "On Maya's Straw Hat Crew post, tap the Luffy (green ring).",
    go: (nav) => nav.navigate("Tabs", { screen: "Feed", params: { tab: "following" } }),
  },
  {
    title: "3. A trade in Messages",
    tip: "Maya's offer, the card she sent and the trade waiting on you. Tap Yes for the confirmed state.",
    go: (nav) => nav.navigate("LocalThread", { threadId: "demo-t-maya" }),
  },
  {
    title: "4. Messages",
    tip: "Seven conversations, unread ones on top.",
    go: (nav) => nav.navigate("Tabs", { screen: "Messages" }),
  },
  {
    title: "5. A hunt",
    tip: "Maya's Straw Hat Crew: found, still wanted, what you hold.",
    go: (nav) => nav.navigate("Hunt", { huntId: huntId("maya-crew") }),
  },
  {
    title: "6. Posting a Flare",
    tip: "Just the cards you are looking for. To add to a hunt, open the hunt and tap +.",
    go: (nav) => nav.navigate("Tabs", { screen: "Flare" }),
  },
  {
    title: "7. Nearby",
    tip: "People around you who want your cards, then the posts near you.",
    go: (nav) => nav.navigate("Tabs", { screen: "Nearby" }),
  },
  {
    title: "8. A post",
    tip: "The full post with its comments and offers.",
    go: (nav) => nav.navigate("FlarePost", { postId: postId("maya-crew") }),
  },
  {
    title: "9. Someone's profile",
    tip: "Maya: ring, aura, hunts, wants and followers.",
    go: (nav) => nav.navigate("PlayerProfile", { playerId: "demo-maya" }),
  },
  {
    title: "10. Your profile and binders",
    tip: "Your own account, real, with your binders.",
    go: (nav) => nav.navigate("Tabs", { screen: "Profile" }),
  },
  {
    title: "11. Notifications",
    tip: "Offers, matches nearby, a confirmed trade, new followers.",
    go: (nav) => nav.navigate("Inbox"),
  },
  {
    title: "12. Wanted near you",
    tip: "Everybody near you who wants your cards, by card.",
    go: (nav) => nav.navigate("WantedNearYou"),
  },
  {
    title: "13. Wanted near you on the Feed",
    tip: "The Nearby tab's card: the top cards, a few faces each.",
    go: (nav) => nav.navigate("Tabs", { screen: "Feed", params: { tab: "nearby" } }),
  },
  {
    title: "14. One wanted card's people",
    tip: "Umbreon's sheet: who wants it, closest first, the message icon on each.",
    go: (nav) =>
      nav.navigate("WantedNearYou", { cardId: DEMO_CARDS.umbreonCol.cardId }),
  },
  {
    title: "15. Messaging someone who wants your card",
    tip: "A new conversation with Zoe, the first line already written.",
    go: (nav) =>
      nav.navigate("NewMessage", {
        ask: { kind: "flare", id: "demo-ask-0-0" },
        withName: PEOPLE.zoe.displayName,
        withPlayerId: PEOPLE.zoe.playerId,
        withAvatarUrl: PEOPLE.zoe.avatarUrl,
        cardName: DEMO_CARDS.umbreonCol.cardName,
        imageUrl: DEMO_CARDS.umbreonCol.imageUrl,
        draft: answerDraft(DEMO_CARDS.umbreonCol.cardName),
      }),
  },
  {
    title: "16. Sign-up preview",
    tip: "A new player's whole first run: welcome, account, games, where, the intro, then the + pointed at. Type anything; nothing is created.",
    go: (nav) => nav.navigate("SignUpPreview"),
  },
  {
    title: "17. The intro",
    tip: "Just the three cards and their scenes, in your account's games. Next walks them; Look around first ends on the spotlit +.",
    go: (nav) => nav.navigate("Intro"),
  },
  {
    title: "18. The profile tour",
    tip: "Four stops on your Profile: binders, Share, the wand, the tabs. Next or a tap moves on.",
    go: (nav) => {
      void queueProfileTour();
      nav.navigate("Tabs", { screen: "Profile" });
    },
  },
];

export function DemoShotsScreen() {
  const navigation = useNavigation<Nav>();
  const on = demoOn();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.canvas }}
      contentContainerStyle={{ padding: gutter, gap: spacing(3) }}
    >
      <Card>
        <Title>{on ? "Demo mode is on" : "Demo mode is off"}</Title>
        <Body>
          {on
            ? "Made-up people, posts and messages. Nothing you do here reaches the server."
            : "Turn it on and the app reloads with made-up people, posts and messages."}
        </Body>
        <Button
          label={on ? "Turn demo mode off" : "Turn demo mode on"}
          variant={on ? "secondary" : undefined}
          onPress={() => void setDemoMode(!on)}
        />
      </Card>

      {on
        ? SHOTS.map((shot) => (
            <Tap
              key={shot.title}
              onPress={() => shot.go(navigation)}
              accessibilityLabel={shot.title}
            >
              <View
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderWidth: 1,
                  borderRadius: 14,
                  padding: spacing(3),
                  gap: 2,
                }}
              >
                <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "800" }}>
                  {shot.title}
                </Text>
                <Muted>{shot.tip}</Muted>
              </View>
            </Tap>
          ))
        : null}
    </ScrollView>
  );
}
