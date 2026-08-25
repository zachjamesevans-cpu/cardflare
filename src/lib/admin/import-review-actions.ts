"use server";

import { revalidatePath } from "next/cache";

import { getViewer } from "@/lib/auth/session";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { classificationColumns, classifyPrintingSchema } from "@/lib/cards/classify";
import { cardFactsSchema, IMPORT_PROVIDERS } from "@/lib/cards/import-schema";

/**
 * The review screen's writes: what a printing IS, what a card DOES.
 *
 * Both actions touch only rows an IMPORT put there. A synced provider's
 * rows belong to the provider — the next sync would overwrite a hand
 * edit anyway, and letting the console silently fight the sync would
 * turn every sync into a small mystery. The guard reads the row's own
 * provider_key rather than trusting the caller to say.
 *
 * Server Actions are public POST endpoints, so both re-establish admin
 * from scratch, like the rest of the console.
 */

export type ReviewWriteResult = { ok: true } | { ok: false; reason: string };

const GENERIC_ERROR = "Something went wrong. Please try again in a moment.";

async function isAdmin(): Promise<boolean> {
  return (await getViewer()).kind === "admin";
}

const IMPORTED = IMPORT_PROVIDERS as readonly string[];

/** Classifies one printing: base art, alt art, manga art, and so on. */
export async function classifyPrintingAction(
  payload: unknown,
): Promise<ReviewWriteResult> {
  if (!(await isAdmin())) return { ok: false, reason: GENERIC_ERROR };
  if (!isSupabaseConfigured()) {
    return { ok: false, reason: "The database is not configured." };
  }

  const parsed = classifyPrintingSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, reason: "That classification did not make sense." };
  }

  const admin = getSupabaseAdmin();

  const { data: printing, error: findError } = await admin
    .from("card_printings")
    .select("id, provider_key")
    .eq("id", parsed.data.printingId)
    .maybeSingle();

  if (findError) return { ok: false, reason: findError.message };
  if (!printing || !IMPORTED.includes(printing.provider_key)) {
    return {
      ok: false,
      reason: "Only imported printings can be classified here.",
    };
  }

  const { error } = await admin
    .from("card_printings")
    .update({
      ...classificationColumns(parsed.data.classification, parsed.data.label),
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.printingId);

  if (error) return { ok: false, reason: error.message };

  revalidatePath("/admin/cards/import");
  revalidatePath("/cards");
  return { ok: true };
}

/** Rewrites one card's gameplay facts, exactly as submitted. */
export async function updateCardFactsAction(
  payload: unknown,
): Promise<ReviewWriteResult> {
  if (!(await isAdmin())) return { ok: false, reason: GENERIC_ERROR };
  if (!isSupabaseConfigured()) {
    return { ok: false, reason: "The database is not configured." };
  }

  const parsed = cardFactsSchema.safeParse(payload);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      reason: issue ? `${issue.path.join(".")}: ${issue.message}` : GENERIC_ERROR,
    };
  }

  const admin = getSupabaseAdmin();

  const { data: card, error: findError } = await admin
    .from("cards")
    .select("id, provider_key")
    .eq("id", parsed.data.cardId)
    .maybeSingle();

  if (findError) return { ok: false, reason: findError.message };
  if (!card || !IMPORTED.includes(card.provider_key)) {
    return {
      ok: false,
      reason:
        "This card belongs to a provider now; the next sync would overwrite an edit.",
    };
  }

  const facts = parsed.data;

  const { error } = await admin
    .from("cards")
    .update({
      card_type: facts.cardType,
      colors: facts.colors,
      cost: facts.cost,
      power: facts.power,
      counter: facts.counter,
      life: facts.life,
      attribute: facts.attribute,
      traits: facts.traits,
      rarity: facts.rarity,
      effect_text: facts.effectText,
      trigger_text: facts.triggerText,
      updated_at: new Date().toISOString(),
    })
    .eq("id", facts.cardId);

  if (error) return { ok: false, reason: error.message };

  revalidatePath("/admin/cards/import");
  revalidatePath("/cards");
  return { ok: true };
}
