import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Flame } from "lucide-react";

import { MatchList } from "@/components/events/match-list";
import { NightShell } from "@/components/events/night-header";
import { AccountPitch } from "@/components/players/account-pitch";
import { getViewer } from "@/lib/auth/session";
import { cardImagesEnabled } from "@/lib/cards/images";
import { isValidJoinCode, normalizeJoinCode } from "@/lib/events/join-code";
import {
  huntingHereLine,
  MATCHES_FOR_YOU,
  matchesForYouLine,
  wantYoursLine,
} from "@/lib/events/night-copy";
import { nightMatches } from "@/lib/events/night-matches";
import { resolveCode } from "@/lib/events/rooms";
import { boardReadable, roomPhase } from "@/lib/events/schema";
import { playerForUser } from "@/lib/players/accounts";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Matches for you",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * See all matches: every match Cardflare found for this viewer at this
 * night, past the three the night page shows inline.
 *
 * The founder (2026-10-03): "The system continually answers: WHAT CAN
 * I TRADE HERE? WHO HAS WHAT I NEED? WHO WANTS WHAT I HAVE?" This page
 * is those three answers in full: the mutual matches, then who has
 * what you want, then who wants what you have. A guest gets the
 * sign-in pitch, since matching runs on an account's wants and binder.
 * The app's NightMatches screen draws the same lists.
 */
export default async function NightMatchesPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const normalized = normalizeJoinCode(decodeURIComponent(code));
  if (!isValidJoinCode(normalized)) notFound();
  if (!isSupabaseConfigured()) redirect(`/e/${normalized}`);

  const resolved = await resolveCode(normalized);
  if (resolved.outcome === "not-found") notFound();
  /* A code with no night behind it has nothing to match against. */
  if (resolved.outcome !== "room") redirect(`/e/${normalized}`);

  const event = resolved.room;
  if (!boardReadable(roomPhase(event))) redirect(`/e/${normalized}`);

  const viewer = await getViewer();
  const playerId =
    viewer.kind === "player"
      ? viewer.playerId
      : viewer.kind === "anonymous"
        ? null
        : ((await playerForUser(viewer.user.id))?.id ?? null);

  const back = (
    <Link
      href={`/e/${normalized}`}
      className="inline-flex items-center gap-1.5 text-sm text-text-secondary underline-offset-4 hover:underline"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {event.name}
    </Link>
  );

  if (!playerId) {
    return (
      <NightShell>
        {back}
        <AccountPitch next={`/e/${normalized}/matches`} variant="join" />
      </NightShell>
    );
  }

  const matches = await nightMatches(event.id, playerId);
  const { summary } = matches;

  return (
    <NightShell wide>
      {back}

      <header className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-xl font-bold text-text-primary">
          <Flame className="size-5 text-accent" aria-hidden="true" />
          {summary.total > 0 ? matchesForYouLine(summary.total) : MATCHES_FOR_YOU}
        </h1>
        {summary.total > 0 && (
          <ul className="flex flex-col text-sm text-text-secondary">
            {summary.cardsHuntingHere > 0 && (
              <li>{huntingHereLine(summary.cardsHuntingHere)}</li>
            )}
            {summary.playersWantYours > 0 && (
              <li>{wantYoursLine(summary.playersWantYours)}</li>
            )}
          </ul>
        )}
      </header>

      <MatchList
        matches={matches}
        code={normalized}
        imagesEnabled={cardImagesEnabled()}
        canMessage
      />
    </NightShell>
  );
}
