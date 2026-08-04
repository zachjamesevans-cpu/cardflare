/**
 * Shared types for the singles sync. Lives outside the "use server" file
 * because an actions module may only export async functions.
 */

export interface SyncOutcome {
  syncedAt: string;
  linesSeen: number;
  cardsMatched: number;
  linesUnmatched: number;
}

export type SyncSinglesState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | {
      status: "synced";
      outcome: SyncOutcome;
      /** A few unmatched labels so the store recognises what fell out. */
      unmatchedSample: string[];
    };

export const SYNC_SINGLES_IDLE: SyncSinglesState = { status: "idle" };

/** How many unmatched examples the response shows before just counting. */
export const UNMATCHED_SAMPLE = 5;
