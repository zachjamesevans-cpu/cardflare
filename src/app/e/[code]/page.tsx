import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, MapPin } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { Card } from "@/components/ui/card";
import { formatEventWindow } from "@/lib/events/format";
import { isValidJoinCode, normalizeJoinCode } from "@/lib/events/join-code";
import { findEventByJoinCode } from "@/lib/events/repository";
import { getPlayerIdentity } from "@/lib/players/session";
import { SITE } from "@/lib/site";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

/** Shown when the code is well-formed but cannot be checked right now. */
function Unavailable() {
  return (
    <main
      id="main"
      className="flex min-h-dvh flex-col items-center justify-center gap-8 px-5 py-16"
    >
      <Link href="/" aria-label={`${SITE.name} home`}>
        <Logo size={40} priority />
      </Link>

      <Card className="flex w-full max-w-md flex-col gap-2">
        <h1 className="text-xl font-bold text-text-primary">
          We can&rsquo;t check that code right now
        </h1>
        <p className="text-text-secondary">
          Nothing is wrong with the code on the sheet. Give it a moment and scan again.
        </p>
      </Card>
    </main>
  );
}

export const metadata: Metadata = {
  title: "Join event",
  // A per-event page reached by scanning a printed code. Never indexed.
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Where the printed QR code points.
 *
 * Kept short (`/e/CODE`) on purpose: fewer characters means a lower QR
 * version, larger modules at the same printed size, and a code that scans from
 * further away in worse light.
 */
export default async function JoinByCodePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const normalized = normalizeJoinCode(decodeURIComponent(code));

  if (!isValidJoinCode(normalized)) notFound();

  /*
   * A well-formed code that cannot be looked up is not the same as one that
   * does not exist. During an outage, 404 would tell a player standing at the
   * counter that the store's printed code is wrong.
   */
  if (!isSupabaseConfigured()) {
    return <Unavailable />;
  }

  const event = await findEventByJoinCode(normalized);
  if (!event) notFound();

  const player = await getPlayerIdentity();
  const location = [event.storeCity, event.storeRegion].filter(Boolean).join(", ");

  return (
    <main
      id="main"
      className="flex min-h-dvh flex-col items-center justify-center gap-8 px-5 py-16"
    >
      <Link href="/" aria-label={`${SITE.name} home`}>
        <Logo size={40} priority />
      </Link>

      <div className="flex w-full max-w-md flex-col gap-5">
        <Card className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-accent">{event.storeName}</p>
            <h1 className="text-2xl font-bold tracking-tight text-text-primary">
              {event.name}
            </h1>
          </div>

          <dl className="flex flex-col gap-2 text-sm text-text-secondary">
            <div className="flex items-center gap-2">
              <CalendarClock className="size-4 shrink-0 text-text-muted" aria-hidden />
              <dt className="sr-only">When</dt>
              <dd>{formatEventWindow(event.startsAt, event.endsAt)}</dd>
            </div>
            {location && (
              <div className="flex items-center gap-2">
                <MapPin className="size-4 shrink-0 text-text-muted" aria-hidden />
                <dt className="sr-only">Where</dt>
                <dd>{location}</dd>
              </div>
            )}
          </dl>
        </Card>

        {event.status === "open" ? (
          <Card className="flex flex-col gap-3">
            <h2 className="font-semibold text-text-primary">This room is open</h2>
            <p className="text-text-secondary">
              {player
                ? `You're set up as ${player.displayName}. Posting Flares and matching with other players arrives in the next release.`
                : "Joining the room — posting Flares and matching with other players — arrives in the next release."}
            </p>
            {!player && (
              <Link
                href="/play"
                className="text-sm text-accent underline underline-offset-4"
              >
                Set up your player name now
              </Link>
            )}
          </Card>
        ) : (
          <Card className="flex flex-col gap-2">
            <h2 className="font-semibold text-text-primary">
              {event.status === "draft" ? "Not open yet" : "This event has finished"}
            </h2>
            <p className="text-text-secondary">
              {event.status === "draft"
                ? "The store hasn't opened this room yet. Try again once the event starts."
                : "Thanks for coming. Ask the store about their next event."}
            </p>
          </Card>
        )}
      </div>
    </main>
  );
}
