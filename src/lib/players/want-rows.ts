/**
 * The Flare tab's one list, folded.
 *
 * The tab shows what you are looking for and what you are offering
 * as one list. Two rows that read the same, the same card, the same
 * printing label, the same direction, are one line to a reader
 * (the second audit: "lists Rebecca OP05-091 OP-05 twice as separate
 * rows"), so they fold into one here with the copies summed. The
 * first row keeps its id, note and hunt, so every door that opened
 * from it still opens.
 *
 * A plain module: no server-only import, so the unit test can run it.
 */
export function mergeFlareRows<
  T extends {
    cardId: string;
    printingLabel: string | null;
    quantity: number;
    direction?: "want" | "offering";
  },
>(rows: T[]): T[] {
  const out: T[] = [];
  const at = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.direction ?? "want"}:${row.cardId}:${row.printingLabel ?? "any"}`;
    const index = at.get(key);
    if (index === undefined) {
      at.set(key, out.length);
      out.push({ ...row });
      continue;
    }
    const kept = out[index];
    if (kept) kept.quantity = Math.min(99, kept.quantity + row.quantity);
  }
  return out;
}
