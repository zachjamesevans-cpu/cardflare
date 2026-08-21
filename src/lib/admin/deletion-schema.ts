/**
 * What a delete takes with it.
 *
 * Free of server imports so the rules are testable, and separate from
 * the actions because a `"use server"` module may export nothing but
 * async functions.
 */
export interface Collateral {
  /** Plain English, for a person about to press a button. */
  label: string;
  count: number;
}

export interface DeletePreview {
  kind: "store" | "player";
  id: string;
  /** What the admin must type to confirm. The name, exactly. */
  name: string;
  collateral: Collateral[];
  /**
   * Reasons to stop, in the admin's words rather than the schema's.
   * Not blockers — a warning that can be overridden is honest, and a
   * blocker an admin cannot get past is a support ticket to nobody.
   */
  warnings: string[];
}

/**
 * Does what they typed match the name exactly?
 *
 * Trimmed, because a trailing space from a copy-paste is not a
 * different answer. Case-sensitive and otherwise exact, because the
 * whole point of the gesture is that it cannot be done by reflex.
 */
export function confirmsName(typed: string, name: string): boolean {
  return typed.trim() === name.trim() && name.trim().length > 0;
}

/** Only the parts that would actually lose something. */
export function realCollateral(collateral: Collateral[]): Collateral[] {
  return collateral.filter((entry) => entry.count > 0);
}

export interface DeleteState {
  status: "idle" | "deleted" | "error";
  message: string | null;
}

export const DELETE_IDLE: DeleteState = { status: "idle", message: null };
