import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CardImageZoom, type ZoomCard } from "@/components/cards/card-image-zoom";
import { BlockControls, BlockProvider } from "@/components/players/block-controls";
import { CosmeticCard } from "@/components/players/cosmetic-card";
import { FollowButton } from "@/components/players/follow-button";
import { MessageButton } from "@/components/players/message-button";
import { PeopleList } from "@/components/players/people-list";
import { HuntsPanel } from "@/components/players/hunts-panel";
import { ProfileHeader } from "@/components/players/profile-header";
import { ProfileFlares } from "@/components/players/profile-flares";
import { ProfileTabs } from "@/components/players/profile-tabs";
import { profileTabFrom } from "@/lib/players/profile-tabs";
import { ProfileMenu } from "@/components/players/profile-menu";
import { ShareProfileButton } from "@/components/players/share-profile-button";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { TabPageShell } from "@/components/players/tab-page-shell";
import { buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Rail } from "@/components/lists/rail";
import { getViewer } from "@/lib/auth/session";
import { cardImagesEnabled } from "@/lib/cards/images";
import { playerForUser } from "@/lib/players/accounts";
import { resolveEquipped } from "@/lib/players/cosmetics";
import { dressedEquipsFor, wornArtFor } from "@/lib/players/equips";
import { followState, listFollowers, listFollowing } from "@/lib/players/follows";
import { huntLimitFor } from "@/lib/players/hunts";
import { publicProfile } from "@/lib/players/profile";
import { blockState } from "@/lib/players/safety";
import { profileStats } from "@/lib/players/stats";
import { siteUrl } from "@/lib/site";
import {
  backgroundClass,
  WornBackdrop,
  WornCardShell,
  WornSceneLayer,
} from "@/components/players/worn";
import { cn } from "@/lib/cn";
import { ProfileCover } from "@/components/players/profile-cover";
import { BinderHighlights } from "@/components/binder/binder-highlights";
import { BinderList } from "@/components/binder/binder-list";
import { CreateBinder } from "@/components/binder/create-binder";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ playerId: string }>;
}): Promise<Metadata> {
  const { playerId } = await params;
  const profile = await publicProfile(playerId);
  const robots = { index: false, follow: false };

  if (!profile) return { title: "Player", robots };

  return {
    title: profile.displayName,
    description: `${profile.displayName} on cardflare`,
    robots,
  };
}

export const dynamic = "force-dynamic";

/**
 * Somebody else's profile: the reason the showcase exists.
 *
 * A shelf nobody can look at is a shelf in a closed room, so a name in a
 * roster links here. What is on show is exactly the founder's public
 * half: the picture, the name, the lifetime Ember badge, the binders
 * they chose to show, and then four tabs that slide in place: the
 * Flares they have up, their hunts, their binders as a list, and the
 * cards they are proud of wearing whatever they unlocked.
 *
 * What is NOT here is the spendable balance, and it is not here
 * structurally rather than by omission: `publicProfile` returns a type
 * with no field to put it in, so this page could not render it if it
 * tried. Nor are their trades, their settings, their collection, or
 * their email: none of that is a fact about a player, it is their
 * account. The strip draws Flares, Hunts, Binders and Showcase for
 * them and never Trades or Embers.
 *
 * Anyone with the link can open it: Share profile hands the address to
 * people who may not have an account yet. A signed-out visitor sees
 * exactly what a room already shows and a Follow button that starts
 * sign-up.
 */
