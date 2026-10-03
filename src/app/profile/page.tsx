import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Flame, Settings, Wand2 } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { AddShowcaseForm } from "@/components/players/add-showcase-form";
import { ProfileCover } from "@/components/players/profile-cover";
import { HuntsPanel } from "@/components/players/hunts-panel";
import { PeopleList } from "@/components/players/people-list";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { ProfileHeader } from "@/components/players/profile-header";
import { ProfileFlares } from "@/components/players/profile-flares";
import { ProfileTabs } from "@/components/players/profile-tabs";
import { profileTabFrom } from "@/lib/players/profile-tabs";
import { ShareProfileButton } from "@/components/players/share-profile-button";
import { listFollowers, listFollowing } from "@/lib/players/follows";
import { ShowcaseEditor } from "@/components/players/showcase-editor";
import { PlayerTabBar, TabBarSpacer } from "@/components/players/player-tab-bar";
import {
  LockedRows,
  TradeHistoryRow,
  TradeHistoryTotalsRow,
  TradeHistoryWall,
} from "@/components/trades/history";
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
import { huntLimitFor } from "@/lib/players/hunts";
import { needsSetup, ownProfile, SHOWCASE_LIMIT } from "@/lib/players/profile";
import { removeShowcaseAction } from "@/lib/players/profile-actions";
import { profileStats } from "@/lib/players/stats";
import { siteUrl } from "@/lib/site";
import { listTradeHistory, type TradeHistory } from "@/lib/trades/history";
import {
  backgroundClass,
  WornBackdrop,
  WornCardShell,
  WornSceneLayer,
} from "@/components/players/worn";
import { cn } from "@/lib/cn";
import { BinderHighlights } from "@/components/binder/binder-highlights";
import { BinderList } from "@/components/binder/binder-list";
import { CreateBinder } from "@/components/binder/create-binder";

