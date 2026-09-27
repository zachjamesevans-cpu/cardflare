import Link from "next/link";
import { ChevronRight, Store } from "lucide-react";

import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { rsvpAction } from "@/lib/players/account-actions";
import { cn } from "@/lib/cn";
import type { RecentStore } from "@/lib/players/locals";

/**
 * The Room tab's first answer: the stores this player has been in, most
 * recent first, then the ones they only follow.
 *
 * The founder: "When clicking 'room' it defaults to Mox Valley games.
 * But really it should give me an option for all stores I've been at
 * recently. First." So the tab no longer walks straight into the last
 * room; it asks which store, with the last room one tap away at the
 * top. A row walks into the store's room when there is one to walk
 * into (open now, open to walk-ins, or a board taking Flares early)
 * and opens the store's page when there is not, so no row is a door
 * to nothing. Follow and Unfollow live on the store's page.
 * The app's Room tab draws the same list (mobile/src/screens/room.tsx).
 */

/** The code a row walks into, or null when there is no room to enter. */
export function enterCode(store: RecentStore): string | null {
  if (store.liveNow || store.walkIn) return store.joinCode;
  if (store.earlyOpen && store.nextEventCode) return store.nextEventCode;
  return null;
}

/** The row's second line: what is on, in the fewest words. */
export function storeLine(store: RecentStore): string {
  if (store.liveNow) return "Room open now";
  if (store.nextEventAt && store.nextEventName) {
    const day = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: store.timeZone,
    }).format(new Date(store.nextEventAt));
    return `Next: ${store.nextEventName} · ${day}`;
  }
  if (store.walkIn) return "Walk in any time";
  return [store.city, store.region].filter(Boolean).join(", ") || "Nothing on yet";
}

export function YourStoresCard({
  stores,
  wantCount,
  current,
}: {
  stores: RecentStore[];
  wantCount: number;
  /** The room this browser is standing in, if any: first, one tap back. */
  current: { name: string; storeName: string; code: string } | null;
}) {
  if (stores.length === 0 && !current) return null;

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-bold text-text-primary">Your stores</h1>
        <p className="text-sm text-text-secondary">
          Where you have traded lately. Pick one to walk into its room.
        </p>
      </div>

      {current && (
        <Link
          href={`/e/${current.code}`}
          className="flex items-center gap-3 rounded-[var(--radius-control)] border border-accent/60 bg-elevated px-3 py-2.5 transition-colors hover:bg-elevated/70"
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-xs font-semibold text-accent">Back to your room</span>
            <span className="truncate font-semibold text-text-primary">
              {current.storeName}
            </span>
            <span className="truncate text-xs text-text-muted">{current.name}</span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-accent" aria-hidden="true" />
        </Link>
      )}

      <ul className="flex flex-col">
        {stores.map((store) => {
          const code = enterCode(store);
          return (
            <li
              key={store.storeId}
              className="flex flex-col gap-2 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0"
            >
              <div className="flex items-center gap-2">
                <Link
                  href={code ? `/e/${code}` : `/s/${store.storeId}`}
                  className="group flex min-w-0 flex-1 items-center gap-3"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-semibold text-text-primary group-hover:underline group-hover:underline-offset-4">
                      {store.name}
                    </span>
                    <span
                      className={cn(
                        "truncate text-xs",
                        store.liveNow ? "font-semibold text-accent" : "text-text-muted",
                      )}
                    >
                      {storeLine(store)}
                    </span>
                  </span>
                  <ChevronRight
                    className="size-4 shrink-0 text-text-muted"
                    aria-hidden="true"
                  />
                </Link>
                {/* The store's own page, when the row itself goes to its
                    room: where Follow, hours and the calendar live. */}
                {code ? (
                  <Link
                    href={`/s/${store.storeId}`}
                    aria-label={`${store.name} store page`}
                    className="flex size-9 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-elevated hover:text-text-primary"
                  >
                    <Store className="size-4" aria-hidden="true" />
                  </Link>
                ) : (
                  /* Keeps every chevron in one column. */
                  <span className="size-9 shrink-0" aria-hidden="true" />
                )}
              </div>
              {/* One tap: onto the board, Flares and all, from the
                  moment the board opens. The button carries the
                  count so the tap never posts more than it said. */}
              {store.earlyOpen && store.nextEventCode && (
                <form action={rsvpAction}>
                  <input type="hidden" name="code" value={store.nextEventCode} />
                  <SubmitButton
                    variant="secondary"
                    size="sm"
                    pendingLabel="Posting…"
                    label={
                      wantCount > 0
                        ? `I'll be there. Post my ${wantCount} ${
                            wantCount === 1 ? "Flare" : "Flares"
                          }`
                        : "I'll be there"
                    }
                  />
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
