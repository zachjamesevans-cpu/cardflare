import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Flame, KeyRound, Library, Mail } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { SyncCollectionForm } from "@/components/players/sync-collection-form";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { signOut } from "@/lib/auth/actions";
import { getViewer } from "@/lib/auth/session";
import { removeWantAction } from "@/lib/players/account-actions";
import { playerForUser } from "@/lib/players/accounts";
import { collectionSyncFor } from "@/lib/players/collection";
import { listWants } from "@/lib/players/wants";

export const metadata: Metadata = {
  title: "Your account",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Small on purpose.
 *
 * The only things an operator can change about their account are the password
 * and being signed in, so those are the only two things here. The email
 * address is fixed: it is what an admin's invitation was addressed to and what
 * `claimPendingInvite` matches on, so letting it be edited here would quietly
 * detach an account from its store.
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

  return (
    <AppShell
      area="Account"
      email={viewer.user.email ?? ""}
      title="Your account"
      description="How you sign in to CardFlare."
    >
      <div className="flex max-w-2xl flex-col gap-5">
        <Card className="flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <Mail className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
            <div className="flex min-w-0 flex-col gap-1">
              <p className="font-semibold text-text-primary">Email address</p>
              <p className="truncate text-text-secondary">{viewer.user.email}</p>
            </div>
          </div>
          <p className="text-sm text-text-muted">
            This is the address your store was invited on. Get in touch if it needs to
            change.
          </p>
        </Card>

        {wants !== null && (
          <Card className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <Flame
                className="mt-0.5 size-5 shrink-0 text-accent"
                aria-hidden="true"
              />
              <div className="flex flex-col gap-1">
                <p className="font-semibold text-text-primary">Your saved wants</p>
                <p className="text-sm text-text-secondary">
                  Saved automatically when you post a Flare while signed in, cleared
                  when a trade finds the card. Walk into any CardFlare room and it
                  offers to post these again.
                </p>
              </div>
            </div>

            {wants.length === 0 ? (
              <p className="text-sm text-text-muted">
                Nothing yet. Post a Flare at your next event and it will be waiting
                here.
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
        )}

        {playerId && (
          <Card className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <Library
                className="mt-0.5 size-5 shrink-0 text-accent"
                aria-hidden="true"
              />
              <div className="flex flex-col gap-1">
                <p className="font-semibold text-text-primary">Your collection</p>
                <p className="text-sm text-text-secondary">
                  Import your Collectr export and rooms will quietly flag the Flares you
                  could answer. Nobody else ever sees it — your name appears only when
                  you choose to offer.
                </p>
              </div>
            </div>

            <SyncCollectionForm lastSync={lastSync} />
          </Card>
        )}

        <Card className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <KeyRound
              className="mt-0.5 size-5 shrink-0 text-accent"
              aria-hidden="true"
            />
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
