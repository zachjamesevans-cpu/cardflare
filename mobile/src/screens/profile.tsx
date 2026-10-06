import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { StackParams } from "../../App";
import { cachedPlayerId, readCache, writeCache } from "../cache";
import { handleSeedFrom } from "../handle";
import {
  addToShowcase,
  type CardHit,
  chooseUsername,
  type CosmeticItem,
  dressAllShowcase,
  dressShowcase,
  type FollowedPlayer,
  friendlyError,
  getFollowers,
  getFollowing,
  getGames,
  getProfile,
  getTradeHistory,
  lastSearchGame,
  type Profile,
  rememberSearchGame,
  removeFromShowcase,
  searchCards,
  setShowcaseNote,
  SHOWCASE_NOTE_MAX,
  type ShowcaseCard,
  signOut,
  storedAccessToken,
  type TradeHistory,
  type Wardrobe,
} from "../api";
import { BinderHighlights } from "../binder-highlights";
import { BinderList } from "../binder-list";
import { CosmeticCard } from "../cosmetic-card";
import { WornBackground, WornScene } from "../cosmetic-paint";
import { CreateBinderSheet } from "../create-binder-sheet";
import { DressingPicker, type DressingOption } from "../dressing-picker";
import { PlayerAvatar } from "../player-avatar";
import { PeopleSheet } from "../people-sheet";
import { ProfileFlares } from "../profile-flares";
import { HeaderButton } from "../header";
import { ProfileActionButton, ProfileHeader, ShareProfileIcon } from "../profile-header";
import { HuntsPanel } from "../hunts-panel";
import {
  OWN_TABS,
  PROFILE_INSET,
  ProfileTabs,
  type ProfilePane,
  type ProfileTab,
} from "../profile-tabs";
import { CoverBanner } from "../showcase-zoom";
import {
  LockedRows,
  TradeHistoryRow,
  TradeHistoryTotalsRow,
  TradeHistoryWall,
} from "../trade-history";
import {
  AsyncButton,
  Body,
  Button,
  Card,
  Input,
  Loading,
  Muted,
  Tap,
  Title,
} from "../ui";
import { useTabBarInset } from "../glass";
import { colors, gutter, radius, spacing } from "../theme";
import { GameSearchField } from "../game-chips";
import { ALL_GAMES, resolveGameScope, searchPlaceholder } from "../game-scope";
import type { GameSlug } from "../games";

/** How far the cover reaches: past the name and the Embers badge. */
const COVER_HEIGHT = 144;
/** How far the header sits down the card, so the picture straddles the cover's edge. */
const HEADER_TOP = 60;
/** The showcase rail's tile, the trade-room carousel's width. */
const SHELF_TILE = 56;

/**
 * The Profile tab, which used to be Account.
 *
 * The founder's call, and it holds up: an account page is housekeeping,
 * and housekeeping is not somewhere anybody visits twice. This is who
 * you are as a trader, and what you are showing off.
 *
 * The profile IA round took the dashboard out of it. The founder: it
 * "feels cluttered and more like a management dashboard than a social
 * profile"; the fix is "a more Instagram-like information architecture
 * where important features are represented as clear destinations/icons
 * and users only see deeper information after tapping into them."
 *
 * The tabs round made those destinations slide in place. The founder,
 * with a recording of Instagram's profile: "The goal is to just have a
 * sliding animation between them that's click and doesn't go into a
 * full screen animation / loading screen so you can still access these
 * buttons." So under the header and the binders as a row of circles
 * sits a strip of six icon tabs, Flares, Hunts, Binders, Showcase,
 * Trades, Embers, and the section under the strip is a pane that
 * slides sideways when a tab is tapped or the pane is swiped. Nothing
 * navigates and nothing reloads; the strip stays on screen. Settings
 * is a screen rather than a section, so the cog is back top right
 * beside Share and the wand. Nothing below the panes. The website's
 * /profile is laid out the same, top to bottom.
 *
 * The balance is not in the header any more: the store, behind the
 * Embers pane's door, is where spending happens and where the number
 * lives. Lifetime earned stays on the badge, which is public.
 *
 * Guests see the honest pitch rather than a wall: the whole room loop
 * works without any of this, and always will.
 */
/**
 * What a profile looks like on disk between visits.
 *
 * The three pieces the screen paints with, and deliberately not
 * `following` — a follow list is small, fast, and the one thing on this
 * screen somebody might change from another device. It loads normally.
 */
interface CachedProfile {
  profile: Profile;
  wardrobe: Wardrobe | null;
  needsSetup: boolean;
}

