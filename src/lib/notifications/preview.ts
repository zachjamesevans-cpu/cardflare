/**
 * A notice's preview line, cut to fit without cutting a character.
 *
 * `String.slice` counts UTF-16 units, so a cut through an emoji leaves
 * half a surrogate pair on the end, which a phone draws as a broken box.
 * Counting by code point keeps every character whole.
 */
export function truncatePreview(body: string, max = 120): string {
  const chars = Array.from(body);
  if (chars.length <= max) return body;
  return `${chars.slice(0, max - 1).join("")}…`;
}

/**
 * Where a comment notice lands: the post itself. The website's Feed
 * ignores the query and shows the Feed; the app opens the post.
 */
export function postHref(postId: string): string {
  return `/feed?post=${encodeURIComponent(postId)}`;
}

/* The app's share sheet sends a post inside a message as a last line,
   `cardflare://post/<id>` (mobile/src/post-link.ts). The app draws the
   post there; everywhere else the line would read as a raw link. */
const POST_LINE = /\n?cardflare:\/\/post\/[0-9a-f-]{36}\s*$/i;

/** A message's words with the shared-post line taken off, and the post id. */
export function splitSharedPost(body: string): { text: string; postId: string | null } {
  const match = body.match(POST_LINE);
  if (!match) return { text: body, postId: null };
  const postId = match[0].trim().slice("cardflare://post/".length).toLowerCase();
  return { text: body.slice(0, match.index).trim(), postId };
}

/** A message notice's line: its words, or "Sent a post" when a post was all. */
export function messagePreview(body: string): string {
  const { text, postId } = splitSharedPost(body);
  return truncatePreview(postId && !text ? "Sent a post" : text);
}

/**
 * A Messages list line: its words without the post line (which the
 * server's preview may have cut part-way), or "Sent a post" when the
 * post was all there was. The website's copy of the app's helper.
 */
export function previewWithoutPostLink(preview: string): string {
  const cut = preview.search(/cardflare:\/\/\S*$/i);
  if (cut === -1) return preview;
  return preview.slice(0, cut).trim() || "Sent a post";
}
