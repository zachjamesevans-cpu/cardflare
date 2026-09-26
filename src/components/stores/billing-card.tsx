import { CreditCard } from "lucide-react";

import { UltraMark } from "@/components/stores/ultra-mark";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SITE } from "@/lib/site";
import { planDate, type StorePlan } from "@/lib/stores/ultra";
import {
  manageBillingAction,
  startUltraCheckoutAction,
} from "@/lib/stores/ultra-actions";
import { ULTRA_PRICE_LABEL, ULTRA_TRIAL_DAYS } from "@/lib/stores/ultra-schema";

/**
 * The plan, on Settings, in a sentence with a date in it.
 *
 * One card that always says where the store stands and offers the one
 * thing to do about it: start the trial, or open Stripe's page to
 * change the card or cancel. Never a second copy of the pitch; that is
 * what /ultra is for. Stripe's cancel and failure doors, and the
 * billing portal, all come back here so the notice lands beside the
 * card it is about. A successful checkout lands in the setup wizard.
 */
export function BillingCard({
  storeId,
  plan,
  sellable,
  notice,
}: {
  storeId: string;
  plan: StorePlan;
  sellable: boolean;
  /** What the query string said on arrival, already turned into words. */
  notice: BillingNotice | null;
}) {
  const line = planLine(plan);
  const canStart = plan.state === "none" || plan.state === "ended";
  const canManage = "canManage" in plan && plan.canManage;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <CreditCard className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-semibold text-text-primary">
            {SITE.name} <UltraMark />
          </p>
          <p className="text-sm text-text-secondary">{line}</p>
        </div>
      </div>

      {notice && (
        <p
          role={notice.tone === "danger" ? "alert" : "status"}
          className={`text-sm ${
            notice.tone === "danger"
              ? "text-danger"
              : notice.tone === "neutral"
                ? "text-text-secondary"
                : "text-success"
          }`}
        >
          {notice.text}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {canStart &&
          (sellable ? (
            <form action={startUltraCheckoutAction}>
              <input type="hidden" name="storeId" value={storeId} />
              <Button type="submit" size="sm">
                {plan.state === "none"
                  ? `Start your ${ULTRA_TRIAL_DAYS}-day free trial`
                  : "Start Ultra again"}
              </Button>
            </form>
          ) : (
            <p className="text-sm text-text-muted">
              Billing is not switched on yet. Your store works in full meanwhile.
            </p>
          ))}
        {canManage && (
          <form action={manageBillingAction}>
            <input type="hidden" name="storeId" value={storeId} />
            <Button type="submit" size="sm" variant="secondary">
              Manage billing
            </Button>
          </form>
        )}
      </div>
    </Card>
  );
}

function planLine(plan: StorePlan): string {
  switch (plan.state) {
    case "none":
      return `${ULTRA_PRICE_LABEL} a month after ${ULTRA_TRIAL_DAYS} days free. Not started yet.`;
    case "trialing": {
      const until = planDate(plan.until);
      return until
        ? `Free trial on. The first charge is on ${until}; cancel before then and nothing is charged.`
        : "Free trial on.";
    }
    case "active": {
      const when = planDate(plan.renews);
      if (plan.ending)
        return when ? `Cancelled. Ultra stays on until ${when}.` : "Cancelled.";
      return when ? `On. Renews ${when}.` : "On.";
    }
    case "past_due": {
      const until = planDate(plan.until);
      return until
        ? `The last payment failed. Ultra stays on until ${until}; update the card to keep it.`
        : "The last payment failed. Update the card to keep Ultra.";
    }
    case "ending": {
      const until = planDate(plan.until);
      return until ? `Cancelled. Ultra stays on until ${until}.` : "Cancelled.";
    }
    case "ended": {
      const ended = planDate(plan.ended);
      return ended ? `Ended ${ended}.` : "Ended.";
    }
  }
}

/** The one sentence the query string earns, and how loudly to say it. */
export interface BillingNotice {
  text: string;
  /* A failure used to show in the success green. */
  tone: "success" | "neutral" | "danger";
}

export function billingNotice(params: { checkout?: string }): BillingNotice | null {
  if (params.checkout === "success") {
    return { text: "Welcome to Ultra. Your free trial has started.", tone: "success" };
  }
  if (params.checkout === "cancelled") {
    return {
      text: "Checkout was closed. Your store is ready; start the trial whenever you like.",
      tone: "neutral",
    };
  }
  if (params.checkout === "failed") {
    return {
      text: "Stripe could not be reached. Try again in a moment.",
      tone: "danger",
    };
  }
  return null;
}
