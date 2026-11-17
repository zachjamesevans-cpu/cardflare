/**
 * Whether a room marked open is really running, without opening it.
 *
 * The founder (2026-11-17): "EVERYTIME I open the app... it says room
 * open at Mox. Why? Then I click it and it says I need to open it."
 *
 * A room is closed lazily. A walk-in room that has gone quiet, and a
 * night or a day room past its end, keep `status = 'open'` until the
 * next scan of the code notices and closes them (rooms.ts, findLiveRoom
 * and resolveCode). The Feed's "Room open at" banner read the status
 * alone, so it advertised rooms the counter would refuse: a tap was the
 * scan that closed it, and the room said to open a new one.
 *
 * This is the same test the counter applies, as a pure function, so
 * the banner and the counter cannot disagree. It never writes; the next
 * scan still does the closing.
 */

/**
 * How long a walk-in room survives with nobody in it. rooms.ts explains
 * the number; it lives here so this file stays free of the server and
 * rooms.ts re-exports it.
 */
export const WALK_IN_IDLE_MS = 6 * 60 * 60 * 1000;

export interface OpenRoomFacts {
  kind: string;
  startsAt: string;
  endsAt: string | null;
  /** When anybody was last seen in it; null when nobody ever was. */
  lastActivityAt: string | null;
  /** The store's walk-in switch. */
  walkInEnabled: boolean;
}

export function openRoomIsRunning(room: OpenRoomFacts, now: number): boolean {
  if (room.kind === "walk_in") {
    /* A store that switched walk-ins off has no walk-in room running,
       whatever the row says: the counter closes it on the next scan. */
    if (!room.walkInEnabled) return false;
    /* An empty room is measured from when it opened, the counter's rule. */
    const last = Date.parse(room.lastActivityAt ?? room.startsAt);
    return Number.isFinite(last) && now - last <= WALK_IN_IDLE_MS;
  }
  /* A night or a store's day room ends on the clock. */
  if (room.endsAt) {
    const end = Date.parse(room.endsAt);
    if (Number.isFinite(end) && end <= now) return false;
  }
  return true;
}
