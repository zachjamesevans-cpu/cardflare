import { SITE } from "@/lib/site";

/**
 * Data source and trademark note.
 *
 * Shown wherever card data appears. Deliberately plain and unmissable rather
 * than buried: CardFlare must never read as official, and must never imply it
 * owns card artwork or card data.
 */
export function DataAttribution({ className }: { className?: string }) {
  return (
    <p className={className ?? "text-xs leading-relaxed text-text-muted"}>
      Card data is supplied by third-party data providers. ONE PIECE and the ONE PIECE
      CARD GAME are trademarks of their respective owners. {SITE.name} is not affiliated
      with or endorsed by Bandai, Shueisha, Toei Animation, or other rights holders.
    </p>
  );
}
