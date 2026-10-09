/**
 * Binders I'm Bringing: the rules and the words, with no server in them.
 *
 * The founder (2026-10-09): "When someone RSVPs 'Going' to a Night,
 * they should have the option to select which of their existing digital
 * binders they're bringing to that event." One binder, several, or
 * none, picked per night, so the next night starts empty.
 *
 * Kept free of server imports so the privacy rule is unit-testable on
 * its own, and mirrored word for word in the app by
 * `mobile/src/night-binder-copy.ts`
 * (tests/unit/night-binders-app.test.ts holds the two together).
 */

/** One binder on the picker, as the owner sends it back. */
export interface NightBinderPick {
  binderId: string;
  /**
   * The owner's explicit choice to show a PRIVATE binder to this
   * Night's attendees. Meaningless for a binder up for trade, which is
   * public already.
   */
  eventOnly: boolean;
}

export type NightBinderRefusal = "not-yours" | "needs-consent";

/**
 * Checks a picker's answer against the binders the player owns. A
 * private binder goes through only with `eventOnly` ticked: the
 * founder, "Do not automatically expose private binders... require an
 * explicit, clearly explained event-only visibility choice." A binder
 * up for trade drops the flag, because it changes nothing for a binder
 * anybody may open already. Duplicates collapse to one row.
 */
export function checkPicks(
  picks: NightBinderPick[],
  owned: Map<string, { forTrade: boolean }>,
):
  | { ok: true; rows: { binderId: string; eventOnly: boolean }[] }
  | { ok: false; reason: NightBinderRefusal; binderId: string } {
  const rows = new Map<string, boolean>();
  for (const pick of picks) {
    const binder = owned.get(pick.binderId);
    if (!binder) return { ok: false, reason: "not-yours", binderId: pick.binderId };
    if (!binder.forTrade && !pick.eventOnly) {
      return { ok: false, reason: "needs-consent", binderId: pick.binderId };
    }
    rows.set(pick.binderId, binder.forTrade ? false : true);
  }
  return {
    ok: true,
    rows: [...rows].map(([binderId, eventOnly]) => ({ binderId, eventOnly })),
  };
}

/**
 * Whether a viewer may see one brought binder at one Night.
 *
 * - Nobody but the owner, once the night is over: the founder,
 *   "Selections should expire from active event visibility when the
 *   Night ends." The row stays as the record; it just stops showing.
 * - A binder up for trade: anyone who can see the night, because the
 *   binder is public already.
 * - A private binder: only when its owner chose event-only for this
 *   night, and only to someone on this night's roster. A guest
 *   browsing the board from outside sees nothing of it.
 * - A private binder without that choice: nobody else. That only
 *   happens when the owner made the binder private after picking it;
 *   their binder's own setting wins.
 */
export function broughtVisible(input: {
  forTrade: boolean;
  eventOnly: boolean;
  viewerIsOwner: boolean;
  viewerAttending: boolean;
  nightOpen: boolean;
}): boolean {
  if (input.viewerIsOwner) return true;
  if (!input.nightOpen) return false;
  if (input.forTrade) return true;
  return input.eventOnly && input.viewerAttending;
}

/** Whether a brought binder's cards count at the night: the same rule, from the matcher's seat. */
export function broughtCounts(input: {
  forTrade: boolean;
  eventOnly: boolean;
  viewerIsOwner: boolean;
  viewerAttending: boolean;
}): boolean {
  if (input.viewerIsOwner) return input.forTrade || input.eventOnly;
  if (input.forTrade) return true;
  return input.eventOnly && input.viewerAttending;
}

/* ---- Words, the same on both platforms ------------------------------ */

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
  NightBinderRefusal | "not-going" | "not-open" | "unavailable",
  string
> = {
  "not-yours": "That binder isn't one of yours.",
  "needs-consent":
    "That binder is private. Turn on Show to this Night only to bring it.",
  "not-going": "Say you're going first, then pick your binders.",
  "not-open": "This Night has ended, so its binders can't change.",
  unavailable: "That didn't save. Try again in a moment.",
};
