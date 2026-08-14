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
} as const;
