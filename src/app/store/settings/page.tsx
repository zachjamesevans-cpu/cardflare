import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Store as StoreIcon } from "lucide-react";

import { EarlyBoardPicker } from "@/components/events/early-board-picker";
import { TimeZonePicker } from "@/components/events/timezone-picker";
import { AppShell } from "@/components/layout/app-shell";
import { BillingCard, billingNotice } from "@/components/stores/billing-card";
import { StoreBannerForm } from "@/components/stores/store-banner-form";
import { StoreLogoForm } from "@/components/stores/store-logo-form";
import { StorePageForm } from "@/components/stores/store-page-form";
import { StoreTabs } from "@/components/stores/store-tabs";
import { Card } from "@/components/ui/card";
import { loadStoreConsole } from "@/lib/stores/console";
import { storePageFor } from "@/lib/stores/page";
import { storePlan, ultraIsSellable } from "@/lib/stores/ultra";

export const metadata: Metadata = {
  title: "Store settings",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** The Settings tab: the things a store touches once. */
export default async function StoreSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string; checkout?: string }>;
}) {
  const params = await searchParams;
  const { viewer, store, areas, currentArea } = await loadStoreConsole(
    params.as,
    "/store/settings",
  );
  if (!store || store.kind === "vendor") return null;

  /* Owner-only: `loadStoreConsole` has already turned an organizer
     away from this path, so everyone who gets here may write the page
     and see the plan. */
  const [plan, page] = await Promise.all([storePlan(store.id), storePageFor(store.id)]);

  return (
    <AppShell
      area="Store"
      email={viewer.user.email ?? ""}
      title="Settings"
      description="Your page, your time zone, when your boards open, and your plan."
      areas={areas}
      currentArea={currentArea}
    >
      <StoreTabs storeId={store.id} />

      {page && (
        <section className="flex flex-col gap-5" aria-labelledby="page-heading">
          <h2 id="page-heading" className="text-xl font-bold text-text-primary">
            Your store page
          </h2>
          <Card id="page" className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <StoreIcon
                className="mt-0.5 size-5 shrink-0 text-accent"
                aria-hidden="true"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="font-semibold text-text-primary">What players see</p>
                <p className="text-sm text-text-secondary">
                  This is what players see when they follow you.
                </p>
              </div>
              <Link
                href={`/s/${store.id}`}
                className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline"
              >
                View your page
                <ExternalLink className="size-4" aria-hidden="true" />
              </Link>
            </div>
            <div className="flex flex-col gap-3 border-t border-border pt-4">
              <p className="font-semibold text-text-primary">Pictures</p>
              <StoreLogoForm storeId={store.id} hasLogo={page.logoPath !== null} />
              <StoreBannerForm storeId={store.id} hasBanner={page.coverPath !== null} />
            </div>
            <div className="border-t border-border pt-4">
              <StorePageForm page={page} />
            </div>
            <p className="text-xs text-text-muted">
              Want the guided version? Open the{" "}
              <Link
                href={`/store/setup?as=${store.id}`}
                className="text-accent underline-offset-4 hover:underline"
              >
                setup wizard
              </Link>{" "}
              any time.
            </p>
          </Card>
        </section>
      )}

      <section className="flex flex-col gap-5" aria-labelledby="timezone-heading">
        <h2 id="timezone-heading" className="text-xl font-bold text-text-primary">
          Your time zone
        </h2>
        <TimeZonePicker storeId={store.id} timeZone={store.timezone ?? "UTC"} />
      </section>

      <section className="flex flex-col gap-5" aria-labelledby="early-board-heading">
        <h2 id="early-board-heading" className="text-xl font-bold text-text-primary">
          Before your events
        </h2>
        <EarlyBoardPicker storeId={store.id} hours={store.early_board_hours} />
      </section>

      <section className="flex flex-col gap-5" aria-labelledby="plan-heading">
        <h2 id="plan-heading" className="text-xl font-bold text-text-primary">
          Your plan
        </h2>
        <BillingCard
          storeId={store.id}
          plan={plan}
          sellable={ultraIsSellable()}
          notice={billingNotice(params)}
        />
      </section>
    </AppShell>
  );
}
