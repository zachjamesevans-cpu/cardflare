import Link from "next/link";
import { Flag } from "lucide-react";

import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { ago } from "@/lib/notifications/inbox-row";
import { REPORT_REASONS, type OpenReport, type ReportKind } from "@/lib/players/safety";
import { resolveReportAction } from "@/lib/players/safety-actions";

/**
 * Reports from players, newest first, until an admin marks each one
 * resolved.
 *
 * One row says who reported what and why, in their words when they
 * left any, with the door to the thing itself. Nothing automatic
 * happened to the reported player, so the only button is "Resolved":
 * the admin looked, did whatever was right, and this row is done.
 */

const KIND_WORD: Record<ReportKind, string> = {
  post: "a post",
  player: "a player",
  thread: "a conversation",
};

export function ReportQueue({ reports }: { reports: OpenReport[] }) {
  const reasonLabel = new Map(REPORT_REASONS.map((row) => [row.value, row.label]));

  return (
    <section id="queue" className="flex flex-col gap-4" aria-labelledby="queue-heading">
      <div className="flex items-center justify-between gap-4">
        <h3 id="queue-heading" className="text-lg font-bold text-text-primary">
          Reports from players
        </h3>
        <span className="text-sm text-text-muted tabular-nums">
          {reports.length} open
        </span>
      </div>

      <Card className="flex flex-col gap-3">
        {reports.length === 0 ? (
          <p className="text-sm text-text-muted">Nothing open.</p>
        ) : (
          <ul className="flex flex-col">
            {reports.map((report) => (
              <li
                key={report.id}
                className="flex flex-col gap-2 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-text-primary">
                    <Flag
                      className="size-3.5 shrink-0 text-warning"
                      aria-hidden="true"
                    />
                    <Link
                      href={`/p/${report.reporter.playerId}`}
                      className="font-semibold underline-offset-4 hover:underline"
                    >
                      {report.reporter.displayName}
                    </Link>
                    <span className="text-text-secondary">
                      reported {KIND_WORD[report.kind]}
                      {report.target && report.kind !== "player"
                        ? ` by ${report.target.displayName}`
                        : report.target
                          ? `, ${report.target.displayName}`
                          : ""}
                    </span>
                    <span className="rounded-full border border-border bg-elevated px-2 py-0.5 text-xs font-medium text-text-secondary">
                      {reasonLabel.get(report.reason) ?? report.reason}
                    </span>
                    <span className="text-xs text-text-muted">
                      {ago(report.createdAt)}
                    </span>
                  </p>
                  {report.note && (
                    <p className="text-sm break-words whitespace-pre-line text-text-secondary">
                      {report.note}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  <Link
                    href={report.href}
                    className="text-sm font-semibold text-accent underline-offset-4 hover:underline"
                  >
                    Open
                  </Link>
                  <form action={resolveReportAction}>
                    <input type="hidden" name="reportId" value={report.id} />
                    <SubmitButton
                      label="Resolved"
                      pendingLabel="Closing…"
                      variant="secondary"
                      size="sm"
                    />
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
