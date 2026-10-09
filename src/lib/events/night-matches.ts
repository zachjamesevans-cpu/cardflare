import "server-only";

import { listBinders, type BinderSummary } from "@/lib/binder/binder";
import { pickBasePrinting, printingLabel, type CardPrinting } from "@/lib/cards/schema";
import { formatEventMoment } from "@/lib/events/format";
import {
  broughtBindersFor,
  broughtCardsAt,
  nightPhase,
  type BroughtBinder,
} from "@/lib/events/night-binders";
import { listParticipants } from "@/lib/events/participants";
import { findEventById, findStoreById } from "@/lib/events/repository";
import { boardReadable, roomPhase } from "@/lib/events/schema";
import {
  listRoomFlares,
  PRINTING_COLUMNS,
  toPrinting,
  type ListEntry,
  type PrintingRow,
} from "@/lib/lists/repository";
import { heldFirst } from "@/lib/matching/held-first";
import { heldByCard, matchFor, type MatchKind } from "@/lib/matching/schema";
import {
  notifyNightMatchForGoer,
  notifyNightMatchForHolder,
} from "@/lib/notifications/notify";
import { sessionsForPlayers } from "@/lib/players/accounts";
import { roomIdentitiesFor } from "@/lib/players/profile";
import { blockState, blockedSet } from "@/lib/players/safety";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { instantToLocal } from "@/lib/time/zone";

/**
 * Night matches: who on the roster wants what you hold, and who holds
 * what you want, told before the night rather than at the table.
 *
 * The founder: "Matches ping you before the night." Two directions
 * when P says Going to night E:
 *
 * - P hears about the roster: how many of the other players going
 *   want a card on P's Have list. Once per day per night, so a roster
 *   that grows through the week keeps P posted without nagging.
 * - The roster hears about P: each player going whose Have list holds
 *   a card P wants, once per (night, P). Capped so a tournament of a
 *   hundred does not fan out a hundred pushes from one tap.
 *
 * The Have list is `player_cards` marked for local trade, which the
 * trade binders keep in step; wants are `player_wants`. Everything is
 * computed at read time, and the only state it leaves is the
 * notification rows. Nothing here throws: the seat is taken already.
 */

/** How many roster players one Going may ping. */
export const NIGHT_MATCH_ROSTER_CAP = 20;

type Held = { cardId: string; printingId: string | null };

export async function afterGoing(eventId: string, playerId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;

  try {
    const event = await findEventById(eventId);
    if (!event) return;
    const store = await findStoreById(event.store_id);
    if (!store) return;

    /* The other accounts on the roster: a guest has nothing to match
       and nowhere to be told. Nobody on either side of a block with the
       goer, in either direction: a block means neither of you is told
       the other is coming, or counted in a "N of them want" line. */
    const [roster, blocked] = await Promise.all([
      listParticipants(eventId),
      blockedSet(playerId),
    ]);
    const others = [
      ...new Set(
        roster.flatMap((row) =>
          row.playerId && row.playerId !== playerId && !blocked.has(row.playerId)
            ? [row.playerId]
            : [],
        ),
      ),
    ].slice(0, NIGHT_MATCH_ROSTER_CAP);
    if (others.length === 0) return;

    const everyone = [playerId, ...others];
    const admin = getSupabaseAdmin();

    /* Have lists hang off sessions; wants off accounts. One bridge
       query, then one read of each list for the whole roster. */
    const playerBySession = await sessionsForPlayers(everyone);
    const sessionIds = [...playerBySession.keys()];

    const [haves, wants] = await Promise.all([
      sessionIds.length > 0
        ? admin
            .from("player_cards")
            .select("player_session_id, card_id, printing_id")
            .in("player_session_id", sessionIds)
            .eq("local_trade", true)
        : Promise.resolve({ data: [], error: null }),
      admin
        .from("player_wants")
        .select("player_id, card_id, printing_id")
        .in("player_id", everyone),
    ]);
    if (haves.error || wants.error) {
      console.error("Could not read the night's lists", haves.error ?? wants.error);
      return;
    }

    const havesByPlayer = new Map<string, Held[]>();
    for (const row of haves.data ?? []) {
      const owner = playerBySession.get(row.player_session_id);
      if (!owner) continue;
      const list = havesByPlayer.get(owner) ?? [];
      list.push({ cardId: row.card_id, printingId: row.printing_id });
      havesByPlayer.set(owner, list);
    }
    const wantsByPlayer = new Map<string, Held[]>();
    for (const row of wants.data ?? []) {
      const list = wantsByPlayer.get(row.player_id) ?? [];
      list.push({ cardId: row.card_id, printingId: row.printing_id });
      wantsByPlayer.set(row.player_id, list);
    }

    const when = formatEventMoment(event.starts_at, store.timezone);
    const code = event.join_code ?? store.join_code;
    const day = instantToLocal(new Date(), store.timezone).slice(0, 10);

    /* P hears about the roster. */
    const goerHeld = heldByCard(havesByPlayer.get(playerId) ?? []);
    let hunting = 0;
    if (goerHeld.size > 0) {
      for (const other of others) {
        const theirWants = wantsByPlayer.get(other) ?? [];
        if (theirWants.some((want) => matchFor(want, goerHeld) !== null)) hunting += 1;
      }
    }
    if (hunting > 0) {
      await notifyNightMatchForGoer({
        playerId,
        eventId,
        eventName: event.name,
        storeName: store.name,
        when,
        code,
        count: hunting,
        day,
      });
    }

    /* The roster hears about P. */
    const goerWants = wantsByPlayer.get(playerId) ?? [];
    if (goerWants.length === 0) return;

    const hits: { holderId: string; cardId: string }[] = [];
    for (const other of others) {
      const held = heldByCard(havesByPlayer.get(other) ?? []);
      if (held.size === 0) continue;
      const hit = goerWants.find((want) => matchFor(want, held) !== null);
      if (hit) hits.push({ holderId: other, cardId: hit.cardId });
    }
    if (hits.length === 0) return;

    const [{ data: goer }, { data: cards }] = await Promise.all([
      admin.from("players").select("display_name").eq("id", playerId).maybeSingle(),
      admin
        .from("cards")
        .select("id, exact_name")
        .in("id", [...new Set(hits.map((hit) => hit.cardId))]),
    ]);
    const nameByCard = new Map((cards ?? []).map((card) => [card.id, card.exact_name]));
    const goerName = goer?.display_name ?? "A player";

    for (const hit of hits) {
      await notifyNightMatchForHolder({
        holderId: hit.holderId,
        goerId: playerId,
        goerName,
        cardName: nameByCard.get(hit.cardId) ?? "card",
        eventId,
        eventName: event.name,
        storeName: store.name,
        when,
        code,
      });
    }
  } catch (error) {
    console.error("Could not run the night matches", error);
  }
}

