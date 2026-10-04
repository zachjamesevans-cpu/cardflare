import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useState } from "react";
import { ScrollView, View } from "react-native";

import type { StackParams } from "../../App";
import { describeError, getHunt, type HuntView } from "../api";
import { HuntBinder } from "../hunt-binder";
import { colors, gutter, spacing } from "../theme";
import { Loading, Muted } from "../ui";

/**
 * One hunt on its own screen: the website's /hunts/[huntId].
 *
 * Drawn like an open binder, by hunt-binder.tsx: the name on top, the
 * progress bar, pages of nine pockets. Reached from a row on the Hunts
 * tab, from "View hunt" on a Feed post and from a shared link.
 *
 * Who owns it decides what it offers: the owner sets copies and adds
 * cards, a visitor picks what they have. The server says which with
 * `yours`, so a screenshot of somebody else's hunt can never show a
 * stepper.
 */
export function HuntScreen({ huntId }: { huntId: string }) {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const [hunt, setHunt] = useState<HuntView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { hunt: fresh } = await getHunt(huntId);
      setHunt(fresh);
      setError(null);
    } catch (caught) {
      setError(describeError(caught));
    }
  }, [huntId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!hunt) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.canvas,
          paddingHorizontal: gutter,
          paddingVertical: spacing(4),
        }}
      >
        {error ? (
          <Muted>
            {`This hunt could not be opened (${error}). It may be private, or gone.`}
          </Muted>
        ) : (
          <Loading />
        )}
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.canvas }}
      contentContainerStyle={{
        paddingHorizontal: gutter,
        paddingVertical: spacing(3),
        gap: spacing(3),
      }}
    >
      <HuntBinder
        hunt={hunt}
        yours={hunt.yours}
        onAdd={(id) =>
          navigation.navigate("Tabs", { screen: "Flare", params: { hunt: id } })
        }
        onChanged={() => void load()}
        onOwner={() =>
          navigation.navigate("PlayerProfile", { playerId: hunt.playerId })
        }
      />
    </ScrollView>
  );
}
