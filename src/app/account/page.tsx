import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Flame, KeyRound, Library, Mail, Store } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { SyncCollectionForm } from "@/components/players/sync-collection-form";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { signOut } from "@/lib/auth/actions";
import { areasForUser } from "@/lib/auth/areas";
import { getViewer } from "@/lib/auth/session";
import { removeLocalAction, removeWantAction } from "@/lib/players/account-actions";
import { playerForUser } from "@/lib/players/accounts";
import { collectionSyncFor } from "@/lib/players/collection";
import { listLocals } from "@/lib/players/locals";
import { listWants } from "@/lib/players/wants";

export const metadata: Metadata = {
  title: "Your account",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Two jobs, one page, ordered by who is looking.
 *
 * For a player this is home: their wants and their collection lead,
 * sign-in housekeeping follows. For an operator it stays the small
 * housekeeping page it always was — email and password first — with the
 * player cards underneath for the accounts that are both. The email
 * address is fixed either way: it is what the invitation was addressed to
 * and what `claimPendingInvite` matches on, so letting it be edited here
 * would quietly detach an account from what it was invited to.
 */
export default async function AccountPage() {
  const viewer = await getViewer();

  if (viewer.kind === "anonymous") redirect("/login?next=/account");

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
  const currentArea = areas.some((area) => area.href === "/account")
    ? "/account"
    : undefined;

  const isPlayerHome = viewer.kind === "player";

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
              what&rsquo;s happening there — no QR code needed.
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
            answer. Nobody else ever sees it — your name appears only when you choose to
            offer.
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
        <Link href="/account/password" className={buttonStyles("secondary")}>
          Set or change your password
        </Link>
      </div>
    </Card>
  );

  /* A player's own things lead; sign-in housekeeping follows. */
  const cards = isPlayerHome
    ? [localsCard, wantsCard, collectionCard, emailCard, passwordCard]
    : [emailCard, localsCard, wantsCard, collectionCard, passwordCard];

  return (
    <AppShell
      area="Account"
      email={viewer.user.email ?? ""}
      title="Your account"
      description={
        isPlayerHome
          ? "Your wants and your collection, ready for the next room you walk into."
          : "How you sign in to CardFlare."
      }
      areas={areas}
      currentArea={currentArea}
    >
      <div className="flex max-w-2xl flex-col gap-5">
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
      </div>
    </AppShell>
  );
}
