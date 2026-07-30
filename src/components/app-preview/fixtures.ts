import type { PreviewEvent, PreviewFlare, PreviewMatch } from "./types";

/**
 * Illustrative data for the landing page preview. Not real event data — see
 * the `role="img"` label on EventRoomPreview, which says so to assistive tech.
 */

export const PREVIEW_EVENT: PreviewEvent = {
  storeName: "Grand Line Games",
  eventName: "Friday Night Locals",
  playerCount: 34,
};

export const PREVIEW_FLARES: PreviewFlare[] = [
  {
    id: "flare-1",
    card: { name: "Monkey D. Luffy", setCode: "OP01-003", printing: "Any printing" },
    wanted: 1,
    state: "searching",
  },
  {
    id: "flare-2",
    card: { name: "Trafalgar Law", setCode: "OP02-069", printing: "Alt art only" },
    wanted: 2,
    state: "searching",
  },
];

export const PREVIEW_MATCH: PreviewMatch = {
  id: "match-1",
  card: { name: "Sanji", setCode: "OP01-013", printing: "Any printing" },
  playerName: "Kaito",
  available: 2,
  location: "Table 12",
};