/* ------------------------------------------------------------------ */
/* The trading dashboard: matches, mutual matches, what to bring       */
/* ------------------------------------------------------------------ */

/*
 * Round 2. The founder: "The most valuable information is NOT 'Who is
 * attending?' The most valuable information is 'Who can I trade with
 * and why?' The product should do as much matching as possible
 * automatically."
 *
 * For a player P at night E:
 *   wants(P) = P's saved wants (player_wants) + P's "want" Flares at E
 *   haves(P) = P's Have list (player_cards marked local_trade) + P's
 *              "showcase" Flares at E
 *
 * BINDER CARDS COME FROM TWO PLACES, AND ONLY TWO. The Have list,
 * derived from the binders that are up for trade, so "public Trade
 * Binder cards" and "the Have list" are one set by construction. And
 * the binders a player said they are bringing to THIS night
 * (`broughtCardsAt` in night-binders.ts), which may include a private
 * binder only when its owner ticked "Show to this Night only" for it,
 * and then only for viewers on this night's roster. There is still no
 * query against binder_cards in this file, and there must not be: the
 * privacy rule lives in one place. The founder: "private binders should
 * never be exposed", and (2026-10-09) "Do not automatically expose
 * private binders... require an explicit, clearly explained event-only
 * visibility choice."
 *
 * Matching is on the card, then graded by printing the way the board
 * grades an offer (`matchFor`): a want that takes any printing is an
 * exact match with any copy; a want that names a printing is exact
 * only when the holder is known to have that printing, and reads
 * "other printing" when their copy is a different one or one of
 * unknown printing. Claiming the right alt art would be guessing, and
 * one wrong "they have this" costs more than ten missed matches. The
 * label on a match card is the printing the wanter named, or null when
 * any will do.
 */

export interface MatchCard {
  cardId: string;
  name: string;
  number: string;
  imageUrl: string | null;
  /** The printing the wanter asked for, or null for any. */
  printingLabel: string | null;
  /** Whether the holder's copy is the printing asked for. */
  match: MatchKind;
  /**
   * The binder the holder said they are bringing to this night with
   * the card in it, or null when it is only on their Have list or a
   * Flare. Why the match is worth a trip: it is coming in a bag.
   */
  bringingFrom?: string | null;
}

export interface MatchPlayer {
  playerId: string;
  playerSessionId: string | null;
  displayName: string;
  avatarUrl: string | null;
  frame: string | null;
  ring: string | null;
  aura: string | null;
}

export interface TheyHaveMatch {
  player: MatchPlayer;
  cards: { card: MatchCard; source: "binder" | "flare"; fromYourFlare: boolean }[];
}

export interface TheyWantMatch {
  player: MatchPlayer;
  cards: MatchCard[];
}

export interface MutualMatch {
  player: MatchPlayer;
  youWant: MatchCard[];
  theyWant: MatchCard[];
}

export interface BringCard {
  card: MatchCard;
  wantedBy: string[];
  packed: boolean;
}

export interface NightMatches {
  summary: {
    total: number;
    cardsHuntingHere: number;
    playersWantYours: number;
    mutual: number;
  };
  mutual: MutualMatch[];
  theyHave: TheyHaveMatch[];
  theyWant: TheyWantMatch[];
  bring: BringCard[];
  /** playerId -> how many matched cards that player and the viewer share, both directions. */
  perPlayer: Record<string, number>;
}

export const EMPTY_MATCHES: NightMatches = {
  summary: { total: 0, cardsHuntingHere: 0, playersWantYours: 0, mutual: 0 },
  mutual: [],
  theyHave: [],
  theyWant: [],
  bring: [],
  perPlayer: {},
};

/** How many of the roster the dashboard matches against. */
export const NIGHT_ATTENDEE_CAP = 200;

/* ---- Pure helpers, unit-tested without a database ------------------ */

/** One player's four lists at one night, as card ids, and the printings behind them. */
export interface CardLists {
  /** Saved wants plus "want" Flares at this night. */
  wants: Set<string>;
  /** The subset of `wants` that is a Flare at this night. */
  flareWants: Set<string>;
  /** The Have list: the cards in the binders up for trade. */
  binderHaves: Set<string>;
  /** "showcase" Flares at this night. */
  flareHaves: Set<string>;
  /**
   * Per wanted card, the printings asked for; null in the set means
   * any printing will do. A card absent here is wanted in any printing.
   */
  wantPrintings: Map<string, Set<string | null>>;
  /**
   * Per held card, the printings known to be held; null means a copy
   * of unknown printing. A card absent here is held in unknown printing.
   */
  havePrintings: Map<string, Set<string | null>>;
  /**
   * Cards in the binders this player said they are bringing to this
   * night, by card, with the binder's name. Part of `binderHaves`
   * already; this says which of those are coming in a bag.
   */
  brought?: Map<string, string>;
}

export function emptyLists(): CardLists {
  return {
    wants: new Set(),
    flareWants: new Set(),
    binderHaves: new Set(),
    flareHaves: new Set(),
    wantPrintings: new Map(),
    havePrintings: new Map(),
  };
}

/** Adds one printing (or null for unknown) to a card's set in a list. */
export function notePrinting(
  into: Map<string, Set<string | null>>,
  cardId: string,
  printingId: string | null,
): void {
  const set = into.get(cardId) ?? new Set<string | null>();
  set.add(printingId);
  into.set(cardId, set);
}

