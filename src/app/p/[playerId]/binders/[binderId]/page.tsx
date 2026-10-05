import type { Metadata } from "next";

import { PublicBinder } from "@/components/binder/public-binder";
import { publicProfile } from "@/lib/players/profile";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ playerId: string }>;
}): Promise<Metadata> {
  const { playerId } = await params;
  const profile = await publicProfile(playerId);
  const robots = { index: false, follow: false };

  if (!profile) return { title: "Binder", robots };

  return { title: `${profile.displayName}'s binder`, robots };
}

export const dynamic = "force-dynamic";

/** Somebody's binder, open, by owner and id. See `PublicBinder`. */
export default async function PlayerBinderPage({
  params,
}: {
  params: Promise<{ playerId: string; binderId: string }>;
}) {
  const { playerId, binderId } = await params;
  return <PublicBinder playerId={playerId} binderId={binderId} />;
}
