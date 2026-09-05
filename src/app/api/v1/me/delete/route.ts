import { z } from "zod";

import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { deleteAccount } from "@/lib/players/delete-account";

export const dynamic = "force-dynamic";

/**
 * Deleting your own account, from the app.
 *
 * App Store Review Guideline 5.1.1(v): an app that lets people create an
 * account has to let them delete it from inside the app, and "email us"
 * does not count. This is the same deletion the admin console performs,
 * done by the account itself: the player row goes, every foreign key
 * cascades, and the sign-in behind it is removed last.
 *
 * The handle has to be typed back, so a mis-tap on a settings screen
 * cannot delete a collection. The app asks for it; the server insists.
 */
const schema = z.object({ confirmHandle: z.string().min(1).max(64) });

export async function POST(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const parsed = schema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("confirmHandle is required");

  const outcome = await deleteAccount(player.playerId, parsed.data.confirmHandle);

  if (!outcome.ok) {
    if (outcome.reason === "handle-mismatch") {
      return Response.json(
        { error: "handle-mismatch", message: "That is not your handle." },
        { status: 409 },
      );
    }
    return Response.json(
      { error: "unavailable", message: outcome.message },
      { status: 503 },
    );
  }

  return Response.json({ ok: true });
}
