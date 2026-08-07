import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { registerDevice } from "./api";

/**
 * Push registration: ask once, register the Expo token with the API.
 *
 * Called only after sign-in — a permission prompt before the app has
 * shown any value is how permissions get denied forever. Every failure
 * is silent-but-logged: the app works fully without push, exactly as
 * the website does.
 */
export async function registerForPush(): Promise<void> {
  try {
    // Simulators have no push service; asking would only error.
    if (!Device.isDevice) return;

    const existing = await Notifications.getPermissionsAsync();
    const status = existing.granted
      ? existing
      : await Notifications.requestPermissionsAsync();

    if (!status.granted) return;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "CardFlare",
        importance: Notifications.AndroidImportance.HIGH,
      });
    }

    const token = await Notifications.getExpoPushTokenAsync();

    await registerDevice(
      Platform.OS === "ios" ? "ios" : "android",
      token.data,
    );
  } catch (error) {
    console.warn("Push registration skipped", error);
  }
}
