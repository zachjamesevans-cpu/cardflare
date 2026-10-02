import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Somebody's hunts at their old address. The hunts are a tab on their
 * profile now, sliding in place under the strip, so a link from before
 * lands on the profile with that tab open.
 */
export default async function OldPlayerHuntsPage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = await params;
  redirect(`/p/${playerId}?tab=hunts`);
}
