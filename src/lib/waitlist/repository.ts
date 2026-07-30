import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { WaitlistSubmission } from "./schema";

/** Postgres unique-violation. Raised by the unique index on `email`. */
const UNIQUE_VIOLATION = "23505";

export type WaitlistInsertResult = { outcome: "created" } | { outcome: "duplicate" };

/**
 * Persists a signup.
 *
 * Throws on genuine infrastructure failures so the caller can render a retry
 * message; a duplicate email is an expected outcome, not an error.
 */
export async function insertWaitlistSignup(
  submission: WaitlistSubmission,
  source: string | null,
): Promise<WaitlistInsertResult> {
  const { error } = await getSupabaseAdmin().from("waitlist_signups").insert({
    first_name: submission.firstName,
    email: submission.email,
    user_type: submission.userType,
    primary_game: submission.primaryGame,
    city: submission.city,
    region: submission.region,
    store_name: submission.storeName,
    comment: submission.comment,
    marketing_consent: submission.marketingConsent,
    referral_code: submission.referralCode,
    source,
  });

  if (!error) return { outcome: "created" };
  if (error.code === UNIQUE_VIOLATION) return { outcome: "duplicate" };

  throw new Error(`Failed to insert waitlist signup: ${error.message}`, {
    cause: error,
  });
}
