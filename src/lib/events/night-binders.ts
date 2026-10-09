import "server-only";

import {
  listBinders,
  readBinderForNight,
  type Binder,
  type BinderSummary,
} from "@/lib/binder/binder";
import {
  DEFAULT_BINDER_COVER,
  isBinderCover,
  type BinderCoverId,
} from "@/lib/binder/covers";
import {
  broughtCounts,
  broughtVisible,
  checkPicks,
  type NightBinderPick,
  type NightBinderRefusal,
} from "@/lib/events/night-binder-rules";
import { listParticipants } from "@/lib/events/participants";
import { findEventById, findStoreById } from "@/lib/events/repository";
import {
  boardReadable,
  boardWritable,
  roomPhase,
  type RoomPhase,
} from "@/lib/events/schema";
import { blockState } from "@/lib/players/safety";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { instantToLocal } from "@/lib/time/zone";

/**
 * Binders I'm Bringing, on the server.
 *
 * The founder (2026-10-09): "When someone RSVPs 'Going' to a Night,
 * they should have the option to select which of their existing digital
 * binders they're bringing to that event." A pick is a row in
 * `night_binders` that points at the binder: no card is copied, so the
 * binder's own edits show at the night at once, and a night's picks
 * belong to that night alone.
 *
 * The privacy rule lives in `night-binder-rules.ts` and is applied
 * here on every read. A private binder is only ever shown to a night's
 * attendees, only when its owner ticked "Show to this Night only" for
 * that night, and only while the night is on. Nothing here changes a
 * binder's own setting.
 *
 * Picking says the player means to bring the binder. It does not
 * promise every card is still in it or that a trade will happen, and
 * the screens say so.
 */

export interface NightBinderChoice extends BinderSummary {
  /** Picked for this night. */
  selected: boolean;
  /** Picked and private: the owner chose to show it to this night only. */
  eventOnly: boolean;
}

export interface NightBinderState {
  /** The night can still take changes: upcoming, early or live. */
  editable: boolean;
  /** The player is on this night's roster. */
  going: boolean;
  /** "tonight", "Friday" or "Oct 24": for "Your binders for tonight". */
  dayWord: string;
  /** Every binder the player owns, picked or not, in their own order. */
  binders: NightBinderChoice[];
  selectedCount: number;
  selectedCards: number;
}

/** One brought binder as another player sees it. */
export interface BroughtBinder {
  id: string;
  name: string;
  cover: BinderCoverId;
  count: number;
  /** Private, shown to this night's attendees by the owner's choice. */
  eventOnly: boolean;
}

interface Night {
  phase: RoomPhase;
  startsAt: string;
  timeZone: string;
}

