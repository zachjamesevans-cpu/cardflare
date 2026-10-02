import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { BinderList } from "@/components/binder/binder-list";
import { CreateBinder } from "@/components/binder/create-binder";
import { TabPageShell } from "@/components/players/tab-page-shell";
import { getViewer } from "@/lib/auth/session";
import { playerForUser } from "@/lib/players/accounts";
import { publicProfile } from "@/lib/players/profile";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ playerId: string }>;
}): Promise<Metadata> {
  const { playerId } = await params;
  const profile = await publicProfile(playerId);
  const robots = { index: false, follow: false };

  if (!profile) return { title: "Binders", robots };

  return { title: `${profile.displayName}'s binders`, robots };
}

export const dynamic = "force-dynamic";

/**
 * Somebody's binders, as a list, behind the Binders door on their
 * profile.
 *
 * Only the ones they chose to show: the profile read hands over the
 * public binders for a visitor, the Trade binder first, and every one
 * of them for the owner arriving by their own public link. A visitor
 * whose every door is shut sees the page say so rather than nothing.
 * The app's Binders screen with a playerId draws the same.
 */
export default async function PlayerBindersPage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const viewer = await getViewer();
  const { playerId } = await params;

  const me =
    viewer.kind === "player"
      ? viewer.playerId
      : viewer.kind === "anonymous"
        ? null
        : ((await playerForUser(viewer.user.id))?.id ?? null);

  const profile = await publicProfile(playerId, me);
  if (!profile) notFound();

  const yours = me === playerId;
  const name = yours ? "Your binders" : `${profile.displayName}'s binders`;

  return (
    <TabPageShell title={name}>
      <Link
        href={`/p/${playerId}`}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to {yours ? "your profile" : profile.displayName}
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold text-text-primary">{name}</h2>
        {yours && <CreateBinder trigger="button" />}
      </div>

      {profile.binders.length === 0 ? (
        <p className="text-sm text-text-muted">No binders to open.</p>
      ) : (
        <BinderList
          binders={profile.binders}
          ownerName={profile.displayName}
          yours={yours}
          base={`/p/${playerId}`}
        />
      )}
    </TabPageShell>
  );
}
