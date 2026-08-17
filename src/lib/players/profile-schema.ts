import { z } from "zod";

/**
 * Shared types for the profile actions.
 *
 * Outside the "use server" file because an actions module may export only
 * async functions, and free of server-only imports so the same schema can
 * be reasoned about in a unit test.
 */

export const displayNameSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Pick a name people will recognise across the table.")
    .max(40, "Keep the name under 40 characters."),
});

export type ProfileState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "saved"; message: string };

export const PROFILE_IDLE: ProfileState = { status: "idle" };

export type ShopState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "bought"; name: string }
  | { status: "equipped"; name: string };

export const SHOP_IDLE: ShopState = { status: "idle" };

/**
 * What a refused purchase says out loud.
 *
 * "Locked" and "too expensive" are told apart on purpose: one is solved
 * by trading more, the other by spending less, and a player who cannot
 * tell which will assume the shop is broken.
 */
export const BUY_REFUSALS: Record<string, string> = {
  unknown: "That item is not in the shop any more.",
  locked: "Trade a little more first. This one needs a higher lifetime total.",
  "too-expensive": "Not enough Embers yet. Confirm a few more trades.",
  unavailable: "Something went wrong. Please try again in a moment.",
};

/**
 * The setup wizard's one state.
 *
 * Here rather than beside its action because a "use server" module may
 * export only async functions — a const would fail the build.
 */
export type SetupState =
  | { status: "idle" }
  | { status: "error"; message: string; displayName: string; handle: string };

export const SETUP_IDLE: SetupState = { status: "idle" };
