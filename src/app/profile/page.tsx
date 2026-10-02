import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Wand2 } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { AddShowcaseForm } from "@/components/players/add-showcase-form";
import { ProfileCover } from "@/components/players/profile-cover";
import { PeopleList } from "@/components/players/people-list";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { ProfileHeader } from "@/components/players/profile-header";
import { ProfileIconRow } from "@/components/players/profile-icon-row";
import { ProfileFlares } from "@/components/players/profile-flares";
import { ShareProfileButton } from "@/components/players/share-profile-button";
import { listFollowers, listFollowing } from "@/lib/players/follows";
import { ShowcaseEditor } from "@/components/players/showcase-editor";
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
import { BinderHighlights } from "@/components/binder/binder-highlights";

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
 *
 * The profile IA round, the founder again: the page "feels cluttered
 * and more like a management dashboard than a social profile"; it
 * should read as "This is me as a trader". So the page is the header,
 * the buttons, a row of round doors (Hunts, Binders, Trades, Embers,
 * Settings), the binders as highlights, the showcase, and the Flares.
 * The hunts panel, the binder panel, the Embers card, the trade
 * history card and the store door are not gone: each is one tap in,
 * behind its door. The public page at /p/<you> reads the same, less
 * the owner's controls, and so does the app's Profile tab.
 *
 * The spendable balance is on the store page and nowhere else, because
 * it is the only place it is any use, and it never appears on somebody
 * else's screen at all: `publicProfile` has no field to put it in.
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
  /* Both guards at once: one roundtrip, not two in a row. */
  const [setupOwed, profile] = await Promise.all([
    needsSetup(playerId),
    ownProfile(playerId),
  ]);
  if (setupOwed) redirect("/welcome");
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
          <Card className="relative flex flex-col gap-5 overflow-hidden">
            <ProfileCover coverUrl={profile.coverUrl} short />
            <WornSceneLayer worn={dressed} rive={dressedArt} />

            {/* Share and the one wand, top right, over the cover. One
                wand: Customize opens on profile cosmetics and switches
                to showcase cosmetics from its own header, so a second
                wand on the shelf was the same door twice. The cog that
                sat beside them is the Settings door in the icon row
                now. */}
            <div className="absolute top-3 right-3 z-10 flex gap-2">
              <ShareProfileButton
                url={`${siteUrl()}/p/${profile.playerId}`}
                title={`${profile.displayName} on cardflare`}
              />
              <Link
                href="/profile/customize"
                title="Customize"
                className="flex size-10 items-center justify-center rounded-full border border-border bg-surface/80 text-text-secondary backdrop-blur transition-colors hover:border-border-strong hover:text-text-primary"
              >
                <Wand2 className="size-5" aria-hidden="true" />
                <span className="sr-only">Customize your profile</span>
              </Link>
            </div>

            {/* The Instagram header: picture and numbers, name and
                handle, then Edit profile. Changing the picture and
                cover lives behind Edit profile now. */}
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
                people={{
                  followers: (
                    <PeopleList
                      people={followers}
                      empty="Nobody yet. Share your profile."
                    />
                  ),
                  following: (
                    <PeopleList
                      people={following}
                      empty="Nobody yet. The next time somebody impresses you at a table, tap their name."
                    />
                  ),
                }}
                actions={
                  <>
                    <Link
                      href="/profile/edit"
                      className={cn(buttonStyles("secondary", "sm"), "flex-1")}
                    >
                      Edit profile
                    </Link>
                  </>
                }
              />
            </div>

            {/* The doors: Hunts, Binders, Trades, Embers, Settings. The
                public page draws the first two. */}
            <ProfileIconRow yours base="/profile" />

            {/* Your binders, the Trade binder first, and a "+" to start
                another. The public page draws the same row without the
                "+". */}
            <BinderHighlights binders={profile.binders} yours base="/profile" />

            {/* The showcase, light: a small heading, the shelf on its
                worn background, and the add form folded behind a "+"
                tile at the end of the shelf. The public page draws the
                same heading without the "?". */}
            <section className="relative flex w-full flex-col gap-3 text-left">
              {/* The founder: the explanation read as clutter once you
                  knew it. It folds behind a "?" now - there for the
                  first visit, gone for every visit after. */}
              <details className="group">
                <summary className="flex w-fit cursor-pointer list-none items-center gap-2 font-semibold text-text-primary [&::-webkit-details-marker]:hidden">
                  Showcase
                  <span
                    className="flex size-5 items-center justify-center rounded-full border border-border text-xs font-bold text-text-muted group-open:border-accent group-open:text-accent"
                    aria-label="What is a showcase?"
                  >
                    ?
                  </span>
                </summary>
                <p className="mt-1 text-sm text-text-secondary">
                  Up to nine cards you are proud of, wearing whatever you have unlocked.
                  Not a trade list, so there is nothing to offer on here. Tap a card to
                  dress it.
                </p>
              </details>

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
                          note={entry.note}
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
                  {profile.showcase.length < SHOWCASE_LIMIT && (
                    /* The "+" at the end of the shelf: the add form,
                       in a sheet, with the dressing step it always had. */
                    <li className="flex w-14 shrink-0 flex-col gap-1">
                      <AddShowcaseForm
                        tile
                        imagesEnabled={imagesEnabled}
                        playerGames={games}
                        frames={ownedFrames}
                        holos={ownedHolos}
                        defaultFrame={worn.frame}
                        defaultHolo={worn.holo}
                        effect={worn.effect}
                      />
                    </li>
                  )}
                </Rail>
              </div>

              {profile.showcase.length === 0 ? (
                <p className="text-sm text-text-muted">
                  Nothing on the shelf yet. Tap the + and it stays here between events.
                </p>
              ) : profile.showcase.length >= SHOWCASE_LIMIT ? (
                <p className="text-sm text-text-muted">
                  Your shelf is full. Remove one to make room.
                </p>
              ) : null}
            </section>

            {/* Every Flare up, newest first: the number in the header,
                drawn out. Nothing below this. */}
            <ProfileFlares
              flares={profile.flares}
              yours
              imagesEnabled={imagesEnabled}
            />
          </Card>

          <TabBarSpacer />
        </div>
      </AppShell>

      <PlayerTabBar />
    </>
  );
}
