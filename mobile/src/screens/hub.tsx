import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { toTab } from "../to-tab";
import { navigationRef } from "../navigation-ref";
import { StackActions } from "@react-navigation/native";
import { setMyFlares } from "../my-flares";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";

import type { StackParams, TabParams } from "../../App";
import { describeError, getMe, getRoom, lastRoom, onSignedOut, storedAccessToken, type Me } from "../api";
import { cachedPlayerId, readCache, writeCache } from "../cache";
import { FlareComposer, type HandedCard } from "./flare-composer";
import type { PostTarget } from "../flare-bits";
import { Body, Button, Card, Loading, Title } from "../ui";
import { gutter, spacing } from "../theme";



type HubTarget = PostTarget | "scan";

/*
 * THE LAST ANSWER, KEPT. The founder (2026-10-05): the Flare tab
 * "should only show [the loading icon] once ... After the first 'boot'
 * you should be able to just click it instantly later and everything
 * is already loaded." So the tab's last decision and its last list
 * live here for the session, and in the cache (kind `hub`) for the
 * next launch. Only the very first decision ever draws <Loading />;
 * every one after paints the last answer at once and decides again
 * behind it, swapping only if the answer moved. Signing out forgets
 * both, so the next account never sees this one's.
 */
const memory: { target: HubTarget | null; wants: Me["wants"] | null | undefined } = {
  target: null,
  wants: undefined,
};
onSignedOut(() => {
  memory.target = null;
  memory.wants = undefined;
});

/** A cached target, checked: anything else is a miss, not a paint. */
function isTarget(value: unknown): value is PostTarget {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { kind?: unknown; code?: unknown };
  return (
    candidate.kind === "list" ||
    (candidate.kind === "room" && typeof candidate.code === "string")
  );
}

const sameTarget = (a: HubTarget | null, b: HubTarget) =>
  a === b ||
  (a !== null &&
    a !== "scan" &&
    b !== "scan" &&
    a.kind === b.kind &&
    (a.kind !== "room" || (b.kind === "room" && a.code === b.code)));

/**
 * The centre tab — the mark itself, and behind it the list the whole
 * product orbits: the Flares you are looking for. The founder's reframe.
 * Search on top, your standing list underneath, and every place you
 * scan into — a room, a store counter, a card show — is set up to
 * answer that list. Where a new Flare lands depends on where you are:
 *
 * - In a live (or early) room they have joined: straight onto that
 *   board, tonight's loop.
 * - Signed in with no live room — the founder's midnight bug: posting
 *   used to target the *last* room regardless, quietly keeping a
 *   closed store's room warm. Now it saves to the account list
 *   instead, and the next room they walk into offers to post it.
 * - A guest with no room: pointed at the door, honestly. Guests have
 *   no account for a list to live on, so the tab stays a door for
 *   them — the hub is the payoff of signing in, never a gate.
 */
