/**
 * Names for a list that mixes cosmetic kinds — the app's copy of the
 * website's `src/lib/packs/labels.ts`, kept identical on purpose.
 *
 * Cosmetics dropped their category suffix, which is right everywhere a
 * heading already says what they are. The pack odds table is the one
 * place that lists frames, holos and effects together, and there a bare
 * "Prism" appears twice with nothing to tell the two apart. The
 * qualifier comes back only for names that actually repeat.
 */

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
