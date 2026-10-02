import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { BinderList } from "@/components/binder/binder-list";
import { CreateBinder } from "@/components/binder/create-binder";
import { AppShell } from "@/components/layout/app-shell";
import { PlayerTabBar, TabBarSpacer } from "@/components/players/player-tab-bar";
import { areasForUser } from "@/lib/auth/areas";
import { getViewer } from "@/lib/auth/session";
import { listBinders } from "@/lib/binder/binder";
import { playerForUser } from "@/lib/players/accounts";
import { needsSetup } from "@/lib/players/profile";

export const metadata: Metadata = {
  title: "Your binders",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Every binder you keep, as a list, behind the Binders door in the
 * profile's icon row.
 *
 * The Trade binder first, then the custom ones in your order. "New
 * binder" at the top starts a custom one with the same dialog the
 * highlights row's "+" opens. A row opens the binder. The app's
 * Binders screen with no playerId draws the same.
 */
export default async function OwnBindersPage() {
  const viewer = await getViewer();
  if (viewer.kind === "anonymous") redirect("/login?next=/profile/binders");

  const playerId =
    viewer.kind === "player"
      ? viewer.playerId
      : ((await playerForUser(viewer.user.id))?.id ?? null);
  if (!playerId) redirect("/profile/settings");
  if (await needsSetup(playerId)) redirect("/welcome");

  const [binders, areas] = await Promise.all([
    listBinders(playerId, playerId),
    areasForUser(viewer.user.id, viewer.kind === "admin"),
  ]);

  return (
    <>
      <AppShell
        area="Profile"
        email={viewer.user.email ?? ""}
        title="Your binders"
        description="The Trade binder is what you will trade. The rest are yours to name."
        areas={areas}
        currentArea={
          areas.some((area) => area.href === "/profile") ? "/profile" : undefined
        }
      >
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/profile"
              className="inline-flex w-fit items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back to your profile
            </Link>
            <CreateBinder trigger="button" />
          </div>

          <BinderList binders={binders} ownerName="" yours base="/profile" />

          <TabBarSpacer />
        </div>
      </AppShell>

      <PlayerTabBar />
    </>
  );
}
