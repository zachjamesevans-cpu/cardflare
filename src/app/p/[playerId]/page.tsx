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
import { getEquips } from "@/lib/players/equips";
import { followState } from "@/lib/players/follows";
import { publicProfile } from "@/lib/players/profile";
import {
  backgroundClass,
  WornCardShell,
  WornNameRow,
  WornRing,
  WornSceneLayer,
} from "@/components/players/worn";
import { cn } from "@/lib/cn";

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
            {/*
             * The cover banner, behind the picture - the founder's
             * profile block: banner, picture overlapping it, name,
             * badge, shelf, all in one rounded card.
             */}
            <div
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-28 overflow-hidden bg-elevated"
            >
              {profile.coverUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.coverUrl} alt="" className="size-full object-cover" />
              )}
              <div className="absolute inset-0 bg-black/25" />
            </div>

            {/* The content layer: rounded top edge with a highlight
                border and lifted shadow crossing the picture's middle,
                so the cover reads as a layer physically behind. */}
            <div
              aria-hidden="true"
              className="absolute inset-x-0 top-24 bottom-0 rounded-t-2xl border-t border-border-strong bg-surface shadow-[0_-8px_20px_rgba(0,0,0,0.35)]"
            />

            {/*
             * One component for picture, initials and frame alike, so
             * this page cannot drift from what a room shows. It used to
             * render its own bare <Image> for the picture case, and a
             * bought frame never appeared here at all.
             */}
            <WornSceneLayer worn={dressed} />

            <WornRing slug={dressed.ring} className="relative mt-12">
              <PlayerAvatar
                displayName={profile.displayName}
                seed={profile.playerId}
                avatarUrl={profile.avatarUrl}
                frame={worn.avatarFrame}
                className="size-24 text-2xl"
              />
            </WornRing>

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
            <div className="relative flex w-full flex-col gap-4 text-left">
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
                    shelfBg && "rounded-[var(--radius-control)] p-2",
                    shelfBg,
                  )}
                >
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
                            <WornCardShell worn={dressed} className="w-full">
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