export function ProfileScreen() {
  const tabInset = useTabBarInset();
  /* The scroll offset, which stretches the cover on a pull past the top. */
  const pull = useRef(new Animated.Value(0)).current;
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();

  const [profile, setProfile] = useState<Profile | null>(null);
  /* Read inside `load`, which is a stable useCallback — its closure
     would otherwise hold whatever `profile` was at mount. */
  const profileRef = useRef<Profile | null>(null);
  const [wardrobe, setWardrobe] = useState<Wardrobe | null>(null);
  const [checked, setChecked] = useState(false);
  /* A fresh account finishes choosing a name before anything else -
     the website's /welcome, in place. */
  const [needsSetup, setNeedsSetup] = useState(false);
  /* A token exists but the profile fetch failed: say so WITH the error's
     name, never pretend the player is signed out. The generic version of
     this screen cost days of blind debugging; the named version makes a
     screenshot of the failure the diagnosis. Null = no failure. */
  const [loadFailed, setLoadFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  /* The card whose dressing room is open, or null. */
  const [dressing, setDressing] = useState<ShowcaseCard | null>(null);

  /* Who you follow and who follows you - fetched with the profile,
     shown as People. */
  const [following, setFollowing] = useState<FollowedPlayer[]>([]);
  const [followers, setFollowers] = useState<FollowedPlayer[]>([]);

  /* The list open over the page: the followers or following number. */
  const [people, setPeople] = useState<"followers" | "following" | null>(null);

  /* The showcase explainer, folded behind its "?". */
  const [showcaseHelp, setShowcaseHelp] = useState(false);
  /* Remove hides behind Edit: a shelf is for looking at, and a word
     under every card read as a list of things to get rid of. */
  const [editingShowcase, setEditingShowcase] = useState(false);
  /* The add-a-card form, folded behind the "+" tile at the rail's end. */
  const [addingShowcase, setAddingShowcase] = useState(false);
  /* The new-binder sheet, behind the "+" at the highlights row's end. */
  const [creatingBinder, setCreatingBinder] = useState(false);

  /* The trade history's counts and, for Pro, its three newest rows.
     Fetched the first time the Trades tab comes to the front, not
     with the profile: most visits never turn to it. Null until then;
     `failed` is the one honest line when the fetch did not land. */
  const [history, setHistory] = useState<TradeHistory | null>(null);
  const [historyFailed, setHistoryFailed] = useState(false);
  const historyAsked = useRef(false);
  const loadHistory = useCallback(async () => {
    try {
      const result = await getTradeHistory();
      setHistory(result.history);
      setHistoryFailed(false);
    } catch {
      setHistoryFailed(true);
    }
  }, []);
  const onTab = useCallback(
    (tab: ProfileTab) => {
      if (tab !== "trades" || historyAsked.current) return;
      historyAsked.current = true;
      void loadHistory();
    },
    [loadHistory],
  );

  /* The showcase panel's inside, measured, for the worn background. */
  const [panel, setPanel] = useState({ w: 0, h: 0 });
  /* The profile block's inside, measured, for the worn scene. */
  const [blockBox, setBlockBox] = useState({ w: 0, h: 0 });

  const load = useCallback(async () => {
    const token = await storedAccessToken();
    if (!token) {
      setProfile(null);
      setChecked(true);
      return;
    }
    try {
      const result = await getProfile();
      setProfile(result.profile);
      setWardrobe(result.wardrobe);
      setNeedsSetup(result.needsSetup);
      setLoadFailed(null);

      /* Remembered for the next open. Written only after a load that
         worked, so the cache can only ever hold a profile that was
         real. See cache.ts. */
      void writeCache("profile", result.profile.playerId, {
        profile: result.profile,
        wardrobe: result.wardrobe,
        needsSetup: result.needsSetup,
      } satisfies CachedProfile);

      getFollowing()
        .then((people) => setFollowing(people.following))
        .catch(() => {});
      getFollowers()
        .then((people) => setFollowers(people.followers))
        .catch(() => {});
      /* Only once the Trades tab has asked for it; a profile re-read
         after a write keeps the rows honest without a fetch nobody
         is looking at. */
      if (historyAsked.current) void loadHistory();
    } catch (caught) {
      /*
       * A failed load no longer empties a screen that already has
       * something on it. Blanking a profile somebody can see because
       * the network blinked takes content away rather than adding it
       * late, which is the complaint in its worst form.
       */
      if (!profileRef.current) {
        setProfile(null);
        setLoadFailed(friendlyError(caught));
      }
    } finally {
      setChecked(true);
    }
  }, [loadHistory]);

  /*
   * Last visit's profile, painted before this one has loaded.
   *
   * The founder: "it takes a full 7 seconds to load the full profile,
   * such as card frames, effects, etc." The wardrobe is the heavy part
   * and it is also the part that almost never changes between two
   * visits, so it is exactly what a cache is for.
   *
   * Once, on first mount, and only if it wins the race with the
   * network — painting over something fresher would be worse than not
   * painting at all.
   */
  useEffect(() => {
    let live = true;

    void (async () => {
      if (!(await storedAccessToken())) return;

      const id = await cachedPlayerId();
      if (!id || !live) return;

      const cached = await readCache<CachedProfile>("profile", id);
      if (!cached || !live || profileRef.current) return;

      setProfile(cached.profile);
      setWardrobe(cached.wardrobe);
      setNeedsSetup(cached.needsSetup);
      setChecked(true);
    })();

    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void (async () => {
        await load();
        if (!live) return;
      })();
      return () => {
        live = false;
      };
    }, [load]),
  );

  /* Picture, cover, name, handle, pronouns and bio are all edited on
     the Edit profile screen now (src/screens/edit-profile.tsx), the
     website's /profile/edit. The tab re-reads on focus, so whatever
     changed there is on screen by the time Back lands here. */

  const act = async (
    key: string,
    run: () => Promise<unknown>,
    said: string,
  ): Promise<boolean> => {
    setBusy(key);
    setMessage(null);
    try {
      await run();
      await load();
      setMessage(said);
      return true;
    } catch (caught) {
      setMessage(
        `That did not go through. ${friendlyError(caught)}`,
      );
      return false;
    } finally {
      setBusy(null);
    }
  };

  if (!checked) {
    return <Loading />;
  }

  if (!profile && loadFailed) {
    return (
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: gutter,
          paddingVertical: spacing(4),
          gap: spacing(4),
          /* Clear of the floating tab bar. */
          paddingBottom: spacing(4) + tabInset,
        }}
      >
        <Card>
          <Title>Signed in, but your profile could not load</Title>
          <Body>
            The connection to cardflare.gg did not go through. Check your signal and try
            again.
          </Body>
          <Muted>{loadFailed}</Muted>
          <AsyncButton
            label="Try again"
            pendingLabel="Retrying…"
            onPress={() => load()}
          />
          {/* The way out has to be reachable from the failed state too,
              or a dead session is a screen nobody can leave. */}
          <AsyncButton
            label="Sign out"
            pendingLabel="Signing out…"
            variant="secondary"
            onPress={() =>
              signOut().then(() => {
                setProfile(null);
                setWardrobe(null);
              })
            }
          />
        </Card>
      </ScrollView>
    );
  }

  if (profile && needsSetup) {
    return (
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: gutter,
          paddingVertical: spacing(4),
          gap: spacing(4),
          /* Clear of the floating tab bar. */
          paddingBottom: spacing(4) + tabInset,
        }}
      >
        <Card>
          <Title>Pick your name</Title>
          <Body>
            This is the name people see next to everything you post. Spaces and capitals
            are fine, and it does not have to be unique.
          </Body>
          <NameField
            current={profile.displayName}
            busy={busy === "setup"}
            onSave={(name) =>
              act(
                "setup",
                /* The handle is derived here rather than asked for
                   twice: this screen is the fallback path for somebody
                   who reached the profile tab before finishing setup,
                   and the welcome flow is where both are chosen. It can
                   be changed in Settings straight after. */
                () => chooseUsername(name, handleSeedFrom(name)),
                "Welcome to cardflare.",
              )
            }
          />
          {message && <Muted>{message}</Muted>}
        </Card>
      </ScrollView>
    );
  }

  if (!profile) {
    return (
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: gutter,
          paddingVertical: spacing(4),
          gap: spacing(4),
          /* Clear of the floating tab bar. */
          paddingBottom: spacing(4) + tabInset,
        }}
      >
        <Card>
          <Title>Have an account?</Title>
          <Body>
            Sign in and your profile follows you between stores: your picture, your
            Embers, and the cards you are showing off.
          </Body>
          <Button label="Sign in" onPress={() => navigation.navigate("SignIn")} />
        </Card>
        <Card>
          <Body>
            No account? Nothing changes. Scan any counter code and trade as a guest,
            same as always.
          </Body>
        </Card>
      </ScrollView>
    );
  }

  /* What the dressing rooms may offer: owned only, free items included. */
  const ownedFrames: DressingOption[] = (wardrobe?.cardFrames ?? [])
    .filter((item) => item.owned)
    .map(({ slug, name }) => ({ slug, name }));
  const ownedHolos: DressingOption[] = (wardrobe?.holos ?? [])
    .filter((item) => item.owned)
    .map(({ slug, name }) => ({ slug, name }));

  /* The one showcase, editable in place: tap a card to dress it,
     remove below it, add from the "+" tile at the rail's end. The
     header's wand is the one wand; Customize switches between its
     two menus. No box and no heading: the "?" help, the rail, and
     the worn background painted behind them edge to edge, measured
     off this view. */
  const showcasePane = (
    <View
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setPanel({ w: width, h: height });
      }}
      style={{
        gap: spacing(2),
        borderRadius: radius.control,
        padding: spacing(2),
        overflow: "hidden",
      }}
    >
      <WornBackground
        background={profile.equips?.background ?? null}
        width={panel.w}
        height={panel.h}
        radius={radius.control}
      />
      {/* No "Showcase" heading: the tab above is the heading. The
          "?" stays, on the owner's profile only. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(1.5) }}>
          <Tap
            onPress={() => setShowcaseHelp((open) => !open)}
            accessibilityLabel="What is a showcase?"
            hitSlop={11}
            style={{
              width: 22,
              height: 22,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: showcaseHelp ? colors.accent : colors.border,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                color: showcaseHelp ? colors.accent : colors.textMuted,
                fontSize: 12,
                fontWeight: "700",
              }}
            >
              ?
            </Text>
          </Tap>
        </View>
        {profile.showcase.length > 0 ? (
          <Tap
            onPress={() => setEditingShowcase((on) => !on)}
            accessibilityLabel={editingShowcase ? "Done editing the showcase" : "Edit the showcase"}
            style={{
              marginLeft: "auto",
              minHeight: 44,
              minWidth: 44,
              alignItems: "flex-end",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: colors.accent, fontSize: 14, fontWeight: "600" }}>
              {editingShowcase ? "Done" : "Edit"}
            </Text>
          </Tap>
        ) : null}
      </View>
      {/* The explanation read as clutter once you knew it - the
          founder's call. It folds behind the "?" now: there for the
          first visit, gone for every visit after. Same fold as the
          website's. */}
      {showcaseHelp && (
        <Muted>
          Up to nine cards you are proud of. Tap a card to dress it. Not a trade list,
          so nobody can offer on it.
        </Muted>
      )}

      {profile.showcase.length === 0 ? <Muted>Nothing on the shelf yet.</Muted> : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing(2), paddingVertical: spacing(1) }}
      >
        {profile.showcase.map((entry) => (
          <View key={entry.id} style={{ gap: spacing(1), width: SHELF_TILE }}>
            <Tap
              onPress={() => setDressing(entry)}
              accessibilityLabel={`Dress ${entry.name}`}
            >
              <CosmeticCard
                imageUrl={entry.imageUrl}
                width={SHELF_TILE}
                frame={entry.frame ?? profile.equipped.frame}
                holo={entry.holo ?? profile.equipped.holo}
                effect={profile.equipped.effect}
                border={profile.equips?.border ?? null}
                pattern={profile.equips?.pattern ?? null}
                animation={profile.equips?.animation ?? null}
              />
            </Tap>
            <Text
              numberOfLines={1}
              style={{ color: colors.textSecondary, fontSize: 11 }}
            >
              {entry.name}
            </Text>
            {editingShowcase ? (
              <Tap
                disabled={busy === entry.id}
                hitSlop={12}
                accessibilityLabel={`Remove ${entry.name}`}
                onPress={() =>
                  void act(
                    entry.id,
                    () => removeFromShowcase(entry.id),
                    "Taken off the shelf.",
                  )
                }
                style={{ flexDirection: "row", alignItems: "center", gap: spacing(1) }}
              >
                <Ionicons name="remove-circle" size={16} color={colors.danger} />
                <Text style={{ color: colors.danger, fontSize: 12, fontWeight: "600" }}>
                  Remove
                </Text>
              </Tap>
            ) : null}
          </View>
        ))}
        {/* The way in, at the end of the rail: a "+" tile the size
            of a card. The form it opens sits under the rail. Gone
            when the shelf is full; the website folds the same. */}
        {profile.showcase.length < profile.showcaseLimit ? (
          <Tap
            onPress={() => setAddingShowcase(true)}
            accessibilityLabel="Add a card"
            style={{
              width: SHELF_TILE,
              height: Math.round((SHELF_TILE * 88) / 63),
              borderRadius: 6,
              borderWidth: 1,
              borderStyle: "dashed",
              borderColor: colors.borderStrong,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="add" size={22} color={colors.textSecondary} />
          </Tap>
        ) : null}
      </ScrollView>

      {addingShowcase && profile.showcase.length < profile.showcaseLimit ? (
        <AddToShowcase
          busy={busy === "showcase-add"}
          frames={ownedFrames}
          holos={ownedHolos}
          defaultFrame={profile.equipped.frame}
          defaultHolo={profile.equipped.holo}
          effect={profile.equipped.effect}
          border={profile.equips?.border ?? null}
          pattern={profile.equips?.pattern ?? null}
          animation={profile.equips?.animation ?? null}
          onClose={() => setAddingShowcase(false)}
          onPick={(cardId, printingId, picks) => {
            setAddingShowcase(false);
            void act(
              "showcase-add",
              () => addToShowcase(cardId, printingId, picks),
              "On the shelf.",
            );
          }}
        />
      ) : null}
    </View>
  );

  /* The trade history card's inside, as the website's card draws it:
     the three numbers, three recent rows and the door to the rest;
     locked, the faded rows and the Pro pitch. */
  const tradesPane = (
    <View style={{ gap: spacing(3) }}>
      {historyFailed && !history ? (
        <Muted>Your trade history could not be loaded. Try again in a moment.</Muted>
      ) : !history ? (
        /* Inline, not the full-screen spinner: the pane is as tall as
           its content, and a spinner built to fill a screen has none. */
        <View style={{ alignItems: "center", paddingVertical: spacing(4) }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : history.locked ? (
        <View style={{ gap: spacing(3) }}>
          <TradeHistoryTotalsRow totals={history.totals} />
          <View>
            <LockedRows count={3} />
            <TradeHistoryWall
              count={history.totals.trades}
              onGetPro={() => navigation.navigate("Pro")}
            />
          </View>
        </View>
      ) : history.trades.length === 0 ? (
        <Muted>Nothing traded yet. Confirm a trade in a room and it lands here.</Muted>
      ) : (
        <>
          <TradeHistoryTotalsRow totals={history.totals} />
          <View>
            {history.trades.slice(0, 3).map((trade, index, all) => (
              <TradeHistoryRow
                key={trade.id}
                trade={trade}
                compact
                last={index === all.length - 1}
                onOpenPartner={
                  trade.partnerPlayerId
                    ? () =>
                        navigation.navigate("PlayerProfile", {
                          playerId: trade.partnerPlayerId ?? "",
                        })
                    : undefined
                }
              />
            ))}
          </View>
          <Button
            label="See all"
            variant="secondary"
            onPress={() => navigation.navigate("TradeHistory")}
          />
        </>
      )}
    </View>
  );

  /* The Embers tile and the store's door, as they were on the old
     profile. One tile, the public number: lifetime earned, which only
     trades raise. What is left to spend is on the door, where
     spending happens. */
  const embersPane = (
    <View style={{ gap: spacing(3) }}>
      <View style={{ flexDirection: "row", gap: spacing(3) }}>
        <Stat
          label="Earned, all time"
          value={profile.embersEarned}
          note="Public. The number on your badge. Trades, turning up at your stores and grants raise it, and it never goes down."
        />
      </View>

      {/* The store lives on its own screen, same as the website: this
          is the door, wearing the one number a shopper decides with. */}
      <Tap
        onPress={() => navigation.navigate("Store")}
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: radius.card,
          padding: spacing(4),
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: spacing(2),
        }}
      >
        <View style={{ flex: 1, gap: spacing(1) }}>
          <Text style={{ color: colors.textPrimary, fontWeight: "600", fontSize: 15 }}>
            Embers shop
          </Text>
          <Muted>Frames, holo patterns and effects. Spend what you have earned.</Muted>
          {/* The second line answers the number beside it: where Embers
              to spend come from. The ledger's sources, every one of
              them (src/lib/players/ember-rules.ts, packs/repository.ts). */}
          <Muted>
            Embers to spend come from trades, turning up at your stores, duplicate
            pack pulls and gifts.
          </Muted>
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing(1.5),
            borderRadius: 999,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.elevated,
            paddingHorizontal: spacing(3),
            paddingVertical: spacing(1),
          }}
        >
          <Ionicons name="flame" size={13} color={colors.accent} />
          <Text style={{ color: colors.accent, fontWeight: "700", fontSize: 13 }}>
            {profile.embersBalance.toLocaleString()}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>to spend</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </Tap>
    </View>
  );

  /* The six panes, in the strip's order. Every one draws from the
     profile already on screen; only Trades fetches, once, when it is
     first turned to. */
  const panes: ProfilePane[] = OWN_TABS.map((tab) => ({
    key: tab,
    content: (() => {
      switch (tab) {
        case "flares":
          /* Every Flare up right now, newest first, three across: the
             same list the Flares number counts. */
          return (
            <ProfileFlares
              flares={profile.flares ?? []}
              yours
              onPost={() => navigation.navigate("Tabs", { screen: "Flare" })}
            />
          );
        case "hunts":
          /* The panel the Hunts screen draws, with exactly its wiring:
             a row opens the hunt's own screen, "Add cards" lands in the
             composer with the hunt chosen by id, and every write inside
             asks for the truth again. */
          return (
            <HuntsPanel
              hunts={profile.hunts ?? []}
              limit={profile.huntLimit}
              yours
              bare
              onAdd={(huntId) =>
                navigation.navigate("Tabs", {
                  screen: "Flare",
                  params: { hunt: huntId },
                })
              }
              onOpen={(id) => navigation.navigate("Hunt", { huntId: id })}
              onChanged={() => void load()}
            />
          );
        case "binders":
          /* The Binders screen's rows, with its button above them. */
          return (
            <View style={{ gap: spacing(3) }}>
              <Button label="New binder" onPress={() => setCreatingBinder(true)} />
              {(profile.binders ?? []).length === 0 ? (
                <Muted>No binders yet.</Muted>
              ) : (
                <BinderList
                  binders={profile.binders ?? []}
                  yours
                  onOpen={(binderId) => navigation.navigate("Binder", { binderId })}
                />
              )}
            </View>
          );
        case "showcase":
          return showcasePane;
        case "trades":
          return tradesPane;
        case "embers":
          return embersPane;
      }
    })(),
  }));

  return (
    <Animated.ScrollView
      onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: pull } } }], {
        useNativeDriver: true,
      })}
      scrollEventThrottle={16}
      /* One colour from the header to the dock. The page used to be
         canvas black with the surface-coloured block floating in it,
         so a black band showed above the cover and another under the
         last row, behind the dock - the founder: "it doesn't feel
         native, there's a color gap at top and bottom". The scroll
         view is the block's colour now, overscroll included. */
      style={{ backgroundColor: colors.surface }}
      contentContainerStyle={{
        /* No gutter: the block runs to the screen's edges, the
           founder's "extend all the way over to the edges of the
           screen". Its rows keep their own inset. No top padding:
           the cover starts right under the header. */
        gap: spacing(4),
        /* Clear of the floating tab bar. */
        paddingBottom: spacing(4) + tabInset,
      }}
    >
      {/* Your own profile block, laid out exactly as View full profile
          shows anyone else - same cover, same picture, same numbers,
          same name and handle, same stops, same shelf, with Edit
          profile where they see Follow. The founder's rule: what you
          see is what they see. One block, no panels inside it: the
          founder, "fewer giant bordered boxes". */}
      <View
        style={{
          paddingTop: spacing(6),
          paddingBottom: spacing(4),
          gap: spacing(4),
          /* No overflow clip: the cover stretches up out of the block
             on a pull past the top. */
          backgroundColor: colors.surface,
        }}
        onLayout={(event) => {
          /* No border to step inside of: the block is the scene's box. */
          const { width, height } = event.nativeEvent.layout;
          setBlockBox({ w: width, h: height });
        }}
      >
        {/* The cover carries down behind the picture, the name and the
            badge, then fades into the block. No seam: the founder's
            mockup, and the same shape the website draws. */}
        <CoverBanner
          coverUrl={profile.coverUrl}
          height={COVER_HEIGHT}
          fade
          corner={0}
          pull={pull}
        />

        {/* The worn profile effect, over the whole block: above the
            cover, below everything that can be tapped, exactly where
            the website's WornSceneLayer sits. Measured off the block;
            takes no touch. */}
        <WornScene
          scene={profile.equips?.scene ?? null}
          width={blockBox.w}
          height={blockBox.h}
          radius={0}
        />

        {/*
         * The block's three controls, riding its corner: Share, the
         * wand that dresses the profile, and the cog that opens
         * Settings. Same spots as the website. Settings is a screen,
         * not a section of the profile, so it lives up here and not in
         * the strip below.
         */}
        <View
          style={{
            position: "absolute",
            top: spacing(1),
            right: spacing(1),
            flexDirection: "row",
          }}
        >
          <ShareProfileIcon playerId={profile.playerId} name={profile.displayName} />
          <HeaderButton
            icon="color-wand"
            label="Customize your profile"
            onPress={() => navigation.navigate("Customize", { area: "profile" })}
          />
          <HeaderButton
            icon="settings-outline"
            label="Settings"
            onPress={() => navigation.navigate("Settings")}
          />
        </View>

        {/*
         * No negative margin here, and that IS the fix.
         *
         * This carried `marginTop: 96 - 48 - (110 + spacing(2))` — minus
         * seventy pixels — left over from a layout where something 110
         * tall sat above it. The cover is `position: absolute` now, so
         * this column is the card's FIRST in-flow child: seventy pixels
         * up from a twenty-four pixel padding put the picture's top edge
         * forty-six pixels above the card, and the card clips its
         * overflow. Half of everybody's face was cut off.
         *
         * The block a player sees of somebody else never had the margin,
         * which is how the two drifted apart. They match again now,
         * which is the founder's own rule for this screen: what you see
         * is what they see.
         */}
        <View style={{ marginTop: HEADER_TOP, paddingHorizontal: PROFILE_INSET }}>
          <ProfileHeader
            avatar={
              <PlayerAvatar
                displayName={profile.displayName}
                seed={profile.playerId}
                avatarUrl={profile.avatarUrl}
                frame={profile.equipped.avatarFrame}
                ring={profile.wear?.ring ?? null}
                aura={profile.wear?.aura ?? null}
                ringArt={profile.wear?.ringArt ?? null}
                auraArt={profile.wear?.auraArt ?? null}
                size={88}
              />
            }
            name={profile.displayName}
            handle={profile.handle}
            pronouns={profile.pronouns ?? null}
            bio={profile.bio ?? null}
            equips={profile.equips ?? {}}
            embersEarned={profile.embersEarned}
            stats={profile.stats}
            organizerAt={profile.organizerAt}
            onFollowers={() => setPeople("followers")}
            onFollowing={() => setPeople("following")}
            actions={
              <>
                {/* Instagram's button, to Instagram's screen: picture,
                    effects, name, username, pronouns and bio, in rows. */}
                <ProfileActionButton
                  label="Edit profile"
                  onPress={() => navigation.navigate("EditProfile")}
                />
              </>
            }
          />
        </View>

        {/* No Pro row here: the website's profile has none. The pitch
            lives in Customize and behind the animated-picture door. */}

        {/* Your binders as a row of circles in your order, the ones up
            for trade with the lime ring, and a dashed "+" at the end
            that starts a new one. Tap one and it opens. */}
        <BinderHighlights
          binders={profile.binders ?? []}
          yours
          onOpen={(binderId) => navigation.navigate("Binder", { binderId })}
          onNew={() => setCreatingBinder(true)}
        />

        {/* The strip and the panes under it: Flares, Hunts, Binders,
            Showcase, Trades, Embers. Everything that used to stack down
            this screen, then sat behind a row of doors, slides in place
            now; the header and the circles above stay put. */}
        <ProfileTabs panes={panes} onChange={onTab} />
      </View>

      {message && (
        <View style={{ paddingHorizontal: PROFILE_INSET }}>
          <Muted>{message}</Muted>
        </View>
      )}

      {/* The list behind a tapped number, over the page - the founder:
          "a separate pop up", not a section at the bottom. */}
      <PeopleSheet
        which={people}
        people={people === "followers" ? followers : following}
        onClose={() => setPeople(null)}
        onOpen={(id) => {
          setPeople(null);
          navigation.navigate("PlayerProfile", { playerId: id });
        }}
      />

      {/* A new binder: name it, pick a cover, and it opens. The row
          re-reads on the way back, so the circle is there by then. */}
      <CreateBinderSheet
        visible={creatingBinder}
        onClose={() => setCreatingBinder(false)}
        onCreated={(binderId) => {
          setCreatingBinder(false);
          void load();
          navigation.navigate("Binder", { binderId });
        }}
      />

      <DressModal
        entry={dressing}
        shelf={profile.showcase}
        onSwitch={setDressing}
        border={profile.equips?.border ?? null}
        pattern={profile.equips?.pattern ?? null}
        animation={profile.equips?.animation ?? null}
        defaults={profile.equipped}
        frames={ownedFrames}
        holos={ownedHolos}
        onClose={() => setDressing(null)}
        onNote={(entryId, note) =>
          act(entryId, () => setShowcaseNote(entryId, note), "Note saved.")
        }
        onDress={(entryId, frame, holo) =>
          void act(entryId, () => dressShowcase(entryId, frame, holo), "Saved.")
        }
        onDressAll={(frame, holo) =>
          act("dress-all", () => dressAllShowcase(frame, holo), "Every card updated.")
        }
        effect={profile.equipped.effect}
      />
    </Animated.ScrollView>
  );
}

