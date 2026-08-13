import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Flame, Settings, Sparkles } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { AddShowcaseForm } from "@/components/players/add-showcase-form";
import { AvatarForm } from "@/components/players/avatar-form";
import { CosmeticCard } from "@/components/players/cosmetic-card";
import { CosmeticShop } from "@/components/players/cosmetic-shop";
import { DisplayNameForm } from "@/components/players/display-name-form";
import { EmberBadge } from "@/components/players/ember-badge";
import { PlayerTabBar, TabBarSpacer } from "@/components/players/player-tab-bar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { areasForUser } from "@/lib/auth/areas";
import { getViewer } from "@/lib/auth/session";
import { cardImagesEnabled } from "@/lib/cards/images";
import { playerForUser } from "@/lib/players/accounts";
import { resolveEquipped, wardrobeFor } from "@/lib/players/cosmetics";
import { needsSetup, ownProfile, SHOWCASE_LIMIT } from "@/lib/players/profile";
import { removeShowcaseAction } from "@/lib/players/profile-actions";

export const metadata: Metadata = {
  title: "Your profile",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * A player's own profile: who they are, what they have earned, what
 * they are proud of.
 *
 * This replaces the Account tab, which is the founder's call — "the
 * 'account' tab on bottom row should be replaced with 'Profile'" — and
 * the reasoning behind it holds up: an account page is housekeeping, and
 * housekeeping is not somewhere anybody visits twice. A profile is.
 * Everything that used to be here is one tap away behind the cog.
 *
 * The two Ember numbers are laid out exactly as the founder specified.
 * Lifetime earned is the badge and it is public. The balance is beside
 * the shop and nowhere else, because it is the only place it is any use,
 * and it never appears on somebody else's screen at all: `publicProfile`
 * has no field to put it in.
 */
export default async function ProfilePage() {
  const viewer = await getViewer();

  if (viewer.kind === "anonymous") redirect("/login?next=/profile");

  /*
   * The player behind this account, whatever else it is. The founder is
   * an admin with a player account and both halves work at once — the
   * same rule the settings page and every player action follows.
   */
  const playerId =
    viewer.kind === "player"
      ? viewer.playerId
      : ((await playerForUser(viewer.user.id))?.id ?? null);

  /*
   * An operator with no player account has no profile to show. Sent to
   * settings rather than shown an empty one: for a store owner that
   * page IS their account, exactly as it was before the rename.
   */
  if (!playerId) redirect("/profile/settings");

  /*
   * An account that never chose a username is sent to finish that
   * first. The profile is the page it lands on afterwards, so this is
   * the natural place to catch somebody who closed the tab halfway
   * through — a wizard nobody can fall out of is one nobody has to
   * remember to come back to.
   */
  if (await needsSetup(playerId)) redirect("/welcome/username");

  const profile = await ownProfile(playerId);
  if (!profile) redirect("/profile/settings");

  const [wardrobe, worn, areas] = await Promise.all([
    wardrobeFor(
      playerId,
      { earned: profile.embersEarned, balance: profile.embersBalance },
      profile.equipped,
    ),
    resolveEquipped(profile.equipped),
    areasForUser(viewer.user.id, viewer.kind === "admin"),
  ]);

  const imagesEnabled = cardImagesEnabled();

  const currentArea = areas.some((area) => area.href === "/profile")
    ? "/profile"
    : undefined;

  return (
    <>
      <AppShell
        area="Profile"
        email={viewer.user.email ?? ""}
        title="Your profile"
        description="What other players see when your name comes up in a room."
        areas={areas}
        currentArea={currentArea}
      >
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
          <Card className="flex flex-col gap-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <p className="font-semibold text-text-primary">You</p>
                <p className="text-sm text-text-secondary">
                  Your picture and name travel with you between stores.
                </p>
              </div>

              {/* The cog. Everything the account page used to be. */}
              <Link
                href="/profile/settings"
                title="Settings"
                className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-elevated text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
              >
                <Settings className="size-5" aria-hidden="true" />
                <span className="sr-only">Settings</span>
              </Link>
            </div>

            <AvatarForm
              displayName={profile.displayName}
              /* Stable per player, so the fallback colour never changes
                 under somebody who removes their picture and puts it back. */
              seed={profile.playerId}
              avatarUrl={profile.avatarUrl}
              frame={worn.frame}
            />

            <DisplayNameForm displayName={profile.displayName} />
          </Card>

          <Card className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col gap-1">
                <p className="font-semibold text-text-primary">Embers</p>
                <p className="text-sm text-text-secondary">
                  Earned by confirming trades, and nothing else.
                </p>
              </div>
              <EmberBadge earned={profile.embersEarned} size="md" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[var(--radius-control)] border border-border bg-elevated p-4">
                <p className="text-xs font-medium tracking-wide text-text-muted uppercase">
                  Earned, all time
                </p>
                <p className="mt-1 text-2xl font-bold text-text-primary tabular-nums">
                  {profile.embersEarned.toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  Public. This is the number on your badge, and it never goes down.
                </p>
              </div>

              <div className="rounded-[var(--radius-control)] border border-border bg-elevated p-4">
                <p className="text-xs font-medium tracking-wide text-text-muted uppercase">
                  Left to spend
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-2xl font-bold text-accent tabular-nums">
                  <Flame className="size-5" aria-hidden="true" />
                  {profile.embersBalance.toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  Private. Nobody else sees this, only you.
                </p>
              </div>
            </div>
          </Card>

          <Card className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <Sparkles
                className="mt-0.5 size-5 shrink-0 text-accent"
                aria-hidden="true"
              />
              <div className="flex flex-col gap-1">
                <p className="font-semibold text-text-primary">Your showcase</p>
                <p className="text-sm text-text-secondary">
                  Up to nine cards you are proud of, wearing whatever you have unlocked.
                  This is not a trade list, and nobody can pledge on it.
                </p>
              </div>
            </div>

            {profile.showcase.length === 0 ? (
              <p className="text-sm text-text-muted">
                Nothing on the shelf yet. Search for a card below and it stays here
                between events.
              </p>
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
                    <form action={removeShowcaseAction}>
                      <input type="hidden" name="entryId" value={entry.id} />
                      <Button type="submit" variant="ghost" size="sm">
                        Remove
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            )}

            {profile.showcase.length < SHOWCASE_LIMIT ? (
              <AddShowcaseForm imagesEnabled={imagesEnabled} />
            ) : (
              <p className="text-sm text-text-muted">
                Your shelf is full. Remove one to make room.
              </p>
            )}
          </Card>

          <Card className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col gap-1">
                <p className="font-semibold text-text-primary">What Embers buy</p>
                <p className="text-sm text-text-secondary">
                  Frames, holo patterns and effects for the cards on your showcase.
                </p>
              </div>
              {/*
               * Deliberately NOT an EmberBadge. That component says
               * "earned" in its title and its screen-reader text, and
               * this is the balance — the one number that must never be
               * mistaken for the badge.
               */}
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-elevated px-3 py-1 text-sm font-semibold text-accent tabular-nums">
                <Flame className="size-4" aria-hidden="true" />
                {profile.embersBalance.toLocaleString()}
                <span className="font-medium text-text-muted">to spend</span>
              </span>
            </div>

            <CosmeticShop
              title="Frames"
              blurb="The border around your profile picture and every card on your shelf. Everyone in the room sees it."
              items={wardrobe.frames}
              balance={profile.embersBalance}
            />
            <CosmeticShop
              title="Holo patterns"
              blurb="How the light sits on the artwork."
              items={wardrobe.holos}
              balance={profile.embersBalance}
            />
            <CosmeticShop
              title="Effects"
              blurb="What moves, and how often."
              items={wardrobe.effects}
              balance={profile.embersBalance}
            />
          </Card>

          <TabBarSpacer />
        </div>
      </AppShell>

      <PlayerTabBar />
    </>
  );
}
