"use client";

import { Flame } from "lucide-react";
import { useEffect, useState } from "react";

import { ART_EVENT, shownArtPrintingIds } from "./card-art-carousel";

/**
 * "On your Flares", under a card's name, for the art on show: it follows
 * the carousel, so another art of the card does not wear it. The founder
 * (2026-11-25): "when you ... already have a flare out for perona, and
 * you happen to click on that card, it'll have a logo or something". A
 * Flare for "any art" (null) covers them all. The app's sheet is the same.
 */
export function FlaredArtPill({
  wantedPrintings,
  firstArt,
}: {
  wantedPrintings: (string | null)[];
  /** The lead art's printings, for the first paint, before the carousel says. */
  firstArt: string[];
}) {
  const [shown, setShown] = useState<string[]>(firstArt);
  useEffect(() => {
    const follow = () => setShown(shownArtPrintingIds ?? firstArt);
    window.addEventListener(ART_EVENT, follow);
    return () => window.removeEventListener(ART_EVENT, follow);
  }, [firstArt]);

  const on = wantedPrintings.some(
    (printing) => printing === null || shown.length === 0 || shown.includes(printing),
  );
  if (!on) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-extrabold text-accent">
      <Flame className="size-3.5" aria-hidden="true" />
      On your Flares
    </span>
  );
}
