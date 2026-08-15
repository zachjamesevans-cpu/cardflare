/**
 * The naming rule for every cosmetic, now and forever.
 *
 * The founder's standing instruction, given twice: "no need to have
 * 'edge' after everything. They should just be 'frost', 'lava', etc.
 * You have an extra word after every single cosmetic." And then, when
 * the first pass only fixed the ones that existed: "I want that to
 * apply to all future cosmetics that get added as well."
 *
 * So it is a rule with a test behind it rather than a habit. Every
 * cosmetic is shown under a heading that already says what it is —
 * Card borders, Holo patterns, Name styles — and repeating that word in
 * each row turns "Prism" into "Prism Edge" under a heading reading Card
 * edges. The category is the heading's job. The name is the colour.
 *
 * Free of server-only imports so the rule can be tested without a
 * database, and so any future console form can call it before saving.
 */

/** What each kind's own category word is, in the singular. */
const OWN_WORD: Record<string, string[]> = {
  // the live catalogue
  frame: ["Edge", "Frame", "Border"],
  holo: ["Holo", "Foil", "Pattern"],
  effect: ["Effect", "Animation"],
  // the catalogue
  ring: ["Ring", "Edge", "Border"],
  aura: ["Aura", "Effect", "Animation"],
  border: ["Border", "Edge", "Frame"],
  pattern: ["Pattern", "Holo", "Foil"],
  animation: ["Animation", "Effect"],
  background: ["Background"],
  scene: ["Scene", "Effect"],
  nameplate: ["Name", "Nameplate"],
  title: ["Title"],
  badge: ["Badge"],
};

/**
 * The redundant word at the end of a name, or null when it reads well.
 *
 * Only the LAST word counts, and only against the cosmetic's own
 * category. "Flame Edge" is a fine name for an animation (it says where
 * the fire is) and a terrible one for a border (it says "border
 * border"), which is exactly the distinction a blanket word-ban would
 * lose.
 */
export function redundantCosmeticWord(kind: string, name: string): string | null {
  const words = name.trim().split(/\s+/);
  if (words.length < 2) return null;

  const last = words[words.length - 1];
  return (OWN_WORD[kind] ?? []).includes(last) ? last : null;
}

/** The name with its redundant category word removed, if it had one. */
export function tidyCosmeticName(kind: string, name: string): string {
  const redundant = redundantCosmeticWord(kind, name);
  if (!redundant) return name.trim();
  return name.trim().slice(0, -redundant.length).trim();
}
