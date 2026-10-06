import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import type { StackParams } from "../../App";
import { ActionSheet, DotsButton, SheetBackdrop } from "../action-menu";
import {
  blockPlayer,
  getPlayerPeople,
  openDirectThread,
  peekPlayer,
  serverMessage,
  storedAccessToken,
  unblockPlayer,
  type FollowedPlayer,
  type PeekProfile,
} from "../api";
import { BinderHighlights } from "../binder-highlights";
import { BinderList } from "../binder-list";
import { CosmeticCard } from "../cosmetic-card";
import { WornBackground, WornScene } from "../cosmetic-paint";
import { FollowButton } from "../follow-button";
import { HuntsPanel } from "../hunts-panel";
import { PeopleSheet } from "../people-sheet";
import { PlayerAvatar } from "../player-avatar";
import { ProfileFlares } from "../profile-flares";
import { HeaderButton, ProfileHeader, ShareProfileIcon } from "../profile-header";
import {
  PROFILE_INSET,
  ProfileTabs,
  THEIR_TABS,
  type ProfilePane,
} from "../profile-tabs";
import { ReportSheet, type ReportTarget } from "../report-sheet";
import { CoverBanner, ShowcaseZoom, type ZoomedCard } from "../showcase-zoom";
import { Body, Button, Card, ErrorLine, Loading, Muted, Tap } from "../ui";
import { readCache, writeCache } from "../cache";
import { colors, gutter, radius, spacing } from "../theme";

/** The trade-room carousel's tile width; the profile shelf matches it. */
const SHELF_TILE = 56;
/** The header's banner: a strip the picture overlaps, the website's short cover. */
const COVER_HEIGHT = 144;
/** How far the header sits down the card, so the picture straddles the cover's edge. */
const HEADER_TOP = 60;

/**
 * Somebody else's profile, the full page — where the popup's "View full
 * profile" lands. One block, the layout the website uses and your own
 * profile shares: their cover as a strip with the picture overlapping
 * it, the three numbers beside the picture, the name and handle under,
 * Follow and Message, their binders as a row of circles, then a strip
 * of four icon tabs, Flares, Hunts, Binders, Showcase, with the
 * section under it sliding in place when a tab is tapped or the pane
 * is swiped. Tapping a card opens the standard full view. The server
 * builds this from a type with no balance field, so this screen could
 * not leak one.
 *
 * The profile IA round took the hunts panel and the binder panel off
 * the page; the tabs round brought them back as panes under the strip,
 * the way Instagram's profile keeps its header while the grid slides.
 * Never their trades, their Embers or their settings. What you see of
 * them is what they see of you, minus the controls only an owner gets.
 */
/* How long the shelf waits for its art before showing what it has. */
const WARM_MS = 700;

