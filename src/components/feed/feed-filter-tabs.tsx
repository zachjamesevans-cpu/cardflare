import Link from "next/link";
import { Flame, MapPin, Users } from "lucide-react";

import { FeedTabFace } from "@/components/feed/feed-tab-face";
import { FEED_TAB_VALUES, TAB_TITLES, type FeedTab } from "@/lib/feed/repository";

/**
 * Following | Nearby | My Flares, under the wordmark.
 *
 * Three rounded segments, each an equal third of the row. The one that is on wears the accent as a
 * border and a faint glow, the CardFlare green kept for the active
 * state; the others sit in muted grey. Same words and order as the
 * app's tabs, which read the same `tab` off every item.
 *
 * Each Link's face is a client child that watches `useLinkStatus`, so
 * a tap is acknowledged the instant it lands rather than when the
 * server answers. Prefetching stays on: a prefetched tab switches with
 * no pending state at all, and the route's loading.tsx covers the rest.
 */
const ICONS = { following: Users, nearby: MapPin, mine: Flame } as const;

export const FEED_TABS: FeedTab[] = FEED_TAB_VALUES;

export function FeedFilterTabs({ value }: { value: FeedTab }) {
  return (
    <nav aria-label="Feed filters" className="flex w-full gap-2">
      {FEED_TABS.map((tab) => {
        const Icon = ICONS[tab];
        const on = tab === value;
        return (
          <Link
            key={tab}
            href={tab === "following" ? "/feed" : `/feed?tab=${tab}`}
            aria-current={on ? "page" : undefined}
            className="flex flex-1"
          >
            <FeedTabFace
              on={on}
              title={TAB_TITLES[tab]}
              icon={<Icon className="size-4" aria-hidden="true" />}
            />
          </Link>
        );
      })}
    </nav>
  );
}
