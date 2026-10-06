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
 * said. One function, used by the Feed's notice buttons, the Inbox's
 * rows and a tap on a push notification, so the three cannot disagree.
 *
 * Every path a notice can carry has a line here: /e/<code> (with or
 * without a query), /local?thread=<id>, /local, /feed, /feed?post=<id>, /inbox,
 * /profile, /p/<playerId>, /s/<storeId>, /cards/<cardId> and /nights.
 * A tap on a push used to land a message notice on the Messages list
 * with the conversation one row down; now the path names the thread
 * and the tap opens it.
 */
export async function followHref(
  navigation: Pick<NativeStackNavigationProp<StackParams>, "navigate">,
  href: string,
): Promise<void> {
  if (href.startsWith("/e/")) {
    const code = href.slice(3).split(/[?#/]/)[0].trim().toUpperCase();
    if (code) await rememberRoom(code);
    openRoom(navigation);
    return;
  }
  if (href === "/room") {
    openRoom(navigation);
    return;
  }
  /* A message notice names its conversation: /local?thread=<id>. */
  if (href.startsWith("/local?")) {
    const threadId = queryValue(href, "thread");
    if (threadId) {
      navigation.navigate("LocalThread", { threadId });
      return;
    }
  }
  if (href === "/local" || href.startsWith("/local?")) {
    if (LOCAL_ENABLED) navigation.navigate("Tabs", { screen: "Local" });
    else navigation.navigate("Tabs", { screen: "Messages" });
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
  /* A comment notice names its post: /feed?post=<id>. */
  if (href.startsWith("/feed?")) {
    const postId = queryValue(href, "post");
    if (postId) {
      navigation.navigate("FlarePost", { postId });
      return;
    }
  }
  if (href === "/feed" || href.startsWith("/feed?")) {
    navigation.navigate("Tabs", { screen: "Feed" });
    return;
  }
  /* The notices are a screen behind the Feed's bell, not a tab. */
  if (href === "/inbox") {
    navigation.navigate("Inbox");
    return;
  }
  /* Nights holds the second tab unless Local has it; with Local on
     there is no Nights tab to land on, and the website has the list. */
  if (href === "/nights" && !LOCAL_ENABLED) {
    navigation.navigate("Tabs", { screen: "Nights" });
    return;
  }
  /* Somebody's profile, or a shop. Only the page itself: /p/<id>/binders
     and the like are website pages the app has no door for yet. */
  if (href.startsWith("/p/")) {
    const playerId = segmentAfter(href, "/p/");
    if (playerId) {
      navigation.navigate("PlayerProfile", { playerId });
      return;
    }
  }
  if (href.startsWith("/s/")) {
    const storeId = segmentAfter(href, "/s/");
    if (storeId) {
      navigation.navigate("StoreProfile", { storeId });
      return;
    }
  }
  /* One card's page: who has it, who hunts it, where it sits. */
  if (href.startsWith("/cards/")) {
    const cardId = segmentAfter(href, "/cards/");
    if (cardId) {
      navigation.navigate("Card", { cardId });
      return;
    }
  }
  await Linking.openURL(`${API_BASE}${href}`).catch(() => {});
}

/**
 * One value out of a link's query string, by hand: React Native's own
 * URL polyfill can build a query but throws on reading one back.
 */
function queryValue(href: string, key: string): string | null {
  const query = href.split("#")[0].split("?", 2)[1] ?? "";
  for (const pair of query.split("&")) {
    const [name, value = ""] = pair.split("=", 2);
    if (decodeURIComponent(name) !== key) continue;
    const trimmed = decodeURIComponent(value.replace(/\+/g, " ")).trim();
    return trimmed || null;
  }
  return null;
}

/** The one id after a prefix, or null when the path goes on past it. */
function segmentAfter(href: string, prefix: string): string | null {
  const rest = href.split(/[?#]/)[0].slice(prefix.length);
  if (!rest || rest.includes("/")) return null;
  return decodeURIComponent(rest);
}
