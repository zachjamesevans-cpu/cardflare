import { binderCover, type BinderCoverId } from "@/lib/binder/covers";
import { cn } from "@/lib/cn";

/**
 * A closed binder, seen from the front: a zip binder, the kind on
 * every trade table.
 *
 * The one place a cover is drawn on the website. The Binders list,
 * the binder page and the cover swatches all come here, so a cover
 * looks the same wherever it sits and the app's `binder-cover.tsx`
 * has one drawing to match. The founder, on the first version: "the
 * binder shouldn't be modeled after a 3 ring binder", and sent a
 * photo of the zip binder most players carry. So: no rings, no
 * glass, nothing shiny. A matte body in the cover's bright colour
 * with a fine weave, a thin padded spine on the left, big rounded
 * corners on the right, a zipper along the top, right and bottom with
 * its pull at the top-left, and the binder's name embossed low on
 * the cover, tone on tone.
 *
 * There is no picture on the cover. The founder, on the front card
 * the first version showed: "Delete the ability to have a picture on
 * the binder, it's tacky imo." So the cover is its colour and its
 * name, and the name is the binder's own ("Grails", "Playables"),
 * which is the text he asked to be able to change.
 *
 * Geometry, the same on both platforms: rounded 2px on the left and
 * 10% of the width on the right; a spine 5% wide; the zipper inset
 * 4% from the top, right and bottom; the pull 10% wide and 4% tall;
 * the label at bottom 9%, left 8%.
 */

export type BinderCoverSize = "lg" | "sm" | "xs";

/* lg 232x300: the binder page. sm 100x130: the Binders list.
   xs 58x76: swatches. The right corners are 10% of the width, so
   each size carries its own radius. */
const BOX: Record<BinderCoverSize, string> = {
  lg: "h-[300px] w-[232px] rounded-r-[23px]",
  sm: "h-[130px] w-[100px] rounded-r-[10px]",
  xs: "h-[76px] w-[58px] rounded-r-[6px]",
};

/* The zipper's track follows the body's corner, a little inside it. */
const TRACK: Record<BinderCoverSize, string> = {
  lg: "rounded-r-[18px]",
  sm: "rounded-r-[8px]",
  xs: "rounded-r-[4px]",
};

const LABEL: Record<BinderCoverSize, string> = {
  lg: "text-[12px]",
  sm: "text-[8px]",
  xs: "text-[5px]",
};

export function BinderCover({
  cover,
  label,
  size = "sm",
  plain = false,
  className,
}: {
  cover: BinderCoverId;
  /** The binder's name, or nothing on a swatch. */
  label?: string | null;
  size?: BinderCoverSize;
  /** A swatch: the body, spine and zipper only, no name. */
  plain?: boolean;
  className?: string;
}) {
  const { edge, spine } = binderCover(cover);

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-l-[2px] shadow-[var(--shadow-card)]",
        BOX[size],
        className,
      )}
      style={{ background: edge }}
    >
      {/* The weave: a very fine diagonal, so the matte fabric reads
          as fabric and not as a flat fill. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[repeating-linear-gradient(45deg,rgb(0_0_0/0.06)_0_1px,transparent_1px_3px)]"
      />

      {/* The spine: the padded edge, straight, in the dark colour. */}
      <div
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-[5%]"
        style={{ background: spine }}
      />

      {/* The zipper: a dashed track along the top, the right and the
          bottom, starting where the spine ends. */}
      <div
        aria-hidden="true"
        className={cn(
          "absolute top-[4%] right-[4%] bottom-[4%] left-[5%] border-y-2 border-r-2 border-dashed opacity-70",
          TRACK[size],
        )}
        style={{ borderColor: spine }}
      />

      {/* The pull, where the zipper starts: the one accent on the cover. */}
      <div
        aria-hidden="true"
        className="absolute top-[2%] left-[7%] h-[4%] w-[10%] rounded-[2px] bg-accent"
      />

      {/* The name, embossed: the dark colour on the bright one, with
          a hairline of light under each letter. Names are names, so
          the letters stay as the owner wrote them. */}
      {!plain && label && (
        <div
          className={cn(
            "absolute right-[8%] bottom-[9%] left-[8%] truncate font-bold",
            LABEL[size],
          )}
          style={{
            color: `color-mix(in oklab, ${spine} 85%, transparent)`,
            textShadow: "0 1px 0 rgb(255 255 255/0.12)",
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
}