export default async function PublicProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ playerId: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const viewer = await getViewer();
  const [{ playerId }, { tab }] = await Promise.all([params, searchParams]);

  /* Open to anyone with the link: Share profile hands the address to
     people who may not have an account yet, and a 404 at the other end
     would be the wrong first impression. Nothing here is more than a
     room already shows. */
  /* The viewer's side of the follow relationship. Null hides the
     button: operators without a player account, and your own page.
     Read first, because the profile's binders are theirs to see or
     not, and say how many of their cards are on the viewer's hunts. */
  const me =
    viewer.kind === "player"
      ? viewer.playerId
      : viewer.kind === "anonymous"
        ? null
        : ((await playerForUser(viewer.user.id))?.id ?? null);

  const profile = await publicProfile(playerId, me);
  if (!profile) notFound();

  const [worn, dressed] = await Promise.all([
    resolveEquipped(profile.equipped),
    dressedEquipsFor(playerId),
  ]);
  const dressedArt = await wornArtFor(dressed);
  const shelfBg = backgroundClass(dressed);
  const imagesEnabled = cardImagesEnabled();

  /* The shelf the zoom pages along: the founder's ask, "swipe
     horizontally through showcase cards the same way Flare cards can
     be swiped in the main feed". Each tile hands over the whole shelf
     and its own place in it; the note rides with its card. */
  const shelf: ZoomCard[] = profile.showcase.map((entry) => ({
    imageUrl: entry.imageUrl,
    exactName: entry.name,
    cardNumber: entry.number,
    note: entry.note,
    direction: "showcase",
  }));

  /* Somebody else's page, seen by an account: the only case with a
     Follow, a Message, a Report and a Block. */
  const other = Boolean(me && me !== playerId);
  const yours = me === playerId;
  const [follow, stats, followers, following, block] = await Promise.all([
    other ? followState(me as string, playerId) : null,
    profileStats(playerId),
    listFollowers(playerId),
    listFollowing(playerId),
    /* A read in a Server Component, seeding the two islands that show
       it: the menu in the corner and the row under the name. */
    blockState(me, playerId),
  ]);

  /* The Feed's chrome, not the console's: the wordmark with the Feed
     behind it and the tab bar below. The name is drawn once, by
     ProfileHeader, the same block the owner's page draws. */
  return (
    <TabPageShell title={profile.displayName}>
      <BlockProvider initial={block}>
        <Card className="relative flex flex-col gap-5 overflow-hidden">
          <ProfileCover coverUrl={profile.coverUrl} short />
          <WornSceneLayer worn={dressed} rive={dressedArt} />

          {/* Share, top right over the cover: the same corner your own
                profile keeps its icons in. The three dots beside it
                hold Report and Block, for an account on somebody
                else's page. */}
          <div className="absolute top-3 right-3 z-10 flex gap-2">
            <ShareProfileButton
              url={`${siteUrl()}/p/${profile.playerId}`}
              title={`${profile.displayName} on cardflare`}
            />
            {other && <ProfileMenu playerId={playerId} name={profile.displayName} />}
          </div>

          {/* The same header the owner sees, with Follow where they
                have Edit profile. Share is a link anybody can open. */}
          <div className="relative mt-16">
            <ProfileHeader
              avatar={
                <PlayerAvatar
                  displayName={profile.displayName}
                  seed={profile.playerId}
                  avatarUrl={profile.avatarUrl}
                  frame={worn.avatarFrame}
                  ring={dressed.ring}
                  aura={dressed.aura}
                  ringArt={dressedArt.ring}
                  auraArt={dressedArt.aura}
                  className="size-20 text-2xl sm:size-24"
                />
              }
              name={profile.displayName}
              handle={profile.handle}
              worn={dressed}
              embersEarned={profile.embersEarned}
              stats={stats}
              organizerAt={profile.organizerAt}
              pronouns={profile.pronouns}
              bio={profile.bio}
              /* Their lists open too, as Instagram's do. The Trade
                   partners mark is theirs, not the viewer's. */
              people={{
                followers: <PeopleList people={followers} empty="Nobody yet." />,
                following: <PeopleList people={following} empty="Nobody yet." />,
              }}
              actions={
                <>
                  {follow ? (
                    /* Follow and Message, or the Blocked chip in their
                     place, or nothing at all when they blocked you. */
                    <BlockControls playerId={playerId}>
                      <FollowButton
                        playerId={playerId}
                        initial={follow}
                        className="flex-1 justify-center"
                      />
                      {/* Message, under the same condition as Follow: an
                        account looking at somebody else's page. The two
                        share the row. */}
                      <MessageButton playerId={playerId} className="flex-1" />
                    </BlockControls>
                  ) : viewer.kind === "anonymous" ? (
                    <Link
                      href={`/signup?next=${encodeURIComponent(`/p/${playerId}`)}`}
                      className={cn(buttonStyles("primary", "sm"), "flex-1")}
                    >
                      Follow
                    </Link>
                  ) : null}
                </>
              }
            />
          </div>

          {/* Their binders, the ones up for trade, in their order. Null
                when there is nothing to open: then there is no row. */}
          <BinderHighlights
            binders={profile.binders}
            yours={yours}
            base={`/p/${playerId}`}
          />

          {/* The four sections, as tabs that slide in place under the
                strip: Flares, Hunts, Binders, Showcase. Never their
                trades or their Embers. The owner, arriving by their
                own public link, gets their hunt and binder tools. */}
          <ProfileTabs
            yours={false}
            initial={profileTabFrom(tab, false)}
            panes={{
              /* Every Flare they have up, newest first. */
              flares: (
                <ProfileFlares
                  flares={profile.flares}
                  yours={yours}
                  imagesEnabled={imagesEnabled}
                  heading={false}
                />
              ),
              /* Their hunts: one binder row each, saying what is left,
                 opening onto the hunt's own page where a visitor picks
                 the cards they have and offers them. */
              hunts: yours ? (
                <HuntsPanel
                  hunts={profile.hunts}
                  limit={huntLimitFor(profile.tier)}
                  yours
                />
              ) : (
                <HuntsPanel hunts={profile.hunts} />
              ),
              /* Only the binders they chose to show; a visitor whose
                 every door is shut reads so rather than nothing. */
              binders: (
                <div className="flex flex-col gap-3">
                  {yours && (
                    <div className="flex justify-end">
                      <CreateBinder trigger="button" />
                    </div>
                  )}
                  {profile.binders.length === 0 ? (
                    <p className="text-sm text-text-muted">No binders to open.</p>
                  ) : (
                    <BinderList
                      binders={profile.binders}
                      yours={yours}
                      base={`/p/${playerId}`}
                    />
                  )}
                </div>
              ),
              /* The showcase: the shelf on its worn background. The
                 owner's page draws the same with the "?" help and the
                 "+" tile. */
              showcase: (
                <section className="relative flex w-full flex-col gap-3 text-left">
                  {profile.showcase.length === 0 ? (
                    <p className="text-sm text-text-muted">Nothing on the shelf yet.</p>
                  ) : (
                    /* The board's carousel: same Rail, same card width. */
                    <div
                      className={cn(
                        "relative",
                        (shelfBg || dressedArt.background) &&
                          "overflow-hidden rounded-[var(--radius-control)] p-2",
                        shelfBg,
                      )}
                    >
                      <WornBackdrop rive={dressedArt} />
                      <Rail ariaLabel="Showcase">
                        {profile.showcase.map((entry, index) => (
                          <li
                            key={entry.id}
                            className="flex w-14 shrink-0 flex-col gap-1"
                          >
                            <CardImageZoom
                              imageUrl={entry.imageUrl}
                              exactName={entry.name}
                              cardNumber={entry.number}
                              note={entry.note}
                              direction="showcase"
                              siblings={shelf}
                              position={index}
                              enabled={imagesEnabled}
                              thumbClassName="w-full"
                              thumb={
                                <WornCardShell
                                  worn={dressed}
                                  rive={dressedArt}
                                  className="w-full"
                                >
                                  <CosmeticCard
                                    imageUrl={entry.imageUrl}
                                    name={entry.name}
                                    number={entry.number}
                                    imagesEnabled={imagesEnabled}
                                    frame={entry.frame ?? worn.frame}
                                    holo={entry.holo ?? worn.holo}
                                    effect={worn.effect}
                                    className="w-full"
                                  />
                                </WornCardShell>
                              }
                            />
                            <span className="truncate text-[11px] text-text-secondary">
                              {entry.name}
                            </span>
                          </li>
                        ))}
                      </Rail>
                    </div>
                  )}
                </section>
              ),
            }}
          />
        </Card>
      </BlockProvider>
    </TabPageShell>
  );
}
