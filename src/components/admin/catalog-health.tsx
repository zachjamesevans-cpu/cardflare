import { CircleCheck, TriangleAlert } from "lucide-react";

import { Badge, Card } from "@/components/ui/card";
import type { FailureGroup, SetCoverage } from "@/lib/cards/health";

/**
 * Whether the imported catalog can be trusted.
 *
 * Two numbers answer that, and neither was visible without SQL: which sets are
 * present and how big each is, and what the last run threw away. A sync that
 * "succeeded" while rejecting a third of the provider's records is not a
 * success, and it looked identical to a clean one.
 */

function SetCoverageBlock({
  sets,
  truncated,
}: {
  sets: SetCoverage[];
  truncated: boolean;
}) {
  const total = sets.reduce((sum, set) => sum + set.cards, 0);

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-text-primary">Sets</h3>
        <Badge tone="neutral">
          {sets.length} {sets.length === 1 ? "set" : "sets"}
        </Badge>
      </div>

      {sets.length === 0 ? (
        <p className="text-sm text-text-secondary">
          Nothing imported yet. Run a sync above.
        </p>
      ) : (
        <>
          {/*
           * Scrolls inside itself. A catalog with thirty sets must not make the
           * admin page taller than the screen on a phone.
           */}
          <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
            {sets.map((set) => (
              <li
                key={set.setCode}
                className="flex items-center justify-between gap-4 text-sm"
              >
                <span className="truncate font-mono text-text-secondary">
                  {set.setCode}
                </span>
                <span className="shrink-0 text-text-muted tabular-nums">
                  {set.cards.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>

          <p className="border-t border-border pt-3 text-xs text-text-muted">
            {total.toLocaleString()} distinct cards across {sets.length} sets. Compare
            against the official set list before telling anyone the catalog is complete.
            {truncated &&
              " Counts are partial because the catalog exceeds the read limit."}
          </p>
        </>
      )}
    </Card>
  );
}

function FailureBlock({
  groups,
  total,
  truncated,
  recordsSeen,
}: {
  groups: FailureGroup[];
  total: number;
  truncated: boolean;
  recordsSeen: number;
}) {
  const clean = total === 0;
  const share = recordsSeen > 0 ? Math.round((total / recordsSeen) * 100) : 0;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-text-primary">Rejected by the last sync</h3>
        <Badge tone={clean ? "accent" : "neutral"}>
          {clean ? "None" : total.toLocaleString()}
        </Badge>
      </div>

      {clean ? (
        <p className="flex items-start gap-2 text-sm text-text-secondary">
          <CircleCheck
            className="mt-0.5 size-4 shrink-0 text-accent"
            aria-hidden="true"
          />
          <span>Every record the provider returned was usable.</span>
        </p>
      ) : (
        <>
          <p className="flex items-start gap-2 text-sm text-text-secondary">
            <TriangleAlert
              className="mt-0.5 size-4 shrink-0 text-warning"
              aria-hidden="true"
            />
            <span>
              {total.toLocaleString()} of {recordsSeen.toLocaleString()} records (
              {share}
              %) could not be used. They were skipped, never guessed at.
            </span>
          </p>

          <ul className="flex flex-col gap-4">
            {groups.map((group) => (
              <li key={group.reason} className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-4">
                  <span className="min-w-0 text-sm break-words text-text-secondary">
                    {group.reason}
                  </span>
                  <span className="shrink-0 text-sm text-text-muted tabular-nums">
                    ×{group.count.toLocaleString()}
                  </span>
                </div>

                {/*
                 * One rejected record, verbatim. The reason says a field was
                 * missing; only the payload says what the provider sent
                 * instead, which is the difference between "fix the mapping"
                 * and "these records have no card number at all".
                 *
                 * Collapsed by default — eight of these open would bury the
                 * rest of the console.
                 */}
                {group.example && (
                  <details className="group/example">
                    <summary className="cursor-pointer text-xs text-text-muted hover:text-text-secondary">
                      Show one rejected record
                    </summary>
                    <pre className="mt-2 max-h-64 overflow-auto rounded-[var(--radius-control)] border border-border bg-canvas p-3 font-mono text-xs leading-relaxed text-text-secondary">
                      {group.example}
                    </pre>
                  </details>
                )}
              </li>
            ))}
          </ul>

          <p className="border-t border-border pt-3 text-xs text-text-muted">
            Full payloads are in <code>card_sync_failures</code>.
            {truncated && " Only the first rows were read, so counts are partial."}
          </p>
        </>
      )}
    </Card>
  );
}

export function CatalogHealth({
  sets,
  setsTruncated,
  failures,
  recordsSeen,
}: {
  sets: SetCoverage[];
  setsTruncated: boolean;
  failures: { groups: FailureGroup[]; total: number; truncated: boolean };
  recordsSeen: number;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SetCoverageBlock sets={sets} truncated={setsTruncated} />
      <FailureBlock
        groups={failures.groups}
        total={failures.total}
        truncated={failures.truncated}
        recordsSeen={recordsSeen}
      />
    </div>
  );
}
