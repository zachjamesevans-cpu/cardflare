import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Sparkles } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { CardImageZoom } from "@/components/cards/card-image-zoom";
import { CosmeticCard } from "@/components/players/cosmetic-card";
import { EmberBadge } from "@/components/players/ember-badge";
import { FollowButton } from "@/components/players/follow-button";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { PlayerTabBar, TabBarSpacer } from "@/components/players/player-tab-bar";
import { Card } from "@/components/ui/card";
import { Rail } from "@/components/lists/rail";
import { getViewer } from "@/lib/auth/session";
import { cardImagesEnabled } from "@/lib/cards/images";
import { playerForUser } from "@/lib/players/accounts";
import { resolveEquipped } from "@/lib/players/cosmetics";
import { getEquips, wornArtFor } from "@/lib/players/equips";
import { followState } from "@/lib/players/follows";
import { publicProfile } from "@/lib/players/profile";
import {
  backgroundClass,
  WornBackdrop,
  WornCardShell,
  WornNameRow,
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
 * Signed-out visitors get nothing. This is not public in the web sense,
 * only in the room sense — the people who can reach it are people who
 * were standing next to you.
 */
export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const viewer = await getViewer();
  const { playerId } = await params;

  /*
   * A signed-out visitor gets "no such page" rather than a sign-in
   * prompt, deliberately: a prompt would confirm the id exists, which
   * turns this route into a way to enumerate players.
   */
  if (viewer.kind === "anonymous") notFound();

  const profile = await publicProfile(playerId);
  if (!profile) notFound();

  const [worn, dressed] = await Promise.all([
    resolveEquipped(profile.equipped),
    getEquips(playerId),
  ]);
  const dressedArt = await wornArtFor(dressed);
  const shelfBg = backgroundClass(dressed);
  const imagesEnabled = cardImagesEnabled();

  /* The viewer's side of the follow relationship. Null hides the
     button: operators without a player account, and your own page. */
  const me =
    viewer.kind === "player"
      ? viewer.playerId
      : ((await playerForUser(viewer.user.id))?.id ?? null);
  const follow = me && me !== playerId ? await followState(me, playerId) : null;

  return (
    <>
      <AppShell
        area="Profile"
        email={viewer.user.email ?? ""}
        title={profile.displayName}
        description="What this player has traded for, and what they are showing off."
      >
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
          <Card className="relative flex flex-col items-center gap-4 overflow-hidden text-center">
            {/* The cover, carrying down behind the name and badge and
                fading out. The same component your own profile uses. */}
            <ProfileCover coverUrl={profile.coverUrl} />

            {/*
             * One component for picture, initials and frame alike, so
             * this page cannot drift from what a room shows. It used to
             * render its own bare <Image> for the picture case, and a
             * bought frame never appeared here at all.
             */}
            <WornSceneLayer worn={dressed} rive={dressedArt} />

            <PlayerAvatar
              displayName={profile.displayName}
              seed={profile.playerId}
              avatarUrl={profile.avatarUrl}
              frame={worn.avatarFrame}
              ring={dressed.ring}
              aura={dressed.aura}
              ringArt={dressedArt.ring}
              auraArt={dressedArt.aura}
              className="relative mt-12 size-24 text-2xl"
            />

            <div className="relative flex flex-col items-center gap-2">
              <WornNameRow
                name={profile.displayName}
                worn={dressed}
                className="text-lg font-bold"
              />
              <EmberBadge earned={profile.embersEarned} size="md" />
              <p className="text-sm text-text-muted">
                Earned by confirming trades, and nothing else.
              </p>
              {follow && <FollowButton playerId={playerId} initial={follow} />}
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
