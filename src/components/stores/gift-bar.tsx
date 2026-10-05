import { Gift, Sparkles, Timer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { giftBarCopy, type GiftBar as GiftBarState } from "@/lib/stores/gift-shared";
import { giftBarFor } from "@/lib/stores/gifts";
import { startUltraCheckoutAction } from "@/lib/stores/ultra-actions";

/**
 * The green bar at the top of the console.
 *
 * The founder: "there will be a green block at the top that says how
 * many days they have left in the trial." One bar for every way a store
 * can be on Ultra without paying yet: a Founding Store, a timed gift,
 * Stripe's own trial, and a gift that has just ended. The state comes
 * from `giftBarFor` and the words from `giftBarCopy`, verbatim, so the
 * app's bar (`mobile/src/gift-copy.ts`) says exactly the same thing.
 *
 * The "Keep Ultra" button is the owner's: money is theirs, and
 * `startUltraCheckoutAction` refuses anyone else anyway. An organizer
 * sees the same bar without it.
 */
export async function GiftBar({ storeId, owner }: { storeId: string; owner: boolean }) {
  const bar = await giftBarFor(storeId);
  if (!bar) return null;
  return <GiftBarView bar={bar} storeId={storeId} owner={owner} />;
}

/** The bar drawn from its state: no reads, so every state can be seen. */
export function GiftBarView({
  bar,
  storeId,
  owner,
}: {
  bar: GiftBarState;
  storeId: string;
  owner: boolean;
}) {
  const copy = giftBarCopy(bar);
  const showAction = owner && copy.action !== null;

  /* After the gift: still there, no longer shouting. */
  if (bar.state === "gift-ended") {
    return (
      <Card className="flex flex-col gap-4 border-accent/50 p-4 sm:flex-row sm:items-center sm:p-5">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Gift className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
          <div className="flex min-w-0 flex-col gap-1">
            <p className="font-bold text-text-primary">{copy.title}</p>
            <p className="text-sm text-text-secondary">{copy.detail}</p>
          </div>
        </div>
        {showAction && (
          <form action={startUltraCheckoutAction} className="shrink-0">
            <input type="hidden" name="storeId" value={storeId} />
            <Button type="submit">{copy.action}</Button>
          </form>
        )}
      </Card>
    );
  }

  const Icon =
    bar.state === "founding" ? Sparkles : bar.state === "gift" ? Gift : Timer;

  return (
    <div className="flex flex-col gap-4 rounded-[var(--radius-card)] bg-accent p-4 text-accent-contrast shadow-[var(--shadow-card)] sm:flex-row sm:items-center sm:p-5">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="flex flex-wrap items-center gap-2 font-bold">
            <span>{copy.title}</span>
            {copy.urgent && (
              <span className="rounded-full bg-accent-contrast px-2 py-0.5 text-xs font-semibold text-accent">
                Ends soon
              </span>
            )}
          </p>
          <p className="text-sm opacity-80">{copy.detail}</p>
        </div>
      </div>
      {showAction && (
        <form action={startUltraCheckoutAction} className="shrink-0">
          <input type="hidden" name="storeId" value={storeId} />
          {/* Inverted: an accent button on an accent block would vanish. */}
          <button
            type="submit"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-canvas px-5 text-sm font-semibold whitespace-nowrap text-accent transition-colors duration-[var(--duration-base)] hover:bg-elevated"
          >
            {copy.action}
          </button>
        </form>
      )}
    </div>
  );
}
