/**
 * A post, carried inside a message.
 *
 * The Feed's share sheet sends the note and then, on its own last line,
 * `cardflare://post/<id>`. The conversation reads that line back off and
 * draws the post in its place - the poster, the cards, a tap into it -
 * the way Instagram draws a shared post in a DM. Inside the words rather
 * than a field of its own so it travels through the server as it is
 * today; a build that does not know it shows the line as text.
 */

const PREFIX = "cardflare://post/";
const LINE = /\n?cardflare:\/\/post\/([0-9a-f-]{36})\s*$/i;

/** The line a shared post rides on. */
export const postLink = (postId: string): string => `${PREFIX}${postId}`;

/**
 * The Messages list's one line for a message: its words without the post
 * line - which the server's preview may have cut part-way - or "Sent a
 * post" when the post was all there was.
 */
export function previewWithoutPostLink(preview: string): string {
  const cut = preview.search(/cardflare:\/\/\S*$/i);
  if (cut === -1) return preview;
  return preview.slice(0, cut).trim() || "Sent a post";
}

/** A message's words with the post line taken off, and the post, if any. */
export function splitPostLink(body: string): { text: string; postId: string | null } {
  const match = body.match(LINE);
  if (!match) return { text: body, postId: null };
  return { text: body.slice(0, match.index).trim(), postId: match[1].toLowerCase() };
}
