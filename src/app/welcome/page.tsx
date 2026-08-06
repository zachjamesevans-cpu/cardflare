import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Logo } from "@/components/brand/logo";
import { NewPasswordForm } from "@/components/auth/new-password-form";
import { Card } from "@/components/ui/card";
import { getViewer } from "@/lib/auth/session";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Finish setting up",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Where the invitation's one button lands.
 *
 * The link in the email is a real Supabase action link, so by the time this
 * renders the store is already signed in — `/auth/callback` exchanged the
 * token on the way through. All that is left is choosing a password, with the
 * address the invitation went to shown rather than retyped.
 *
 * A signed-out visitor here has almost certainly followed an expired link.
 * Sending them to the reset page rather than to sign-in matters: they have no
 * password yet, so a sign-in form is a dead end, and the reset page is one
 * field away from a fresh link.
 *
 * The words match who was invited. A store owner is here to print a counter
 * code; a player is here so their wants follow them between stores — telling
 * a player about "your store" was the first pilot player's first bug report.
 */
export default async function WelcomePage() {
  const viewer = await getViewer();

  if (viewer.kind === "anonymous") redirect("/login/reset?expired=1");

  const email = viewer.user.email ?? "";

  const copy =
    viewer.kind === "player"
      ? {
          intro: "One password and your account is ready to go.",
          savedBody:
            "Your account is ready. Scan in at any CardFlare store, and the cards you hunt will follow you between rooms.",
          continueLabel: "Go to your account",
          continueHref: "/account",
        }
      : {
          intro: "One password and your store is ready to go.",
          savedBody:
            "Your store is ready. Print your counter code and you can start tonight.",
          continueLabel: "Go to your store",
          continueHref: "/store",
        };

  return (
    <main
      id="main"
      className="flex min-h-dvh flex-col items-center justify-center gap-8 px-5 py-16"
    >
      <Link href="/" aria-label={`${SITE.name} home`}>
        <Logo size={40} priority />
      </Link>

      <div className="flex w-full max-w-md flex-col gap-5">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            Finish setting up
          </h1>
          <p className="text-text-secondary">{copy.intro}</p>
        </div>

        {/*
         * Shown, not asked for. They are already signed in as this address —
         * making them retype it would be asking a question we know the answer
         * to, which is most of what made the old flow tiresome.
         */}
        <Card className="flex flex-col gap-1 py-4">
          <p className="text-sm text-text-muted">You&rsquo;re setting up</p>
          <p className="truncate font-semibold text-text-primary">{email}</p>
        </Card>

        <NewPasswordForm
          signedInAs={email}
          submitLabel="Create my account"
          savedTitle="You're all set"
          savedBody={copy.savedBody}
          continueLabel={copy.continueLabel}
          continueHref={copy.continueHref}
        />
      </div>
    </main>
  );
}
