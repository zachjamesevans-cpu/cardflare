"use server";

import { revalidatePath } from "next/cache";

import { getViewer } from "@/lib/auth/session";
import { text } from "@/lib/form-value";
import { importCardSet, type ImportImage } from "@/lib/cards/import";
import { CARD_ART_MAX_BYTES, CARD_ART_MIME_TYPES } from "@/lib/cards/art-storage";
import {
  duplicatePrintings,
  importManifestSchema,
  type ImportState,
} from "@/lib/cards/import-schema";

/**
 * Importing a set the console was handed rather than one it fetched.
 *
 * Re-establishes admin from scratch, like every other action here: a
 * Server Action is a public POST endpoint, so hiding the form on a
 * guarded page hides nothing — and this one writes to the catalogue
 * every player reads.
 *
 * The server does not fetch anything. It is given a manifest and a set
 * of files and writes what it was given, which is what keeps a fan
 * site's redesign from becoming our outage.
 */

const GENERIC_ERROR = "Something went wrong. Please try again in a moment.";
const REFUSED: ImportState = { status: "error", message: GENERIC_ERROR };

export async function importSetAction(
  _previous: ImportState,
  formData: FormData,
): Promise<ImportState> {
  if ((await getViewer()).kind !== "admin") return REFUSED;

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

  const images = new Map<string, ImportImage>();

  for (const entry of formData.getAll("images")) {
    if (!(entry instanceof File) || entry.size === 0) continue;

    if (entry.size > CARD_ART_MAX_BYTES) {
      return {
        status: "error",
        message: `${entry.name} is larger than ${Math.round(CARD_ART_MAX_BYTES / 1024 / 1024)}MB.`,
      };
    }

    if (!(CARD_ART_MIME_TYPES as readonly string[]).includes(entry.type)) {
      return {
        status: "error",
        message: `${entry.name} is a ${entry.type || "unknown"} file. PNG, JPEG or WebP only.`,
      };
    }

    images.set(entry.name, {
      file: entry.name,
      mimeType: entry.type,
      bytes: await entry.arrayBuffer(),
    });
  }

  const named = new Set(manifest.data.cards.map((card) => card.file));
  const missing = [...named].filter((file) => !images.has(file));

  /*
   * Reported rather than silently imported without art. A set that
   * quietly lands with forty missing pictures looks like a working
   * import until somebody opens a board.
   */
  if (missing.length > 0 && images.size > 0) {
    return {
      status: "error",
      message: `${missing.length} file${missing.length === 1 ? "" : "s"} named in the manifest ${missing.length === 1 ? "was" : "were"} not selected: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "…" : ""}`,
    };
  }

  const outcome = await importCardSet(manifest.data, images);

  if ("error" in outcome) return { status: "error", message: outcome.error };

  /* Boards, search and the feed all read printings. */
  revalidatePath("/admin/cards");
  revalidatePath("/cards");

  return {
    status: "done",
    message: `${manifest.data.setCode} imported.`,
    cards: outcome.cards,
    printings: outcome.printings,
    images: outcome.images,
    skipped: outcome.skipped,
  };
}
