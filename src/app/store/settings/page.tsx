import type { Metadata } from "next";

import { EarlyBoardPicker } from "@/components/events/early-board-picker";
import { TimeZonePicker } from "@/components/events/timezone-picker";
import { AppShell } from "@/components/layout/app-shell";
import { BillingCard, billingNotice } from "@/components/stores/billing-card";
import { StoreTabs } from "@/components/stores/store-tabs";
import { loadStoreConsole } from "@/lib/stores/console";
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

  const plan = await storePlan(store.id);

  return (
    <AppShell
      area="Store"
      email={viewer.user.email ?? ""}
      title="Settings"
      description="Where you are, when your boards open, and your plan."
      areas={areas}
      currentArea={currentArea}
    >
      <StoreTabs storeId={store.id} />

      <section className="flex flex-col gap-5" aria-labelledby="timezone-heading">
        <h2 id="timezone-heading" className="text-xl font-bold text-text-primary">
          Where you are
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
