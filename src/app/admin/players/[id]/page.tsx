import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PlayerActivity } from "@/components/admin/player-activity";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { playerTimeline } from "@/lib/admin/player-timeline";
import { requireAdmin } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Player activity",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * One player, and everything they did. The chrome lives here; the
 * body is `PlayerActivity`, drawn from the timeline alone.
 */
export default async function AdminPlayerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // The layout guards too. Duplicated deliberately: a layout is not a
  // security boundary on its own.
  await requireAdmin();

  const { id } = await params;
  const timeline = await playerTimeline(id);
  if (!timeline) notFound();

  const { player } = timeline;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Link
          href="/admin/players"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to players
        </Link>

        <div className="flex items-center gap-3">
          <PlayerAvatar
            displayName={player.displayName}
            seed={player.id}
            avatarUrl={player.avatarUrl}
            size="md"
          />
          <h2 className="min-w-0 text-xl font-bold text-text-primary">
            <span className="block truncate">{player.displayName}</span>
            {player.handle && (
              <span className="block truncate text-sm font-normal text-text-muted">
                @{player.handle}
              </span>
            )}
          </h2>
        </div>
      </div>

      <PlayerActivity timeline={timeline} />
    </div>
  );
}
