import { useNavigation } from "@react-navigation/native";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { cartCount, useFlareCart } from "../flare-cart";
import { Button } from "../ui";
import { colors, gutter, spacing } from "../theme";
import { SearchLabScreen } from "./search-lab";

/** The Done bar's height, kept clear at the foot of the search. */
const BAR = 88;

/**
 * "ADD CARDS", from the composer: the Search screen itself, not a list
 * of its own. The founder (2026-11-27), of the old stacked picker beside
 * Search's grid of art: "should we make them the same?" then "yes go".
 *
 * The same field, game chips, recently viewed, game hubs and tiles; a
 * tile opens the same floating card, whose + adds the art on show to
 * your Flare and a second tap another copy (flare-cart.ts). The composer
 * underneath hears each add (onCartWritten) and Done goes back to it.
 * Cards only: players and stores are not something a Flare asks for.
 */
export function AddCardsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  useFlareCart();
  const count = cartCount();

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <View
        style={{
          paddingTop: spacing(4),
          paddingBottom: spacing(2),
          alignItems: "center",
        }}
      >
        <Text
          accessibilityRole="header"
          style={{ color: colors.textPrimary, fontSize: 17, fontWeight: "700" }}
        >
          Add cards
        </Text>
      </View>
      <SearchLabScreen adding bottomInset={BAR + insets.bottom} />
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: gutter,
          paddingTop: spacing(3),
          paddingBottom: insets.bottom + spacing(3),
          backgroundColor: colors.canvas,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}
      >
        <Button
          label={count > 0 ? `Done (${count})` : "Done"}
          onPress={() => navigation.goBack()}
        />
      </View>
    </View>
  );
}
