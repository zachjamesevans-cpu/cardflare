import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Logo } from "@/components/brand/logo";
import { AvatarForm } from "@/components/players/avatar-form";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getViewer } from "@/lib/auth/session";
import { accountIdentity } from "@/lib/players/account-identity";
import { ownProfile } from "@/lib/players/profile";
import { skipPictureAction } from "@/lib/players/setup-actions";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Add a picture",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Step two: a picture, and it is genuinely optional.
 *
 * The account was already marked set up when the name was chosen, so
 * nobody who skips this is left permanently owing a step. The generated
 * initials are a real avatar rather than a placeholder — that is why
 * `avatar.ts` still exists — so "later" costs nothing.
 *
 * Reached after the username step, and also reachable on its own by
 * somebody who closed the tab: it does not check `needsSetup`, because
 * by the time anyone gets here setup is already recorded as done.
 */
export default async function SetupPicturePage() {
  const viewer = await getViewer();

  if (viewer.kind === "anonymous") redirect("/login?next=/welcome/picture");

  const account = await accountIdentity(viewer);
  if (!account) redirect("/profile/settings");

  const profile = await ownProfile(account.playerId);
  if (!profile) redirect("/profile/settings");

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
            Add a picture
          </h1>
          <p className="text-text-secondary">
            Step 2 of 3, and you can skip it. Your initials work fine.
          </p>
        </div>

        <Card className="flex flex-col gap-5">
          <AvatarForm
            displayName={profile.displayName}
            seed={profile.playerId}
            avatarUrl={profile.avatarUrl}
          />

          <div className="flex flex-col gap-3">
            <ButtonLink href="/welcome/games" className="w-full justify-center">
              Next: your games
            </ButtonLink>

            {/*
             * A real control rather than a link that looks like one, so
             * both ways out of this screen are buttons and neither reads
             * as more correct than the other.
             */}
            <form action={skipPictureAction}>
              <Button type="submit" variant="ghost" className="w-full">
                Skip for now
              </Button>
            </form>
          </div>
        </Card>
      </div>
    </main>
  );
}
