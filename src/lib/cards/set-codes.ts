/**
 * One spelling per set, free of server imports so the sync, the
 * importer, a migration's intent and a unit test all agree.
 *
 * The audit of 2026-10-01 found the catalogue carrying both "OP-02" and
 * "OP02", "ST-01" and "ST01": two providers, two habits, and a Sets
 * list that counted every set twice. Search was already blind to the
 * dash; the labels and the admin's counts were not. Bandai writes the
 * dash, so the dash is canonical.
 */

/** "OP02" -> "OP-02", "ST01" -> "ST-01", "EB01" -> "EB-01", "PRB01" -> "PRB-01". */
export function canonicalSetCode(code: string | null | undefined): string | null {
  if (code === null || code === undefined) return null;
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return null;
  return trimmed.replace(/^(OP|ST|EB|PRB)(\d+)$/, "$1-$2");
}

/**
 * "Trafalgar Law - OP14-009" -> "Trafalgar Law". Some providers append
 * the card number to the name; the number already has a column of its
 * own, and a name that repeats it reads twice on every tile.
 */
export function stripNumberFromName(name: string, cardNumber: string): string {
  const number = cardNumber.trim();
  if (!number) return name.trim();
  const escaped = number.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (
    name.replace(new RegExp(`\\s*[-–—]?\\s*${escaped}\\s*$`, "i"), "").trim() ||
    name.trim()
  );
}
