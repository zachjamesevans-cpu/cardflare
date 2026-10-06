import { binderIdFromLink, binderOwner, readBinder } from "@/lib/binder/binder";
import { binderShareImage, SHARE_IMAGE_SIZE } from "@/lib/binder/share-image";

export const alt = "A trade binder on cardflare";
export const size = SHARE_IMAGE_SIZE;
export const contentType = "image/png";

/**
 * The picture a shared binder link unfurls with (see `binderShareImage`).
 * Only what a signed-out visitor could open: a private or missing binder
 * gets the plain card, never its contents.
 */
export default async function BinderImage({
  params,
}: {
  params: Promise<{ binderId: string }>;
}) {
  const id = await binderIdFromLink((await params).binderId);
  const owner = id ? await binderOwner(id) : null;
  const binder = owner && id ? await readBinder(owner, null, id) : null;
  return binderShareImage(binder, binder ? owner : null);
}