/**
 * How well a holder's copies answer a want, the board's rule: any
 * printing asked for is exact with any copy; a named printing is exact
 * only when the holder is known to have it, and "other printing"
 * otherwise, including when the holder's printing is unknown.
 */
export function printingMatch(
  wanted: Set<string | null> | undefined,
  held: Set<string | null> | undefined,
): MatchKind {
  if (!wanted || wanted.size === 0 || wanted.has(null)) return "exact";
  for (const printingId of wanted) {
    if (printingId !== null && held?.has(printingId)) return "exact";
  }
  return "other-printing";
}

/**
 * The printing to name on the match card: null when any will do, the
 * held one when a named printing matched, otherwise the first one the
 * wanter asked for, so the card says what was wanted.
 */
export function wantedPrinting(
  wanted: Set<string | null> | undefined,
  held: Set<string | null> | undefined,
): string | null {
  if (!wanted || wanted.size === 0 || wanted.has(null)) return null;
  for (const printingId of wanted) {
    if (printingId !== null && held?.has(printingId)) return printingId;
  }
  for (const printingId of wanted) if (printingId !== null) return printingId;
  return null;
}

/** The members of `a` that are also in `b`, in `a`'s order. */
export function intersect(a: Iterable<string>, b: Set<string>): string[] {
  const out: string[] = [];
  for (const item of a) if (b.has(item)) out.push(item);
  return out;
}

/** Splits a list into runs of at most `size`, for queries with a row ceiling. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export interface MatchedCard {
  cardId: string;
  source: "binder" | "flare";
  fromYourFlare: boolean;
  match: MatchKind;
  /** The printing the wanter named, or null for any. */
  printingId: string | null;
  /** The binder they are bringing with it in, or null. */
  bringingFrom: string | null;
}

export interface WantedCard {
  cardId: string;
  match: MatchKind;
  /** The printing the wanter named, or null for any. */
  printingId: string | null;
  /** The viewer's own binder they are bringing with it in, or null. */
  bringingFrom: string | null;
}

/** One attendee who matches the viewer in at least one direction. */
export interface MatchedPlayer {
  playerId: string;
  /** Cards the viewer wants that this attendee has. */
  theyHave: MatchedCard[];
  /** Cards this attendee wants that the viewer has. */
  theyWant: WantedCard[];
}

/**
 * Every attendee with something to trade with the viewer, both
 * directions. A card the attendee holds in a binder AND posted as a
 * showcase reads as "binder": the binder is the durable fact.
 */
export function matchAttendees(
  viewer: CardLists,
  attendees: Map<string, CardLists>,
): MatchedPlayer[] {
  const matched: MatchedPlayer[] = [];
  for (const [playerId, lists] of attendees) {
    const theyHave: MatchedCard[] = [];
    for (const cardId of viewer.wants) {
      const inBinder = lists.binderHaves.has(cardId);
      if (!inBinder && !lists.flareHaves.has(cardId)) continue;
      const wanted = viewer.wantPrintings.get(cardId);
      const held = lists.havePrintings.get(cardId);
      theyHave.push({
        cardId,
        source: inBinder ? "binder" : "flare",
        fromYourFlare: viewer.flareWants.has(cardId),
        match: printingMatch(wanted, held),
        printingId: wantedPrinting(wanted, held),
        bringingFrom: lists.brought?.get(cardId) ?? null,
      });
    }
    const theyWant: WantedCard[] = [];
    for (const cardId of lists.wants) {
      if (viewer.binderHaves.has(cardId) || viewer.flareHaves.has(cardId)) {
        const wanted = lists.wantPrintings.get(cardId);
        const held = viewer.havePrintings.get(cardId);
        theyWant.push({
          cardId,
          match: printingMatch(wanted, held),
          printingId: wantedPrinting(wanted, held),
          bringingFrom: viewer.brought?.get(cardId) ?? null,
        });
      }
    }
    if (theyHave.length === 0 && theyWant.length === 0) continue;
    matched.push({ playerId, theyHave, theyWant });
  }
  return matched;
}

export function isMutual(player: MatchedPlayer): boolean {
  return player.theyHave.length > 0 && player.theyWant.length > 0;
}

/**
 * The four numbers at the top of the page. `cardsHuntingHere` counts
 * distinct cards, because two players holding the same Shanks is one
 * card the viewer can get tonight; `playersWantYours` counts people,
 * because each is a conversation. The total is the two added, which
 * is what "7 matches for you" means.
 */
export function summarize(matched: MatchedPlayer[]): NightMatches["summary"] {
  const hunting = new Set<string>();
  let playersWantYours = 0;
  let mutual = 0;
  for (const player of matched) {
    for (const card of player.theyHave) hunting.add(card.cardId);
    if (player.theyWant.length > 0) playersWantYours += 1;
    if (isMutual(player)) mutual += 1;
  }
  return {
    total: hunting.size + playersWantYours,
    cardsHuntingHere: hunting.size,
    playersWantYours,
    mutual,
  };
}

/** Distinct matched cards per player, both directions. */
export function perPlayerCounts(matched: MatchedPlayer[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const player of matched) {
    const cards = new Set<string>();
    for (const card of player.theyHave) cards.add(card.cardId);
    for (const card of player.theyWant) cards.add(card.cardId);
    counts[player.playerId] = cards.size;
  }
  return counts;
}

/**
 * The checklist: the viewer's Have-list cards at least one attendee
 * wants, most wanted first. Only the binder's cards, never a showcase
 * Flare's: a Flare is already in the bag, by definition.
 */
export function bringFrom(
  matched: MatchedPlayer[],
  viewerBinderHaves: Set<string>,
  nameOf: (playerId: string) => string,
): { cardId: string; wantedBy: string[] }[] {
  const byCard = new Map<string, string[]>();
  for (const player of matched) {
    for (const { cardId } of player.theyWant) {
      if (!viewerBinderHaves.has(cardId)) continue;
      const names = byCard.get(cardId) ?? [];
      names.push(nameOf(player.playerId));
      byCard.set(cardId, names);
    }
  }
  return [...byCard]
    .map(([cardId, wantedBy]) => ({ cardId, wantedBy }))
    .sort((a, b) => b.wantedBy.length - a.wantedBy.length);
}

