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
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";

import { useRef } from "react";
import {
  Animated,
  Image,
  Pressable,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { AccountScreen } from "./src/screens/account";
import { HomeScreen } from "./src/screens/home";
import { HubScreen } from "./src/screens/hub";
import { InboxScreen } from "./src/screens/inbox";
import { PostFlareScreen } from "./src/screens/post-flare";
import { RoomTab } from "./src/screens/room";
import { ScanScreen } from "./src/screens/scan";
import { SignInScreen } from "./src/screens/sign-in";
import { colors } from "./src/theme";

/**
 * CardFlare for the pocket. The same backend, the same account, the same
 * rooms as cardflare.gg — plus the one thing a website cannot do: tell
 * you about an offer while your phone is locked.
 *
 * Four tabs: Join (the front door — scan or type a code), Room (where
 * you are right now; remembers the last room), Inbox, Account. Scanning,
 * posting and signing in ride on top as stack screens.
 */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export type TabParams = {
  Join: undefined;
  Room: undefined;
  Flare: undefined;
  Inbox: undefined;
  Account: undefined;
};

export type StackParams = {
  Tabs: { screen?: keyof TabParams } | undefined;
  SignIn: undefined;
  Scan: undefined;
  PostFlare: { code: string };
};

const Tab = createBottomTabNavigator<TabParams>();
const Stack = createNativeStackNavigator<StackParams>();

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

const TAB_ICONS: Partial<Record<keyof TabParams, keyof typeof Ionicons.glyphMap>> = {
  Join: "qr-code",
  Room: "people",
  Inbox: "notifications",
  Account: "person-circle",
};

/*
 * The centre tab wears the mark itself — the approved asset, copied
 * byte-for-byte from public/brand, sized by height as the brand rules
 * require. Dimmed when inactive the same way the icon tabs are.
 */
function MarkIcon({ focused }: { focused: boolean }) {
  return (
    <Image
      source={require("./assets/cardflare-mark.png")}
      style={{ height: 34, width: 34, resizeMode: "contain", opacity: focused ? 1 : 0.55 }}
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
            <MarkIcon focused={focused} />
          );
        },
      })}
    >
      <Tab.Screen name="Join" component={HomeScreen} options={{ title: "CardFlare" }} />
      <Tab.Screen name="Room" component={RoomTab} />
      <Tab.Screen
        name="Flare"
        component={HubScreen}
        options={{ title: "Post a Flare", tabBarLabel: "Flare" }}
      />
      <Tab.Screen name="Inbox" component={InboxScreen} options={{ title: "Notifications" }} />
      <Tab.Screen name="Account" component={AccountScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <NavigationContainer theme={theme}>
      <StatusBar style="light" />
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.textPrimary,
          headerTitleStyle: { fontWeight: "700" },
          // Swipe back from anywhere on the screen, not just the left
          // edge — the whole surface is the back gesture, like Instagram.
          gestureEnabled: true,
          fullScreenGestureEnabled: true,
        }}
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
  );
}
