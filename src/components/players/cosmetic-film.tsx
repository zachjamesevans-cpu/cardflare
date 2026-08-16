import { RiveArt } from "@/components/players/rive-art";
import type { CosmeticArtFileRef } from "@/components/players/cosmetic-art";
import { cn } from "@/lib/cn";

/**
 * A cosmetic's uploaded art, drawn - whichever kind of file it is.
 *
 * One component so no surface has to know the difference. A Rive file
 * plays in a canvas; a drawing is an `<img>`, deliberately: browsers
 * refuse to run scripts in an image no matter what the file says, so
 * an SVG that reached a player's screen cannot execute there even if
 * the scrubber at upload missed something. Its CSS keyframes still
 * animate - that is the part worth having, and it was measured rather
 * than assumed.
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