async function nightOf(eventId: string): Promise<Night | null> {
  const event = await findEventById(eventId);
  if (!event || event.cancelled_at) return null;
  const store = await findStoreById(event.store_id);
  if (!store) return null;
  return {
    phase: roomPhase({
      kind: event.kind,
      status: event.status,
      startsAt: event.starts_at,
      endsAt: event.ends_at,
      earlyBoardHours: store.early_board_hours,
      storeTimeZone: store.timezone,
    }),
    startsAt: event.starts_at,
    timeZone: store.timezone,
  };
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/**
 * "tonight" when the night is today in the store's own zone, the
 * weekday inside the coming week, the date further out. Pure given the
 * clock, so it is tested on its own.
 */
export function dayWordFor(startsAt: string, timeZone: string, now: number): string {
  const night = instantToLocal(new Date(startsAt), timeZone).slice(0, 10);
  const today = instantToLocal(new Date(now), timeZone).slice(0, 10);
  if (night === today) return "tonight";
  const [y, m, d] = night.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  const days = Math.round(
    (Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86_400_000,
  );
  if (days > 0 && days < 7)
    return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${MONTHS[m - 1]} ${d}`;
}

/** The night's phase now, or null when there is no such night. */
export async function nightPhase(eventId: string): Promise<RoomPhase | null> {
  return (await nightOf(eventId))?.phase ?? null;
}

async function attending(eventId: string, playerId: string): Promise<boolean> {
  const roster = await listParticipants(eventId);
  return roster.some((row) => row.playerId === playerId);
}

/** The player's picks at one night, by binder. */
async function picksOf(
  eventId: string,
  playerId: string,
): Promise<Map<string, boolean>> {
  const { data, error } = await getSupabaseAdmin()
    .from("night_binders")
    .select("binder_id, event_only")
    .eq("event_id", eventId)
    .eq("player_id", playerId);
  if (error) {
    console.error("Could not read the binders picked for a night", error);
    return new Map();
  }
  return new Map((data ?? []).map((row) => [row.binder_id, row.event_only]));
}

/**
 * The picker's state for the player: every binder they own, which are
 * picked, and whether the night still takes changes. Null when the
 * night does not exist.
 */
export async function nightBinderState(
  eventId: string,
  playerId: string,
  now: number = Date.now(),
): Promise<NightBinderState | null> {
  if (!isSupabaseConfigured()) return null;
  const night = await nightOf(eventId);
  if (!night) return null;

  const [binders, picks, going] = await Promise.all([
    listBinders(playerId, playerId),
    picksOf(eventId, playerId),
    attending(eventId, playerId),
  ]);

  const choices = binders.map((binder) => ({
    ...binder,
    selected: picks.has(binder.id),
    eventOnly: picks.get(binder.id) === true && !binder.forTrade,
  }));
  const selected = choices.filter((binder) => binder.selected);

  return {
    editable: boardWritable(night.phase),
    going,
    dayWord: dayWordFor(night.startsAt, night.timeZone, now),
    binders: choices,
    selectedCount: selected.length,
    selectedCards: selected.reduce((sum, binder) => sum + binder.count, 0),
  };
}

export type SaveNightBindersResult =
  | { ok: true; state: NightBinderState }
  | {
      ok: false;
      reason: NightBinderRefusal | "not-going" | "not-open" | "unavailable";
    };

/**
 * Replaces the player's picks at one night with `picks`: an empty list
 * is "not bringing any". Only while the night takes changes, only for
 * a player on its roster, only their own binders, and a private one
 * only with event-only ticked.
 */
export async function saveNightBinders(
  eventId: string,
  playerId: string,
  picks: NightBinderPick[],
): Promise<SaveNightBindersResult> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };
  const night = await nightOf(eventId);
  if (!night) return { ok: false, reason: "unavailable" };
  if (!boardWritable(night.phase)) return { ok: false, reason: "not-open" };
  if (!(await attending(eventId, playerId))) return { ok: false, reason: "not-going" };

  const admin = getSupabaseAdmin();
  const { data: owned, error } = await admin
    .from("binders")
    .select("id, for_trade")
    .eq("player_id", playerId);
  if (error) {
    console.error("Could not read the player's binders", error);
    return { ok: false, reason: "unavailable" };
  }
  const checked = checkPicks(
    picks,
    new Map((owned ?? []).map((row) => [row.id, { forTrade: row.for_trade }])),
  );
  if (!checked.ok) return { ok: false, reason: checked.reason };

  const keep = checked.rows.map((row) => row.binderId);
  const removal = admin
    .from("night_binders")
    .delete()
    .eq("event_id", eventId)
    .eq("player_id", playerId);
  const { error: removeError } =
    keep.length > 0
      ? await removal.not("binder_id", "in", `(${keep.join(",")})`)
      : await removal;
  if (removeError) {
    console.error("Could not clear the binders picked for a night", removeError);
    return { ok: false, reason: "unavailable" };
  }

  if (checked.rows.length > 0) {
    const { error: upsertError } = await admin.from("night_binders").upsert(
      checked.rows.map((row) => ({
        event_id: eventId,
        binder_id: row.binderId,
        player_id: playerId,
        event_only: row.eventOnly,
      })),
      { onConflict: "event_id,binder_id" },
    );
    if (upsertError) {
      console.error("Could not save the binders picked for a night", upsertError);
      return { ok: false, reason: "unavailable" };
    }
  }

  const state = await nightBinderState(eventId, playerId);
  return state ? { ok: true, state } : { ok: false, reason: "unavailable" };
}

/**
 * The binders each player is bringing, as `viewerId` may see them.
 * Two reads for a whole roster: the picks, then the binders behind
 * them with their card counts. `viewerAttending` is whether the viewer
 * is on this night's roster; a private binder shows to nobody else.
 */
export async function broughtBindersFor(
  eventId: string,
  playerIds: string[],
  viewerId: string | null,
  viewerAttending: boolean,
  phase: RoomPhase,
): Promise<Map<string, BroughtBinder[]>> {
  const out = new Map<string, BroughtBinder[]>();
  if (playerIds.length === 0 || !isSupabaseConfigured()) return out;

  try {
    const admin = getSupabaseAdmin();
    const { data: picks, error } = await admin
      .from("night_binders")
      .select("binder_id, player_id, event_only, created_at")
      .eq("event_id", eventId)
      .in("player_id", playerIds);
    if (error) {
      console.error("Could not read the binders brought to a night", error);
      return out;
    }
    if (!picks || picks.length === 0) return out;

    const { data: binders, error: binderError } = await admin
      .from("binders")
      .select("id, player_id, name, cover, for_trade, position, created_at")
      .in(
        "id",
        picks.map((pick) => pick.binder_id),
      )
      .order("position")
      .order("created_at");
    if (binderError) {
      console.error("Could not read the brought binders", binderError);
      return out;
    }

    const pickOf = new Map(picks.map((pick) => [pick.binder_id, pick]));
    const shown = (binders ?? []).filter((binder) => {
      const pick = pickOf.get(binder.id);
      if (!pick || pick.player_id !== binder.player_id) return false;
      return broughtVisible({
        forTrade: binder.for_trade,
        eventOnly: pick.event_only,
        viewerIsOwner: viewerId === binder.player_id,
        viewerAttending,
        nightOpen: boardReadable(phase),
      });
    });
    if (shown.length === 0) return out;

    const counts = await cardCounts(shown.map((binder) => binder.id));
    for (const binder of shown) {
      const list = out.get(binder.player_id) ?? [];
      list.push({
        id: binder.id,
        name: binder.name,
        cover: isBinderCover(binder.cover) ? binder.cover : DEFAULT_BINDER_COVER,
        count: counts.get(binder.id) ?? 0,
        eventOnly: !binder.for_trade,
      });
      out.set(binder.player_id, list);
    }
  } catch (error) {
    console.error("Could not read the brought binders", error);
  }
  return out;
}

/** Cards per binder, paged past the row ceiling. */
async function cardCounts(binderIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const admin = getSupabaseAdmin();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("binder_cards")
      .select("binder_id")
      .in("binder_id", binderIds)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) {
      console.error("Could not count the brought binders' cards", error);
      return counts;
    }
    for (const row of data ?? []) {
      counts.set(row.binder_id, (counts.get(row.binder_id) ?? 0) + 1);
    }
    if ((data ?? []).length < PAGE) return counts;
  }
}

/**
 * One brought binder, opened from a night: the attendee page's tile.
 * Null unless the binder is picked for this night, its owner is on the
 * roster, and `broughtVisible` lets this viewer in. A block hides it
 * either way round, as it hides the attendee.
 */
export async function readNightBinder(
  eventId: string,
  ownerId: string,
  binderId: string,
  viewerId: string | null,
): Promise<Binder | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const night = await nightOf(eventId);
    if (!night) return null;

    if (viewerId && viewerId !== ownerId) {
      const block = await blockState(viewerId, ownerId);
      if (block.blocked || block.blockedBy) return null;
    }

    const admin = getSupabaseAdmin();
    const [{ data: pick }, { data: binder }, roster] = await Promise.all([
      admin
        .from("night_binders")
        .select("player_id, event_only")
        .eq("event_id", eventId)
        .eq("binder_id", binderId)
        .maybeSingle(),
      admin
        .from("binders")
        .select("player_id, for_trade")
        .eq("id", binderId)
        .maybeSingle(),
      listParticipants(eventId),
    ]);
    if (
      !pick ||
      !binder ||
      pick.player_id !== ownerId ||
      binder.player_id !== ownerId
    ) {
      return null;
    }
    if (!roster.some((row) => row.playerId === ownerId)) return null;

    const viewerAttending =
      viewerId !== null && roster.some((row) => row.playerId === viewerId);
    const allowed = broughtVisible({
      forTrade: binder.for_trade,
      eventOnly: pick.event_only,
      viewerIsOwner: viewerId === ownerId,
      viewerAttending,
      nightOpen: boardReadable(night.phase),
    });
    if (!allowed) return null;

    return readBinderForNight(ownerId, viewerId, binderId);
  } catch (error) {
    console.error("Could not open a brought binder", error);
    return null;
  }
}

/**
 * The brought binders' cards that count in a batch of nights' matching,
 * for these players, as `viewerId` may see them: per night, per player,
 * the printings held and the binder each card sits in. `onlyCards`
 * narrows other players' reads to the cards the viewer wants, the way
 * the Have-list reads are narrowed; the viewer's own are read whole.
 */
export async function broughtCardsAt(
  eventIds: string[],
  playerIds: string[],
  viewerId: string,
  viewerAttendingAt: Map<string, boolean>,
  onlyCards: Set<string> | null,
): Promise<
  Map<
    string,
    Map<
      string,
      { printings: Map<string, Set<string | null>>; binderOf: Map<string, string> }
    >
  >
> {
  const out = new Map<
    string,
    Map<
      string,
      { printings: Map<string, Set<string | null>>; binderOf: Map<string, string> }
    >
  >();
  if (eventIds.length === 0 || playerIds.length === 0 || !isSupabaseConfigured()) {
    return out;
  }

  try {
    const admin = getSupabaseAdmin();
    const { data: picks, error } = await admin
      .from("night_binders")
      .select("event_id, binder_id, player_id, event_only")
      .in("event_id", eventIds)
      .in("player_id", playerIds);
    if (error) {
      console.error("Could not read the binders brought to the nights", error);
      return out;
    }
    if (!picks || picks.length === 0) return out;

    const { data: binders, error: binderError } = await admin
      .from("binders")
      .select("id, player_id, name, for_trade")
      .in("id", [...new Set(picks.map((pick) => pick.binder_id))]);
    if (binderError) {
      console.error("Could not read the brought binders", binderError);
      return out;
    }
    const binderById = new Map((binders ?? []).map((row) => [row.id, row]));

    const counted = picks.filter((pick) => {
      const binder = binderById.get(pick.binder_id);
      if (!binder || binder.player_id !== pick.player_id) return false;
      return broughtCounts({
        forTrade: binder.for_trade,
        eventOnly: pick.event_only,
        viewerIsOwner: pick.player_id === viewerId,
        viewerAttending: viewerAttendingAt.get(pick.event_id) ?? false,
      });
    });
    if (counted.length === 0) return out;

    const ownIds = [
      ...new Set(
        counted.filter((p) => p.player_id === viewerId).map((p) => p.binder_id),
      ),
    ];
    const otherIds = [
      ...new Set(
        counted.filter((p) => p.player_id !== viewerId).map((p) => p.binder_id),
      ),
    ];

    type CardRow = { binder_id: string; card_id: string; printing_id: string | null };
    const rows: CardRow[] = [];
    if (ownIds.length > 0) {
      const { data, error: ownError } = await admin
        .from("binder_cards")
        .select("binder_id, card_id, printing_id")
        .in("binder_id", ownIds);
      if (ownError) console.error("Could not read your brought binders", ownError);
      rows.push(...((data ?? []) as CardRow[]));
    }
    if (otherIds.length > 0 && (onlyCards === null || onlyCards.size > 0)) {
      const cardRuns = onlyCards ? chunkOf([...onlyCards], 120) : [null];
      const reads = await Promise.all(
        chunkOf(otherIds, 60).flatMap((ids) =>
          cardRuns.map((cards) => {
            const query = admin
              .from("binder_cards")
              .select("binder_id, card_id, printing_id")
              .in("binder_id", ids);
            return cards ? query.in("card_id", cards) : query;
          }),
        ),
      );
      for (const read of reads) {
        if (read.error)
          console.error("Could not read the brought binders' cards", read.error);
        rows.push(...((read.data ?? []) as CardRow[]));
      }
    }

    const nightsOf = new Map<string, string[]>();
    for (const pick of counted) {
      nightsOf.set(pick.binder_id, [
        ...(nightsOf.get(pick.binder_id) ?? []),
        pick.event_id,
      ]);
    }
    for (const row of rows) {
      const binder = binderById.get(row.binder_id);
      if (!binder) continue;
      for (const eventId of nightsOf.get(row.binder_id) ?? []) {
        const byPlayer = out.get(eventId) ?? new Map();
        const held = byPlayer.get(binder.player_id) ?? {
          printings: new Map<string, Set<string | null>>(),
          binderOf: new Map<string, string>(),
        };
        const set = held.printings.get(row.card_id) ?? new Set<string | null>();
        set.add(row.printing_id ?? null);
        held.printings.set(row.card_id, set);
        if (!held.binderOf.has(row.card_id))
          held.binderOf.set(row.card_id, binder.name);
        byPlayer.set(binder.player_id, held);
        out.set(eventId, byPlayer);
      }
    }
  } catch (error) {
    console.error("Could not read the brought binders' cards", error);
  }
  return out;
}

function chunkOf<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
