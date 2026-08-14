import type { SeriesManifest } from "../manifest";

/**
 * Set 1: Origin.
 *
 * The first CardFlare pack. Every cosmetic in the launch catalogue can
 * pull here, weighted by rarity - the founder's rule: Galaxy foil is
 * the rarest thing in the set. Weights are percent and must sum to
 * exactly 100; a unit test enforces it, and another checks every slug
 * against the migrations so a typo cannot ship an unwinnable card.
 *
 * Future sets are new folders beside this one, registered in
 * ../index.ts. This folder is Origin's permanent home: when the set
 * rotates, its odds stay here as the record of what Set 1 was.
 */
export const origin: SeriesManifest = {
  id: "origin",
  name: "Origin",
  setNumber: 1,
  priceEmbers: 300,
  slots: 3,
  pool: [
    { slug: "ember-edge", rarity: "common", weight: 14 },
    { slug: "frost-edge", rarity: "common", weight: 14 },
    { slug: "rose-edge", rarity: "common", weight: 12 },

    { slug: "classic-holo", rarity: "uncommon", weight: 12 },
    { slug: "shimmer", rarity: "uncommon", weight: 10 },
    { slug: "gilded-edge", rarity: "uncommon", weight: 9 },

    { slug: "prism-edge", rarity: "rare", weight: 8 },
    { slug: "pulse", rarity: "rare", weight: 7 },
    { slug: "prism-holo", rarity: "rare", weight: 5 },

    { slug: "molten-edge", rarity: "epic", weight: 4 },
    { slug: "orbit", rarity: "epic", weight: 2.5 },

    { slug: "galaxy-edge", rarity: "legendary", weight: 1.5 },
    /* The rarest pull in the set, by the founder's decree. */
    { slug: "galaxy-holo", rarity: "legendary", weight: 1 },
  ],
};
