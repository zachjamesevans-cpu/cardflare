"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Plus } from "lucide-react";

import { ART_EVENT, shownArtPrinting } from "@/components/cards/card-art-carousel";
import { addToCart, copiesInCart, useCartCount } from "@/components/flares/flare-cart";
import { cn } from "@/lib/cn";

/* A tight glow that keeps the edge crisp, not a wide haze over the
   cards under it (the founder, 2026-11-27). The app's
   matches (mobile/src/flare-button.tsx). */
const BUTTON =
  "flex size-14 cursor-pointer items-center justify-center rounded-full bg-accent text-accent-contrast shadow-[0_2px_10px_-2px_var(--color-accent)] transition-transform hover:scale-105 active:scale-95";

/**
 * THE FLARE BUTTON: one cardflare-green + in the same corner. The founder
 * (2026-11-25): "a persistent cardflare green '+' ... everywhere ... its
 * contextual", then, of the flame it first wore, "still so ugly", and of
 * what it does: "similar function to how when you add something to cart,
 * it just tallies up, then you can view 'full cart'."
 *
 * On a card, it puts the art on show in your Flare's draft without
 * leaving the page, says so in a toast with "View Flare (3)", and turns
 * into a ✓ that opens the Flare. Anywhere else it opens /flare, the full
 * cart, wearing the count. The app's is the same (mobile/src/flare-button.tsx,
 * mobile/src/flare-cart.ts). The label says what THIS click does, for a
 * screen reader; it carries the first-run spotlight.
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
  const count = useCartCount();
  /* The cart lives in this browser's storage: read only once here, so
     the first paint matches the server's. */
  const browser = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
  const cardId = /^\/flare\?card=([0-9a-f-]{36})/i.exec(href)?.[1] ?? null;

  /* On a card, the art on show: each art is its own card in a Flare. */
  const [printing, setPrinting] = useState<string | null>(null);
  useEffect(() => {
    if (!cardId) return;
    const follow = () => setPrinting(shownArtPrinting);
    follow();
    window.addEventListener(ART_EVENT, follow);
    return () => window.removeEventListener(ART_EVENT, follow);
  }, [cardId]);

  const [added, setAdded] = useState<string | null>(null);
  useEffect(() => {
    if (!added) return;
    const timer = window.setTimeout(() => setAdded(null), 3200);
    return () => window.clearTimeout(timer);
  }, [added]);

  /* A card landing in the cart: the button pops and the count bounces,
     once, so the add is felt. Only on a rise: a page opening with 3
     waiting stays still. */
  const buttonRef = useRef<HTMLElement | null>(null);
  const badgeRef = useRef<HTMLSpanElement | null>(null);
  /* On a card, the copies of the art on show ("×4"); elsewhere the
     cart's count. Re-read whenever the count moves. */
  const copies = cardId && browser ? copiesInCart(cardId, printing) : 0;
  const tally = cardId ? copies : count;
  const last = useRef(tally);
  useEffect(() => {
    const rose = tally > last.current;
    last.current = tally;
    if (!rose || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const spring = "cubic-bezier(0.34, 1.56, 0.64, 1)";
    buttonRef.current?.animate([{ scale: "1" }, { scale: "1.12" }, { scale: "1" }], {
      duration: 380,
      easing: spring,
    });
    badgeRef.current?.animate([{ scale: "1" }, { scale: "1.35" }, { scale: "1" }], {
      duration: 420,
      easing: spring,
    });
  }, [tally]);

  const badge =
    tally > 0 ? (
      <span
        ref={badgeRef}
        aria-hidden="true"
        className="absolute -top-1 -right-1 flex h-[22px] min-w-[22px] items-center justify-center rounded-full border-2 border-accent bg-canvas px-1 text-xs font-extrabold text-accent tabular-nums"
      >
        {cardId ? `×${copies}` : count > 99 ? "99+" : count}
      </span>
    ) : null;
  const plus = <Plus className="size-7" strokeWidth={2.75} aria-hidden="true" />;

  /* "Added Perona", with the way to the full cart beside it. Drawn at
     the page's top level: inside the card's sheet, whose slide-up
     transform would hold a fixed toast off screen. */
  const toast =
    added &&
    createPortal(
      <div
        role="status"
        className="cf-sheet-backdrop-in fixed right-24 bottom-[calc(env(safe-area-inset-bottom)+1.25rem)] left-4 z-[110] flex items-center gap-3 rounded-[14px] border border-border bg-elevated py-1.5 pr-1.5 pl-4 shadow-[var(--shadow-panel)] sm:right-auto sm:max-w-sm"
      >
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">
          Added {added}
        </span>
        <Link
          href="/flare"
          className="shrink-0 rounded-[10px] bg-accent px-3 py-2 text-[13px] font-extrabold text-accent-contrast"
        >
          View Flare ({count})
        </Link>
      </div>,
      document.body,
    );

  /* Anywhere but a card: open the Flare, the full cart. */
  if (!cardId) {
    return (
      <>
        <Link
          ref={(node) => {
            buttonRef.current = node;
          }}
          href="/flare"
          aria-label={count > 0 ? `Your Flare, ${count} cards` : label}
          title={label}
          data-spotlight="post-flare"
          className={cn(BUTTON, className)}
        >
          {plus}
          {badge}
        </Link>
        {toast}
      </>
    );
  }

  return (
    <>
      <button
        ref={(node) => {
          buttonRef.current = node;
        }}
        type="button"
        aria-label={
          copies > 0
            ? `Add another copy, ${copies} in your Flare`
            : "Add this card to your Flare"
        }
        title="Add to your Flare"
        data-spotlight="post-flare"
        data-tour="card:add"
        onClick={() => {
          /* Every click is one more copy ("tap the + button 4 times
             quickly to add 4 copies"); the toast keeps the tally. */
          void addToCart(cardId, printing).then(({ outcome, name, copies: now }) => {
            if (outcome === "added")
              setAdded(`${name ?? "Card"}${now && now > 1 ? ` ×${now}` : ""}`);
            /* The card could not be read: the composer, the old way. */
            if (outcome === "failed")
              window.location.assign(
                `${href}${printing ? `&printing=${printing}` : ""}`,
              );
          });
        }}
        className={cn(BUTTON, className)}
      >
        {plus}
        {badge}
      </button>
      {toast}
    </>
  );
}

const subscribeNothing = () => () => {};

/** Pages where the button would only be in the way. */
const NO_FLARE_BUTTON = [/^\/flare(\/|$)/, /^\/local(\/|$)/, /^\/messages(\/|$)/];

/** What the button does here: a card's page flares that card. */
export function flareTarget(pathname: string): { href: string; label: string } | null {
  if (NO_FLARE_BUTTON.some((pattern) => pattern.test(pathname))) return null;
  const card = /^\/cards\/([0-9a-f-]{36})/i.exec(pathname);
  if (card) return { href: `/flare?card=${card[1]}`, label: "Flare this card" };
  return { href: "/flare", label: "Post a Flare" };
}
