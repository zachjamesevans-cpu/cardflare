"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/session";
import { text } from "@/lib/form-value";
import { clearVerdict, setVerdict } from "@/lib/cards/spot-check-verdicts";

/**
 * "Looks right", "Wrong", and "Check again" on a spot-check row. Admin
 * only; the user behind the session is who the verdict is signed by.
 */
export async function spotCheckVerdictAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();

  const cardId = text(formData, "cardId");
  const verdict = text(formData, "verdict");
  const note = text(formData, "note").trim().slice(0, 200) || null;
  if (!cardId) return;

  if (verdict === "clear") {
    await clearVerdict(cardId);
  } else if (verdict === "ok" || verdict === "wrong") {
    await setVerdict(cardId, verdict, note, user.id);
  } else {
    return;
  }

  revalidatePath("/admin/spot-check");
  revalidatePath("/admin");
}
