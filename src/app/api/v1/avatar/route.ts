import { z } from "zod";

import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { AVATAR_MAX_BYTES } from "@/lib/players/profile-image";
import { setAnimatedAvatar, setAvatar, setCover } from "@/lib/players/profile";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { LIMITS, tooMany } from "@/lib/api/throttle";

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

/*
 * A chunk stays at 8000 characters because that number is the thing
 * already proven to survive the founder's network. Percent-encoded into
 * `x-cf-payload` it lands near 9KB, which is comfortably inside the 16KB
 * a Node front door allows for all headers; doubling it would buy half
 * the round trips and risk the whole transport.
 *
 * The COUNT is what grew. Sixty-four chunks is 384KB, which is a JPEG the
 * app already shrank and nothing like a GIF, so an animated picture had
 * no way through at all. Four hundred carries the 2MB below with room to
 * spare, at the cost of round trips - which is why the app counts them
 * out loud while it sends.
 */
const CHUNK_MAX_CHARS = 8000;
const CHUNK_MAX_COUNT = 400;

/**
 * The largest animated picture the APP may send, which is smaller than
 * the 8MB the website takes.
 *
 * Not a rule about GIFs, a rule about this transport: every 6KB of image
 * is another request, so 2MB is already a few hundred of them on shop
 * wifi. The website keeps its own ceiling; a phone gets the one it can
 * actually deliver, and is told the number rather than left to discover
 * it two minutes in.
 */
const APP_ANIMATED_MAX_BYTES = 2 * 1024 * 1024;

const uploadId = z.string().uuid();

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("begin") }),
  /* The quick way: the whole picture in the body, one request, for a
     network that lets a body through. The app falls back to the pieces
     below when it does not. Base64 of the largest picture the app sends. */
  z.object({
    action: z.literal("direct"),
    kind: z.enum(["avatar", "cover", "avatar-animated"]).default("avatar"),
    data: z
      .string()
      .min(1)
      .max(Math.ceil((APP_ANIMATED_MAX_BYTES * 4) / 3) + 4)
      .regex(/^[A-Za-z0-9+/=]+$/),
  }),
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
    /* What the assembled picture becomes: the square profile picture,
       or the wide cover banner behind it. Same transport either way. */
    /* "avatar-animated" is the GIF, which skips the still pipeline
       entirely: sharp re-encodes it as an animation and writes a poster
       beside it. Pro only, checked server-side by setAnimatedAvatar. */
    kind: z.enum(["avatar", "cover", "avatar-animated"]).default("avatar"),
  }),
]);

/** What a staged chunk is stored as. Has to be on the bucket's allowed list. */
const CHUNK_TYPE = "application/octet-stream";

/** Chunks fetched at once on commit. */
const DOWNLOAD_CONCURRENCY = 16;

const chunkPath = (playerId: string, upload: string, index: number) =>
  `tmp/${playerId}/${upload}/${String(index).padStart(3, "0")}`;

