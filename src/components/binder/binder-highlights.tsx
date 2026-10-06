import Link from "next/link";
import { ArrowLeftRight } from "lucide-react";

import { BinderCover } from "@/components/binder/binder-cover";
import { CreateBinder } from "@/components/binder/create-binder";
import type { BinderSummary } from "@/lib/binder/binder";
import { cn } from "@/lib/cn";

/**
 * A profile's binders as a row of small binders under the header.
 *
 * The founder wanted the profile to read as "This is me as a trader",
 * with the deeper screens behind clear destinations, so the binders
 * are a row of highlights: one per binder, scrolling sideways, no box
 * round the row. Each one is the binder itself, small: the same zip
 * binder the Binders tab and the binder page draw, in its cover
 * colour, with the name under it on one line. The founder, on the
 * circles this row started as: "Thought about the circle on your
 * profile for binders being actual binders? Like it'll show the
 * actual binder as a curved rectangle like how it is under the binder
 * view." So it does. No picture on the cover: "it's tacky imo."
 *
 * A binder up for trade wears the lime ring and a tiny badge with
 * the trade arrows, because its cards are the ones anyone can ask
 * for; a private one has a hairline ring. The ring follows the
 * binder's shape: nearly square on the spine side, rounded on the
 * open side. The row is in the owner's order. The owner's row ends
 * with a dashed binder outline and a "+" that starts a new one. A
 * visitor sees only the binders up for trade, and no row at all when
 * there are none. The app's binder-highlights.tsx draws the same.
 */
export function BinderHighlights({
  binders,
  yours,
  base,
}: {
  /** In the owner's order; a visitor's list holds only those up for trade. */
  binders: BinderSummary[];
  yours: boolean;
  /** Where the binder pages live: "/profile", or "/p/<id>". */
  base: string;
}) {
  if (binders.length === 0 && !yours) return null;

  /* On a phone the row scrolls from edge to edge of the screen, the
     way the profile block runs, and rests with its first binder in
     line with the name above it. */
  return (
    <ul
      className="-mx-4 flex items-start gap-1 overflow-x-auto px-4 py-1 sm:-mx-1 sm:px-1"
      aria-label="Binders"
    >
      {binders.map((binder) => (
        <li key={binder.id} className="w-[72px] shrink-0">
          <Highlight binder={binder} href={`${base}/binders/${binder.id}`} />
        </li>
      ))}
      {yours && (
        <li className="w-[72px] shrink-0">
          <CreateBinder trigger="tile" />
        </li>
      )}
    </ul>
  );
}

/**
 * The ring's corners follow the xs cover's: 2px on the spine side,
 * 6px on the open side, each grown by the 2px gap the ring sits off
 * the binder. The New tile in create-binder.tsx is the cover's own
 * 58x76 box, dashed, with the cover's corners.
 */
const HIGHLIGHT_SHAPE = "rounded-l-[4px] rounded-r-[8px]";

function Highlight({ binder, href }: { binder: BinderSummary; href: string }) {
  return (
    <Link
      href={href}
      className="flex w-full flex-col items-center gap-1.5 rounded-[var(--radius-control)] text-text-secondary hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
    >
      {/* The ring sits outside the binder with a gap: 2px lime when
          the binder is up for trade, a hairline when it is private. */}
      <span
        className={cn(
          "relative flex items-center justify-center",
          HIGHLIGHT_SHAPE,
          binder.forTrade
            ? "ring-2 ring-accent ring-offset-2 ring-offset-surface"
            : "ring-1 ring-border-strong ring-offset-2 ring-offset-surface",
        )}
      >
        <BinderCover cover={binder.cover} size="xs" plain />
        {binder.forTrade && (
          <span
            aria-hidden="true"
            className="absolute -right-2 -bottom-2 flex size-5 items-center justify-center rounded-full bg-accent text-accent-contrast ring-2 ring-surface"
          >
            <ArrowLeftRight className="size-3" strokeWidth={3} />
          </span>
        )}
      </span>
      <span className="w-full truncate text-center text-[11px] leading-none">
        {binder.name}
      </span>
    </Link>
  );
}
