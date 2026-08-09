import { ArrowLeftRight, CheckCircle2 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { confirmBinderEntryAction, removeListEntryAction } from "@/lib/lists/actions";
import type { BinderPrompt, TradeRecord } from "@/lib/trades/schema";

/**
 * The room's history for one viewer: what they traded tonight, both sides —
 * plus the one-tap binder update after a trade in which they were the
 * holder. The prompt exists because a binder rots the moment cards change
 * hands, and "confirm on arrival" cannot help mid-event.
 *
 * "Still have it" re-confirms the entry (fresher `confirmed_at`, prompt
 * gone); "remove it" is the ordinary binder removal. No new state anywhere.
 */

/** "7:42 PM", in the store's own zone — the clock on the wall of the room. */
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
  prompts,
  code,
  timeZone,
}: {
  trades: TradeRecord[];
  prompts: BinderPrompt[];
  code: string;
  timeZone: string;
}) {
  if (trades.length === 0) return null;

  const promptByTrade = new Map(prompts.map((prompt) => [prompt.tradeId, prompt]));

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
            const prompt = promptByTrade.get(trade.id);
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

                {prompt && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius-control)] border border-warning/40 bg-warning/[0.08] px-3 py-2">
                    <p className="min-w-0 flex-1 basis-44 text-sm text-text-secondary">
                      <ArrowLeftRight
                        className="mr-1.5 inline size-3.5 -translate-y-px text-warning"
                        aria-hidden="true"
                      />
                      Still have <strong>{prompt.cardName}</strong> in your binder?
                    </p>

                    <div className="flex shrink-0 items-center gap-2">
                      <form action={removeListEntryAction}>
                        <input type="hidden" name="code" value={code} />
                        <input type="hidden" name="kind" value="have" />
                        <input type="hidden" name="entryId" value={prompt.entryId} />
                        <Button type="submit" variant="secondary" size="sm">
                          Traded away? Remove it
                        </Button>
                      </form>
                      <form action={confirmBinderEntryAction}>
                        <input type="hidden" name="code" value={code} />
                        <input type="hidden" name="entryId" value={prompt.entryId} />
                        <Button type="submit" variant="ghost" size="sm">
                          Still have it
                        </Button>
                      </form>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}
