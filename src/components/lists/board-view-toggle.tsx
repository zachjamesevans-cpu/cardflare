import Link from "next/link";

import { cn } from "@/lib/cn";

/**
 * The file-browser trick: same board, two geometries.
 *
 * One component because the board renders on three surfaces — the room
 * page, the store dashboard's event page, and the admin snapshot — and
 * the founder found the second one still stacked with no way to switch.
 * A shared control cannot drift.
 *
 * Links, not buttons: the choice rides the URL, so every surface stays a
 * Server Component with zero JavaScript for the switch. The bare path is
 * the carousel, the default everywhere.
 */
export function BoardViewToggle({
  basePath,
  view,
}: {
  basePath: string;
  view: "stacked" | "carousel";
}) {
  const pill = (active: boolean) =>
    cn(
      "rounded-[5px] px-2.5 py-1 text-xs font-medium transition-colors",
      active ? "bg-accent/15 text-accent" : "text-text-muted hover:text-text-secondary",
    );

  return (
    <div
      className="flex shrink-0 items-center gap-1 rounded-[var(--radius-control)] border border-border p-1"
      role="group"
      aria-label="Board layout"
    >
      <Link
        href={basePath}
        aria-current={view === "carousel" ? "true" : undefined}
        className={pill(view === "carousel")}
      >
        Carousel
      </Link>
      <Link
        href={`${basePath}?view=stacked`}
        aria-current={view === "stacked" ? "true" : undefined}
        className={pill(view === "stacked")}
      >
        Stacked
      </Link>
    </div>
  );
}
