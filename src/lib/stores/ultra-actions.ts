"use server";

import { redirect } from "next/navigation";

import { getViewer, type Viewer } from "@/lib/auth/session";
import { subscriptionForStore } from "@/lib/billing/repository";
import { isEntitled } from "@/lib/billing/schema";
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
 * Money is the OWNER's. An admin may act for any store; a store account
 * only for a store it holds role "owner" at. An organizer (role
 * "staff") is never here, whatever the form said: they run the timers,
 * not the card on file.
 */
function ownsStore(
  viewer: Viewer,
  storeId: string,
): viewer is Extract<Viewer, { kind: "store" | "admin" }> {
  if (viewer.kind === "admin") return viewer.storeIds.includes(storeId);
  return viewer.kind === "store" && viewer.storeRoles[storeId] === "owner";
}

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
 * admin invited, or one whose owner closed the Stripe tab. Only the
 * OWNER of the store may start it.
 */
export async function startUltraCheckoutAction(formData: FormData): Promise<void> {
  const storeId = text(formData, "storeId");
  const viewer = await getViewer();

  if (!ownsStore(viewer, storeId)) redirect("/login?next=/store");

  await sendToCheckout(storeId, viewer.user.email ?? undefined);
}

async function sendToCheckout(
  storeId: string,
  email: string | undefined,
): Promise<never> {
  const origin = siteUrl();
  /* Back from a successful checkout the browser lands in the setup
     wizard: the welcome, the page, the screens. The wizard reconciles
     the session. A closed or failed checkout lands on Settings, beside
     the plan card that says what happened and offers the button again. */
  const setup = `/store/setup?as=${storeId}`;
  const settings = `/store/settings?as=${storeId}`;

  if (!stripePriceId("ultra")) redirect(setup);

  /*
   * One subscription per store. The /ultra button, a double tap, or a
   * hand-made POST could start a second checkout for a store already on
   * its trial, and Stripe would bill both. A store with a live
   * subscription goes to its plan card instead; one that lapsed reuses
   * its Stripe customer, and its fourteen free days were already spent.
   */
  const existing = await subscriptionForStore(storeId);
  if (
    existing &&
    isEntitled({
      status: existing.status,
      currentPeriodEnd: existing.current_period_end,
    })
  ) {
    redirect(settings);
  }

  const session = await createCheckoutSession({
    tier: "ultra",
    storeId,
    customerEmail: email,
    customerId: existing?.stripe_customer_id ?? undefined,
    successUrl: `${origin}${setup}&checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${origin}${settings}&checkout=cancelled`,
    trialDays: existing ? undefined : ULTRA_TRIAL_DAYS,
  });

  if (!session.ok) redirect(`${settings}&checkout=failed`);
  redirect(session.data.url);
}

/** Stripe's hosted page for changing the card or cancelling. */
export async function manageBillingAction(formData: FormData): Promise<void> {
  const storeId = text(formData, "storeId");
  const viewer = await getViewer();

  if (!ownsStore(viewer, storeId)) redirect("/login?next=/store");

  /* Back to the plan card, which is on Settings. */
  const subscription = await subscriptionForStore(storeId);
  const back = `${siteUrl()}/store/settings?as=${storeId}`;
  if (!subscription?.stripe_customer_id) redirect(back);

  const portal = await createBillingPortalSession(
    subscription.stripe_customer_id,
    back,
  );
  redirect(portal.ok ? portal.data.url : `${back}&checkout=failed`);
}
