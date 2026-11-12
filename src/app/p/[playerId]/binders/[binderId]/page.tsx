import type { Metadata } from "next";
import { z } from "zod";

import { PublicBinder } from "@/components/binder/public-binder";
import { profileName } from "@/lib/players/profile";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ playerId: string }>;
}): Promise<Metadata> {
  const { playerId } = await params;
  /* The name alone: the page below reads the rest once. */
  const name = await profileName(playerId);
  const robots = { index: false, follow: false };

  if (!name) return { title: "Binder", robots };

  return { title: `${name}'s binder`, robots };
}

export const dynamic = "force-dynamic";

/** Somebody's binder, open, by owner and id. See `PublicBinder`. */
const nightSchema = z.guid();

export default async function PlayerBinderPage({
  params,
  searchParams,
}: {
  params: Promise<{ playerId: string; binderId: string }>;
  searchParams: Promise<{ night?: string | string[] }>;
}) {
  const [{ playerId, binderId }, { night }] = await Promise.all([params, searchParams]);
  /* ?night=<event id>: opened from a night's "Binders they're bringing". */
  const nightId = nightSchema.safeParse(night);
  return (
    <PublicBinder
      playerId={playerId}
      binderId={binderId}
      nightId={nightId.success ? nightId.data : null}
    />
  );
}
