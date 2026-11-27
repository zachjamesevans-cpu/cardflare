"use client";

import Link from "next/link";

import { useCartCount } from "@/components/flares/flare-cart";

/**
 * The foot of /search?adding=1, "Add cards" from the composer: back to
 * your Flare with what the cards' + put in it. The founder (2026-11-27),
 * of the composer's old list beside Search: "should we make them the
 * same?" The app's AddCards screen has the same Done (add-cards.tsx).
 */
export function AddCardsBar({ href }: { href: string }) {
  const count = useCartCount();
  return (
    <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-40 mt-6 sm:bottom-6">
      <Link
        href={href}
        className="flex h-12 w-full items-center justify-center rounded-[12px] bg-accent text-base font-extrabold text-accent-contrast shadow-[var(--shadow-panel)]"
      >
        {count > 0 ? `Done (${count})` : "Done"}
      </Link>
    </div>
  );
}
