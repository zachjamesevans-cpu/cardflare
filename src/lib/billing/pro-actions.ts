"use server";

import { redirect } from "next/navigation";

import { getViewer } from "@/lib/auth/session";
import { playerForUser } from "@/lib/players/accounts";
import { siteUrl } from "@/lib/site";
import { subscriptionForPlayer } from "./repository";
import {
  createBillingPortalSession,
  createCheckoutSession,
  stripePriceId,
} from "./stripe";

/**
 * Pro on the website, through Stripe.
 *
 * The app sells Pro through Apple because Apple insists; the website
 * sells the same tier through Stripe, and the webhook already writes
 * players.tier from either. A player who bought on one is Pro on both.
 */
async function viewerPlayerId(): Promise<string | null> {
  const viewer = await getViewer();
  if (viewer.kind === "player") return viewer.playerId;
  if (viewer.kind === "anonymous") return null;
  return (await playerForUser(viewer.user.id))?.id ?? null;
}

export async function startProCheckoutAction(): Promise<void> {
  const playerId = await viewerPlayerId();
  if (!playerId) redirect("/login?next=/pro");
  if (!stripePriceId("pro")) redirect("/pro");

  const viewer = await getViewer();
  const origin = siteUrl();
  const session = await createCheckoutSession({
    tier: "pro",
    playerId,
    customerEmail:
      viewer.kind === "anonymous" ? undefined : (viewer.user.email ?? undefined),
    successUrl: `${origin}/pro?checkout=success`,
    cancelUrl: `${origin}/pro?checkout=cancelled`,
  });

  if (!session.ok) redirect("/pro?checkout=failed");
  redirect(session.data.url);
}

export async function manageProBillingAction(): Promise<void> {
  const playerId = await viewerPlayerId();
  if (!playerId) redirect("/login?next=/pro");

  const subscription = await subscriptionForPlayer(playerId);
  const back = `${siteUrl()}/pro`;
  if (!subscription?.stripe_customer_id) redirect(back);

  const portal = await createBillingPortalSession(
    subscription.stripe_customer_id,
    back,
  );
  redirect(portal.ok ? portal.data.url : `${back}?checkout=failed`);
}
