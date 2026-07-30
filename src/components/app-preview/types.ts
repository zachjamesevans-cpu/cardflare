/**
 * Shapes for the marketing product preview.
 *
 * These mirror the vocabulary the real application will use (Event Room, Flare,
 * Flare Match) so the preview components can later be pointed at live data
 * instead of the fixtures in `fixtures.ts`.
 */

export interface PreviewEvent {
  storeName: string;
  eventName: string;
  playerCount: number;
}

export interface PreviewCard {
  name: string;
  setCode: string;
  printing: string;
}

export interface PreviewFlare {
  id: string;
  card: PreviewCard;
  wanted: number;
  state: "searching" | "matched";
}

export interface PreviewMatch {
  id: string;
  card: PreviewCard;
  playerName: string;
  available: number;
  location: string;
}
