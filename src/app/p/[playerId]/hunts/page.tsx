import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { HuntsPanel } from "@/components/players/hunts-panel";
import { TabPageShell } from "@/components/players/tab-page-shell";
import { getViewer } from "@/lib/auth/session";
import { playerForUser } from "@/lib/players/accounts";
import { huntLimitFor } from "@/lib/players/hunts";
import { publicProfile } from "@/lib/players/profile";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ playerId: string }>;
}): Promise<Metadata> {
  const { playerId } = await params;
  const profile = await publicProfile(playerId);
  const robots = { index: false, follow: false };

  if (!profile) return { title: "Hunts", robots };

  return { title: `${profile.displayName}'s hunts`, robots };
}

export const dynamic = "force-dynamic";

/**
 * Somebody's hunts, behind the Hunts door on their profile.
 *
 * The same panel their profile used to carry: each hunt shut, saying
 * what is left, opening onto the list where a visitor picks the cards
 * they have and offers them. The owner, arriving by their own public
 * link, gets their tools, the same as /profile/hunts. The app's Hunts
 * screen with a playerId draws the same.
 */
export default async function PlayerHuntsPage({
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
  const name = yours ? "Your hunts" : `${profile.displayName}'s hunts`;

  return (
    <TabPageShell title={name}>
      <Link
        href={`/p/${playerId}`}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to {yours ? "your profile" : profile.displayName}
      </Link>

      <h2 className="text-lg font-extrabold text-text-primary">{name}</h2>

      {yours ? (
        <HuntsPanel hunts={profile.hunts} limit={huntLimitFor(profile.tier)} yours />
      ) : (
        <HuntsPanel hunts={profile.hunts} ownerName={profile.displayName} />
      )}
    </TabPageShell>
  );
}