/** Most cards first, then by name, so the list is stable between polls. */
export function orderMatched<T extends { playerId: string }>(
  players: T[],
  weight: (player: T) => number,
  nameOf: (playerId: string) => string,
): T[] {
  return [...players].sort((a, b) => {
    const byWeight = weight(b) - weight(a);
    if (byWeight !== 0) return byWeight;
    return nameOf(a.playerId).localeCompare(nameOf(b.playerId));
  });
}

/* ---- Reads ---------------------------------------------------------- */

interface NightLists {
  viewer: CardLists;
  /** Attendees with an account, the viewer excluded, capped. */
  attendees: Map<string, CardLists>;
  /** playerId -> the session seated at this night (the newest seen). */
  seatOf: Map<string, string>;
  /** playerId -> display name, as the roster shows it. */
  nameOf: Map<string, string>;
}

/** Sessions per query: 60 sessions of at most 200 cards each, narrowed by card. */
const SESSION_CHUNK = 60;
/** Card ids per query, so the URL stays inside the envelope the board already uses. */
const CARD_CHUNK = 120;

/**
 * Everyone's lists at a batch of nights, in a fixed number of queries
 * however many nights are asked for: the seats, the sessions behind
 * them, the viewer's two lists, the Flares on the boards, then the
 * attendees' two lists NARROWED to the viewer's cards, so a roster of
 * two hundred costs rows for the cards that match and nothing else.
 *
 * No PostgREST embed anywhere: the hand-kept types declare no
 * relationships, so an embed would type as never. Every join is a
 * Map here.
 */
