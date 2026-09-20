import "server-only";

import { loadSharp, putAvatarObject, type AvatarOutcome } from "@/lib/players/profile";
import { objectPathFrom } from "@/lib/players/profile-image";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import {
  STORE_BANNER_HEIGHT,
  STORE_BANNER_WIDTH,
  STORE_IMAGE_MAX_BYTES,
  STORE_IMAGE_MIME_TYPES,
  STORE_LOGO_SIZE,
  STORE_POST_IMAGE_HEIGHT,
  STORE_POST_IMAGE_WIDTH,
  storeBannerObjectPath,
  storeLogoObjectPath,
  storePostImageObjectPath,
  type StoreImageKind,
} from "./store-image";

/**
 * A store's pictures, written the way a player's are.
 *
 * Decode with sharp (loaded lazily, the way the player module does,
 * so a missing native binary cannot take down every page), resize to
 * the one shape each kind has, upload as a Blob and read it back
 * byte for byte, then record the path and read THAT back, refusing
 * on any mismatch. The read-backs are the player module's lessons
 * kept: "nothing actually saves when you update" was a real report.
 */

type Upload = { arrayBuffer(): Promise<ArrayBuffer>; size: number; type: string };

const SHAPE: Record<
  StoreImageKind,
  { width: number; height: number; position: string }
> = {
  logo: { width: STORE_LOGO_SIZE, height: STORE_LOGO_SIZE, position: "centre" },
  banner: { width: STORE_BANNER_WIDTH, height: STORE_BANNER_HEIGHT, position: "top" },
  post: {
    width: STORE_POST_IMAGE_WIDTH,
    height: STORE_POST_IMAGE_HEIGHT,
    position: "centre",
  },
};

const PATH: Record<StoreImageKind, (storeId: string) => string> = {
  logo: storeLogoObjectPath,
  banner: storeBannerObjectPath,
  post: storePostImageObjectPath,
};

/** Encode and store one picture; the caller records the path. */
export async function putStoreImage(
  storeId: string,
  kind: StoreImageKind,
  file: Upload,
): Promise<AvatarOutcome> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };
  if (file.size > STORE_IMAGE_MAX_BYTES) return { ok: false, reason: "too-big" };
  if (!(STORE_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, reason: "wrong-type" };
  }

  const sharp = await loadSharp();
  const shape = SHAPE[kind];

  let encoded: Buffer;
  try {
    encoded = await sharp(Buffer.from(await file.arrayBuffer()), { failOn: "error" })
      .rotate()
      .resize(shape.width, shape.height, { fit: "cover", position: shape.position })
      .jpeg({ quality: kind === "logo" ? 82 : 80 })
      .toBuffer();
  } catch (error) {
    console.error(`Could not decode the uploaded store ${kind}`, error);
    return { ok: false, reason: "unreadable" };
  }

  const path = PATH[kind](storeId);
  if (!(await putAvatarObject(path, encoded, "image/jpeg"))) {
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true, path };
}

/**
 * The logo or the banner: stored, recorded on the store row, and the
 * previous object removed once the new path is read back.
 */
export async function setStoreImage(
  storeId: string,
  kind: "logo" | "banner",
  file: Upload,
): Promise<AvatarOutcome> {
  const put = await putStoreImage(storeId, kind, file);
  if (!put.ok) return put;

  const column = kind === "logo" ? "logo_image" : "cover_image";
  const admin = getSupabaseAdmin();

  const { data: previous } = await admin
    .from("stores")
    .select(column)
    .eq("id", storeId)
    .maybeSingle();

  const patch = kind === "logo" ? { logo_image: put.path } : { cover_image: put.path };
  const { data: recorded, error } = await admin
    .from("stores")
    .update(patch)
    .eq("id", storeId)
    .select(column)
    .maybeSingle();

  const stored = (recorded as Record<string, string | null> | null)?.[column];
  if (error || stored !== put.path) {
    console.error(
      `Could not record the ${kind} for store ${storeId}: ` +
        (error ? error.message : `row reads ${stored ?? "nothing"} back`),
    );
    await admin.storage.from("avatars").remove([put.path]);
    return { ok: false, reason: "unavailable" };
  }

  const old = (previous as Record<string, string | null> | null)?.[column];
  const oldPath = old ? objectPathFrom(old) : null;
  if (oldPath && oldPath !== put.path) {
    await admin.storage.from("avatars").remove([oldPath]);
  }

  return put;
}

/** Take a logo or banner off the store; the object goes too. */
export async function clearStoreImage(
  storeId: string,
  kind: "logo" | "banner",
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const column = kind === "logo" ? "logo_image" : "cover_image";
  const admin = getSupabaseAdmin();
  const { data: previous } = await admin
    .from("stores")
    .select(column)
    .eq("id", storeId)
    .maybeSingle();
  const patch = kind === "logo" ? { logo_image: null } : { cover_image: null };
  const { error } = await admin.from("stores").update(patch).eq("id", storeId);
  if (error) {
    console.error(`Could not clear the ${kind} for store ${storeId}`, error);
    return false;
  }
  const old = (previous as Record<string, string | null> | null)?.[column];
  const oldPath = old ? objectPathFrom(old) : null;
  if (oldPath) await admin.storage.from("avatars").remove([oldPath]);
  return true;
}
