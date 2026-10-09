/**
 * What a post of several cards actually did, in one line.
 *
 * A post used to answer `ok: true` and a count, and the composer said
 * "Posted" whether twenty cards went up or eighteen. Now the server
 * counts each card's outcome and both platforms say it the same way:
 * "Posted 18 of 20 · 2 were already up".
 *
 * The app keeps a byte-for-byte copy in mobile/src/post-summary.ts (the
 * app cannot import the website's modules); tests/unit/post-outcomes
 * fails if the two drift.
 */
export interface PostCounts {
  /** Cards asked for, after merging repeats. */
  total: number;
  posted: number;
  /** Already open from this account: skipped, not failed. */
  alreadyUp?: number;
  /** Cards whose own write failed while the rest went up. */
  failed?: number;
  /** A room's cap stopped the post; the cards past it were not tried. */
  atCap?: boolean;
}

/** Null when every card went up: the plain "Posted" says it all. */
export function postSummary(counts: PostCounts): string | null {
  const alreadyUp = counts.alreadyUp ?? 0;
  const failed = counts.failed ?? 0;
  const untried = Math.max(0, counts.total - counts.posted - alreadyUp - failed);
  if (counts.posted >= counts.total) return null;

  const parts = [`Posted ${counts.posted} of ${counts.total}`];
  if (alreadyUp > 0)
    parts.push(`${alreadyUp} ${alreadyUp === 1 ? "was" : "were"} already up`);
  if (failed > 0) parts.push(`${failed} could not be posted`);
  if (untried > 0)
    parts.push(
      counts.atCap
        ? `${untried} did not fit under the Flare cap`
        : `${untried} could not be posted`,
    );
  return parts.join(" · ");
}
