import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  ClipboardList,
  KeyRound,
  Library,
  Mail,
  MapPin,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { SyncCollectionForm } from "@/components/players/sync-collection-form";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FeedViewPicker } from "@/components/feed/feed-view-picker";
import { feedViewFor } from "@/lib/feed/view-settings";
import { PlayerTabBar, TabBarSpacer } from "@/components/players/player-tab-bar";
import { signOut } from "@/lib/auth/actions";
import { areasForUser } from "@/lib/auth/areas";
import { getViewer } from "@/lib/auth/session";
import { playerForUser } from "@/lib/players/accounts";
import { collectionSyncFor } from "@/lib/players/collection";
import { postalCodeForPlayer } from "@/lib/players/location";
import { PostalAsk } from "@/components/feed/postal-ask";
import { DisplayNameForm } from "@/components/players/display-name-form";
import { DeckListForm } from "@/components/players/deck-list-form";
import { HandleForm } from "@/components/players/handle-form";
import { DeleteAccountForm } from "@/components/players/delete-account-form";
import { ownProfile } from "@/lib/players/profile";

export const metadata: Metadata = {
  title: "Settings",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Settings: everything that used to be the account page.
 *
 * This was `/account`, and it was a player's home. It is not any more —
 * the profile is, and this is what sits behind the cog on it. The
 * founder's instruction was exactly that: "the normal account settings
 * will exist in the profile page, maybe as a settings cog... so just
 * moving it basically". Nothing here changed but where it lives.
 *
 * Housekeeping only. The lists that used to live here have one home
 * each now: saved wants are the Flare tab's "Saved requests", and the
 * stores you follow are the Room tab's "Following". What is left is
 * what is about the account itself.
 *
 * Two audiences still, ordered by who is looking. For a player their
 * collection and deck paste lead and sign-in housekeeping follows; for
 * an operator email and password come first. The email address is fixed
 * either way: it is what the invitation was addressed to and what
 * `claimPendingInvite` matches on, so letting it be edited here would
 * quietly detach an account from what it was invited to.
 */
export default async function ProfileSettingsPage() {
  const viewer = await getViewer();

  if (viewer.kind === "anonymous") redirect("/login?next=/profile/settings");

  const home =
    viewer.kind === "admin" ? "/admin" : viewer.kind === "store" ? "/store" : null;

  /*
   * The player behind this account, whatever else it is — the founder is an
   * admin with a player account, and both halves should work at once.
   */
  const playerId =
    viewer.kind === "player"
      ? viewer.playerId
      : ((await playerForUser(viewer.user.id))?.id ?? null);
  const profile = playerId ? await ownProfile(playerId) : null;
  const displayName = profile?.displayName ?? "";
  const handle = profile?.handle ?? "";
  const postalCode = playerId ? await postalCodeForPlayer(playerId) : null;

  const sync = playerId ? await collectionSyncFor(playerId) : null;
  const lastSync = sync
    ? {
        when: new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
          new Date(sync.synced_at),
        ),
        cardsMatched: sync.cards_matched,
        linesUnmatched: sync.lines_unmatched,
      }
    : null;

  /*
   * The same switcher the admin and store headers carry, so an account
   * that is several things at once (the founder; a store owner who plays)
   * can leave this page the way they arrived. Marked current only when
   * the player entry actually exists — for a pure operator this page is
   * not one of the switcher's destinations.
   */
  const areas = await areasForUser(viewer.user.id, viewer.kind === "admin");
  const currentArea = areas.some((area) => area.href === "/profile")
    ? "/profile"
    : undefined;

  const isPlayerHome = viewer.kind === "player";

  /*
   * Your name, which is housekeeping rather than decoration. It used
   * to sit on the front of the profile; the founder moved it here:
   * "no need to have the name editor front and center on a profile."
   */
  const nameCard = !playerId ? null : (
    <Card key="name" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold text-text-primary">Your name</h2>
        <p className="text-sm text-text-secondary">
          What people see next to everything you post. Spaces and capitals are fine, and
          it does not have to be unique.
        </p>
      </div>
      <DisplayNameForm displayName={displayName} />

      {/* The other half of the same question, so both are changed in
          the same place. Its own explanation, because "unique, no
          spaces" is exactly the part that surprises people. */}
      <div className="flex flex-col gap-1 border-t border-border pt-4">
        <h3 className="font-semibold text-text-primary">How people find you</h3>
        <p className="text-sm text-text-secondary">
          Your handle is yours alone. Letters, numbers and underscores, so it can be
          said out loud and typed without guessing.
        </p>
      </div>
      <HandleForm handle={handle} />
    </Card>
  );

  /*
   * Where the player is, roughly, and the only place a saved ZIP can be
   * changed once the Feed has stopped asking for it.
   *
   * A ZIP rather than a stored coordinate is the whole design: the
   * device position the app can ask for is never written down, so this
   * five-digit field is the entirety of what cardflare keeps about
   * where somebody is. Emptying it is how you take it back. The card
   * is named for what it holds, not for what it finds: the stores it
   * finds are on the Room tab, and this is the setting behind them.
   */
  const locationCard = !playerId ? null : (
    <Card key="location" className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <MapPin className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <p className="font-semibold text-text-primary">Your ZIP code</p>
          <p className="text-sm text-text-secondary">
            Used only to match you with players and stores nearby. It is never shown to
            anyone.
          </p>
        </div>
      </div>
      <PostalAsk defaultValue={postalCode ?? ""} allowClear submitLabel="Save" />
    </Card>
  );

  /* How the Feed is drawn. Account-level, so it follows to the app. */
  const feedViewCard = !playerId ? null : (
    <Card key="feed-view">
      <FeedViewPicker current={await feedViewFor(playerId)} />
    </Card>
  );

  const emailCard = (
    <Card key="email" className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <Mail className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-semibold text-text-primary">Email address</p>
          <p className="truncate text-text-secondary">{viewer.user.email}</p>
        </div>
      </div>
      <p className="text-sm text-text-muted">
        {isPlayerHome
          ? "This is the address your invitation was sent to. Get in touch if it needs to change."
          : "This is the address your store was invited on. Get in touch if it needs to change."}
      </p>
    </Card>
  );

  /*
   * The paste box, as its own card. The wants it produces are not
   * listed here: "the 'saved wants' section in the settings is kinda
   * redundant, since it's just the flare section, just elsewhere", so
   * the Flare tab's "Saved requests" is the one list and this card
   * only feeds it. The app carries a card under exactly this title.
   */
  const deckListCard = !playerId ? null : (
    <Card key="deck-list" className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <ClipboardList
          className="mt-0.5 size-5 shrink-0 text-accent"
          aria-hidden="true"
        />
        <div className="flex flex-col gap-1">
          <p className="font-semibold text-text-primary">Paste a deck list</p>
          <p className="text-sm text-text-secondary">
            Every card in it becomes a saved request. Walk into any room and it offers
            to post the lot in one go.
          </p>
        </div>
      </div>

      <DeckListForm />

      <Link
        href="/flare"
        className="w-fit text-sm font-semibold text-accent underline-offset-4 hover:underline"
      >
        Your saved requests live on the Flare tab
      </Link>
    </Card>
  );

  const collectionCard = playerId ? (
    <Card key="collection" className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <Library className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <p className="font-semibold text-text-primary">Your collection</p>
          <p className="text-sm text-text-secondary">
            Import your Collectr export and rooms will quietly flag the Flares you could
            answer. Nobody else ever sees it, and your name appears only when you choose
            to offer.
          </p>
        </div>
      </div>

      <SyncCollectionForm lastSync={lastSync} />
    </Card>
  ) : null;

  const passwordCard = (
    <Card key="password" className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <KeyRound className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <p className="font-semibold text-text-primary">Password</p>
          <p className="text-text-secondary">
            Set one and you can sign in straight away, without waiting for an email.
          </p>
        </div>
      </div>

      <div>
        <Link href="/profile/password" className={buttonStyles("secondary")}>
          Set or change your password
        </Link>
      </div>
    </Card>
  );

  /*
   * Closing the account, last and quiet. The same act the app offers
   * from its settings, because the App Store requires it there, and a
   * website that could not do what the app can would be the odd one.
   */
  const deleteCard = playerId ? (
    <Card key="delete" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <p className="font-semibold text-text-primary">Delete your account</p>
        <p className="text-sm text-text-secondary">
          Everything goes: profile, Flares, lists, showcase and unlocks. There is no
          undo.
        </p>
      </div>
      <DeleteAccountForm handle={handle} />
    </Card>
  ) : null;

  /* A player's own things lead; sign-in housekeeping follows. */
  const cards = isPlayerHome
    ? [
        feedViewCard,
        deckListCard,
        collectionCard,
        locationCard,
        nameCard,
        emailCard,
        passwordCard,
        deleteCard,
      ]
    : [
        nameCard,
        emailCard,
        locationCard,
        feedViewCard,
        deckListCard,
        collectionCard,
        passwordCard,
        deleteCard,
      ];

  return (
    <>
      <AppShell
        area="Profile"
        email={viewer.user.email ?? ""}
        title="Settings"
        description={
          isPlayerHome
            ? "Your collection, your ZIP code, and how you sign in."
            : "How you sign in to cardflare."
        }
        areas={areas}
        currentArea={currentArea}
      >
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
          {/* The way out, at the top, because settings is somewhere you
              arrive from one place and leave back to the same place. */}
          {playerId && (
            <Link
              href="/profile"
              className="flex w-fit items-center gap-1.5 text-sm text-text-muted underline-offset-4 hover:text-text-secondary hover:underline"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
              Back to your profile
            </Link>
          )}

          {cards}

          <div className="flex flex-wrap items-center gap-4">
            <form action={signOut}>
              <Button type="submit" variant="secondary">
                Sign out
              </Button>
            </form>

            {home && (
              <Link
                href={home}
                className="text-sm text-text-muted underline underline-offset-4 hover:text-text-secondary"
              >
                Back to {viewer.kind === "admin" ? "the admin console" : "your store"}
              </Link>
            )}
          </div>
          <TabBarSpacer />
        </div>
      </AppShell>

      <PlayerTabBar />
    </>
  );
}
