import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Linking } from "react-native";

import type { StackParams } from "../App";
import { rememberRoom } from "./api";
import { API_BASE } from "./config";
import { LOCAL_ENABLED } from "./local-enabled";
import { openRoom } from "./open-room";

/**
 * Where a website path goes on a phone.
 *
 * Every notice the server sends carries its link as a website path,
 * because that is the one form both platforms can read. The handful
 * the app has a screen for are routed to it; anything else opens the
 * website, which is honest: the button always lands where its label
 * said. One function, used by the Feed's notice buttons and by a tap
 * on a push notification, so the two cannot disagree.
 */
export async function followHref(
  navigation: Pick<NativeStackNavigationProp<StackParams>, "navigate">,
  href: string,
): Promise<void> {
  if (href.startsWith("/e/")) {
    const code = href.slice(3).split(/[?#]/)[0].trim().toUpperCase();
    if (code) await rememberRoom(code);
    openRoom(navigation);
    return;
  }
  if (href === "/room") {
    openRoom(navigation);
    return;
  }
  if (href === "/local") {
    if (LOCAL_ENABLED) navigation.navigate("Tabs", { screen: "Local" });
    else navigation.navigate("Messages");
    return;
  }
  if (href === "/profile/settings") {
    navigation.navigate("Settings");
    return;
  }
  if (href === "/profile") {
    navigation.navigate("Tabs", { screen: "Profile" });
    return;
  }
  if (href === "/feed" || href === "/inbox") {
    navigation.navigate("Tabs", { screen: href === "/feed" ? "Feed" : "Inbox" });
    return;
  }
  await Linking.openURL(`${API_BASE}${href}`).catch(() => {});
}