async function readLists(
  eventIds: string[],
  viewerId: string,
  only: string[] | null = null,
): Promise<Map<string, NightLists>> {
  const result = new Map<string, NightLists>();
  if (eventIds.length === 0) return result;

  const admin = getSupabaseAdmin();

  const { data: seats, error: seatError } = await admin
    .from("event_participants")
    .select("event_id, player_session_id, last_seen_at")
    .in("event_id", eventIds)
    .order("last_seen_at", { ascending: false });
  if (seatError) {
    console.error("Could not read the nights' seats", seatError);
    return result;
  }

  const seatSessionIds = [...new Set((seats ?? []).map((s) => s.player_session_id))];
  const { data: seatSessions, error: sessionError } =
    seatSessionIds.length > 0
      ? await admin
          .from("player_sessions")
          .select("id, player_id, display_name")
          .in("id", seatSessionIds)
      : { data: [], error: null };
  if (sessionError) {
    console.error("Could not resolve the nights' seats", sessionError);
    return result;
  }
  const seatSession = new Map((seatSessions ?? []).map((row) => [row.id, row]));

  /* Per night: who is there with an account, newest seat first, the
     viewer left out, capped. */
  const attendeesOf = new Map<string, string[]>();
  const seatOfAt = new Map<string, Map<string, string>>();
  const nameOf = new Map<string, string>();
  /* Whether the viewer is on each night's roster: a private binder
     brought with "this Night only" counts for its attendees alone. */
  const viewerAttendingAt = new Map<string, boolean>();
  for (const seat of seats ?? []) {
    const session = seatSession.get(seat.player_session_id);
    const playerId = session?.player_id;
    if (session && playerId === viewerId) viewerAttendingAt.set(seat.event_id, true);
    if (!session || !playerId || playerId === viewerId) continue;
    if (only && !only.includes(playerId)) continue;
    const seatOf = seatOfAt.get(seat.event_id) ?? new Map<string, string>();
    if (seatOf.has(playerId)) continue;
    const list = attendeesOf.get(seat.event_id) ?? [];
    if (list.length >= NIGHT_ATTENDEE_CAP) continue;
    list.push(playerId);
    attendeesOf.set(seat.event_id, list);
    seatOf.set(playerId, session.id);
    seatOfAt.set(seat.event_id, seatOf);
    if (!nameOf.has(playerId)) nameOf.set(playerId, session.display_name);
  }

  const others = [...new Set([...attendeesOf.values()].flat())];
  const playerBySession = await sessionsForPlayers([viewerId, ...others]);
  const sessionsOf = new Map<string, string[]>();
  for (const [sessionId, playerId] of playerBySession) {
    sessionsOf.set(playerId, [...(sessionsOf.get(playerId) ?? []), sessionId]);
  }
  const viewerSessions = sessionsOf.get(viewerId) ?? [];

  const [viewerWants, viewerHaves, flares] = await Promise.all([
    admin.from("player_wants").select("card_id, printing_id").eq("player_id", viewerId),
    viewerSessions.length > 0
      ? admin
          .from("player_cards")
          .select("card_id, printing_id")
          .in("player_session_id", viewerSessions)
          .eq("local_trade", true)
      : Promise.resolve({ data: [], error: null }),
    admin
      .from("flares")
      .select("event_id, player_session_id, card_id, printing_id, intent")
      .in("event_id", eventIds)
      .eq("status", "open"),
  ]);
  for (const read of [viewerWants, viewerHaves, flares]) {
    if (read.error) console.error("Could not read a night's lists", read.error);
  }

  /* Flares per night per player, each way, with the printing each named. */
  const flareWantsAt = new Map<string, Map<string, Set<string>>>();
  const flareHavesAt = new Map<string, Map<string, Set<string>>>();
  type Printings = Map<string, Set<string | null>>;
  const flareWantPrintingsAt = new Map<string, Map<string, Printings>>();
  const flareHavePrintingsAt = new Map<string, Map<string, Printings>>();
  for (const row of flares.data ?? []) {
    if (!row.event_id || !row.player_session_id) continue;
    const playerId = playerBySession.get(row.player_session_id);
    if (!playerId) continue;
    const showcase = row.intent === "showcase";
    const bucket = showcase ? flareHavesAt : flareWantsAt;
    const byPlayer = bucket.get(row.event_id) ?? new Map<string, Set<string>>();
    const cards = byPlayer.get(playerId) ?? new Set<string>();
    cards.add(row.card_id);
    byPlayer.set(playerId, cards);
    bucket.set(row.event_id, byPlayer);
    const printingBucket = showcase ? flareHavePrintingsAt : flareWantPrintingsAt;
    const printingsByPlayer =
      printingBucket.get(row.event_id) ?? new Map<string, Printings>();
    const printings = printingsByPlayer.get(playerId) ?? new Map();
    notePrinting(printings, row.card_id, row.printing_id ?? null);
    printingsByPlayer.set(playerId, printings);
    printingBucket.set(row.event_id, printingsByPlayer);
  }

  const savedWants = new Set((viewerWants.data ?? []).map((row) => row.card_id));
  const binderHaves = new Set((viewerHaves.data ?? []).map((row) => row.card_id));
  const viewerWantPrintings: Printings = new Map();
  for (const row of viewerWants.data ?? []) {
    notePrinting(viewerWantPrintings, row.card_id, row.printing_id ?? null);
  }
  const viewerHavePrintings: Printings = new Map();
  for (const row of viewerHaves.data ?? []) {
    notePrinting(viewerHavePrintings, row.card_id, row.printing_id ?? null);
  }

  /* Everything the viewer wants or has at any of these nights: the
     narrowing for the attendees' reads. */
  const viewerWantsAll = new Set(savedWants);
  const viewerHavesAll = new Set(binderHaves);
  for (const eventId of eventIds) {
    for (const cards of flareWantsAt.get(eventId)?.get(viewerId) ?? []) {
      viewerWantsAll.add(cards);
    }
    for (const cards of flareHavesAt.get(eventId)?.get(viewerId) ?? []) {
      viewerHavesAll.add(cards);
    }
  }

  /* The binders each player said they are bringing to each night, read
     through their pointers: other players' narrowed to what the viewer
     wants, the viewer's own whole, so their cards narrow the wants read
     below as the Have list does. See night-binders.ts for who may count. */
  const broughtAt = await broughtCardsAt(
    eventIds,
    [viewerId, ...others],
    viewerId,
    viewerAttendingAt,
    viewerWantsAll,
  );
  for (const byPlayer of broughtAt.values()) {
    for (const cardId of byPlayer.get(viewerId)?.printings.keys() ?? []) {
      viewerHavesAll.add(cardId);
    }
  }

  const otherSessions = others.flatMap((playerId) => sessionsOf.get(playerId) ?? []);
  const haveReads =
    otherSessions.length > 0 && viewerWantsAll.size > 0
      ? chunk(otherSessions, SESSION_CHUNK).flatMap((sessions) =>
          chunk([...viewerWantsAll], CARD_CHUNK).map((cards) =>
            admin
              .from("player_cards")
              .select("player_session_id, card_id, printing_id")
              .in("player_session_id", sessions)
              .in("card_id", cards)
              .eq("local_trade", true),
          ),
        )
      : [];
  const wantReads =
    others.length > 0 && viewerHavesAll.size > 0
      ? chunk(others, SESSION_CHUNK).flatMap((players) =>
          chunk([...viewerHavesAll], CARD_CHUNK).map((cards) =>
            admin
              .from("player_wants")
              .select("player_id, card_id, printing_id")
              .in("player_id", players)
              .in("card_id", cards),
          ),
        )
      : [];
  const [haveRows, wantRows] = await Promise.all([
    Promise.all(haveReads),
    Promise.all(wantReads),
  ]);

  const binderHavesOf = new Map<string, Set<string>>();
  const havePrintingsOf = new Map<string, Printings>();
  for (const read of haveRows) {
    if (read.error) console.error("Could not read the roster's Have lists", read.error);
    for (const row of read.data ?? []) {
      const playerId = playerBySession.get(row.player_session_id);
      if (!playerId) continue;
      const cards = binderHavesOf.get(playerId) ?? new Set<string>();
      cards.add(row.card_id);
      binderHavesOf.set(playerId, cards);
      const printings = havePrintingsOf.get(playerId) ?? new Map();
      notePrinting(printings, row.card_id, row.printing_id ?? null);
      havePrintingsOf.set(playerId, printings);
    }
  }
  const savedWantsOf = new Map<string, Set<string>>();
  const wantPrintingsOf = new Map<string, Printings>();
  for (const read of wantRows) {
    if (read.error) console.error("Could not read the roster's wants", read.error);
    for (const row of read.data ?? []) {
      const cards = savedWantsOf.get(row.player_id) ?? new Set<string>();
      cards.add(row.card_id);
      savedWantsOf.set(row.player_id, cards);
      const printings = wantPrintingsOf.get(row.player_id) ?? new Map();
      notePrinting(printings, row.card_id, row.printing_id ?? null);
      wantPrintingsOf.set(row.player_id, printings);
    }
  }

  const listsFor = (
    playerId: string,
    eventId: string,
    saved: Set<string>,
    binder: Set<string>,
    savedPrintings: Printings,
    binderPrintings: Printings,
  ): CardLists => {
    const flareWants = flareWantsAt.get(eventId)?.get(playerId) ?? new Set<string>();
    const flareHaves = flareHavesAt.get(eventId)?.get(playerId) ?? new Set<string>();
    /* A Flare's printing joins the saved list's: a card saved for any
       printing and flared for the alt art is wanted in any printing. */
    const wantPrintings: Printings = new Map();
    const havePrintings: Printings = new Map();
    for (const [cardId, set] of savedPrintings) wantPrintings.set(cardId, new Set(set));
    for (const [cardId, set] of binderPrintings)
      havePrintings.set(cardId, new Set(set));
    for (const [cardId, set] of flareWantPrintingsAt.get(eventId)?.get(playerId) ??
      []) {
      for (const printingId of set) notePrinting(wantPrintings, cardId, printingId);
    }
    for (const [cardId, set] of flareHavePrintingsAt.get(eventId)?.get(playerId) ??
      []) {
      for (const printingId of set) notePrinting(havePrintings, cardId, printingId);
    }
    /* A brought binder's cards join the Have list for this night only,
       printings and all; the Have list's own entries win on printing. */
    const bringing = broughtAt.get(eventId)?.get(playerId);
    const binderHaves = new Set(binder);
    for (const [cardId, set] of bringing?.printings ?? []) {
      binderHaves.add(cardId);
      for (const printingId of set) notePrinting(havePrintings, cardId, printingId);
    }
    return {
      wants: new Set([...saved, ...flareWants]),
      flareWants,
      binderHaves,
      flareHaves,
      wantPrintings,
      havePrintings,
      brought: bringing?.binderOf ?? new Map(),
    };
  };

  for (const eventId of eventIds) {
    const attendees = new Map<string, CardLists>();
    for (const playerId of attendeesOf.get(eventId) ?? []) {
      attendees.set(
        playerId,
        listsFor(
          playerId,
          eventId,
          savedWantsOf.get(playerId) ?? new Set(),
          binderHavesOf.get(playerId) ?? new Set(),
          wantPrintingsOf.get(playerId) ?? new Map(),
          havePrintingsOf.get(playerId) ?? new Map(),
        ),
      );
    }
    result.set(eventId, {
      viewer: listsFor(
        viewerId,
        eventId,
        savedWants,
        binderHaves,
        viewerWantPrintings,
        viewerHavePrintings,
      ),
      attendees,
      seatOf: seatOfAt.get(eventId) ?? new Map(),
      nameOf,
    });
  }

  return result;
}

