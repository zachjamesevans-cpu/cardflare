import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { BinderView } from "@/components/binder/binder-page";
import { AppShell } from "@/components/layout/app-shell";
import { PlayerTabBar, TabBarSpacer } from "@/components/players/player-tab-bar";
import { areasForUser } from "@/lib/auth/areas";
import { getViewer } from "@/lib/auth/session";
import { readBinder } from "@/lib/binder/binder";
import { cardImagesEnabled } from "@/lib/cards/images";
import { playerForUser } from "@/lib/players/accounts";
import { listPlayerGames } from "@/lib/players/games";
import { needsSetup } from "@/lib/players/profile";

export const metadata: Metadata = {
  title: "Your binder",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Your own binder, open, with the tools under it.
 *
 * The same screen a visitor gets at /p/<you>/binder, plus Add cards,
 * Edit and the settings strip, because `readBinder` knows it is you
 * looking. The app's Binder screen with no playerId draws the same.
 */
export default async function OwnBinderPage() {
  const viewer = await getViewer();
  if (viewer.kind === "anonymous") redirect("/login?next=/profile/binder");

  const playerId =
    viewer.kind === "player"
      ? viewer.playerId
      : ((await playerForUser(viewer.user.id))?.id ?? null);
  if (!playerId) redirect("/profile/settings");
  if (await needsSetup(playerId)) redirect("/welcome");

  const [binder, games, areas] = await Promise.all([
    readBinder(playerId, playerId),
    listPlayerGames(playerId),
    areasForUser(viewer.user.id, viewer.kind === "admin"),
  ]);
  if (!binder) redirect("/profile");

  return (
    <>
      <AppShell
        area="Profile"
        email={viewer.user.email ?? ""}
        title="Your binder"
        areas={areas}
        currentArea={
          areas.some((area) => area.href === "/profile") ? "/profile" : undefined
        }
      >
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
          <Link
            href="/profile"
            className="inline-flex w-fit items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to your profile
          </Link>

          <BinderView
            binder={binder}
            imagesEnabled={cardImagesEnabled()}
            playerGames={games}
            title={null}
          />

          <TabBarSpacer />
        </div>
      </AppShell>

      <PlayerTabBar />
    </>
  );
}
