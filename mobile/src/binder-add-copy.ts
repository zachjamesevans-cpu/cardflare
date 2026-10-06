/**
 * Putting cards in a binder, in words: the app's half of
 * src/lib/binder/add-copy.ts. `binderAddedLine` is the website's word
 * for word (tests/unit/binder3-app.test.ts runs both), and the menu's
 * own words live here so the picker and the pasted list say the same
 * thing.
 *
 * The founder: "Binder should bring up same menu as posting flares -
 * can select multiple of one card, etc, to put into binder at mass."
 */

/** Cards one batch may carry: a pasted deck list's worth. */
export const BINDER_ADD_MAX = 120;

/** "Added 3 cards.", "Added 2 cards. 1 was already here, so its count went up." */
export function binderAddedLine(result: {
  added: number;
  merged: number;
  skipped: number;
}): string {
  const parts: string[] = [];
  if (result.added > 0) {
    parts.push(`Added ${result.added} ${result.added === 1 ? "card" : "cards"}.`);
  }
  if (result.merged > 0) {
    parts.push(
      result.merged === 1
        ? "1 was already here, so its count went up."
        : `${result.merged} were already here, so their counts went up.`,
    );
  }
  if (result.skipped > 0) {
    parts.push(
      `The binder is full, so ${result.skipped} ${result.skipped === 1 ? "card was" : "cards were"} left out.`,
    );
  }
  return parts.join(" ") || "Nothing to add.";
}

/** The menu's one button: "Add 1 card to binder", "Add 5 cards to binder". */
export function addToBinderLabel(cards: number): string {
  return `Add ${cards} ${cards === 1 ? "card" : "cards"} to binder`;
}

/**
 * A result the binder already holds: "×2 in this binder", or "In this
 * binder" for one copy. The count is drawn as the quantity tag and the
 * words follow it; this is the whole line, for a screen reader.
 */
export function inThisBinderLine(copies: number): string {
  return copies > 1 ? `×${copies} in this binder` : "In this binder";
}

export const BINDER_ADD_COPY = {
  title: "Add cards",
  search: "Search",
  paste: "Paste a list",
  pastePlaceholder: "2x OP01-001\nOP05-119\n...",
  pasteHint: "One card per line, a count in front if you have more than one.",
  lookUp: "Look up",
  editList: "Edit the list",
  nothingFound: "None of those lines matched a card.",
  pickFirst: "Pick a card first.",
} as const;

/** A pasted line the catalogue does not know. */
export function notFoundLine(cardNumber: string): string {
  return `Not found: ${cardNumber}`;
}

/** A pasted line that could not be read at all. */
export function unreadableLine(line: string): string {
  return `Couldn't read: ${line}`;
}