/** A card's facts and every printing of it, for naming a match. */
export interface NamedCard {
  cardId: string;
  name: string;
  number: string;
  baseImageUrl: string | null;
  printings: CardPrinting[];
}

/**
 * Name, number, art and printings for a batch of cards. The picture is
 * the base printing's, the same stand-in a Flare that takes any
 * printing shows, unless the wanter named a printing, when it is that
 * printing's; the label is the named printing's, or null for any.
 */
async function matchCards(cardIds: string[]): Promise<Map<string, NamedCard>> {
  const cards = new Map<string, NamedCard>();
  const ids = [...new Set(cardIds)];
  if (ids.length === 0) return cards;

  const admin = getSupabaseAdmin();
  const [cardRows, printingRows] = await Promise.all([
    admin.from("cards").select("id, exact_name, canonical_card_number").in("id", ids),
    admin.from("card_printings").select(PRINTING_COLUMNS).in("card_id", ids),
  ]);
  if (cardRows.error || printingRows.error) {
    console.error(
      "Could not name the matched cards",
      cardRows.error ?? printingRows.error,
    );
  }

  const byCard = new Map<string, CardPrinting[]>();
  for (const row of (printingRows.data ?? []) as PrintingRow[]) {
    byCard.set(row.card_id, [...(byCard.get(row.card_id) ?? []), toPrinting(row)]);
  }
  for (const row of cardRows.data ?? []) {
    const printings = byCard.get(row.id) ?? [];
    const base = pickBasePrinting(printings, row.exact_name);
    cards.set(row.id, {
      cardId: row.id,
      name: row.exact_name,
      number: row.canonical_card_number,
      baseImageUrl: base?.imageUrl ?? null,
      printings,
    });
  }
  return cards;
}

/** One match card: the named card, drawn as the printing the wanter asked for. */
export function matchCardFor(
  named: NamedCard | undefined,
  cardId: string,
  printingId: string | null,
  match: MatchKind,
): MatchCard {
  if (!named) {
    return {
      cardId,
      name: "Unknown card",
      number: "",
      imageUrl: null,
      printingLabel: null,
      match,
    };
  }
  const printing = printingId
    ? named.printings.find((candidate) => candidate.id === printingId)
    : undefined;
  return {
    cardId,
    name: named.name,
    number: named.number,
    imageUrl: printing?.imageUrl ?? named.baseImageUrl,
    printingLabel: printing ? printingLabel(printing, named.name) : null,
    match,
  };
}

async function playersFor(
  playerIds: string[],
  lists: Pick<NightLists, "seatOf" | "nameOf">,
): Promise<Map<string, MatchPlayer>> {
  const identities = await roomIdentitiesFor(playerIds);
  return new Map(
    playerIds.map((playerId) => [
      playerId,
      {
        playerId,
        playerSessionId: lists.seatOf.get(playerId) ?? null,
        displayName: lists.nameOf.get(playerId) ?? "Player",
        avatarUrl: identities.get(playerId)?.avatarUrl ?? null,
        frame: identities.get(playerId)?.frame ?? null,
        ring: identities.get(playerId)?.ring ?? null,
        aura: identities.get(playerId)?.aura ?? null,
      },
    ]),
  );
}

/** The cards the viewer has ticked Packed at this night. */
async function packedCards(eventId: string, playerId: string): Promise<Set<string>> {
  const { data, error } = await getSupabaseAdmin()
    .from("night_packing")
    .select("card_id")
    .eq("event_id", eventId)
    .eq("player_id", playerId);
  if (error) {
    console.error("Could not read what is packed", error);
    return new Set();
  }
  return new Set((data ?? []).map((row) => row.card_id));
}

/**
 * Whether the night's board can be read right now. A finished night
 * has no matches: the founder, "event-specific attendee relationships
 * no longer show as active."
 */
async function nightReadable(eventId: string): Promise<boolean> {
  const event = await findEventById(eventId);
  if (!event || event.cancelled_at) return false;
  const store = await findStoreById(event.store_id);
  if (!store) return false;
  return boardReadable(
    roomPhase(
      {
        kind: event.kind,
        status: event.status,
        startsAt: event.starts_at,
        endsAt: event.ends_at,
        earlyBoardHours: store.early_board_hours,
        storeTimeZone: store.timezone,
      },
      Date.now(),
    ),
  );
}

/**
 * The viewer's matches at one night: who has what they want, who wants
 * what they have, the mutual ones, and the checklist. A guest has no
 * lists to match, so a guest gets the empty answer, as does anything
 * that fails: the page draws "No matches yet" rather than an error.
 */
