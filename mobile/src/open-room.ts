import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import type { StackParams } from "../App";
import { LOCAL_ENABLED } from "./local-enabled";

/**
 * The one way to open the live room, wherever the room lives.
 *
 * With Local on, Room is a stack screen (its tab slot is Local's) and is
 * reached by name. With Local off, Room is a TAB again, and a screen
 * outside the tab navigator has to name the tabs to reach it. Every
 * door into the room goes through here so flipping the flag moves them
 * all at once.
 */
export function openRoom(
  navigation: Pick<NativeStackNavigationProp<StackParams>, "navigate">,
): void {
  if (LOCAL_ENABLED) navigation.navigate("Room");
  else navigation.navigate("Tabs", { screen: "Room" });
}
