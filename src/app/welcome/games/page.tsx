import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Logo } from "@/components/brand/logo";
import { GamesPicker } from "@/components/players/games-picker";
import { Card } from "@/components/ui/card";
import { getViewer } from "@/lib/auth/session";
import { playerForUser } from "@/lib/players/accounts";
import { listPlayerGames } from "@/lib/players/games";
import { saveMyGamesAction } from "@/lib/players/games-actions";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Which games do you play?",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Sign-up's last question, and the one that will pay off later: which
 * games somebody plays is how CardFlare will know which locals to tell
 * them about. The copy says exactly that - a question with a stated
 * reason gets answered; a mystery dropdown gets skipped.
 */
export default async function WelcomeGamesPage() {
  const viewer = await getViewer();

  if (viewer.kind === "anonymous") redirect("/login?next=/welcome/games");

  const playerId =
    viewer.kind === "player"
      ? viewer.playerId
      : ((await playerForUser(viewer.user.id))?.id ?? null);

  if (!playerId) redirect("/profile/settings");

  const mine = await listPlayerGames(playerId);

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
            Which games do you play?
          </h1>
          <p className="text-text-secondary">
            Last step. When locals near you go up on CardFlare, this is how we know
            which ones are yours.
          </p>
        </div>

        <Card className="flex flex-col gap-5">
          <GamesPicker action={saveMyGamesAction} mine={mine} />
        </Card>
      </div>
    </main>
  );
}
