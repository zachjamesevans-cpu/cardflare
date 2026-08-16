import { cn } from "@/lib/cn";

/**
 * The banner behind a profile's head: picture, name and badge.
 *
 * It used to be a 112px strip with a hard seam across the avatar's
 * middle - cover above, card below, a visible line between them. The
 * founder's redesign, with a mockup: the art carries all the way down
 * past the name and the Embers badge, and rather than ending it fades
 * out into the block it sits in.
 *
 * Three stacked layers do that, and each is load-bearing:
 *
 *   the picture      - cropped to the box, top-anchored so a face or a
 *                      logo in the upper half survives the crop.
 *   a flat scrim     - a quiet, even darkening. Covers are somebody
 *                      else's artwork and some of them are nearly
 *                      white; without this the name is unreadable on
 *                      exactly the covers people like most.
 *   the fade         - transparent for the top half, then to the card
 *                      colour. This is the effect itself, and it has
 *                      to end on the SAME colour as the surface behind
 *                      it or the fade finishes in a band.
 *
 * One component because three surfaces draw this - your profile,
 * somebody else's, and the room peek - and the old comment beside two
 * of them said "keep them twins", which is a thing code should do
 * rather than a thing a comment should ask for.
 */
export function ProfileCover({
  coverUrl,
  className,
}: {
  coverUrl: string | null;
  /** Height, when a surface needs a shorter one than the default. */
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-x-0 top-0 h-72 overflow-hidden",
        className,
      )}
    >
      {coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={coverUrl} alt="" className="size-full object-cover object-top" />
      ) : (
        <div className="size-full bg-elevated" />
      )}

      <div className="absolute inset-0 bg-black/25" />

      {/*
       * `to-surface` and not `to-transparent`: the fade has to land on
       * the colour of the card underneath, or the art stops against a
       * lighter edge instead of dissolving into it.
       */}
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-b from-transparent via-surface/80 to-surface" />
    </div>
  );
}
