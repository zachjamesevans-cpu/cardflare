import Link from "next/link";
import { Sparkles } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { StoreTabs } from "@/components/stores/store-tabs";
import { UltraMark } from "@/components/stores/ultra-mark";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Area } from "@/lib/auth/areas";
import { SITE } from "@/lib/site";
import { storePlan } from "@/lib/stores/ultra";
import { startUltraCheckoutAction } from "@/lib/stores/ultra-actions";
import { ULTRA_PRICE_LABEL, ULTRA_TRIAL_DAYS } from "@/lib/stores/ultra-schema";

/**
 * What a store without Ultra sees where an Ultra feature would be.
 *
 * Not a dead end and not a sales page: one sentence on what the tab
 * does, the trial button, and the terms in the same breath. An
 * organizer cannot start a plan (money is the owner's), so they are
 * told who can.
 */
export async function UltraLocked({
  storeId,
  owner,
  feature,
  pitch,
  heading,
}: {
  storeId: string;
  owner: boolean;
  /** The tab's name, as the tab bar says it. */
  feature: string;
  /** What it does for the store, in one sentence. */
  pitch: string;
  /** In place of "{feature} is part of cardflare Ultra". */
  heading?: string;
}) {
  /* A store whose trial is spent does not get a second one, so the
     button must not promise it. */
  const plan = await storePlan(storeId);
  const again = plan.state !== "none";

  return (
    <Card className="flex flex-col gap-4 border-accent/50">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <p className="font-semibold text-text-primary">
            {heading ?? (
              <>
                {feature} is part of {SITE.name} <UltraMark />
              </>
            )}
          </p>
          <p className="text-sm text-text-secondary">{pitch}</p>
        </div>
      </div>

      {owner ? (
        <div className="flex flex-col gap-2">
          <form
            action={startUltraCheckoutAction}
            className="flex flex-wrap items-center gap-3"
          >
            <input type="hidden" name="storeId" value={storeId} />
            <Button type="submit" size="lg">
              {again
                ? "Start Ultra again"
                : `Start your ${ULTRA_TRIAL_DAYS}-day free trial`}
            </Button>
            <Link href="/ultra" className="text-sm text-accent hover:text-accent-hover">
              Everything in Ultra
            </Link>
          </form>
          <p className="text-xs text-text-muted">
            {again
              ? `${ULTRA_PRICE_LABEL} a month. Cancel any time from Settings.`
              : `${ULTRA_PRICE_LABEL} a month after ${ULTRA_TRIAL_DAYS} days. Cancel before day ${ULTRA_TRIAL_DAYS} from Settings and nothing is charged.`}
          </p>
        </div>
      ) : (
        <p className="text-sm text-text-muted">
          Ask the store&rsquo;s owner to start {SITE.name} Ultra. It is one button in
          their console.
        </p>
      )}
    </Card>
  );
}

/** A whole console tab, for a store without the feature: the tabs, then the card. */
export function ConsoleLocked({
  email,
  areas,
  currentArea,
  title,
  description,
  ...card
}: {
  email: string;
  areas: Area[];
  currentArea?: string;
  title: string;
  description: string;
  storeId: string;
  owner: boolean;
  feature: string;
  pitch: string;
}) {
  return (
    <AppShell
      area="Store"
      email={email}
      title={title}
      description={description}
      areas={areas}
      currentArea={currentArea}
    >
      <StoreTabs storeId={card.storeId} />
      <UltraLocked {...card} />
    </AppShell>
  );
}
