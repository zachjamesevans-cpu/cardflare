import { cn } from "@/lib/cn";
import { CardThumbnail } from "@/components/cards/card-thumbnail";

/**
 * A showcased card, wearing whatever the player bought.
 *
 * Three independent slots — frame, holo, effect — each mapped from a
 * catalogue slug to a class name in `globals.css`. The maps are written
 * out in full rather than assembled from the slug, twice over:
 *
 *   1. Tailwind cannot see a class name built at runtime, and neither
 *      can a person grepping for where a style is used.
 *   2. An unknown slug then falls through to nothing, which is the right
 *      failure. A cosmetic that was removed from the catalogue should
 *      leave a plain card, not a broken one.
 */

/** Exported for the test that keeps this map, the avatar map, the CSS
    and the catalogue migrations agreeing on the set of frame slugs. */
export const FRAME_CLASS: Record<string, string> = {
  plain: "",
  "ember-edge": "cf-frame-ember-edge",
  "lime-edge": "cf-frame-lime-edge",
  "prism-edge": "cf-frame-prism-edge",
  "frost-edge": "cf-frame-frost-edge",
  "rose-edge": "cf-frame-rose-edge",
  "gilded-edge": "cf-frame-gilded-edge",
  "molten-edge": "cf-frame-molten-edge",
  "galaxy-edge": "cf-frame-galaxy-edge",
};

const HOLO_CLASS: Record<string, string> = {
  "none-holo": "",
  "classic-holo": "cf-holo-classic-holo",
  "prism-holo": "cf-holo-prism-holo",
  "galaxy-holo": "cf-holo-galaxy-holo",
};

const EFFECT_CLASS: Record<string, string> = {
  still: "",
  shimmer: "cf-effect-shimmer",
  pulse: "cf-effect-pulse",
  orbit: "cf-effect-orbit",
};

export function CosmeticCard({
  imageUrl,
  name,
  number,
  imagesEnabled,
  frame,
  holo,
  effect,
  className,
}: {
  imageUrl: string | null;
  name: string;
  number: string;
  imagesEnabled: boolean;
  /** Catalogue slugs. Null means the free default for that slot. */
  frame: string | null;
  holo: string | null;
  effect: string | null;
  className?: string;
}) {
  return (
    <div className={cn("cf-showcase", frame ? FRAME_CLASS[frame] : "", className)}>
      <CardThumbnail
        imageUrl={imageUrl}
        exactName={name}
        cardNumber={number}
        enabled={imagesEnabled}
        className="w-full"
      />

      {/*
       * Always mounted, even for Matte, so equipping a pattern does not
       * change the shape of the DOM — and so the blend modes always have
       * the same element to sit on. Decorative by definition: the card's
       * name and number are rendered beside it.
       */}
      <span
        aria-hidden="true"
        className={cn("cf-holo", holo ? HOLO_CLASS[holo] : "")}
      />

      {/*
       * The effect goes on its own layer rather than on the wrapper,
       * because Shimmer's highlight is wider than the card and needs
       * something with `overflow: hidden` to be clipped by. Putting it
       * on the wrapper would let the sweep run across the page.
       */}
      <span
        aria-hidden="true"
        className={cn("cf-effect", effect ? EFFECT_CLASS[effect] : "")}
      />
    </div>
  );
}
