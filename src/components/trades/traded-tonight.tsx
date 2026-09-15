import { CheckCircle2, Clock, HelpCircle, Undo2 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { acknowledgeTradeAction } from "@/lib/trades/actions";
import type { TradeRecord } from "@/lib/trades/schema";

/**
 * The room's history for one viewer: what they traded tonight, both sides.
 *
 * Two hands on every trade now. The author confirms; the partner is
 * asked, right here, "did you?", and their Yes is what pays both of
 * them. So this list is also the partner's inbox for the night: a
 * pending row on the holder's side leads with the question and a
 * button, and the same row on the author's side says who it is
 * waiting for. The timeZone is the store's own, the clock on the wall.
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

function statusLine(trade: TradeRecord): { icon: typeof Clock; text: string } | null {
  switch (trade.status) {
    case "pending":
      return trade.youWere === "requester"
        ? { icon: Clock, text: `Waiting for ${trade.partnerName ?? "them"} to confirm` }
        : null;
    case "late":
      return {
        icon: Clock,
        text:
          trade.youWere === "requester"
            ? `${trade.partnerName ?? "They"} never confirmed, so it paid the unconfirmed rate`
            : "Not confirmed in time, so it paid nothing",
      };
    case "disputed":
      return { icon: Undo2, text: "Reversed. Its Embers were taken back." };
    case "unnamed":
      return { icon: HelpCircle, text: "Nobody named, so it earned nothing" };
    default:
      return null;
  }
}

export function TradedTonight({
  trades,
  timeZone,
  code,
}: {
  trades: TradeRecord[];
  timeZone: string;
  /** The room, for the partner's Yes. */
  code: string;
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
            const line = statusLine(trade);

            if (trade.awaitingYou) {
              return (
                <li
                  key={trade.id}
                  className="flex flex-col gap-3 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0"
                >
                  <p className="text-text-primary">
                    <span className="font-semibold">
                      {trade.partnerName ?? "A player"}
                    </span>{" "}
                    says you traded{" "}
                    <span className="font-semibold">{trade.cardName}</span>
                    {trade.quantity > 1 && (
                      <span className="text-text-muted tabular-nums">
                        {" "}
                        ×{trade.quantity}
                      </span>
                    )}
                    . Did you?
                  </p>
                  <form
                    action={acknowledgeTradeAction}
                    className="flex items-center gap-3"
                  >
                    <input type="hidden" name="code" value={code} />
                    <input type="hidden" name="tradeId" value={trade.id} />
                    <input type="hidden" name="flareId" value={trade.flareId ?? ""} />
                    <input
                      type="hidden"
                      name="requesterSessionId"
                      value={trade.requesterSessionId ?? ""}
                    />
                    <SubmitButton
                      label="Yes, we traded"
                      pendingLabel="Confirming…"
                      variant="primary"
                      size="sm"
                    />
                    <span className="text-xs text-text-muted">
                      Your tap pays you both Embers.
                    </span>
                  </form>
                </li>
              );
            }

            return (
              <li
                key={trade.id}
                className="flex flex-col gap-1 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0"
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
                {line && (
                  <p className="flex items-center gap-1.5 text-xs text-text-muted">
                    <line.icon className="size-3.5" aria-hidden="true" />
                    {line.text}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}