export const metadata: Metadata = {
  title: "Your profile",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * A player's own profile: who they are, what they have earned, what
 * they are proud of.
 *
 * This replaces the Account tab, which is the founder's call ("the
 * 'account' tab on bottom row should be replaced with 'Profile'"), and
 * the reasoning behind it holds up: an account page is housekeeping, and
 * housekeeping is not somewhere anybody visits twice. A profile is.
 *
 * The profile IA round, the founder again: the page "feels cluttered
 * and more like a management dashboard than a social profile"; it
 * should read as "This is me as a trader". So the page is the header,
 * the buttons, the binders as highlights, and then the sections as
 * tabs that slide in place: Flares, Hunts, Binders, Showcase, Trades,
 * Embers. The founder, with a recording of Instagram's profile: "The
 * goal is to just have a sliding animation between them that's click
 * and doesn't go into a full screen animation / loading screen so you
 * can still access these buttons." Nothing navigates: every pane is
 * rendered here, on the server, and the strip slides between them.
 * The public page at /p/<you> reads the same, less the owner's
 * controls, and so does the app's Profile tab.
 *
 * The spendable balance is on the store page and nowhere else, because
 * it is the only place it is any use, and it never appears on somebody
 * else's screen at all: `publicProfile` has no field to put it in.
 */
export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const viewer = await getViewer();

  if (viewer.kind === "anonymous") redirect("/login?next=/profile");

  /*
   * The player behind this account, whatever else it is. The founder is
   * an admin with a player account and both halves work at once, the
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
   * through: a wizard nobody can fall out of is one nobody has to
   * remember to come back to.
   */
  /* Both guards at once: one roundtrip, not two in a row. */
  const [setupOwed, profile] = await Promise.all([
    needsSetup(playerId),
    ownProfile(playerId),
  ]);
  if (setupOwed) redirect("/welcome");
  if (!profile) redirect("/profile/settings");

  /* The trade history rides on the profile again, in the Trades pane:
     three recent rows and the totals. The rows never reach a free
     player's page, because listTradeHistory withholds them. */
  const [following, followers, stats, history, { tab }] = await Promise.all([
    listFollowing(playerId),
    listFollowers(playerId),
    profileStats(playerId),
    listTradeHistory(playerId, profile.tier),
    searchParams,
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

            {/* Share, the one wand and the cog, top right, over the
                cover. One wand: Customize opens on profile cosmetics
                and switches to showcase cosmetics from its own header,
                so a second wand on the shelf was the same door twice.
                The cog is back here from the icon row: Settings is a
                screen, not a section, so it is not a tab. */}
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

            {/* Your binders, in your order, and a "+" to start another.
                The public page draws the same row without the "+". */}
            <BinderHighlights binders={profile.binders} yours base="/profile" />

            {/* The sections, as tabs that slide in place under the
                strip. Each pane is rendered here and handed over whole;
                the strip only decides which one is in the window. */}
            <ProfileTabs
              yours
              initial={profileTabFrom(tab, true)}
              panes={{
                /* Every Flare up, newest first: the number in the
                   header, drawn out. The tab is the heading. */
                flares: (
                  <ProfileFlares
                    flares={profile.flares}
                    yours
                    imagesEnabled={imagesEnabled}
                    heading={false}
                  />
                ),
                /* The hunts panel, every row drawn, with New hunt. */
                hunts: (
                  <HuntsPanel
                    hunts={profile.hunts}
                    limit={huntLimitFor(profile.tier)}
                    yours
                  />
                ),
                /* Every binder as a row, New binder above them. */
                binders: (
                  <div className="flex flex-col gap-3">
                    <div className="flex justify-end">
                      <CreateBinder trigger="button" />
                    </div>
                    <BinderList binders={profile.binders} yours base="/profile" />
                  </div>
                ),
                /* The showcase: the shelf on its worn background, the
                   "?" help, and the add form folded behind a "+" tile
                   at the end of the shelf. The public page draws the
                   same without the "?" and the "+". */
                showcase: (
                  <section className="relative flex w-full flex-col gap-3 text-left">
                    {/* The founder: the explanation read as clutter
                        once you knew it. It folds behind a "?" now -
                        there for the first visit, gone for every visit
                        after. */}
                    <details className="group">
                      <summary
                        className="flex size-5 cursor-pointer list-none items-center justify-center rounded-full border border-border text-xs font-bold text-text-muted group-open:border-accent group-open:text-accent [&::-webkit-details-marker]:hidden"
                        aria-label="What is a showcase?"
                      >
                        ?
                      </summary>
                      <p className="mt-2 text-sm text-text-secondary">
                        {
                          "Up to nine cards you are proud of, wearing whatever you have unlocked. Not a trade list, so there is nothing to offer on here. Tap a card to dress it."
                        }
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
                          <li
                            key={entry.id}
                            className="flex w-14 shrink-0 flex-col gap-1"
                          >
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
                        Nothing on the shelf yet. Tap the + and it stays here between
                        events.
                      </p>
                    ) : profile.showcase.length >= SHOWCASE_LIMIT ? (
                      <p className="text-sm text-text-muted">
                        Your shelf is full. Remove one to make room.
                      </p>
                    ) : null}
                  </section>
                ),
                /* The trade history card's content, inline: the totals,
                   three recent rows, and See all to the whole list. */
                trades: <TradesPane history={history} />,
                /* The one public number, and the door to the store
                   wearing the one a shopper decides with. */
                embers: (
                  <div className="flex flex-col gap-4">
                    {/* One number here, the public one. The balance is
                        on the store door below and nowhere else on this
                        page, so the two are never read side by side and
                        mistaken for each other. */}
                    <div className="rounded-[var(--radius-control)] border border-border bg-elevated p-4">
                      <p className="text-xs font-medium tracking-wide text-text-muted uppercase">
                        Earned, all time
                      </p>
                      <p className="mt-1 text-2xl font-bold text-text-primary tabular-nums">
                        {profile.embersEarned.toLocaleString()}
                      </p>
                      <p className="mt-1 text-xs text-text-muted">
                        Public. The number on your badge. Trades, turning up at your
                        stores and grants raise it, and it never goes down.
                      </p>
                    </div>

                    {/* The store lives on its own page, the founder's
                        call: three shelves of merchandise at the bottom
                        of the profile WERE the profile. This is the
                        door. */}
                    <Link
                      href="/profile/store"
                      className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-6 shadow-[var(--shadow-card)] transition-colors hover:border-border-strong"
                    >
                      <span className="flex flex-col gap-1">
                        <span className="font-semibold text-text-primary">
                          Embers store
                        </span>
                        <span className="text-sm text-text-secondary">
                          Frames, holo patterns and effects. Spend what you have earned.
                        </span>
                        <span className="text-xs text-text-muted">
                          Packs, duplicates and gifts add to what you can spend. Trading
                          adds to both.
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {/* Deliberately NOT an EmberBadge. That component
                            says "earned" in its title and its screen-reader
                            text, and this is the balance, the one number
                            that must never be mistaken for the badge. */}
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-elevated px-3 py-1 text-sm font-semibold text-accent tabular-nums">
                          <Flame className="size-4" aria-hidden="true" />
                          {profile.embersBalance.toLocaleString()}
                          <span className="font-medium text-text-muted">to spend</span>
                        </span>
                        <ChevronRight
                          className="size-4 text-text-muted"
                          aria-hidden="true"
                        />
                      </span>
                    </Link>
                  </div>
                ),
              }}
            />
          </Card>

          <TabBarSpacer />
        </div>
      </AppShell>

      <PlayerTabBar />
    </>
  );
}

/**
 * The Trades pane: what the trade history card used to say on the
 * profile, without the card. Three numbers, three recent rows, and
 * See all to /profile/trades, which also logs a trade, so the door is
 * open in every state. Locked, the rows are the Pro pitch.
 */
function TradesPane({ history }: { history: TradeHistory }) {
  const recent = history.trades.slice(0, 3);

  return (
    <div className="flex flex-col gap-4">
      <TradeHistoryTotalsRow totals={history.totals} />

      {history.locked ? (
        <div className="relative">
          <LockedRows count={3} />
          <div
            className="pointer-events-none mt-4 h-9 rounded-[var(--radius-control)] bg-elevated blur-[6px]"
            aria-hidden="true"
          />
          <TradeHistoryWall count={history.totals.trades} />
        </div>
      ) : recent.length === 0 ? (
        <p className="text-sm text-text-muted">
          Nothing traded yet. Confirm a trade in a room and it lands here.
        </p>
      ) : (
        <ul className="flex flex-col">
          {recent.map((trade) => (
            <TradeHistoryRow key={trade.id} trade={trade} compact />
          ))}
        </ul>
      )}

      <Link
        href="/profile/trades"
        className={cn(buttonStyles("secondary", "sm"), "w-full justify-center")}
      >
        See all
      </Link>
    </div>
  );
}
