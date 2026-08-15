import { redirect } from "next/navigation";

import { getViewer } from "@/lib/auth/session";
import { PACK_ART_MAX_BYTES, setPackArt } from "@/lib/admin/pack-sets";

export const dynamic = "force-dynamic";

/**
 * Uploading a set's wrapper art.
 *
 * A plain multipart POST rather than a Server Action, because the body
 * is a file: the console posts the form straight here and gets sent back
 * to the page. Admin is re-established from scratch, as it is in every
 * action under lib/admin — a route handler is as public as anything else.
 */
export async function POST(request: Request): Promise<Response> {
  if ((await getViewer()).kind !== "admin") {
    return new Response("Not found", { status: 404 });
  }

  const series = new URL(request.url).searchParams.get("series") ?? "";
  if (!/^[a-z0-9-]{2,40}$/.test(series)) {
    return new Response("Unrecognised set", { status: 400 });
  }

  const form = await request.formData();
  const file = form.get("art");

  if (!(file instanceof File) || file.size === 0) {
    redirect("/admin/packs?art=missing");
  }

  if (file.size > PACK_ART_MAX_BYTES) {
    redirect("/admin/packs?art=too-big");
  }

  const stored = await setPackArt(series, await file.arrayBuffer());

  redirect(stored.ok ? "/admin/packs?art=saved" : "/admin/packs?art=failed");
}
