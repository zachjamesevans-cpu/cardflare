import { z } from "zod";

import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { PUSH_GROUPS } from "@/lib/notifications/push-prefs";
import { pushPrefsFor, setPushPref } from "@/lib/notifications/push-prefs-server";

export const dynamic = "force-dynamic";

/** The account's four push switches, for the app's settings screen. */
export async function GET(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();
  return Response.json({ prefs: await pushPrefsFor(player.playerId) });
}

const flipSchema = z.object({
  group: z.enum(PUSH_GROUPS.map((group) => group.key) as [string, ...string[]]),
  on: z.boolean(),
});

export async function PUT(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();
  const parsed = flipSchema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("group and on are required");
  const group = parsed.data.group as (typeof PUSH_GROUPS)[number]["key"];
  return Response.json({
    prefs: await setPushPref(player.playerId, group, parsed.data.on),
  });
}
