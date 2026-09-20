"use client";

import { StoreImageForm } from "./store-image-form";

/** The logo: a 512 square, cropped to 1:1 in the browser. */
export function StoreLogoForm({
  storeId,
  hasLogo,
}: {
  storeId: string;
  hasLogo: boolean;
}) {
  return <StoreImageForm storeId={storeId} kind="logo" current={hasLogo} />;
}
