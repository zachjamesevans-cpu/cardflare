"use server";

import { revalidatePath } from "next/cache";

import { getViewer } from "@/lib/auth/session";
import { text } from "@/lib/form-value";
import { grantEmbers, setCosmeticsUnlocked } from "./grants";
import {
  grantEmbersSchema,
  unlockCosmeticsSchema,
  type GrantState,
} from "./grant-schema";

/**
 * Handing out Embers and unlocks from the console.
 *
 * Both re-establish admin from scratch. A Server Action is a public POST
 * endpoint, so hiding the form on a guarded page hides nothing — and
 * these two write to somebody else's account, which is exactly the
 * surface that must not trust its caller.
 *
 * A refused call says nothing specific, the same as the record editor:
 * an unauthorised caller learns neither that the action exists nor what
 * it wanted.
 */

const GENERIC_ERROR = "Something went wrong. Please try again in a moment.";
const REFUSED: GrantState = { status: "error", message: GENERIC_ERROR };

async function isAdmin(): Promise<boolean> {
  return (await getViewer()).kind === "admin";
}

export async function grantEmbersAction(
  _previous: GrantState,
  formData: FormData,
): Promise<GrantState> {
  if (!(await isAdmin())) return REFUSED;

  const parsed = grantEmbersSchema.safeParse({
    playerId: text(formData, "playerId"),
    amount: text(formData, "amount"),
    note: text(formData, "note"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? GENERIC_ERROR,
    };
  }

  const granted = await grantEmbers(
    parsed.data.playerId,
    parsed.data.amount,
    parsed.data.note,
  );

  if (!granted) return { status: "error", message: GENERIC_ERROR };

  revalidatePath("/admin/players");

  return {
    status: "granted",
    message: `${parsed.data.amount.toLocaleString()} Embers granted.`,
  };
}

export async function unlockCosmeticsAction(
  _previous: GrantState,
  formData: FormData,
): Promise<GrantState> {
  if (!(await isAdmin())) return REFUSED;

  const parsed = unlockCosmeticsSchema.safeParse({
    playerId: text(formData, "playerId"),
    unlocked: text(formData, "unlocked"),
  });

  if (!parsed.success) return { status: "error", message: GENERIC_ERROR };

  const saved = await setCosmeticsUnlocked(parsed.data.playerId, parsed.data.unlocked);
  if (!saved) return { status: "error", message: GENERIC_ERROR };

  revalidatePath("/admin/players");

  return {
    status: "granted",
    message: parsed.data.unlocked
      ? "Everything unlocked, including anything added later."
      : "Unlock removed. Anything they bought is still theirs.",
  };
}