export function PlayerProfileScreen() {
  const route = useRoute<RouteProp<StackParams, "PlayerProfile">>();
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const { playerId } = route.params;

  const [profile, setProfile] = useState<PeekProfile | null>(null);
  const [failed, setFailed] = useState(false);
  /* A guest sees Follow too; theirs starts sign-up, the website's
     Follow link for a visitor without an account. */
  const [guest, setGuest] = useState(false);
  /* Their lists, fetched the first time a number is tapped. */
  const [people, setPeople] = useState<"followers" | "following" | null>(null);
  const [lists, setLists] = useState<{
    followers: FollowedPlayer[];
    following: FollowedPlayer[];
  } | null>(null);

  const openPeople = (which: "followers" | "following") => {
    setPeople(which);
    if (!lists) {
      getPlayerPeople(playerId)
        .then(setLists)
        .catch(() => setLists({ followers: [], following: [] }));
    }
  };

  useEffect(() => {
    let live = true;
    storedAccessToken()
      .then((token) => {
        if (live) setGuest(!token);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  /*
   * Message, beside Follow. The founder: "I should be able to go on
   * someone's profile and message them directly about anything." The
   * server opens (or finds) the one direct conversation between the
   * two of you and the thread screen is the composer; a refusal comes
   * back in the server's words and sits under the buttons.
   */
  const [messaging, setMessaging] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);
  const message = async () => {
    if (messaging) return;
    setMessaging(true);
    setMessageError(null);
    try {
      const result = await openDirectThread(playerId);
      if (result.ok && result.threadId) {
        navigation.navigate("LocalThread", { threadId: result.threadId });
        return;
      }
      setMessageError(result.message ?? "Could not start the conversation.");
    } catch (caught) {
      setMessageError(serverMessage(caught) ?? "Could not start the conversation.");
    } finally {
      setMessaging(false);
    }
  };

  /*
   * Report and block, behind the three dots beside Share. A block is
   * two steps (the sheet, then the confirm) and quiet: the other
   * person is never told. Once made, Follow and Message give way to a
   * "Blocked" chip and Unblock. When THEY blocked you, the buttons go
   * and nothing says why. The website's profile menu does the same.
   */
  const [menu, setMenu] = useState(false);
  const [report, setReport] = useState<ReportTarget | null>(null);
  const [confirmBlock, setConfirmBlock] = useState(false);
  /* Null until a block or unblock has been made here; the server's
     word from `peekPlayer` stands until then. */
  const [blockedHere, setBlockedHere] = useState<boolean | null>(null);
  const [blockError, setBlockError] = useState<string | null>(null);
  const setBlock = async (next: boolean) => {
    setBlockError(null);
    try {
      await (next ? blockPlayer(playerId) : unblockPlayer(playerId));
      setBlockedHere(next);
    } catch (caught) {
      setBlockError(
        serverMessage(caught) ??
          (next
            ? "Could not block them right now."
            : "Could not unblock them right now."),
      );
    }
  };

  /* Cards render together once their art is warm, not one by one. */
  const [shelfReady, setShelfReady] = useState(false);
  const [zoomed, setZoomed] = useState<ZoomedCard | null>(null);
  /* The showcase panel's inside, measured, for the worn background. */
  const [panel, setPanel] = useState({ w: 0, h: 0 });
  /* The profile block's inside, measured, for the worn scene. */
  const [blockBox, setBlockBox] = useState({ w: 0, h: 0 });

  useEffect(() => {
    let live = true;
    /*
     * THE LAST LOOK, FIRST. A profile seen before is painted from the
     * cache the instant the screen opens, and the fresh one lands over
     * it. The founder: "when clicking a profile... it just feels like it
     * takes a second too long." The second was the network, and a
     * repeat visit no longer waits for it.
     */
    void readCache<PeekProfile>("peek", playerId).then((cached) => {
      if (live && cached) {
        setProfile((current) => current ?? cached);
        setShelfReady(true);
      }
    });
    peekPlayer(playerId)
      .then(async (result) => {
        if (!live) return;
        setProfile(result);
        void writeCache("peek", playerId, result);

        /* Warm the shelf's art so the cards land together, but only
           briefly: cached art is instant, and the rest fades in. */
        const warm = Promise.all(
          result.showcase.map((entry) =>
            entry.imageUrl ? Image.prefetch(entry.imageUrl).catch(() => false) : null,
          ),
        );
        await Promise.race([warm, new Promise((done) => setTimeout(done, WARM_MS))]);
        if (live) setShelfReady(true);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [playerId]);

  if (failed) {
    return (
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: gutter,
          paddingVertical: spacing(4),
        }}
      >
        <Card>
          <Body>Could not load this profile right now. Try again in a moment.</Body>
        </Card>
      </ScrollView>
    );
  }

  if (!profile) {
    return <Loading />;
  }

  /* Somebody else's profile, seen signed in: the only case with a
     relationship to act on. A guest can follow (by signing up) but has
     no account to report or block from, and your own profile has
     nobody to report. An older server sends neither flag. */
  const other = !guest && profile.follow !== null;
  const blocked = blockedHere ?? profile.blocked ?? false;
  const blockedBy = profile.blockedBy ?? false;
  const menuItems = other
    ? [
        {
          key: "report",
          label: "Report",
          icon: "flag-outline" as const,
          onPress: () => setReport({ kind: "player", targetId: profile.playerId }),
        },
        blocked
          ? {
              key: "unblock",
              label: "Unblock",
              icon: "lock-open-outline" as const,
              onPress: () => void setBlock(false),
            }
          : {
              key: "block",
              label: "Block",
              icon: "ban-outline" as const,
              onPress: () => setConfirmBlock(true),
            },
      ]
    : null;

  /* The shelf the zoom pages along, with each card's note riding
     along. Built from the same array the rail draws. */
  const shelf: ZoomedCard[] = profile.showcase.map((entry) => ({
    id: entry.id,
    name: entry.name,
    number: entry.number,
    imageUrl: entry.imageUrl,
    frame: entry.frame,
    holo: entry.holo,
    effect: profile.effect,
    border: profile.equips?.border ?? null,
    pattern: profile.equips?.pattern ?? null,
    animation: profile.equips?.animation ?? null,
    note: entry.note ?? null,
  }));

  /* The showcase, same as the website: the rail with the worn
     background painted behind it edge to edge, measured off this
     view. No box and no heading. */
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
      {/* No "Showcase" heading: the tab above is the heading, and
          the "?" help is the owner's alone. */}
      {profile.showcase.length === 0 ? (
        <Muted>Nothing on the shelf yet.</Muted>
      ) : !shelfReady ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}>
          <ActivityIndicator color={colors.accent} size="small" />
          <Muted>Loading showcase…</Muted>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: "row", gap: spacing(2) }}>
            {profile.showcase.map((entry, index) => (
              <Tap key={entry.id} onPress={() => setZoomed(shelf[index] ?? null)}>
                <CosmeticCard
                  imageUrl={entry.imageUrl}
                  width={SHELF_TILE}
                  frame={entry.frame}
                  holo={entry.holo}
                  effect={profile.effect}
                  border={profile.equips?.border ?? null}
                  pattern={profile.equips?.pattern ?? null}
                  animation={profile.equips?.animation ?? null}
                />
              </Tap>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );

  /* The four panes, in the strip's order, all drawn from the profile
     already on screen. */
  const panes: ProfilePane[] = THEIR_TABS.map((tab) => ({
    key: tab,
    content: (() => {
      switch (tab) {
        case "flares":
          /* Every Flare they have up, newest first, three across. */
          return <ProfileFlares flares={profile.flares ?? []} yours={false} />;
        case "hunts":
          /* The panel the Hunts screen draws for a visitor: a row opens
             the hunt's own screen. */
          return (
            <HuntsPanel
              hunts={profile.hunts ?? []}
              ownerName={profile.displayName}
              onOpen={(id) => navigation.navigate("Hunt", { huntId: id })}
            />
          );
        case "binders":
          /* The Binders screen's rows: only the ones you may open. */
          return (profile.binders ?? []).length === 0 ? (
            <Muted>No binders to open.</Muted>
          ) : (
            <BinderList
              binders={profile.binders ?? []}
              yours={false}
              onOpen={(binderId) =>
                navigation.navigate("Binder", { playerId, binderId })
              }
            />
          );
        default:
          return showcasePane;
      }
    })(),
  }));

  return (
    <ScrollView
      contentContainerStyle={{
        /* No gutter: the block runs to the screen's edges, the
           founder's "extend all the way over to the edges of the
           screen". Its rows keep their own inset. */
        paddingVertical: spacing(4),
        gap: spacing(4),
      }}
    >
      {/* The profile block: cover, picture, name, badge, shelf. */}
      <View
        style={{
          paddingTop: spacing(6),
          paddingBottom: spacing(4),
          gap: spacing(4),
          overflow: "hidden",
          backgroundColor: colors.surface,
        }}
        onLayout={(event) => {
          /* No border to step inside of: the block is the scene's box. */
          const { width, height } = event.nativeEvent.layout;
          setBlockBox({ w: width, h: height });
        }}
      >
        {/* The cover carries down behind the picture, the name and the
            badge, then fades into the block. The same block your own
            profile shows: what you see is what they see. */}
        <CoverBanner
          coverUrl={profile.coverUrl}
          height={COVER_HEIGHT}
          fade
          corner={0}
        />

        {/* Their worn profile effect, over the whole block: above the
            cover, below everything that can be tapped, where the
            website's WornSceneLayer sits. Takes no touch. */}
        <WornScene
          scene={profile.equips?.scene ?? null}
          width={blockBox.w}
          height={blockBox.h}
          radius={0}
        />

        {/* Share, top right over the cover: the same corner your own
            profile keeps its icons in. The three dots sit beside it
            on somebody else's profile, with Report and Block behind. */}
        <View
          style={{
            position: "absolute",
            top: spacing(3),
            right: spacing(3),
            flexDirection: "row",
            alignItems: "center",
            gap: spacing(2),
          }}
        >
          <ShareProfileIcon playerId={profile.playerId} name={profile.displayName} />
          {menuItems ? (
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <DotsButton
                onPress={() => setMenu(true)}
                label="More about this profile"
              />
            </View>
          ) : null}
        </View>
        <ActionSheet items={menu ? menuItems : null} onClose={() => setMenu(false)} />

        {/* The same header the owner sees, with Follow where they have
            Edit profile. Share is a link anybody can open. */}
        <View style={{ marginTop: HEADER_TOP, paddingHorizontal: PROFILE_INSET }}>
          <ProfileHeader
            avatar={
              <PlayerAvatar
                displayName={profile.displayName}
                seed={profile.playerId}
                avatarUrl={profile.avatarUrl}
                frame={profile.frame}
                ring={profile.ring}
                aura={profile.aura}
                ringArt={profile.ringArt}
                auraArt={profile.auraArt}
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
            onFollowers={() => openPeople("followers")}
            onFollowing={() => openPeople("following")}
            actions={
              <>
                {blockedBy ? null : blocked ? (
                  <>
                    {/* The muted chip says what you did; Unblock is the
                        ghost beside it. Nothing to follow or message. */}
                    <View
                      style={{
                        flex: 1,
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: radius.control,
                        borderWidth: 1,
                        borderColor: colors.border,
                        paddingHorizontal: spacing(3),
                        paddingVertical: spacing(2),
                      }}
                    >
                      <Text
                        style={{
                          color: colors.textMuted,
                          fontWeight: "600",
                          fontSize: 13,
                        }}
                      >
                        Blocked
                      </Text>
                    </View>
                    <HeaderButton
                      label="Unblock"
                      onPress={() => void setBlock(false)}
                    />
                  </>
                ) : profile.follow ? (
                  <>
                    <FollowButton
                      playerId={profile.playerId}
                      initial={profile.follow}
                      fill
                    />
                    <HeaderButton
                      label="Message"
                      icon="chatbubble-outline"
                      disabled={messaging}
                      onPress={() => void message()}
                    />
                  </>
                ) : guest ? (
                  <HeaderButton
                    label="Follow"
                    primary
                    onPress={() => navigation.navigate("CreateAccount")}
                  />
                ) : null}
              </>
            }
          />
          <ErrorLine message={messageError} />
          <ErrorLine message={blockError} />
        </View>

        {/* Their binders up for trade, each with the lime ring. None
            up for trade: no row at all. */}
        <BinderHighlights
          binders={profile.binders ?? []}
          yours={false}
          onOpen={(binderId) => navigation.navigate("Binder", { playerId, binderId })}
        />

        {/* The strip and the panes under it: Flares, Hunts, Binders,
            Showcase. The four anybody may see, sliding in place. */}
        <ProfileTabs panes={panes} />
      </View>

      <ShowcaseZoom card={zoomed} cards={shelf} onClose={() => setZoomed(null)} />

      <ReportSheet target={report} onClose={() => setReport(null)} />
      <BlockConfirm
        name={confirmBlock ? profile.displayName : null}
        onKeep={() => setConfirmBlock(false)}
        onBlock={() => {
          setConfirmBlock(false);
          void setBlock(true);
        }}
      />

      <PeopleSheet
        which={people}
        people={
          lists ? (people === "followers" ? lists.followers : lists.following) : null
        }
        onClose={() => setPeople(null)}
        onOpen={(id) => {
          setPeople(null);
          navigation.push("PlayerProfile", { playerId: id });
        }}
      />
    </ScrollView>
  );
}

/**
 * The second step of a block, in the website's words. "Keep" rather
 * than "Cancel", because the question is whether to keep seeing them.
 */
function BlockConfirm({
  name,
  onKeep,
  onBlock,
}: {
  /** Null while closed. */
  name: string | null;
  onKeep: () => void;
  onBlock: () => void;
}) {
  if (name === null) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onKeep}>
      <SheetBackdrop />
      <Pressable
        onPress={onKeep}
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: spacing(4),
        }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            alignSelf: "stretch",
            borderRadius: radius.card,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            padding: spacing(4),
            gap: spacing(3),
          }}
        >
          <Text style={{ color: colors.textPrimary, fontWeight: "700", fontSize: 16 }}>
            {`Block ${name}?`}
          </Text>
          <Body>
            {
              "You will not see their posts, and neither of you can message the other. They are not told."
            }
          </Body>
          <View style={{ flexDirection: "row", gap: spacing(2) }}>
            <View style={{ flex: 1 }}>
              <Button label="Block" onPress={onBlock} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Keep" variant="secondary" onPress={onKeep} />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
