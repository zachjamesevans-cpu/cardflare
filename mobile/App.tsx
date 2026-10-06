import { Ionicons } from "@expo/vector-icons";
import {
  DarkTheme,
  NavigationContainer,
  type LinkingOptions,
  type Theme,
  createNavigationContainerRef,
} from "@react-navigation/native";
import {
  createBottomTabNavigator,
  type BottomTabBarButtonProps,
} from "@react-navigation/bottom-tabs";
import {
  createNativeStackNavigator,
  type NativeStackNavigationProp,
} from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  AppState,
  Pressable,
  ScrollView,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { PlayerProfileScreen } from "./src/screens/player-profile";
import { FlarePostScreen } from "./src/screens/flare-post";
import { HuntScreen } from "./src/screens/hunt";
import { RemoteScreen } from "./src/screens/remote";
import { TradeHistoryScreen } from "./src/screens/trade-history";
import { LogTradeScreen } from "./src/screens/log-trade";
import { ProfileScreen } from "./src/screens/profile";
import { EditProfileScreen } from "./src/screens/edit-profile";
import { BinderScreen } from "./src/screens/binder";
import { BindersScreen } from "./src/screens/binders";
import { HuntsScreen } from "./src/screens/hunts";
import { CardScreen } from "./src/screens/card";
import { SearchScreen } from "./src/screens/search";
import { StoreProfileScreen } from "./src/screens/store-profile";
import { HomeScreen } from "./src/screens/home";
import { HubScreen } from "./src/screens/hub";
import { InboxScreen } from "./src/screens/inbox";
import { LabScreen } from "./src/screens/lab";
import { FlareComposer } from "./src/screens/flare-composer";
import { LocalScreen } from "./src/screens/local";
import { NightMatchesScreen } from "./src/screens/night-matches";
import { NightPlayerScreen } from "./src/screens/night-player";
import { NightsCodeButton, NightsScreen } from "./src/screens/nights";
import { RoomTab } from "./src/screens/room";
import { ThreadScreen } from "./src/screens/thread";
import { ScanScreen } from "./src/screens/scan";
import { SettingsScreen } from "./src/screens/settings";
import { StoreScreen } from "./src/screens/store";
import { CustomizeScreen } from "./src/screens/customize";
import { ProScreen } from "./src/screens/pro";
import { SignInScreen } from "./src/screens/sign-in";
import { WelcomeScreen, forgetWelcome, hasSeenWelcome } from "./src/screens/welcome";
import { onSignedOut, storedAccessToken } from "./src/api";
import { firstBootError } from "./src/boot-errors";
import { colors, spacing } from "./src/theme";
import { Tap } from "./src/ui";
import { LOCAL_ENABLED } from "./src/local-enabled";
import { openRoom } from "./src/open-room";
import { followHref } from "./src/follow-href";
import { registerForPush } from "./src/push";
import { GlassFill, TAB_BAR, TAB_BAR_RADIUS } from "./src/glass";
import { UnreadDot } from "./src/unread-dot";
import { refreshUnread } from "./src/unread";
import { refreshUnreadMessages, useUnreadMessages } from "./src/unread-messages";

/**
 * CardFlare for the pocket. The same backend, the same account, the same
 * rooms as cardflare.gg — plus the one thing a website cannot do: tell
 * you about an offer while your phone is locked.
 *
 * Five tabs: Feed, Nights (the nights near you and the ones you are
 * going to), the raised + that posts a Flare, Messages, Profile. The
 * notices are the bell at the Feed's top right (the Inbox, a stack
 * screen now). The Room (where you are right now;
 * remembers the last room), scanning, posting, signing in and settings
 * ride on top as stack screens; the QR icon on Nights' header is the
 * door to the scanner and the Room's code form, and a night's matches
 * and its players' event-facing profiles are stack screens of their
 * own (NightMatches, NightPlayer). Local can take Nights' slot (src/local-enabled.ts)
 * and is switched off. The founder, on the dock: "Trying to keep our
 * tabs to our 'hero's'."
 *
 * Profile replaced Account, which is the founder's call: an account page
 * is housekeeping and nobody visits housekeeping twice. Everything that
 * tab used to hold is one tap away behind the cog on the profile.
 */

/* Guarded because this runs at module scope, before any error boundary
   exists: a throw here would kill the bundle and strand the splash
   screen. Without the handler, foreground notifications fall back to
   the system default - a working app matters more.

   The badge is on: every push carries the unread count, and the icon
   wears it. The Inbox clears it (src/push.ts, syncBadge) once the
   notices are read, so the number never outlives the list. */
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
} catch (error) {
  console.warn("Notification handler not installed", error);
}

