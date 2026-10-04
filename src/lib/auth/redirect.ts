export const DEFAULT_SIGNED_IN_PATH = "/store";

/**
 * Where a signed-in visitor with nowhere particular to go should land.
 *
 * A player who opens /login while signed in (the app's footer link, an old
 * bookmark) is a player, and their home is the Feed. Sending them to /store
 * bounced them through the console's "no store" rule onto their profile,
 * two hops to the wrong page. Stores, admins and accounts with no profile
 * yet keep the console, which already knows what to do with each of them.
 */
export function signedInHome(kind: string): string {
  return kind === "player" ? "/feed" : DEFAULT_SIGNED_IN_PATH;
}

/**
 * Constrains a post-sign-in redirect to somewhere on this site.
 *
 * Without this, `?next=https://evil.example` would turn the sign-in flow into
 * an open redirect — a phishing page reached through a genuine cardflare.gg
 * link, borrowing its credibility. Protocol-relative `//host` is rejected too,
 * since browsers treat it as an absolute URL.
 *
 * Kept free of server-only imports so it is directly unit-testable.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next) return DEFAULT_SIGNED_IN_PATH;
  if (!next.startsWith("/")) return DEFAULT_SIGNED_IN_PATH;
  if (next.startsWith("//")) return DEFAULT_SIGNED_IN_PATH;
  // `/\evil.example` is normalised to a host by some browsers.
  if (next.startsWith("/\\")) return DEFAULT_SIGNED_IN_PATH;

  return next;
}
