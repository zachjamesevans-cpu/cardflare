import { z } from "zod";

import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { AVATAR_MAX_BYTES } from "@/lib/players/profile-image";
import { setAvatar } from "@/lib/players/profile";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Profile picture upload for the app, in pieces.
 *
 * The app cannot send a multipart body, because on some networks (the
 * founder's, for one) every request with a body dies in transit - the
 * discovery that put all of the app's writes into the `x-cf-payload`
 * header. A picture does not fit in one header, so it arrives as a
 * numbered series of base64 text chunks, each small enough to ride
 * where the app's payloads already ride. Serverless functions share no
 * memory between requests, so the chunks wait in the avatars bucket
 * under `tmp/` until commit stitches them together and hands the bytes
 * to the same `setAvatar` pipeline the website upload uses: sharp
 * re-encode to a 512px JPEG square, write, read back, verify.
 *
 * Budgets, so this cannot become a server load: 64 chunks of at most
 * 8000 base64 characters each, and the assembled file obeys the same
 * 2MB ceiling the website enforces - though the app compresses to well
 * under 200KB before sending, so a normal upload is a dozen chunks.
 */

const CHUNK_MAX_CHARS = 8000;
const CHUNK_MAX_COUNT = 64;

const uploadId = z.string().uuid();

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("begin") }),
  z.object({
    action: z.literal("chunk"),
    uploadId,
    index: z
      .number()
      .int()
      .min(0)
      .max(CHUNK_MAX_COUNT - 1),
    /* Base64 text, stored as text; commit decodes the whole string
       once, so chunk boundaries never have to align to byte groups. */
    data: z
      .string()
      .min(1)
      .max(CHUNK_MAX_CHARS)
      .regex(/^[A-Za-z0-9+/=]+$/),
  }),
  z.object({
    action: z.literal("commit"),
    uploadId,
    count: z.number().int().min(1).max(CHUNK_MAX_COUNT),
  }),
]);

const chunkPath = (playerId: string, upload: string, index: number) =>
  `tmp/${playerId}/${upload}/${String(index).padStart(3, "0")}`;

export async function POST(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const parsed = schema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("Unrecognised avatar action");

  const body = parsed.data;
  const admin = getSupabaseAdmin();

  if (body.action === "begin") {
    return Response.json({ uploadId: crypto.randomUUID() });
  }

  if (body.action === "chunk") {
    const { error } = await admin.storage
      .from("avatars")
      .upload(
        chunkPath(player.playerId, body.uploadId, body.index),
        new Blob([body.data], { type: "text/plain" }),
        { contentType: "text/plain", upsert: true },
      );

    if (error) {
      console.error("Could not store an avatar chunk", error);
      return Response.json({ error: "chunk-failed" }, { status: 500 });
    }

    return Response.json({ ok: true });
  }

  /* commit: stitch, decode, and run the website's own pipeline. */
  const paths = Array.from({ length: body.count }, (_, index) =>
    chunkPath(player.playerId, body.uploadId, index),
  );

  try {
    const pieces: string[] = [];
    for (const path of paths) {
      const { data, error } = await admin.storage.from("avatars").download(path);
      if (error || !data) {
        return badRequest("The upload is missing a piece. Start it again.");
      }
      pieces.push(await data.text());
    }

    const encoded = pieces.join("");
    if (encoded.length > CHUNK_MAX_CHARS * CHUNK_MAX_COUNT) {
      return badRequest("That picture is too big.");
    }

    const bytes = Buffer.from(encoded, "base64");
    if (bytes.length === 0) return badRequest("That upload was empty.");
    if (bytes.length > AVATAR_MAX_BYTES) {
      return badRequest("That picture is over 2MB.");
    }

    const outcome = await setAvatar(player.playerId, {
      arrayBuffer: async () =>
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      size: bytes.length,
      type: "image/jpeg",
    });

    if (!outcome.ok) {
      return badRequest(
        outcome.reason === "unreadable"
          ? "That picture could not be read. Try a different one."
          : "The picture could not be saved. Try again.",
      );
    }

    return Response.json({ ok: true });
  } finally {
    /* The tmp pieces go regardless of how commit went. */
    await admin.storage
      .from("avatars")
      .remove(paths)
      .catch(() => {});
  }
}
