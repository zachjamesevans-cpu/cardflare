import { SITE } from "@/lib/site";

/**
 * Data source and trademark note.
 *
 * Shown wherever card data appears. Deliberately plain and unmissable rather
 * than buried: CardFlare must never read as official, and must never imply it
 * owns card artwork or card data.
 *
 * Names artwork explicitly, not just data. Once images render, a note that
 * mentions only "card data" understates what is on the page.
 */
export function DataAttribution({ className }: { className?: string }) {
  return (
    <p className={className ?? "text-xs leading-relaxed text-text-muted"}>
      Card data and artwork are supplied by third-party data providers and remain the
      property of their respective rights holders. ONE PIECE and the ONE PIECE CARD GAME
      are trademarks of their respective owners. {SITE.name} is not affiliated with or
      endorsed by Bandai, Shueisha, Toei Animation, or other rights holders.
    </p>
  );
}
