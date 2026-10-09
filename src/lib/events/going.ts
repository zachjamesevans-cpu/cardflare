import "server-only";

import {
  DEFAULT_BINDER_COVER,
  isBinderCover,
  type BinderCoverId,
} from "@/lib/binder/covers";
import { afterResponse } from "@/lib/after-response";
import { postFlaresOnJoin } from "@/lib/events/auto-post";
import {
  afterGoing,
  perPlayerMatches,
  tradeCardCounts,
} from "@/lib/events/night-matches";
import {
  broughtBindersFor,
  nightPhase,
  type BroughtBinder,
} from "@/lib/events/night-binders";
import { joinEvent, leaveEvent, listParticipants } from "@/lib/events/participants";
import { findEventById, findStoreById } from "@/lib/events/repository";
import { boardWritable, roomPhase } from "@/lib/events/schema";
import { listRoomFlares } from "@/lib/lists/repository";
import { saveLocal } from "@/lib/players/locals";
import { deletePlayerSession } from "@/lib/players/repository";
import {
  accountRoomIdentity,
  nameSessionAfterAccount,
} from "@/lib/players/room-identity";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { PlayerSessionRow } from "@/lib/supabase/types";

/**
 * Going.
 *
 * The founder (2026-10-03): "What if, you just say you're going to an
 * event. Or a tournament night. That room stays 'open' and anyone can
 * go into there and see who is looking for which cards before the
 * tournament or event starts."
 *
 * Going is joining the room ahead of time, by a button rather than a
 * code. There is no RSVP table: the `event_participants` row IS the
 * answer, the same row a scan at the counter writes, so "who is going"
 * and "who is in the room" are one list and cannot drift. One tap puts
 * the account's session on the roster, posts its Flares to the board
 * through the same auto-post the door uses, and runs the night matches.
 * Tapping again takes the seat back.
 *
 * Accounts only. A guest has no wants to post and no device to ping, so
 * the button sends them to sign in; the code door is still theirs.
 */

export interface GoingState {
  youGoing: boolean;
  goingCount: number;
}

const NOBODY: GoingState = { youGoing: false, goingCount: 0 };

/**
 * Who is on each roster, as one person per account.
 *
 * Two queries and no embed: the seats, then the sessions behind them.
 * An account that joined from two devices holds two sessions and must
 * count once; a guest is their session and counts as themselves.
 * Failures read as nobody, never as a thrown page.
 */
export async function goingStates(
  eventIds: string[],
  playerId: string | null,
): Promise<Map<string, GoingState>> {
  const states = new Map<string, GoingState>(eventIds.map((id) => [id, { ...NOBODY }]));
  if (eventIds.length === 0 || !isSupabaseConfigured()) return states;

  try {
    const admin = getSupabaseAdmin();

    const { data: seats, error } = await admin
      .from("event_participants")
      .select("event_id, player_session_id")
      .in("event_id", eventIds);
    if (error) {
      console.error("Could not count who is going", error);
      return states;
    }
    if (!seats || seats.length === 0) return states;

    const sessionIds = [...new Set(seats.map((seat) => seat.player_session_id))];
    const { data: sessions, error: sessionError } = await admin
      .from("player_sessions")
      .select("id, player_id")
      .in("id", sessionIds);
    if (sessionError) {
      console.error("Could not resolve who is going", sessionError);
      return states;
    }

    const accountBySession = new Map(
      (sessions ?? []).map((row) => [row.id, row.player_id as string | null]),
    );

    const people = new Map<string, Set<string>>();
    for (const seat of seats) {
      const account = accountBySession.get(seat.player_session_id) ?? null;
      const person = account ?? `session:${seat.player_session_id}`;
      const set = people.get(seat.event_id) ?? new Set<string>();
      set.add(person);
      people.set(seat.event_id, set);
    }

    for (const [eventId, set] of people) {
      states.set(eventId, {
        goingCount: set.size,
        youGoing: playerId !== null && set.has(playerId),
      });
    }
  } catch (error) {
    console.error("Could not read the Going state", error);
  }

  return states;
}

export async function goingState(
  eventId: string,
  playerId: string | null,
): Promise<GoingState> {
  return (await goingStates([eventId], playerId)).get(eventId) ?? { ...NOBODY };
}

export async function goingCounts(eventIds: string[]): Promise<Map<string, number>> {
  const states = await goingStates(eventIds, null);
  return new Map([...states].map(([id, state]) => [id, state.goingCount]));
}

export type GoingResult =
  | {
      ok: true;
      youGoing: boolean;
      goingCount: number;
      posted: number;
      /**
       * A token this device must start sending, when Going had to mint
       * the account's room identity for a client holding none. Set as
       * the cookie by the website's action and returned once by the
       * API, exactly as the join does.
       */
      freshToken: string | null;
      /** For the caller's revalidation: the room's code and the store. */
      code: string | null;
      storeId: string;
    }
  | { ok: false; reason: "not-found" | "not-open" | "unavailable" | "no-account" };

