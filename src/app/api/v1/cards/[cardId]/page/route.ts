import { z } from "zod";

import { absoluteImageUrls } from "@/lib/api/absolute";
import { apiPlayer } from "@/lib/api/auth";
import { cardPage } from "@/lib/cards/card-page";

export const dynamic = "force-dynamic";

/**
 * The card page for the app: who has it, who hunts it, which store has
 * it, and where the viewer stands. Signed out is allowed and reads with
 * `you` null, the same as the website's page.
 */

type Params = { params: Promise<{ cardId: string }> };

const cardIdSchema = z.guid();

export async function GET(request: Request, { params }: Params): Promise<Response> {
  const id = cardIdSchema.safeParse((await params).cardId);
  if (!id.success) return Response.json({ error: "not-found" }, { status: 404 });

  const account = await apiPlayer(request);
  const page = await cardPage(id.data, account?.playerId ?? null);
  if (!page) return Response.json({ error: "not-found" }, { status: 404 });

  return Response.json({ page: absoluteImageUrls(page) });
}
