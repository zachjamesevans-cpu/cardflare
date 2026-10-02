import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { BinderCover } from "@/components/binder/binder-cover";
import type { BinderSummary } from "@/lib/binder/binder";
import { binderCountLine } from "@/lib/binder/covers";

/**
 * Every binder as a list of rows: the Binders page behind the icon
 * row's Binders door.
 *
 * One row per binder: the small cover with the owner's name on it,
 * the name, how many cards, and for the owner whether anyone else can
 * open it. The Trade binder is first, always, and wears a small lime
 * "Trade" chip, because it is the one whose cards are up for trade;
 * the server orders the rest. A chevron says the row opens. The app's
 * binder-list.tsx draws the same rows with the same words.
 */
export function BinderList({
  binders,
  ownerName,
  yours,
  base,
}: {
  binders: BinderSummary[];
  ownerName: string;
  yours: boolean;
  /** Where the binder pages live: "/profile", or "/p/<id>". */
  base: string;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {binders.map((binder) => (
        <li key={binder.id}>
          <Link
            href={`${base}/binders/${binder.id}`}
            className="flex items-center gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-3 transition-colors hover:border-border-strong"
          >
            <BinderCover
              cover={binder.cover}
              frontImageUrl={binder.frontImageUrl}
              label={yours ? "Yours" : ownerName}
              size="sm"
            />
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="truncate font-bold text-text-primary">
                {binder.name}
              </span>
              {/* The chip rides the count line, so the name keeps the row's width. */}
              <span className="flex items-center gap-2 text-sm text-text-secondary">
                {binderCountLine(binder.count)}
                {binder.kind === "trade" && (
                  <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-accent-contrast">
                    Trade
                  </span>
                )}
              </span>
              {yours && (
                <span className="text-xs text-text-muted">
                  {binder.isPublic ? "Public" : "Private, only you"}
                </span>
              )}
            </span>
            <ChevronRight
              className="size-4 shrink-0 text-text-muted"
              aria-hidden="true"
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}