export async function POST(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const parsed = schema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("Unrecognised avatar action");

  const body = parsed.data;
  const admin = getSupabaseAdmin();

  if (body.action === "direct") {
    const limited = tooMany(
      `avatar-begin:${player.playerId}`,
      LIMITS.avatarBegin.limit,
      LIMITS.avatarBegin.windowMs,
    );
    if (limited) return limited;
    const bytes = Buffer.from(body.data, "base64");
    if (bytes.length === 0) return badRequest("That upload was empty.");
    return save(player.playerId, bytes, body.kind);
  }

  if (body.action === "begin") {
    const limited = tooMany(
      `avatar-begin:${player.playerId}`,
      LIMITS.avatarBegin.limit,
      LIMITS.avatarBegin.windowMs,
    );
    if (limited) return limited;
    return Response.json({ uploadId: crypto.randomUUID() });
  }

  if (body.action === "chunk") {
    const limited = tooMany(
      `avatar-chunk:${player.playerId}`,
      LIMITS.avatarChunk.limit,
      LIMITS.avatarChunk.windowMs,
    );
    if (limited) return limited;
    /*
     * Declared as bytes, not as text. The avatars bucket takes only the
     * types listed in its `allowed_mime_types` (images, SVG, HTML and
     * application/octet-stream since the 2026-09-16 migration), and a
     * chunk labelled text/plain was refused at the door on every
     * upload: the founder's screen read "chunk-failed 500" for a cover
     * that never got past its first piece. The chunk is base64 text
     * either way; commit reads it back with `.text()` as before.
     */
    const { error } = await admin.storage
      .from("avatars")
      .upload(
        chunkPath(player.playerId, body.uploadId, body.index),
        new Blob([body.data], { type: CHUNK_TYPE }),
        { contentType: CHUNK_TYPE, upsert: true },
      );

    if (error) {
      /* The storage refusal is logged here, with the path, and NOT sent
         to the phone: its message names buckets, paths and policy
         internals that are nobody's business outside the server. The
         log is where the founder's "chunk-failed 500" gets diagnosed. */
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
    /*
     * Fetched several at a time, not one after another: a GIF is a few
     * hundred pieces, and one round trip each was most of a commit's
     * time. Bounded, so one commit cannot open four hundred requests to
     * Storage at once. Order is kept by index, never by arrival.
     */
    const pieces: (string | null)[] = new Array(paths.length).fill(null);
    let missing = false;
    for (
      let start = 0;
      start < paths.length && !missing;
      start += DOWNLOAD_CONCURRENCY
    ) {
      await Promise.all(
        paths.slice(start, start + DOWNLOAD_CONCURRENCY).map(async (path, offset) => {
          const { data, error } = await admin.storage.from("avatars").download(path);
          if (error || !data) {
            missing = true;
            return;
          }
          pieces[start + offset] = await data.text();
        }),
      );
    }
    if (missing || pieces.some((piece) => piece === null)) {
      return badRequest("The upload is missing a piece. Start it again.");
    }

    const encoded = pieces.join("");
    if (encoded.length > CHUNK_MAX_CHARS * CHUNK_MAX_COUNT) {
      return badRequest("That picture is too big.");
    }

    const bytes = Buffer.from(encoded, "base64");
    if (bytes.length === 0) return badRequest("That upload was empty.");

    return save(player.playerId, bytes, body.kind);
  } finally {
    /* The tmp pieces go regardless of how commit went. */
    await admin.storage
      .from("avatars")
      .remove(paths)
      .catch(() => {});
  }
}

/**
 * The website's own pipeline for bytes that have arrived, however they
 * came: stitched from pieces, or in one body on a network that allows it.
 */
async function save(
  playerId: string,
  bytes: Buffer<ArrayBuffer>,
  kind: "avatar" | "cover" | "avatar-animated",
): Promise<Response> {
  const animated = kind === "avatar-animated";
  const ceiling = animated ? APP_ANIMATED_MAX_BYTES : AVATAR_MAX_BYTES;

  if (bytes.length > ceiling) {
    return badRequest(
      animated
        ? "That GIF is over 2MB. Try a shorter or smaller one."
        : "That picture is over 2MB.",
    );
  }

  /* The bytes are handed over as sent. `setAnimatedAvatar` decides
     what a GIF really is by reading its header, exactly as it does for
     the website's upload - a type named by a client is a hint. */
  const file = {
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    size: bytes.length,
    type: animated ? "image/gif" : "image/jpeg",
  };

  const outcome = animated
    ? await setAnimatedAvatar(playerId, file)
    : await (kind === "cover" ? setCover : setAvatar)(playerId, file);

  if (!outcome.ok) {
    /*
     * Named rather than generic. An animated upload can fail for a
     * reason the player can act on - it is a Pro feature, and a GIF
     * that is not a GIF is a common mis-pick - and "try again" would
     * send them round the same loop.
     */
    const reason = outcome.reason;
    return badRequest(
      reason === "not-pro"
        ? "Animated pictures are a Pro feature."
        : reason === "wrong-type"
          ? "An animated picture has to be a GIF."
          : reason === "too-big"
            ? "That picture is too big."
            : reason === "unreadable"
              ? "That picture could not be read. Try a different one."
              : "The picture could not be saved. Try again.",
    );
  }

  return Response.json({ ok: true });
}
