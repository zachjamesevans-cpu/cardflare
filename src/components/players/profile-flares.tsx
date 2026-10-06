import Link from "next/link";

import { CardImageZoom, type ZoomCard } from "@/components/cards/card-image-zoom";
import { QuantityBadge } from "@/components/ui/quantity-badge";
import { cn } from "@/lib/cn";
import type { ProfileFlare } from "@/lib/players/profile";

/**
 * A profile's Flares as a grid: the Flares pane, the one a profile
 * opens on.
 *
 * The count is the same number the header's Flares stat shows, and
 * the grid under it is the whole list, three across, newest first: a
 * profile with sixty Flares scrolls. Each tile is the one card viewer
 * every shelf uses. A want wears no label: the founder, on a grid where
 * every tile wore the want label, "Delete the 'looking for' part on all
 * cards. Seems kinda redundant when they know it's for flares." A
 * showcase is the exception and keeps a small "Offering" chip at the
 * foot, so a mixed grid still tells the two apart. More than one copy
 * is the quantity tag in the top-left corner, the binder's. Nothing to
 * offer on from here; the Feed and the room are where a Flare is
 * answered. The app's profile-flares.tsx draws the same grid with the
 * same words.
 *
 * Under the profile's tab strip the tab is the heading, so the grid
 * draws without one and keeps the count as a small line at the top
 * ("7 Flares"); on its own it draws its heading with the count beside
 * it.
 */
/*
 * Under the tab strip on a phone the grid runs to the screen's edges
 * and the words keep 16px off them; from `sm` up the block's own
 * padding does that. The app's profile-flares.tsx insets the same
 * lines.
 */
const INSET = "px-4 sm:px-0";

export function ProfileFlares({
  flares,
  yours,
  imagesEnabled,
  heading = true,
}: {
  flares: ProfileFlare[];
  yours: boolean;
  imagesEnabled: boolean;
  /** False under the tab strip, where the tab already says Flares. */
  heading?: boolean;
}) {
  const shelf: ZoomCard[] = flares.map((flare) => ({
    imageUrl: flare.imageUrl,
    exactName: flare.cardName,
    cardNumber: flare.cardNumber,
    caption: flare.printingLabel,
    lookingFor: flare.quantity,
    direction: flare.direction === "want" ? "want" : "showcase",
  }));

  const count = `${flares.length} ${flares.length === 1 ? "Flare" : "Flares"}`;

  return (
    <section
      className="flex flex-col gap-3"
      aria-labelledby={heading ? "profile-flares" : undefined}
      aria-label={heading ? undefined : "Flares"}
    >
      {heading ? (
        <h2
          id="profile-flares"
          className="flex items-baseline gap-2 font-semibold text-text-primary"
        >
          Flares
          <span className="text-sm font-normal text-text-muted tabular-nums">
            {flares.length}
          </span>
        </h2>
      ) : flares.length > 0 ? (
        <p className={cn("text-xs text-text-muted tabular-nums", INSET)}>{count}</p>
      ) : null}

      {flares.length === 0 ? (
        <p className={cn("text-sm text-text-muted", !heading && INSET)}>
          {yours ? (
            <>
              No Flares up. Post one from the Flare tab.{" "}
              <Link
                href="/flare"
                className="font-semibold text-accent underline-offset-4 hover:underline"
              >
                Post a Flare
              </Link>
            </>
          ) : (
            "No Flares up."
          )}
        </p>
      ) : (
        /*
         * A grid the way a social profile draws one: three across,
         * edge to edge, a hairline between tiles, nothing under them.
         * The founder: "more of a grid like instagram instead of these
         * random blurry cards." Only an offer wears a chip at the foot,
         * so the tile is the picture and nothing else.
         */
        <ul className="grid grid-cols-3 gap-0.5">
          {flares.map((flare, index) => {
            const want = flare.direction === "want";
            return (
              <li key={flare.id} className="relative min-w-0">
                <CardImageZoom
                  imageUrl={flare.imageUrl}
                  exactName={flare.cardName}
                  cardNumber={flare.cardNumber}
                  caption={flare.printingLabel}
                  lookingFor={flare.quantity}
                  direction={want ? "want" : "showcase"}
                  siblings={shelf}
                  position={index}
                  enabled={imagesEnabled}
                  thumbClassName="w-full"
                  /* A third of the column, not the 56px every shelf asks
                     for: at 56px the optimiser's picture is stretched
                     to twice its size and reads as a blur. */
                  thumbSizes="(max-width: 672px) 33vw, 220px"
                />
                <QuantityBadge
                  quantity={flare.quantity}
                  className="pointer-events-none absolute top-1 left-1"
                />
                {want ? null : (
                  <span className="pointer-events-none absolute bottom-1 left-1 rounded-[4px] bg-canvas/80 px-1 py-px text-[9px] font-bold text-text-secondary">
                    Offering
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