export async function nightMatches(
  eventId: string,
  viewerId: string | null,
): Promise<NightMatches> {
  if (!viewerId || !isSupabaseConfigured()) return EMPTY_MATCHES;

  try {
    if (!(await nightReadable(eventId))) return EMPTY_MATCHES;

    const lists = (await readLists([eventId], viewerId)).get(eventId);
    if (!lists) return EMPTY_MATCHES;

    const nameOf = (playerId: string) => lists.nameOf.get(playerId) ?? "Player";
    const matched = matchAttendees(lists.viewer, lists.attendees);
    const bring = bringFrom(matched, lists.viewer.binderHaves, nameOf);

    const cardIds = [
      ...matched.flatMap((player) => [
        ...player.theyHave.map((card) => card.cardId),
        ...player.theyWant.map((card) => card.cardId),
      ]),
      ...bring.map((card) => card.cardId),
    ];
    const [cards, players, packed] = await Promise.all([
      matchCards(cardIds),
      playersFor(
        matched.map((player) => player.playerId),
        lists,
      ),
      packedCards(eventId, viewerId),
    ]);
    const cardFor = (card: {
      cardId: string;
      printingId: string | null;
      match: MatchKind;
      bringingFrom?: string | null;
    }) => ({
      ...matchCardFor(cards.get(card.cardId), card.cardId, card.printingId, card.match),
      bringingFrom: card.bringingFrom ?? null,
    });
    /* The checklist is the viewer's own copies, so nothing is in question. */
    const ownCard = (cardId: string) =>
      matchCardFor(cards.get(cardId), cardId, null, "exact");
    const playerFor = (playerId: string): MatchPlayer =>
      players.get(playerId) ?? {
        playerId,
        playerSessionId: lists.seatOf.get(playerId) ?? null,
        displayName: nameOf(playerId),
        avatarUrl: null,
        frame: null,
        ring: null,
        aura: null,
      };

    const weight = (player: MatchedPlayer) =>
      player.theyHave.length + player.theyWant.length;
    const ordered = orderMatched(matched, weight, nameOf);

    return {
      summary: summarize(matched),
      mutual: ordered.filter(isMutual).map((player) => ({
        player: playerFor(player.playerId),
        youWant: player.theyHave.map(cardFor),
        theyWant: player.theyWant.map(cardFor),
      })),
      theyHave: ordered
        .filter((player) => player.theyHave.length > 0)
        .map((player) => ({
          player: playerFor(player.playerId),
          cards: player.theyHave.map((card) => ({
            card: cardFor(card),
            source: card.source,
            fromYourFlare: card.fromYourFlare,
          })),
        })),
      theyWant: ordered
        .filter((player) => player.theyWant.length > 0)
        .map((player) => ({
          player: playerFor(player.playerId),
          cards: player.theyWant.map(cardFor),
        })),
      bring: bring.map((card) => ({
        card: ownCard(card.cardId),
        wantedBy: card.wantedBy,
        packed: packed.has(card.cardId),
      })),
      perPlayer: perPlayerCounts(matched),
    };
  } catch (error) {
    console.error("Could not match the night", error);
    return EMPTY_MATCHES;
  }
}

/**
 * The four numbers for a batch of nights, for the Nights list's "6
 * matches" line: one pass over the lists for every night asked about.
 * Every id asked for is answered, with zeros when nothing matched.
 */
export async function nightMatchSummaries(
  eventIds: string[],
  viewerId: string,
): Promise<Map<string, NightMatches["summary"]>> {
  const summaries = new Map(
    eventIds.map((id) => [id, { ...EMPTY_MATCHES.summary }] as const),
  );
  if (eventIds.length === 0 || !isSupabaseConfigured()) return summaries;

  try {
    const lists = await readLists(eventIds, viewerId);
    for (const [eventId, night] of lists) {
      summaries.set(eventId, summarize(matchAttendees(night.viewer, night.attendees)));
    }
  } catch (error) {
    console.error("Could not summarise the nights' matches", error);
  }
  return summaries;
}

/**
 * `perPlayer` alone, for the roster's "2 matches" beside each face,
 * without naming a single card. Empty for a guest.
 */
export async function perPlayerMatches(
  eventId: string,
  viewerId: string | null,
): Promise<Record<string, number>> {
  if (!viewerId || !isSupabaseConfigured()) return {};
  try {
    const lists = (await readLists([eventId], viewerId)).get(eventId);
    if (!lists) return {};
    return perPlayerCounts(matchAttendees(lists.viewer, lists.attendees));
  } catch (error) {
    console.error("Could not count the roster's matches", error);
    return {};
  }
}

export interface NightPlayerView {
  player: MatchPlayer;
  matches: number;
  theyHave: MatchCard[];
  theyWant: MatchCard[];
  /**
   * Their Flares at this night, from listRoomFlares filtered by their
   * session(s). Without the session id: a room session is a credential
   * of sorts, and nobody but its owner needs it.
   *
   * `match` is the viewer's: whether their Have list answers the want,
   * graded the way the They want row is, so a card in that row wears
   * the same ring here. Null on an offer, and for anybody with no
   * lists to match (a guest, or the player looking at themselves).
   * The ones you hold come first.
   */
  flares: (Omit<ListEntry, "playerSessionId"> & { match: MatchKind | null })[];
  /** for_trade only (listBinders with the viewer). */
  binders: BinderSummary[];
  /**
   * The binders they said they are bringing to this night, as the
   * viewer may see them (night-binders.ts): a private one only for an
   * attendee, and only when they chose to show it to this night.
   */
  bringing: BroughtBinder[];
  flaresCount: number;
  /** Size of their Have list. */
  tradeCards: number;
}

/** Sessions per Have-list count query: ten full binders stay under the row ceiling. */
const HAVE_COUNT_CHUNK = 5;

/**
 * How many cards each account has up for trade, for a batch. The Have
 * list again, and only the Have list, so a private binder's size is
 * not even hinted at. Read as narrow rows in small runs of sessions,
 * because PostgREST stops a page at a thousand rows and a count that
 * stopped early would be a lie.
 */