export type TabParams = {
  Feed: undefined;
  /** One of these two holds the second slot, by LOCAL_ENABLED. */
  Local: undefined;
  Nights: undefined;
  /* `hunt` is the id of the hunt the composer opens into, so "Add
     cards" on a profile row lands here with the hunt already chosen.
     `card` is the card page's card, so "Post a Flare for it" lands
     with that card already the first line of the draft. */
  Flare:
    | {
        hunt?: string;
        card?: {
          cardId: string;
          name: string;
          cardNumber: string;
          imageUrl: string | null;
        };
      }
    | undefined;
  /** The conversations, with a dot while any message is unread. */
  Messages: undefined;
  Profile: undefined;
};

export type StackParams = {
  Tabs: { screen?: keyof TabParams; params?: TabParams[keyof TabParams] } | undefined;
  /** The live room: the code door and the board, reached from Nights'
      "Scan or enter a code" and from every night's row. Open it through
      src/open-room.ts, never by name. */
  Room: undefined;
  /** One conversation about one Flare, from Local, Messages or the Inbox. */
  LocalThread: { threadId: string };
  /** The notices, from the bell at the Feed's top right. It was a tab. */
  Inbox: undefined;
  SignIn: undefined;
  /** The welcome screen's sign-up, opened from a room's account pitch. */
  CreateAccount: undefined;
  Scan: undefined;
  Settings: undefined;
  /** Instagram's Edit profile: picture, effects, name, username,
      pronouns, bio. The website's /profile/edit. */
  EditProfile: undefined;
  /**
   * Somebody's hunts on their own screen: the website's /profile/hunts
   * with no id, /p/[playerId]/hunts with one. The Hunts stop in the
   * icon row on either profile.
   */
  Hunts: { playerId?: string } | undefined;
  /**
   * Every binder somebody has, as a list: the website's
   * /profile/binders with no id, /p/[playerId]/binders with one. The
   * Binders stop in the icon row on either profile.
   */
  Binders: { playerId?: string } | undefined;
  /**
   * One binder, open: the website's /profile/binders/[binderId] with
   * no playerId, /p/[playerId]/binders/[binderId] with one. No
   * binderId means the Trade binder. Reached from the highlights row
   * on either profile and from the Binders list.
   */
  Binder: { playerId?: string; binderId: string } | undefined;
  /** Every shape a Feed post can take, drawn with made-up data. See
      src/screens/lab.tsx - it reaches nothing and posts nothing. */
  Lab: undefined;
  /** The Embers store, the website's /profile/store. */
  Store: undefined;
  /** Getting dressed, the website's /profile/customize. Two wands, two
      menus: profile cosmetics or showcase cosmetics. */
  Customize: { area?: "profile" | "showcase" } | undefined;
  /** The cardflare Pro paywall. Every Pro wall in the app opens this. */
  Pro: undefined;
  /**
   * The room's composer. `openToTrades` is what the room last read
   * for this player, so the toggle at the composer's foot starts
   * right; the room reads the truth back on its next poll.
   */
  PostFlare: { code: string; openToTrades?: boolean };
  /** Somebody else's profile, from the room popup's View full profile. */
  PlayerProfile: { playerId: string };
  /**
   * Every match the viewer has at a night: the website's
   * /e/[code]/matches. Reached from See all matches on the night.
   */
  NightMatches: { code: string };
  /**
   * A player as this night sees them: the website's
   * /e/[code]/p/[playerId]. Reached from a Players going row and from
   * a match's name.
   */
  NightPlayer: { code: string; playerId: string };
  /** A Flare post's thread: likes, comments, "I have this" on a card. */
  FlarePost: { postId: string };
  /** One hunt, whole: the website's /hunts/[huntId]. */
  Hunt: { huntId: string };
  /**
   * Every trade you confirmed, the website's /profile/trades. Pro.
   * `logged` is set by the Log a trade screen on its way back, so the
   * list can say "Logged." once over the fresh rows.
   */
  TradeHistory: { logged?: boolean } | undefined;
  /** Writing down a trade made off CardFlare, the website's sheet. */
  LogTrade: undefined;
  /** One search for cards, players and stores, from the Feed's own header. */
  Search: undefined;
  /** One card, whole: the website's /cards/[cardId]. Reached from a search result. */
  Card: { cardId: string };
  /**
   * A shop, from a Nearby row — the website's /s/[storeId].
   *
   * Native rather than a link out: the founder, on a tab that threw him
   * into Safari, and it is also where an owner claims their listing.
   */
  StoreProfile: { storeId: string };
  /**
   * The timer remote: a store's round clocks, run from a pocket. With
   * a storeId it opens on that store; without, it asks which counter
   * when the account runs more than one. Reached from the Timer remote
   * icon on a joined room's door card, drawn only for staff.
   */
  Remote: { storeId?: string } | undefined;
};

