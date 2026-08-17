"use server";

import { revalidatePath } from "next/cache";

import { getViewer } from "@/lib/auth/session";
import { text } from "@/lib/form-value";
import { deleteImportedSet, storeCardArt, writeImportedSet } from "@/lib/cards/import";
import { CARD_ART_MAX_BYTES, CARD_ART_MIME_TYPES } from "@/lib/cards/art-storage";
import {
  importManifestSchema,
  duplicatePrintings,
  type ImportState,
  type UploadResult,
} from "@/lib/cards/import-schema";

/**
 * Importing a set the console was handed rather than one it fetched.
 *
 * Every action re-establishes admin from scratch, like the rest of the
 * console: a Server Action is a public POST endpoint, so hiding a form
 * on a guarded page hides nothing — and these write to the catalogue
 * every player reads.
 *
 * Three actions rather than one, because the pictures cannot travel with
 * the manifest. A Server Action request is capped at 1MB by default and
 * Vercel refuses a body over 4.5MB regardless, so two hundred card
 * scans in one post is not a limit to raise but a shape to change. Each
 * picture is its own request; the rows are written once at the end from
 * whatever reached the bucket.
 *
 * The server still fetches nothing. It is given files and data and
 * writes what it was given, which is what keeps a fan site's redesign
 * from becoming our outage.
 */

const GENERIC_ERROR = "Something went wrong. Please try again in a moment.";
const REFUSED: ImportState = { status: "error", message: GENERIC_ERROR };

async function isAdmin(): Promise<boolean> {
  return (await getViewer()).kind === "admin";
}

/**
 * Stores one card's picture.
 *
 * Called once per card by the browser, in sequence. Small enough that
 * the request limits are irrelevant, and idempotent, so a retry after a
 * dropped connection costs one upload rather than a whole set.
 */
export async function uploadCardArtAction(formData: FormData): Promise<UploadResult> {
  if (!(await isAdmin())) return { ok: false, reason: GENERIC_ERROR };

  const provider = text(formData, "provider");
  const setCode = text(formData, "setCode");
  const externalId = text(formData, "externalId");
  const file = formData.get("image");

  if (!provider || !setCode || !externalId) {
    return { ok: false, reason: "Missing which card this picture is for." };
  }

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, reason: "No picture arrived." };
  }

  if (file.size > CARD_ART_MAX_BYTES) {
    const mb = Math.round(CARD_ART_MAX_BYTES / 1024 / 1024);
    return { ok: false, reason: `${file.name} is larger than ${mb}MB.` };
  }

  if (!(CARD_ART_MIME_TYPES as readonly string[]).includes(file.type)) {
    return {
      ok: false,
      reason: `${file.name} is a ${file.type || "unknown"} file. PNG, JPEG or WebP only.`,
    };
  }

  const stored = await storeCardArt(provider, setCode, externalId, {
    mimeType: file.type,
    bytes: await file.arrayBuffer(),
  });

  return "error" in stored ? { ok: false, reason: stored.error } : { ok: true };
}

/**
 * Writes the rows, once the pictures are up.
 *
 * Reads the bucket rather than being told what landed, so an import that
 * was interrupted and resumed still produces rows matching what is
 * actually there.
 */
export async function finishImportAction(
  _previous: ImportState,
  formData: FormData,
): Promise<ImportState> {
  if (!(await isAdmin())) return REFUSED;

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(text(formData, "manifest"));
  } catch {
    return { status: "error", message: "That manifest is not valid JSON." };
  }

  const manifest = importManifestSchema.safeParse(parsedJson);
  if (!manifest.success) {
    const issue = manifest.error.issues[0];
    return {
      status: "error",
      message: issue
        ? `${issue.path.join(".") || "manifest"}: ${issue.message}`
        : GENERIC_ERROR,
    };
  }

  /*
   * Two entries for one card number AND one label are the same printing
   * twice; the second would overwrite the first inside a single upsert,
   * which PostgreSQL refuses outright. Caught here so the message names
   * the cards rather than quoting a constraint.
   */
  const clashes = duplicatePrintings(manifest.data);
  if (clashes.length > 0) {
    return {
      status: "error",
      message: `Listed twice with the same printing label: ${clashes.join(", ")}. Give one of each pair a label like "Alternate art".`,
    };
  }

  const outcome = await writeImportedSet(manifest.data);
  if ("error" in outcome) return { status: "error", message: outcome.error };

  revalidatePath("/admin/cards/import");
  revalidatePath("/cards");

  return {
    status: "done",
    message: `${manifest.data.setCode} imported.`,
    cards: outcome.cards,
    printings: outcome.printings,
    images: outcome.images,
    missing: outcome.missing,
  };
}

/**
 * Removes an imported set entirely.
 *
 * The way back out of a mistake made in this console. Card rows survive
 * when a real provider is also using them — see `deleteImportedSet`.
 */
export async function deleteImportedSetAction(
  _previous: ImportState,
  formData: FormData,
): Promise<ImportState> {
  if (!(await isAdmin())) return REFUSED;

  const provider = text(formData, "provider");
  const setCode = text(formData, "setCode");

  if (!provider || !setCode) return REFUSED;

  const outcome = await deleteImportedSet(provider, setCode);
  if ("error" in outcome) return { status: "error", message: outcome.error };

  revalidatePath("/admin/cards/import");
  revalidatePath("/cards");

  return {
    status: "deleted",
    message: `${setCode} removed: ${outcome.printings} printing${
      outcome.printings === 1 ? "" : "s"
    }, ${outcome.cards} card${outcome.cards === 1 ? "" : "s"} and ${
      outcome.images
    } picture${outcome.images === 1 ? "" : "s"}.`,
  };
}
