/**
 * The four push switches: what they are called, what they cover, and
 * which notice belongs to which. A plain module, read by the settings
 * page, the app's copy twin (mobile/src/push-copy.ts) and the tests.
 *
 * The founder (2026-10-03) asked for a pass on push. Every notice
 * pushed with no way to turn any of them off; now each kind of thing
 * worth a buzz has a switch, on by default. The Inbox keeps every
 * notice whatever the switches say: only the push is gated.
 */

export type PushGroup = "offers" | "messages" | "nights" | "social";

export interface PushPrefs {
  offers: boolean;
  messages: boolean;
  nights: boolean;
  social: boolean;
}

export const PUSH_GROUPS: { key: PushGroup; label: string; line: string }[] = [
  {
    key: "offers",
    label: "Offers and trades",
    line: "Somebody offers on your Flare, or a trade is confirmed.",
  },
  { key: "messages", label: "Messages", line: "A new message in a conversation." },
  {
    key: "nights",
    label: "Nights",
    line: "Boards opening, matches before a night, and Flares in a room you are in.",
  },
  {
    key: "social",
    label: "Follows and stores",
    line: "New followers, comments, and posts from stores you follow.",
  },
];

export const PUSH_HEADING = "Push notifications";
export const PUSH_LINE = "On your phone. The Inbox keeps every notice either way.";

export const ALL_ON: PushPrefs = {
  offers: true,
  messages: true,
  nights: true,
  social: true,
};

export function isPushGroup(value: unknown): value is PushGroup {
  return PUSH_GROUPS.some((group) => group.key === value);
}

/** Which switch a notice kind sits behind. Anything unknown is "social". */
export function groupForKind(kind: string): PushGroup {
  switch (kind) {
    case "offer-received":
    case "trade-confirmed":
    case "nearby-match":
      return "offers";
    case "message-received":
      return "messages";
    case "early-board":
    case "board-open":
    case "room-flare":
    case "night-match":
      return "nights";
    default:
      return "social";
  }
}
