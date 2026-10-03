import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { registerDevice, rememberPushToken } from "./api";

/**
 * Push registration: ask once, register the Expo token with the API.
 *
 * Two callers, two moods:
 *
 * - Sign-in and welcome call it with the prompt on. A permission prompt
 *   before the app has shown any value is how permissions get denied
 *   forever, so the ask waits until somebody has an account to be told
 *   about.
 * - The front door calls it with the prompt OFF on every launch that
 *   finds a stored session. A reinstall, a restore to a new phone or a
 *   rotated token all leave the server holding a token this phone no
 *   longer answers to, and nothing used to re-register until the next
 *   sign-in, which for most people is never. With the prompt off it
 *   never asks: permission already granted means the token is fetched
 *   and registered again (the server's row is keyed on the token, so a
 *   repeat is a no-op), anything else means it quietly returns.
 *
 * Every failure is silent-but-logged: the app works fully without push,
 * exactly as the website does.
 */
export async function registerForPush(
  { prompt }: { prompt: boolean } = { prompt: true },
): Promise<void> {
  try {
    // Simulators have no push service; asking would only error.
    if (!Device.isDevice) return;

    const existing = await Notifications.getPermissionsAsync();
    if (!existing.granted && !prompt) return;

    const status = existing.granted
      ? existing
      : await Notifications.requestPermissionsAsync();

    if (!status.granted) return;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "cardflare",
        importance: Notifications.AndroidImportance.HIGH,
      });
    }

    /* Expo Go can infer the project; a standalone (TestFlight/dev-client)
       build cannot, and getExpoPushTokenAsync THROWS without a projectId
       there, which this function's catch would then swallow, leaving
       push silently dead in exactly the builds that ship. */
    const projectId: string | undefined =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const token = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );

    await registerDevice(Platform.OS === "ios" ? "ios" : "android", token.data);
    await rememberPushToken(token.data);
  } catch (error) {
    console.warn("Push registration skipped", error);
  }
}

/**
 * The number on the app icon.
 *
 * Every push the server sends carries the unread count as its badge, so
 * the icon is right the moment a notice lands. It would then stay
 * wrong: nothing on the phone knew when the notices had been read. So
 * the Inbox sets it from what it loads and clears it once it has marked
 * them read, and the icon agrees with the list.
 *
 * Never throws: a badge is a courtesy, and a simulator without a push
 * service must not take the Inbox down over it.
 */
export async function syncBadge(unread: number): Promise<void> {
  try {
    await Notifications.setBadgeCountAsync(Math.max(0, Math.floor(unread)));
  } catch (error) {
    console.warn("Badge not set", error);
  }
}
