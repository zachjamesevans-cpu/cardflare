import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { KeyRound, Mail } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { signOut } from "@/lib/auth/actions";
import { getViewer } from "@/lib/auth/session";

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