const Tab = createBottomTabNavigator<TabParams>();
const Stack = createNativeStackNavigator<StackParams>();

/**
 * Our own back button, replacing the native header's: a chevron and
 * nothing else.
 *
 * The native one stopped answering taps on this screens/new-architecture
 * combination while the back GESTURE kept working - the tap lands in
 * native code this app cannot see. Drawing the button ourselves puts
 * the tap in JavaScript where it demonstrably works.
 *
 * No words beside it. The founder: back buttons are a plain chevron,
 * the way Instagram draws them, so the per-screen labels ("Profile",
 * "Night", "Room") went with the map that held them.
 */
function HeaderBack({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel="Back"
      style={{ flexDirection: "row", alignItems: "center", paddingRight: 12 }}
    >
      <Ionicons name="chevron-back" size={26} color={colors.accent} />
    </Pressable>
  );
}

const theme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.canvas,
    card: colors.surface,
    text: colors.textPrimary,
    border: colors.border,
    primary: colors.accent,
  },
};

/* Outline weights, because the website's dock draws line icons - the
   filled set read as a different product sitting on the same colours. */
type TabGlyph = keyof typeof Ionicons.glyphMap;

const TAB_ICONS: Partial<
  Record<keyof TabParams, { idle: TabGlyph; focused?: TabGlyph }>
> = {
  /* Home-shaped, the founder's call: this is the screen you open by
       habit, and scanning moved to a button on it. */
  Feed: { idle: "home-outline" },
  Local: { idle: "location-outline" },
  /* The website's dock draws lucide CalendarDays for Nights; the
       calendar fills in when it is the open tab, like the flame. */
  Nights: { idle: "calendar-outline", focused: "calendar" },
  /* The website's dock draws lucide MessageCircle for Messages. */
  Messages: { idle: "chatbubble-outline", focused: "chatbubble" },
  Profile: { idle: "person-circle-outline" },
};

/*
 * The tab bar draws its own buttons, so the app-wide Tap primitive never
 * reaches them — this is the same squeeze-and-pop, rebuilt in the shape
 * the navigator expects. Press squeezes the whole tab (icon and label),
 * release springs it back with the overshoot; the haptic tick comes from
 * the navigator's tabPress listener below, same as everywhere else.
 */
function TabButton({
  children,
  style,
  onPress,
  onLongPress,
  accessibilityState,
  accessibilityLabel,
  testID,
}: BottomTabBarButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={style as StyleProp<ViewStyle>}
      onPressIn={() => {
        Animated.spring(scale, {
          toValue: 0.88,
          speed: 60,
          bounciness: 0,
          useNativeDriver: true,
        }).start();
      }}
      onPressOut={() => {
        Animated.spring(scale, {
          toValue: 1,
          speed: 25,
          bounciness: 14,
          useNativeDriver: true,
        }).start();
      }}
    >
      <Animated.View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          transform: [{ scale }],
        }}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}

/*
 * THE UNREAD DOT. The founder (2026-10-05): "If you have an unread
 * notification in app, there should be a small neon green dot on the
 * inbox icon so you know to check your inbox." The accent, no number
 * (the home screen's icon badge already carries the count), sat on the
 * icon's corner with a thin ring in the bar's own fill so it reads as a
 * dot on the glass rather than a smudge on the glyph. The Messages tab
 * wears it for unread messages; the Feed's bell wears the same dot for
 * unread notices (src/unread-dot.tsx).
 */
function MessagesDot() {
  return <UnreadDot ring={colors.elevated} style={{ top: -1, right: -3 }} />;
}

/*
 * THE RAISED +. The middle of the bar posts a Flare: an accent circle
 * with a plus, no label, sitting a little proud of the pill so it reads
 * as the one thing to do rather than a fifth place to go. It opens the
 * Flare tab, the screen the old flame tab showed, so every "Post a
 * Flare" door in the app (navigate("Tabs", { screen: "Flare" })) still
 * lands in the same place. The website's dock draws the same circle.
 */
