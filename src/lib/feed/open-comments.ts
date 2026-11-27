/**
 * Asks a post on the page to open its comments and come into view:
 * "View offer" on a card you offered on, whose offer is a line in that
 * thread (posts.ts offerItems). The founder (2026-11-27): "should be
 * able to view the offer/ conversation from this screen with a button."
 */
export const OPEN_COMMENTS = "cf-open-comments";

export function openCommentsOf(postId: string): void {
  window.dispatchEvent(new CustomEvent(OPEN_COMMENTS, { detail: { postId } }));
}
