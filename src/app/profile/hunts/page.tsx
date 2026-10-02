import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { HuntsPanel } from "@/components/players/hunts-panel";
import { PlayerTabBar, TabBarSpacer } from "@/components/players/player-tab-bar";
import { areasForUser } from "@/lib/auth/areas";
import { getViewer } from "@/lib/auth/session";
import { playerForUser } from "@/lib/players/accounts";
import { huntLimitFor } from "@/lib/players/hunts";
import { needsSetup, ownProfile } from "@/lib/players/profile";

export const metadata: Metadata = {
  title: "Your hunts",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Your hunts, on a page of their own, behind the Hunts door in the
 * profile's icon row.
 *
 * The panel is the one the profile used to carry, with every row
 * drawn: starting a hunt, editing it, ticking copies off all happen
 * here. What moved is only where it lives, the founder's call: the
 * profile should read as "This is me as a trader", with the deeper
 * screens one tap in. The app's Hunts screen with no playerId draws
 * the same.
 */
export default async function OwnHuntsPage() {
  const viewer = await getViewer();
  if (viewer.kind === "anonymous") redirect("/login?next=/profile/hunts");

  const playerId =
    viewer.kind === "player"
      ? viewer.playerId
      : ((await playerForUser(viewer.user.id))?.id ?? null);
  if (!playerId) redirect("/profile/settings");

  /* Both guards at once: one roundtrip, not two in a row. */
  const [setupOwed, profile] = await Promise.all([
    needsSetup(playerId),
    ownProfile(playerId),
  ]);
  if (setupOwed) redirect("/welcome");
  if (!profile) redirect("/profile/settings");

  const areas = await areasForUser(viewer.user.id, viewer.kind === "admin");

  return (
    <>
      <AppShell
        area="Profile"
        email={viewer.user.email ?? ""}
        title="Your hunts"
        description="The named lists of cards you are looking for."
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

          <HuntsPanel hunts={profile.hunts} limit={huntLimitFor(profile.tier)} yours />

          <TabBarSpacer />
        </div>
      </AppShell>

      <PlayerTabBar />
    </>
  );
}
