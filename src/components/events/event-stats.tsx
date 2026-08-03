import { Card } from "@/components/ui/card";
import type { EventStats } from "@/lib/trades/repository";

/**
 * The numbers a store reads after a night.
 *
 * Counts only, and deliberately no prices — CardFlare is not a pricing
 * application, per PRODUCT.md. Trades are the number that answers "was
 * tonight worth hosting"; the funnel above it (players → Flares → offers)
 * says where the room stalls when it stalls. Totals only, never who traded
 * what with whom: the store hosts the room, it does not read it.
 */
export function EventStatsCard({ stats }: { stats: EventStats }) {
  const figures = [
    { label: "Players joined", value: stats.players },
    { label: "Flares posted", value: stats.flaresTotal },
    { label: "Still wanted", value: stats.flaresOpen },
    { label: "Offers made", value: stats.offers },
    { label: "Trades made", value: stats.trades },
  ];

  return (
    <Card className="p-0">
      <dl className="grid grid-cols-2 sm:grid-cols-5">
        {figures.map((figure) => (
          <div
            key={figure.label}
            className="flex flex-col gap-1 border-b border-border p-4 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0"
          >
            <dd className="text-2xl font-bold text-text-primary tabular-nums">
              {figure.value}
            </dd>
            <dt className="text-xs text-text-muted">{figure.label}</dt>
          </div>
        ))}
      </dl>
    </Card>
  );
}
