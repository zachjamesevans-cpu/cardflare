import { z } from "zod";

/**
 * What the console may hand out, and the shapes it has to arrive in.
 * Free of server-only imports so the rules can be tested without a
 * database, the same discipline as every other schema here.
 */

/**
 * A cap on a single grant.
 *
 * Not a policy about generosity — the admin can click twice — but a
 * guard against a slipped digit. Typing 100000 instead of 1000 into the
 * lifetime badge is not something the ledger can take back, because
 * `embers_earned` never goes down by design.
 */
export const GRANT_MAX = 10_000;

export const grantEmbersSchema = z.object({
  playerId: z.guid(),
  amount: z.coerce
    .number()
    .int("Whole Embers only.")
    .min(1, "Grant at least one Ember.")
    .max(GRANT_MAX, `One grant at a time, up to ${GRANT_MAX.toLocaleString()}.`),
  /** Shows up in the ledger, so the reason survives the moment. */
  note: z
    .string()
    .trim()
    .max(120, "Please keep the note under 120 characters.")
    .default(""),
});

export const unlockCosmeticsSchema = z.object({
  playerId: z.guid(),
  unlocked: z.enum(["true", "false"]).transform((value) => value === "true"),
});

export type GrantState =
  | { status: "idle" }
  | { status: "granted"; message: string }
  | { status: "error"; message: string };

export const GRANT_IDLE: GrantState = { status: "idle" };
