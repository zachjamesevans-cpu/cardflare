"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * A card opened over the page it was clicked on, the page dimmed behind
 * it: the founder, "the card should not open a separate screen.
 * background should fade", everywhere a card opens. Closing goes back,
 * so the page underneath is exactly where it was; Escape and a click on
 * the dimmed backdrop close it too. A card's own URL still opens the full
 * page (src/app/cards/[cardId]). The app's card opens the same way.
 */
export function CardModal({ children }: { children: ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") router.back();
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", close);
    };
  }, [router]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Card"
      className="cf-card-modal fixed inset-0 z-[100] flex items-end justify-center sm:items-center"
    >
      <button
        type="button"
        aria-label="Close card"
        onClick={() => router.back()}
        className="absolute inset-0 cursor-default bg-black/75"
      />
      <div className="relative flex max-h-[calc(100dvh-4.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-t-[var(--radius-panel)] border border-border bg-canvas sm:max-h-[90dvh] sm:rounded-[var(--radius-panel)]">
        <div className="flex justify-end px-2 pt-2">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Close"
            className="flex size-9 cursor-pointer items-center justify-center rounded-full bg-elevated text-text-primary transition-colors hover:bg-surface"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <div className="overflow-y-auto px-4 pb-8 sm:px-6">{children}</div>
      </div>
    </div>
  );
}
