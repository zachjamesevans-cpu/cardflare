"use server";

import { revalidatePath } from "next/cache";

import { generateSetupLink } from "@/lib/auth/invite-link";
import { getViewer } from "@/lib/auth/session";
import { text } from "@/lib/form-value";
import { sendEmail } from "@/lib/email/client";
import { storeInviteEmail } from "@/lib/email/store-invite";
import { siteUrl } from "@/lib/site";
import { inviteStore } from "./repository";
import {
  inviteStoreSchema,
  toInviteFieldErrors,
  type InviteStoreState,
} from "./schema";

const GENERIC_ERROR = "Something went wrong. Please try again in a moment.";

/**
 * Adds a store to the beta and emails its contact.
 *
 * The admin check happens here, not in the page that renders the form. A
 * Server Action is a public POST endpoint, so gating the UI gates nothing —
 * anyone could invoke this directly.
 */
export async function inviteStoreAction(
  _previous: InviteStoreState,
  formData: FormData,
): Promise<InviteStoreState> {
  const viewer = await getViewer();

  if (viewer.kind !== "admin") {
    // No detail about why. An unauthorised caller learns nothing about whether
    // the action exists or what it expects.
    return { status: "error", message: GENERIC_ERROR, fieldErrors: {} };
  }

  const parsed = inviteStoreSchema.safeParse({
    name: text(formData, "name"),
    contactEmail: text(formData, "contactEmail"),
    city: text(formData, "city"),
    region: text(formData, "region"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please fix the highlighted fields and try again.",
      fieldErrors: toInviteFieldErrors(parsed.error),
    };
  }

  let result;

  try {
    result = await inviteStore(parsed.data, viewer.user.id);
  } catch (error) {
    console.error("Could not invite the store", error);
    return { status: "error", message: GENERIC_ERROR, fieldErrors: {} };
  }

  if (result.outcome === "already-invited") {
    return {
      status: "error",
      message: "That email address already has a pending invitation.",
      fieldErrors: { contactEmail: "Already invited." },
    };
  }

  /*
   * The one-click link, minted before the email so it can go inside it. A
   * failure here is logged and carried as null: the invitation still sends,
   * and its fallback route — ask for a fresh link — is the flow every
   * invitation used before this one existed.
   */
  const setupLink = await generateSetupLink(result.store.contact_email);

  // The store exists from here on. Email failure must not read as failure to
  // invite — the admin can resend, and the account is already provisioned.
  const email = await sendEmail(
    storeInviteEmail(
      result.store.name,
      result.store.contact_email,
      siteUrl(),
      setupLink,
    ),
  );

  if (email.status === "failed") {
    console.error(`Store invitation email failed: ${email.reason}`);
  }

  revalidatePath("/admin");

  const outcome = email.status === "skipped" ? "not-configured" : email.status;

  return {
    status: "success",
    storeName: result.store.name,
    email: outcome,
    // Only when nothing was delivered — otherwise the store already has it.
    setupLink: outcome === "sent" ? null : setupLink,
  };
}
