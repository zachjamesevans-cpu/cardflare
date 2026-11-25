"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ART_EVENT, shownArtPrinting } from "@/components/cards/card-art-carousel";
import { Plus } from "lucide-react";

import { cn } from "@/lib/cn";

/**
 * THE FLARE BUTTON: one cardflare-green "+ flame" in the same corner,
 * always "post a Flare" for whatever is on screen. The founder
 * (2026-11-25): "a persistent cardflare green '+ flame icon' everywhere
 * on the app. its contextual." On a card it flares that card; anywhere
 * else it opens the composer. It replaced the Feed's + and a card page's
 * "Post a Flare for it". The app draws the same (mobile/src/flare-button.tsx).
 *
 * The label says what THIS click does, for a screen reader, because the
 * glyph cannot. It carries the first-run spotlight the Feed's + did.
 */
export function FlareButton({
  href,
  label,
  className,
}: {
  href: string;
  label: string;
  className?: string;
}) {
  /* On a card, the art on show goes with it: each art is its own line
     in the composer (the founder, "all alternate arts need to be
     treated as separate cards"). */
  const [printing, setPrinting] = useState<string | null>(null);
  useEffect(() => {
    if (!href.startsWith("/flare?card=")) return;
    const follow = () => setPrinting(shownArtPrinting);
    follow();
    window.addEventListener(ART_EVENT, follow);
    return () => window.removeEventListener(ART_EVENT, follow);
  }, [href]);
  const target =
    printing && href.startsWith("/flare?card=") ? `${href}&printing=${printing}` : href;
  return (
    <Link
      href={target}
      aria-label={label}
      title={label}
      data-spotlight="post-flare"
      className={cn(
        "flex size-14 items-center justify-center rounded-full bg-accent text-accent-contrast shadow-[0_6px_22px_-4px_var(--color-accent)] transition-transform hover:scale-105 active:scale-95",
        className,
      )}
    >
      {/* One bold +, nothing else (the app's is the same): the founder,
          of the flame with a + disc on its shoulder, "still so ugly". */}
      <Plus className="size-7" strokeWidth={2.75} aria-hidden="true" />
    </Link>
  );
}

/** Pages where the button would only be in the way. */
const NO_FLARE_BUTTON = [/^\/flare(\/|$)/, /^\/local(\/|$)/, /^\/messages(\/|$)/];

/** What the button does here: a card's page flares that card. */
export function flareTarget(pathname: string): { href: string; label: string } | null {
  if (NO_FLARE_BUTTON.some((pattern) => pattern.test(pathname))) return null;
  const card = /^\/cards\/([0-9a-f-]{36})/i.exec(pathname);
  if (card) return { href: `/flare?card=${card[1]}`, label: "Flare this card" };
  return { href: "/flare", label: "Post a Flare" };
}
