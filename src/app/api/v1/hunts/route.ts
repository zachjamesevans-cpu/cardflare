import { z } from "zod";

import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { ownProfile } from "@/lib/players/profile";
import {
  addHuntRequests,
  createHunt,
  HUNT_DESCRIPTION_MAX,
  HUNT_NAME_MAX,
  huntLimitFor,
  huntsFor,
  markHuntCard,
  setFlareFound,
  setRequestFound,
  updateHunt,
} from "@/lib/players/hunts";

export const dynamic = "force-dynamic";

/**
 * The app's hunts: your own lists, and every write to them.
 *
 * One route, one discriminated union, the same library the website's
 * actions call. Every answer carries the hunts back, so the screen that
 * wrote can repaint from the truth rather than from its own guess.
 */

const requestItem = z.object({
  cardId: z.string().uuid(),
  printingId: z.string().uuid().nullable().optional(),
  quantity: z.number().int().min(1).max(99),
});

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    name: z.string().trim().min(1).max(HUNT_NAME_MAX),
    description: z.string().trim().max(HUNT_DESCRIPTION_MAX).nullable().optional(),
    visibility: z.enum(["public", "private"]).optional(),
  }),
  z.object({
    action: z.literal("update"),
    huntId: z.string().uuid(),
    name: z.string().trim().min(1).max(HUNT_NAME_MAX).optional(),
    description: z.string().trim().max(HUNT_DESCRIPTION_MAX).nullable().optional(),
    visibility: z.enum(["public", "private"]).optional(),
  }),
  z.object({
    action: z.literal("add-cards"),
    huntId: z.string().uuid(),
    items: z.array(requestItem).min(1).max(120),
  }),
  /* Copies in hand for one request: "+1 found", the stepper, undo. */
  z.object({
    action: z.literal("set-found"),
    requestId: z.string().uuid(),
    found: z.number().int().min(0).max(99),
  }),
  /* The same, addressed by a posted card from the Feed. */
  z.object({
    action: z.literal("set-flare-found"),
    flareId: z.string().uuid(),
    found: z.number().int().min(0).max(99),
  }),
]);

/* The old tick, still spoken by phones on TestFlight's clock. */
const tickSchema = z.object({ flareId: z.string().uuid(), found: z.boolean() });

async function answer(playerId: string): Promise<Response> {
  const [hunts, profile] = await Promise.all([
    huntsFor(playerId, playerId),
    ownProfile(playerId),
  ]);
  return Response.json({ hunts, limit: huntLimitFor(profile?.tier ?? null) });
}

export async function GET(request: Request) {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();
  return answer(player.playerId);
}

export async function POST(request: Request) {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const payload = await readJsonPayload(request);

  const tick = tickSchema.safeParse(payload);
  if (tick.success) {
    const result = await markHuntCard(
      player.playerId,
      tick.data.flareId,
      tick.data.found,
    );
    if (!result.ok) {
      if (result.reason === "traded")
        return badRequest("That card was closed by a trade.");
      if (result.reason === "not-yours")
        return badRequest("That card is not on one of your hunts.");
      return badRequest("Could not update that card.");
    }
    return answer(player.playerId);
  }

  const parsed = actionSchema.safeParse(payload);
  if (!parsed.success) return badRequest("Unrecognised hunt action");
  const body = parsed.data;

  if (body.action === "create") {
    const result = await createHunt(player.playerId, body);
    if (!result.ok) {
      if (result.reason === "limit") {
        return Response.json(
          {
            error: "limit",
            message: `You are keeping ${result.kept} hunts, which is the limit on your plan.`,
            kept: result.kept,
            limit: result.limit,
          },
          { status: 409 },
        );
      }
      return badRequest(
        result.reason === "name"
          ? "Give the hunt a name."
          : "Could not start the hunt.",
      );
    }
    const hunts = await huntsFor(player.playerId, player.playerId);
    return Response.json({ ok: true, huntId: result.huntId, hunts });
  }

  if (body.action === "update") {
    const result = await updateHunt(player.playerId, body.huntId, body);
    if (!result.ok) return badRequest("Could not update the hunt.");
    return answer(player.playerId);
  }

  if (body.action === "add-cards") {
    const result = await addHuntRequests(
      player.playerId,
      body.huntId,
      body.items,
      "add",
    );
    if (!result.ok) return badRequest("Could not add those cards.");
    return answer(player.playerId);
  }

  if (body.action === "set-found") {
    const result = await setRequestFound(player.playerId, body.requestId, body.found);
    if (!result.ok) return badRequest("That card is not on one of your hunts.");
    return answer(player.playerId);
  }

  const result = await setFlareFound(player.playerId, body.flareId, body.found);
  if (!result.ok) return badRequest("That card is not yours.");
  return answer(player.playerId);
}
