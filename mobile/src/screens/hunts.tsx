import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useState } from "react";
import { ScrollView, View } from "react-native";

import type { StackParams } from "../../App";
import { describeError, getProfile, peekPlayer, type Hunt } from "../api";
import { HuntsPanel } from "../hunts-panel";
import { colors, gutter, spacing } from "../theme";
import { Loading, Muted } from "../ui";

/**
 * Somebody's hunts on their own screen: the website's /profile/hunts
 * with no id, /p/[playerId]/hunts with one. Reached from the Hunts
 * stop in the icon row on either profile.
 *
 * The panel is the one the profile used to carry, with exactly the
 * wiring it had there: the owner's "Add cards" lands in the composer
 * with the hunt chosen, and every write inside the panel asks for the
 * truth again behind it. What moved is only where it lives, the
 * founder's call: "users only see deeper information after tapping
 * into them."
 */
export function HuntsScreen({ playerId }: { playerId?: string }) {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const [hunts, setHunts] = useState<Hunt[] | null>(null);
  const [limit, setLimit] = useState<number | undefined>(undefined);
  const [ownerName, setOwnerName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      if (playerId) {
        const profile = await peekPlayer(playerId);
        setHunts(profile.hunts ?? []);
        setOwnerName(profile.displayName);
      } else {
        const { profile } = await getProfile();
        setHunts(profile.hunts ?? []);
        setLimit(profile.huntLimit);
        setOwnerName(profile.displayName);
      }
      setError(null);
    } catch (caught) {
      setError(describeError(caught));
    }
  }, [playerId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  /* The header names whose hunts these are, once that is known. */
  useEffect(() => {
    if (!ownerName) return;
    navigation.setOptions({
      title: playerId ? `${ownerName}'s hunts` : "Your hunts",
    });
  }, [ownerName, playerId, navigation]);

  if (!hunts) {
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
          <Muted>{`The hunts could not be opened (${error}).`}</Muted>
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
      {playerId ? (
        <HuntsPanel hunts={hunts} ownerName={ownerName} onChanged={() => void load()} />
      ) : (
        <HuntsPanel
          hunts={hunts}
          limit={limit}
          yours
          /* Into the composer with the hunt already chosen, by id, so
             "Add cards" adds to THIS hunt rather than starting a
             fresh one that happens to share a name. */
          onAdd={(huntId) =>
            navigation.navigate("Tabs", {
              screen: "Flare",
              params: { hunt: huntId },
            })
          }
          /* Every write inside the panel paints first and then asks
             for the truth, so the counts on the row move with the
             stepper rather than going stale until the next open. */
          onChanged={() => void load()}
        />
      )}
      {error ? <Muted>{`Could not refresh (${error}).`}</Muted> : null}
    </ScrollView>
  );
}