export const POST_BUTTON = { size: 46, lift: 10 } as const;

function PostButton({ onPress, onLongPress, testID }: BottomTabBarButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel="Post a Flare"
      testID={testID}
      style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
      onPressIn={() => {
        Animated.spring(scale, {
          toValue: 0.88,
          speed: 60,
          bounciness: 0,
          useNativeDriver: true,
        }).start();
      }}
      onPressOut={() => {
        Animated.spring(scale, {
          toValue: 1,
          speed: 25,
          bounciness: 14,
          useNativeDriver: true,
        }).start();
      }}
    >
      <Animated.View
        style={{
          width: POST_BUTTON.size,
          height: POST_BUTTON.size,
          borderRadius: POST_BUTTON.size / 2,
          backgroundColor: colors.accent,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: colors.canvas,
          shadowOpacity: 0.45,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 4 },
          elevation: 6,
          transform: [{ translateY: -POST_BUTTON.lift }, { scale }],
        }}
      >
        <Ionicons name="add" size={28} color={colors.accentContrast} />
      </Animated.View>
    </Pressable>
  );
}

function Tabs() {
  /* Unread messages, for the dot on Messages. src/unread-messages.ts
     holds the one value; the notices' count is the Feed bell's. */
  const unreadMessages = useUnreadMessages();

  return (
    <Tab.Navigator
      // The same light tick every other control gives — switching tabs
      // is a tap too, and the bottom bar was the one mute surface left.
      screenListeners={{
        tabPress: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        },
        /* Every tab change asks again, so the dot is right by the time
           anybody looks down at the bar. */
        focus: () => {
          void refreshUnread();
          void refreshUnreadMessages();
        },
      }}
      screenOptions={({ route }) => ({
        /*
         * Both bars on the canvas, not on `surface`. With a true-black
         * page a surface-coloured bar reads as a lighter strip pasted
         * over the top and bottom of the screen — the founder asked for
         * the header to go black with the background, and leaving the
         * tab bar grey would just move the seam to the other end. The
         * hairline borders still separate them.
         */
        headerStyle: { backgroundColor: colors.canvas },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { fontWeight: "700" },
        tabBarButton: (props) =>
          route.name === "Flare" ? <PostButton {...props} /> : <TabButton {...props} />,
        /*
         * LIQUID GLASS, which means the bar stops being a floor and
         * starts being a surface the list runs under.
         *
         * The founder asked for the iOS 26 material on "the tabs at the
         * bottom", and the material only reads as glass when there is
         * something behind it to refract. An opaque bar in the layout
         * flow has the page ABOVE it and black underneath, so glassing
         * it in place would have drawn an expensive rectangle of
         * nothing. So the bar floats and the screens pad for it - the
         * same trade the Feed's header already makes at the other end
         * of the screen (src/collapsing-header.tsx), and the reason
         * `useTabBarInset` exists.
         *
         * The hairline goes with it. A Liquid Glass bar carries its own
         * edge - the material has a specular rim - and a border on top
         * of that reads as a seam drawn over a seam. Without glass the
         * hairline is still the only thing separating bar from page, so
         * it stays.
         */
        tabBarBackground: () => (
          /* The clip lives on the background now, not on the bar, so
             the raised + can sit proud of the pill's top edge. */
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              borderRadius: TAB_BAR_RADIUS,
              overflow: "hidden",
            }}
          >
            <GlassFill
              style={{ borderRadius: TAB_BAR_RADIUS }}
              /* Without the material, the pill still has to read as a
                 pill: a flat black shape on a black page is invisible, so
                 the fallback is the raised surface and keeps an edge. */
              fallback={colors.elevated}
            />
          </View>
        ),
        tabBarStyle: {
          position: "absolute",
          /* The bubble. In from both sides, up off the bottom, and
             rounded the whole way - see TAB_BAR.
             `start`/`end` rather than `left`/`right`: React Navigation's
             own base style pins the bar with `start: 0, end: 0`, and in
             React Native the writing-direction props WIN over left and
             right however late those are merged. Setting left/right here
             looked perfectly correct and did nothing at all. */
          start: TAB_BAR.side,
          end: TAB_BAR.side,
          bottom: TAB_BAR.lift,
          height: TAB_BAR.height,
          borderRadius: TAB_BAR_RADIUS,
          /* The bar no longer reaches the bottom of the screen, so the
             home-indicator padding React Navigation adds for a docked
             bar would just push the icons off-centre inside the pill. */
          paddingBottom: 0,
          backgroundColor: "transparent",
          /* A pill has no top edge to draw a hairline along; without
             glass the fallback surface is what separates it instead. */
          borderTopWidth: 0,
          /* Not clipped here: the background clips itself (above),
             and the raised + needs to reach past the pill's top. */
          overflow: "visible",
          /* The bar draws its own material; a shadow under a glass
             surface is the one thing that makes it look pasted on. */
          elevation: 0,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarIcon: ({ color, size, focused }) => {
          const pair = TAB_ICONS[route.name as keyof TabParams] ?? {
            idle: "add" as const,
          };
          const icon = focused ? (pair.focused ?? pair.idle) : pair.idle;
          if (route.name === "Messages" && unreadMessages > 0) {
            return (
              <View>
                <Ionicons name={icon} color={color} size={size} />
                <MessagesDot />
              </View>
            );
          }
          return <Ionicons name={icon} color={color} size={size} />;
        },
      })}
    >
      {/* Feed, not Join. Join was a tab used four times a month, on the
          days somebody stands in a shop; getting into a room lives
          behind Nights now, one tap from the tab you open to see what
          is on. The header still carries the product name, as the
          website's does. */}
      <Tab.Screen
        name="Feed"
        component={HomeScreen}
        /* The one door out to other people, top right of the main feed -
           the same place the website puts it. */
        options={{
          title: "CardFlare",
          /*
           * The Feed draws its OWN header, and the navigator's is off.
           *
           * The founder: "the 'card flare' text at top doesn't need to
           * be glued to the top ... the goal is to have maximized
           * viewing space." A navigator header cannot do that — it is a
           * fixed strip above the screen, and the content simply starts
           * underneath it. So the Feed floats a translucent bar over
           * its own list and moves it with the scroll. See
           * src/collapsing-header.tsx.
           *
           * Only this tab. Room, Flare, Messages and Profile are screens
           * you arrive at to do one thing rather than lists you fall
           * down, and a header that hides on a short screen is a
           * header that flickers.
           */
          headerShown: false,
          tabBarLabel: "Feed",
        }}
      />
      {/* The second slot: Local while it is on, Nights otherwise. Nights
          took the Room's slot on 2026-10-03: rooms open the moment a
          store posts a night, and the tab is the list of them. The
          website's dock does the same (/nights, CalendarDays). See
          src/local-enabled.ts for the Local call. */}
      {LOCAL_ENABLED ? (
        <Tab.Screen name="Local" component={LocalScreen} options={{ title: "Local" }} />
      ) : (
        <Tab.Screen
          name="Nights"
          component={NightsScreen}
          /* The QR icon at the header's end: Scan QR, or Enter event
             code. The giant "Scan or enter a code" button is gone. */
          options={{
            title: "Nights",
            tabBarLabel: "Nights",
            headerRight: () => <NightsCodeButton />,
          }}
        />
      )}
      {/* The raised + in the middle: Post a Flare. No label under it;
          the header says what the screen is for, the same words as the
          website's page heading. */}
      <Tab.Screen
        name="Flare"
        component={HubScreen}
        options={{
          title: "Post a Flare",
          tabBarLabel: "Post a Flare",
          tabBarAccessibilityLabel: "Post a Flare",
        }}
      />
      {/* The conversations, the screen the Inbox's Messages row used to
          open, now a tab of its own with a dot while anything is
          unread. Local, while it is on, keeps its own list too. */}
      <Tab.Screen
        name="Messages"
        options={{
          title: "Messages",
          tabBarLabel: "Messages",
          /* The dot has no words of its own, so the label says it. */
          tabBarAccessibilityLabel:
            unreadMessages > 0 ? "Messages, unread" : "Messages",
        }}
      >
        {() => <LocalScreen threadsOnly />}
      </Tab.Screen>
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

