import { redirect } from "next/navigation";

import { TRADE_BINDER_ID } from "@/lib/binder/binder";

export const dynamic = "force-dynamic";

/**
 * A player's binder's old address. There is more than one binder now,
 * and the Trade binder lives at /p/<id>/binders/trade with the rest
 * of them, so a shared link from before goes there.
 */
export default async function OldPlayerBinderPage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = await params;
  redirect(`/p/${playerId}/binders/${TRADE_BINDER_ID}`);
}
