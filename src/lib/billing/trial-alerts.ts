import "server-only";

import { isEmailConfigured, sendEmail } from "@/lib/email/client";
import { siteUrl } from "@/lib/site";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

/**
 * The founder hears about every Ultra trial, by email.
 *
 * Stripe's own notifications cover payments, disputes and payouts, and
 * a trial is none of those: nothing is charged for fourteen days. So
 * the webhook that already learns about every subscription sends one
 * line to whoever `CARDFLARE_ALERT_EMAIL` names, three times in a
 * store's life at most: the trial started, it turned into a paying
 * subscription, or it ended without one.
 *
 * Best-effort, every step. A missing address or a mail hiccup is logged
 * and never fails the webhook, or Stripe would retry a subscription
 * event because of an email.
 */

export type TrialChange = "started" | "converted" | "ended";

/** Comma-separated addresses, so more than one person can be told. */
export function alertRecipients(raw = process.env.CARDFLARE_ALERT_EMAIL): string[] {
  return (raw ?? "")
    .split(",")
    .map((address) => address.trim())
    .filter((address) => address.includes("@"));
}

/**
 * Which of the three moments an event is, or null for every other
 * change Stripe reports (a card updated, a period rolled over...).
 *
 * `previous` is Stripe's `previous_attributes.status`, present on an
 * update only when the status changed. A deleted subscription carries
 * its last status on the object itself.
 */
export function trialChangeFor(
  type: string,
  status: string | undefined,
  previous: string | undefined,
): TrialChange | null {
  if (type === "customer.subscription.created") {
    return status === "trialing" ? "started" : null;
  }
  if (type === "customer.subscription.updated") {
    if (previous !== "trialing") return null;
    if (status === "active") return "converted";
    if (
      status === "canceled" ||
      status === "unpaid" ||
      status === "incomplete_expired"
    ) {
      return "ended";
    }
    return null;
  }
  if (type === "customer.subscription.deleted") {
    return status === "trialing" ? "ended" : null;
  }
  return null;
}

const SUBJECTS: Record<TrialChange, (store: string) => string> = {
  started: (store) => `New Ultra trial: ${store}`,
  converted: (store) => `Ultra trial converted: ${store}`,
  ended: (store) => `Ultra trial ended: ${store}`,
};

const LEADS: Record<TrialChange, string> = {
  started: "just started a fourteen-day Ultra trial.",
  converted: "finished the trial and is now paying for Ultra.",
  ended: "reached the end of the trial without a subscription.",
};

async function storeFacts(storeId: string): Promise<{
  name: string;
  where: string | null;
  contactEmail: string | null;
  ownerEmail: string | null;
} | null> {
  const admin = getSupabaseAdmin();
  const { data: store } = await admin
    .from("stores")
    .select("name, city, region, contact_email")
    .eq("id", storeId)
    .maybeSingle();
  if (!store) return null;

  const { data: owner } = await admin
    .from("store_members")
    .select("user_id")
    .eq("store_id", storeId)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();
  let ownerEmail: string | null = null;
  if (owner?.user_id) {
    const { data: user } = await admin.auth.admin.getUserById(owner.user_id);
    ownerEmail = user?.user?.email ?? null;
  }

  return {
    name: store.name,
    where: [store.city, store.region].filter(Boolean).join(", ") || null,
    contactEmail: store.contact_email,
    ownerEmail,
  };
}

function escape(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function notifyTrialChange(
  change: TrialChange,
  storeId: string,
): Promise<void> {
  const recipients = alertRecipients();
  if (recipients.length === 0) {
    console.warn("Trial alert skipped: CARDFLARE_ALERT_EMAIL is not set");
    return;
  }
  if (!isEmailConfigured() || !isSupabaseConfigured()) {
    console.warn("Trial alert skipped: email or database not configured");
    return;
  }

  try {
    const facts = await storeFacts(storeId);
    const name = facts?.name ?? `store ${storeId}`;
    const link = `${siteUrl()}/admin/stores/${storeId}`;
    const lines = [
      `${name} ${LEADS[change]}`,
      facts?.where ? `Where: ${facts.where}` : null,
      facts?.ownerEmail ? `Owner: ${facts.ownerEmail}` : null,
      facts?.contactEmail ? `Store contact: ${facts.contactEmail}` : null,
      `Admin: ${link}`,
    ].filter((line): line is string => line !== null);

    const subject = SUBJECTS[change](name);
    const text = lines.join("\n");
    const html = `<p>${lines.map(escape).join("<br>")}</p>`;

    for (const to of recipients) {
      const result = await sendEmail({ to, subject, text, html });
      if (result.status !== "sent") {
        console.error("Trial alert not sent", { to, change, storeId, result });
      }
    }
  } catch (error) {
    console.error("Trial alert failed", { change, storeId, error });
  }
}