/**
 * The last line of defence at startup.
 *
 * A release build has no red error screen: if anything throws while the
 * first frame is being built, the native splash simply never goes away
 * and the app reads as dead. This boundary sits above everything, so a
 * startup failure renders as a screen that names the error instead - a
 * tester can screenshot it, and the splash still hides because content
 * (this content) appeared.
 */
class StartupGuard extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <ScrollView
          style={{ flex: 1, backgroundColor: colors.canvas }}
          contentContainerStyle={{ padding: 24, paddingTop: 96, gap: 12 }}
        >
          <Text style={{ color: colors.textPrimary, fontSize: 20, fontWeight: "700" }}>
            CardFlare hit a problem while starting
          </Text>
          <Text style={{ color: colors.textSecondary, lineHeight: 21 }}>
            This is not supposed to happen. A screenshot of this screen is the fastest
            way to get it fixed.
          </Text>
          <Text
            style={{ color: colors.textMuted, fontFamily: "Courier", fontSize: 12 }}
          >
            {String(this.state.error)}
          </Text>
          {(() => {
            /* The boundary often catches a symptom (a module that failed
               to load reads as undefined); the trap in boot-errors.ts
               holds the error that actually started it. Show both. */
            const root = firstBootError();
            if (root === null || String(root) === String(this.state.error)) {
              return null;
            }
            return (
              <>
                <Text style={{ color: colors.textSecondary, fontWeight: "700" }}>
                  Root cause
                </Text>
                <Text
                  style={{
                    color: colors.textMuted,
                    fontFamily: "Courier",
                    fontSize: 12,
                  }}
                >
                  {String(root)}
                </Text>
              </>
            );
          })()}
        </ScrollView>
      );
    }
    return this.props.children;
  }
}

