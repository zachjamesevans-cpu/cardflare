import type { UserType } from "./schema";

/**
 * Anchors that jump to the waitlist and preselect a user type.
 *
 * Ordinary links, so scrolling works with JavaScript disabled; the form reads
 * the fragment on mount and applies the preselection as an enhancement.
 *
 * Root-relative (`/#id`) for the same reason as the nav anchors in site.ts — a
 * bare fragment does nothing when the link is rendered on a page that has no
 * such element.
 */
export const WAITLIST_SECTION_ID = "waitlist";
export const STORE_PILOT_ANCHOR_ID = "waitlist-store-pilot";
export const STORE_PILOT_ANCHOR = `/#${STORE_PILOT_ANCHOR_ID}`;

const ANCHOR_USER_TYPES: Record<string, UserType> = {
  [STORE_PILOT_ANCHOR_ID]: "store",
};

/** Maps a URL fragment to the user type it should preselect, if any. */
export function userTypeForHash(hash: string): UserType | null {
  return ANCHOR_USER_TYPES[hash.replace(/^#/, "")] ?? null;
}
