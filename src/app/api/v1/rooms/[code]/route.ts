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
import {
  heldByCard,
  heldCountByCard,
  matchFor,
  offersByFlare,
} from "@/lib/matching/schema";
import { roomPhase } from "@/lib/events/schema";
import { listRoomOffers } from "@/lib/matching/repository";
import { listBinder, listRoomFlares } from "@/lib/lists/repository";
import { linkSessionToPlayer } from "@/lib/players/accounts";
import {
  accountRoomIdentity,
  nameSessionAfterAccount,
} from "@/lib/players/room-identity";
import { saveLocal } from "@/lib/players/locals";
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
import { siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * The room, for a native client. Same resolution, same membership rules,
 * same lib calls as `/e/[code]` — an app-held session token instead of
 * the cookie is the only difference, so the room a player joined on
 * their phone's browser is the room the app shows them.
 */

type Params = { params: Promise<{ code: string }> };

/**
 * Avatar paths are relative on the website and useless to a phone, which
 * has no origin to resolve them against. Absolutised here, at the one
 * seam where the audience stops being a browser.
 */
type WithArt = {
  avatarUrl: string | null;
  ringArt?: { url: string } | null;
  auraArt?: { url: string } | null;
};

function absoluteAvatars<T extends WithArt>(rows: T[]): T[] {
  const base = siteUrl();

  /* Cosmetic art seeded by a migration ships in the repo and is stored
     as "/cosmetics/x.svg", so it needs the same treatment the pictures
     do before a phone can fetch it. */
  const art = <A extends { url: string } | null | undefined>(file: A): A =>
    file && file.url.startsWith("/")
      ? ({ ...file, url: `${base}${file.url}` } as A)
      : file;

  return rows.map((row) => ({
    ...row,
    avatarUrl: row.avatarUrl?.startsWith("/")
      ? `${base}${row.avatarUrl}`
      : row.avatarUrl,
    ...(row.ringArt !== undefined ? { ringArt: art(row.ringArt) } : {}),
    ...(row.auraArt !== undefined ? { auraArt: art(row.auraArt) } : {}),
  }));
}

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

  /*
   * Resolved once for every branch below. Each of them can be the screen
   * that used to ask a signed-in player to pick a name, and verifying a
   * bearer token is a round trip to the auth server — not something to
   * do twice in one response.
   */
  const account = await apiPlayer(request);

  // Shows and quiet/lobby states are real answers, not errors. A lobby is
  // a joinable one — the POST below opens the walk-in room, exactly as the
  // website's lobby form does — so it carries the store's name for the
  // app's join screen.
  if (resolved.outcome !== "room") {
    return Response.json({
      state: resolved.outcome,
      account: account ? { displayName: account.displayName } : null,
      ...("store" in resolved && resolved.store
        ? { store: { name: resolved.store.name } }
        : {}),
      // Nothing at the counter, but a board may already be taking Flares.
      ...("earlyBoard" in resolved && resolved.earlyBoard
        ? { earlyBoard: resolved.earlyBoard }
        : {}),
    });
  }

  const room = resolved.room;
  const session = await apiSession(request);
  const participation = session ? await findParticipation(room.id, session.id) : null;

  if (session && participation) {
    await touchParticipation(room.id, session.id, participation.lastSeenAt);
  }

  // An early board is a joinable room days before doors; the flag lets
  // the app say so instead of pretending the event is live.
  const phase = roomPhase(room, Date.now());

  const base = {
    state: "room" as const,
    room: {
      name: room.name,
      status: room.status,
      storeName: room.storeName,
      kind: room.kind,
      startsAt: room.startsAt,
      endsAt: room.endsAt,
      early: phase === "early",
    },
  };

  if (!session || !participation || (phase !== "live" && phase !== "early")) {
    /*
     * The account travels with the not-joined answer too. This is the
     * exact screen that used to ask a signed-in player to pick a name.
     */
    return Response.json({
      ...base,
      joined: false,
      account: account ? { displayName: account.displayName } : null,
    });
  }

  const [participants, flares, binder, offers] = await Promise.all([
    listParticipants(room.id),
    listRoomFlares(room.id),
    listBinder(session.id),
    listRoomOffers(room.id),
  ]);

  const held = heldByCard(binder);

  /* Counts come from the binder alone. The collection folded in below
     proves printings, never quantities. */
  const heldCounts = heldCountByCard(binder);

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
    /*
     * Present when a bearer token is on the request. The app's join
     * screen uses it to stop asking for a name: a signed-in player joins
     * as themselves, and the name lives in profile settings.
     */
    account: account ? { displayName: account.displayName } : null,
    participants: absoluteAvatars(participants),
    flares: flares.map((entry) => ({
      ...entry,
      match: entry.playerSessionId === session.id ? null : matchFor(entry, held),
      /* For the card viewer's "You have N in your binder", on tap. */
      heldCount: heldCounts.get(entry.cardId) ?? 0,
      counterMayHave: counterHas.has(entry.cardId),
      offers: (grouped.get(entry.id) ?? []).map((offer) => ({
        responderSessionId: offer.responderSessionId,
        displayName: offer.displayName,
        message: offer.message,
        quantity: offer.quantity,
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
  // Early boards accept joins too: posting ahead is the whole feature.
  const event = await enterRoomByCode(code);
  const joinPhase = event ? roomPhase(event, Date.now()) : null;
  if (!event || (joinPhase !== "live" && joinPhase !== "early")) {
    return Response.json({ error: "not-open" }, { status: 409 });
  }

  let session = await apiSession(request);
  let freshToken: string | null = null;
  let created = false;
  let resumed = false;
  const submitted = (parsed.data.displayName ?? "").trim();

  /*
   * A signed-in player joins as themselves, the same rule the website
   * follows. Their name is unique and lives in profile settings, so a
   * name sent up from a join screen is ignored rather than argued with.
   */
  const account = await apiPlayer(request);

  if (account) {
    /*
     * One identity per account, whichever client is asking — the same call
     * the website's join makes, so joining here while already in the room
     * from the mobile site resumes that seat rather than adding a second
     * person to the board.
     */
    const identity = await accountRoomIdentity(
      account.playerId,
      account.displayName,
      session,
    );
    session = await nameSessionAfterAccount(identity.session, account.displayName);
    freshToken = identity.freshToken;
    created = identity.created;
    resumed = identity.resumed;
  } else if (session) {
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
    created = true;
    session = await createPlayerSession(
      name.data.displayName,
      hashSessionToken(freshToken),
    );
  }

  // Already here counts as joined; asked before the write, which cannot
  // tell the two apart afterwards.
  const wasAlreadyHere = Boolean(await findParticipation(event.id, session.id));

  const joined = await joinEvent(event.id, session.id);
  if (!joined) {
    // Only a session this request created may be undone. An adopted one
    // belongs to the account and is very likely in another room.
    if (created) await deletePlayerSession(session.id);
    return Response.json({ error: "unavailable" }, { status: 503 });
  }

  // A bearer-authenticated app user claims the session, exactly as the
  // website links a signed-in viewer. Guests join with nothing extra.
  let accountPlayerId = session.player_id;
  if (!accountPlayerId && account) {
    await linkSessionToPlayer(session.id, account.playerId);
    accountPlayerId = account.playerId;
  }

  // Same rule as the website's join: a signed-in join saves the store as
  // one of the player's locals, silently and idempotently.
  if (accountPlayerId) await saveLocal(accountPlayerId, event.storeId);

  return Response.json({
    joined: true,
    /*
     * True when this account was already in the room from another client.
     * The app says so rather than silently doing nothing, because "join"
     * appearing to have no effect is exactly what a duplicate used to look
     * like from the inside.
     */
    resumed: resumed || wasAlreadyHere,
    you: { sessionId: session.id, displayName: session.display_name },
    // Returned once, stored by the app; the website's cookie in header form.
    ...(freshToken ? { sessionToken: freshToken } : {}),
  });
}
