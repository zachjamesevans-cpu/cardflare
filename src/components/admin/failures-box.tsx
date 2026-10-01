import Link from "next/link";

import { Card } from "@/components/ui/card";
import type { Failure } from "@/lib/admin/failures";
import { ago } from "@/lib/notifications/inbox-row";

/**
 * What went wrong lately, at the top of the console.
 *
 * The audit found a failed Riftbound import and a three-week-old sync
 * at the bottom of a long page, presented as facts rather than as
 * problems. This leads with them: a red dot for a failure, an amber
 * one for a sync gone stale, and each row opens the place to fix it.
 * The blind spots are printed under the list, because a box that is
 * empty for things it cannot see is a box that lies.
 */
export function FailuresBox({
  failures,
  blindSpots,
}: {
  failures: Failure[];
  blindSpots: string[];
}) {
  return (
    <Card className="flex flex-col gap-4">
      {failures.length === 0 ? (
        <p className="text-sm text-text-secondary">
          Nothing failed in the last 30 days.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {failures.map((failure) => (
            <li key={`${failure.kind}:${failure.subject}:${failure.when}`}>
              <Link
                href={failure.href}
                className="flex items-start gap-3 py-3 first:pt-0 last:pb-0 hover:bg-elevated/60"
              >
                <span
                  className={`mt-1.5 size-2 shrink-0 rounded-full ${
                    failure.kind === "sync-stale" ? "bg-warning" : "bg-danger"
                  }`}
                  aria-hidden="true"
                />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="font-semibold text-text-primary">
                    {failure.subject}
                  </span>
                  <span className="text-sm break-words text-text-secondary">
                    {failure.detail}
                  </span>
                </span>
                {failure.when && (
                  <span className="shrink-0 text-xs text-text-muted tabular-nums">
                    {ago(failure.when)} ago
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {blindSpots.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-border pt-3">
          {blindSpots.map((line) => (
            <p key={line} className="text-xs text-text-muted">
              {line}
            </p>
          ))}
        </div>
      )}
    </Card>
  );
}
