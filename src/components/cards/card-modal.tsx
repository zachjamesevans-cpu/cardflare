"use client";

import { FlareButton } from "@/components/flares/flare-button";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/cn";

/** The close animation's length, before the route goes back. */
const CLOSE_MS = 220;

/**
 * A card opened over the page it was clicked on, floating on it: the page
 * behind blurs and darkens and the card and its details sit on that, with
 * no panel - the way a card in a Feed post opens. The founder: "notice
 * how when you click on a card in the feed, it blurs the background and
 * stuff. thats what i thought you were building for the other elements,
 * such as when you search a card." The app's card screen is the same.
 *
 * Closing fades it away first, then goes back, so the page underneath is
 * exactly where it was. Escape, the close button and a click on the blur
 * all close it. A card's own URL still opens the full page
 * (src/app/cards/[cardId]).
 */
export function CardModal({
  cardId,
  children,
}: {
  cardId: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [closing, setClosing] = useState(false);

  const close = useCallback(() => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(() => router.back(), CLOSE_MS);
  }, [closing, router]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [close]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Card"
      className="fixed inset-0 z-[100] flex justify-center"
    >
      {/* The page behind, blurred and darkened: the card zoom's own
          backdrop (card-image-zoom.tsx). A click on it closes. */}
      <button
        type="button"
        aria-label="Close card"
        onClick={close}
        className={cn(
          "absolute inset-0 cursor-default bg-black/50 backdrop-blur-[14px]",
          closing ? "cf-sheet-backdrop-out" : "cf-sheet-backdrop-in",
        )}
      />
      {/* No panel: the card and its details float on the blur. */}
      <div
        className={cn(
          "relative flex h-full w-full max-w-2xl flex-col",
          closing ? "cf-sheet-backdrop-out" : "cf-sheet-backdrop-in",
        )}
      >
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="absolute top-4 right-4 z-10 flex size-9 cursor-pointer items-center justify-center rounded-full bg-white/15 text-text-primary transition-colors hover:bg-white/25"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
        <div className="overflow-y-auto px-4 pt-16 pb-28 sm:px-6">{children}</div>
        {/* The Flare button, for THIS card (flare-button.tsx). */}
        <FlareButton
          href={`/flare?card=${cardId}`}
          label="Flare this card"
          className="absolute right-4 bottom-6"
        />
      </div>
    </div>
  );
}
