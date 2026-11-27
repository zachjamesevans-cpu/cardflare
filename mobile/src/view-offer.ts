import { Alert } from "react-native";

import { openDirectThread } from "./api";

/**
 * "View offer": the conversation with the poster, which is where an
 * offer lands: a message carrying the cards (server: posts.ts
 * offerItems, since 2026-11-27 "these offers should go to messages").
 * The founder (2026-11-27): "should be able to view the offer/
 * conversation from this screen with a button."
 */
export async function openOfferThread(
  navigation: { navigate: (screen: "LocalThread", params: { threadId: string }) => void },
  playerId: string,
): Promise<void> {
  try {
    const result = await openDirectThread(playerId);
    if (result.ok && result.threadId) {
      navigation.navigate("LocalThread", { threadId: result.threadId });
      return;
    }
    Alert.alert("Could not open the conversation", result.message ?? "Try again in a moment.");
  } catch {
    Alert.alert("Could not open the conversation", "Try again in a moment.");
  }
}
