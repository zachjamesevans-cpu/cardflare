"use server";

import { requireAdmin } from "@/lib/auth/session";
import { generateSetupLink } from "@/lib/auth/invite-link";
import { sendEmail } from "@/lib/email/client";
import { passwordResetEmail } from "@/lib/email/store-invite";
import { text } from "@/lib/form-value";
import { updateSignInEmail, userIdForPlayer } from "@/lib/admin/records";
import { siteUrl } from "@/lib/site";
import { handleSchema } from "./handle";
import { setIdentity } from "./profile";
import { displayNameSchema, type AdminAccountState } from "./profile-schema";

/**
 * The support desk, in the console.
 *
 * The founder's ask, after a player wrote in: "be able to change
 * username, email, reset password link, etc. in admin console." All
 * three are the same job — somebody cannot get into their own account
 * and needs a human to unstick it — and doing any of them through the
 * Supabase dashboard means an admin reading raw auth tables to help
 * with a typo.
 *
 * Admin only, re-checked inside every action. These change other
 * people's credentials, so the check is never inherited from the page
 * that rendered the button.
 */

const GENERIC = "That didn't work. Try again in a moment.";

/** Renames a player and moves their handle, exactly as they could. */
export async function adminSetIdentityAction(
  _previous: AdminAccountState,
  formData: FormData,
): Promise<AdminAccountState> {
  await requireAdmin();

  const playerId = text(formData, "playerId");
  if (!playerId) return { status: "error", message: GENERIC };

  const name = displayNameSchema.safeParse({
    displayName: text(formData, "displayName"),
  });
  if (!name.success) {
    return {
      status: "error",
      message: name.error.issues[0]?.message ?? GENERIC,
    };
  }

  const handle = handleSchema.safeParse({ handle: text(formData, "handle") });
  if (!handle.success) {
    return {
      status: "error",
      message: handle.error.issues[0]?.message ?? GENERIC,
    };
  }

  const outcome = await setIdentity(
    playerId,
    name.data.displayName,
    handle.data.handle,
  );

  if (outcome === "taken") {
    return { status: "error", message: "Somebody already has that handle." };
  }
  if (outcome === "failed") return { status: "error", message: GENERIC };

  /*
   * Deliberately NO revalidatePath. Revalidating the current route makes
   * the action's response carry a full re-render of /admin/players — a
   * page heavy enough that the response blew its time budget, and the
   * admin watched a spinner stop with no message after the write had
   * already committed. The answer goes back immediately; the form calls
   * router.refresh() once the message is on screen.
   */

  return { status: "done", message: `Saved. They are @${handle.data.handle} now.` };
}

/**
 * Changes the address an account signs in with.
 *
 * Confirmed immediately rather than sending a verification mail: this
 * runs because somebody has already contacted support about an address
 * they cannot receive at, so mailing the new one and waiting is the
 * failure mode rather than the safeguard.
 */
export async function adminSetEmailAction(
  _previous: AdminAccountState,
  formData: FormData,
): Promise<AdminAccountState> {
  await requireAdmin();

  const playerId = text(formData, "playerId");
  const email = text(formData, "email").trim().toLowerCase();

  if (!playerId) return { status: "error", message: GENERIC };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { status: "error", message: "That does not look like an email address." };
  }

  const userId = await userIdForPlayer(playerId);
  if (!userId) return { status: "error", message: "That account has no sign-in yet." };

  /* The same helper the store console's own email change uses. One path
     into auth, so the "that address is taken" handling cannot drift. */
  const result = await updateSignInEmail(userId, email);

  if (!result.ok) {
    return {
      status: "error",
      message:
        result.reason === "email-taken"
          ? "Another account already uses that address."
          : GENERIC,
    };
  }

  /* No revalidatePath call, for the reason the rename gives above. */

  return { status: "done", message: `They sign in with ${email} now.` };
}

/**
 * Emails a fresh password link.
 *
 * The same one-click link an invitation carries — `generateSetupLink`
 * mints a Supabase recovery token and wraps it in our own URL, so this
 * works on whatever device opens it and shows cardflare.gg rather than a
 * supabase.co address.
 */
export async function adminSendResetAction(
  _previous: AdminAccountState,
  formData: FormData,
): Promise<AdminAccountState> {
  await requireAdmin();

  const playerId = text(formData, "playerId");
  const email = text(formData, "email").trim().toLowerCase();
  const displayName = text(formData, "displayName").trim() || "there";

  if (!playerId || !email) {
    return { status: "error", message: "That account has no address on file." };
  }

  const link = await generateSetupLink(email);

  if (!link) {
    return {
      status: "error",
      message: "Could not mint a link. They can still use the reset page themselves.",
    };
  }

  const sent = await sendEmail(passwordResetEmail(displayName, email, siteUrl(), link));

  if (sent.status === "failed") {
    console.error("Could not send the reset email", sent.reason);
    return {
      status: "error",
      message: "The link was made but the email did not send.",
    };
  }

  /* Said out loud rather than reported as success: a deployment with no
     mail provider would otherwise tell an admin a link went out. */
  if (sent.status === "skipped") {
    return {
      status: "error",
      message: "Email is not configured on this deployment, so nothing was sent.",
    };
  }

  return { status: "done", message: `Sent a password link to ${email}.` };
}
