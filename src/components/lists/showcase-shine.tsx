import type { ReactNode } from "react";

/**
 * Wraps a showcased card so it always looks like foil.
 *
 * The founder's correction: the sheen is not an effect that plays, it
 * is what the card IS. A showcase sits on a matte board and shimmers
 * the whole time, so the meaning reads at a glance without tapping
 * anything — which is the entire point of putting it at the top of a
 * player's nest.
 *
 * That makes this a Server Component again. The first cut needed state
 * to time a one-shot animation; a permanent sheen needs none, so a
 * board of showcases ships no JavaScript for it at all. The gyroscope
 * tilt is a different thing in a different place: it belongs to the
 * full-size card in the zoom dialog, where a phone can be turned.
 */
export function ShowcaseShine({ children }: { children: ReactNode }) {
  return (
    <span className="relative block rounded-[8px]">
      {children}
      <span aria-hidden="true" className="holo-sheen-layer" />
    </span>
  );
}
