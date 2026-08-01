import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, MapPin } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { EventLobby } from "@/components/events/event-lobby";
import { JoinEventForm } from "@/components/events/join-event-form";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { Card } from "@/components/ui/card";
import { formatEventWindow } from "@/lib/events/format";
import { isValidJoinCode, normalizeJoinCode } from "@/lib/events/join-code";
import {
  findParticipation,
  listParticipants,
  touchParticipation,
} from "@/lib/events/participants";
import { findEventByJoinCode } from "@/lib/events/repository";
import { getPlayerSession } from "@/lib/players/session";
import { SITE } from "@/lib/site";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Join event",
  // A per-event page reached by scanning a printed code. Never indexed.
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main
      id="main"
      className="flex min-h-dvh flex-col items-center justify-center gap-8 px-5 py-16"
    >
      <Link href="/" aria-label={`${SITE.name} home`}>
        <Logo size={40} priority />
      </Link>
      <div className="flex w-full max-w-md flex-col gap-5">{children}</div>
    </main>
  );
}

/** Shown when the code is well-formed but cannot be checked right now. */
function Unavailable() {
  return (
    <Shell>
      <Card className="flex flex-col gap-2">
        <h1 className="text-xl font-bold text-text-primary">
          We can&rsquo;t check that code right now
        </h1>
        <p className="text-text-secondary">
          Nothing is wrong with the code on the sheet. Give it a moment and scan again.
        </p>
      </Card>
    </Shell>
  );
}

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
  if (!isSupabaseConfigured()) return <Unavailable />;

  const event = await findEventByJoinCode(normalized);
  if (!event) notFound();

  const session = await getPlayerSession();
  const participation = session ? await findParticipation(event.id, session.id) : null;

  // Being here is the heartbeat. Rate-limited inside, so a reload is not a write.
  if (session && participation) {
    await touchParticipation(event.id, session.id, participation.joinedAt);
  }

  const participants = participation ? await listParticipants(event.id) : [];
  const location = [event.storeCity, event.storeRegion].filter(Boolean).join(", ");

  return (
    <Shell>
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

      {event.status !== "open" ? (
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
      ) : participation && session ? (
        <>
          <Card className="flex items-center gap-3">
            <PlayerAvatar displayName={session.display_name} seed={session.id} />
            <div className="flex min-w-0 flex-col">
              <p className="text-sm text-text-muted">You&rsquo;re in as</p>
              <p className="truncate font-semibold text-text-primary">
                {session.display_name}
              </p>
            </div>
          </Card>

          <EventLobby
            code={normalized}
            participants={participants}
            youId={session.id}
          />

          <Card className="flex flex-col gap-2">
            <h2 className="font-semibold text-text-primary">What&rsquo;s next</h2>
            <p className="text-text-secondary">
              Posting the cards you need as Flares, and matching with people in this
              room who have them, arrives in the next release.
            </p>
            <Link
              href="/cards"
              className="text-sm text-accent underline underline-offset-4"
            >
              Search cards in the meantime
            </Link>
          </Card>
        </>
      ) : (
        <Card>
          <JoinEventForm code={normalized} knownAs={session?.display_name} />
        </Card>
      )}
    </Shell>
  );
}