export function HubScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  /*
   * "Add cards" on a profile hunt arrives here as a param: the hunt's
   * id. Read once and cleared, because a param that sticks would
   * re-open the same hunt every time somebody came back to the tab for
   * an unrelated card.
   */
  const route = useRoute<RouteProp<TabParams, "Flare">>();
  const hunt = route.params?.hunt;
  /* With a count, so a second "+" on the same hunt opens into it again. */
  const [openInto, setOpenInto] = useState<{ id: string; n: number } | undefined>(
    undefined,
  );
  useEffect(() => {
    if (hunt === undefined) return;
    setOpenInto((last) => ({ id: hunt, n: (last?.n ?? 0) + 1 }));
    navigation.setParams({ hunt: undefined } as never);
  }, [hunt, navigation]);
  /* "Post a Flare for it" on a card page: the card, read once and
     cleared for the same reason, and handed to the composer to put
     first. */
  const card = route.params?.card;
  const [openWith, setOpenWith] = useState<HandedCard | undefined>(undefined);
  useEffect(() => {
    if (card === undefined) return;
    setOpenWith(card);
    navigation.setParams({ card: undefined } as never);
  }, [card, navigation]);
  const [target, setTarget] = useState<HubTarget | null>(memory.target);

  /* A new launch: last launch's answer, if this account has one. */
  useEffect(() => {
    if (memory.target !== null) return;
    let live = true;
    void (async () => {
      if (!(await storedAccessToken())) return;
      const id = await cachedPlayerId();
      if (!id || !live) return;
      const cached = await readCache<PostTarget>("hub", id);
      if (!live || !isTarget(cached)) return;
      setTarget((current) => current ?? cached);
    })();
    return () => {
      live = false;
    };
  }, []);

  /*
   * The standing list. null = signed out (render nothing), [] = signed
   * in and empty (render the empty state, which earns its space by
   * saying what the list is for).
   */
  const [wants, setWants] = useState<Me["wants"] | null>(memory.wants ?? null);
  const wantsFresh = useRef(false);

  const loadWants = useCallback(async () => {
    if (!(await storedAccessToken())) {
      wantsFresh.current = true;
      memory.wants = null;
      setWants(null);
      return;
    }
    try {
      const me = await getMe();
      wantsFresh.current = true;
      memory.wants = me.wants;
      setWants(me.wants);
      void writeCache("hub", me.player.id, me.wants, "wants");
    } catch {
      // Keep whatever was on screen; the next focus retries.
    }
  }, []);

  /* Last launch's list, painted until the real one lands. */
  useEffect(() => {
    if (memory.wants !== undefined) return;
    let live = true;
    void (async () => {
      if (!(await storedAccessToken())) return;
      const id = await cachedPlayerId();
      if (!id || !live) return;
      const cached = await readCache<Me["wants"]>("hub", id, "wants");
      if (!cached || !live || wantsFresh.current || !Array.isArray(cached)) return;
      setWants(cached);
    })();
    return () => {
      live = false;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadWants();
    }, [loadWants]),
  );

  /*
   * A want edit, then the truth re-read — the room's `act` in miniature.
   * A refused or failed edit is said under the list rather than
   * swallowed: the re-read alone would just look like a tap that did
   * nothing.
   */
  const [wantError, setWantError] = useState<string | null>(null);
  const editWant = async (work: () => Promise<unknown>) => {
    setWantError(null);
    try {
      await work();
    } catch (caught) {
      setWantError(`Could not change that. Try again. (${describeError(caught)})`);
    }
    await loadWants();
  };

  /*
   * Re-tapping the Flare tab while already ON it means "different card":
   * the search clears for a fresh hunt. The focus check is the whole
   * point — someone who looked up a card, wandered to another tab, and
   * came back has NOT asked to start over, so arriving from elsewhere
   * never touches their search. (tabPress is a tab-navigator event this
   * screen actually receives, but the hook's typing follows the stack
   * param list — hence the cast.)
   */
  const [resetSignal, setResetSignal] = useState(0);
  useEffect(() => {
    const nav = navigation as unknown as {
      addListener: (event: string, callback: () => void) => () => void;
      isFocused: () => boolean;
    };
    return nav.addListener("tabPress", () => {
      if (nav.isFocused()) setResetSignal((n) => n + 1);
    });
  }, [navigation]);

  /*
   * The real decision, every focus, behind whatever is painted. Kept
   * as a promise so posting can wait for it: the paint decides what is
   * drawn, never where a Flare goes (src/cache.ts, rule 3).
   */
  const decision = useRef<Promise<HubTarget> | null>(null);

  useFocusEffect(
    useCallback(() => {
      let stale = false;

      const decide = async (): Promise<HubTarget> => {
        const code = await lastRoom();
        const signedIn = Boolean(await storedAccessToken());
        let next: HubTarget = signedIn ? { kind: "list" } : "scan";

        if (code) {
          try {
            const state = await getRoom(code);
            const live =
              state.state === "room" &&
              Boolean(state.joined) &&
              (state.room?.status === "open" || state.room?.early);

            if (live) next = { kind: "room", code };
          } catch {
            // Unreachable room counts as "not live"; fall through.
          }
        }

        memory.target = next;
        /* Swap only if it moved, so a right paint never re-renders. */
        if (!stale)
          setTarget((current) => (sameTarget(current, next) ? current : next));
        if (next !== "scan") {
          const id = await cachedPlayerId();
          if (id) void writeCache("hub", id, next);
        }
        return next;
      };

      decision.current = decide();
      return () => {
        stale = true;
      };
    }, []),
  );

  const resolveTarget = useCallback(async () => {
    const settled = await (decision.current ?? Promise.resolve(memory.target));
    return settled === null || settled === "scan" ? null : settled;
  }, []);


  /*
   * The list is no longer drawn here: the founder (2026-11-25), "i dont
   * think a flare history is necessary on this screen". Open Flares live
   * on the Profile's Flares, with History at its foot. What this screen
   * reads still feeds the "already flared" markers (my-flares.ts).
   */
  useEffect(() => {
    if (wants !== null) setMyFlares(wants);
  }, [wants]);

  /* Only the first decision ever: every later one has a paint. */
  if (target === null) {
    return <Loading />;
  }

  if (target === "scan") {
    return (
      <View style={{ paddingHorizontal: gutter, paddingVertical: spacing(4) }}>
        <Card>
          <Title>Post a Flare</Title>
          <Body>
            A Flare says what card you are looking for, and the people who can help see
            it: the room at a store event and everyone who follows you.
          </Body>
          {/* The account first: it is what a Flare needs to reach anyone.
              The room door stays for the guest already standing at a
              counter, the same two buttons the website's guest card has. */}
          <Button
            label="Create account"
            onPress={() => navigation.navigate("CreateAccount")}
          />
          <Button
            label="Scan a code"
            variant="secondary"
            onPress={() => navigation.navigate("Scan")}
          />
        </Card>
      </View>
    );
  }

  // No redirect after posting: the screen confirms in place and offers
  // the Feed. The composer is the one composer; the Flares
  // under it are what is published, so a draft and a post never look
  // like the same thing.
  return (
    <FlareComposer
      target={target}
      resolveTarget={resolveTarget}
      initialHuntId={openInto?.id}
      huntSignal={openInto?.n}
      initialCard={openWith}
      resetSignal={resetSignal}
      onPosted={(rows, _complete, summary) => {
        /* On the list at once; the re-read confirms it a moment later. */
        setWants((current) => [...rows, ...(current ?? [])]);
        void loadWants();
        /*
         * Straight to the Feed, every time: the founder, "there is ZERO
         * reason to have a 'see it in the feed' button, truly, or anything
         * after the flare gets posted. should go straight to the feed."
         * Everything opened over the tabs closes (the composer, a card
         * sheet under it), and the Feed says it is posting, then that it
         * is up. A post that only partly went up says so there, in the
         * same line ("1 was already up"), not in a panel left behind.
         * BACK to the one tab bar (to-tab.ts): a plain navigate pushed a
         * second Feed, "the feed is not a slide up menu".
         */
        if ((navigationRef.getRootState()?.index ?? 0) > 0) {
          navigationRef.dispatch(StackActions.popToTop());
        }
        toTab(navigationRef, "Feed", { posted: Date.now(), postedNote: summary ?? undefined });
        return true;
      }}
    />
  );
}
