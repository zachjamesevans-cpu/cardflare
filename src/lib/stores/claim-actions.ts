"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/session";
import { submitClaim, decideClaim, type ClaimDecision } from "@/lib/stores/claims";
import { readClaim, validateClaim, type ClaimState } from "@/lib/stores/claim-schema";
import { LIMITS } from "@/lib/api/throttle";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientKey } from "@/lib/request-context";

/**
 * A shop owner asking for their listing.
 *
 * Open to anybody, signed in or not, and that is the point: the person
 * behind the counter at an unclaimed shop has no cardflare account, and
 * making them create one before they can say "this is mine" is a wall
 * in front of the exact door this feature exists to open.
 *
 * Which is also why nothing here is trusted. The store id comes from
 * the URL, every field is re-validated on the server, and the only
 * thing this writes is a row in a queue an admin reads. No client
 * payload can publish, verify, or hand over anything.
 */
export async function submitClaimAction(
  _previous: ClaimState,
  formData: FormData,
): Promise<ClaimState> {
  const storeId = String(formData.get("storeId") ?? "");
  const fields = readClaim(formData);
  const errors = validateClaim(fields);

  if (Object.keys(errors).length > 0) {
    return { status: "error", message: null, fields, errors };
  }

  if (
    !checkRateLimit(
      `claim:${await clientKey()}`,
      LIMITS.claim.limit,
      LIMITS.claim.windowMs,
    ).allowed
  ) {
    return {
      status: "error",
      message: "That is a lot of claims at once. Try again in a while.",
      fields,
      errors,
    };
  }

  const result = await submitClaim(storeId, fields);

  if (!result.ok) {
    return {
      status: "error",
      message: result.error ?? "Could not send that.",
      fields,
      errors: {},
    };
  }

  return {
    status: "sent",
    message: null,
    fields,
    errors: {},
  };
}

export interface DecisionState {
  status: "idle" | "done" | "error";
  message: string | null;
}

/**
 * An admin's answer to one claim.
 *
 * `requireAdmin` first, because a Server Action is a public POST
 * endpoint and this one hands somebody a business's public profile.
 */
export async function decideClaimAction(
  _previous: DecisionState,
  formData: FormData,
): Promise<DecisionState> {
  const admin = await requireAdmin();

  const claimId = String(formData.get("claimId") ?? "");
  const decision = String(formData.get("decision") ?? "") as ClaimDecision;

  if (!["approved", "rejected", "more-info"].includes(decision)) {
    return { status: "error", message: "Unknown decision." };
  }

  const result = await decideClaim(
    claimId,
    decision,
    admin.id,
    String(formData.get("reviewNote") ?? "").trim(),
  );

  if (!result.ok) {
    return { status: "error", message: result.error ?? "Could not save that." };
  }

  revalidatePath("/admin/stores");

  return {
    status: "done",
    message:
      decision === "approved"
        ? "Approved. The listing is theirs and their address is now the contact."
        : decision === "rejected"
          ? "Rejected. Nothing about the listing changed."
          : "Marked as needing more information.",
  };
}
