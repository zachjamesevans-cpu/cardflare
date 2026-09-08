"use server";

import { redirect } from "next/navigation";

import { getViewer } from "@/lib/auth/session";
import { subscriptionForStore } from "@/lib/billing/repository";
import {
  createBillingPortalSession,
  createCheckoutSession,
  stripePriceId,
} from "@/lib/billing/stripe";
import { text } from "@/lib/form-value";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientKey } from "@/lib/request-context";
import { siteUrl } from "@/lib/site";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createStoreAccount } from "./self-serve";
import {
  ULTRA_TRIAL_DAYS,
  ultraSignupSchema,
  type UltraSignupState,
} from "./ultra-schema";

const GENERIC = "Something went wrong. Please try again in a moment.";

/**
 * The trial button on /ultra.
 *
 * Makes the account, signs it in, and hands the browser to Stripe's
 * hosted checkout with the fourteen-day trial asked for. When Stripe is
 * not configured the store is still created and the console says
 * billing is not on yet, which is the honest state rather than a
 * button that pretends.
 */
export async function startStoreTrialAction(
  _previous: UltraSignupState,
  formData: FormData,
): Promise<UltraSignupState> {
  const values = {
    storeName: text(formData, "storeName"),
    email: text(formData, "email"),
    password: text(formData, "password"),
    city: text(formData, "city"),
    region: text(formData, "region"),
  };
  const shown = {
    storeName: values.storeName,
    email: values.email,
    city: values.city,
    region: values.region,
  };

  const parsed = ultraSignupSchema.safeParse(values);
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Please check the fields.",
      values: shown,
    };
  }

  const rate = checkRateLimit(`store-signup:${await clientKey()}`, 5, 60 * 60 * 1000);
  if (!rate.allowed) {
    return {
      status: "error",
      message: "That is a lot of new stores at once. Try again in a little while.",
      values: shown,
    };
  }

  const created = await createStoreAccount(parsed.data);
  if (!created.ok) {
    return {
      status: "error",
      message:
        created.reason === "already-registered"
          ? "That address already has an account. Sign in, then start Ultra from your store console."
          : GENERIC,
      values: shown,
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) redirect("/login?next=/store");

  return sendToCheckout(created.storeId, parsed.data.email);
}

/**
 * The same checkout for a store that already exists: a pilot store an
 * admin invited, or one whose owner closed the Stripe tab. Only a
 * member of the store may start it.
 */
export async function startUltraCheckoutAction(formData: FormData): Promise<void> {
  const storeId = text(formData, "storeId");
  const viewer = await getViewer();

  if (
    (viewer.kind !== "store" && viewer.kind !== "admin") ||
    !viewer.storeIds.includes(storeId)
  ) {
    redirect("/login?next=/store");
  }

  await sendToCheckout(storeId, viewer.user.email ?? undefined);
}

async function sendToCheckout(
  storeId: string,
  email: string | undefined,
): Promise<never> {
  const origin = siteUrl();
  const console = `/store?as=${storeId}`;

  if (!stripePriceId("ultra")) redirect(`${console}&welcome=1`);

  const session = await createCheckoutSession({
    tier: "ultra",
    storeId,
    customerEmail: email,
    successUrl: `${origin}${console}&checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${origin}${console}&checkout=cancelled`,
    trialDays: ULTRA_TRIAL_DAYS,
  });

  if (!session.ok) redirect(`${console}&checkout=failed`);
  redirect(session.data.url);
}

/** Stripe's hosted page for changing the card or cancelling. */
export async function manageBillingAction(formData: FormData): Promise<void> {
  const storeId = text(formData, "storeId");
  const viewer = await getViewer();

  if (
    (viewer.kind !== "store" && viewer.kind !== "admin") ||
    !viewer.storeIds.includes(storeId)
  ) {
    redirect("/login?next=/store");
  }

  const subscription = await subscriptionForStore(storeId);
  const back = `${siteUrl()}/store?as=${storeId}`;
  if (!subscription?.stripe_customer_id) redirect(back);

  const portal = await createBillingPortalSession(
    subscription.stripe_customer_id,
    back,
  );
  redirect(portal.ok ? portal.data.url : `${back}&checkout=failed`);
}
