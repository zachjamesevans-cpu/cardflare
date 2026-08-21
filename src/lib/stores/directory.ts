/**
 * Filtering the admin's operator directory.
 *
 * Pure and free of server imports so the rules are unit-testable: the
 * component that renders the directory is a thin shell over this.
 */

export type OperatorKindFilter = "all" | "lgs" | "vendor";

export interface OperatorFacts {
  name: string;
  contact_email: string;
  city: string | null;
  region: string | null;
  kind: string;
}

/**
 * Case-insensitive substring match over everything an admin remembers an
 * operator by: name, contact address, city, region. A blank query matches
 * everyone — the dropdown alone is a valid way to browse.
 */
export function matchesOperator(store: OperatorFacts, rawQuery: string): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;

  return [store.name, store.contact_email, store.city ?? "", store.region ?? ""].some(
    (field) => field.toLowerCase().includes(query),
  );
}

/**
 * The directory's contents: kind filter, then search, then alphabetical.
 *
 * Alphabetical rather than newest-first on purpose — this list exists for
 * finding a name you already know, and eyes scan an alphabet faster than a
 * timeline.
 */
export function filterOperators<T extends OperatorFacts>(
  stores: T[],
  query: string,
  kind: OperatorKindFilter,
): T[] {
  return stores
    .filter((store) => kind === "all" || store.kind === kind)
    .filter((store) => matchesOperator(store, query))
    .toSorted((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
}

/**
 * How many operators fit on one page of the console.
 *
 * The directory was written when every store was a customer and the list
 * was a dozen names. A discovered directory is hundreds, and a page that
 * renders all of them is a page nobody can find anything on - so the
 * search stays the primary tool and this keeps the rendering honest.
 */
export const OPERATORS_PER_PAGE = 25;

export interface Page<T> {
  rows: T[];
  page: number;
  pages: number;
  total: number;
}

/**
 * One page of results, clamped.
 *
 * The page number is clamped rather than trusted, because it survives in
 * component state across a change of search - and a filter that empties
 * the list while somebody is on page four must show them page one rather
 * than nothing at all.
 */
export function pageOf<T>(rows: T[], page: number, size = OPERATORS_PER_PAGE): Page<T> {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(Math.max(1, page), pages);
  const start = (current - 1) * size;

  return {
    rows: rows.slice(start, start + size),
    page: current,
    pages,
    total: rows.length,
  };
}
