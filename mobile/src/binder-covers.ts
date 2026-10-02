import type { colors } from "./theme";

/**
 * The trade binder's covers and page layouts: the app's half of
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
 */

export type BinderLayout = 2 | 3;

export const BINDER_LAYOUTS: readonly BinderLayout[] = [2, 3];

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
export const DEFAULT_BINDER_LAYOUT: BinderLayout = 3;

export function isBinderCover(value: unknown): value is BinderCoverId {
  return BINDER_COVERS.some((cover) => cover.id === value);
}

export function isBinderLayout(value: unknown): value is BinderLayout {
  return value === 2 || value === 3;
}

export function binderCover(id: BinderCoverId): BinderCover {
  return BINDER_COVERS.find((cover) => cover.id === id) ?? BINDER_COVERS[0]!;
}

/** "24 cards to trade", "1 card to trade", "Nothing to trade yet". */
export function binderCountLine(count: number): string {
  if (count === 0) return "Nothing to trade yet";
  return `${count} ${count === 1 ? "card" : "cards"} to trade`;
}

/** "3 on your hunts", "1 on your hunts", or null when none. */
export function binderMatchLine(onYourHunts: number): string | null {
  if (onYourHunts <= 0) return null;
  return `${onYourHunts} on your hunts`;
}

/** Pockets per page: four or nine, the two binders people actually own. */
export function pocketsPerPage(layout: BinderLayout): number {
  return layout * layout;
}
