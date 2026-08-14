import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Text, View } from "react-native";

import { colors, spacing } from "./theme";

/**
 * "This player will look at anything", said next to their name — the
 * website's OpenToTradesTag: same icon, same words, so the two clients
 * are not two dialects of the same fact.
 */
export function OpenToTradesTag() {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(1) }}>
      <MaterialCommunityIcons name="swap-horizontal" size={14} color={colors.accent} />
      <Text style={{ color: colors.accent, fontSize: 12 }}>Open to trades</Text>
    </View>
  );
}
