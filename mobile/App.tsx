import { Ionicons } from "@expo/vector-icons";
import {
  DarkTheme,
  NavigationContainer,
  type Theme,
} from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";

import { AccountScreen } from "./src/screens/account";
import { HomeScreen } from "./src/screens/home";
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

const TAB_ICONS: Record<keyof TabParams, keyof typeof Ionicons.glyphMap> = {
  Join: "qr-code",
  Room: "flame",
  Inbox: "notifications",
  Account: "person-circle",
};

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { fontWeight: "700" },
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={TAB_ICONS[route.name as keyof TabParams]} color={color} size={size} />
        ),
      })}
    >
      <Tab.Screen name="Join" component={HomeScreen} options={{ title: "CardFlare" }} />
      <Tab.Screen name="Room" component={RoomTab} />
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
        }}
      >
        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
        <Stack.Screen name="SignIn" options={{ title: "Sign in" }}>
          {({ navigation }) => (
            <SignInScreen onSignedIn={() => navigation.goBack()} />
          )}
        </Stack.Screen>
        <Stack.Screen name="Scan" options={{ title: "Scan" }}>
          {({ navigation }) => (
            <ScanScreen
              onCode={() => navigation.navigate("Tabs", { screen: "Room" })}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="PostFlare" options={{ title: "Post a Flare" }}>
          {({ route, navigation }) => (
            <PostFlareScreen
              code={route.params.code}
              onPosted={() => navigation.goBack()}
            />
          )}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
}
