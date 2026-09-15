/**
 * Pro: the first paid tier.
 *
 * This folder is Pro's home. When a Pro feature ships, its code lives
 * here and its flag below flips the capability on for pro, ultra and
 * max at once (the ladder in ../index.ts accumulates upward).
 */
export const manifest = {
  /* Animated GIF profile pictures. Declared ahead of the upload
     pipeline supporting them, so the admin can pre-place players. */
  animatedAvatar: true,
  /*
   * Wearing cosmetics at all. The founder's pricing pivot: "the only
   * customization they can do outside of that on the free tier is a
   * profile picture" — so every equip slot (rings, auras, borders,
   * titles, the lot) is Pro. Free players keep browsing the catalogue
   * and keep their Ember balance; wearing is what Pro sells.
   */
  cosmetics: true,
  /*
   * Trade history: every trade you confirmed, who with, what it paid.
   * The founder: "we forget what we trade sometimes and then we see a
   * missing page in our binder." Every trade is recorded for everyone;
   * reading the list back is Pro. A free player sees the counts and a
   * blurred stand-in, never the rows.
   */
  tradeHistory: true,
} as const;
