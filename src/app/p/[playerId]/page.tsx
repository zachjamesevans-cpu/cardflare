import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Sparkles } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { CardImageZoom } from "@/components/cards/card-image-zoom";
import { CosmeticCard } from "@/components/players/cosmetic-card";
import { FollowButton } from "@/components/players/follow-button";
import { ProfileHeader } from "@/components/players/profile-header";
import { ShareProfileButton } from "@/components/players/share-profile-button";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { PlayerTabBar, TabBarSpacer } from "@/components/players/player-tab-bar";
import { buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Rail } from "@/components/lists/rail";
import { getViewer } from "@/lib/auth/session";
import { cardImagesEnabled } from "@/lib/cards/images";
import { playerForUser } from "@/lib/players/accounts";
import { resolveEquipped } from "@/lib/players/cosmetics";
import { dressedEquipsFor, wornArtFor } from "@/lib/players/equips";
import { followState } from "@/lib/players/follows";
import { publicProfile } from "@/lib/players/profile";
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

export const metadata: Metadata = {
  title: "Player",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Somebody else's profile: the reason the showcase exists.
 *
 * A shelf nobody can look at is a shelf in a closed room, so a name in a
 * roster links here. What is on show is exactly the founder's public
 * half: the picture, the name, the lifetime Ember badge, and the cards
 * they are proud of wearing whatever they unlocked.
 *
 * What is NOT here is the spendable balance, and it is not here
 * structurally rather than by omission — `publicProfile` returns a type
 * with no field to put it in, so this page could not render it if it
 * tried. Nor are their wants, their collection, or their email: none of
 * that is a fact about a player, it is their account.
 *
 * Anyone with the link can open it: Share profile hands the address to
 * people who may not have an account yet. A signed-out visitor sees
 * exactly what a room already shows and a Follow button that starts
 * sign-up.
 */
export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const viewer = await getViewer();
  const { playerId } = await params;

  /* Open to anyone with the link: Share profile hands the address to
     people who may not have an account yet, and a 404 at the other end
     would be the wrong first impression. Nothing here is more than a
     room already shows. */
  const profile = await publicProfile(playerId);
  if (!profile) notFound();

  const [worn, dressed] = await Promise.all([
    resolveEquipped(profile.equipped),
    dressedEquipsFor(playerId),
  ]);
  const dressedArt = await wornArtFor(dressed);
  const shelfBg = backgroundClass(dressed);
  const imagesEnabled = cardImagesEnabled();

  /* The viewer's side of the follow relationship. Null hides the
     button: operators without a player account, and your own page. */
  const me =
    viewer.kind === "player"
      ? viewer.playerId
      : viewer.kind === "anonymous"
        ? null
        : ((await playerForUser(viewer.user.id))?.id ?? null);
  const [follow, stats] = await Promise.all([
    me && me !== playerId ? followState(me, playerId) : null,
    profileStats(playerId),
  ]);

  return (
    <>
      <AppShell
        area="Profile"
        email={viewer.kind === "anonymous" ? "" : (viewer.user.email ?? "")}
        title={profile.displayName}
        description="What this player has traded for, and what they are showing off."
      >
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
          <Card className="relative flex flex-col gap-4 overflow-hidden">
            <ProfileCover coverUrl={profile.coverUrl} short />
            <WornSceneLayer worn={dressed} rive={dressedArt} />

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
                actions={
                  <>
                    {follow ? (
                      <FollowButton
                        playerId={playerId}
                        initial={follow}
                        className="flex-1 justify-center"
                      />
                    ) : viewer.kind === "anonymous" ? (
                      <Link
                        href={`/signup?next=${encodeURIComponent(`/p/${playerId}`)}`}
                        className={cn(buttonStyles("primary", "sm"), "flex-1")}
                      >
                        Follow
                      </Link>
                    ) : null}
                    <ShareProfileButton
                      url={`${siteUrl()}/p/${profile.playerId}`}
                      title={`${profile.displayName} on cardflare`}
                    />
                  </>
                }
              />
            </div>

            {/* The showcase panel, pixel-identical to the own-profile
                page's - the founder's spec: viewing somebody must show
                the same block their owner sees. */}
            <div className="relative flex w-full flex-col gap-4 rounded-[var(--radius-control)] border border-border bg-elevated/40 p-4 text-left">
              <div className="flex items-start gap-3">
                <Sparkles
                  className="mt-0.5 size-5 shrink-0 text-accent"
                  aria-hidden="true"
                />
                <div className="flex flex-col gap-1">
                  <p className="font-semibold text-text-primary">Showcase</p>
                  <p className="text-sm text-text-secondary">
                    Cards this player is proud of. Not a trade list, so there is nothing
                    to pledge on here.
                  </p>
                </div>
              </div>

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
                    {profile.showcase.map((entry) => (
                      <li key={entry.id} className="flex w-14 shrink-0 flex-col gap-1">
                        <CardImageZoom
                          imageUrl={entry.imageUrl}
                          exactName={entry.name}
                          cardNumber={entry.number}
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
            </div>
          </Card>

          <TabBarSpacer />
        </div>
      </AppShell>

      <PlayerTabBar />
    </>
  );
}
