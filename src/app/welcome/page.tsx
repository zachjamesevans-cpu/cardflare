import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Logo } from "@/components/brand/logo";
import { NewPasswordForm } from "@/components/auth/new-password-form";
import { ChooseUsernameForm } from "@/components/players/choose-username-form";
import { Card } from "@/components/ui/card";
import { claimPendingInvite, getViewer } from "@/lib/auth/session";
import { accountIdentity } from "@/lib/players/account-identity";
import { needsSetup } from "@/lib/players/profile";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Finish setting up",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Where the invitation's one button lands, and the whole of signing up.
 *
 * The link in the email is a real Supabase action link, so by the time
 * this renders the account is already signed in — `/auth/confirm`
 * redeemed the token on the way through.
 *
 * ONE SCREEN, for the reason the founder gave after watching somebody do
 * it: "when you create the account it says 'new password' when really it
 * should say 'password' then 'confirm password'. Also the username
 * should be something you can type in on the same screen. It should not
 * go to 'choose your username' after." A password and a name are one
 * act, so they are one form.
 *
 * WHO THIS IS FOR is decided by store membership, not by elimination.
 * The old version asked "is this a player?" and gave everybody else the
 * store wording — so an invited player whose account row had not been
 * created yet was told "your store is ready" and sent to /store, which
 * is exactly what the first invited player hit. A person with no store
 * membership is not a store; a person with one is.
 */
export default async function WelcomePage() {
  const viewer = await getViewer();

  if (viewer.kind === "anonymous") redirect("/login/reset?expired=1");

  /*
   * Retried here, not only at the door. Creating the player row can fail
   * on the way in — a handle collision, a bad moment for the database —
   * and the invitation is left open precisely so the next page load can
   * try again. Without this retry the account exists, the invite sits
   * unclaimed, and the person is stuck being nobody.
   */
  await claimPendingInvite(viewer.user);

  const fresh = await getViewer();
  const email = fresh.kind === "anonymous" ? "" : (fresh.user.email ?? "");

  /* A store is an account that belongs to a store. Everything else is a
     player, including an account whose row is still being sorted out. */
  const isStore =
    (fresh.kind === "store" || fresh.kind === "admin") && fresh.storeIds.length > 0;

  if (isStore) return passwordOnly({ email });

  const account = await accountIdentity(fresh);

  /*
   * No player row even after the retry. They are signed in and can do
   * nothing here, so the password form on its own is still worth
   * offering — it is the half of setup that does not need an account.
   */
  if (!account) return passwordOnly({ email, player: true });

  /* Already set up, arriving from an old link or the back button. */
  if (!(await needsSetup(account.playerId))) redirect("/profile");

  return shell({
    title: "Create your account",
    lead: "A password and a name, and you're in.",
    email,
    children: (
      <ChooseUsernameForm
        suggestion={account.displayName}
        withPassword
        signedInAs={email}
        submitLabel="Create my account"
      />
    ),
  });
}

/**
 * The password-only screen.
 *
 * A store has no handle to pick, so setup really is one field and its
 * confirmation. Also the fallback for a player account that could not be
 * created — see above.
 *
 * A render helper called directly rather than a component mounted as
 * JSX. Both of these produce one tree for one screen, and keeping it
 * flat is what lets the page be read without a browser.
 */
function passwordOnly({ email, player = false }: { email: string; player?: boolean }) {
  return shell({
    title: "Finish setting up",
    lead: player
      ? "One password and your account is ready to go."
      : "One password and your store is ready to go.",
    email,
    children: (
      <NewPasswordForm
        signedInAs={email}
        passwordLabel="Password"
        confirmLabel="Confirm password"
        submitLabel="Create my account"
        savedTitle="You're all set"
        savedBody={
          player
            ? "Your account is ready. Post the cards you hunt and they reach the people near you, wherever you take them: your area, event nights, card shows."
            : "Your store is ready. Print your counter code and you can start tonight."
        }
        continueLabel={player ? "Go to your account" : "Go to your store"}
        continueHref={player ? "/profile" : "/store"}
      />
    ),
  });
}

function shell({
  title,
  lead,
  email,
  children,
}: {
  title: string;
  lead: string;
  email: string;
  children: React.ReactNode;
}) {
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
            {title}
          </h1>
          <p className="text-text-secondary">{lead}</p>
        </div>

        {/*
         * Shown, not asked for. They are already signed in as this
         * address, and making them retype it would be asking a question
         * we know the answer to.
         */}
        {email && (
          <Card className="flex flex-col gap-1 py-4">
            <p className="text-sm text-text-muted">You&rsquo;re setting up</p>
            <p className="truncate font-semibold text-text-primary">{email}</p>
          </Card>
        )}

        {children}
      </div>
    </main>
  );
}
