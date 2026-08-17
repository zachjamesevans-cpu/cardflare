"use server";

import { revalidatePath } from "next/cache";

import { generateSetupLink } from "@/lib/auth/invite-link";
import { getViewer } from "@/lib/auth/session";
import { text } from "@/lib/form-value";
import { sendTestNotice } from "@/lib/notifications/notify";
import { emailForPlayer } from "@/lib/players/accounts";
import { grantEmbers, setCosmeticsUnlocked } from "./grants";
import {
  grantEmbersSchema,
  resetLinkSchema,
  testNoticeSchema,
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

/**
 * Fires one sample notification at a player, down the real rails.
 *
 * The only way to prove push works end to end without waiting for a
 * stranger to do something on a Friday night. Admin-only for the
 * obvious reason: this puts text on somebody else's lock screen.
 */
export async function sendTestNoticeAction(
  _previous: GrantState,
  formData: FormData,
): Promise<GrantState> {
  if (!(await isAdmin())) return REFUSED;

  const parsed = testNoticeSchema.safeParse({
    playerId: text(formData, "playerId"),
    kind: text(formData, "kind"),
  });

  if (!parsed.success) return { status: "error", message: GENERIC_ERROR };

  const sent = await sendTestNotice(parsed.data.playerId, parsed.data.kind);

  if (!sent.recorded) return { status: "error", message: GENERIC_ERROR };

  revalidatePath("/admin/players");

  return {
    status: "granted",
    message:
      sent.devices === 0
        ? "In the inbox. No phone is registered for this account yet, so nothing was pushed."
        : `Sent to ${sent.devices} ${sent.devices === 1 ? "device" : "devices"} and the inbox.`,
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
    scope: text(formData, "scope") || "live",
  });

  if (!parsed.success) return { status: "error", message: GENERIC_ERROR };

  const saved = await setCosmeticsUnlocked(
    parsed.data.playerId,
    parsed.data.unlocked,
    parsed.data.scope,
  );
  if (!saved) return { status: "error", message: GENERIC_ERROR };

  revalidatePath("/admin/players");

  if (!parsed.data.unlocked) {
    return {
      status: "granted",
      message: "Unlock removed. Anything they bought is still theirs.",
    };
  }

  return {
    status: "granted",
    message:
      parsed.data.scope === "everything"
        ? "Everything unlocked, the behind-the-scenes catalogue included."
        : "Every live cosmetic unlocked, including ones added later.",
  };
}

/**
 * Mints a one-time sign-in link for a player and hands it back.
 *
 * The founder's ask: "make their emails visible to me so, from the admin
 * side, I can update / reset password link to them if they reach out to
 * our support email." So the link is RETURNED, not sent — somebody
 * writing in from a second address, or locked out of the first one, is
 * exactly the case where mailing it to the account address helps nobody.
 *
 * The same `recovery` link the store invitations use, which works on an
 * account that has never had a password as well as one that has.
 */
export async function resetLinkAction(
  _previous: GrantState,
  formData: FormData,
): Promise<GrantState> {
  if (!(await isAdmin())) return REFUSED;

  const parsed = resetLinkSchema.safeParse({ playerId: text(formData, "playerId") });
  if (!parsed.success) return { status: "error", message: GENERIC_ERROR };

  const email = await emailForPlayer(parsed.data.playerId);
  if (!email) {
    return {
      status: "error",
      message: "No address on this account, so there is nothing to send them to.",
    };
  }

  const url = await generateSetupLink(email);
  if (!url) return { status: "error", message: GENERIC_ERROR };

  return {
    status: "link",
    message: `A one-time link for ${email}. It expires, and it signs in whoever opens it.`,
    url,
  };
}
