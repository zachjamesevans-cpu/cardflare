import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { JoinForm } from "@/components/players/join-form";
import { PlayerIdentityCard } from "@/components/players/player-identity-card";
import { Card } from "@/components/ui/card";
import { getPlayerIdentity } from "@/lib/players/session";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Play",
  description: `Join a ${SITE.name} event as a player.`,
  // A personal, per-device page. Nothing here belongs in an index.
  robots: { index: false, follow: false },
};

/** Reads a cookie, so it can never be prerendered. */
export const dynamic = "force-dynamic";

export default async function PlayPage() {
  const player = await getPlayerIdentity();

  return (
    <main
      id="main"
      className="flex min-h-dvh flex-col items-center justify-center gap-8 px-5 py-16"
    >
      <Link href="/" aria-label={`${SITE.name} home`}>
        <Logo size={40} priority />
      </Link>

      <div className="flex w-full max-w-md flex-col gap-5">
        {player ? (
          <>
            <Card>
              <PlayerIdentityCard player={player} />
            </Card>

            <Card className="flex flex-col items-start gap-3">
              <span className="flex size-10 items-center justify-center rounded-[var(--radius-control)] border border-accent/30 bg-accent/10">
                <CalendarClock className="size-5 text-accent" aria-hidden="true" />
              </span>
              <h2 className="text-lg font-semibold text-text-primary">No event yet</h2>
              <p className="text-text-secondary">
                You&rsquo;re set up. Scan the {SITE.name} QR code at a participating
                store to join their event. That part arrives in the next release.
              </p>
            </Card>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-2 text-center">
              <h1 className="text-2xl font-bold tracking-tight text-text-primary">
                Join as a player
              </h1>
              <p className="text-text-secondary">
                Pick a name and you&rsquo;re in. Nothing else to set up.
              </p>
            </div>

            <JoinForm />
          </>
        )}
      </div>
    </main>
  );
}
