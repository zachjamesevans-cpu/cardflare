import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Logo } from "@/components/brand/logo";
import { PostalAsk } from "@/components/feed/postal-ask";
import { buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getViewer } from "@/lib/auth/session";
import { WHERE_BODY, WHERE_SKIP, WHERE_TITLE } from "@/lib/onboarding/intro";
import { playerForUser } from "@/lib/players/accounts";
import { postalCodeForPlayer } from "@/lib/players/location";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: WHERE_TITLE,
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * After games, before the intro: roughly where they play, optional. The
 * ZIP is what Nearby measures from, and the intro's next card promises
 * "players near you", so it is asked here. The founder said yes to the
 * step (2026-10-15). The app asks the same (mobile/src/screens/welcome.tsx).
 */
export default async function WelcomeWherePage() {
  const viewer = await getViewer();

  if (viewer.kind === "anonymous") redirect("/login?next=/welcome/where");

  const playerId =
    viewer.kind === "player"
      ? viewer.playerId
      : ((await playerForUser(viewer.user.id))?.id ?? null);

  if (!playerId) redirect("/profile/settings");

  const current = await postalCodeForPlayer(playerId);

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
            {WHERE_TITLE}
          </h1>
          <p className="text-text-secondary">{WHERE_BODY}</p>
        </div>

        <Card className="flex flex-col gap-5">
          <PostalAsk defaultValue={current ?? ""} submitLabel="Save" />
          <Link href="/welcome/intro" className={buttonStyles("primary")}>
            Continue
          </Link>
        </Card>

        <Link
          href="/welcome/intro"
          className="text-center text-sm font-semibold text-accent hover:underline"
        >
          {WHERE_SKIP}
        </Link>
      </div>
    </main>
  );
}
