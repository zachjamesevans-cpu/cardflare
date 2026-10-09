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
import { scannerAccess } from "@/lib/cards/scan";
import { playerForUser } from "@/lib/players/accounts";
import { listPlayerGames } from "@/lib/players/games";
import { needsSetup } from "@/lib/players/profile";

export const metadata: Metadata = {
  title: "Your binder",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

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
 * cards sheet opens already knowing whether to draw it.
 */
export default async function OwnBinderPage({
  params,
}: {
  params: Promise<{ binderId: string }>;
}) {
  const viewer = await getViewer();
  const { binderId } = await params;
  if (viewer.kind === "anonymous") {
    redirect(`/login?next=${encodeURIComponent(`/profile/binders/${binderId}`)}`);
  }

  const playerId =
    viewer.kind === "player"
      ? viewer.playerId
      : ((await playerForUser(viewer.user.id))?.id ?? null);
  if (!playerId) redirect("/profile/settings");
  if (await needsSetup(playerId)) redirect("/welcome");

  const [binder, games, areas, scanAccess] = await Promise.all([
    readBinder(playerId, playerId, binderId),
    listPlayerGames(playerId),
    areasForUser(viewer.user.id, viewer.kind === "admin"),
    scannerAccess({ playerId, userId: viewer.user.id }),
  ]);
  if (!binder) notFound();

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
          />

          <TabBarSpacer />
        </div>
      </AppShell>

      <PlayerTabBar />
    </>
  );
}
