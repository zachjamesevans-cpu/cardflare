"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/session";
import { text } from "@/lib/form-value";
import { playerForUser } from "@/lib/players/accounts";
import { disputeTrade } from "@/lib/trades/repository";

/**
 * An admin takes a trade's Embers back from both sides. The trade stays
 * in the store's history, marked disputed, and no longer counts toward
 * either badge. There is no undo: the ledger row is the record.
 */
export async function disputeTradeAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const tradeId = text(formData, "tradeId");
  if (!tradeId) return;

  const note = text(formData, "note").slice(0, 200) || "Disputed by an admin";
  const admin = await playerForUser(user.id);

  await disputeTrade(tradeId, note, admin?.id ?? null);

  revalidatePath("/admin/reports");
}
