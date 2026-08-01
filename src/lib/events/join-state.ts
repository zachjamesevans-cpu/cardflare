/**
 * Shared state for the typed-code form.
 *
 * Separate from `join-actions.ts` because a `"use server"` module may only
 * export async functions — a constant or a type alias in there is a build
 * error.
 */
export type JoinCodeState =
  { status: "idle" } | { status: "error"; message: string; code: string };

export const JOIN_CODE_IDLE: JoinCodeState = { status: "idle" };
