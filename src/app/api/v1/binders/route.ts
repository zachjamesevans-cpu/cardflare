import { absoluteImageUrls } from "@/lib/api/absolute";
import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { createBinder, listBinders, readBinder } from "@/lib/binder/binder";
import { createSchema, forOldBuild } from "./_shared";

export const dynamic = "force-dynamic";

/** Your binders, in your order; and a new one. */
export async function GET(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();
  const binders = await listBinders(player.playerId, player.playerId);
  return Response.json(absoluteImageUrls({ binders: binders.map(forOldBuild) }));
}

export async function POST(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();
  const parsed = createSchema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("name is required, up to 40 characters");
  const result = await createBinder(player.playerId, parsed.data);
  if (!result.ok) {
    return Response.json(
      { error: result.reason },
      {
        status:
          result.reason === "at-cap" ? 409 : result.reason === "invalid" ? 400 : 503,
      },
    );
  }
  const binder = await readBinder(player.playerId, player.playerId, result.id);
  return Response.json(absoluteImageUrls({ binder: binder && forOldBuild(binder) }));
}
