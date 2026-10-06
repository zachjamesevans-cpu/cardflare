/**
 * A card's name for display beside its number.
 *
 * Provider names often carry the number in brackets — "Monkey.D.Luffy
 * (EB04-061)", "Pikachu (010)" — and a row that already prints the
 * number under the name then says it twice. This drops a trailing
 * parenthetical that is the card number, or its numeric part, and
 * leaves any other bracket ("(Alternate Art)") alone. Display only: the
 * stored name, search and every server call keep the full string.
 *
 * Kept free of React Native imports so the tests can read it.
 */
export function displayCardName(name: string, cardNumber: string | null | undefined): string {
  const match = /^(.*\S)\s*\(([^()]+)\)\s*$/.exec(name);
  if (!match || !cardNumber) return name;
  const inner = norm(match[2]);
  const number = norm(cardNumber);
  if (!inner || !number) return name;
  if (inner === number) return match[1];
  /* "(010)" against "010/198" or "EB04-010": the same digits. */
  if (/^\d+$/.test(inner) && String(Number(inner)) === numericPart(number)) return match[1];
  return name;
}

function norm(text: string): string {
  return text.trim().toLowerCase();
}

/** The digits a number ends on, without leading zeros: "eb04-061" → "61". */
function numericPart(number: string): string {
  const head = number.split("/")[0] ?? number;
  const digits = /(\d+)\D*$/.exec(head)?.[1];
  return digits ? String(Number(digits)) : "";
}
