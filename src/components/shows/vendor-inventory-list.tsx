import { Package } from "lucide-react";

import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { removeInventoryAction } from "@/lib/shows/actions";
import type { InventoryLine } from "@/lib/shows/repository";
import { slabLabel } from "@/lib/shows/schema";

/**
 * The vendor's stock as attendees will meet it: one line per physical thing.
 * A raw playset and a PSA 10 of the same card are two lines, because they
 * are two different reasons to cross a hall.
 */
export function VendorInventoryList({
  storeId,
  lines,
}: {
  storeId: string;
  lines: InventoryLine[];
}) {
  if (lines.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 py-10 text-center">
        <Package className="size-6 text-text-muted" aria-hidden="true" />
        <p className="max-w-sm text-text-secondary">
          Nothing listed yet. Add what you&rsquo;re bringing and attendees searching at
          a show will see your booth.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <ul className="flex flex-col">
        {lines.map((line) => (
          <li
            key={line.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0"
          >
            <div className="flex min-w-0 flex-1 basis-48 flex-col">
              <p className="truncate font-semibold text-text-primary">
                {line.cardName}
              </p>
              <p className="flex flex-wrap items-center gap-x-2 font-mono text-xs text-text-muted">
                <span>{line.cardNumber}</span>
                <span className="font-sans">
                  {line.printingLabel ?? "Any printing"}
                </span>
              </p>
            </div>

            <Badge tone={line.form === "slab" ? "accent" : "neutral"}>
              {slabLabel(line.form, line.grader, line.grade)}
            </Badge>

            <span className="text-sm text-text-muted tabular-nums">
              ×{line.quantity}
            </span>

            <form action={removeInventoryAction} className="shrink-0">
              <input type="hidden" name="storeId" value={storeId} />
              <input type="hidden" name="entryId" value={line.id} />
              <Button type="submit" variant="ghost" size="sm">
                Remove
              </Button>
            </form>
          </li>
        ))}
      </ul>
    </Card>
  );
}
