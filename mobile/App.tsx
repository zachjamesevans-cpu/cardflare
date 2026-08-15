import { Ionicons } from "@expo/vector-icons";
import { DarkTheme, NavigationContainer, type Theme } from "@react-navigation/native";
import {
  createBottomTabNavigator,
  type BottomTabBarButtonProps,
} from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";

import { Component, useRef, type ReactNode } from "react";
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
import { HomeScreen } from "./src/screens/home";
import { HubScreen } from "./src/screens/hub";
import { InboxScreen } from "./src/screens/inbox";
import { PostFlareScreen } from "./src/screens/post-flare";
import { RoomTab } from "./src/screens/room";
import { ScanScreen } from "./src/screens/scan";
import { SettingsScreen } from "./src/screens/settings";
import { StoreScreen } from "./src/screens/store";
import { SignInScreen } from "./src/screens/sign-in";
import { colors } from "./src/theme";

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
  Join: undefined;
  Room: undefined;
  Flare: undefined;
  Inbox: undefined;
  Profile: undefined;
};

export type StackParams = {
  Tabs: { screen?: keyof TabParams } | undefined;
  SignIn: undefined;
  Scan: undefined;
  Settings: undefined;
  /** The Embers store, the website's /profile/store. */
  Store: undefined;
  PostFlare: { code: string };
  /** Somebody else's profile, from the room popup's View full profile. */
  PlayerProfile: { playerId: string };
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
  PlayerProfile: "Back",
  PostFlare: "Room",
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
  Join: "qr-code-outline",
  Room: "people-outline",
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
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { fontWeight: "700" },
        tabBarButton: (props) => <TabButton {...props} />,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
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
      {/* The dock says Join, the header says CardFlare - the website's
          split exactly: its dock label is Join under a QR icon while the
          page banner carries the product name. */}
      <Tab.Screen
        name="Join"
        component={HomeScreen}
        options={{ title: "CardFlare", tabBarLabel: "Join" }}
      />
      <Tab.Screen name="Room" component={RoomTab} />
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
        </ScrollView>
      );
    }
    return this.props.children;
  }
}

export default function App() {
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
              <ScanScreen
                onCode={() => navigation.navigate("Tabs", { screen: "Room" })}
              />
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
            name="PlayerProfile"
            component={PlayerProfileScreen}
            options={{ title: "Player", headerBackTitle: "Back" }}
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
