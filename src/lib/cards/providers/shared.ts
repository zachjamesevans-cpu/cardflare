/**
 * The little readers every adapter needs, shared so four providers do
 * not carry four copies of "a number that might be a string".
 *
 * Pure. No provider's vocabulary appears here either: these read a
 * value, they do not know what it means.
 */

export function asString(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

/** An integer that may arrive as a string, "*" or "" for not applicable. */
export function asInt(value: unknown): number | null {
  if (typeof value === "number")
    return Number.isFinite(value) ? Math.round(value) : null;
  if (typeof value !== "string") return null;

  const cleaned = value.trim();
  if (!/^-?\d+$/.test(cleaned)) return null;

  const parsed = Number.parseInt(cleaned, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => asString(entry))
    .filter((entry): entry is string => !!entry);
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * A record with the named keys dropped, for `raw_metadata`.
 *
 * Provider records carry things we never display (prices, legality
 * tables, purchase links). Storing them would leave stale figures in the
 * database waiting to be surfaced by accident, and a Scryfall record
 * with its legalities and URIs is several kilobytes per printing.
 */
export function without(
  record: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  const dropped = new Set(keys);
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => !dropped.has(key)),
  );
}

/**
 * A set code the way an operator types it, or null when it could not be
 * one. Letters, digits and dashes only, because it becomes part of a
 * request path.
 */
export function cleanSetCode(value: string | undefined): string | null {
  const code = (value ?? "").trim().toUpperCase();
  return /^[A-Z0-9-]{2,16}$/.test(code) ? code : null;
}
