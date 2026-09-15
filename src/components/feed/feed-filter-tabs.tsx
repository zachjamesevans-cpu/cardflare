import Link from "next/link";
import { MapPin, Star, Users } from "lucide-react";

import { cn } from "@/lib/cn";
import { TAB_TITLES, type FeedTab } from "@/lib/feed/repository";

/**
 * Following | Nearby | My Flares, under the wordmark.
 *
 * Three rounded segments. The one that is on wears the accent as a
 * border and a faint glow, the CardFlare green kept for the active
 * state; the others sit in muted grey. Same words and order as the
 * app's tabs, which read the same `tab` off every item.
 */
const ICONS = { following: Users, nearby: MapPin, mine: Star } as const;

export const FEED_TABS: FeedTab[] = ["following", "nearby", "mine"];

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
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-[14px] border px-2 py-2.5 text-[13px] font-bold transition-colors",
              on
                ? "border-accent bg-accent/[0.08] text-accent shadow-[0_0_12px_rgba(198,238,79,0.25)]"
                : "border-border bg-surface text-text-secondary hover:border-border-strong hover:text-text-primary",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            <span className="truncate">{TAB_TITLES[tab]}</span>
          </Link>
        );
      })}
    </nav>
  );
}
