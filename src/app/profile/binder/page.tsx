import { redirect } from "next/navigation";

import { TRADE_BINDER_ID } from "@/lib/binder/binder";

export const dynamic = "force-dynamic";

/**
 * The binder's old address. There is more than one binder now, and
 * the Trade binder lives at /profile/binders/trade with the rest of
 * them, so a link from before goes there.
 */
export default function OldOwnBinderPage() {
  redirect(`/profile/binders/${TRADE_BINDER_ID}`);
}
