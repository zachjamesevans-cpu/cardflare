import { StackActions } from "@react-navigation/native";

import type { TabParams } from "../App";

/**
 * Open the Flare composer ON TOP of wherever you are, so back returns
 * there exactly: the card sheet still open, the search still typed, the
 * hunt where it was. The founder (2026-11-25): "when you ... click back,
 * it goes to the main feed. it should go to exactly where u just were."
 * The composer used to be a tab, and a tab's back is the first tab.
 *
 * A push, never a navigate: from a tab it bubbles up to the app's stack;
 * from the card sheet it lands inside the sheet's own stack.
 */
export function openComposer(
  navigation: {
    dispatch: (
      action: ReturnType<typeof StackActions.push> | ReturnType<typeof StackActions.popTo>,
    ) => void;
    getState?: () => { routes: readonly { name: string }[] } | undefined;
  },
  params?: TabParams["Flare"],
): void {
  /* One already open underneath (a card opened from "Add cards"): back
     down to it, never a second composer on top. */
  if (!params && navigation.getState?.()?.routes.some((route) => route.name === "Compose")) {
    navigation.dispatch(StackActions.popTo("Compose"));
    return;
  }
  navigation.dispatch(StackActions.push("Compose", params));
}