/**
 * A tap on a push notification lands where the notice pointed.
 *
 * The server sends `data.url` with every push (a website path, the
 * same one the Feed's notice buttons carry); until now nothing read it,
 * so "Somebody offered on your Flare" opened whichever tab was last
 * open. Two entry points: a tap that wakes a cold app is read once the
 * navigator is ready, a tap while running arrives through the listener.
 */
const navigationRef = createNavigationContainerRef<StackParams>();

/**
 * Links that open the app, and where they land.
 *
 * One so far: a binder's share link, https://cardflare.gg/b/<id>. iOS
 * hands it to the app because app.json claims applinks:cardflare.gg
 * and the website's apple-app-site-association names /b/*; the
 * cardflare:// scheme carries the same path. Either lands on the
 * Binder screen with nothing but the id, which asks the server for any
 * binder by id and reads `yours` from the answer.
 *
 * `initialRouteName: "Tabs"` puts the tabs under a binder opened from
 * a cold start, so Back has somewhere to go. Every other path matches
 * nothing and is ignored, so a link the app does not know leaves the
 * screen where it was.
 *
 * The prefixes are written out rather than built with expo-linking's
 * createURL: that package is not installed, it carries native code, and
 * a TestFlight build has no exp:// URL for it to make. www is listed
 * because the apex answers with a redirect to it, so a link can reach
 * the phone in either spelling.
 */
const linking: LinkingOptions<StackParams> = {
  prefixes: ["cardflare://", "https://cardflare.gg", "https://www.cardflare.gg"],
  config: {
    initialRouteName: "Tabs",
    screens: {
      Binder: "b/:binderId",
    },
  },
};

function openNotificationLink(response: Notifications.NotificationResponse | null) {
  const url = response?.notification.request.content.data?.url;
  if (typeof url !== "string" || !url.startsWith("/") || !navigationRef.isReady()) {
    return;
  }
  void followHref(navigationRef, url).catch(() => {});
}

/**
 * The app's root: everything inside GestureHandlerRootView, which
 * react-native-gesture-handler needs above any view that uses one of
 * its gestures (the binder's hold-and-drag). Flex 1, so it is the
 * whole screen and lays nothing out of its own.
 */
export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppGates />
    </GestureHandlerRootView>
  );
}

