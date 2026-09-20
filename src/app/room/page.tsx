import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Logo } from "@/components/brand/logo";
import { PlayerTabBar, TabBarSpacer } from "@/components/players/player-tab-bar";
import { JoinCodeForm } from "@/components/events/join-code-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Card } from "@/components/ui/card";
import { getViewer } from "@/lib/auth/session";
import { removeLocalAction, rsvpAction } from "@/lib/players/account-actions";
import { playerForUser } from "@/lib/players/accounts";
import { currentRoomForSession } from "@/lib/players/current-room";
import { listLocals } from "@/lib/players/locals";
import { getPlayerSession } from "@/lib/players/session";
import { listWants } from "@/lib/players/wants";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Your room",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The app's Room tab, on the website.
 *
 * A destination rather than a page: the board itself still lives at
 * `/e/CODE`, and this is the door the bottom bar knocks on. Which room
 * is derived from the session's own participation — see
 * `currentRoomForSession` — so there is no pointer to go stale.
 *
 * Getting INTO a room happens here now, not on the Feed. The founder:
 * "move the qr code scanner/code entry to Room. No need to have that in
 * the feed." The code form is on this page rather than a link away,
 * because the whole of this screen when you are not in a room is the
 * question "which room?".
 *
 * The stores a player follows answer the same question from the other
 * side, so they live under the form: one tap onto a store's page, and
 * "I'll be there" when its next board is already open. This is the
 * list's one home; settings no longer carries a copy.
 */
export default async function RoomPage() {
  const [viewer, session] = await Promise.all([getViewer(), getPlayerSession()]);
  const room = session ? await currentRoomForSession(session.id) : null;

  if (room) redirect(`/e/${room.code}`);

  /* Guests see the form alone: following needs an account to hang the
     list on. */
  const playerId =
    viewer.kind === "player"
      ? viewer.playerId
      : viewer.kind === "anonymous"
        ? null
        : ((await playerForUser(viewer.user.id))?.id ?? null);
  const [locals, wants] = playerId
    ? await Promise.all([listLocals(playerId), listWants(playerId)])
    : [[], []];

  return (
    <>
      <main
        id="main"
        className="flex min-h-dvh flex-col items-center gap-5 px-5 pt-6 pb-16 sm:gap-8 sm:pt-12"
      >
        <Link href="/feed" aria-label={`${SITE.name} feed`}>
          <Logo size={40} priority />
        </Link>

        <div className="flex w-full max-w-md flex-col gap-5">
          {/* Not wrapped in a card: the form brings its own, and a card
              inside a card is two boxes saying one thing. */}
          <div className="flex flex-col gap-2 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-text-primary">
              No room yet
            </h1>
            <p className="text-text-secondary">
              Scan the code at your store&rsquo;s counter, or type it here. Either way
              the room lives on this tab until you leave it.
            </p>
          </div>

          <JoinCodeForm />

          {locals.length > 0 && (
            <Card className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <h2 className="font-semibold text-text-primary">Following</h2>
                <p className="text-sm text-text-secondary">
                  Stores you follow. Joining a room follows the store too.
                </p>
              </div>
              <ul className="flex flex-col">
                {locals.map((local) => {
                  const where = [local.city, local.region].filter(Boolean).join(", ");
                  return (
                    <li
                      key={local.storeId}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0"
                    >
                      <div className="flex min-w-0 flex-1 basis-48 flex-col">
                        <Link
                          href={`/s/${local.storeId}`}
                          className="truncate font-semibold text-text-primary underline-offset-4 hover:underline"
                        >
                          {local.name}
                        </Link>
                        <span className="text-xs text-text-muted">
                          {local.liveNow
                            ? "A room is open right now"
                            : local.nextEventAt
                              ? `Next: ${local.nextEventName} · ${new Intl.DateTimeFormat(
                                  "en-US",
                                  { weekday: "short", month: "short", day: "numeric" },
                                ).format(new Date(local.nextEventAt))}`
                              : where}
                        </span>
                      </div>
                      {/* One tap: onto the board, Flares and all, from the
                          moment the board opens. The button carries the
                          count so the tap never posts more than it said. */}
                      {local.earlyOpen && local.nextEventCode && (
                        <form action={rsvpAction}>
                          <input
                            type="hidden"
                            name="code"
                            value={local.nextEventCode}
                          />
                          <SubmitButton
                            variant="secondary"
                            size="sm"
                            pendingLabel="Posting…"
                            label={
                              wants.length > 0
                                ? `I'll be there. Post my ${wants.length} ${
                                    wants.length === 1 ? "Flare" : "Flares"
                                  }`
                                : "I'll be there"
                            }
                          />
                        </form>
                      )}
                      <form action={removeLocalAction}>
                        <input type="hidden" name="storeId" value={local.storeId} />
                        <SubmitButton
                          variant="ghost"
                          size="sm"
                          pendingLabel="Unfollowing…"
                          label="Unfollow"
                        />
                      </form>
                    </li>
                  );
                })}
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
