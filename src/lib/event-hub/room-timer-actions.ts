"use server";

import { isValidJoinCode, normalizeJoinCode } from "@/lib/events/join-code";
import { resolveCode } from "@/lib/events/rooms";
import { roomTimersForStore } from "./room-timers";
import type { RoomTimerWire } from "./room-timer-wire";

/**
 * The room's tournament clocks, fresh — the poll behind the phone card.
 *
 * The founder's report: reset a timer, add a new one, and the room kept
 * showing the old clock. Piggybacking on the page's own refresh was too
 * indirect to trust, so the card asks for itself, on the same cadence
 * the room polls its Flares. The answer is what the television already
 * shows the whole shop, so there is nothing here worth guarding beyond
 * a well-formed code.
 */
export async function roomTimersAction(code: string): Promise<RoomTimerWire[]> {
  if (typeof code !== "string") return [];

  const normalized = normalizeJoinCode(code);
  if (!isValidJoinCode(normalized)) return [];

  const resolved = await resolveCode(normalized);
  if (resolved.outcome !== "room") return [];

  return roomTimersForStore(resolved.room.storeId);
}