function AppGates() {
  /*
   * The front door. A fresh install (no session, welcome never seen)
   * gets the splash and the whole sign-up before the tabs; everyone
   * else goes straight in. "checking" renders a canvas-coloured view
   * so the decision never flashes the wrong screen - and because
   * CONTENT appears immediately, the native splash still hides even
   * if storage is slow.
   */
  const [gate, setGate] = useState<"checking" | "welcome" | "open">("checking");

  useEffect(() => {
    let live = true;
    void (async () => {
      const [seen, token] = await Promise.all([hasSeenWelcome(), storedAccessToken()]);
      if (!live) return;
      setGate(token || seen ? "open" : "welcome");
      /*
       * Once per launch, with a session and without a prompt: the token
       * this phone answers to is registered again. A reinstall, a
       * restore to a new phone or a token Expo rotated all left the
       * server pushing at a token nobody held, and nothing fixed it
       * until the next sign-in. Permission not granted means it returns
       * without asking; the ask stays with sign-in and welcome.
       */
      if (token) void registerForPush({ prompt: false });
    })();
    return () => {
      live = false;
    };
  }, []);

  /*
   * Signing out goes back to the front door.
   *
   * The founder: "make sure that when I sign out it goes out to the main
   * cardflare menu." It did not — the gate only ever moved toward `open`,
   * so signing out left somebody in the tabs looking at a signed-out
   * Feed. The seen-flag is cleared with it so a relaunch lands there too,
   * rather than dropping them back inside with no visible way in.
   */
  useEffect(
    () =>
      onSignedOut(() => {
        void forgetWelcome();
        setGate("welcome");
      }),
    [],
  );

  useEffect(() => {
    if (gate !== "open") return;
    const subscription =
      Notifications.addNotificationResponseReceivedListener(openNotificationLink);
    return () => subscription.remove();
  }, [gate]);

  /*
   * The two dots' counts: the Feed bell's (src/unread.ts) and the
   * Messages tab's (src/unread-messages.ts), asked for once the tabs are
   * open (signed out reads as no dot), again whenever the app comes
   * back to the front, and again when a notice lands while it is open.
   * The fourth trigger, every tab change, is the navigator's `focus`
   * listener in Tabs; the fifth, clearing the bell's, is the Inbox's read.
   */
  useEffect(() => {
    if (gate !== "open") return;
    void refreshUnread();
    void refreshUnreadMessages();
    const foreground = AppState.addEventListener("change", (next) => {
      if (next !== "active") return;
      void refreshUnread();
      void refreshUnreadMessages();
    });
    const arrived = Notifications.addNotificationReceivedListener(() => {
      void refreshUnread();
      void refreshUnreadMessages();
    });
    return () => {
      foreground.remove();
      arrived.remove();
    };
  }, [gate]);

  if (gate === "checking") {
    return <View style={{ flex: 1, backgroundColor: colors.canvas }} />;
  }

  if (gate === "welcome") {
    return (
      <StartupGuard>
        <StatusBar style="light" />
        <WelcomeScreen onDone={() => setGate("open")} />
      </StartupGuard>
    );
  }

  return (
    <StartupGuard>
      <NavigationContainer
        ref={navigationRef}
        linking={linking}
        theme={theme}
        onReady={() => {
          void Notifications.getLastNotificationResponseAsync()
            .then(openNotificationLink)
            .catch(() => {});
        }}
      >
        <StatusBar style="light" />
        <Stack.Navigator
          screenOptions={({ navigation }) => ({
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.textPrimary,
            headerTitleStyle: { fontWeight: "700" },
            /*
             * Back is a LEFT-EDGE swipe, not a whole-screen one.
             *
             * This used to be `fullScreenGestureEnabled: true` - the
             * whole surface was the back gesture, on the Instagram
             * argument. It works too well: the founder, "you can swipe
             * from any portion of the screen to go back... this should
             * only exist on a smallish lefthand side of the screen so
             * you dont accidentally swipe back." Every horizontal drag
             * anywhere was a pop, which on a screen with a card rail to
             * scroll sideways is a trap rather than a shortcut.
             *
             * Turning the full-screen gesture off hands it back to
             * UIKit's own interactive pop, which lives on the left edge
             * and is the one every other iOS app trained people on.
             *
             * `gestureResponseDistance: { start: 50 }` was tried first,
             * to keep the full-screen gesture but pen it into a left
             * strip. It does nothing: with the full-screen gesture on
             * and that distance set, a drag from the middle of the
             * screen still pops. Measured on the simulator, not assumed
             * - so the knob is gone rather than left in looking load
             * bearing.
             */
            gestureEnabled: true,
            fullScreenGestureEnabled: false,
            headerLeft: ({ canGoBack }) =>
              canGoBack ? <HeaderBack onPress={() => navigation.goBack()} /> : <View />,
          })}
        >
          <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
          {/* The Room, pushed over the tabs from Nights' "Scan or enter
              a code" and from every night's row. It was the second tab
              until Nights took the slot; it is the same screen. */}
          <Stack.Screen name="Room" component={RoomTab} options={{ title: "Room" }} />
          {/* The notices, pushed from the bell at the Feed's top right.
              It was a tab until the bar made room for Messages. */}
          <Stack.Screen
            name="Inbox"
            component={InboxScreen}
            options={{ title: "Inbox" }}
          />
          <Stack.Screen
            name="LocalThread"
            component={ThreadScreen}
            options={{ title: "Conversation" }}
          />
          <Stack.Screen name="SignIn" options={{ title: "Sign in" }}>
            {({ navigation }) => (
              <SignInScreen onSignedIn={() => navigation.goBack()} />
            )}
          </Stack.Screen>
          <Stack.Screen name="CreateAccount" options={{ title: "Create account" }}>
            {({ navigation }) => (
              <WelcomeScreen
                initialStep="account"
                onDone={() => navigation.goBack()}
                onCancel={() => navigation.goBack()}
              />
            )}
          </Stack.Screen>
          <Stack.Screen name="Scan" options={{ title: "Scan" }}>
            {({ navigation }) => <ScanScreen onCode={() => openRoom(navigation)} />}
          </Stack.Screen>
          <Stack.Screen
            name="Lab"
            component={LabScreen}
            options={{ title: "Design lab" }}
          />
          <Stack.Screen
            name="Settings"
            component={SettingsScreen}
            options={{ title: "Settings" }}
          />
          <Stack.Screen
            name="EditProfile"
            component={EditProfileScreen}
            options={{ title: "Edit profile" }}
          />
          <Stack.Screen name="Hunts" options={{ title: "Hunts" }}>
            {({ route }) => <HuntsScreen playerId={route.params?.playerId} />}
          </Stack.Screen>
          <Stack.Screen name="Binders" options={{ title: "Binders" }}>
            {({ route }) => <BindersScreen playerId={route.params?.playerId} />}
          </Stack.Screen>
          <Stack.Screen name="Binder" options={{ title: "Binder" }}>
            {({ route }) => (
              <BinderScreen
                playerId={route.params?.playerId}
                binderId={route.params?.binderId}
              />
            )}
          </Stack.Screen>
          <Stack.Screen
            name="Store"
            component={StoreScreen}
            options={{ title: "Embers store" }}
          />
          <Stack.Screen name="Customize" options={{ title: "Customize" }}>
            {({ route }) => <CustomizeScreen area={route.params?.area ?? "profile"} />}
          </Stack.Screen>
          <Stack.Screen
            name="Pro"
            component={ProScreen}
            options={{ title: "cardflare Pro" }}
          />
          <Stack.Screen
            name="PlayerProfile"
            component={PlayerProfileScreen}
            options={{ title: "Player" }}
          />
          <Stack.Screen name="NightMatches" options={{ title: "Matches" }}>
            {({ route }) => <NightMatchesScreen code={route.params.code} />}
          </Stack.Screen>
          <Stack.Screen name="NightPlayer" options={{ title: "Player" }}>
            {({ route }) => (
              <NightPlayerScreen
                code={route.params.code}
                playerId={route.params.playerId}
              />
            )}
          </Stack.Screen>
          <Stack.Screen
            name="TradeHistory"
            component={TradeHistoryScreen}
            options={{ title: "History" }}
          />
          <Stack.Screen
            name="LogTrade"
            component={LogTradeScreen}
            options={{ title: "Log a trade" }}
          />
          <Stack.Screen name="FlarePost" options={{ title: "Flare" }}>
            {({ route }) => <FlarePostScreen postId={route.params.postId} />}
          </Stack.Screen>
          <Stack.Screen name="Hunt" options={{ title: "Hunt" }}>
            {({ route }) => <HuntScreen huntId={route.params.huntId} />}
          </Stack.Screen>
          <Stack.Screen name="StoreProfile" options={{ title: "Store" }}>
            {({ route }) => <StoreProfileScreen storeId={route.params.storeId} />}
          </Stack.Screen>
          <Stack.Screen name="Remote" options={{ title: "Timer remote" }}>
            {({ route }) => <RemoteScreen storeId={route.params?.storeId} />}
          </Stack.Screen>
          <Stack.Screen
            name="Search"
            component={SearchScreen}
            options={{ title: "Search" }}
          />
          <Stack.Screen name="Card" options={{ title: "Card" }}>
            {({ route }) => <CardScreen cardId={route.params.cardId} />}
          </Stack.Screen>
          <Stack.Screen name="PostFlare" options={{ title: "Post a Flare" }}>
            {({ route }) => (
              <FlareComposer
                target={{ kind: "room", code: route.params.code }}
                openToTrades={route.params.openToTrades}
              />
            )}
          </Stack.Screen>
        </Stack.Navigator>
      </NavigationContainer>
    </StartupGuard>
  );
}
