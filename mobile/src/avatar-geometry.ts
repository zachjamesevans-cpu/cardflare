/**
 * Where a worn cosmetic is drawn, relative to the picture it is worn on.
 *
 * Every one of these numbers exists on the website first, in
 * `src/app/cosmetic-art.css`, as an inset or a mask on a layer around
 * the avatar. React Native has no insets-as-percentages and no masks, so
 * the app has to arrive at the same places by arithmetic - and the first
 * attempt did not. It stroked the ring at a radius INSIDE the picture and
 * drew it underneath, so twenty-five rings people had spent Embers on
 * were not dim or flat, they were invisible. The aura orbited inside the
 * picture too, which is what the founder saw: "I can kinda see the
 * animated hearts on an avatar, but they're behind the avatar."
 *
 * So the arithmetic lives here on its own, away from any component, and
 * `tests/unit/app-avatar-geometry.test.ts` reads the stylesheet and
 * checks it. A layer that lands on somebody's face, or under it, fails
 * in the test run rather than on a phone three days later.
 *
 * All of them return a `box` (the square the layer is drawn on, bigger
 * than the avatar) and an `offset` (how far to pull that box up and
 * left so it stays centred on the avatar).
 */

/**
 * `.cfx-ring-avatar { inset: -4px }` — the layer a catalogue ring is
 * drawn on, four points proud of the picture on every side.
 */
export const RING_INSET = 4;

/**
 * The band, masked to the outer two points of that layer.
 *
 * Two points of colour, two points of gap, and that is the whole rule.
 * The catalogue drifted to three once and the founder called it "far
 * too thick" — so this is a fixed number of points at every avatar
 * size, exactly as the stylesheet has it, rather than a fraction that
 * would fatten on a profile header.
 */
export const RING_BAND = 2;

/**
 * `.cfx-ring-film { inset: -17.568% }`, which is 400/296.
 *
 * Dropped-in ring art is drawn in a 400 box with the picture filling
 * the middle out to radius 148. Scaling the film by 400/296 puts radius
 * 148 exactly on the avatar's edge, so the art is tangent to the
 * picture and covers none of it.
 */
export const FILM_SCALE = 400 / 296;

/** `.cfx-aura-avatar { inset: -18% }` — wider than the ring layer, so
    the two mix without colliding. */
export const AURA_INSET = 0.18;

/**
 * Where the aura's particles ride, as a fraction of the avatar's width.
 *
 * The website scatters a tiled particle layer across the whole aura box
 * and masks the middle out (`transparent 52%, #000 70%`), so nothing is
 * visible until 0.476 of the avatar's width from centre and everything
 * is by 0.68. A phone draws discrete particles rather than a tile, so
 * they need one radius, and it has to sit in that same visible band.
 *
 * 0.60 rather than something tighter because the stylesheet says the
 * aura layer "sits a little wider than the ring layer so the two mix
 * without colliding", and at profile size a tighter orbit puts the
 * particles straight onto the ring band. It cannot hold at every size —
 * the band is a fixed two points and this is a fraction, so on a 24pt
 * roster avatar they overlap again — but that is the web's own bargain
 * and it is the big avatar anybody actually studies.
 *
 * The number that matters is that it is GREATER THAN 0.5. At 0.44 —
 * where this started — every particle orbited inside the picture.
 */
export const AURA_ORBIT = 0.6;

export interface Layer {
  /** The square the layer draws on. */
  box: number;
  /** How far to pull the box up and left to keep it centred. */
  offset: number;
}

/** A catalogue ring: a band of `strokeWidth` centred on `radius`. */
export function ringLayer(size: number): Layer & {
  radius: number;
  strokeWidth: number;
} {
  const box = size + RING_INSET * 2;

  return {
    box,
    offset: RING_INSET,
    /* Outer edge on the layer's edge, so the band runs from the
       picture's edge plus a two-point gap to plus four. */
    radius: box / 2 - RING_BAND / 2,
    strokeWidth: RING_BAND,
  };
}

/** A catalogue aura: particles orbiting `centre` at `orbit`. */
export function auraLayer(size: number): Layer & {
  centre: number;
  orbit: number;
} {
  const box = size * (1 + AURA_INSET * 2);

  return {
    box,
    offset: size * AURA_INSET,
    centre: box / 2,
    orbit: size * AURA_ORBIT,
  };
}

/** A dropped-in art file, worn as either slot. */
export function filmLayer(size: number): Layer {
  const box = size * FILM_SCALE;

  return { box, offset: (box - size) / 2 };
}
