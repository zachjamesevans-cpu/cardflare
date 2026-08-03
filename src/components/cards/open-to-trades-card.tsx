import { cn } from "@/lib/cn";

/**
 * The card that means "I am not after anything in particular".
 *
 * A player with no specific want has no artwork to show, and an empty slot
 * next to everybody else's cards reads as missing data rather than as a
 * deliberate answer. This gives them a card of their own.
 *
 * Built to the same 60×84 box, corner radius and inner frame as the
 * placeholder in `card-thumbnail.tsx`, so on a board of real cards it reads as
 * part of the same family rather than as a stray icon. Deliberately *not* a
 * mock One Piece card: nothing here may be mistaken for real artwork or imply
 * a licence CardFlare does not have.
 *
 * Two crossing arrows and nothing else. The row beside it says "Open to
 * trades" in words, and at the 56px this renders at on a phone, any text
 * inside the card would be unreadable — the same lesson the "any printing"
 * marker taught, where a spelled-out label covered most of the thumbnail.
 *
 * Inline SVG so it costs no request, cannot fail to load, and inherits the
 * theme's colours through `currentColor` and the accent token.
 */
export function OpenToTradesCard({
  className,
  title = "Open to trades",
}: {
  className?: string;
  /** Overridable so the large view can be more specific than the thumbnail. */
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 60 84"
      role="img"
      aria-label={title}
      className={cn("size-full", className)}
    >
      {/* Card body. Same geometry as the placeholder, in the accent instead. */}
      <rect
        x="1"
        y="1"
        width="58"
        height="82"
        rx="5"
        className="fill-elevated stroke-accent/45"
        strokeWidth="1.5"
      />

      {/* A wash so it reads as filled rather than as an outline on a dark row. */}
      <rect x="1" y="1" width="58" height="82" rx="5" className="fill-accent/[0.07]" />

      {/*
       * Inner frame, echoing the placeholder's artwork panel. It is what makes
       * the shape read as "a card" at a glance rather than "an icon in a box".
       */}
      <rect
        x="7"
        y="7"
        width="46"
        height="70"
        rx="3"
        className="fill-none stroke-accent/20"
        strokeWidth="1"
      />

      {/*
       * The exchange glyph: one arrow out, one arrow back. Drawn rather than
       * borrowed from the icon set so it can be weighted for this size — at
       * 56px a hairline icon disappears.
       */}
      <g
        className="stroke-accent"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        <path d="M18 34 H39" />
        <path d="M33 28 L40 34 L33 40" />
        <path d="M42 50 H21" />
        <path d="M27 44 L20 50 L27 56" />
      </g>
    </svg>
  );
}

/**
 * The mark at thumbnail size, in the wrapper the real card thumbnails use.
 *
 * Matching `CardThumbnail`'s box exactly — same width, same aspect ratio, same
 * corner radius — so a board mixing real cards and this one does not stagger.
 */
export function OpenToTradesThumbnail({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative aspect-[60/84] w-14 shrink-0 overflow-hidden rounded-[6px]",
        className,
      )}
    >
      <OpenToTradesCard className="absolute inset-0" />
    </div>
  );
}
