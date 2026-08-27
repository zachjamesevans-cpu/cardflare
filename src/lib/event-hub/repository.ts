import "server-only";

import type { EventHubDisplayRow, EventHubTimerRow } from "@/lib/supabase/types";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { Bracket, GameId } from "./game-profiles";
import type { LayoutChoice } from "./layout";
import { MAX_TIMERS } from "./layout";
import type { HubTimer, TimerPatch, TimerStatus } from "./timer";

/**
 * Reading and writing the Event Hub.
 *
 * Everything goes through the service role after the caller has been
 * authorised, which is the pattern every other table in this schema
 * follows: RLS is on with no policies, so there is no second, weaker
 * path into these rows.
 */

export interface HubDisplay {
  id: string;
  storeId: string;
  name: string;
  nightTitle: string | null;
  /** Server-side only. Never put this in a payload the display receives. */
  token: string;
  layout: LayoutChoice;
  announcement: string | null;
  showFlares: boolean;
  showQr: boolean;
  soundEnabled: boolean;
}

function toDisplay(row: EventHubDisplayRow): HubDisplay {
  return {
    id: row.id,
    storeId: row.store_id,
    name: row.name,
    nightTitle: row.night_title,
    token: row.token,
    layout: row.layout as LayoutChoice,
    announcement: row.announcement,
    showFlares: row.show_flares,
    showQr: row.show_qr,
    soundEnabled: row.sound_enabled,
  };
}

function toTimer(row: EventHubTimerRow): HubTimer {
  return {
    id: row.id,
    displayId: row.display_id,
    position: row.position,
    game: row.game as GameId,
    eventName: row.event_name,
    round: row.round,
    format: row.format,
    bracket: row.bracket as Bracket,
    presetId: row.preset_id,
    durationSeconds: row.duration_seconds,
    status: row.status as TimerStatus,
    startedAt: row.started_at,
    pausedAt: row.paused_at,
    remainingMsWhenPaused: row.remaining_ms_when_paused,
    overtimeStartedAt: row.overtime_started_at,
    overtimeDurationSeconds: row.overtime_duration_seconds,
    overtimeTurn: row.overtime_turn,
    rulesDismissed: row.rules_dismissed,
    /* Older rows predate the column; absent reads as off, which is the
       default the founder chose anyway. */
    beginnerMode: row.beginner_mode ?? false,
    updatedAt: row.updated_at,
  };
}

/** Every display a store owns, oldest first. */
export async function listDisplays(storeId: string): Promise<HubDisplay[]> {
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await getSupabaseAdmin()
    .from("event_hub_displays")
    .select("*")
    .eq("store_id", storeId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Could not list the store's displays", error);
    return [];
  }

  return (data ?? []).map(toDisplay);
}

export async function findDisplay(id: string): Promise<HubDisplay | null> {
  if (!isSupabaseConfigured()) return null;

  const { data, error } = await getSupabaseAdmin()
    .from("event_hub_displays")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return toDisplay(data);
}

/**
 * The display a token names.
 *
 * The one lookup the television is allowed to make. Deliberately narrow:
 * it takes a token and gives back a display, and every decision about
 * what that display may then show lives in `display-payload.ts`.
 */
export async function findDisplayByToken(token: string): Promise<HubDisplay | null> {
  if (!isSupabaseConfigured()) return null;
  /* Refused before it reaches the database: the column is constrained to
     this shape, so anything else is a probe rather than a typo. */
  if (!/^[0-9a-f]{32}$/.test(token)) return null;

  const { data, error } = await getSupabaseAdmin()
    .from("event_hub_displays")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (error || !data) return null;
  return toDisplay(data);
}

