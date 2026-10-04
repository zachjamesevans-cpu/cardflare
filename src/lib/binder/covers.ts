/**
 * The trade binder's covers and page layouts.
 *
 * Client-safe on purpose: the website's panel and the binder page draw
 * a cover from this list, the server validates a chosen cover against
 * it, and `mobile/src/binder-covers.ts` mirrors it word for word.
 *
 * A cover is two brand colours, dark at the spine and bright at the
 * edge, and nothing else: no art, no animation. The founder, starting
 * the binder: "a basic version of it first with a few simple color
 * change options, no animated stuff yet." Names follow the cosmetic
 * rule in AGENTS.md: the heading says Cover, so the name says only the
 * colour.
 */

/** Pages are three by three. The founder: "it may be best to not even give them the option for a 2x2". */
export type BinderLayout = 3;

export type BinderCoverId =
  "charcoal" | "lime" | "ember" | "frost" | "rose" | "galaxy" | "gold";

export interface BinderCover {
  id: BinderCoverId;
  name: string;
  /** CSS custom properties from the @theme block, bright edge and dark spine. */
  edge: string;
  spine: string;
}

export const BINDER_COVERS: readonly BinderCover[] = [
  {
    id: "charcoal",
    name: "Charcoal",
    edge: "var(--color-elevated)",
    spine: "var(--color-canvas)",
  },
  {
    id: "lime",
    name: "Lime",
    edge: "var(--color-accent)",
    spine: "var(--color-accent-muted)",
  },
  {
    id: "ember",
    name: "Ember",
    edge: "var(--color-ember)",
    spine: "var(--color-ember-deep)",
  },
  {
    id: "frost",
    name: "Frost",
    edge: "var(--color-frost)",
    spine: "var(--color-frost-deep)",
  },
  {
    id: "rose",
    name: "Rose",
    edge: "var(--color-rose)",
    spine: "var(--color-rose-deep)",
  },
  {
    id: "galaxy",
    name: "Galaxy",
    edge: "var(--color-galaxy)",
    spine: "var(--color-galaxy-deep)",
  },
  {
    id: "gold",
    name: "Gold",
    edge: "var(--color-gold)",
    spine: "var(--color-gold-deep)",
  },
];

export const DEFAULT_BINDER_COVER: BinderCoverId = "charcoal";
export const DEFAULT_BINDER_LAYOUT: BinderLayout = 3;

export function isBinderCover(value: unknown): value is BinderCoverId {
  return BINDER_COVERS.some((cover) => cover.id === value);
}

export function binderCover(id: BinderCoverId): BinderCover {
  return BINDER_COVERS.find((cover) => cover.id === id) ?? BINDER_COVERS[0]!;
}

/**
 * The covers a hunt can wear: every colour but charcoal, in this
 * order. A hunt has no cover of its own to store, so its cover is
 * chosen from its id, and the same id lands on the same colour on the
 * website and in the app.
 */
const HUNT_COVERS: readonly BinderCoverId[] = [
  "lime",
  "ember",
  "frost",
  "rose",
  "galaxy",
  "gold",
];

/** The cover a hunt wears: the sum of its id's char codes, modulo six. */
export function huntCover(huntId: string): BinderCoverId {
  let sum = 0;
  for (let index = 0; index < huntId.length; index += 1) {
    sum += huntId.charCodeAt(index);
  }
  return HUNT_COVERS[sum % HUNT_COVERS.length]!;
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
