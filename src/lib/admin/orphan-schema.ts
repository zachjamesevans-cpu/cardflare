/**
 * The attach form's state, apart from the action itself.
 *
 * A `"use server"` module may export nothing but async functions - every
 * export becomes a callable endpoint - so the idle value and its type
 * live here, the same split `account-schema.ts` makes for the same
 * reason. `tests/unit/server-action-exports.test.ts` enforces it.
 */
export interface AttachState {
  status: "idle" | "done" | "error";
  message: string | null;
}

export const ATTACH_IDLE: AttachState = { status: "idle", message: null };
