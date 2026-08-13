import "server-only";

import { avatarSrc, objectPathFrom } from "@/lib/players/profile-image";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/site";

/**
 * The picture pipeline, tested one link at a time.
 *
 * This exists because the founder's picture failed four rounds in a row
 * and every diagnosis was made blind: the sandbox this code is written
 * in can reach neither the production site nor its storage, so each fix
 * addressed the most plausible layer and the report back was "same
 * exact issue" with no way to see which layer actually broke.
 *
 * So the production deployment now checks itself. Each step tests one
 * hop — the row, the parse, the bucket, the download, the public route —
 * and the first failure names the broken link instead of leaving it to
 * be inferred from a screenshot. The last hop (this browser fetching the
 * image) cannot be tested server-side and is covered by the client probe
 * rendered next to these results.
 */

export interface AvatarCheckStep {
  label: string;
  ok: boolean;
  detail: string;
}

export interface AvatarCheck {
  steps: AvatarCheckStep[];
  /** What an <img> should be given, for the client-side probe. */
  src: string | null;
}

export async function avatarDiagnostics(playerId: string): Promise<AvatarCheck> {
  const steps: AvatarCheckStep[] = [];

  if (!isSupabaseConfigured()) {
    return {
      steps: [{ label: "Supabase", ok: false, detail: "Not configured." }],
      src: null,
    };
  }

  const admin = getSupabaseAdmin();

  /* 1. The row. */
  const { data: player, error: rowError } = await admin
    .from("players")
    .select("avatar_url")
    .eq("id", playerId)
    .maybeSingle();

  if (rowError || !player) {
    steps.push({
      label: "Database row",
      ok: false,
      detail: rowError?.message ?? "No players row found.",
    });
    return { steps, src: null };
  }

  if (!player.avatar_url) {
    steps.push({
      label: "Database row",
      ok: true,
      detail:
        "No picture stored. Upload one on your profile, then run this check again.",
    });
    return { steps, src: null };
  }

  steps.push({ label: "Database row", ok: true, detail: player.avatar_url });

  /* 2. The parse. */
  const path = objectPathFrom(player.avatar_url);

  if (!path) {
    steps.push({
      label: "Path parse",
      ok: false,
      detail: "The stored value is neither an object path nor this bucket's URL.",
    });
    return { steps, src: null };
  }

  steps.push({ label: "Path parse", ok: true, detail: path });

  /* 3. The bucket has the object. */
  const slash = path.lastIndexOf("/");
  const folder = slash === -1 ? "" : path.slice(0, slash);
  const filename = slash === -1 ? path : path.slice(slash + 1);

  const { data: listed, error: listError } = await admin.storage
    .from("avatars")
    .list(folder, { search: filename });

  if (listError) {
    steps.push({ label: "Object exists", ok: false, detail: listError.message });
  } else {
    const exists = (listed ?? []).some((object) => object.name === filename);
    steps.push({
      label: "Object exists",
      ok: exists,
      detail: exists
        ? "Found in the avatars bucket."
        : "NOT in the bucket. The row points at a deleted object; remove the picture and upload again.",
    });
    if (!exists) return { steps, src: avatarSrc(player.avatar_url) };
  }

  /* 4. The server can read it. */
  const { data: blob, error: downloadError } = await admin.storage
    .from("avatars")
    .download(path);

  steps.push({
    label: "Server download",
    ok: !downloadError && !!blob,
    detail: downloadError
      ? downloadError.message
      : `${((blob?.size ?? 0) / 1024).toFixed(1)}KB read with the service role.`,
  });

  /* 5. The public route serves it, fetched exactly as a browser would. */
  const src = avatarSrc(player.avatar_url);
  const url = `${siteUrl()}${src}`;

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    const type = response.headers.get("content-type") ?? "none";
    steps.push({
      label: "Public route",
      ok: response.ok && type.startsWith("image/"),
      detail: `${response.status} with content-type ${type} from ${url}`,
    });
  } catch (error) {
    steps.push({
      label: "Public route",
      ok: false,
      detail: `Could not fetch ${url}: ${error instanceof Error ? error.message : "unknown error"}`,
    });
  }

  return { steps, src };
}
