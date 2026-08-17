import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Flame, KeyRound, Library, Mail, Store } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { SyncCollectionForm } from "@/components/players/sync-collection-form";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PlayerTabBar, TabBarSpacer } from "@/components/players/player-tab-bar";
import { signOut } from "@/lib/auth/actions";
import { areasForUser } from "@/lib/auth/areas";
import { getViewer } from "@/lib/auth/session";
import {
  removeLocalAction,
  removeWantAction,
  rsvpAction,
} from "@/lib/players/account-actions";
import { playerForUser } from "@/lib/players/accounts";
import { collectionSyncFor } from "@/lib/players/collection";
import { listLocals } from "@/lib/players/locals";
import { listWants } from "@/lib/players/wants";
import { DisplayNameForm } from "@/components/players/display-name-form";
import { HandleForm } from "@/components/players/handle-form";
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
 * Two audiences still, ordered by who is looking. For a player their
 * wants and collection lead and sign-in housekeeping follows; for an
 * operator email and password come first. The email address is fixed
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
  const wants = playerId ? await listWants(playerId) : null;
  const profile = playerId ? await ownProfile(playerId) : null;
  const displayName = profile?.displayName ?? "";
  const handle = profile?.handle ?? "";
  const locals = playerId ? await listLocals(playerId) : [];

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
          What people see when you walk into a room. Spaces and capitals are fine, and
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

  const localsCard =
    playerId && locals.length > 0 ? (
      <Card key="locals" className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <Store className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <p className="font-semibold text-text-primary">Your locals</p>
            <p className="text-sm text-text-secondary">
              Saved automatically when you join a room signed in. Tap one to see
              what&rsquo;s happening there, no QR code needed.
            </p>
          </div>
        </div>

        <ul className="flex flex-col">
          {locals.map((local) => {
            const where = [local.city, local.region].filter(Boolean).join(", ");
            return (
              <li
                key={local.storeId}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0"
              >
                <div className="flex min-w-0 flex-1 basis-48 flex-col">
                  <Link
                    href={`/e/${local.joinCode}`}
                    className="truncate font-semibold text-text-primary underline-offset-4 hover:underline"
                  >
                    {local.name}
                  </Link>
                  <span className="text-xs text-text-muted">
                    {local.liveNow
                      ? "A room is open right now"
                      : local.nextEventAt
                        ? `Next: ${local.nextEventName} · ${new Intl.DateTimeFormat(
                            "en-US",
                            { weekday: "short", month: "short", day: "numeric" },
                          ).format(new Date(local.nextEventAt))}`
                        : (where ?? "")}
                  </span>
                </div>
                {local.earlyOpen && local.nextEventCode && (
                  <form action={rsvpAction}>
                    <input type="hidden" name="code" value={local.nextEventCode} />
                    {/* The button says everything the tap does: an RSVP
                        posts the whole list, and a silent broadcast is
                        not a thing this product does. */}
                    <Button type="submit" variant="secondary" size="sm">
                      {wants && wants.length > 0
                        ? `I'll be there. Post my ${wants.length} ${
                            wants.length === 1 ? "Flare" : "Flares"
                          }`
                        : "I'll be there"}
                    </Button>
                  </form>
                )}
                <form action={removeLocalAction}>
                  <input type="hidden" name="storeId" value={local.storeId} />
                  <Button type="submit" variant="ghost" size="sm">
                    Remove
                  </Button>
                </form>
              </li>
            );
          })}
        </ul>
      </Card>
    ) : null;

  const wantsCard =
    wants !== null ? (
      <Card key="wants" className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <Flame className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <p className="font-semibold text-text-primary">Your saved wants</p>
            <p className="text-sm text-text-secondary">
              Saved automatically when you post a Flare while signed in, cleared when a
              trade finds the card. Walk into any CardFlare room and it offers to post
              these again.
            </p>
          </div>
        </div>

        {wants.length === 0 ? (
          <p className="text-sm text-text-muted">
            Nothing yet. Post a Flare at your next event and it will be waiting here.
          </p>
        ) : (
          <ul className="flex flex-col">
            {wants.map((want) => (
              <li
                key={want.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0"
              >
                <div className="flex min-w-0 flex-1 basis-48 flex-col">
                  <span className="truncate font-semibold text-text-primary">
                    {want.cardName}
                    {want.quantity > 1 && (
                      <span className="font-normal text-text-muted tabular-nums">
                        {" "}
                        ×{want.quantity}
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-xs text-text-muted">
                    {want.cardNumber}
                    <span className="font-sans">
                      {" "}
                      · {want.printingLabel ?? "Any printing"}
                      {want.deckLabel && <> · {want.deckLabel}</>}
                    </span>
                  </span>
                </div>
                <form action={removeWantAction}>
                  <input type="hidden" name="wantId" value={want.id} />
                  <Button type="submit" variant="ghost" size="sm">
                    Remove
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>
    ) : null;

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

  /* A player's own things lead; sign-in housekeeping follows. */
  const cards = isPlayerHome
    ? [localsCard, wantsCard, collectionCard, nameCard, emailCard, passwordCard]
    : [nameCard, emailCard, localsCard, wantsCard, collectionCard, passwordCard];

  return (
    <>
      <AppShell
        area="Profile"
        email={viewer.user.email ?? ""}
        title="Settings"
        description={
          isPlayerHome
            ? "Your wants, your collection, and how you sign in."
            : "How you sign in to CardFlare."
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
