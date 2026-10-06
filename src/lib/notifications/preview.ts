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
