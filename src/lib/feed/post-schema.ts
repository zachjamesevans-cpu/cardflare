/**
 * What both clients know about a post's thread, free of server imports
 * so a client component can carry the type and the limit.
 */

/** A comment's ceiling. `posts.ts` enforces the same number. */
export const POST_COMMENT_MAX = 280;

export type CardState = "open" | "offered" | "found";

export interface PostComment {
  id: string;
  createdAt: string;
  playerId: string;
  displayName: string;
  avatarUrl: string | null;
  frame: string | null;
  ring: string | null;
  /** An offer line names the card it answers. */
  kind: "comment" | "offer";
  body: string;
  cardName: string | null;
}

/**
 * A comment as the website's thread draws it for one viewer: whether
 * the line is theirs (no Report on your own words) and whether they
 * may take it down (theirs, or any line under their own post).
 */
export interface ViewerComment extends PostComment {
  mine: boolean;
  deletable: boolean;
}
