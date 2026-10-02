import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Somebody's binder list at its old address. The binders are a tab on
 * their profile now, sliding in place under the strip, so a link from
 * before lands on the profile with that tab open. The binder pages
 * under here, /p/<id>/binders/<id>, are where they were.
 */
export default async function OldPlayerBindersPage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = await params;
  redirect(`/p/${playerId}?tab=binders`);
}
