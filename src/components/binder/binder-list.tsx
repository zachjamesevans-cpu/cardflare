import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { BinderCover } from "@/components/binder/binder-cover";
import type { BinderSummary } from "@/lib/binder/binder";

/**
 * Every binder as a list of rows: the Binders tab on the profile.
 *
 * One row per binder, in the owner's order: the small cover with the
 * binder's name on it, the name, how many cards, and whether it is
 * up for trade. A binder up for trade wears a small lime "Up for
 * trade" chip, because its cards are the ones anyone can ask for; a
 * private one says "Private", muted, to its owner alone (a visitor
 * never sees a private binder, so the list they get needs no such
 * word). A chevron says the row opens. The app's binder-list.tsx
 * draws the same rows with the same words.
 */
export function BinderList({
  binders,
  yours,
  base,
}: {
  binders: BinderSummary[];
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
            <BinderCover cover={binder.cover} label={binder.name} size="sm" />
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="truncate font-bold text-text-primary">
                {binder.name}
              </span>
              {/* The chip rides the count line, so the name keeps the row's width. */}
              <span className="flex items-center gap-2 text-sm text-text-secondary">
                {binderCardsLine(binder.count)}
                {binder.forTrade ? (
                  <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-accent-contrast">
                    Up for trade
                  </span>
                ) : yours ? (
                  <span className="shrink-0 text-xs text-text-muted">Private</span>
                ) : null}
              </span>
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

/** "12 cards", "1 card", "0 cards": the row's count, the same on both platforms. */
function binderCardsLine(count: number): string {
  return `${count} ${count === 1 ? "card" : "cards"}`;
}