/** The account's seats in one room, from any of its sessions. */
async function accountSeats(eventId: string, playerId: string): Promise<string[]> {
  const admin = getSupabaseAdmin();

  const { data: sessions, error } = await admin
    .from("player_sessions")
    .select("id")
    .eq("player_id", playerId);
  if (error || !sessions || sessions.length === 0) {
    if (error) console.error("Could not look up the account's sessions", error);
    return [];
  }

  const { data: seats, error: seatError } = await admin
    .from("event_participants")
    .select("player_session_id")
    .eq("event_id", eventId)
    .in(
      "player_session_id",
      sessions.map((session) => session.id),
    );
  if (seatError) {
    console.error("Could not look up the account's seats", seatError);
    return [];
  }

  return (seats ?? []).map((seat) => seat.player_session_id);
}

/**
 * Says Going (true) or Not going (false) for an account.
 *
 * Finds or creates the account's player session the way joinEventAction
 * does: the account's one session, adopted for this device if it holds
 * nothing, created and named after the account if there is none yet.
 * `deviceSession` is whatever the caller's own cookie or token resolved
 * to, so a browser that is already the account's identity mints nothing.
 */
export async function setGoing(
  eventId: string,
  playerId: string,
  displayName: string,
  going: boolean,
  deviceSession: PlayerSessionRow | null = null,
): Promise<GoingResult> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };

  const event = await findEventById(eventId);
  if (!event || event.cancelled_at) return { ok: false, reason: "not-found" };

  const store = await findStoreById(event.store_id);
  if (!store) return { ok: false, reason: "not-found" };

  /* Re-derived from the clock at the moment of the tap, the way every
     door is: a store can close the night between paint and tap. */
  const phase = roomPhase(
    {
      kind: event.kind,
      status: event.status,
      startsAt: event.starts_at,
      endsAt: event.ends_at,
      earlyBoardHours: store.early_board_hours,
      storeTimeZone: store.timezone,
    },
    Date.now(),
  );
  if (!boardWritable(phase)) return { ok: false, reason: "not-open" };

  if (!going) {
    /* Every seat the account holds here, from every device. Leaving is
       the same write the room's Leave button makes; the Flares stay on
       the board the way they do for a player who leaves a live room. */
    const seats = await accountSeats(eventId, playerId);
    await Promise.all(seats.map((sessionId) => leaveEvent(eventId, sessionId)));

    const state = await goingState(eventId, playerId);
    return {
      ok: true,
      youGoing: false,
      goingCount: state.goingCount,
      posted: 0,
      freshToken: null,
      code: event.join_code,
      storeId: event.store_id,
    };
  }

  let session: PlayerSessionRow;
  let freshToken: string | null;
  let created: boolean;
  try {
    const identity = await accountRoomIdentity(playerId, displayName, deviceSession);
    session = await nameSessionAfterAccount(identity.session, displayName);
    freshToken = identity.freshToken;
    created = identity.created;
  } catch (error) {
    console.error("Could not resolve the account's room identity", error);
    return { ok: false, reason: "unavailable" };
  }

  const joined = await joinEvent(eventId, session.id);
  if (!joined) {
    /* Only a session this call created may be undone; an adopted one
       belongs to the account and is very likely in another room. */
    if (created) await deletePlayerSession(session.id);
    return { ok: false, reason: "unavailable" };
  }

  /* Going to a night at a store makes it one of your locals, the same
     silent save a signed-in join makes. Attendance Embers are not paid
     here: those are for being there, and the live door still pays. */
  await saveLocal(playerId, event.store_id);

  /* The player's Flares go up on the board, honouring the account's
     switch. See auto-post.ts. */
  const posting = await postFlaresOnJoin(eventId, session, playerId);

  /* Who on the roster wants what you hold, and who holds what you want.
     After the response: the seat is taken whatever the matcher does,
     and `afterResponse` keeps the function alive until every push is
     out, where a bare `void` could be frozen part way through. */
  afterResponse(() => afterGoing(eventId, playerId));

  const state = await goingState(eventId, playerId);
  return {
    ok: true,
    youGoing: true,
    goingCount: Math.max(1, state.goingCount),
    posted: posting.posted,
    freshToken,
    code: event.join_code,
    storeId: event.store_id,
  };
}

export interface RosterBinder {
  id: string;
  name: string;
  cover: BinderCoverId;
  count: number;
}

export interface RosterPlayer {
  playerSessionId: string;
  playerId: string | null;
  displayName: string;
  avatarUrl: string | null;
  frame: string | null;
  ring: string | null;
  aura: string | null;
  present: boolean;
  /** Their Flares on this board. */
  flares: number;
  /** The size of their Have list: the cards in their binders up for trade. */
  tradeCards: number;
  /**
   * Matched cards between them and the viewer, both directions, from
   * the night's dashboard. Zero for a guest viewer, who has no lists.
   */
  matches: number;
  /** Up to three binders up for trade; empty for a guest. */
  binders: RosterBinder[];
  /**
   * The binders they said they are bringing to this night, as the
   * viewer may see them; empty when none are picked or visible.
   */
  bringing: RosterBinder[];
}

