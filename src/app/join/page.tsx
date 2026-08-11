import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { PlayerTabBar, TabBarSpacer } from "@/components/players/player-tab-bar";
import { JoinCodeForm } from "@/components/events/join-code-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { rsvpAction } from "@/lib/players/account-actions";
import { getViewer } from "@/lib/auth/session";
import { playerForUser } from "@/lib/players/accounts";
import { listLocals } from "@/lib/players/locals";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Join an event",
  description: `Enter the code from your local game store to join a ${SITE.name} event.`,
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The fallback for players who cannot scan.
 *
 * Printed on every poster beside the QR code, because a meaningful share of
 * players will have a camera that will not focus, a locked-down work phone, or
 * a cracked screen. This has to be a first-class way in, not a consolation.
 */
export default async function JoinPage() {
  /*
   * A signed-in player's saved stores appear under the code form: the
   * places they actually go, one tap, no QR. Guests see the form alone —
   * the page stays exactly the fallback it has always been.
   */
  const viewer = await getViewer();
  const playerId =
    viewer.kind === "player"
      ? viewer.playerId
      : viewer.kind === "anonymous"
        ? null
        : ((await playerForUser(viewer.user.id))?.id ?? null);
  const locals = playerId ? await listLocals(playerId) : [];

  return (
    <>
      <main
        id="main"
        className="flex min-h-dvh flex-col items-center gap-5 px-5 pt-6 pb-16 sm:gap-8 sm:pt-12"
      >
        <Link href="/" aria-label={`${SITE.name} home`}>
          <Logo size={40} priority />
        </Link>

        <div className="flex w-full max-w-md flex-col gap-5">
          <div className="flex flex-col gap-2 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-text-primary">
              Join an event
            </h1>
            <p className="text-text-secondary">
              Enter the code from the sheet at your store.
            </p>
          </div>

          <JoinCodeForm />

          {locals.length > 0 && (
            <Card className="flex flex-col gap-3">
              <h2 className="font-semibold text-text-primary">Your locals</h2>
              <ul className="flex flex-col">
                {locals.map((local) => (
                  <li
                    key={local.storeId}
                    className="flex flex-col gap-2 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0"
                  >
                    <Link
                      href={`/e/${local.joinCode}`}
                      className="flex flex-col gap-0.5"
                    >
                      <span className="font-semibold text-text-primary underline-offset-4 hover:underline">
                        {local.name}
                      </span>
                      <span className="text-xs text-text-muted">
                        {local.liveNow
                          ? "A room is open right now"
                          : local.nextEventAt
                            ? `Next: ${local.nextEventName} · ${new Intl.DateTimeFormat(
                                "en-US",
                                { weekday: "short", month: "short", day: "numeric" },
                              ).format(new Date(local.nextEventAt))}`
                            : "Tap to see what's happening"}
                      </span>
                    </Link>
                    {/* One tap: onto the board, wants and all, days early. */}
                    {local.earlyOpen && local.nextEventCode && (
                      <form action={rsvpAction}>
                        <input type="hidden" name="code" value={local.nextEventCode} />
                        <Button type="submit" variant="secondary" size="sm">
                          I&rsquo;ll be there. Post my wants
                        </Button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <TabBarSpacer />
      </main>

      <PlayerTabBar />
    </>
  );
}
