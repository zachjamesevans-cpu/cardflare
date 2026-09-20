import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";

import type { StackParams } from "../../App";
import { describeError, getHunt, type HuntView } from "../api";
import { HuntExpanded } from "../hunts-panel";
import { colors, gutter, spacing } from "../theme";
import { Card, Muted, Tap, Title } from "../ui";

/**
 * One hunt on its own screen: the website's /hunts/[huntId].
 *
 * The profile shows a hunt folded under its row, which is right for a
 * glance and wrong for a list of thirty. This is the same expanded
 * content with the whole screen to itself, reached from "View hunt" on
 * a Feed post and from a shared link.
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
        <Muted>
          {error
            ? `This hunt could not be opened (${error}). It may be private, or gone.`
            : "Loading…"}
        </Muted>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.canvas }}
      contentContainerStyle={{
        paddingHorizontal: gutter,
        paddingVertical: spacing(4),
        gap: spacing(3),
      }}
    >
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}>
          <MaterialCommunityIcons
            name="format-list-checks"
            size={16}
            color={colors.accent}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Title>{hunt.name}</Title>
            {/* The owner's name opens their profile, the website's link. */}
            {!hunt.yours ? (
              <Tap
                onPress={() =>
                  navigation.navigate("PlayerProfile", { playerId: hunt.playerId })
                }
                accessibilityLabel={`${hunt.ownerName}'s profile`}
                hitSlop={6}
              >
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                  <Text style={{ color: colors.textSecondary, fontWeight: "600" }}>
                    {hunt.ownerName}
                  </Text>
                  {"'s hunt"}
                </Text>
              </Tap>
            ) : null}
          </View>
        </View>
        <HuntExpanded
          hunt={hunt}
          yours={hunt.yours}
          onAdd={(id) =>
            navigation.navigate("Tabs", { screen: "Flare", params: { hunt: id } })
          }
          onChanged={() => void load()}
        />
      </Card>
    </ScrollView>
  );
}
