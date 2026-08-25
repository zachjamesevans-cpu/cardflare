import { Ionicons } from "@expo/vector-icons";
import {
  DarkTheme,
  NavigationContainer,
  type Theme,
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

import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { PlayerProfileScreen } from "./src/screens/player-profile";
import { ProfileScreen } from "./src/screens/profile";
import { FindPlayerScreen } from "./src/screens/find-player";
import { StoreProfileScreen } from "./src/screens/store-profile";
import { HomeScreen } from "./src/screens/home";
import { HubScreen } from "./src/screens/hub";
import { InboxScreen } from "./src/screens/inbox";
import { PostFlareScreen } from "./src/screens/post-flare";
import { LocalScreen } from "./src/screens/local";
import { RoomTab } from "./src/screens/room";
import { ThreadScreen } from "./src/screens/thread";
import { ScanScreen } from "./src/screens/scan";
import { SettingsScreen } from "./src/screens/settings";
import { StoreScreen } from "./src/screens/store";
import { CustomizeScreen } from "./src/screens/customize";
import { SignInScreen } from "./src/screens/sign-in";
import { WelcomeScreen, hasSeenWelcome } from "./src/screens/welcome";
import { storedAccessToken } from "./src/api";
import { firstBootError } from "./src/boot-errors";
import { colors, spacing } from "./src/theme";
import { Tap } from "./src/ui";

/**
 * CardFlare for the pocket. The same backend, the same account, the same
 * rooms as cardflare.gg — plus the one thing a website cannot do: tell
 * you about an offer while your phone is locked.
 *
 * Five tabs: Join (the front door — scan or type a code), Room (where
 * you are right now; remembers the last room), Flare, Inbox, Profile.
 * Scanning, posting, signing in and settings ride on top as stack
 * screens.
 *
 * Profile replaced Account, which is the founder's call: an account page
 * is housekeeping and nobody visits housekeeping twice. Everything that
 * tab used to hold is one tap away behind the cog on the profile.
 */

/* Guarded because this runs at module scope, before any error boundary
   exists: a throw here would kill the bundle and strand the splash
   screen. Without the handler, foreground notifications fall back to
   the system default - a working app matters more. */
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
} catch (error) {
  console.warn("Notification handler not installed", error);
}

export type TabParams = {
  Feed: undefined;
  Local: undefined;
  Flare: undefined;
  Inbox: undefined;
  Profile: undefined;
};

export type StackParams = {
  Tabs: { screen?: keyof TabParams } | undefined;
  /** The live room. A stack screen now: its tab slot went to Local, and
      the Feed's banner is the door on event nights. */
  Room: undefined;
  /** One conversation about one Flare, from Local or the Inbox. */
  LocalThread: { threadId: string };
  SignIn: undefined;
  Scan: undefined;
  Settings: undefined;
  /** The Embers store, the website's /profile/store. */
  Store: undefined;
  /** Getting dressed, the website's /profile/customize. Two wands, two
      menus: profile cosmetics or showcase cosmetics. */
  Customize: { area?: "profile" | "showcase" } | undefined;
  PostFlare: { code: string };
  /** Somebody else's profile, from the room popup's View full profile. */
  PlayerProfile: { playerId: string };
  /** Finding somebody by name, from the Feed's own header. */
  FindPlayer: undefined;
  /**
   * A shop, from a Nearby row — the website's /s/[storeId].
   *
   * Native rather than a link out: the founder, on a tab that threw him
   * into Safari, and it is also where an owner claims their listing.
   */
  StoreProfile: { storeId: string };
};

const Tab = createBottomTabNavigator<TabParams>();
const Stack = createNativeStackNavigator<StackParams>();

/* What each screen's back button says - the headerBackTitle map, kept
   because the button itself is ours now (see HeaderBack). */
const BACK_LABELS: Partial<Record<keyof StackParams, string>> = {
  SignIn: "Back",
  Scan: "Back",
  Settings: "Profile",
  Store: "Profile",
  Customize: "Profile",
  PlayerProfile: "Back",
  FindPlayer: "Feed",
  PostFlare: "Room",
  Room: "Back",
  LocalThread: "Local",
};

/**
 * Our own back button, replacing the native header's.
 *
 * The native one stopped answering taps on this screens/new-architecture
 * combination while the back GESTURE kept working - the tap lands in
 * native code this app cannot see. Drawing the button ourselves puts
 * the tap in JavaScript where it demonstrably works, with the same
 * chevron-and-label look iOS renders.
 */
