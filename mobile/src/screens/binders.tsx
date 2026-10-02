import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useState } from "react";
import { ScrollView, View } from "react-native";

import type { StackParams } from "../../App";
import {
  ApiError,
  describeError,
  listBinders,
  peekPlayer,
  type BinderSummary,
} from "../api";
import { BinderList } from "../binder-list";
import { CreateBinderSheet } from "../create-binder-sheet";
import { colors, gutter, spacing } from "../theme";
import { Button, Loading, Muted } from "../ui";

/**
 * Every binder somebody has, as a list: the website's
 * /profile/binders with no id, /p/[playerId]/binders with one.
 * Reached from the Binders stop in the icon row on either profile,
 * and from nowhere else.
 *
 * The Trade binder first, then the custom ones in the owner's order.
 * The owner starts a new one from the button at the top; a visitor
 * sees only the binders they may open, which can be none.
 */
export function BindersScreen({ playerId }: { playerId?: string }) {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const [binders, setBinders] = useState<BinderSummary[] | null>(null);
  const [ownerName, setOwnerName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const { binders: fresh } = await listBinders(playerId);
      setBinders(fresh);
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.code === "private"
          ? "private"
          : describeError(caught),
      );
    }
  }, [playerId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  /* Whose binders these are, for the header and the covers' labels.
     The owner's own name is on the covers as "Yours". */
  useEffect(() => {
    if (!playerId) return;
    let live = true;
    peekPlayer(playerId)
      .then((profile) => {
        if (live) setOwnerName(profile.displayName);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [playerId]);

  useEffect(() => {
    navigation.setOptions({
      title: playerId
        ? ownerName
          ? `${ownerName}'s binders`
          : "Binders"
        : "Your binders",
    });
  }, [ownerName, playerId, navigation]);

  if (!binders) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.canvas,
          paddingHorizontal: gutter,
          paddingVertical: spacing(4),
        }}
      >
        {error === "private" ? (
          <Muted>These binders are private.</Muted>
        ) : error ? (
          <Muted>{`The binders could not be opened (${error}).`}</Muted>
        ) : (
          <Loading />
        )}
      </View>
    );
  }

  const yours = !playerId;

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.canvas }}
        contentContainerStyle={{
          paddingHorizontal: gutter,
          paddingVertical: spacing(3),
          gap: spacing(3),
        }}
      >
        {yours ? (
          <>
            <Muted>
              The Trade binder is what you will trade. The rest are yours to name.
            </Muted>
            <Button label="New binder" onPress={() => setCreating(true)} />
          </>
        ) : null}

        {binders.length === 0 ? (
          <Muted>{yours ? "No binders yet." : "No binders to open."}</Muted>
        ) : (
          <BinderList
            binders={binders}
            ownerName={ownerName}
            yours={yours}
            onOpen={(binderId) => navigation.navigate("Binder", { playerId, binderId })}
          />
        )}
        {error ? <Muted>{`Could not refresh (${error}).`}</Muted> : null}
      </ScrollView>

      {yours ? (
        <CreateBinderSheet
          visible={creating}
          onClose={() => setCreating(false)}
          onCreated={(binderId) => {
            setCreating(false);
            void load();
            navigation.navigate("Binder", { binderId });
          }}
        />
      ) : null}
    </>
  );
}
