/**
 * Stores that are probably the same shop twice, free of server imports.
 *
 * The audit of 2026-10-01 found "Castle Of Games" beside "Castle of
 * Games", "King's Hobby" beside "King's Hobby Shop", and two "Mox Valley
 * Games". The directory import and a hand-made row do not know about
 * each other. This does not merge anything; it only says which rows an
 * admin should look at, and the merge is a deliberate act on the
 * store's page.
 */

export interface DuplicateCandidate {
  id: string;
  name: string;
  city: string | null;
  region: string | null;
}

const NOISE = new Set([
  "the",
  "shop",
  "store",
  "games",
  "game",
  "cards",
  "card",
  "and",
  "llc",
  "inc",
]);

/** "King's Hobby Shop" and "King's Hobby" share a key; so do the two Castles. */
export function duplicateKey(store: DuplicateCandidate): string {
  const words = store.name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word && !NOISE.has(word));
  const region = (store.region ?? "").trim().toLowerCase();
  return `${words.join(" ")}|${region}`;
}

/**
 * Groups of two or more stores that share a key. A store with a name
 * made only of noise words ("The Game Store") never matches on the
 * name alone.
 */
export function likelyDuplicates(
  stores: DuplicateCandidate[],
): Map<string, DuplicateCandidate[]> {
  const groups = new Map<string, DuplicateCandidate[]>();
  for (const store of stores) {
    const key = duplicateKey(store);
    if (key.startsWith("|")) continue;
    groups.set(key, [...(groups.get(key) ?? []), store]);
  }
  for (const [key, members] of groups) {
    if (members.length < 2) groups.delete(key);
  }
  return groups;
}

/** The other members of a store's group, for a chip on its row. */
export function duplicatesOf(
  store: DuplicateCandidate,
  groups: Map<string, DuplicateCandidate[]>,
): DuplicateCandidate[] {
  const members = groups.get(duplicateKey(store)) ?? [];
  return members.filter((member) => member.id !== store.id);
}
