import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { printingLabel, type CardPrinting, type CardResult } from "./schema";

/**
 * A spread of cards to check by hand against the official card list.
 *
 * Zero rejections means every record parsed. It does not mean any value is
 * right: the OP10-042 shift only failed because a power landed in a life
 * field and blew a range check. A shift between two fields of compatible type
 * would import silently and wrongly, and no amount of validation would notice.
 * The only thing that catches that is a person reading a real card.
 *
 * Cards are chosen by shape rather than named up front, so the spread reflects
 * what was actually imported instead of what someone remembered to look for.
 */

/** Bounded read — this is a sample, not a report over the whole catalog. */
const SCAN = 1000;

/** Enough to be representative without becoming a chore to check. */
const MAX_CARDS = 12;

interface ScanRow {
  id: string;
  canonical_card_number: string;
  exact_name: string;
  card_type: string | null;
  colors: string[];
  traits: string[];
  cost: number | null;
  power: number | null;
  counter: number | null;
  life: number | null;
  rarity: string | null;
  attribute: string | null;
  effect_text: string | null;
  trigger_text: string | null;
}

/**
 * Picks cards that exercise different shapes.
 *
 * One of each card type, then one of each awkward case — multicolour, a
 * counter, a trigger, a life value, no cost. Each reason is recorded so the
 * person checking knows what they are meant to be looking at.
 */
export function chooseSpread(rows: ScanRow[]): { row: ScanRow; because: string }[] {
  const picked = new Map<string, { row: ScanRow; because: string }>();

  const take = (row: ScanRow | undefined, because: string) => {
    if (!row || picked.has(row.id) || picked.size >= MAX_CARDS) return;
    picked.set(row.id, { row, because });
  };

  // One per card type first: a Leader and an Event fail in different ways.
  for (const type of [...new Set(rows.map((row) => row.card_type))]) {
    take(
      rows.find((row) => row.card_type === type),
      `card type: ${type ?? "none"}`,
    );
  }

  take(
    rows.find((row) => row.colors.length > 1),
    "multicolour",
  );
  take(
    rows.find((row) => row.counter !== null && row.counter > 0),
    "has a counter",
  );
  /*
   * Triggers are matched in the effect text, not in trigger_text. This
   * provider never populates that column — it returns one `card_text` with
   * "[Trigger]" inline — so the original criterion could never match and no
   * trigger card was ever sampled.
   */
  take(
    rows.find((row) => row.trigger_text || row.effect_text?.includes("[Trigger]")),
    "has a trigger",
  );
  take(
    rows.find((row) => row.life !== null),
    "has life",
  );
  take(
    rows.find((row) => row.cost === null),
    "no cost",
  );
  take(
    rows.find((row) => row.traits.length > 0),
    "has traits",
  );

  return [...picked.values()];
}

/** One card, formatted for reading against a real card. */
function describe(row: ScanRow, because: string, printings: CardPrinting[]): string {
  const field = (label: string, value: unknown) =>
    `  ${label.padEnd(10)} ${value === null || value === undefined ? "—" : value}`;

  const effect = row.effect_text
    ? row.effect_text.replace(/\s+/g, " ").slice(0, 240)
    : null;

  return [
    `${row.canonical_card_number}  ${row.exact_name}`,
    `  (picked: ${because})`,
    field("type", row.card_type),
    field("colours", row.colors.join(", ") || null),
    field("traits", row.traits.join(" | ") || null),
    field("cost", row.cost),
    field("power", row.power),
    field("counter", row.counter),
    field("life", row.life),
    field("attribute", row.attribute),
    field("rarity", row.rarity),
    field("effect", effect),
    field("trigger", row.trigger_text?.replace(/\s+/g, " ").slice(0, 160) ?? null),
    field(
      "printings",
      printings.map((p) => printingLabel(p, row.exact_name) ?? "—").join(" / ") || null,
    ),
    field("images", printings.filter((p) => p.imageUrl).length),
  ].join("\n");
}

/**
 * The whole report as plain text.
 *
 * Plain text on purpose: this exists to be selected, copied and pasted
 * somewhere else, and a table would not survive that.
 */
export function formatReport(
  entries: { row: ScanRow; because: string }[],
  printingsByCard: Map<string, CardPrinting[]>,
  catalogSize: number,
): string {
  if (entries.length === 0) {
    return "No cards imported yet. Run a sync first.";
  }

  return [
    `CardFlare spot check — ${entries.length} of ${catalogSize.toLocaleString()} cards`,
    "Compare each against the official One Piece card list.",
    "",
    ...entries.map(({ row, because }) =>
      describe(row, because, printingsByCard.get(row.id) ?? []),
    ),
  ].join("\n\n");
}

export interface SpotCheck {
  report: string;
  cards: (CardResult & { because: string })[];
}

export async function spotCheck(): Promise<SpotCheck> {
  if (!isSupabaseConfigured()) {
    return { report: "Supabase is not configured.", cards: [] };
  }

  const admin = getSupabaseAdmin();

  const { data, error, count } = await admin
    .from("cards")
    .select(
      "id, canonical_card_number, exact_name, card_type, colors, traits, cost, power, counter, life, rarity, attribute, effect_text, trigger_text",
      { count: "exact" },
    )
    /*
     * Ordered by id, not by card number. Ordering by number and taking the
     * first thousand meant the whole sample came from EB01 — every card in the
     * first spot check was EB01-0xx, which checks one set and calls it a
     * catalog. Ids are uuids, so this spans everything imported.
     */
    .order("id")
    .range(0, SCAN - 1);

  if (error) {
    console.error("Could not read cards for the spot check", error);
    return { report: "Could not read the catalog.", cards: [] };
  }

  const entries = chooseSpread((data ?? []) as ScanRow[]);
  const printingsByCard = await printingsForCards(entries.map((e) => e.row.id));

  return {
    report: formatReport(entries, printingsByCard, count ?? 0),
    cards: entries.map(({ row, because }) => ({
      id: row.id,
      exactName: row.exact_name,
      canonicalCardNumber: row.canonical_card_number,
      cardType: row.card_type,
      colors: row.colors ?? [],
      traits: row.traits ?? [],
      cost: row.cost,
      power: row.power,
      counter: row.counter,
      life: row.life,
      rarity: row.rarity,
      effectText: row.effect_text,
      triggerText: row.trigger_text,
      printings: printingsByCard.get(row.id) ?? [],
      because,
    })),
  };
}

async function printingsForCards(
  cardIds: string[],
): Promise<Map<string, CardPrinting[]>> {
  const grouped = new Map<string, CardPrinting[]>();
  if (cardIds.length === 0) return grouped;

  const { data, error } = await getSupabaseAdmin()
    .from("card_printings")
    .select(
      "card_id, set_code, set_name, printing_label, variant_type, rarity, printing_name, is_promo, image_url",
    )
    .in("card_id", cardIds)
    .order("set_code");

  if (error) {
    console.error("Could not read printings for the spot check", error);
    return grouped;
  }

  for (const row of data ?? []) {
    const list = grouped.get(row.card_id) ?? [];
    list.push({
      setCode: row.set_code,
      setName: row.set_name,
      printingLabel: row.printing_label,
      variantType: row.variant_type,
      rarity: row.rarity,
      printingName: row.printing_name,
      isPromo: row.is_promo,
      imageUrl: row.image_url,
    });
    grouped.set(row.card_id, list);
  }

  return grouped;
}
