import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, View } from "react-native";

import type { StackParams } from "../../App";
import {
  ApiError,
  type BinderSummary,
  friendlyError,
  listBinders,
  peekPlayer,
} from "../api";
import { BINDERS_EMPTY, BINDERS_EMPTY_HINT } from "../empty-copy";
import { BinderList } from "../binder-list";
import { cachedPlayerId, readCache, writeCache } from "../cache";
import { CreateBinderSheet } from "../create-binder-sheet";
import { colors, gutter, spacing } from "../theme";
import { AsyncButton, Button, Loading, Muted } from "../ui";

/**
 * Every binder somebody has, as a list: the website's
 * /profile/binders with no id, /p/[playerId]/binders with one. The
 * profile's Binders pane draws the same rows in place; this screen
 * stays registered for anything else that wants to open the list.
 *
 * The owner's order. The owner starts a new one from the button at
 * the top; a visitor sees only the binders up for trade, which can be
 * none.
 */
export function BindersScreen({ playerId }: { playerId?: string }) {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const [binders, setBinders] = useState<BinderSummary[] | null>(null);
  const [ownerName, setOwnerName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  /* Whose list this is, in the cache: the owner's id, or the viewer's
     own. Under the signed-in player's id either way (cache.ts), so the
     next account on this phone never reads it. */
  const cacheKey = playerId ?? "mine";
  /* The list a fresh read has painted, so a slow disk read never paints
     an older one over it. */
  const freshFor = useRef<string | null>(null);

  /*
   * The list as last seen, painted at once: the screen opened on a
   * spinner every time. The fresh read below lands over it, the way
   * the Feed's does. Only when nothing is on screen yet.
   */
  useEffect(() => {
    let live = true;
    void (async () => {
      const viewer = await cachedPlayerId();
      if (!viewer) return;
      const cached = await readCache<BinderSummary[]>("binders", viewer, cacheKey);
      if (live && Array.isArray(cached) && freshFor.current !== cacheKey) {
        setBinders((current) => current ?? cached);
      }
    })();
    return () => {
      live = false;
    };
  }, [cacheKey]);

  const load = useCallback(async () => {
    try {
      const { binders: fresh } = await listBinders(playerId);
      freshFor.current = cacheKey;
      setBinders(fresh);
      setError(null);
      const viewer = await cachedPlayerId();
      if (viewer) void writeCache("binders", viewer, fresh, cacheKey);
    } catch (caught) {
      const closed = caught instanceof ApiError && caught.code === "private";
      setError(closed ? "private" : friendlyError(caught));
      if (closed) {
        /* Private now: the last look goes from the screen and from the
           phone, so it cannot be painted again. A failed read for any
           other reason keeps what is on screen. */
        freshFor.current = cacheKey;
        setBinders(null);
        const viewer = await cachedPlayerId();
        if (viewer) void writeCache("binders", viewer, null, cacheKey);
      }
    }
  }, [playerId, cacheKey]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  /* Whose binders these are, for the header. */
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
          <View style={{ gap: spacing(3) }}>
            <Muted>{`The binders could not be opened (${error}).`}</Muted>
            <AsyncButton
              label="Try again"
              pendingLabel="Retrying…"
              onPress={() => load()}
            />
          </View>
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
        {yours ? <Button label="New binder" onPress={() => setCreating(true)} /> : null}

        {binders.length === 0 ? (
          yours ? (
            /* What a binder is for and what filling one takes, under
               the button that starts one. The intro's "Add a binder"
               lands a new player here. Same lines as the website. */
            <View style={{ gap: spacing(1) }}>
              <Muted>{BINDERS_EMPTY}</Muted>
              <Muted>{BINDERS_EMPTY_HINT}</Muted>
            </View>
          ) : (
            <Muted>No binders to open.</Muted>
          )
        ) : (
          <BinderList
            binders={binders}
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
