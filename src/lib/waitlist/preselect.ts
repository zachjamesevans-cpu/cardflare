import type { UserType } from "./schema";

/**
 * The anchor that jumps to the invite-request form and preselects a type.
 *
 * Ordinary links, so scrolling works with JavaScript disabled; the form reads
 * the fragment on mount and applies the preselection as an enhancement.
 *
 * The form lives on its own page since the homepage was shortened, so
 * the anchors carry the path: a bare fragment does nothing when the link
 * is rendered on a page that has no such element.
 */
export const INVITE_PATH = "/invite";
export const INVITE_SECTION_ID = "request-invite";
export const VENDOR_PILOT_ANCHOR_ID = "invite-vendor";
export const VENDOR_PILOT_ANCHOR = `${INVITE_PATH}#${VENDOR_PILOT_ANCHOR_ID}`;

/* Only vendors are sent here with a preselection: Max is by invitation,
   Ultra is self-serve at /ultra, so there is no store anchor. */
const ANCHOR_USER_TYPES: Record<string, UserType> = {
  [VENDOR_PILOT_ANCHOR_ID]: "vendor",
};

/** Maps a URL fragment to the user type it should preselect, if any. */
export function userTypeForHash(hash: string): UserType | null {
  return ANCHOR_USER_TYPES[hash.replace(/^#/, "")] ?? null;
}