/** One number in a tile: the Embers pane's lifetime count. */
function Stat({
  label,
  value,
  note,
  accent = false,
}: {
  label: string;
  value: number;
  note: string;
  accent?: boolean;
}) {
  return (
    <View
      style={{
        flex: 1,
        borderRadius: radius.control,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.elevated,
        padding: spacing(3),
        gap: spacing(1),
      }}
    >
      <Text
        style={{
          color: colors.textMuted,
          fontSize: 11,
          fontWeight: "600",
          letterSpacing: 0.6,
        }}
      >
        {label.toUpperCase()}
      </Text>
      <Text
        style={{
          color: accent ? colors.accent : colors.textPrimary,
          fontSize: 22,
          fontWeight: "700",
        }}
      >
        {value.toLocaleString()}
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: 11 }}>{note}</Text>
    </View>
  );
}

export function NameField({
  current,
  busy,
  onSave,
}: {
  current: string;
  busy: boolean;
  onSave: (name: string) => void;
}) {
  const [value, setValue] = useState(current);

  return (
    <View style={{ gap: spacing(2) }}>
      <Input
        value={value}
        onChangeText={setValue}
        maxLength={40}
        autoCapitalize="words"
        placeholder="What people call you"
      />
      <Button
        label="Save"
        variant="secondary"
        busy={busy}
        disabled={value.trim().length === 0 || value.trim() === current}
        onPress={() => onSave(value.trim())}
      />
    </View>
  );
}

