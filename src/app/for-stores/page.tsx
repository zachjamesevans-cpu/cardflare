import { permanentRedirect } from "next/navigation";

/**
 * The store page moved to /ultra, the tier's own name. Kept as a
 * redirect because the old path was live for a day and is in a few
 * messages already.
 */
export default function ForStoresRedirect(): never {
  permanentRedirect("/ultra");
}
