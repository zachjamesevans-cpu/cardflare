import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Logo } from "@/components/brand/logo";
import { ChooseUsernameForm } from "@/components/players/choose-username-form";
import { Card } from "@/components/ui/card";
import { getViewer } from "@/lib/auth/session";
import { accountIdentity } from "@/lib/players/account-identity";
import { needsSetup } from "@/lib/players/profile";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Choose your username",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Step one of setting up an account: who you are.
 *
 * The name is asked for here rather than taken from the invitation
 * because an invitation carries whatever an admin typed, and it is now
 * unique across the whole product — so it is a decision the player
 * should make with the availability check in front of them, not one
 * made for them by somebody else months earlier.
 *
 * Nothing about this screen knows how the account came to exist. It runs
 * whenever `onboarded_at` is null, so the invited pilot player and
 * whoever signs themselves up when registration opens walk the same
 * path.
 */
export default async function ChooseUsernamePage() {
  const viewer = await getViewer();

  if (viewer.kind === "anonymous") redirect("/login?next=/welcome/username");

  const account = await accountIdentity(viewer);

  /*
   * An operator with no player account has nothing to set up here, and
   * a player who already did has no business being asked twice.
   */
  if (!account) redirect("/profile/settings");
  if (!(await needsSetup(account.playerId))) redirect("/profile");

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
            Pick your name
          </h1>
          <p className="text-text-secondary">
            Step 1 of 2. This is the name people see when you walk into a room.
          </p>
        </div>

        <Card>
          {/* Their invited name is the starting point, not the answer:
              it is already in the field and already checked. */}
          <ChooseUsernameForm suggestion={account.displayName} />
        </Card>
      </div>
    </main>
  );
}
