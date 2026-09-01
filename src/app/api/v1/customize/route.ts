import { z } from "zod";

import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { EQUIP_KINDS, customizeSections, setEquip } from "@/lib/players/equips";

export const dynamic = "force-dynamic";

/**
 * The customize screen, for the app: GET is every category with the
 * player's ownership and current equips, POST wears or clears one slot.
 * Draft visibility follows the founder's rule via customizeSections.
 */

export async function GET(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  return Response.json(await customizeSections(player.playerId));
}

const schema = z.object({
  kind: z.enum(EQUIP_KINDS),
  slug: z.string().trim().max(40).nullable(),
});

export async function POST(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const parsed = schema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("Unrecognised equip");

  const outcome = await setEquip(player.playerId, parsed.data.kind, parsed.data.slug);
  if (outcome === "not-owned") {
    return Response.json({ error: "not-owned" }, { status: 403 });
  }
  if (outcome === "not-pro") {
    /* The app reads this and opens the Pro screen instead of an alert. */
    return Response.json({ error: "not-pro" }, { status: 403 });
  }
  if (outcome === "failed") {
    return Response.json({ error: "failed" }, { status: 500 });
  }

  return Response.json({ ok: true });
}