function HeaderBack({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={`Back to ${label}`}
      style={{ flexDirection: "row", alignItems: "center", paddingRight: 12 }}
    >
      <Ionicons name="chevron-back" size={26} color={colors.accent} />
      <Text style={{ color: colors.accent, fontSize: 16 }}>{label}</Text>
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
const TAB_ICONS: Partial<Record<keyof TabParams, keyof typeof Ionicons.glyphMap>> = {
  /* Home-shaped, the founder's call: this is the screen you open by
     habit, and scanning moved to a button on it. */
  Feed: "home-outline",
  Local: "location-outline",
  Inbox: "notifications-outline",
  Profile: "person-circle-outline",
};

/*
 * The centre tab wears the mark itself — the approved asset, copied
 * byte-for-byte from public/brand, sized by height as the brand rules
 * require. Dimmed when inactive the same way the icon tabs are.
 */
function MarkIcon({ focused, size }: { focused: boolean; size: number }) {
  /* The same box every Ionicons tab gets, sized by height per the brand
     rules - at 34px the mark leaned into its own label and ate it. */
  return (
    <Image
      source={require("./assets/cardflare-mark.png")}
      style={{
        height: size,
        width: size,
        resizeMode: "contain",
        opacity: focused ? 1 : 0.55,
      }}
    />
  );
}

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

function Tabs() {
  return (
    <Tab.Navigator
      // The same light tick every other control gives — switching tabs
      // is a tap too, and the bottom bar was the one mute surface left.
      screenListeners={{
        tabPress: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
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
        tabBarButton: (props) => <TabButton {...props} />,
        tabBarStyle: { backgroundColor: colors.canvas, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarIcon: ({ color, size, focused }) => {
          const icon = TAB_ICONS[route.name as keyof TabParams];
          return icon ? (
            <Ionicons name={icon} color={color} size={size} />
          ) : (
            <MarkIcon focused={focused} size={size} />
          );
        },
      })}
    >
      {/* Feed, not Join. Join was a tab used four times a month, on the
          days somebody stands in a shop; getting into a room lives on
          the Room tab now, which is the one you are already opening
          when you are standing at a counter. The header still carries
          the product name, as the website's does. */}
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
           * Only this tab. Room, Flare, Inbox and Profile are screens
           * you arrive at to do one thing rather than lists you fall
           * down, and a header that hides on a short screen is a
           * header that flickers.
           */
          headerShown: false,
          tabBarLabel: "Feed",
        }}
      />
      {/* Room's old slot. The live room moved to the Feed's banner and a
          stack screen; the bar's four-nights-a-month tab became the
          every-day one: Flares near you, and the conversations they
          start. */}
      <Tab.Screen
        name="Local"
        component={LocalScreen}
        options={{ title: "Local" }}
      />
      {/* The tab keeps the product's name; the header says what the
          hub holds now: your standing list, not just the post form. */}
      <Tab.Screen
        name="Flare"
        component={HubScreen}
        options={{ title: "Your Flares", tabBarLabel: "Flare" }}
      />
      <Tab.Screen
        name="Inbox"
        component={InboxScreen}
        options={{ title: "Notifications", tabBarLabel: "Inbox" }}
      />
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

export default function App() {
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
      if (live) setGate(token || seen ? "open" : "welcome");
    })();
    return () => {
      live = false;
    };
  }, []);

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
      <NavigationContainer theme={theme}>
        <StatusBar style="light" />
        <Stack.Navigator
          screenOptions={({ navigation, route }) => ({
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.textPrimary,
            headerTitleStyle: { fontWeight: "700" },
            // Swipe back from anywhere on the screen, not just the left
            // edge — the whole surface is the back gesture, like Instagram.
            gestureEnabled: true,
            fullScreenGestureEnabled: true,
            headerLeft: ({ canGoBack }) =>
              canGoBack ? (
                <HeaderBack
                  label={BACK_LABELS[route.name as keyof StackParams] ?? "Back"}
                  onPress={() => navigation.goBack()}
                />
              ) : (
                <View />
              ),
          })}
        >
          <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
          <Stack.Screen
            name="Room"
            component={RoomTab}
            options={{ title: "Room", headerBackTitle: "Back" }}
          />
          <Stack.Screen
            name="LocalThread"
            component={ThreadScreen}
            options={{ title: "Conversation", headerBackTitle: "Local" }}
          />
          <Stack.Screen
            name="SignIn"
            options={{ title: "Sign in", headerBackTitle: "Back" }}
          >
            {({ navigation }) => (
              <SignInScreen onSignedIn={() => navigation.goBack()} />
            )}
          </Stack.Screen>
          <Stack.Screen
            name="Scan"
            options={{ title: "Scan", headerBackTitle: "Back" }}
          >
            {({ navigation }) => (
              <ScanScreen onCode={() => navigation.navigate("Room")} />
            )}
          </Stack.Screen>
          <Stack.Screen
            name="Settings"
            component={SettingsScreen}
            options={{ title: "Settings", headerBackTitle: "Profile" }}
          />
          <Stack.Screen
            name="Store"
            component={StoreScreen}
            options={{ title: "Embers store", headerBackTitle: "Profile" }}
          />
          <Stack.Screen
            name="Customize"
            options={{ title: "Customize", headerBackTitle: "Profile" }}
          >
            {({ route }) => <CustomizeScreen area={route.params?.area ?? "profile"} />}
          </Stack.Screen>
          <Stack.Screen
            name="PlayerProfile"
            component={PlayerProfileScreen}
            options={{ title: "Player", headerBackTitle: "Back" }}
          />
          <Stack.Screen
            name="StoreProfile"
            options={{ title: "Store", headerBackTitle: "Back" }}
          >
            {({ route }) => <StoreProfileScreen storeId={route.params.storeId} />}
          </Stack.Screen>
          <Stack.Screen
            name="FindPlayer"
            component={FindPlayerScreen}
            options={{ title: "Find a player", headerBackTitle: "Local" }}
          />
          <Stack.Screen
            name="PostFlare"
            // The back button names where it goes, not the screen's internal
            // name — "Tabs" meant nothing to anyone at a counter.
            options={{ title: "Post a Flare", headerBackTitle: "Room" }}
          >
            {({ route }) => (
              <PostFlareScreen target={{ kind: "room", code: route.params.code }} />
            )}
          </Stack.Screen>
        </Stack.Navigator>
      </NavigationContainer>
    </StartupGuard>
  );
}
