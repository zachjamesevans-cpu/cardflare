import Link from "next/link";
import { ArrowLeftRight } from "lucide-react";

import { CreateBinder } from "@/components/binder/create-binder";
import type { BinderSummary } from "@/lib/binder/binder";
import { binderCover } from "@/lib/binder/covers";
import { cn } from "@/lib/cn";

/**
 * A profile's binders as a row of circles under the header.
 *
 * The founder wanted the profile to read as "This is me as a trader",
 * with the deeper screens behind clear destinations, so the binders
 * are a row of highlights: one circle per binder, scrolling sideways,
 * no box round the row. Each circle is the cover's colour with the
 * binder's first letter on it in the cover's dark colour, and the
 * name under it on one line. No picture: the founder, on the card
 * that used to sit on the cover, "it's tacky imo."
 *
 * A binder up for trade wears the lime ring and a tiny badge with
 * the trade arrows, because its cards are the ones anyone can ask
 * for; a private one has a hairline ring. The row is in the owner's
 * order. The owner's row ends with a dashed "+" that starts a new
 * binder. A visitor sees only the binders up for trade, and no row
 * at all when there are none. The app's binder-highlights.tsx draws
 * the same.
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

  return (
    <ul
      className="-mx-1 flex items-start gap-1 overflow-x-auto px-1 py-1"
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

/** The first letter of the name, as the owner wrote it; nothing for a blank. */
function binderInitial(name: string): string {
  return name.trim().slice(0, 1);
}

function Highlight({ binder, href }: { binder: BinderSummary; href: string }) {
  const { edge, spine } = binderCover(binder.cover);

  return (
    <Link
      href={href}
      className="flex w-full flex-col items-center gap-1.5 rounded-[var(--radius-control)] text-text-secondary hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
    >
      {/* The ring sits outside the circle with a gap: 2px lime when
          the binder is up for trade, a hairline when it is private. */}
      <span
        className={cn(
          "relative flex size-16 items-center justify-center rounded-full",
          binder.forTrade
            ? "ring-2 ring-accent ring-offset-2 ring-offset-surface"
            : "ring-1 ring-border-strong",
        )}
      >
        <span
          aria-hidden="true"
          className="flex size-16 items-center justify-center overflow-hidden rounded-full text-2xl leading-none font-bold"
          style={{ background: edge, color: spine }}
        >
          {binderInitial(binder.name)}
        </span>
        {binder.forTrade && (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -bottom-0.5 flex size-5 items-center justify-center rounded-full bg-accent text-accent-contrast ring-2 ring-surface"
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
