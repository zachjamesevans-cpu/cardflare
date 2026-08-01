import type { SyncMode } from "@/lib/supabase/types";

/**
 * Shape of the admin catalog-sync form, and the pure parsing around it.
 *
 * Kept free of server-only imports for the same reason as
 * `src/lib/waitlist/form-data.ts`: the rules that decide whether a full sync
 * is permitted are the interesting part, and they should be testable without
 * a database or a network.
 */

export interface SyncCounts {
  recordsSeen: number;
  uniqueCards: number;
  cardsUpserted: number;
  printingsUpserted: number;
  recordsFailed: number;
}

export type SyncActionState =
  | { status: "idle" }
  /** The run finished. `counts` is what the database actually received. */
  | { status: "success"; mode: SyncMode; runId: string | null; counts: SyncCounts }
  /** Refused before contacting the provider — bad input, not signed in, busy. */
  | { status: "error"; message: string }
  /**
   * The run started and then failed. Separated from `error` because the
   * catalog may be partially written, which changes what to do next.
   */
  | { status: "failed"; message: string };

export const SYNC_IDLE: SyncActionState = { status: "idle" };

/**
 * Reads the mode, refusing anything the enum does not name.
 *
 * A Server Action is a public POST endpoint: the select in the form narrows
 * nothing. An unrecognised value is rejected rather than defaulted, so a typo
 * in the client never silently becomes a full catalog pull.
 */
export function parseSyncMode(value: unknown): SyncMode | null {
  return value === "sample" || value === "full" ? value : null;
}

/**
 * Whether a full run may proceed.
 *
 * Full mode pulls the provider's entire catalog from a free service that asked
 * not to be hammered, so it needs a deliberate second act — the same `--confirm`
 * the command line requires. Sample mode never does.
 */
export function fullSyncPermitted(mode: SyncMode, confirmation: unknown): boolean {
  return mode === "sample" || confirmation === "on";
}

/** One line summarising a finished run, for the status region and for tests. */
export function describeCounts(counts: SyncCounts): string {
  const parts = [
    `${counts.recordsSeen} record${counts.recordsSeen === 1 ? "" : "s"} seen`,
    `${counts.uniqueCards} unique card${counts.uniqueCards === 1 ? "" : "s"}`,
    `${counts.cardsUpserted} written`,
    `${counts.printingsUpserted} printing${counts.printingsUpserted === 1 ? "" : "s"}`,
  ];

  if (counts.recordsFailed > 0) {
    parts.push(`${counts.recordsFailed} rejected`);
  }

  return parts.join(", ");
}
