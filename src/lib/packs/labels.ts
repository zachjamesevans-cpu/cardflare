/**
 * Names for a list that mixes cosmetic kinds.
 *
 * Cosmetics dropped their category suffix — the founder's call, and the
 * right one: under a heading that says Card edges, "Prism Edge" reads as
 * "Prism Edge Edge". But the pack odds table is the one list in the
 * product that shows frames, holos and effects TOGETHER, and there a
 * bare "Prism" appears twice with nothing to tell the two apart.
 *
 * So the qualifier comes back, but only where it earns its place: a name
 * that is unique in the list is left exactly as it is, and a name that
 * repeats gets its category appended. Nothing hardcoded per slug, so a
 * cosmetic added later is handled by the same rule.
 *
 * Free of server-only imports, and pure, so both the website and the app
 * can label the same table identically.
 */

/** What each kind is called when a name needs telling apart. */
const KIND_WORDS: Record<string, string> = {
  frame: "edge",
  holo: "holo",
  effect: "effect",
};

export interface LabelledCosmetic {
  slug: string;
  name: string;
  kind: string;
}

/**
 * Builds slug → display label for a mixed list.
 *
 * @param items every cosmetic the list can show, with its kind.
 */
export function packItemLabels(items: LabelledCosmetic[]): Record<string, string> {
  const timesSeen = new Map<string, number>();
  for (const item of items) {
    timesSeen.set(item.name, (timesSeen.get(item.name) ?? 0) + 1);
  }

  const labels: Record<string, string> = {};
  for (const item of items) {
    const ambiguous = (timesSeen.get(item.name) ?? 0) > 1;
    const word = KIND_WORDS[item.kind];
    labels[item.slug] = ambiguous && word ? `${item.name} ${word}` : item.name;
  }
  return labels;
}