export async function listTimers(displayId: string): Promise<HubTimer[]> {
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await getSupabaseAdmin()
    .from("event_hub_timers")
    .select("*")
    .eq("display_id", displayId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(MAX_TIMERS);

  if (error) {
    console.error("Could not read the display's timers", error);
    return [];
  }

  return (data ?? []).map(toTimer);
}

export async function findTimer(id: string): Promise<HubTimer | null> {
  if (!isSupabaseConfigured()) return null;

  const { data, error } = await getSupabaseAdmin()
    .from("event_hub_timers")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return toTimer(data);
}

export async function createDisplay(input: {
  storeId: string;
  createdBy: string | null;
  name?: string;
  nightTitle?: string | null;
}): Promise<HubDisplay | null> {
  if (!isSupabaseConfigured()) return null;

  const { data, error } = await getSupabaseAdmin()
    .from("event_hub_displays")
    .insert({
      store_id: input.storeId,
      created_by: input.createdBy,
      name: input.name ?? "Main display",
      night_title: input.nightTitle ?? null,
    })
    .select("*")
    .maybeSingle();

  if (error || !data) {
    console.error("Could not create the display", error);
    return null;
  }

  return toDisplay(data);
}

export async function updateDisplay(
  id: string,
  patch: Partial<{
    name: string;
    nightTitle: string | null;
    layout: LayoutChoice;
    announcement: string | null;
    showFlares: boolean;
    showQr: boolean;
    soundEnabled: boolean;
    /** Rotating the token is how a store retires a television. */
    token: string;
  }>,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const { error } = await getSupabaseAdmin()
    .from("event_hub_displays")
    .update({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.nightTitle !== undefined ? { night_title: patch.nightTitle } : {}),
      ...(patch.layout !== undefined ? { layout: patch.layout } : {}),
      ...(patch.announcement !== undefined ? { announcement: patch.announcement } : {}),
      ...(patch.showFlares !== undefined ? { show_flares: patch.showFlares } : {}),
      ...(patch.showQr !== undefined ? { show_qr: patch.showQr } : {}),
      ...(patch.soundEnabled !== undefined
        ? { sound_enabled: patch.soundEnabled }
        : {}),
      ...(patch.token !== undefined ? { token: patch.token } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    console.error("Could not update the display", error);
    return false;
  }

  return true;
}

export async function addTimer(input: {
  displayId: string;
  game: GameId;
  eventName: string;
  round: number | null;
  format: string | null;
  bracket: Bracket;
  presetId: string;
  durationSeconds: number | null;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isSupabaseConfigured()) {
    return { ok: false, message: "The database isn't configured." };
  }

  /*
   * The cap is enforced here rather than by a constraint, because a
   * check constraint cannot count sibling rows and a trigger for this
   * would be the first trigger in the schema. Four is where a 1366x768
   * projector stops being readable from across a shop.
   */
  const existing = await listTimers(input.displayId);
  if (existing.length >= MAX_TIMERS) {
    return {
      ok: false,
      message: `A display holds ${MAX_TIMERS} tournaments. Remove one first.`,
    };
  }

  const { error } = await getSupabaseAdmin().from("event_hub_timers").insert({
    display_id: input.displayId,
    position: existing.length,
    game: input.game,
    event_name: input.eventName,
    round: input.round,
    format: input.format,
    bracket: input.bracket,
    preset_id: input.presetId,
    duration_seconds: input.durationSeconds,
  });

  if (error) {
    console.error("Could not add the timer", error);
    return { ok: false, message: "That didn't save. Check the fields and try again." };
  }

  return { ok: true };
}

/** Applies a transition's patch. `updated_at` is stamped for every write. */
export async function patchTimer(id: string, patch: TimerPatch): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const { error } = await getSupabaseAdmin()
    .from("event_hub_timers")
    .update({
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.startedAt !== undefined ? { started_at: patch.startedAt } : {}),
      ...(patch.pausedAt !== undefined ? { paused_at: patch.pausedAt } : {}),
      ...(patch.remainingMsWhenPaused !== undefined
        ? { remaining_ms_when_paused: patch.remainingMsWhenPaused }
        : {}),
      ...(patch.overtimeStartedAt !== undefined
        ? { overtime_started_at: patch.overtimeStartedAt }
        : {}),
      ...(patch.overtimeDurationSeconds !== undefined
        ? { overtime_duration_seconds: patch.overtimeDurationSeconds }
        : {}),
      ...(patch.overtimeTurn !== undefined
        ? { overtime_turn: patch.overtimeTurn }
        : {}),
      ...(patch.rulesDismissed !== undefined
        ? { rules_dismissed: patch.rulesDismissed }
        : {}),
      ...(patch.beginnerMode !== undefined
        ? { beginner_mode: patch.beginnerMode }
        : {}),
      ...(patch.durationSeconds !== undefined
        ? { duration_seconds: patch.durationSeconds }
        : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    console.error("Could not update the timer", error);
    return false;
  }

  return true;
}

/** Renames, re-rounds, re-brackets. The parts a person types. */
export async function editTimer(
  id: string,
  patch: Partial<{
    eventName: string;
    round: number | null;
    format: string | null;
    bracket: Bracket;
    presetId: string;
    durationSeconds: number | null;
    game: GameId;
  }>,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const { error } = await getSupabaseAdmin()
    .from("event_hub_timers")
    .update({
      ...(patch.eventName !== undefined ? { event_name: patch.eventName } : {}),
      ...(patch.round !== undefined ? { round: patch.round } : {}),
      ...(patch.format !== undefined ? { format: patch.format } : {}),
      ...(patch.bracket !== undefined ? { bracket: patch.bracket } : {}),
      ...(patch.presetId !== undefined ? { preset_id: patch.presetId } : {}),
      ...(patch.durationSeconds !== undefined
        ? { duration_seconds: patch.durationSeconds }
        : {}),
      ...(patch.game !== undefined ? { game: patch.game } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    console.error("Could not edit the timer", error);
    return false;
  }

  return true;
}

/**
 * Re-homes a timer onto another display.
 *
 * The "own screen" move: a tournament leaves the shared wall for a
 * television of its own, state intact — the clock never notices,
 * because everything it is IS the row.
 */
export async function moveTimerToDisplay(
  timerId: string,
  displayId: string,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const { error } = await getSupabaseAdmin()
    .from("event_hub_timers")
    .update({ display_id: displayId, position: 0 })
    .eq("id", timerId);

  if (error) {
    console.error("Could not move the timer to its own display", error);
    return false;
  }

  return true;
}

export async function removeTimer(id: string): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const { error } = await getSupabaseAdmin()
    .from("event_hub_timers")
    .delete()
    .eq("id", id);

  if (error) console.error("Could not remove the timer", error);
}

/** Writes new positions. Called with the whole ordered list, never a diff. */
export async function reorderTimers(
  displayId: string,
  orderedIds: string[],
): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const stamp = new Date().toISOString();

  await Promise.all(
    orderedIds.slice(0, MAX_TIMERS).map((id, index) =>
      getSupabaseAdmin()
        .from("event_hub_timers")
        .update({ position: index, updated_at: stamp })
        /* Scoped to the display as well as the id, so a forged timer id
           from another store's display cannot be reordered into this one. */
        .eq("id", id)
        .eq("display_id", displayId),
    ),
  );
}
