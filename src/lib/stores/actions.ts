"use server";

import { revalidatePath } from "next/cache";

import { generateSetupLink } from "@/lib/auth/invite-link";
import { ensureAuthUser } from "@/lib/auth/provision";
import { getViewer } from "@/lib/auth/session";
import { text } from "@/lib/form-value";
import { sendEmail } from "@/lib/email/client";
import { storeInviteEmail } from "@/lib/email/store-invite";
import { siteUrl } from "@/lib/site";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { inviteStore } from "./repository";
import {
  inviteStoreSchema,
  toInviteFieldErrors,
  type InviteStoreState,
  type ResendSetupLinkState,
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
    kind: text(formData, "kind") || "lgs",
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
  const setupLink = await generateSetupLink(parsed.data.contactEmail);

  // The store exists from here on. Email failure must not read as failure to
  // invite — the admin can resend, and the account is already provisioned.
  const email = await sendEmail(
    storeInviteEmail(
      result.store.name,
      parsed.data.contactEmail,
      siteUrl(),
      setupLink,
      parsed.data.kind,
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

/**
 * Sends an invited store a fresh setup link.
 *
 * The invitation's button is single-use and expires (an hour, unless the
 * Supabase setting was raised), and inviting the same address again is
 * refused because it already has an invitation. So an owner who opened the
 * email the next morning had no way back that the founder could hand them.
 * This re-sends the invitation itself, with a new link, to the address the
 * invitation went to.
 */
export async function resendStoreSetupLinkAction(
  _previous: ResendSetupLinkState,
  formData: FormData,
): Promise<ResendSetupLinkState> {
  const viewer = await getViewer();
  if (viewer.kind !== "admin") return { status: "error", message: GENERIC_ERROR };

  const storeId = text(formData, "storeId");
  if (!storeId) return { status: "error", message: GENERIC_ERROR };

  const admin = getSupabaseAdmin();
  const [{ data: store }, { data: invites, error }] = await Promise.all([
    admin.from("stores").select("name, kind").eq("id", storeId).maybeSingle(),
    admin
      .from("store_invites")
      .select("email")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  if (error || !store) {
    if (error) console.error("Could not read the store's invitation", error.message);
    return { status: "error", message: GENERIC_ERROR };
  }

  const to = invites?.[0]?.email;
  if (!to) {
    return {
      status: "error",
      message:
        "This store has no invitation on record, so there is no address to send a link to.",
    };
  }

  /* An invitation from before accounts were made at invite time has no
     account to mint a link for yet. */
  await ensureAuthUser(to);
  const setupLink = await generateSetupLink(to);
  if (!setupLink) return { status: "error", message: GENERIC_ERROR };

  const sent = await sendEmail(
    storeInviteEmail(
      store.name,
      to,
      siteUrl(),
      setupLink,
      store.kind === "vendor" ? "vendor" : "lgs",
    ),
  );
  if (sent.status === "failed")
    console.error(`Setup link email failed: ${sent.reason}`);

  const outcome = sent.status === "skipped" ? "not-configured" : sent.status;
  return {
    status: "success",
    to,
    email: outcome,
    setupLink: outcome === "sent" ? null : setupLink,
  };
}
