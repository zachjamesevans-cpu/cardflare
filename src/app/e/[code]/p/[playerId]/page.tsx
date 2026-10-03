import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { NightShell } from "@/components/events/night-header";
import { NightPlayer } from "@/components/events/night-player";
import { getViewer } from "@/lib/auth/session";
import { cardImagesEnabled } from "@/lib/cards/images";
import { isValidJoinCode, normalizeJoinCode } from "@/lib/events/join-code";
import { nightPlayer } from "@/lib/events/night-matches";
import { resolveCode } from "@/lib/events/rooms";
import { boardReadable, roomPhase } from "@/lib/events/schema";
import { playerForUser } from "@/lib/players/accounts";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Player at this Night",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * A player, as this night sees them.
 *
 * The founder (2026-10-03): "Tapping the attendee opens their
 * event-facing profile... Prioritize trade information." So this is
 * not /p/<id> with its showcase and its followers: it is what they
 * have that you want, what they want that you have, Message, their
 * Flares at this night and the binders they will trade from. The
 * full profile is one tap further, behind their name's binders. 404
 * when they are not on this night's roster: a night-facing page about
 * somebody who is not at the night would be a page about nothing.
 */
export default async function NightPlayerPage({
  params,
}: {
  params: Promise<{ code: string; playerId: string }>;
}) {
  const { code, playerId } = await params;
  const normalized = normalizeJoinCode(decodeURIComponent(code));
  if (!isValidJoinCode(normalized)) notFound();
  if (!isSupabaseConfigured()) redirect(`/e/${normalized}`);

  const resolved = await resolveCode(normalized);
  if (resolved.outcome === "not-found") notFound();
  if (resolved.outcome !== "room") redirect(`/e/${normalized}`);

  const event = resolved.room;
  if (!boardReadable(roomPhase(event))) redirect(`/e/${normalized}`);

  const viewer = await getViewer();
  const me =
    viewer.kind === "player"
      ? viewer.playerId
      : viewer.kind === "anonymous"
        ? null
        : ((await playerForUser(viewer.user.id))?.id ?? null);

  const view = await nightPlayer(event.id, playerId, me);
  if (!view) notFound();

  return (
    <NightShell wide>
      <Link
        href={`/e/${normalized}`}
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary underline-offset-4 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {event.name}
      </Link>

      <NightPlayer
        view={view}
        imagesEnabled={cardImagesEnabled()}
        canMessage={Boolean(me) && me !== playerId}
      />
    </NightShell>
  );
}
