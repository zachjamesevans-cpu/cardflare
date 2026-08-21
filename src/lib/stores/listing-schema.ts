/**
 * The listing controls' state, apart from the actions.
 *
 * A `"use server"` module may export nothing but async functions, so the
 * idle value lives here. See `tests/unit/server-action-exports.test.ts`.
 */
export interface ListingState {
  status: "idle" | "done" | "error";
  message: string | null;
}

export const LISTING_IDLE: ListingState = { status: "idle", message: null };
