import type { colors } from "./theme";

/**
 * The binder's covers and its one page size: the app's half of
 * src/lib/binder/covers.ts, mirrored word for word.
 *
 * Same ids, same names, same two colours per cover. The website names
 * its colours as CSS custom properties; here they are KEYS into the
 * theme, so the cover component reads `colors[edge]` and a hex value
 * never lands outside theme.ts. A cover is two brand colours, dark at
 * the spine and bright at the edge, and nothing else: no art, no
 * animation. The founder, starting the binder: "a basic version of it
 * first with a few simple color change options, no animated stuff
 * yet." Names follow the cosmetic rule in AGENTS.md: the heading says
 * Cover, so the name says only the colour.
 *
 * Every page is three by three. The founder, on the phone: "The 2x2
 * and 3x3 are both broken on phone. I think it may be best to not
 * even give them the option for a 2x2. Just have a 3x3." So there is
 * no layout to pick and no layout to store; the server still says
 * `layout: 3` on every binder, and this is where that number lives.
 */

export type BinderCoverId =
  "charcoal" | "lime" | "ember" | "frost" | "rose" | "galaxy" | "gold";

type ColorKey = keyof typeof colors;

export interface BinderCover {
  id: BinderCoverId;
  name: string;
  /** Theme keys, bright edge and dark spine. */
  edge: ColorKey;
  spine: ColorKey;
}

export const BINDER_COVERS: readonly BinderCover[] = [
  { id: "charcoal", name: "Charcoal", edge: "elevated", spine: "canvas" },
  { id: "lime", name: "Lime", edge: "accent", spine: "accentMuted" },
  { id: "ember", name: "Ember", edge: "ember", spine: "emberDeep" },
  { id: "frost", name: "Frost", edge: "frost", spine: "frostDeep" },
  { id: "rose", name: "Rose", edge: "rose", spine: "roseDeep" },
  { id: "galaxy", name: "Galaxy", edge: "galaxy", spine: "galaxyDeep" },
  { id: "gold", name: "Gold", edge: "gold", spine: "goldDeep" },
];

export const DEFAULT_BINDER_COVER: BinderCoverId = "charcoal";

/** Pockets across and down a page: three, the one binder people own. */
export const BINDER_LAYOUT = 3;
/** Pockets on a page: nine. */
export const POCKETS_PER_PAGE = BINDER_LAYOUT * BINDER_LAYOUT;

export function isBinderCover(value: unknown): value is BinderCoverId {
  return BINDER_COVERS.some((cover) => cover.id === value);
}

export function binderCover(id: BinderCoverId): BinderCover {
  return BINDER_COVERS.find((cover) => cover.id === id) ?? BINDER_COVERS[0]!;
}

/**
 * The covers a hunt can wear, in the order the sum is taken against.
 * Every cover but charcoal: a hunt is drawn like a binder, and six
 * colours tell six hunts apart on the tab where one grey would not.
 */
const HUNT_COVERS: readonly BinderCoverId[] = [
  "lime",
  "ember",
  "frost",
  "rose",
  "galaxy",
  "gold",
];

/**
 * A hunt's cover, from its id: the sum of the id's character codes,
 * modulo the six, so the same hunt wears the same colour on every
 * device and on the website, and nothing has to be stored.
 */
export function huntCover(huntId: string): BinderCoverId {
  let sum = 0;
  for (let index = 0; index < huntId.length; index += 1) {
    sum += huntId.charCodeAt(index);
  }
  return HUNT_COVERS[sum % HUNT_COVERS.length]!;
}
