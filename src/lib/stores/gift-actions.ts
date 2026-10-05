"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/session";
import { sendEmail } from "@/lib/email/client";
import { giftGrantedEmail } from "@/lib/email/store-gift";
import { siteUrl } from "@/lib/site";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { FOUNDING_STORE_CAP, isGiftChoice } from "./gift-shared";
import { alertFounderOfGift, giftFacts, grantGift, removeGift } from "./gifts";

export type GiftActionState =
  | { status: "idle" }
  | { status: "done"; message: string }
  | { status: "error"; message: string };

/**
 * Gives a store that already exists Ultra, or takes the gift back.
 *
 * Behind `requireAdmin`, because a Server Action is a public POST and a
 * gift is money. A new gift emails the store's contact the same news
 * the invitation would have carried; taking one back is silent, and
 * ends it rather than erasing it, so the founding price still stands.
 */
export async function giftStoreAction(
  _previous: GiftActionState,
  form: FormData,
): Promise<GiftActionState> {
  await requireAdmin();
  if (!isSupabaseConfigured()) return { status: "error", message: "No database." };

  const storeId = String(form.get("storeId") ?? "");
  const choice = String(form.get("gift") ?? "");
  if (!storeId || !isGiftChoice(choice)) {
    return { status: "error", message: "Pick a gift." };
  }

  if (choice === "none") {
    const ok = await removeGift(storeId);
    revalidatePath("/admin/stores");
    return ok
      ? { status: "done", message: "Gift ended. Their founding price still stands." }
      : { status: "error", message: "That did not save." };
  }

  const granted = await grantGift(storeId, choice);
  if (!granted.ok) {
    return {
      status: "error",
      message:
        granted.reason === "founding-full"
          ? `All ${FOUNDING_STORE_CAP} Founding Store places are taken.`
          : granted.reason === "not-found"
            ? "No such store."
            : "That did not save.",
    };
  }

  const { data: store } = await getSupabaseAdmin()
    .from("stores")
    .select("name, contact_email")
    .eq("id", storeId)
    .maybeSingle();

  const facts = giftFacts(granted.gift);
  let emailed = false;
  if (store?.contact_email) {
    const sent = await sendEmail(
      giftGrantedEmail(store.name, store.contact_email, siteUrl(), storeId, facts),
    );
    emailed = sent.status === "sent";
    if (sent.status === "failed") console.error(`Gift email failed: ${sent.reason}`);
  }
  if (store) {
    await alertFounderOfGift(
      "granted",
      store.name,
      granted.gift.kind === "founding"
        ? "is now a Founding Store: Ultra, free for life."
        : `was given ${granted.gift.days} days of Ultra.`,
    );
  }

  revalidatePath("/admin/stores");
  const what =
    granted.gift.kind === "founding"
      ? "Founding Store: Ultra for life."
      : `${granted.gift.days} days of Ultra, until ${facts.untilLabel}.`;
  return {
    status: "done",
    message: emailed ? `${what} They have the email.` : `${what} No email went out.`,
  };
}
