import {
  DarkTheme,
  NavigationContainer,
  type Theme,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";

import { HomeScreen } from "./src/screens/home";
import { InboxScreen } from "./src/screens/inbox";
import { RoomScreen } from "./src/screens/room";
import { ScanScreen } from "./src/screens/scan";
import { SignInScreen } from "./src/screens/sign-in";
import { colors } from "./src/theme";

/**
 * CardFlare for the pocket. The same backend, the same account, the same
 * rooms as cardflare.gg — plus the one thing a website cannot do: tell
 * you about an offer while your phone is locked.
 */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export type StackParams = {
  Home: undefined;
  SignIn: undefined;
  Scan: undefined;
  Room: { code: string };
  Inbox: undefined;
};

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
        <Stack.Screen name="Home" options={{ title: "CardFlare" }}>
          {({ navigation }) => (
            <HomeScreen
              onScan={() => navigation.navigate("Scan")}
              onEnterCode={(code) => navigation.navigate("Room", { code })}
              onSignIn={() => navigation.navigate("SignIn")}
              onInbox={() => navigation.navigate("Inbox")}
              onSignedOut={() => navigation.navigate("Home")}
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="SignIn" options={{ title: "Sign in" }}>
          {({ navigation }) => (
            <SignInScreen onSignedIn={() => navigation.navigate("Home")} />
          )}
        </Stack.Screen>

        <Stack.Screen name="Scan" options={{ title: "Scan" }}>
          {({ navigation }) => (
            <ScanScreen
              onCode={(code) => navigation.replace("Room", { code })}
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="Room" options={{ title: "Room" }}>
          {({ route }) => <RoomScreen code={route.params.code} />}
        </Stack.Screen>

        <Stack.Screen
          name="Inbox"
          component={InboxScreen}
          options={{ title: "Notifications" }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
