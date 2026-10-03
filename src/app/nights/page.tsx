import type { Metadata } from "next";

import { NightList, nightTabFrom } from "@/components/nights/night-list";
import { TabPageShell } from "@/components/players/tab-page-shell";
import { getViewer } from "@/lib/auth/session";
import { listNights } from "@/lib/events/nights";
import { playerForUser } from "@/lib/players/accounts";
import { NO_ORIGIN, originForPlayer } from "@/lib/players/location";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Nights",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The Nights tab, on the website.
 *
 * Room's slot in the dock. The founder: "Trying to keep our tabs to
 * our 'hero's'," and a night is the hero now that rooms open the
 * moment a store posts one. Every night at a store the player follows
 * or that is near them, every night they are going to wherever it is,
 * every live room at those stores, and the nights they went to in the
 * last month, behind Going | Nearby | Past.
 *
 * A Server Component that re-reads on load, the way the app's screen
 * pulls to refresh: a night is a thing that changes by the day, not
 * by the second, so there is no ticker here. The tab comes off the
 * address, so a shared link to Nearby opens on Nearby.
 */
export default async function NightsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const [viewer, { tab }] = await Promise.all([getViewer(), searchParams]);
  const playerId =
    viewer.kind === "player"
      ? viewer.playerId
      : viewer.kind === "anonymous"
        ? null
        : ((await playerForUser(viewer.user.id))?.id ?? null);

  /* Where "near you" is measured from: the saved ZIP, since a browser
     hands over no position without a prompt this page does not make. */
  const origin = playerId ? await originForPlayer(playerId, null) : NO_ORIGIN;

  const nights = isSupabaseConfigured() ? await listNights(playerId, origin.point) : [];

  return (
    <TabPageShell title="Nights">
      <NightList nights={nights} signedIn={Boolean(playerId)} tab={nightTabFrom(tab)} />
    </TabPageShell>
  );
}
