import { binderCover, type BinderCoverId } from "@/lib/binder/covers";
import { cn } from "@/lib/cn";

/**
 * A closed binder, seen from the front: the spine on the left, the
 * front card in a window, a label along the bottom.
 *
 * The one place a cover is drawn on the website. The profile panel,
 * the binder page and the cover swatches all come here, so a cover
 * looks the same wherever it sits and the app's `binder-cover.tsx`
 * has one drawing to match. The founder, starting the binder: "I'm
 * down for the front being a card... a few simple color change
 * options, no animated stuff yet." So a cover is two brand colours,
 * dark at the spine and bright at the edge, and nothing moves.
 *
 * Geometry, the same on both platforms: rounded 4px on the left and
 * 12px on the right; a spine strip 9% wide; three ring dots on the
 * spine's edge at 18%, 49% and 80%; the window at left 22%, top 11%,
 * 56% wide and 58% tall; the label at bottom 8%.
 */

export type BinderCoverSize = "lg" | "sm" | "xs";

/* lg 232x300: the binder page. sm 100x130: the profile panel.
   xs 58x76: lists and swatches. */
const BOX: Record<BinderCoverSize, string> = {
  lg: "h-[300px] w-[232px]",
  sm: "h-[130px] w-[100px]",
  xs: "h-[76px] w-[58px]",
};

const DOT: Record<BinderCoverSize, string> = {
  lg: "size-2.5 right-[-3px]",
  sm: "size-2 right-[-2px]",
  xs: "size-1.5 right-[-2px]",
};

const LABEL: Record<BinderCoverSize, string> = {
  lg: "py-1.5 text-[11px]",
  sm: "py-0.5 text-[7px]",
  xs: "py-px text-[5px]",
};

export function BinderCover({
  cover,
  frontImageUrl,
  label,
  size = "sm",
  className,
}: {
  cover: BinderCoverId;
  /** The front card's picture, or null for an empty window. */
  frontImageUrl: string | null;
  /** "CHUNC's binder", "Your binder", or nothing on a swatch. */
  label?: string | null;
  size?: BinderCoverSize;
  className?: string;
}) {
  const { edge, spine } = binderCover(cover);

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-l-[4px] rounded-r-[12px] shadow-[var(--shadow-card)]",
        BOX[size],
        className,
      )}
      style={{ background: `linear-gradient(90deg, ${spine}, ${edge})` }}
    >
      {/* A soft sheen, so a flat colour still reads as a cover. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(135deg,rgb(255_255_255/0.18),transparent_40%,rgb(0_0_0/0.25))]"
      />

      {/* The spine: darker, with the three rings showing at its edge. */}
      <div aria-hidden="true" className="absolute inset-y-0 left-0 w-[9%] bg-black/45">
        {["18%", "49%", "80%"].map((top) => (
          <span
            key={top}
            style={{ top }}
            className={cn(
              "absolute rounded-full bg-elevated ring-1 ring-border-strong",
              DOT[size],
            )}
          />
        ))}
      </div>

      {/* The window: the front card, or an empty pane. */}
      <div className="absolute top-[11%] left-[22%] h-[58%] w-[56%] overflow-hidden rounded-[6px] bg-canvas/70 ring-2 ring-black/50">
        {frontImageUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={frontImageUrl} alt="" className="size-full object-cover" />
        )}
      </div>

      {label && (
        <div
          className={cn(
            "absolute right-[8%] bottom-[8%] left-[22%] truncate rounded-[4px] bg-canvas/80 px-1 text-center font-bold tracking-wide text-text-primary uppercase",
            LABEL[size],
          )}
        >
          {label}
        </div>
      )}
    </div>
  );
}
