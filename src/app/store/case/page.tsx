import type { Metadata } from "next";
import Link from "next/link";

import { AppShell } from "@/components/layout/app-shell";
import { CasePicker } from "@/components/stores/case-picker";
import { StoreTabs } from "@/components/stores/store-tabs";
import { buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { caseFor, hasSingles } from "@/lib/stores/case";
import { loadStoreConsole } from "@/lib/stores/console";

export const metadata: Metadata = {
  title: "In the case",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The case: six cards from the synced singles, chosen by hand, shown
 * on the store's page under "In the case this week". The founder's
 * render, and the one row on the page that changes week to week.
 */
export default async function StoreCasePage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string }>;
}) {
  const { as } = await searchParams;
  const { viewer, store, areas, currentArea } = await loadStoreConsole(
    as,
    "/store/case",
  );
  if (!store || store.kind === "vendor") return null;

  const [stocked, picks] = await Promise.all([hasSingles(store.id), caseFor(store.id)]);

  return (
    <AppShell
      area="Store"
      email={viewer.user.email ?? ""}
      title="In the case"
      description="Six cards from your singles, shown on your store page. Update it whenever the case changes."
      areas={areas}
      currentArea={currentArea}
    >
      <StoreTabs storeId={store.id} />

      <Card className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-bold text-text-primary">In the case this week</h2>
          <p className="text-sm text-text-secondary">
            Pick up to six. Players see them on your page, and a tap opens the card.
          </p>
        </div>

        {stocked ? (
          <CasePicker storeId={store.id} initial={picks} />
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-text-secondary">
              Nothing to pick from yet. Upload your singles first and your case fills
              from them.
            </p>
            <Link
              href={`/store/singles?as=${encodeURIComponent(store.id)}`}
              className={buttonStyles("secondary", "sm")}
            >
              Upload your singles
            </Link>
          </div>
        )}
      </Card>
    </AppShell>
  );
}
