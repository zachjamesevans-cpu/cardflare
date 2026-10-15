import Link from "next/link";

import { CardImageZoom, type ZoomCard } from "@/components/cards/card-image-zoom";
import { buttonStyles } from "@/components/ui/button";
import { QuantityBadge } from "@/components/ui/quantity-badge";
import { cn } from "@/lib/cn";
import type { ProfileFlare } from "@/lib/players/profile";

/**
 * A profile's Flares as a grid: the Flares pane, the one a profile
 * opens on.
 *
 * The count is the same number the header's Flares stat shows, and
 * the grid under it is the whole list, three across, newest first,
 * except that a want in the viewer's binder comes first and wears the
 * green ring: a profile with sixty Flares scrolls. Each tile is the one card viewer
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
  flares: sent,
  yours,
  imagesEnabled,
  heading = true,
  ownerName,
}: {
  flares: ProfileFlare[];
  yours: boolean;
  imagesEnabled: boolean;
  /** False under the tab strip, where the tab already says Flares. */
  heading?: boolean;
  /** Whose they are, for a visitor's empty state. */
  ownerName?: string;
}) {
  /* The cards still looked for, and nothing else: offers are the TRADES
     binder's, found cards are Trades' history. The app's stillWanted. */
  const flares = sent.filter((flare) => flare.direction === "want");
  const shelf: ZoomCard[] = flares.map((flare) => ({
    imageUrl: flare.imageUrl,
    exactName: flare.cardName,
    cardNumber: flare.cardNumber,
    caption: flare.printingLabel,
    lookingFor: flare.quantity,
    direction: flare.direction === "want" ? "want" : "showcase",
    youHave: flare.match ? { kind: flare.match, count: 0 } : null,
  }));

  return (
    <section
      className="flex flex-col gap-3"
      aria-labelledby={heading ? "profile-flares" : undefined}
      aria-label={heading ? undefined : "Flares"}
    >
      {
        heading ? (
          <h2
            id="profile-flares"
            className="flex items-baseline gap-2 font-semibold text-text-primary"
          >
            Flares
            <span className="text-sm font-normal text-text-muted tabular-nums">
              {flares.length}
            </span>
          </h2>
        ) : null /* No "N Flares" line over the grid: the header's number says it. */
      }

      {flares.length === 0 ? (
        /* An empty profile says what to do next, as the app's does
           (ProfileEmpty in mobile/src/profile-flares.tsx). */
        <div
          className={cn(
            "flex flex-col items-center gap-2 py-8 text-center",
            !heading && INSET,
          )}
        >
          <p className="text-lg font-bold text-text-primary">
            {yours
              ? "What are you hunting?"
              : `${ownerName ?? "They"} ${ownerName ? "isn’t" : "aren’t"} looking for anything right now.`}
          </p>
          <p className="max-w-sm text-sm text-text-secondary">
            {yours
              ? "Post a Flare for a card you want, and players near you who have it can raise a hand."
              : "When they post a Flare, you’ll see it in your Following feed."}
          </p>
          {yours && (
            <Link href="/flare" className={cn(buttonStyles("primary", "sm"), "mt-2")}>
              Post a Flare
            </Link>
          )}
        </div>
      ) : (
        /*
         * A grid the way a social profile draws one: edge to edge, a
         * hairline between tiles, nothing under them. The founder: "more
         * of a grid like instagram instead of these random blurry
         * cards." Four across, not three: a card is tall, so four reads
         * like a binder page and shows twice as many at a glance - the
         * founder, shown both, "okay yeah commit it". Only an offer
         * wears a chip at the foot, so the tile is the picture.
         */
        <ul className="grid grid-cols-4 gap-0.5">
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
                  youHave={flare.match ? { kind: flare.match, count: 0 } : null}
                  siblings={shelf}
                  position={index}
                  enabled={imagesEnabled}
                  thumbClassName="w-full"
                  /* A quarter of the column, not the 56px every shelf
                     asks for: at 56px the optimiser's picture is
                     stretched to twice its size and reads as a blur. */
                  thumbSizes="(max-width: 672px) 25vw, 168px"
                />
                {flare.match && (
                  /* A want in your binder: the green ring a card you
                     have wears everywhere, and the server put it
                     first. Inset, because the grid runs tile to tile
                     and a ring outside would sit on the neighbour.
                     Three pixels and no corner icon (2026-10-11): the
                     ring alone says it. */
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 rounded-[6px] ring-[3px] ring-accent ring-inset"
                  />
                )}
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
