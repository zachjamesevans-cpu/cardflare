import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import type { StackParams } from "../App";

/**
 * The one way to open the live room, wherever the room lives.
 *
 * Room is a stack screen now, whichever way the Local switch is set:
 * its tab slot is Nights (the founder, 2026-10-03: "Trying to keep our
 * tabs to our 'hero's'"), and the Nights screen's "Scan or enter a
 * code" is the door to it. Every door into the room still goes through
 * here, so if the room ever moves again they all move at once.
 */
export function openRoom(
  navigation: Pick<NativeStackNavigationProp<StackParams>, "navigate">,
): void {
  navigation.navigate("Room");
}
