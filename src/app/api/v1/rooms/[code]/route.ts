import { z } from "zod";

import { apiPlayer, apiSession, badRequest } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { isValidJoinCode, normalizeJoinCode } from "@/lib/events/join-code";
import {
  findParticipation,
  joinEvent,
  listParticipants,
  touchParticipation,
} from "@/lib/events/participants";
import { enterRoomByCode, resolveCode } from "@/lib/events/rooms";
import { heldByCard, matchFor, offersByFlare } from "@/lib/matching/schema";
import { listRoomOffers } from "@/lib/matching/repository";
import { listBinder, listRoomFlares } from "@/lib/lists/repository";
import { linkSessionToPlayer } from "@/lib/players/accounts";
import { collectionAvailability } from "@/lib/players/collection";
import {
  createPlayerSession,
  deletePlayerSession,
  renamePlayerSession,
} from "@/lib/players/repository";
import { createSessionToken, hashSessionToken } from "@/lib/players/session";
import { joinAsPlayerSchema } from "@/lib/players/schema";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientKey } from "@/lib/request-context";
import { counterAvailability } from "@/lib/singles/repository";

export const dynamic = "force-dynamic";

/**
 * The room, for a native client. Same resolution, same membership rules,
 * same lib calls as `/e/[code]` — an app-held session token instead of
 * the cookie is the only difference, so the room a player joined on
 * their phone's browser is the room the app shows them.
 */

type Params = { params: Promise<{ code: string }> };

function normalized(raw: string): string | null {
  const code = normalizeJoinCode(decodeURIComponent(raw));
  return isValidJoinCode(code) ? code : null;
}

export async function GET(request: Request, { params }: Params): Promise<Response> {
  const code = normalized((await params).code);
  if (!code) return Response.json({ error: "not-found" }, { status: 404 });

  const resolved = await resolveCode(code);
  if (resolved.outcome === "not-found") {
    return Response.json({ error: "not-found" }, { status: 404 });
  }

  // Shows and quiet/lobby states are real answers, not errors. A lobby is
  // a joinable one — the POST below opens the walk-in room, exactly as the
  // website's lobby form does — so it carries the store's name for the
  // app's join screen.
  if (resolved.outcome !== "room") {
    return Response.json({
      state: resolved.outcome,
      ...("store" in resolved && resolved.store
        ? { store: { name: resolved.store.name } }
        : {}),
    });
  }

  const room = resolved.room;
  const session = await apiSession(request);
  const participation = session ? await findParticipation(room.id, session.id) : null;

  if (session && participation) {
    await touchParticipation(room.id, session.id, participation.lastSeenAt);
  }

  const base = {
    state: "room" as const,
    room: {
      name: room.name,
      status: room.status,
      storeName: room.storeName,
      kind: room.kind,
      startsAt: room.startsAt,
      endsAt: room.endsAt,
    },
  };

  if (!session || !participation || room.status !== "open") {
    return Response.json({ ...base, joined: false });
  }

  const [participants, flares, binder, offers] = await Promise.all([
    listParticipants(room.id),
    listRoomFlares(room.id),
    listBinder(session.id),
    listRoomOffers(room.id),
  ]);

  const held = heldByCard(binder);

  if (session.player_id) {
    const collection = await collectionAvailability(
      session.player_id,
      flares.map((entry) => entry.cardId),
    );
    for (const [cardId, printings] of collection) {
      const proven = held.get(cardId) ?? new Set<string>();
      for (const printingId of printings) proven.add(printingId);
      held.set(cardId, proven);
    }
  }

  const counterHas = await counterAvailability(
    room.storeId,
    flares.map((entry) => entry.cardId),
  );
  const grouped = offersByFlare(offers);

  return Response.json({
    ...base,
    joined: true,
    you: { sessionId: session.id, displayName: session.display_name },
    participants,
    flares: flares.map((entry) => ({
      ...entry,
      match: entry.playerSessionId === session.id ? null : matchFor(entry, held),
      counterMayHave: counterHas.has(entry.cardId),
      offers: (grouped.get(entry.id) ?? []).map((offer) => ({
        responderSessionId: offer.responderSessionId,
        displayName: offer.displayName,
        message: offer.message,
        present: offer.present,
      })),
    })),
  });
}

const joinSchema = z.object({ displayName: z.string().optional() });

const JOIN_MAX = 20;
const JOIN_WINDOW_MS = 10 * 60 * 1000;

/** Join the room — the API twin of the website's join form. */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const code = normalized((await params).code);
  if (!code) return Response.json({ error: "not-found" }, { status: 404 });

  const parsed = joinSchema.safeParse((await readJsonPayload(request)) ?? {});
  if (!parsed.success) return badRequest("displayName must be a string");

  // Per client, not per code: one keen tester (or one busy Friday) must
  // never exhaust a whole room's join allowance for everyone else.
  const rate = checkRateLimit(
    `api-join:${await clientKey()}`,
    JOIN_MAX,
    JOIN_WINDOW_MS,
  );
  if (!rate.allowed) {
    return Response.json({ error: "rate-limited" }, { status: 429 });
  }

  // The only place a walk-in room is opened, same as the website's form.
  const event = await enterRoomByCode(code);
  if (!event || event.status !== "open") {
    return Response.json({ error: "not-open" }, { status: 409 });
  }

  let session = await apiSession(request);
  let freshToken: string | null = null;
  const submitted = (parsed.data.displayName ?? "").trim();

  if (session) {
    // Renamed in place, never replaced — a new session would abandon the
    // binder and every membership hanging off the old one.
    if (submitted && submitted !== session.display_name) {
      const name = joinAsPlayerSchema.safeParse({ displayName: submitted });
      if (!name.success) return badRequest("That display name will not work.");

      await renamePlayerSession(session.id, name.data.displayName);
      session = { ...session, display_name: name.data.displayName };
    }
  } else {
    const name = joinAsPlayerSchema.safeParse({ displayName: submitted });
    if (!name.success) return badRequest("A display name is required to join.");

    freshToken = createSessionToken();
    session = await createPlayerSession(
      name.data.displayName,
      hashSessionToken(freshToken),
    );
  }

  const joined = await joinEvent(event.id, session.id);
  if (!joined) {
    if (freshToken) await deletePlayerSession(session.id);
    return Response.json({ error: "unavailable" }, { status: 503 });
  }

  // A bearer-authenticated app user claims the session, exactly as the
  // website links a signed-in viewer. Guests join with nothing extra.
  if (session.player_id === null) {
    const player = await apiPlayer(request);
    if (player) await linkSessionToPlayer(session.id, player.playerId);
  }

  return Response.json({
    joined: true,
    you: { sessionId: session.id, displayName: session.display_name },
    // Returned once, stored by the app; the website's cookie in header form.
    ...(freshToken ? { sessionToken: freshToken } : {}),
  });
}
