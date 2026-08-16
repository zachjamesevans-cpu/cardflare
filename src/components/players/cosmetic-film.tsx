import { RiveArt } from "@/components/players/rive-art";
import type { CosmeticArtFileRef } from "@/components/players/cosmetic-art";
import { cn } from "@/lib/cn";

/**
 * A cosmetic's uploaded art, drawn - whichever kind of file it is.
 *
 * One component so no surface has to know the difference, and three
 * ways of drawing, each chosen for how it contains the file:
 *
 *   svg  - an `<img>`. Browsers refuse to run scripts in an image no
 *          matter what the file says, so a drawing that reached a
 *          player's screen cannot execute there even if the scrubber
 *          missed something. Its CSS keyframes still animate: that is
 *          the part worth having, and it was measured rather than
 *          assumed.
 *   html - an iframe with `sandbox` and NO `allow-scripts`. Same
 *          bargain by a different route: CSS animations run,
 *          JavaScript cannot run at all, and the frame has no access
 *          to the page around it. The document it loads carries a
 *          `default-src 'none'` policy so it cannot fetch either.
 *   rive - a canvas. Nothing new arrives as Rive - the founder is done
 *          with it - but what is already in the catalogue still plays.
 */
export function CosmeticFilm({
  art,
  fit = "contain",
  className,
}: {
  art: CosmeticArtFileRef;
  fit?: "cover" | "contain";
  className?: string;
}) {
  if (art.kind === "rive") {
    return (
      <RiveArt
        url={art.url}
        artboard={art.artboard}
        stateMachine={art.stateMachine}
        fit={fit}
        className={className}
      />
    );
  }

  if (art.kind === "html") {
    return (
      <iframe
        src={art.url}
        title=""
        aria-hidden="true"
        tabIndex={-1}
        /* No allow-scripts, on purpose: this is the containment, not a
           formality. Removing it would let uploaded markup run code on
           a player's profile. */
        sandbox=""
        scrolling="no"
        loading="lazy"
        className={cn(
          "pointer-events-none block size-full border-0 bg-transparent",
          className,
        )}
      />
    );
  }

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={art.url}
      alt=""
      aria-hidden="true"
      className={cn(
        "pointer-events-none block size-full",
        fit === "cover" ? "object-cover" : "object-contain",
        className,
      )}
    />
  );
}
