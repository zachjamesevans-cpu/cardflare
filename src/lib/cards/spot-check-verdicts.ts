import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

/**
 * What an admin said after reading a card against the real one.
 *
 * The spot check used to be a sheet to copy somewhere else; nothing on
 * the site remembered what was found. Now each card in the spread
 * carries a verdict, and the dashboard counts the wrong ones in red
 * until somebody fixes the data and clears them.
 */

export type Verdict = "ok" | "wrong";

export interface SpotVerdict {
  cardId: string;
  verdict: Verdict;
  note: string | null;
  checkedAt: string;
}

export async function verdictsFor(
  cardIds: string[],
): Promise<Map<string, SpotVerdict>> {
  const out = new Map<string, SpotVerdict>();
  if (!isSupabaseConfigured() || cardIds.length === 0) return out;

  const { data, error } = await getSupabaseAdmin()
    .from("card_spot_checks")
    .select("card_id, verdict, note, checked_at")
    .in("card_id", cardIds);

  if (error) {
    /* The table arrives with its migration; before that, every card is
       simply unchecked. */
    console.error("Could not read the spot-check verdicts", error);
    return out;
  }

  for (const row of data ?? []) {
    out.set(row.card_id, {
      cardId: row.card_id,
      verdict: row.verdict as Verdict,
      note: row.note,
      checkedAt: row.checked_at,
    });
  }
  return out;
}

export async function setVerdict(
  cardId: string,
  verdict: Verdict,
  note: string | null,
  checkedBy: string | null,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const { error } = await getSupabaseAdmin().from("card_spot_checks").upsert(
    {
      card_id: cardId,
      verdict,
      note,
      checked_at: new Date().toISOString(),
      checked_by: checkedBy,
    },
    { onConflict: "card_id" },
  );

  if (error) {
    console.error("Could not save the spot-check verdict", error);
    return false;
  }
  return true;
}

/** "Not checked yet" again: the data was fixed, or the verdict was wrong. */
export async function clearVerdict(cardId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const { error } = await getSupabaseAdmin()
    .from("card_spot_checks")
    .delete()
    .eq("card_id", cardId);
  if (error) {
    console.error("Could not clear the spot-check verdict", error);
    return false;
  }
  return true;
}

/** Cards somebody marked wrong, with their names: the dashboard's red number. */
export async function wrongCards(): Promise<
  { cardId: string; cardName: string; cardNumber: string; note: string | null }[]
> {
  if (!isSupabaseConfigured()) return [];
  const admin = getSupabaseAdmin();

  const { data, error } = await admin
    .from("card_spot_checks")
    .select("card_id, note")
    .eq("verdict", "wrong")
    .order("checked_at", { ascending: false })
    .limit(50);
  if (error || !data || data.length === 0) return [];

  const { data: cards } = await admin
    .from("cards")
    .select("id, exact_name, canonical_card_number")
    .in(
      "id",
      data.map((row) => row.card_id),
    );
  const byId = new Map((cards ?? []).map((card) => [card.id, card]));

  return data.map((row) => ({
    cardId: row.card_id,
    cardName: byId.get(row.card_id)?.exact_name ?? "Unknown card",
    cardNumber: byId.get(row.card_id)?.canonical_card_number ?? "",
    note: row.note,
  }));
}
