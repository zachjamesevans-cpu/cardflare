/**
 * Binders I'm Bringing, the words: the app's copy of the website's
 * src/lib/events/night-binder-rules.ts, word for word, and
 * tests/unit/night-binders-app.test.ts holds the two together.
 *
 * The words only. Which picks the server takes is the server's to
 * say, so the rules themselves are not copied here; a refusal comes
 * back as one of BRINGING_REFUSALS's codes. No imports, so a test can
 * load it without React Native.
 *
 * The founder (2026-10-09): "Selecting a binder communicates that the
 * player intends to physically bring those cards. It should not create
 * a guarantee."
 */

/** The night's own section, for the player who is going. */
export function yourBindersTitle(dayWord: string): string {
  return `Your binders for ${dayWord}`;
}

/** "2 binders selected · 47 cards", or the nudge when none are. */
export function bringingLine(binders: number, cards: number): string {
  if (binders === 0) return "Pick the binders you're bringing";
  const binderWord = binders === 1 ? "binder" : "binders";
  const cardWord = cards === 1 ? "card" : "cards";
  return `${binders} ${binderWord} selected · ${cards} ${cardWord}`;
}

export const BINDERS_THEYRE_BRINGING = "Binders they're bringing";
export const BRINGING_PICKER_TITLE = "Which binders are you bringing?";
export const BRINGING_PICKER_HINT =
  "Tap the ones going in your bag. Players going can browse them, and their wants are matched against them.";
export const BRINGING_DONE = "Done";
export const BRINGING_SKIP = "Not bringing any";
export const BRINGING_NO_BINDERS =
  "You don't have any binders yet. Make one from your profile and it will show up here.";
export const BRINGING_EDIT = "Edit";
export const BRINGING_PROMISE =
  "Picking a binder says you plan to bring it. It isn't a promise that every card is still there or that a trade will happen.";

/** The private binder's switch: what it does, in plain words. */
export const EVENT_ONLY_LABEL = "Show to this Night only";
export function eventOnlyHint(binderName: string): string {
  return `${binderName} is private. Turn this on to let players going to this Night open it until the Night ends. It stays private everywhere else.`;
}
export const PRIVATE_TAG = "Private";
/**
 * Beside Done while a private binder is picked without the switch on:
 * why Done is waiting, since the switch may be below the fold.
 */
export function consentNeededLine(names: string[]): string {
  const list =
    names.length <= 1
      ? (names[0] ?? "")
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `Turn on ${EVENT_ONLY_LABEL} for ${list}, or untick ${names.length === 1 ? "it" : "them"}.`;
}

/** Under the title of a private binder opened from a night, for a visitor. */
export function nightSharedLine(ownerName: string): string {
  return `${ownerName} is bringing this to the Night. Only players going can see it.`;
}
export const EVENT_ONLY_TAG = "This Night only";

/** What the server's refusals say. */
export const BRINGING_REFUSALS: Record<
  "not-yours" | "needs-consent" | "not-going" | "not-open" | "unavailable",
  string
> = {
  "not-yours": "That binder isn't one of yours.",
  "needs-consent":
    "That binder is private. Turn on Show to this Night only to bring it.",
  "not-going": "Say you're going first, then pick your binders.",
  "not-open": "This Night has ended, so its binders can't change.",
  unavailable: "That didn't save. Try again in a moment.",
};
