import { createNavigationContainerRef } from "@react-navigation/native";

import type { StackParams } from "../App";

/**
 * The app's one navigation container, reachable from outside a screen:
 * links from notifications, and anything that must navigate after its
 * own screen has gone (the card sheet's Flare button, screens/card.tsx).
 */
export const navigationRef = createNavigationContainerRef<StackParams>();
