/**
 * A store's pictures: where they live and how big they are.
 *
 * The founder: "think of the store pages similar to how players can
 * customize their pages. banner image, etc." So a store's logo and
 * banner take the player's own pipeline, prefix for prefix: the same
 * bucket, the same JPEG, the same /api/avatars proxy, the same
 * top-anchored 1200x900 banner a player cover is, so ProfileCover can
 * draw either without knowing which. A post's picture rides the same
 * way. Plain module: the browser, the actions and the app route all
 * read it.
 */

import {
  AVATAR_MAX_BYTES,
  AVATAR_MIME_TYPES,
  COVER_HEIGHT,
  COVER_WIDTH,
} from "@/lib/players/profile-image";

export const STORE_LOGO_SIZE = 512;
export const STORE_BANNER_WIDTH = COVER_WIDTH;
export const STORE_BANNER_HEIGHT = COVER_HEIGHT;
/** A post's picture: wide, not tall, so a card of text keeps its shape. */
export const STORE_POST_IMAGE_WIDTH = 1200;
export const STORE_POST_IMAGE_HEIGHT = 675;
export const STORE_IMAGE_MAX_BYTES = AVATAR_MAX_BYTES;
export const STORE_IMAGE_MIME_TYPES = AVATAR_MIME_TYPES;

export type StoreImageKind = "logo" | "banner" | "post";

export const storeLogoObjectPath = (storeId: string, at = Date.now()) =>
  `store-logos/${storeId}/${at}.jpg`;
export const storeBannerObjectPath = (storeId: string, at = Date.now()) =>
  `store-banners/${storeId}/${at}.jpg`;
export const storePostImageObjectPath = (storeId: string, at = Date.now()) =>
  `store-posts/${storeId}/${at}.jpg`;
