import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { IntroCards } from "@/components/onboarding/intro-cards";
import { getViewer } from "@/lib/auth/session";
import { introGame } from "@/lib/onboarding/intro";
import { playerForUser } from "@/lib/players/accounts";
import { listPlayerGames } from "@/lib/players/games";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Welcome to cardflare",
  robots: { index: false, follow: false },
};

/**
 * Sign-up's last screen, and Settings → Help → "Replay the intro": three
 * cards, then "Post your first Flare". The founder: "a quick 30 second
 * introduction to the app when people first sign up". Open to anyone;
 * it only says what cardflare is. The scenes wear the art of the games
 * a signed-in player picked (introGame); anyone else sees One Piece.
 */
export default async function WelcomeIntroPage() {
  const viewer = await getViewer();
  const playerId =
    viewer.kind === "player"
      ? viewer.playerId
      : viewer.kind === "anonymous"
        ? null
        : ((await playerForUser(viewer.user.id))?.id ?? null);
  const game = introGame(playerId ? await listPlayerGames(playerId) : []);
  /* Their handle, for the share scene's link title; none for a guest. */
  const handle =
    playerId && isSupabaseConfigured()
      ? ((
          await getSupabaseAdmin()
            .from("players")
            .select("handle")
            .eq("id", playerId)
            .maybeSingle()
        ).data?.handle ?? null)
      : null;

  return (
    <main
      id="main"
      className="flex min-h-dvh flex-col items-center justify-center gap-8 px-5 py-16"
    >
      <Link href="/" aria-label={`${SITE.name} home`}>
        <Logo size={40} priority />
      </Link>
      <IntroCards game={game} handle={handle} />
    </main>
  );
}
