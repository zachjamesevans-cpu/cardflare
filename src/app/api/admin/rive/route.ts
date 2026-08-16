import { redirect } from "next/navigation";

import { getViewer } from "@/lib/auth/session";
import { CATALOG_KINDS, createCosmetic, type CatalogKind } from "@/lib/admin/catalog";
import { storeRiveArt } from "@/lib/admin/rive";
import { RIVE_MAX_BYTES } from "@/lib/admin/rive-file";

export const dynamic = "force-dynamic";

/*
 * Back to the console with a word about what happened.
 *
 * A function declaration returning `never` rather than an arrow, so
 * TypeScript's control flow knows the checks below are guards: after
 * `if (!created.ok) back("name")`, `created` is the success shape.
 */
function back(outcome: string): never {
  redirect(`/admin/packs?rive=${encodeURIComponent(outcome)}`);
}

/**
 * Dropping a .riv file into the catalogue.
 *
 * A plain multipart POST rather than a Server Action, because the body
 * is a file - the same shape as the pack-art upload, which is the one
 * upload path proven on the founder's network. Admin is re-established
 * from scratch: a route handler is as public as anything else.
 *
 * Two jobs, told apart by whether a slug came with the form:
 *   no slug  - make a new cosmetic from this file, named and filed
 *              under the chosen category, as a draft.
 *   a slug   - replace the file on an existing cosmetic, everything
 *              else about it untouched.
 */
export async function POST(request: Request): Promise<Response> {
  if ((await getViewer()).kind !== "admin") {
    return new Response("Not found", { status: 404 });
  }

  const form = await request.formData();
  const file = form.get("rive");

  if (!(file instanceof File) || file.size === 0) back("missing");
  const upload = file as File;

  /* Refused before it is read into memory, not after. */
  if (upload.size > RIVE_MAX_BYTES) back("too-big");

  const slug = String(form.get("slug") ?? "").trim();
  const bytes = await upload.arrayBuffer();

  if (slug) {
    if (!/^[a-z0-9-]{2,40}$/.test(slug)) back("unknown");
    const stored = await storeRiveArt(slug, bytes, {
      artboard: String(form.get("artboard") ?? "").trim() || null,
      stateMachine: String(form.get("stateMachine") ?? "").trim() || null,
    });
    back(stored.ok ? "replaced" : "failed");
  }

  const kind = String(form.get("kind") ?? "").trim();
  if (!(CATALOG_KINDS as readonly string[]).includes(kind)) back("kind");

  const created = await createCosmetic({
    name: String(form.get("name") ?? ""),
    kind: kind as CatalogKind,
    artboard: String(form.get("artboard") ?? "").trim() || null,
    stateMachine: String(form.get("stateMachine") ?? "").trim() || null,
  });

  if (!created.ok) back("name");

  const stored = await storeRiveArt(created.slug, bytes);

  /*
   * A cosmetic whose file did not land is a broken tile, so the row
   * goes back out rather than sitting in the grid as a mystery. It is
   * brand new and owned by nobody, so this cannot take anything away.
   */
  if (!stored.ok) {
    const { deleteCosmetic } = await import("@/lib/admin/catalog");
    await deleteCosmetic(created.slug);
    back("failed");
  }

  back("added");
}
