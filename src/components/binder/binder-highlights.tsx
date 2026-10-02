import Link from "next/link";
import { ArrowLeftRight } from "lucide-react";

import { CreateBinder } from "@/components/binder/create-binder";
import type { BinderSummary } from "@/lib/binder/binder";
import { binderCover } from "@/lib/binder/covers";
import { cn } from "@/lib/cn";

/**
 * A profile's binders as a row of circles under the icon row.
 *
 * The founder wanted the profile to read as "This is me as a trader",
 * with the deeper screens behind clear destinations, so the binder
 * panel that used to sit in the middle of the page is a row of
 * highlights now: one circle per binder, scrolling sideways, no box
 * round the row. Each shows the binder's front card, cover-fit and
 * centred, or the cover's colour when it has no card yet, with the
 * name under it on one line.
 *
 * The Trade binder comes first and wears the lime ring and a tiny
 * badge with the trade arrows, because it is the one binder whose
 * cards are up for trade; a custom binder has a hairline ring. The
 * owner's row ends with a dashed "+" that starts a new binder. A
 * visitor with nothing to open (every binder private) gets no row at
 * all. The app's binder-highlights.tsx draws the same.
 */
export function BinderHighlights({
  binders,
  yours,
  base,
}: {
  /** The Trade binder first; a visitor's list holds only public ones. */
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

function Highlight({ binder, href }: { binder: BinderSummary; href: string }) {
  const trade = binder.kind === "trade";
  const { edge } = binderCover(binder.cover);

  return (
    <Link
      href={href}
      className="flex w-full flex-col items-center gap-1.5 rounded-[var(--radius-control)] text-text-secondary hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
    >
      {/* The ring sits outside the circle with a gap, so the art is
          never under it: 2px lime for the Trade binder, a hairline
          for the rest. */}
      <span
        className={cn(
          "relative flex size-16 items-center justify-center rounded-full",
          trade
            ? "ring-2 ring-accent ring-offset-2 ring-offset-surface"
            : "ring-1 ring-border-strong",
        )}
      >
        <span
          className="block size-16 overflow-hidden rounded-full"
          style={{ background: edge }}
        >
          {binder.frontImageUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={binder.frontImageUrl}
              alt=""
              className="size-full object-cover object-center"
            />
          )}
        </span>
        {trade && (
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
