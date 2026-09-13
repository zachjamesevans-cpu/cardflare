import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { AvatarForm } from "@/components/players/avatar-form";
import { CoverForm } from "@/components/players/cover-form";
import { PlayerTabBar, TabBarSpacer } from "@/components/players/player-tab-bar";
import { Card } from "@/components/ui/card";
import { areasForUser } from "@/lib/auth/areas";
import { getViewer } from "@/lib/auth/session";
import { playerForUser } from "@/lib/players/accounts";
import { resolveEquipped } from "@/lib/players/cosmetics";
import { dressedEquipsFor, wornArtFor } from "@/lib/players/equips";
import { formatHandle } from "@/lib/players/handle";
import { needsSetup, ownProfile } from "@/lib/players/profile";
import { tierAllows } from "@/lib/tiers";

export const metadata: Metadata = {
  title: "Edit profile",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Edit profile: what Instagram opens from the button of that name.
 *
 * The picture and the cover used to sit as forms on the profile
 * itself. Now the profile shows them and this page changes them, so
 * the profile reads the way anybody else's does. Name and handle stay
 * in settings, one link down.
 */
export default async function EditProfilePage() {
  const viewer = await getViewer();
  if (viewer.kind === "anonymous") redirect("/login?next=/profile/edit");

  const playerId =
    viewer.kind === "player"
      ? viewer.playerId
      : ((await playerForUser(viewer.user.id))?.id ?? null);
  if (!playerId) redirect("/profile/settings");
  if (await needsSetup(playerId)) redirect("/welcome/username");

  const profile = await ownProfile(playerId);
  if (!profile) redirect("/profile/settings");

  const [worn, dressed, areas] = await Promise.all([
    resolveEquipped(profile.equipped),
    dressedEquipsFor(playerId),
    areasForUser(viewer.user.id, viewer.kind === "admin"),
  ]);
  const dressedArt = await wornArtFor(dressed);

  return (
    <>
      <AppShell
        area="Profile"
        email={viewer.user.email ?? ""}
        title="Edit profile"
        description="Your picture and your cover. Name and handle are in settings."
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

          <Card className="flex flex-col items-center gap-4 text-center">
            <p className="font-semibold text-text-primary">Picture</p>
            <AvatarForm
              displayName={profile.displayName}
              seed={profile.playerId}
              avatarUrl={profile.avatarUrl}
              frame={worn.avatarFrame}
              ring={dressed.ring}
              aura={dressed.aura}
              ringArt={dressedArt.ring}
              auraArt={dressedArt.aura}
              animatedAllowed={tierAllows(profile.tier, "animatedAvatar")}
            />
          </Card>

          <Card className="flex flex-col gap-3">
            <p className="font-semibold text-text-primary">Cover</p>
            <CoverForm coverUrl={profile.coverUrl} />
          </Card>

          <Link
            href="/profile/settings"
            className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow-card)] transition-colors hover:border-border-strong"
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="font-semibold text-text-primary">Name and handle</span>
              <span className="truncate text-sm text-text-secondary">
                {profile.displayName} · {formatHandle(profile.handle)}
              </span>
            </span>
            <ChevronRight
              className="size-4 shrink-0 text-text-muted"
              aria-hidden="true"
            />
          </Link>

          <TabBarSpacer />
        </div>
      </AppShell>

      <PlayerTabBar />
    </>
  );
}
