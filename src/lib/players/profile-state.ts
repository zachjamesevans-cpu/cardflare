/*
 * The plain half of the profile rules: limits and the forms' idle
 * states. No zod here, because the profile's forms read these in the
 * browser, and a file with one schema in it costs every page that
 * touches it the whole validation library. profile-schema.ts re-exports
 * everything here beside the two schemas.
 */

/** The bio's ceiling. Mirrors `players_bio_length` in the migration. */
export const BIO_MAX = 150;
/** The pronouns' ceiling. Mirrors `players_pronouns_length`. */
export const PRONOUNS_MAX = 20;

export interface About {
  pronouns: string | null;
  bio: string | null;
}

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
  "not-pro": "Wearing cosmetics is a cardflare Pro feature.",
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

/**
 * What the console's account controls are showing.
 *
 * Here rather than beside the actions that produce it, and the reason is
 * the one at the top of this file: a `"use server"` module may export
 * ONLY async functions. Exporting this object from the actions file
 * built fine and then crashed the players page at request time, because
 * a client component importing a non-function across the server-action
 * boundary is a thing Next refuses to resolve.
 *
 * `tests/unit/server-action-exports.test.ts` now walks every `"use
 * server"` file in the repo so this cannot happen a third time.
 */
export type AdminAccountState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string };

export const ADMIN_ACCOUNT_IDLE: AdminAccountState = { status: "idle" };
