import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";

import { colors } from "./theme";

/**
 * The card carries its poster's note: a small mark in the tile's top
 * right, which is free on every Feed tile (the copies tag owns the top
 * left, the FOUND band the foot). The note itself is read when the card
 * is opened, so it costs the Feed no space - but without the mark
 * nobody would know to open it. The website's FeedTile draws the same.
 */
export function NoteMark() {
  return (
    <View
      pointerEvents="none"
      accessibilityLabel="Has a note"
      style={{
        position: "absolute",
        top: 4,
        right: 4,
        width: 20,
        height: 20,
        borderRadius: 4,
        backgroundColor: "rgba(0,0,0,0.75)",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons name="chatbox-ellipses" size={12} color={colors.accent} />
    </View>
  );
}
