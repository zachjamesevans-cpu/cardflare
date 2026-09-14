import { Hand } from "lucide-react";

import { CardImageZoom } from "@/components/cards/card-image-zoom";
import { SubmitButton } from "@/components/ui/submit-button";
import { Card } from "@/components/ui/card";
import type { ListEntry } from "@/lib/lists/repository";
import { removeHaveAction } from "@/lib/nearby/actions";

import { TradeLocallySwitch } from "./trade-locally-switch";

/**
 * Your Have list, on the Flare tab.
 *
 * The room's binder, reachable with no room, so a card can be marked
 * Trade locally from the couch. Same rows as the room draws, plus the
 * switch; private to its owner as it has always been.
 */
export function HaveListCard({
  entries,
  imagesEnabled,
}: {
  entries: ListEntry[];
  imagesEnabled: boolean;
}) {
  return (
    <Card className="flex flex-col">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-text-primary">Your Have list</h2>
        <span className="text-sm text-text-muted tabular-nums">
          {entries.length} {entries.length === 1 ? "card" : "cards"}
        </span>
      </div>

      {entries.length === 0 ? (
        <p className="flex items-start gap-2 pt-3 text-sm text-text-secondary">
          <Hand className="mt-0.5 size-4 shrink-0 text-text-muted" aria-hidden="true" />
          Add the cards you would trade. Only you can see this list. Mark one Trade
          locally and people nearby hunting it are told they can answer you.
        </p>
      ) : (
        <ul className="flex flex-col pt-3">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex items-start gap-3 border-t border-border py-3 first:border-t-0 first:pt-0"
            >
              <CardImageZoom
                imageUrl={entry.imageUrl}
                exactName={entry.cardName}
                cardNumber={entry.cardNumber}
                enabled={imagesEnabled}
                anyPrinting={!entry.printingId}
                caption={entry.printingLabel ?? "Any printing"}
                note={entry.note}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-baseline gap-x-2">
                  <p className="min-w-0 font-semibold text-text-primary">
                    {entry.cardName}
                  </p>
                  {entry.quantity > 1 && (
                    <span className="shrink-0 text-sm text-text-muted tabular-nums">
                      ×{entry.quantity}
                    </span>
                  )}
                  <form action={removeHaveAction} className="ml-auto shrink-0">
                    <input type="hidden" name="entryId" value={entry.id} />
                    <SubmitButton
                      label="Remove"
                      pendingLabel="Removing…"
                      variant="ghost"
                      size="sm"
                    />
                  </form>
                </div>
                <p className="flex flex-wrap items-center gap-x-2 font-mono text-xs text-text-muted">
                  <span>{entry.cardNumber}</span>
                  <span className="font-sans">
                    {entry.printingLabel ?? "Any printing"}
                  </span>
                </p>
                {entry.note && (
                  <p className="text-sm text-text-secondary italic">{entry.note}</p>
                )}
              </div>
              <TradeLocallySwitch entryId={entry.id} on={entry.localTrade} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
