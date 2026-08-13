import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import { Sparkles } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { CosmeticCard } from "@/components/players/cosmetic-card";
import { EmberBadge } from "@/components/players/ember-badge";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { PlayerTabBar, TabBarSpacer } from "@/components/players/player-tab-bar";
import { Card } from "@/components/ui/card";
import { getViewer } from "@/lib/auth/session";
import { cardImagesEnabled } from "@/lib/cards/images";
import { resolveEquipped } from "@/lib/players/cosmetics";
import { publicProfile } from "@/lib/players/profile";

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

  const worn = await resolveEquipped(profile.equipped);
  const imagesEnabled = cardImagesEnabled();

  return (
    <>
      <AppShell
        area="Profile"
        email={viewer.user.email ?? ""}
        title={profile.displayName}
        description="What this player has traded for, and what they are showing off."
      >
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
          <Card className="flex flex-col items-center gap-4 text-center">
            {profile.avatarUrl ? (
              /* Unoptimised: already a 512px WebP square, written by the
                 server. See AvatarForm for the same reasoning. */
              <Image
                src={profile.avatarUrl}
                alt=""
                width={96}
                height={96}
                unoptimized
                className="size-24 rounded-full border border-border object-cover"
              />
            ) : (
              <PlayerAvatar
                displayName={profile.displayName}
                seed={profile.playerId}
                className="size-24 text-2xl"
              />
            )}

            <div className="flex flex-col items-center gap-2">
              <p className="text-lg font-bold text-text-primary">
                {profile.displayName}
              </p>
              <EmberBadge earned={profile.embersEarned} size="md" showTier />
              <p className="text-sm text-text-muted">
                Earned by confirming trades, and nothing else.
              </p>
            </div>
          </Card>

          <Card className="flex flex-col gap-4">
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
              <ul className="grid grid-cols-3 gap-3">
                {profile.showcase.map((entry) => (
                  <li key={entry.id} className="flex flex-col gap-1.5">
                    <CosmeticCard
                      imageUrl={entry.imageUrl}
                      name={entry.name}
                      number={entry.number}
                      imagesEnabled={imagesEnabled}
                      frame={worn.frame}
                      holo={worn.holo}
                      effect={worn.effect}
                    />
                    <span className="truncate text-xs text-text-secondary">
                      {entry.name}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <TabBarSpacer />
        </div>
      </AppShell>

      <PlayerTabBar />
    </>
  );
}
