import Link from "next/link";

import { CardImageZoom, type ZoomCard } from "@/components/cards/card-image-zoom";
import type { ProfileFlare } from "@/lib/players/profile";
import { cn } from "@/lib/cn";

/**
 * A profile's Flares as a grid, under the showcase.
 *
 * The heading carries the count, the same number the header's Flares
 * stat shows, and the grid under it is the whole list, three across,
 * newest first: a profile with sixty Flares scrolls. Each tile is the
 * one card viewer every shelf uses, with a tiny chip at the foot
 * saying which way the Flare points, in the two words the whole
 * product uses for a Flare's direction. Nothing to offer on from
 * here; the Feed and the room are where a Flare is answered. The
 * app's profile-flares.tsx draws the same grid with the same words.
 */
export function ProfileFlares({
  flares,
  yours,
  imagesEnabled,
}: {
  flares: ProfileFlare[];
  yours: boolean;
  imagesEnabled: boolean;
}) {
  const shelf: ZoomCard[] = flares.map((flare) => ({
    imageUrl: flare.imageUrl,
    exactName: flare.cardName,
    cardNumber: flare.cardNumber,
    caption: flare.printingLabel,
    lookingFor: flare.quantity,
    direction: flare.direction === "want" ? "want" : "showcase",
  }));

  return (
    <section className="flex flex-col gap-3" aria-labelledby="profile-flares">
      <h2
        id="profile-flares"
        className="flex items-baseline gap-2 font-semibold text-text-primary"
      >
        Flares
        <span className="text-sm font-normal text-text-muted tabular-nums">
          {flares.length}
        </span>
      </h2>

      {flares.length === 0 ? (
        <p className="text-sm text-text-muted">
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
        <ul className="grid grid-cols-3 gap-2">
          {flares.map((flare, index) => {
            const want = flare.direction === "want";
            return (
              <li key={flare.id} className="flex min-w-0 flex-col gap-1">
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
                />
                <span
                  className={cn(
                    "w-fit rounded-full border px-1.5 py-px text-[9px] font-bold",
                    want
                      ? "border-accent bg-accent text-accent-contrast"
                      : "border-border bg-elevated text-text-secondary",
                  )}
                >
                  {want ? "Looking for" : "Offering"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
