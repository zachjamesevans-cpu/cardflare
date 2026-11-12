/**
 * A read started ahead of the moment a page asks for its answer.
 *
 * A page that makes its decisions in order (a 404, a redirect, an early
 * screen) can still start the reads behind those decisions at once and
 * wait for each one where it always did, so the reads overlap and the
 * order of the decisions does not move. The read is handed back as it
 * is: waiting for it still throws whatever it threw. What this adds is
 * that a failure nobody went on to ask about, because the page had
 * already decided something else, passes quietly instead of as an
 * unhandled rejection.
 *
 * For reads only. A write started ahead would happen on pages that used
 * to return before reaching it.
 */
export function ahead<T>(read: Promise<T>): Promise<T> {
  read.catch(() => {});
  return read;
}