/**
 * Putting a card on the shelf, from the phone.
 *
 * The same debounced search the post-flare screen uses, doing a
 * different job: a showcase is "this is what I am proud of", not "I will
 * let this go". Nothing here creates a Flare and nobody can pledge on
 * the result.
 *
 * Folded behind the "+" tile at the end of the rail. Nine cards fit
 * and most visits change none of them, so a permanently open search
 * would be the loudest thing on a screen that is mostly for looking
 * at. The screen opens this when the tile is tapped and closes it on
 * Cancel or once a card has gone up.
 */
function AddToShowcase({
  busy,
  frames,
  holos,
  defaultFrame,
  defaultHolo,
  effect,
  border,
  pattern,
  animation,
  onPick,
  onClose,
}: {
  busy: boolean;
  frames: DressingOption[];
  holos: DressingOption[];
  defaultFrame: string | null;
  defaultHolo: string | null;
  effect: string | null;
  /** The worn catalogue border, so the preview is the card they get. */
  border: string | null;
  /** The worn catalogue holo pattern, for the same reason. */
  pattern: string | null;
  /** The worn catalogue card animation, for the same reason. */
  animation: string | null;
  onPick: (
    cardId: string,
    printingId: string | null,
    dressing: { frame: string | null; holo: string | null },
  ) => void;
  /** Cancel: fold the form back behind the tile. */
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<CardHit[]>([]);

  /* The card chosen in step one, waiting to be dressed before it goes
     up - the founder's spec, same two steps as the website. */
  const [pending, setPending] = useState<{
    cardId: string;
    printingId: string | null;
    imageUrl: string | null;
  } | null>(null);
  const [picked, setPicked] = useState({ frame: defaultFrame, holo: defaultHolo });

  /* Which game: the chip last tapped on this device, else the first
     game from sign-up - resolved the way the post screen and the
     website resolve it, so one person gets one default everywhere. */
  const [playerGames, setPlayerGames] = useState<string[]>([]);
  const [remembered, setRemembered] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    void lastSearchGame().then((value) => {
      if (current) setRemembered(value);
    });
    void getGames()
      .then((result) => {
        if (current) setPlayerGames(result.mine);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, []);

  const scope = resolveGameScope({ playerGames, remembered });
  const scopedGame = scope.selected;
  const pickGame = (game: GameSlug | null) => {
    if (game === scopedGame) return;
    const value = game ?? ALL_GAMES;
    setRemembered(value);
    void rememberSearchGame(value);
    /* A new game, a clean field: card names do not carry across games. */
    setQuery("");
    setHits([]);
  };

  useEffect(() => {
    if (query.trim().length < 2) {
      setHits([]);
      return;
    }

    /* The same 300ms the post screen uses: long enough that a phone
       keyboard does not fire a query per character. */
    const timer = setTimeout(() => {
      if (scopedGame && !scope.locked && remembered !== scopedGame) {
        setRemembered(scopedGame);
        void rememberSearchGame(scopedGame);
      }
      void searchCards(query.trim(), scopedGame)
        .then((result) => setHits(result.cards))
        .catch(() => setHits([]));
    }, 300);

    return () => clearTimeout(timer);
  }, [query, scopedGame, scope.locked, remembered]);

  if (pending) {
    return (
      <View style={{ gap: spacing(3) }}>
        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
          Dress it before it goes up
        </Text>

        {/* The card as it will land, wearing the picks live. */}
        <View style={{ alignItems: "center" }}>
          <CosmeticCard
            imageUrl={pending.imageUrl}
            width={160}
            frame={picked.frame}
            holo={picked.holo}
            effect={effect}
            border={border}
            pattern={pattern}
            animation={animation}
          />
        </View>

        <DressingPicker
          imageUrl={pending.imageUrl}
          frames={frames}
          holos={holos}
          frame={picked.frame}
          holo={picked.holo}
          effect={effect}
          onPick={setPicked}
        />

        <Button
          label="Add to showcase"
          busy={busy}
          onPress={() => {
            onPick(pending.cardId, pending.printingId, picked);
            setPending(null);
            setQuery("");
            setHits([]);
          }}
        />
        <Button
          label="Pick a different card"
          variant="secondary"
          onPress={() => setPending(null)}
        />
      </View>
    );
  }

  return (
    <View style={{ gap: spacing(2) }}>
      <GameSearchField
        scope={scope}
        playerGames={playerGames}
        onPick={pickGame}
        value={query}
        onChangeText={setQuery}
        autoFocus
        placeholder={searchPlaceholder(scopedGame)}
      />

      {hits.slice(0, 8).map((hit) => (
        <Tap
          key={hit.id}
          disabled={busy}
          onPress={() => {
            /* The base printing, the website's rule. A card with no
               provider art goes up with no printing at all, which
               renders as the honest empty frame. */
            setPicked({ frame: defaultFrame, holo: defaultHolo });
            setPending({
              cardId: hit.id,
              printingId: hit.basePrintingId,
              imageUrl:
                hit.printings.find((printing) => printing.id === hit.basePrintingId)
                  ?.imageUrl ?? null,
            });
          }}
          style={{
            borderRadius: radius.control,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.elevated,
            padding: spacing(3),
          }}
        >
          <Text style={{ color: colors.textPrimary, fontWeight: "600" }}>
            {hit.name}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            {hit.cardNumber}
          </Text>
        </Tap>
      ))}

      <Button label="Cancel" variant="secondary" onPress={onClose} />
    </View>
  );
}

/**
 * One card's dressing room - the website's editor, in a Modal.
 *
 * Every pick saves immediately, shop-style; Apply to all is the real
 * button, because it changes the rest of the shelf too. The preview
 * updates locally the instant a tile is tapped, and the reload behind
 * the save keeps the shelf underneath honest.
 */
function DressModal({
  entry,
  shelf,
  onSwitch,
  defaults,
  frames,
  holos,
  effect,
  border,
  pattern,
  animation,
  onClose,
  onDress,
  onDressAll,
  onNote,
}: {
  entry: ShowcaseCard | null;
  /** The whole shelf, so the room can step to the next card. */
  shelf: ShowcaseCard[];
  onSwitch: (entry: ShowcaseCard) => void;
  defaults: { frame: string | null; holo: string | null };
  frames: DressingOption[];
  holos: DressingOption[];
  effect: string | null;
  /** The worn catalogue border, so the preview is the card they get. */
  border: string | null;
  /** The worn catalogue holo pattern, for the same reason. */
  pattern: string | null;
  /** The worn catalogue card animation, for the same reason. */
  animation: string | null;
  onClose: () => void;
  onDress: (entryId: string, frame: string | null, holo: string | null) => void;
  /** Resolves true when the write landed, so the button can say so. */
  onDressAll: (frame: string | null, holo: string | null) => Promise<boolean>;
  /** The caption under the card. Resolves true when it saved. */
  onNote: (entryId: string, note: string) => Promise<boolean>;
}) {
  /* The editor is taller than a phone: it scrolls inside the safe
     area rather than running under the status bar. The founder: "in
     the customize showcase screen, it's clipping through header." */
  const insets = useSafeAreaInsets();
  const [picked, setPicked] = useState<{ frame: string | null; holo: string | null }>({
    frame: null,
    holo: null,
  });
  /* The note, as typed. Saved by its own button, not on every key. */
  const [note, setNote] = useState("");
  const [noteState, setNoteState] = useState<"idle" | "busy" | "saved" | "failed">(
    "idle",
  );

  /* Where this card sits on the shelf, for the arrows and the swipe. */
  const index = entry ? shelf.findIndex((card) => card.id === entry.id) : -1;
  const previous = index > 0 ? shelf[index - 1] : null;
  const next = index >= 0 && index < shelf.length - 1 ? shelf[index + 1] : null;
  const touchFrom = useRef<number | null>(null);
  /* The Apply button narrates its own work: busy while saving, Saved!
     after, back to rest when the picks change. The founder's ask. */
  const [applyState, setApplyState] = useState<"idle" | "busy" | "saved" | "failed">(
    "idle",
  );

  /* Reset the picks whenever a different card's room opens. */
  useEffect(() => {
    if (entry) {
      setPicked({
        frame: entry.frame ?? defaults.frame,
        holo: entry.holo ?? defaults.holo,
      });
      setApplyState("idle");
      setNote(entry.note ?? "");
      setNoteState("idle");
    }
  }, [entry, defaults.frame, defaults.holo]);

  if (!entry) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable
          onPress={onClose}
          style={{
            flex: 1,
            backgroundColor: colors.scrim,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: spacing(4),
            paddingTop: insets.top + spacing(2),
            paddingBottom: insets.bottom + spacing(2),
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              alignSelf: "stretch",
              maxHeight: "100%",
              borderRadius: radius.card,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              overflow: "hidden",
            }}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ padding: spacing(4), gap: spacing(3) }}
            >
              <Text
                numberOfLines={1}
                style={{ color: colors.textPrimary, fontWeight: "700", fontSize: 16 }}
              >
                {entry.name}
              </Text>

              {/* The card between its arrows. A swipe across it steps the
              same way the arrows do - the founder's ask, the Feed's
              gesture on the shelf - and the room re-opens on the
              neighbour with its own picks and note. */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                onTouchStart={(event) => {
                  touchFrom.current = event.nativeEvent.pageX;
                }}
                onTouchEnd={(event) => {
                  const from = touchFrom.current;
                  touchFrom.current = null;
                  if (from === null) return;
                  const travelled = event.nativeEvent.pageX - from;
                  if (Math.abs(travelled) < 40) return;
                  const target = travelled < 0 ? next : previous;
                  if (target) onSwitch(target);
                }}
              >
                <Tap
                  disabled={!previous}
                  onPress={() => previous && onSwitch(previous)}
                  accessibilityLabel="Previous card"
                  hitSlop={8}
                  style={{ padding: spacing(2), opacity: previous ? 1 : 0.25 }}
                >
                  <Ionicons
                    name="chevron-back"
                    size={22}
                    color={colors.textSecondary}
                  />
                </Tap>
                <CosmeticCard
                  imageUrl={entry.imageUrl}
                  width={150}
                  frame={picked.frame}
                  holo={picked.holo}
                  effect={effect}
                  border={border}
                  pattern={pattern}
                  animation={animation}
                />
                <Tap
                  disabled={!next}
                  onPress={() => next && onSwitch(next)}
                  accessibilityLabel="Next card"
                  hitSlop={8}
                  style={{ padding: spacing(2), opacity: next ? 1 : 0.25 }}
                >
                  <Ionicons
                    name="chevron-forward"
                    size={22}
                    color={colors.textSecondary}
                  />
                </Tap>
              </View>
              {shelf.length > 1 ? (
                <Text
                  style={{ color: colors.textMuted, fontSize: 12, textAlign: "center" }}
                >
                  {`${index + 1} of ${shelf.length}`}
                </Text>
              ) : null}

              <DressingPicker
                imageUrl={entry.imageUrl}
                frames={frames}
                holos={holos}
                frame={picked.frame}
                holo={picked.holo}
                effect={effect}
                onPick={(next) => {
                  setPicked(next);
                  setApplyState("idle");
                  onDress(entry.id, next.frame, next.holo);
                }}
              />

              <Button
                label={
                  applyState === "busy"
                    ? "Applying…"
                    : applyState === "saved"
                      ? "Saved!"
                      : applyState === "failed"
                        ? "Did not save. Try again."
                        : "Apply to all cards"
                }
                variant="secondary"
                disabled={applyState === "busy"}
                onPress={() => {
                  setApplyState("busy");
                  void onDressAll(picked.frame, picked.holo).then((landed) =>
                    setApplyState(landed ? "saved" : "failed"),
                  );
                }}
              />
              <Muted>
                Every card on your shelf wears this border and holo, and new cards will
                too.
              </Muted>

              {/* The note: how they got it, why it matters. One field, one
              button, and it shows under the card wherever it is opened. */}
              <View
                style={{
                  gap: spacing(2),
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                  paddingTop: spacing(3),
                }}
              >
                <Text
                  style={{ color: colors.textPrimary, fontWeight: "700", fontSize: 14 }}
                >
                  Note
                </Text>
                <Input
                  value={note}
                  onChangeText={(text) => {
                    setNote(text.slice(0, SHOWCASE_NOTE_MAX));
                    setNoteState("idle");
                  }}
                  placeholder="How you got it, or why it matters (optional)"
                  multiline
                  maxLength={SHOWCASE_NOTE_MAX}
                  style={{ minHeight: 64, textAlignVertical: "top" }}
                />
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: spacing(2),
                  }}
                >
                  <Text
                    style={{ color: colors.textMuted, fontSize: 12, flexShrink: 1 }}
                  >
                    Shown under the card when somebody opens it.
                  </Text>
                  <Button
                    label={
                      noteState === "busy"
                        ? "Saving…"
                        : noteState === "saved"
                          ? "Saved!"
                          : noteState === "failed"
                            ? "Did not save"
                            : "Save note"
                    }
                    variant="secondary"
                    disabled={noteState === "busy"}
                    onPress={() => {
                      setNoteState("busy");
                      void onNote(entry.id, note).then((landed) =>
                        setNoteState(landed ? "saved" : "failed"),
                      );
                    }}
                  />
                </View>
              </View>

              <Button label="Done" onPress={onClose} />
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