const ROSTER_BINDERS = 3;

/**
 * The binders up for trade for a batch of accounts, the first three of
 * each in the owner's order. Two queries for the whole roster rather
 * than a binder assembly per person: the roster wants a name, a cover
 * and a count, not every card's art. A private binder never appears,
 * which is the same rule `listBinders` gives a visitor.
 */
async function tradeBindersFor(
  playerIds: string[],
): Promise<Map<string, RosterBinder[]>> {
  const byPlayer = new Map<string, RosterBinder[]>();
  if (playerIds.length === 0) return byPlayer;

  const admin = getSupabaseAdmin();
  const { data: binders, error } = await admin
    .from("binders")
    .select("id, player_id, name, cover")
    .in("player_id", playerIds)
    .eq("for_trade", true)
    .order("position")
    .order("created_at");
  if (error) {
    console.error("Could not list the roster's binders", error);
    return byPlayer;
  }
  if (!binders || binders.length === 0) return byPlayer;

  const kept = binders.filter((binder) => {
    const mine = byPlayer.get(binder.player_id) ?? [];
    if (mine.length >= ROSTER_BINDERS) return false;
    mine.push({
      id: binder.id,
      name: binder.name,
      cover: isBinderCover(binder.cover) ? binder.cover : DEFAULT_BINDER_COVER,
      count: 0,
    });
    byPlayer.set(binder.player_id, mine);
    return true;
  });

  const { data: cards, error: cardError } = await admin
    .from("binder_cards")
    .select("binder_id")
    .in(
      "binder_id",
      kept.map((binder) => binder.id),
    );
  if (cardError) {
    console.error("Could not count the roster's binder cards", cardError);
    return byPlayer;
  }

  const counts = new Map<string, number>();
  for (const row of cards ?? []) {
    counts.set(row.binder_id, (counts.get(row.binder_id) ?? 0) + 1);
  }
  for (const list of byPlayer.values()) {
    for (const binder of list) binder.count = counts.get(binder.id) ?? 0;
  }

  return byPlayer;
}

/**
 * Who is going, with what they brought: their Flares on this board,
 * the binders they will trade from, how many cards are in them, and
 * how many of those match the viewer. Read by anyone the phase lets
 * read the board; `viewerId` is who is looking, and a guest viewer
 * gets zero matches beside every name because a guest has no lists.
 * The founder: "People should not just appear as names; show why they
 * may matter."
 */
export async function nightRoster(
  eventId: string,
  viewerId: string | null,
): Promise<RosterPlayer[]> {
  if (!isSupabaseConfigured()) return [];

  try {
    const [participants, flares] = await Promise.all([
      listParticipants(eventId),
      listRoomFlares(eventId),
    ]);
    if (participants.length === 0) return [];

    const flaresBySession = new Map<string, number>();
    for (const flare of flares) {
      flaresBySession.set(
        flare.playerSessionId,
        (flaresBySession.get(flare.playerSessionId) ?? 0) + 1,
      );
    }

    const accounts = participants.flatMap((row) =>
      row.playerId ? [row.playerId] : [],
    );
    const viewerAttending = viewerId !== null && accounts.includes(viewerId);
    const phase = await nightPhase(eventId);
    const [binders, tradeCards, matches, brought] = await Promise.all([
      tradeBindersFor(accounts),
      tradeCardCounts(accounts),
      perPlayerMatches(eventId, viewerId),
      phase
        ? broughtBindersFor(eventId, accounts, viewerId, viewerAttending, phase)
        : Promise.resolve(new Map<string, BroughtBinder[]>()),
    ]);

    return participants.map((row) => ({
      playerSessionId: row.playerSessionId,
      playerId: row.playerId,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
      frame: row.frame,
      ring: row.ring,
      aura: row.aura,
      present: row.present,
      flares: flaresBySession.get(row.playerSessionId) ?? 0,
      tradeCards: row.playerId ? (tradeCards.get(row.playerId) ?? 0) : 0,
      matches: row.playerId ? (matches[row.playerId] ?? 0) : 0,
      binders: row.playerId ? (binders.get(row.playerId) ?? []) : [],
      bringing: row.playerId
        ? (brought.get(row.playerId) ?? []).map((binder) => ({
            id: binder.id,
            name: binder.name,
            cover: binder.cover,
            count: binder.count,
          }))
        : [],
    }));
  } catch (error) {
    console.error(
      `Could not read the roster${viewerId ? " for the viewer" : ""}`,
      error,
    );
    return [];
  }
}
