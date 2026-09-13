import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Flame, Settings, Sparkles, Wand2 } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { AddShowcaseForm } from "@/components/players/add-showcase-form";
import { ProfileCover } from "@/components/players/profile-cover";
import { PeopleList } from "@/components/players/people-list";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { ProfileHeader } from "@/components/players/profile-header";
import { ShareProfileButton } from "@/components/players/share-profile-button";
import { listFollowers, listFollowing } from "@/lib/players/follows";
import { ShowcaseEditor } from "@/components/players/showcase-editor";
import { EmberBadge } from "@/components/players/ember-badge";
import { PlayerTabBar, TabBarSpacer } from "@/components/players/player-tab-bar";
import { buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Rail } from "@/components/lists/rail";
import { areasForUser } from "@/lib/auth/areas";
import { getViewer } from "@/lib/auth/session";
import { cardImagesEnabled } from "@/lib/cards/images";
import { listPlayerGames } from "@/lib/players/games";
import { playerForUser } from "@/lib/players/accounts";
import { resolveEquipped, wardrobeFor } from "@/lib/players/cosmetics";
import { dressedEquipsFor, wornArtFor } from "@/lib/players/equips";
import { needsSetup, ownProfile, SHOWCASE_LIMIT } from "@/lib/players/profile";
import { removeShowcaseAction } from "@/lib/players/profile-actions";
import { profileStats } from "@/lib/players/stats";
import { siteUrl } from "@/lib/site";
import {
  backgroundClass,
  WornBackdrop,
  WornCardShell,
  WornSceneLayer,
} from "@/components/players/worn";
import { cn } from "@/lib/cn";

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

  const [following, followers, stats] = await Promise.all([
    listFollowing(playerId),
    listFollowers(playerId),
    profileStats(playerId),
  ]);

  /*
   * The wardrobe is back on this page even though the shop moved out:
   * the dressing pickers (add flow and per-card editor) offer what is
   * OWNED, and ownership lives in the same read the shop uses.
   */
  const [worn, wardrobe, areas, dressed] = await Promise.all([
    resolveEquipped(profile.equipped),
    wardrobeFor(
      playerId,
      { earned: profile.embersEarned, balance: profile.embersBalance },
      profile.equipped,
    ),
    areasForUser(viewer.user.id, viewer.kind === "admin"),
    dressedEquipsFor(playerId),
  ]);

  /* The dropped-in files behind whatever is worn, in one read. */
  const dressedArt = await wornArtFor(dressed);

  /* The showcase background, when one is worn. */
  const shelfBg = backgroundClass(dressed);

  /* What the dressing rooms may offer: owned only, free items included. */
  const ownedFrames = wardrobe.cardFrames
    .filter((item) => item.owned)
    .map(({ slug, name }) => ({ slug, name }));
  const ownedHolos = wardrobe.holos
    .filter((item) => item.owned)
    .map(({ slug, name }) => ({ slug, name }));

  const imagesEnabled = cardImagesEnabled();
  const games = await listPlayerGames(playerId);

  const currentArea = areas.some((area) => area.href === "/profile")
    ? "/profile"
    : undefined;

  return (
    <>
      <AppShell
        area="Profile"
        email={viewer.user.email ?? ""}
        title="Your profile"
        description="What other players see wherever your name comes up."
        areas={areas}
        currentArea={currentArea}
      >
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
          {/* Your own profile block: the same layout /p/<you> shows
              everyone else, with the edit controls riding directly on
              it - the founder's call after the separate edit blocks
              read as duplicates: "it should all go live from the
              actual edit button... everything can be changed up top."
              One block owns the whole profile now. */}
          <Card className="relative flex flex-col gap-4 overflow-hidden">
            <ProfileCover coverUrl={profile.coverUrl} short />
            <WornSceneLayer worn={dressed} rive={dressedArt} />

            {/* The two wands, top right, over the cover. */}
            <div className="absolute top-3 right-3 z-10 flex gap-2">
              <Link
                href="/profile/customize"
                title="Customize"
                className="flex size-10 items-center justify-center rounded-full border border-border bg-surface/80 text-text-secondary backdrop-blur transition-colors hover:border-border-strong hover:text-text-primary"
              >
                <Wand2 className="size-5" aria-hidden="true" />
                <span className="sr-only">Customize your profile</span>
              </Link>
              <Link
                href="/profile/settings"
                title="Settings"
                className="flex size-10 items-center justify-center rounded-full border border-border bg-surface/80 text-text-secondary backdrop-blur transition-colors hover:border-border-strong hover:text-text-primary"
              >
                <Settings className="size-5" aria-hidden="true" />
                <span className="sr-only">Settings</span>
              </Link>
            </div>

            {/* The Instagram header: picture and numbers, name and
                handle, then Edit profile and Share profile. Changing
                the picture and cover lives behind Edit profile now. */}
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
                statLinks={{
                  followers: "/profile#followers",
                  following: "/profile#following",
                }}
                actions={
                  <>
                    <Link
                      href="/profile/edit"
                      className={cn(buttonStyles("secondary", "sm"), "flex-1")}
                    >
                      Edit profile
                    </Link>
                    <ShareProfileButton
                      url={`${siteUrl()}/p/${profile.playerId}`}
                      title={`${profile.displayName} on cardflare`}
                    />
                  </>
                }
              />
            </div>

            {/* The showcase in its own rounded panel - the founder's
                call: one connected profile block, with the shelf
                reading as its own piece of furniture inside it. The
                public page uses these exact classes; keep them twins. */}
            <div className="relative flex w-full flex-col gap-4 rounded-[var(--radius-control)] border border-border bg-elevated/40 p-4 text-left">
              <div className="flex items-start gap-3">
                <Sparkles
                  className="mt-0.5 size-5 shrink-0 text-accent"
                  aria-hidden="true"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  {/* The founder: the explanation read as clutter once you
                      knew it. It folds behind a "?" now - there for the
                      first visit, gone for every visit after. */}
                  <details className="group">
                    <summary className="flex w-fit cursor-pointer list-none items-center gap-2 font-semibold text-text-primary [&::-webkit-details-marker]:hidden">
                      Your showcase
                      <span
                        className="flex size-5 items-center justify-center rounded-full border border-border text-xs font-bold text-text-muted group-open:border-accent group-open:text-accent"
                        aria-label="What is a showcase?"
                      >
                        ?
                      </span>
                    </summary>
                    <p className="mt-1 text-sm text-text-secondary">
                      Up to nine cards you are proud of, wearing whatever you have
                      unlocked. Not a trade list, so there is nothing to pledge on here.
                      Tap a card to dress it.
                    </p>
                  </details>
                </div>
                {/* The showcase's own wand: card borders, foils, motion
                    and the shelf background, in a menu of their own so
                    neither wand opens a wall. */}
                <Link
                  href="/profile/customize?area=showcase"
                  title="Customize showcase"
                  className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-elevated text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
                >
                  <Wand2 className="size-5" aria-hidden="true" />
                  <span className="sr-only">Customize your showcase</span>
                </Link>
              </div>

              {profile.showcase.length === 0 ? (
                <p className="text-sm text-text-muted">
                  Nothing on the shelf yet. Search for a card below and it stays here
                  between events.
                </p>
              ) : (
                <div
                  className={cn(
                    "relative",
                    (shelfBg || dressedArt.background) &&
                      "overflow-hidden rounded-[var(--radius-control)] p-2",
                    shelfBg,
                  )}
                >
                  <WornBackdrop rive={dressedArt} />
                  <Rail ariaLabel="Your showcase">
                    {profile.showcase.map((entry) => (
                      <li key={entry.id} className="flex w-14 shrink-0 flex-col gap-1">
                        {/*
                         * On your own shelf a tap opens the dressing
                         * room, not the plain viewer - the founder's
                         * spec. Everyone else still gets the zoom, on
                         * the public page and in the room popup.
                         */}
                        <WornCardShell
                          worn={dressed}
                          rive={dressedArt}
                          className="w-full"
                        >
                          <ShowcaseEditor
                            entryId={entry.id}
                            name={entry.name}
                            number={entry.number}
                            imageUrl={entry.imageUrl}
                            imagesEnabled={imagesEnabled}
                            frame={entry.frame ?? worn.frame}
                            holo={entry.holo ?? worn.holo}
                            effect={worn.effect}
                            frames={ownedFrames}
                            holos={ownedHolos}
                          />
                        </WornCardShell>
                        <span className="truncate text-[11px] text-text-secondary">
                          {entry.name}
                        </span>
                        <form action={removeShowcaseAction}>
                          <input type="hidden" name="entryId" value={entry.id} />
                          <button
                            type="submit"
                            className="cursor-pointer text-[11px] text-text-muted underline underline-offset-2 transition-colors hover:text-text-secondary"
                          >
                            Remove
                          </button>
                        </form>
                      </li>
                    ))}
                  </Rail>
                </div>
              )}

              {profile.showcase.length < SHOWCASE_LIMIT ? (
                <AddShowcaseForm
                  imagesEnabled={imagesEnabled}
                  playerGames={games}
                  frames={ownedFrames}
                  holos={ownedHolos}
                  defaultFrame={worn.frame}
                  defaultHolo={worn.holo}
                  effect={worn.effect}
                />
              ) : (
                <p className="text-sm text-text-muted">
                  Your shelf is full. Remove one to make room.
                </p>
              )}
            </div>
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

          {/*
           * The store lives on its own page now — the founder's call.
           * Three shelves of merchandise at the bottom of the profile
           * WERE the profile; this card is the door instead, wearing the
           * one number a shopper decides with.
           */}
          <Link
            href="/profile/store"
            className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-6 shadow-[var(--shadow-card)] transition-colors hover:border-border-strong"
          >
            <span className="flex flex-col gap-1">
              <span className="font-semibold text-text-primary">Embers store</span>
              <span className="text-sm text-text-secondary">
                Frames, holo patterns and effects. Spend what you have earned.
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {/*
               * Deliberately NOT an EmberBadge. That component says
               * "earned" in its title and its screen-reader text, and
               * this is the balance — the one number that must never
               * be mistaken for the badge.
               */}
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-elevated px-3 py-1 text-sm font-semibold text-accent tabular-nums">
                <Flame className="size-4" aria-hidden="true" />
                {profile.embersBalance.toLocaleString()}
                <span className="font-medium text-text-muted">to spend</span>
              </span>
              <ChevronRight className="size-4 text-text-muted" aria-hidden="true" />
            </span>
          </Link>

          <Card id="following" className="flex scroll-mt-24 flex-col gap-4">
            <div className="flex flex-col gap-1">
              <p className="font-semibold text-text-primary">
                Following{" "}
                <span className="font-normal text-text-muted tabular-nums">
                  · {following.length}
                </span>
              </p>
              <p className="text-sm text-text-secondary">
                Players you follow. When they follow you back, you are Trade partners.
              </p>
            </div>
            <PeopleList
              people={following}
              empty="Nobody yet. The next time somebody impresses you at a table, tap their name."
            />
          </Card>

          <Card id="followers" className="flex scroll-mt-24 flex-col gap-4">
            <div className="flex flex-col gap-1">
              <p className="font-semibold text-text-primary">
                Followers{" "}
                <span className="font-normal text-text-muted tabular-nums">
                  · {followers.length}
                </span>
              </p>
              <p className="text-sm text-text-secondary">Players who follow you.</p>
            </div>
            <PeopleList people={followers} empty="Nobody yet. Share your profile." />
          </Card>

          <TabBarSpacer />
        </div>
      </AppShell>

      <PlayerTabBar />
    </>
  );
}
