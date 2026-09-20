"use client";

import { StoreImageForm } from "./store-image-form";

/** The banner: the player cover's 4:3, top-anchored, cropped in the browser. */
export function StoreBannerForm({
  storeId,
  hasBanner,
}: {
  storeId: string;
  hasBanner: boolean;
}) {
  return <StoreImageForm storeId={storeId} kind="banner" current={hasBanner} />;
}
