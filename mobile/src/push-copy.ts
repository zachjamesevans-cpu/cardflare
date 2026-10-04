/**
 * The push settings' words, the app's copy of
 * `src/lib/notifications/push-prefs.ts` on the website.
 *
 * React Native cannot import from `src/`, so the labels and lines live
 * twice and `tests/unit/push-parity.test.ts` holds the two copies to
 * the same text. Four groups rather than one switch per kind: a person
 * decides whether their phone buzzes for offers, for messages, for
 * nights and for the social stream, and nothing finer than that is a
 * decision anyone wants to make in a settings screen.
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
    line: "Boards opening, matches, a reminder on the day, and Flares in a room you are in.",
  },
  {
    key: "social",
    label: "Follows and stores",
    line: "New followers, comments, and posts from stores you follow.",
  },
];

export const PUSH_HEADING = "Push notifications";
export const PUSH_LINE = "On your phone. The Inbox keeps every notice either way.";
