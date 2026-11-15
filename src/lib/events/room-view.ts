/**
 * Which room a person is looking at: the one they are standing in, or a
 * night they are deciding about.
 *
 * The founder (2026-11-15), on the room after a scan at the counter: "I
 * kinda miss the old UI. When someone scans into a room I feel like it
 * should be dead simple imo. This is so much info." The screen had been
 * built as a planning dashboard for Nights (2026-10-03: "It should feel
 * like a trading dashboard"), and a walk-in scan landed on all of it.
 *
 * So one screen draws two ways. While the night is on, it is the room:
 * the store, how many players, one line when somebody here matters to
 * you, the board, and the + Flare button. Before the night it stays the
 * dashboard, because that is planning: matches in full, what to bring,
 * the binders you are bringing, who is going.
 *
 * Pure and free of imports, so the app carries a word-for-word twin
 * (mobile/src/room-view.ts) and tests/unit/room-view.test.ts holds the
 * two together.
 */

export type RoomView = "in-room" | "planning";

/** The room while the night is on; the dashboard before it. */
export function roomViewFor(phase: string | null | undefined): RoomView {
  return phase === "live" ? "in-room" : "planning";
}

/**
 * "1 player", "3 players": the header's whole attendance line in the
 * room. The same words night-copy's playersLine says before the night.
 */
export function roomPlayersLine(count: number): string {
  const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  if (n === 0) return "Nobody yet";
  return n === 1 ? "1 player" : `${n} players`;
}

/**
 * The one match line in the room, or null when there is nothing to say.
 *
 * The founder (2026-10-03) put matches first: "THIS SHOULD BE THE MOST
 * IMPORTANT SECTION. Directly under the event header/banner." It still
 * is, directly under the header. In the room it is one tappable line,
 * and it is not drawn at all when nobody here matters to you: an empty
 * block saying so took a quarter of the screen.
 */
export function roomMatchLine(
  summary: { cardsHuntingHere: number; playersWantYours: number } | null | undefined,
): string | null {
  const hunting = whole(summary?.cardsHuntingHere);
  const wanted = whole(summary?.playersWantYours);
  const parts = [
    hunting > 0
      ? hunting === 1
        ? "1 card you're hunting is here"
        : `${hunting} cards you're hunting are here`
      : null,
    wanted > 0
      ? wanted === 1
        ? "1 player wants cards you have"
        : `${wanted} players want cards you have`
      : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * Your own Flares on the board, folded to one line.
 *
 * They were drawn open at the top of the board with "Found it" and
 * "Take down" under every card: a dozen buttons about cards you already
 * know you want, above the cards you came to see. Folded, they are one
 * line you open when you want to manage them. They open on their own
 * when somebody has offered on one, because that is when you need them.
 */
export function yourFlaresLine(count: number): string {
  const n = whole(count);
  return n === 1 ? "Your 1 Flare is up" : `Your ${n} Flares are up`;
}

export const SHOW_YOUR_FLARES = "Show";
export const HIDE_YOUR_FLARES = "Hide";

function whole(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}
