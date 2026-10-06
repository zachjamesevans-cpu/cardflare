/**
 * How long ago, in the shortest true form. The one copy in the app.
 *
 * Under a minute is "now": the composer's preview is a post written
 * this second, and "1m ago" on it was a rounding, not a fact. The
 * website's `agoFrom` (src/components/feed/flare-feed-card.tsx) says
 * the same.
 *
 * A time that does not parse says nothing rather than "NaNd ago": a
 * missing timestamp is a data fault, and the line it sits in reads
 * fine without it. Pure TypeScript, so tests import it directly.
 */
export function agoFrom(iso: string | null | undefined, now = Date.now()): string {
  const at = iso ? Date.parse(iso) : Number.NaN;
  if (!Number.isFinite(at)) return "";

  const seconds = Math.max(0, (now - at) / 1000);
  if (seconds < 60) return "now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
