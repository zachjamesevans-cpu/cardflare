import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { BinderView } from "@/components/binder/binder-page";
import { AppShell } from "@/components/layout/app-shell";
import { PlayerTabBar, TabBarSpacer } from "@/components/players/player-tab-bar";
import { BackLink } from "@/components/ui/back-link";
import { areasForUser } from "@/lib/auth/areas";
import { getViewer } from "@/lib/auth/session";
import { readBinder } from "@/lib/binder/binder";
import { cardImagesEnabled } from "@/lib/cards/images";
import { pagesLeftToday, queuesFor } from "@/lib/cards/page-jobs";
import { scannerAccess } from "@/lib/cards/scan";
import { playerForUser } from "@/lib/players/accounts";
import { listPlayerGames } from "@/lib/players/games";
import { needsSetup } from "@/lib/players/profile";

export const metadata: Metadata = {
  title: "Your binder",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
/* Sending a scanned page reads it after the response, in this page's
   function: a careful read of a page can take a few minutes. */
export const maxDuration = 300;

/** A queue's id, as the notice's link carries it. */
const QUEUE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One of your own binders, open, with the tools under it.
 *
 * `binderId` is the binder's id; one that is nobody's is a 404. The
 * same screen a visitor gets at /p/<you>/binders/<id>, plus the "+"
 * pockets, hold to move, the Remove drop and the settings behind the
 * pencil, because `readBinder` knows it is you looking. The line under the title (up for trade, or
 * private) is the page's own, following the switch as it is flipped.
 * The app's Binder screen with no playerId draws the same.
 *
 * The card scanner's door is read here, with the binder, so the Add
 * cards sheet opens already knowing whether to draw it; so are the
 * pages out being read on this binder, for their banner, and the pages
 * left today. `?scan=<batchId>`, the "pages ready" notice's link, opens
 * the binder with that queue's check open.
 */
export default async function OwnBinderPage({
  params,
  searchParams,
}: {
  params: Promise<{ binderId: string }>;
  searchParams: Promise<{ scan?: string | string[] }>;
}) {
  const viewer = await getViewer();
  const { binderId } = await params;
  const { scan } = await searchParams;
  const openScan = typeof scan === "string" && QUEUE_ID.test(scan) ? scan : null;
  if (viewer.kind === "anonymous") {
    const here = `/profile/binders/${binderId}${openScan ? `?scan=${openScan}` : ""}`;
    redirect(`/login?next=${encodeURIComponent(here)}`);
  }

  const playerId =
    viewer.kind === "player"
      ? viewer.playerId
      : ((await playerForUser(viewer.user.id))?.id ?? null);
  if (!playerId) redirect("/profile/settings");
  if (await needsSetup(playerId)) redirect("/welcome");

  const who = { playerId, userId: viewer.user.id };
  const [binder, games, areas, scanAccess, queues] = await Promise.all([
    readBinder(playerId, playerId, binderId),
    listPlayerGames(playerId),
    areasForUser(viewer.user.id, viewer.kind === "admin"),
    scannerAccess({ playerId, userId: viewer.user.id }),
    queuesFor(who, binderId),
  ]);
  if (!binder) notFound();
  /* Only somebody who can scan has pages to count. */
  const left = scanAccess === "on" ? await pagesLeftToday(who) : 0;

  return (
    <>
      <AppShell
        area="Profile"
        email={viewer.user.email ?? ""}
        title={binder.name}
        areas={areas}
        currentArea={
          areas.some((area) => area.href === "/profile") ? "/profile" : undefined
        }
      >
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
          <BackLink href="/profile?tab=binders" />

          {/* The shell names the page; the view draws the line under it. */}
          <BinderView
            binder={binder}
            imagesEnabled={cardImagesEnabled()}
            playerGames={games}
            title={null}
            scanAccess={scanAccess}
            pageQueues={{ queues, left }}
            openScan={openScan}
          />

          <TabBarSpacer />
        </div>
      </AppShell>

      <PlayerTabBar />
    </>
  );
}