export async function tradeCardCounts(
  playerIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (playerIds.length === 0 || !isSupabaseConfigured()) return counts;

  try {
    const playerBySession = await sessionsForPlayers(playerIds);
    const sessionIds = [...playerBySession.keys()];
    if (sessionIds.length === 0) return counts;

    const admin = getSupabaseAdmin();
    const reads = await Promise.all(
      chunk(sessionIds, HAVE_COUNT_CHUNK).map((sessions) =>
        admin
          .from("player_cards")
          .select("player_session_id")
          .in("player_session_id", sessions)
          .eq("local_trade", true),
      ),
    );
    for (const read of reads) {
      if (read.error) console.error("Could not count the Have lists", read.error);
      for (const row of read.data ?? []) {
        const playerId = playerBySession.get(row.player_session_id);
        if (!playerId) continue;
        counts.set(playerId, (counts.get(playerId) ?? 0) + 1);
      }
    }
  } catch (error) {
    console.error("Could not count the Have lists", error);
  }
  return counts;
}

/**
 * One player as the night sees them: their matches with the viewer,
 * their Flares here, and their binders up for trade. Null when they
 * are not on the roster. A private binder never appears: `listBinders`
 * gives a visitor only the ones up for trade, and the filter here
 * says so again for the owner looking at themselves.
 */
export async function nightPlayer(
  eventId: string,
  playerId: string,
  viewerId: string | null,
): Promise<NightPlayerView | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    /* A block hides them here as on their profile, either way round:
       the same answer as a player who is not on the roster. */
    if (viewerId && viewerId !== playerId) {
      const block = await blockState(viewerId, playerId);
      if (block.blocked || block.blockedBy) return null;
    }

    const participants = await listParticipants(eventId);
    const seat = participants.find((row) => row.playerId === playerId);
    if (!seat) return null;

    const viewerAttending =
      viewerId !== null && participants.some((row) => row.playerId === viewerId);
    const phase = await nightPhase(eventId);
    const [sessions, roomFlares, binders, counts, lists, brought] = await Promise.all([
      sessionsForPlayers([playerId]),
      listRoomFlares(eventId),
      listBinders(playerId, viewerId),
      tradeCardCounts([playerId]),
      viewerId && viewerId !== playerId
        ? readLists([eventId], viewerId, [playerId])
        : Promise.resolve(new Map<string, NightLists>()),
      phase
        ? broughtBindersFor(eventId, [playerId], viewerId, viewerAttending, phase)
        : Promise.resolve(new Map<string, BroughtBinder[]>()),
    ]);

    const night = lists.get(eventId);
    const viewer = night?.viewer;
    /* Your Have list against one of their wants: the They want row's
       own grading, so the two never disagree on the same card. */
    const youHold = (entry: ListEntry): MatchKind | null => {
      if (!viewer || entry.intent !== "want") return null;
      if (
        !viewer.binderHaves.has(entry.cardId) &&
        !viewer.flareHaves.has(entry.cardId)
      ) {
        return null;
      }
      return printingMatch(
        entry.printingId ? new Set([entry.printingId]) : undefined,
        viewer.havePrintings.get(entry.cardId),
      );
    };

    const theirSessions = new Set(sessions.keys());
    const flares = heldFirst(
      roomFlares
        .filter((entry) => theirSessions.has(entry.playerSessionId))
        .map((entry) => {
          const shown: Omit<ListEntry, "playerSessionId"> & {
            playerSessionId?: string;
            match: MatchKind | null;
          } = {
            ...entry,
            match: youHold(entry),
          };
          delete shown.playerSessionId;
          return shown;
        }),
      (entry) => entry.match !== null,
    );

    const matched = night
      ? matchAttendees(night.viewer, night.attendees).find(
          (row) => row.playerId === playerId,
        )
      : undefined;
    const cards = await matchCards([
      ...(matched?.theyHave.map((card) => card.cardId) ?? []),
      ...(matched?.theyWant.map((card) => card.cardId) ?? []),
    ]);
    const cardFor = (card: {
      cardId: string;
      printingId: string | null;
      match: MatchKind;
      bringingFrom?: string | null;
    }) => ({
      ...matchCardFor(cards.get(card.cardId), card.cardId, card.printingId, card.match),
      bringingFrom: card.bringingFrom ?? null,
    });

    return {
      player: {
        playerId,
        /* Theirs alone: anybody else looking gets null. */
        playerSessionId: viewerId === playerId ? seat.playerSessionId : null,
        displayName: seat.displayName,
        avatarUrl: seat.avatarUrl,
        frame: seat.frame,
        ring: seat.ring,
        aura: seat.aura,
      },
      matches: matched ? (perPlayerCounts([matched])[playerId] ?? 0) : 0,
      theyHave: matched?.theyHave.map(cardFor) ?? [],
      theyWant: matched?.theyWant.map(cardFor) ?? [],
      flares,
      binders: binders.filter((binder) => binder.forTrade),
      bringing: brought.get(playerId) ?? [],
      flaresCount: flares.length,
      tradeCards: counts.get(playerId) ?? 0,
    };
  } catch (error) {
    console.error("Could not read the night's player", error);
    return null;
  }
}

/**
 * Ticks or unticks Packed on one card of the viewer's checklist at one
 * night. A row is the tick; no row is the box. The primary key makes a
 * second tick a no-op rather than a second row, and the foreign keys
 * refuse an id that names nothing, which is the only validation a
 * checkbox needs.
 */
export async function setPacked(
  eventId: string,
  playerId: string,
  cardId: string,
  packed: boolean,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const admin = getSupabaseAdmin();
  const { error } = packed
    ? await admin
        .from("night_packing")
        .upsert(
          { event_id: eventId, player_id: playerId, card_id: cardId },
          { onConflict: "event_id,player_id,card_id", ignoreDuplicates: true },
        )
    : await admin
        .from("night_packing")
        .delete()
        .eq("event_id", eventId)
        .eq("player_id", playerId)
        .eq("card_id", cardId);
  if (error) {
    console.error("Could not change what is packed", error);
    return false;
  }
  return true;
}
