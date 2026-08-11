import { CheckCircle2 } from "lucide-react";

import { Card } from "@/components/ui/card";
import type { TradeRecord } from "@/lib/trades/schema";

/**
 * The room's history for one viewer: what they traded tonight, both sides.
 *
 * The binder-update prompt that used to ride along ("still have X in
 * your binder?") went with the "What you brought" section: it asked
 * about a list that no longer has a surface, and a nudge to maintain
 * something invisible is exactly the clutter the founder cut. The
 * timeZone is the store's own — the clock on the wall of the room.
 */

/** "7:42 PM", in the store's own zone. */
function timeIn(timeZone: string, iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

export function TradedTonight({
  trades,
  timeZone,
}: {
  trades: TradeRecord[];
  timeZone: string;
}) {
  if (trades.length === 0) return null;

  return (
    <section className="flex flex-col gap-4" aria-labelledby="trades-heading">
      <div className="flex flex-col gap-1">
        <h2 id="trades-heading" className="text-lg font-bold text-text-primary">
          Traded tonight
        </h2>
        <p className="text-sm text-text-secondary">
          Only you can see this list. The store sees tonight&rsquo;s totals, never who
          traded what.
        </p>
      </div>

      <Card className="p-4">
        <ul className="flex flex-col">
          {trades.map((trade) => {
            const when = timeIn(timeZone, trade.confirmedAt);

            return (
              <li
                key={trade.id}
                className="flex flex-col gap-2 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0"
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <CheckCircle2
                    className="size-4 shrink-0 translate-y-0.5 text-accent"
                    aria-hidden="true"
                  />
                  <span className="font-semibold text-text-primary">
                    {trade.cardName}
                  </span>
                  {trade.quantity > 1 && (
                    <span className="text-sm text-text-muted tabular-nums">
                      ×{trade.quantity}
                    </span>
                  )}
                  <span className="text-sm text-text-secondary">
                    {trade.youWere === "requester"
                      ? trade.partnerName
                        ? `from ${trade.partnerName}`
                        : "found in the room"
                      : `to ${trade.partnerName ?? "a player"}`}
                  </span>
                  {when && <span className="text-xs text-text-muted">· {when}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}
